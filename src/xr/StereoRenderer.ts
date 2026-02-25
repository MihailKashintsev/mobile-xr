/**
 * StereoRenderer — настоящий VR стерео рендер для очков типа Cardboard
 *
 * Архитектура:
 *  1. Левая и правая камеры рендерятся в отдельные RenderTarget
 *  2. Shader с бочкообразной дисторсией "развёртывает" линзу
 *  3. Оба глаза выводятся side-by-side через scissor/viewport
 *
 * Калибровка хранится в localStorage и применяется мгновенно
 */

import * as THREE from 'three'

// ─── Типы ──────────────────────────────────────────────────────────────────────

export interface StereoCalibration {
  ipd: number            // межзрачковое расстояние, мм (55–75)
  lensDistance: number   // расстояние линзы, 0..1 (обычно 0.5)
  k1: number             // коэф. бочки #1 (0..0.5)
  k2: number             // коэф. бочки #2 (0..0.3)
  verticalOffset: number // смещение по вертикали (−0.1..0.1)
  fov: number            // поле зрения в градусах (70..120)
  zoom: number           // масштаб (0.8..1.2)
}

export const DEFAULT_CALIBRATION: StereoCalibration = {
  ipd: 63,
  lensDistance: 0.5,
  k1: 0.22,
  k2: 0.1,
  verticalOffset: 0,
  fov: 90,
  zoom: 1.0
}

const STORAGE_KEY = 'mobile-xr-stereo-calib'

// ─── Шейдер бочкообразной дисторсии ────────────────────────────────────────────

const DISTORT_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const DISTORT_FRAG = /* glsl */`
uniform sampler2D tEye;
uniform float k1;
uniform float k2;
uniform float zoom;
uniform vec2  center;      // обычно (0.5, 0.5)

varying vec2 vUv;

vec2 distort(vec2 uv) {
  vec2 d = uv - center;
  float r2 = dot(d, d);
  float coef = 1.0 + k1 * r2 + k2 * r2 * r2;
  return center + d * coef * zoom;
}

void main() {
  vec2 distorted = distort(vUv);
  // Чёрный за пределами текстуры
  if (distorted.x < 0.0 || distorted.x > 1.0 ||
      distorted.y < 0.0 || distorted.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  gl_FragColor = texture2D(tEye, distorted);
}
`

// ─── Класс рендерера ───────────────────────────────────────────────────────────

export class StereoRenderer {
  private renderer: THREE.WebGLRenderer
  private calib: StereoCalibration

  // Левая и правая камеры
  private camL: THREE.PerspectiveCamera
  private camR: THREE.PerspectiveCamera

  // Render targets для каждого глаза
  private rtL!: THREE.WebGLRenderTarget
  private rtR!: THREE.WebGLRenderTarget

  // Fullscreen quad для вывода с дисторсией
  private quadScene: THREE.Scene
  private quadCamera: THREE.OrthographicCamera
  private quadMeshL!: THREE.Mesh
  private quadMeshR!: THREE.Mesh

  // Фон (AR видео)
  private bgSceneL: THREE.Scene
  private bgSceneR: THREE.Scene
  private bgCamL: THREE.OrthographicCamera
  private bgCamR: THREE.OrthographicCamera
  private bgMatL?: THREE.MeshBasicMaterial
  private bgMatR?: THREE.MeshBasicMaterial

  constructor(renderer: THREE.WebGLRenderer, calib?: Partial<StereoCalibration>) {
    this.renderer = renderer
    this.calib = { ...DEFAULT_CALIBRATION, ...this.loadFromStorage(), ...calib }

    // Основные камеры с временным aspect (будет обновлён)
    this.camL = new THREE.PerspectiveCamera(this.calib.fov, 1, 0.01, 100)
    this.camR = new THREE.PerspectiveCamera(this.calib.fov, 1, 0.01, 100)

    // Quad сцена для пост-обработки
    this.quadScene = new THREE.Scene()
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Фоновые сцены (AR видео дублируется в каждый глаз)
    this.bgSceneL = new THREE.Scene()
    this.bgSceneR = new THREE.Scene()
    this.bgCamL = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.bgCamR = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.buildTargets()
    this.buildQuads()
  }

  // ─── Публичные методы ─────────────────────────────────────────────────────────

  /** Обновить калибровку (частично или полностью) */
  setCalibration(patch: Partial<StereoCalibration>): void {
    this.calib = { ...this.calib, ...patch }
    this.applyCalibration()
    this.saveToStorage()
  }

  getCalibration(): StereoCalibration {
    return { ...this.calib }
  }

  resetCalibration(): void {
    this.calib = { ...DEFAULT_CALIBRATION }
    this.applyCalibration()
    this.saveToStorage()
  }

  /** Подключить видео-текстуру как AR фон */
  setupARBackground(videoTexture: THREE.VideoTexture): void {
    const makeQuad = (mat: THREE.MeshBasicMaterial) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
      m.renderOrder = -1
      return m
    }

    this.bgMatL = new THREE.MeshBasicMaterial({ map: videoTexture, depthTest: false, depthWrite: false })
    this.bgMatR = new THREE.MeshBasicMaterial({ map: videoTexture, depthTest: false, depthWrite: false })

