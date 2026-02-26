import * as THREE from 'three'

export interface StereoCalibration {
  ipd:            number   // мм
  lensDistance:   number   // Y-центр дисторсии
  k1:             number
  k2:             number
  verticalOffset: number
  fov:            number
  zoom:           number
  eyeShiftL:      number   // горизонтальный сдвиг левого глаза (-0.15 .. 0.15)
  eyeShiftR:      number   // горизонтальный сдвиг правого глаза
}

export const DEFAULT_CALIBRATION: StereoCalibration = {
  ipd: 63, lensDistance: 0.5, k1: 0.22, k2: 0.10,
  verticalOffset: 0, fov: 90, zoom: 1.0,
  eyeShiftL: 0, eyeShiftR: 0
}

const STORAGE_KEY = 'mobile-xr-stereo-calib-v2'

const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

// eyeShift сдвигает UV горизонтально до применения дисторсии
const FRAG = `
  precision highp float;
  uniform sampler2D tEye;
  uniform float k1, k2, zoom, eyeShift;
  uniform vec2  lensCenter;
  varying vec2  vUv;

  void main() {
    vec2 uv      = vec2(vUv.x + eyeShift, vUv.y);
    vec2 d       = uv - lensCenter;
    float r2     = dot(d, d);
    float barrel = 1.0 + k1 * r2 + k2 * r2 * r2;
    vec2  s      = lensCenter + d * barrel * zoom;

    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0)
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    else
      gl_FragColor = texture2D(tEye, s);
  }
`

export class StereoRenderer {
  private r: THREE.WebGLRenderer
  calib: StereoCalibration

  camL = new THREE.PerspectiveCamera(90, 1, 0.01, 100)
  camR = new THREE.PerspectiveCamera(90, 1, 0.01, 100)

  private rtL!: THREE.WebGLRenderTarget
  private rtR!: THREE.WebGLRenderTarget
  private matL!: THREE.ShaderMaterial
  private matR!: THREE.ShaderMaterial

  private qsL  = new THREE.Scene()
  private qsR  = new THREE.Scene()
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private bgL  = new THREE.Scene()
  private bgR  = new THREE.Scene()
  private bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private lastPW = 0
  private lastPH = 0

  constructor(renderer: THREE.WebGLRenderer, override?: Partial<StereoCalibration>) {
    this.r = renderer
    this.calib = { ...DEFAULT_CALIBRATION, ...this.load(), ...override }
    this.rebuild()
  }

