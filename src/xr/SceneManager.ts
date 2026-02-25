/**
 * SceneManager — Three.js сцена + управление стерео/моно режимом
 */

import * as THREE from 'three'
import { StereoRenderer } from './StereoRenderer'
import type { StereoCalibration } from './StereoRenderer'

export class SceneManager {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  private stereoRenderer?: StereoRenderer
  private stereoMode = false
  private videoTexture?: THREE.VideoTexture

  // Для моно-режима: стандартный AR-фон
  private bgScene: THREE.Scene
  private bgCamera: THREE.OrthographicCamera

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene()
    this.bgScene = new THREE.Scene()
    this.bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100)
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
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const point = new THREE.PointLight(0x6366f1, 2, 10)
    point.position.set(0, 2, 1)
    this.scene.add(point)

    window.addEventListener('resize', () => this.onResize())
  }

  setupARBackground(video: HTMLVideoElement): void {
    this.videoTexture = new THREE.VideoTexture(video)
    this.videoTexture.colorSpace = THREE.SRGBColorSpace

    // Моно фон
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.videoTexture, depthTest: false, depthWrite: false })
    )
    bg.renderOrder = -1
    this.bgScene.add(bg)
  }

  // ─── Стерео ───────────────────────────────────────────────────────────────────

  /** Переключить стерео-режим, вернуть новое состояние */
  toggleStereo(): boolean {
    this.stereoMode = !this.stereoMode
    if (this.stereoMode) {
      if (!this.stereoRenderer) {
        this.stereoRenderer = new StereoRenderer(this.renderer)
        if (this.videoTexture) {
          this.stereoRenderer.setupARBackground(this.videoTexture)
        }
      }
    }
    return this.stereoMode
  }

  getStereoRenderer(): StereoRenderer | undefined {
    return this.stereoRenderer
  }

  isStereo(): boolean { return this.stereoMode }

  // ─── Рендер ───────────────────────────────────────────────────────────────────

  render(): void {
    if (this.videoTexture) this.videoTexture.needsUpdate = true

    if (this.stereoMode && this.stereoRenderer) {
      // Стерео рендер (сам рисует фон внутри)
      this.stereoRenderer.render(this.scene, this.camera)
    } else {
      // Моно рендер с AR фоном
      this.renderer.autoClear = false
      this.renderer.clear()
      this.renderer.render(this.bgScene, this.bgCamera)
      this.renderer.render(this.scene, this.camera)
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.stereoRenderer?.onResize()
  }

  dispose(): void {
    this.renderer.dispose()
    this.stereoRenderer?.dispose()
  }
}
