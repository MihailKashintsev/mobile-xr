/**
 * StereoRenderer — исправленный для мобильных
 * Фикс: aspect ratio, hand tracking в стерео, DPR
 */
import * as THREE from 'three'

export interface StereoCalibration {
  ipd: number; lensDistance: number; k1: number; k2: number
  verticalOffset: number; fov: number; zoom: number
}
export const DEFAULT_CALIBRATION: StereoCalibration = {
  ipd: 63, lensDistance: 0.5, k1: 0.22, k2: 0.10, verticalOffset: 0, fov: 90, zoom: 1.0
}
const STORAGE_KEY = 'mobile-xr-stereo-calib'

const VERT = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`
const FRAG = `
  precision mediump float;
  uniform sampler2D tEye; uniform float k1,k2,zoom;
  varying vec2 vUv;
  void main(){
    vec2 c=vec2(.5),d=vUv-c;
    float r2=dot(d,d),b=1.+k1*r2+k2*r2*r2;
    vec2 s=c+d*b*zoom;
    if(s.x<0.||s.x>1.||s.y<0.||s.y>1.) gl_FragColor=vec4(0.,0.,0.,1.);
    else gl_FragColor=texture2D(tEye,s);
  }`

export class StereoRenderer {
  private r: THREE.WebGLRenderer
  calib: StereoCalibration
  private camL = new THREE.PerspectiveCamera(90, 1, 0.01, 100)
  private camR = new THREE.PerspectiveCamera(90, 1, 0.01, 100)
  private rtL!: THREE.WebGLRenderTarget
  private rtR!: THREE.WebGLRenderTarget
  private matL!: THREE.ShaderMaterial
  private matR!: THREE.ShaderMaterial
  private qsL = new THREE.Scene()  // quad scene left
  private qsR = new THREE.Scene()  // quad scene right
  private qCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  private bgL = new THREE.Scene()
  private bgR = new THREE.Scene()
  private bgCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  private lastW = 0; private lastH = 0

  constructor(renderer: THREE.WebGLRenderer, override?: Partial<StereoCalibration>) {
    this.r = renderer
    this.calib = { ...DEFAULT_CALIBRATION, ...this.load(), ...override }
    this.rebuild()
  }

  setCalibration(p: Partial<StereoCalibration>) { this.calib={...this.calib,...p}; this.applyCalib(); this.save() }
  getCalibration(): StereoCalibration { return {...this.calib} }
  resetCalibration() { this.calib={...DEFAULT_CALIBRATION}; this.applyCalib(); this.save() }

  setupARBackground(vt: THREE.VideoTexture) {
    this.bgL.clear(); this.bgR.clear()
    const m = () => new THREE.MeshBasicMaterial({map:vt,depthTest:false,depthWrite:false})
    this.bgL.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),m()))
    this.bgR.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),m()))
  }

  render(scene: THREE.Scene, main: THREE.PerspectiveCamera, handGroup?: THREE.Group) {
    this.syncCameras(main)

    // Физические пиксели для RT
    const PW = this.r.domElement.width
    const PH = this.r.domElement.height
    const PHW = Math.max(1, Math.floor(PW/2))

    if (this.lastW !== PHW || this.lastH !== PH) {
      this.rtL.dispose(); this.rtR.dispose()
      this.rtL = this.makeRT(PHW, PH); this.rtR = this.makeRT(PHW, PH)
      this.matL.uniforms.tEye.value = this.rtL.texture
      this.matR.uniforms.tEye.value = this.rtR.texture
      this.updateAspect(PHW, PH)
      this.lastW = PHW; this.lastH = PH
    }

    // CSS пиксели для viewport
    const css = new THREE.Vector2(); this.r.getSize(css)
    const CW = css.x, CH = css.y, CHW = Math.floor(CW/2)

    // Если есть группа рук — показываем в сцене, убираем потом
    // (руки уже в scene, рендерятся вместе со сценой)

    // Левый глаз
    this.r.setRenderTarget(this.rtL)
    this.r.autoClear = true; this.r.clear(); this.r.autoClear = false
    this.r.render(this.bgL, this.bgCam)
    this.r.render(scene, this.camL)

    // Правый глаз
    this.r.setRenderTarget(this.rtR)
    this.r.autoClear = true; this.r.clear(); this.r.autoClear = false
    this.r.render(this.bgR, this.bgCam)
    this.r.render(scene, this.camR)

    // Вывод side-by-side
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

  onResize() { this.lastW = 0; this.lastH = 0 }
  dispose() { this.rtL.dispose(); this.rtR.dispose() }

  private rebuild() {
    const PW = this.r.domElement.width, PH = this.r.domElement.height
    const PHW = Math.max(1, Math.floor(PW/2))
    this.rtL?.dispose(); this.rtR?.dispose()
    this.rtL = this.makeRT(PHW, PH); this.rtR = this.makeRT(PHW, PH)
    this.lastW = PHW; this.lastH = PH
    this.matL = this.makeMat(this.rtL.texture); this.matR = this.makeMat(this.rtR.texture)
    this.qsL.clear(); this.qsR.clear()
    this.qsL.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), this.matL))
    this.qsR.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), this.matR))
    this.updateAspect(PHW, PH)
  }

  private makeRT(w: number, h: number) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace
    })
  }

  private makeMat(tex: THREE.Texture) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { tEye:{value:tex}, k1:{value:this.calib.k1}, k2:{value:this.calib.k2}, zoom:{value:this.calib.zoom} },
      depthTest: false, depthWrite: false
    })
  }

  private updateAspect(w: number, h: number) {
    // Аспект одного глаза = половина экрана
    const aspect = h > 0 ? w/h : 1
    this.camL.aspect = aspect; this.camR.aspect = aspect
    this.camL.fov = this.calib.fov; this.camR.fov = this.calib.fov
    this.camL.updateProjectionMatrix(); this.camR.updateProjectionMatrix()
  }

  private syncCameras(main: THREE.PerspectiveCamera) {
    const half = (this.calib.ipd/1000)/2, vOff = this.calib.verticalOffset, q = main.quaternion
    this.camL.copy(main); this.camR.copy(main)
    this.camL.fov = this.calib.fov; this.camR.fov = this.calib.fov
    this.camL.position.copy(main.position).add(new THREE.Vector3(-half, vOff, 0).applyQuaternion(q))
    this.camR.position.copy(main.position).add(new THREE.Vector3( half, vOff, 0).applyQuaternion(q))
    this.camL.updateProjectionMatrix(); this.camR.updateProjectionMatrix()
  }

  private applyCalib() {
    if(this.matL){this.matL.uniforms.k1.value=this.calib.k1;this.matL.uniforms.k2.value=this.calib.k2;this.matL.uniforms.zoom.value=this.calib.zoom}
    if(this.matR){this.matR.uniforms.k1.value=this.calib.k1;this.matR.uniforms.k2.value=this.calib.k2;this.matR.uniforms.zoom.value=this.calib.zoom}
    const PHW = Math.max(1, Math.floor(this.r.domElement.width/2))
    this.updateAspect(PHW, this.r.domElement.height)
  }

  private save() { try{localStorage.setItem(STORAGE_KEY, JSON.stringify(this.calib))}catch{} }
  private load(): Partial<StereoCalibration> { try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):{}}catch{return{}} }
}