  setCalibration(p: Partial<StereoCalibration>): void {
    this.calib = { ...this.calib, ...p }
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
    this.bgL.clear(); this.bgR.clear()
    const mat = () => new THREE.MeshBasicMaterial({ map: vt, depthTest: false, depthWrite: false })
    this.bgL.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat()))
    this.bgR.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat()))
  }

  render(scene: THREE.Scene, main: THREE.PerspectiveCamera): void {
    this.syncCameras(main)

    const PW  = this.r.domElement.width
    const PH  = this.r.domElement.height
    const PHW = Math.max(1, Math.floor(PW / 2))

    if (this.lastPW !== PHW || this.lastPH !== PH) {
      this.rtL.dispose(); this.rtR.dispose()
      this.rtL = this.makeRT(PHW, PH)
      this.rtR = this.makeRT(PHW, PH)
      this.matL.uniforms.tEye.value = this.rtL.texture
      this.matR.uniforms.tEye.value = this.rtR.texture
      this.updateAspect(PHW, PH)
      this.lastPW = PHW; this.lastPH = PH
    }

    const css = new THREE.Vector2()
    this.r.getSize(css)
    const CW = css.x, CH = css.y, CHW = Math.floor(CW / 2)

    const origCS = this.r.outputColorSpace
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace

    for (const [rt, bg, cam] of [
      [this.rtL, this.bgL, this.camL],
      [this.rtR, this.bgR, this.camR],
    ] as [THREE.WebGLRenderTarget, THREE.Scene, THREE.PerspectiveCamera][]) {
      this.r.setRenderTarget(rt)
      this.r.autoClear = true; this.r.clear(); this.r.autoClear = false
      this.r.render(bg, this.bgCam)
      this.r.render(scene, cam)
    }

    this.r.outputColorSpace = origCS
    this.r.setRenderTarget(null)
    this.r.autoClear = true; this.r.clear(); this.r.autoClear = false
    this.r.setScissorTest(true)

    this.r.setViewport(0,   0, CHW, CH); this.r.setScissor(0,   0, CHW, CH)
    this.r.render(this.qsL, this.qCam)
    this.r.setViewport(CHW, 0, CHW, CH); this.r.setScissor(CHW, 0, CHW, CH)
    this.r.render(this.qsR, this.qCam)

    this.r.setScissorTest(false)
    this.r.setViewport(0, 0, CW, CH); this.r.setScissor(0, 0, CW, CH)
    this.r.autoClear = true
  }

  onResize(): void { this.lastPW = 0; this.lastPH = 0 }
  dispose(): void  { this.rtL.dispose(); this.rtR.dispose() }

  private rebuild(): void {
    const PW  = this.r.domElement.width
    const PH  = this.r.domElement.height
    const PHW = Math.max(1, Math.floor(PW / 2))

    this.rtL?.dispose(); this.rtR?.dispose()
    this.rtL = this.makeRT(PHW, PH); this.rtR = this.makeRT(PHW, PH)
    this.lastPW = PHW; this.lastPH = PH

    this.matL = this.makeMat(this.rtL.texture, this.calib.eyeShiftL)
    this.matR = this.makeMat(this.rtR.texture, this.calib.eyeShiftR)

    this.qsL.clear(); this.qsR.clear()
    this.qsL.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matL))
    this.qsR.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matR))

    this.updateAspect(PHW, PH)
  }

  private makeRT(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
    })
  }

  private makeMat(tex: THREE.Texture, shift: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        tEye:       { value: tex },
        k1:         { value: this.calib.k1 },
        k2:         { value: this.calib.k2 },
        zoom:       { value: this.calib.zoom },
        eyeShift:   { value: shift },
        lensCenter: { value: new THREE.Vector2(0.5, this.calib.lensDistance) },
      },
      depthTest: false, depthWrite: false,
    })
  }

  private updateAspect(w: number, h: number): void {
    const aspect = h > 0 ? w / h : 1
    this.camL.aspect = aspect; this.camR.aspect = aspect
    this.camL.fov    = this.calib.fov; this.camR.fov = this.calib.fov
    this.camL.updateProjectionMatrix(); this.camR.updateProjectionMatrix()
  }

  private syncCameras(main: THREE.PerspectiveCamera): void {
    const half = (this.calib.ipd / 1000) / 2
    const vOff = this.calib.verticalOffset
    const q    = main.quaternion

    this.camL.quaternion.copy(q); this.camR.quaternion.copy(q)
    this.camL.position.copy(main.position).add(new THREE.Vector3(-half, vOff, 0).applyQuaternion(q))
    this.camR.position.copy(main.position).add(new THREE.Vector3( half, vOff, 0).applyQuaternion(q))
    this.camL.updateProjectionMatrix(); this.camR.updateProjectionMatrix()
  }

  private applyCalib(): void {
    const lc = new THREE.Vector2(0.5, this.calib.lensDistance)
    if (this.matL) {
      this.matL.uniforms.k1.value         = this.calib.k1
      this.matL.uniforms.k2.value         = this.calib.k2
      this.matL.uniforms.zoom.value       = this.calib.zoom
      this.matL.uniforms.eyeShift.value   = this.calib.eyeShiftL
      this.matL.uniforms.lensCenter.value = lc.clone()
    }
    if (this.matR) {
      this.matR.uniforms.k1.value         = this.calib.k1
      this.matR.uniforms.k2.value         = this.calib.k2
      this.matR.uniforms.zoom.value       = this.calib.zoom
      this.matR.uniforms.eyeShift.value   = this.calib.eyeShiftR
      this.matR.uniforms.lensCenter.value = lc.clone()
    }
    const PHW = Math.max(1, Math.floor(this.r.domElement.width / 2))
    this.updateAspect(PHW, this.r.domElement.height)
  }

  private save(): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.calib)) } catch {} }
  private load(): Partial<StereoCalibration> { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {} } catch { return {} } }
}
