/**
 * StereoRenderer — VR стерео рендер, исправленный для мобильных
 *
 * Ключевые исправления vs предыдущей версии:
 *  1. setViewport/setScissor принимают CSS-пиксели (Three.js сам умножает на DPR)
 *     На iPhone 14 Pro DPR=3 — без этого весь layout в 3 раза смещён
 *  2. RenderTarget создаётся в физических пикселях (domElement.width)
 *  3. Два отдельных quadScene (L и R) — без add/remove каждый кадр
 *  4. autoClear управляется явно на каждом этапе
 *  5. setRenderTarget(null) + явный сброс viewport после рендера
 */

import * as THREE from 'three'

export interface StereoCalibration {
  ipd: number            // межзрачковое расстояние мм (50–80)
  lensDistance: number   // дистанция линзы 0..1
  k1: number             // бочка коэф. 1
  k2: number             // бочка коэф. 2
  verticalOffset: number // вертикальный сдвиг
  fov: number            // поле зрения °
  zoom: number           // масштаб
}

export const DEFAULT_CALIBRATION: StereoCalibration = {
  ipd: 63, lensDistance: 0.5, k1: 0.22, k2: 0.10,
  verticalOffset: 0, fov: 90, zoom: 1.0
}

const STORAGE_KEY = 'mobile-xr-stereo-calib'

// ─── Шейдеры ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const FRAG = /* glsl */`
  precision mediump float;
  uniform sampler2D tEye;
  uniform float k1;
  uniform float k2;
  uniform float zoom;
  varying vec2 vUv;

  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 d  = vUv - center;
    float r2 = dot(d, d);
    // Обратная дисторсия: растягиваем UV чтобы компенсировать линзу
    float barrel = 1.0 + k1 * r2 + k2 * r2 * r2;
    vec2 src = center + d * barrel * zoom;

    if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      gl_FragColor = texture2D(tEye, src);
    }
  }
