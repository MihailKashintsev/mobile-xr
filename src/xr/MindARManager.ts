/**
 * MindARManager v3 — динамическая загрузка через CDN
 * Никакого npm пакета — только CDN скрипт при нажатии кнопки
 */
import * as THREE from 'three'

const MINDAR_CDN = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js'
let _scriptLoaded = false

async function loadScript(): Promise<void> {
  if (_scriptLoaded || (window as any).MindARThree) { _scriptLoaded = true; return }
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = MINDAR_CDN
    s.onload  = () => { _scriptLoaded = true; res() }
    s.onerror = () => rej(new Error('Не удалось загрузить MindAR CDN'))
    document.head.appendChild(s)
  })
}

export class MindARManager {
  private _mindar:  any = null
  private _anchor:  THREE.Group | null = null
  private _active   = false
  private _found    = false
  private _lostAt   = 0
  private _arRend:  any = null
  private _arScene: any = null
  private _arCam:   any = null

  get isActive():  boolean { return this._active }
  get isFound():   boolean { return this._found }
  get anchor3D():  THREE.Group | null { return this._anchor }
  get arCamera():  THREE.PerspectiveCamera | null { return this._arCam }
  get isRecentlyVisible(): boolean {
    return this._found || (this._lostAt > 0 && performance.now() - this._lostAt < 2000)
  }

  async start(container: HTMLElement, threeScene: THREE.Scene): Promise<boolean> {
    try {
      await loadScript()
    } catch (e) {
      console.error('[MindAR] CDN load failed:', e)
      return false
    }

    const MindARThree = (window as any).MindARThree
    if (!MindARThree) return false

    const mindFile = '/mobile-xr/targets/marker.mind'

    this._mindar = new MindARThree({
      container,
      imageTargetSrc: mindFile,
      maxTrack: 1,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    })

    const { renderer, scene, camera } = this._mindar.getThree()
    this._arRend  = renderer
    this._arScene = scene
    this._arCam   = camera

    // Наша Three.js сцена — дочерняя к MindAR сцене
    scene.add(threeScene)

    // Якорь привязан к маркеру в реальном пространстве
    this._anchor = new THREE.Group()
    const target = this._mindar.addAnchor(0)
    target.group.add(this._anchor)

    target.onTargetFound = () => {
      this._found  = true
      this._lostAt = 0
    }
    target.onTargetLost = () => {
      this._found  = false
      this._lostAt = performance.now()
    }

    try {
      await this._mindar.start()
      this._active = true

      // MindAR рендерит через свой RAF
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera)
      })

      return true
    } catch (e) {
      console.error('[MindAR] start failed:', e)
      return false
    }
  }

  stop(): void {
    if (this._mindar) {
      this._arRend?.setAnimationLoop(null)
      try { this._mindar.stop() } catch {}
    }
    this._active = false
    this._found  = false
    this._mindar = null
    this._arCam  = null
  }
}
