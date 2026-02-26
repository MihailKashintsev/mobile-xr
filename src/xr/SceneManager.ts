import * as THREE from 'three'
import { StereoRenderer } from './StereoRenderer'

export class SceneManager {
  scene:    THREE.Scene
  camera:   THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer

  private stereoRenderer?: StereoRenderer
  private stereoMode = false
  private videoTexture?: THREE.VideoTexture
  private bgScene  = new THREE.Scene()
  private bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(container: HTMLElement) {
    this.scene  = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100)
    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const pt = new THREE.PointLight(0x6366f1, 2, 10); pt.position.set(0, 2, 1); this.scene.add(pt)
    window.addEventListener('resize', () => this.onResize())
    screen.orientation?.addEventListener?.('change', () => setTimeout(() => this.onResize(), 200))
  }

  setupARBackground(video: HTMLVideoElement): void {
    this.videoTexture?.dispose()
    this.videoTexture = new THREE.VideoTexture(video)
    // LINEAR - не sRGB, иначе двойная гамма в VR
    this.videoTexture.colorSpace = THREE.LinearSRGBColorSpace
    this.bgScene.clear()
    this.bgScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.videoTexture, depthTest: false, depthWrite: false })
    ))
    if (this.stereoRenderer) this.stereoRenderer.setupARBackground(this.videoTexture)
  }

  setStereo(on: boolean): boolean { if (on !== this.stereoMode) this.toggleStereo(); return this.stereoMode }

  toggleStereo(): boolean {
    this.stereoMode = !this.stereoMode
    if (this.stereoMode && !this.stereoRenderer) this.stereoRenderer = new StereoRenderer(this.renderer)
    if (this.stereoMode && this.videoTexture) this.stereoRenderer!.setupARBackground(this.videoTexture)
    return this.stereoMode
  }

  getStereoRenderer(): StereoRenderer | undefined { return this.stereoRenderer }
  isStereo(): boolean { return this.stereoMode }

  render(): void {
    if (this.videoTexture) this.videoTexture.needsUpdate = true
    if (this.stereoMode && this.stereoRenderer) {
      this.stereoRenderer.render(this.scene, this.camera)
    } else {
      this.renderer.autoClear = false; this.renderer.clear()
      this.renderer.render(this.bgScene, this.bgCamera)
      this.renderer.render(this.scene, this.camera)
      this.renderer.autoClear = true
    }
  }

  private onResize(): void {
    const W = window.innerWidth, H = window.innerHeight
    this.camera.aspect = W / H; this.camera.updateProjectionMatrix()
    this.renderer.setSize(W, H); this.stereoRenderer?.onResize()
  }

  dispose(): void { this.renderer.dispose(); this.stereoRenderer?.dispose() }
}