`

// ─── StereoRenderer ───────────────────────────────────────────────────────────

export class StereoRenderer {
  private renderer:  THREE.WebGLRenderer
  calib:             StereoCalibration

  private camL: THREE.PerspectiveCamera
  private camR: THREE.PerspectiveCamera

  private rtL!: THREE.WebGLRenderTarget
  private rtR!: THREE.WebGLRenderTarget

  // Отдельные сцены для каждого глаза — без add/remove каждый кадр
  private quadSceneL = new THREE.Scene()
  private quadSceneR = new THREE.Scene()
  private quadCam    = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private matL!: THREE.ShaderMaterial
  private matR!: THREE.ShaderMaterial

  // AR фон
  private bgSceneL = new THREE.Scene()
  private bgSceneR = new THREE.Scene()
  private bgCam    = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(renderer: THREE.WebGLRenderer, override?: Partial<StereoCalibration>) {
    this.renderer = renderer
    this.calib    = { ...DEFAULT_CALIBRATION, ...this.load(), ...override }
    this.camL     = new THREE.PerspectiveCamera(this.calib.fov, 1, 0.01, 100)
    this.camR     = new THREE.PerspectiveCamera(this.calib.fov, 1, 0.01, 100)
    this.rebuild()
  }

  // ─── Публичные ────────────────────────────────────────────────────────────

  setCalibration(patch: Partial<StereoCalibration>): void {
    this.calib = { ...this.calib, ...patch }
    this.applyCalib()
    this.save()
  }

  getCalibration(): StereoCalibration { return { ...this.calib } }

  resetCalibration(): void {
    this.calib = { ...DEFAULT_CALIBRATION }
    this.applyCalib()
    this.save()
  }

  setupARBackground(vt: THREE.VideoTexture): void {
    // Очищаем старые меши фона
    this.bgSceneL.clear()
    this.bgSceneR.clear()

    const makeQuad = () => new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: vt, depthTest: false, depthWrite: false })
    )
    this.bgSceneL.add(makeQuad())
    this.bgSceneR.add(makeQuad())
  }

  render(scene: THREE.Scene, main: THREE.PerspectiveCamera): void {
    this.syncCameras(main)

    // ── CSS размеры (для viewport/scissor) ───────────────────────────────────
    // Three.js setViewport/setScissor принимают CSS px и сами умножают на DPR
    const css = new THREE.Vector2()
    this.renderer.getSize(css)
    const CW = css.x   // CSS ширина всего канваса
    const CH = css.y   // CSS высота
    const HW = CW / 2  // половина

    // ── Физические размеры для RT ─────────────────────────────────────────────
    // RT должен быть в физических пикселях
    const PW = this.renderer.domElement.width   // физическая ширина
    const PH = this.renderer.domElement.height  // физическая высота
    const PHW = Math.floor(PW / 2)              // половина физической ширины

    // Пересоздаём RT если размер изменился
    if (this.rtL.width !== PHW || this.rtL.height !== PH) {
      this.rtL.dispose(); this.rtR.dispose()
      this.rtL = this.makeRT(PHW, PH)
      this.rtR = this.makeRT(PHW, PH)
      this.matL.uniforms.tEye.value = this.rtL.texture
      this.matR.uniforms.tEye.value = this.rtR.texture
      this.updateAspect(PHW, PH)
    }

    // ── Рендер левого глаза → RT ──────────────────────────────────────────────
    this.renderer.setRenderTarget(this.rtL)
    this.renderer.autoClear = true
    this.renderer.clear()
    this.renderer.autoClear = false
    this.renderer.render(this.bgSceneL, this.bgCam)
    this.renderer.render(scene, this.camL)

    // ── Рендер правого глаза → RT ─────────────────────────────────────────────
    this.renderer.setRenderTarget(this.rtR)
    this.renderer.autoClear = true
    this.renderer.clear()
    this.renderer.autoClear = false
    this.renderer.render(this.bgSceneR, this.bgCam)
    this.renderer.render(scene, this.camR)

    // ── Вывод на экран side-by-side ───────────────────────────────────────────
    this.renderer.setRenderTarget(null)
    this.renderer.autoClear = true
    this.renderer.clear()
    this.renderer.autoClear = false
    this.renderer.setScissorTest(true)

    // Левый глаз
    this.renderer.setViewport(0,  0, HW, CH)
    this.renderer.setScissor( 0,  0, HW, CH)
    this.renderer.render(this.quadSceneL, this.quadCam)

    // Правый глаз
    this.renderer.setViewport(HW, 0, HW, CH)
    this.renderer.setScissor( HW, 0, HW, CH)
    this.renderer.render(this.quadSceneR, this.quadCam)

    // ── Сброс состояния ───────────────────────────────────────────────────────
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, CW, CH)
    this.renderer.autoClear = true
  }

  onResize(): void {
    // Пересоздание RT произойдёт автоматически в следующем render()
    // Здесь только обновляем аспект
    const PH = this.renderer.domElement.height
    const PHW = Math.floor(this.renderer.domElement.width / 2)
    this.updateAspect(PHW, PH)
  }

  dispose(): void {
    this.rtL.dispose()
    this.rtR.dispose()
  }

  // ─── Приватные ────────────────────────────────────────────────────────────

  private rebuild(): void {
    const PW = this.renderer.domElement.width
    const PH = this.renderer.domElement.height
    const PHW = Math.max(1, Math.floor(PW / 2))

    this.rtL?.dispose()
    this.rtR?.dispose()
    this.rtL = this.makeRT(PHW, PH)
    this.rtR = this.makeRT(PHW, PH)

    this.matL = this.makeDistortMat(this.rtL.texture)
    this.matR = this.makeDistortMat(this.rtR.texture)

    // Добавляем квады в сцены ОДИН РАЗ
    this.quadSceneL.clear()
    this.quadSceneR.clear()
    this.quadSceneL.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matL))
    this.quadSceneR.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matR))

    this.updateAspect(PHW, PH)
  }

  private makeRT(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format:    THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
    })
  }

  private makeDistortMat(tex: THREE.Texture): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        tEye:  { value: tex },
        k1:    { value: this.calib.k1 },
        k2:    { value: this.calib.k2 },
        zoom:  { value: this.calib.zoom },
      },
      depthTest:  false,
      depthWrite: false,
    })
  }

  private updateAspect(w: number, h: number): void {
    const aspect = h > 0 ? w / h : 1
    this.camL.aspect = aspect
    this.camR.aspect = aspect
    this.camL.fov    = this.calib.fov
    this.camR.fov    = this.calib.fov
    this.camL.updateProjectionMatrix()
    this.camR.updateProjectionMatrix()
  }

  private syncCameras(main: THREE.PerspectiveCamera): void {
    const half = (this.calib.ipd / 1000) / 2
    const vOff = this.calib.verticalOffset

    this.camL.copy(main)
    this.camR.copy(main)
    this.camL.fov = this.calib.fov
    this.camR.fov = this.calib.fov

    const q = main.quaternion
    this.camL.position.copy(main.position)
      .add(new THREE.Vector3(-half, vOff, 0).applyQuaternion(q))
    this.camR.position.copy(main.position)
      .add(new THREE.Vector3( half, vOff, 0).applyQuaternion(q))

    this.camL.updateProjectionMatrix()
    this.camR.updateProjectionMatrix()
  }

  private applyCalib(): void {
    if (this.matL) {
      this.matL.uniforms.k1.value   = this.calib.k1
      this.matL.uniforms.k2.value   = this.calib.k2
      this.matL.uniforms.zoom.value = this.calib.zoom
    }
    if (this.matR) {
      this.matR.uniforms.k1.value   = this.calib.k1
      this.matR.uniforms.k2.value   = this.calib.k2
      this.matR.uniforms.zoom.value = this.calib.zoom
    }
    const PH = this.renderer.domElement.height
    const PHW = Math.floor(this.renderer.domElement.width / 2)
    this.updateAspect(PHW, PH)
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.calib)) } catch {}
  }

  private load(): Partial<StereoCalibration> {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
  }
}
