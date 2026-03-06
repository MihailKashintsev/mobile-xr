/**
 * MindARManager v3 — динамическая загрузка через CDN
 * Никакого npm пакета — только CDN скрипт при нажатии кнопки
 */
import * as THREE from 'three'

let _scriptLoaded = false

async function loadScript(): Promise<void> {
  if (_scriptLoaded) return
  
  // Пробуем несколько CDN
  const CDNS = [
    'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js',
    'https://unpkg.com/mind-ar@1.2.5/dist/mindar-image-three.prod.js',
  ]
  
  for (const url of CDNS) {
    try {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script')
        s.src = url
        s.onload = () => res()
        s.onerror = () => rej(new Error('Failed: ' + url))
        setTimeout(() => rej(new Error('Timeout: ' + url)), 20000)
        document.head.appendChild(s)
      })
      console.log('[MindAR] Loaded from:', url)
      _scriptLoaded = true
      return
    } catch(e) {
      console.warn('[MindAR] CDN failed, trying next:', e)
    }
  }
  throw new Error('Все CDN недоступны')
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
    } catch (e: any) {
      throw new Error('CDN: ' + e.message)
    }

    // MindAR CDN экспортирует в window.MINDAR.IMAGE.MindARThree
    const w = window as any
    const MindARThree = w.MindARThree 
      ?? w.MINDAR?.IMAGE?.MindARThree
      ?? w.mindar?.IMAGE?.MindARThree
    
    console.log('[MindAR] window keys with MIND:', Object.keys(w).filter(k => k.toLowerCase().includes('mind')))
    if (!MindARThree) throw new Error('MindARThree не найден. Доступно: ' + Object.keys(w).filter(k => k.toLowerCase().includes('mind')).join(', '))

    // Raw GitHub всегда отдаёт бинарные файлы правильно
    const mindFile = 'https://raw.githubusercontent.com/MihailKashintsev/mobile-xr/main/public/targets/marker.mind'

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
      renderer.setAnimationLoop(() => renderer.render(scene, camera))
      return true
    } catch (e: any) {
      throw new Error('MindAR.start(): ' + (e?.message || String(e)))
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
