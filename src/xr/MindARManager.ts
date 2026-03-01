/**
 * MindARManager v2
 * 
 * MindAR загружается динамически через CDN только когда пользователь
 * нажимает кнопку AR. Никакого npm пакета — только CDN скрипт.
 * 
 * Как использовать:
 * 1. Скомпилируй marker.mind на https://hiukim.github.io/mind-ar-js-doc/tools/compile
 * 2. Положи в public/targets/marker.mind
 * 3. Нажми кнопку AR в тасктбаре
 */
import * as THREE from 'three'

const MINDAR_CDN = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js'

let scriptLoaded = false

async function loadMindARScript(): Promise<void> {
  if (scriptLoaded || (window as any).MindARThree) {
    scriptLoaded = true; return
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = MINDAR_CDN
    s.onload  = () => { scriptLoaded = true; resolve() }
    s.onerror = () => reject(new Error('Failed to load MindAR from CDN'))
    document.head.appendChild(s)
  })
}

export class MindARManager {
  private mindar:   any     = null
  private anchor:   THREE.Group | null = null
  private _active   = false
  private _found    = false
  private _lostAt   = 0
  private _container: HTMLElement | null = null

  get isActive():  boolean { return this._active }
  get isFound():   boolean { return this._found  }
  get anchor3D():  THREE.Group | null { return this.anchor }

  /** Возвращает true если маркер был виден недавно (буфер 2с) */
  get isVisible(): boolean {
    return this._found || (this._lostAt > 0 && performance.now() - this._lostAt < 2000)
  }

  async start(
    container: HTMLElement,
    scene:     THREE.Scene,
    mindFile = '/mobile-xr/targets/marker.mind'
  ): Promise<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer }> {
    await loadMindARScript()

    const MindARThree = (window as any).MindARThree
    if (!MindARThree) throw new Error('MindARThree not available after script load')

    this._container = container

    this.mindar = new MindARThree({
      container,
      imageTargetSrc: mindFile,
      maxTrack:       1,
      uiLoading:      'no',
      uiScanning:     'no',
      uiError:        'no',
    })

    const { renderer, scene: mScene, camera } = this.mindar.getThree()

    // Добавляем нашу Three.js сцену в MindAR сцену
    mScene.add(scene)

    // Создаём якорь — Three.js группа привязанная к маркеру в реальном пространстве
    this.anchor = new THREE.Group()
    const target = this.mindar.addAnchor(0)
    target.group.add(this.anchor)

    target.onTargetFound = () => {
      this._found  = true
      this._lostAt = 0
    }
    target.onTargetLost = () => {
      this._found  = false
      this._lostAt = performance.now()
    }

    await this.mindar.start()
    this._active = true

    return { renderer, scene: mScene, camera }
  }

  stop(): void {
    if (this.mindar) {
      try { this.mindar.stop() } catch {}
      this._active = false
      this._found  = false
    }
  }
}