    this.bgSceneL.add(makeQuad(this.bgMatL))
    this.bgSceneR.add(makeQuad(this.bgMatR))
  }

  /** Обновить позицию камер из главной камеры сцены */
  syncFromCamera(main: THREE.PerspectiveCamera): void {
    const ipdWorld = (this.calib.ipd / 1000) * 0.5   // IPD в метрах, половина
    const vOff = this.calib.verticalOffset

    // Копируем матрицу мира
    this.camL.copy(main)
    this.camR.copy(main)
    this.camL.fov = this.calib.fov
    this.camR.fov = this.calib.fov

    // Сдвиг по X (горизонталь) ± половина IPD
    const shiftL = new THREE.Vector3(-ipdWorld, vOff, 0).applyQuaternion(main.quaternion)
    const shiftR = new THREE.Vector3( ipdWorld, vOff, 0).applyQuaternion(main.quaternion)
    this.camL.position.copy(main.position).add(shiftL)
    this.camR.position.copy(main.position).add(shiftR)

    this.camL.updateProjectionMatrix()
    this.camR.updateProjectionMatrix()
  }

  /** Главный вызов рендера — вместо обычного renderer.render() */
  render(scene: THREE.Scene, mainCamera: THREE.PerspectiveCamera): void {
    this.syncFromCamera(mainCamera)

    const W = this.renderer.domElement.width
    const H = this.renderer.domElement.height

    // ── Рендер левого глаза в RT ─────────────────────────────────────────────
    this.renderer.setRenderTarget(this.rtL)
    this.renderer.autoClear = false
    this.renderer.clear()
    this.renderer.render(this.bgSceneL, this.bgCamL)
    this.renderer.render(scene, this.camL)
    this.renderer.setRenderTarget(null)

    // ── Рендер правого глаза в RT ────────────────────────────────────────────
    this.renderer.setRenderTarget(this.rtR)
    this.renderer.clear()
    this.renderer.render(this.bgSceneR, this.bgCamR)
    this.renderer.render(scene, this.camR)
    this.renderer.setRenderTarget(null)

    // ── Вывод side-by-side с дисторсией ─────────────────────────────────────
    this.renderer.autoClear = false
    this.renderer.clear()

    // Левый глаз — левая половина экрана
    this.renderer.setViewport(0, 0, W / 2, H)
    this.renderer.setScissor(0, 0, W / 2, H)
    this.renderer.setScissorTest(true)
    this.quadScene.add(this.quadMeshL)
    this.quadScene.remove(this.quadMeshR)
    this.renderer.render(this.quadScene, this.quadCamera)

    // Правый глаз — правая половина экрана
    this.renderer.setViewport(W / 2, 0, W / 2, H)
    this.renderer.setScissor(W / 2, 0, W / 2, H)
    this.quadScene.add(this.quadMeshR)
    this.quadScene.remove(this.quadMeshL)
    this.renderer.render(this.quadScene, this.quadCamera)

    // Сброс
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, W, H)
  }

  /** Вызывать при изменении размера окна */
  onResize(): void {
    this.buildTargets()
    this.updateCameraAspect()
  }

  // ─── Приватные методы ─────────────────────────────────────────────────────────

  private buildTargets(): void {
    const W = this.renderer.domElement.width / 2
    const H = this.renderer.domElement.height

    this.rtL?.dispose()
    this.rtR?.dispose()

    const params: THREE.WebGLRenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace
    }
    this.rtL = new THREE.WebGLRenderTarget(W, H, params)
    this.rtR = new THREE.WebGLRenderTarget(W, H, params)

    this.updateCameraAspect()
    this.buildQuads()   // Пересоздаём квады с новыми текстурами
  }

  private updateCameraAspect(): void {
    const aspect = (this.renderer.domElement.width / 2) / this.renderer.domElement.height
    this.camL.aspect = aspect
    this.camR.aspect = aspect
    this.camL.fov = this.calib.fov
    this.camR.fov = this.calib.fov
    this.camL.updateProjectionMatrix()
    this.camR.updateProjectionMatrix()
  }

  private buildQuads(): void {
    const makeDistortMesh = (rt: THREE.WebGLRenderTarget) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: DISTORT_VERT,
        fragmentShader: DISTORT_FRAG,
        uniforms: {
          tEye:   { value: rt.texture },
          k1:     { value: this.calib.k1 },
          k2:     { value: this.calib.k2 },
          zoom:   { value: this.calib.zoom },
          center: { value: new THREE.Vector2(0.5, 0.5) }
        },
        depthTest: false,
        depthWrite: false
      })
      return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    }

    this.quadMeshL = makeDistortMesh(this.rtL)
    this.quadMeshR = makeDistortMesh(this.rtR)
  }

  private applyCalibration(): void {
    const updateMesh = (mesh: THREE.Mesh, rt: THREE.WebGLRenderTarget) => {
      const mat = mesh.material as THREE.ShaderMaterial
      mat.uniforms.k1.value   = this.calib.k1
      mat.uniforms.k2.value   = this.calib.k2
      mat.uniforms.zoom.value = this.calib.zoom
      mat.uniforms.tEye.value = rt.texture
    }
    if (this.quadMeshL) updateMesh(this.quadMeshL, this.rtL)
    if (this.quadMeshR) updateMesh(this.quadMeshR, this.rtR)
    this.updateCameraAspect()
  }

  private saveToStorage(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.calib)) } catch {}
  }

  private loadFromStorage(): Partial<StereoCalibration> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }

  dispose(): void {
    this.rtL.dispose()
    this.rtR.dispose()
  }
}
