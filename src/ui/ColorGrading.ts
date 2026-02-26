/**
 * ColorGrading — постобработка цвета для VR/AR режима
 * Применяется через fullscreen quad шейдер поверх рендера
 *
 * Параметры: brightness, contrast, saturation, tint (RGB смещение)
 */
import * as THREE from 'three'

export interface ColorGradingParams {
  brightness:  number   // -0.5 .. 0.5, default 0
  contrast:    number   // 0.5 .. 1.5, default 1
  saturation:  number   // 0 .. 2, default 1
  tintR:       number   // 0.8 .. 1.2, default 1
  tintG:       number
  tintB:       number
  enabled:     boolean
}

export const DEFAULT_CG: ColorGradingParams = {
  brightness: 0, contrast: 1, saturation: 1,
  tintR: 1, tintG: 1, tintB: 1, enabled: false
}

const STORAGE_KEY = 'mxr-cg-v1'

const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`
const FRAG = `
precision highp float;
uniform sampler2D tScene;
uniform float brightness, contrast, saturation, tintR, tintG, tintB;
varying vec2 vUv;

vec3 adjustSaturation(vec3 c, float s){
  float grey=dot(c,vec3(0.299,0.587,0.114));
  return mix(vec3(grey),c,s);
}

void main(){
  vec3 c = texture2D(tScene,vUv).rgb;
  // Brightness
  c += brightness;
  // Contrast
  c = (c - 0.5) * contrast + 0.5;
  // Saturation
  c = adjustSaturation(c, saturation);
  // Tint
  c *= vec3(tintR, tintG, tintB);
  gl_FragColor = vec4(clamp(c,0.,1.),1.);
}
`

export class ColorGrading {
  params: ColorGradingParams
  private rt: THREE.WebGLRenderTarget
  private mat: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private quadScene: THREE.Scene
  private quadCam: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    this.params = { ...DEFAULT_CG, ...this.load() }

    const W = renderer.domElement.width
    const H = renderer.domElement.height
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      colorSpace: THREE.LinearSRGBColorSpace
    })

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        tScene:     { value: this.rt.texture },
        brightness: { value: this.params.brightness },
        contrast:   { value: this.params.contrast },
        saturation: { value: this.params.saturation },
        tintR:      { value: this.params.tintR },
        tintG:      { value: this.params.tintG },
        tintB:      { value: this.params.tintB },
      },
      depthTest: false, depthWrite: false
    })

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), this.mat)
    this.quadScene = new THREE.Scene()
    this.quadScene.add(this.quad)
    this.quadCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  }

  setParams(p: Partial<ColorGradingParams>): void {
    Object.assign(this.params, p)
    this.applyToShader()
    this.save()
  }

  getParams(): ColorGradingParams { return { ...this.params } }
  reset(): void { this.params = { ...DEFAULT_CG }; this.applyToShader(); this.save() }

  /**
   * Вызывать ВМЕСТО обычного scene.render когда включено
   * renderFn — функция которая рендерит сцену
   */
  renderWithGrading(renderToRT: ()=>void): void {
    if (!this.params.enabled) { renderToRT(); return }

    // Resize RT if needed
    const W=this.renderer.domElement.width, H=this.renderer.domElement.height
    if (this.rt.width!==W || this.rt.height!==H) this.rt.setSize(W,H)

    // Render scene into RT
    this.renderer.setRenderTarget(this.rt)
    renderToRT()
    this.renderer.setRenderTarget(null)

    // Apply color grading quad
    this.renderer.autoClear=false
    this.renderer.clear()
    this.renderer.render(this.quadScene, this.quadCam)
    this.renderer.autoClear=true
  }

  onResize(): void {
    const W=this.renderer.domElement.width, H=this.renderer.domElement.height
    this.rt.setSize(W,H)
  }

  private applyToShader(): void {
    const u=this.mat.uniforms
    u.brightness.value=this.params.brightness
    u.contrast.value=this.params.contrast
    u.saturation.value=this.params.saturation
    u.tintR.value=this.params.tintR
    u.tintG.value=this.params.tintG
    u.tintB.value=this.params.tintB
  }

  private save(): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.params)) } catch {} }
  private load(): Partial<ColorGradingParams> {
    try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):{} } catch { return {} }
  }
}
