/**
 * SceneManager — Three.js сцена с AR-фоном (видео с камеры)
 */

import * as THREE from 'three'

export class SceneManager {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  private videoTexture?: THREE.VideoTexture
  private bgMesh?: THREE.Mesh
  private stereoMode = false

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    )
    this.camera.position.set(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      alpha: false,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    // Освещение
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    const point = new THREE.PointLight(0x6366f1, 2, 10)
    point.position.set(0, 2, 1)
    this.scene.add(ambient, point)

    window.addEventListener('resize', () => this.onResize())
  }

  setupARBackground(video: HTMLVideoElement): void {
    this.videoTexture = new THREE.VideoTexture(video)
    this.videoTexture.colorSpace = THREE.SRGBColorSpace

    // Фоновая плоскость с видео
    const geo = new THREE.PlaneGeometry(2, 2)
    const mat = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      depthTest: false,
      depthWrite: false
    })
    this.bgMesh = new THREE.Mesh(geo, mat)
    this.bgMesh.renderOrder = -1
    // Спецкамера для фона (всегда по всему экрану)
    const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const bgScene = new THREE.Scene()
    bgScene.add(this.bgMesh)

    // Переопределяем render чтобы сначала рисовать фон
    const origRender = this.renderer.render.bind(this.renderer)
    this.renderer.render = (scene, camera) => {
      if (scene === this.scene) {
        this.renderer.autoClear = false
        this.renderer.clear()
        origRender(bgScene, bgCamera)
        origRender(scene, camera)
      } else {
        origRender(scene, camera)
      }
    }
  }

  toggleStereo(): boolean {
    this.stereoMode = !this.stereoMode
    return this.stereoMode
  }

  render(): void {
    if (this.videoTexture) this.videoTexture.needsUpdate = true
    this.renderer.render(this.scene, this.camera)
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  dispose(): void {
    this.renderer.dispose()
  }
}
