import * as THREE from 'three'

let _mindARModule: any = null

async function loadMindAR(): Promise<any> {
  if (_mindARModule) return _mindARModule

  // Динамический import — правильный способ загрузить ESM модуль
  try {
    const mod = await import(
      /* @vite-ignore */
      'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js'
    )
    console.log('[MindAR] ESM import OK, keys:', Object.keys(mod).join(', '))
    _mindARModule = mod
    return mod
  } catch(e1) {
    console.warn('[MindAR] ESM failed:', e1)
  }

  // Fallback: загружаем как скрипт и ищем в window
  await new Promise<void>((res, rej) => {
    const existing = document.querySelector('script[data-mindar]')
    if (existing) { res(); return }
    const s = document.createElement('script')
    s.setAttribute('data-mindar', '1')
    s.src = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js'
    s.onload = () => res()
    s.onerror = () => rej(new Error('CDN недоступен'))
    setTimeout(() => rej(new Error('CDN timeout')), 20000)
    document.head.appendChild(s)
  })

  // После загрузки скрипта ищем во всех возможных местах
  const w = window as any
  const MindARThree = w.MindARThree
    ?? w.MINDAR?.IMAGE?.MindARThree
    ?? w['mindar-image-three']?.MindARThree
    ?? w.MindAR?.IMAGE?.MindARThree

  if (!MindARThree) {
    const allKeys = Object.keys(w).filter(k => !['chrome','webkit','safari'].includes(k.toLowerCase()))
    console.log('[MindAR] All window keys (filtered):', allKeys.slice(0, 30).join(', '))
    throw new Error('MindARThree не найден после загрузки скрипта')
  }

  _mindARModule = { MindARThree }
  return _mindARModule
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

  async start(container: HTMLElement, threeScene: THREE.Scene): Promise<boolean> {
    let MindARThree: any
    try {
      const mod = await loadMindAR()
      MindARThree = mod.MindARThree ?? mod.default?.MindARThree ?? mod.default
      if (!MindARThree) throw new Error('MindARThree не найден в модуле. Ключи: ' + Object.keys(mod).join(', '))
    } catch (e: any) {
      throw new Error('Загрузка MindAR: ' + e.message)
    }

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

    scene.add(threeScene)

    this._anchor = new THREE.Group()
    const target = this._mindar.addAnchor(0)
    target.group.add(this._anchor)

    target.onTargetFound = () => { this._found = true;  this._lostAt = 0 }
    target.onTargetLost  = () => { this._found = false; this._lostAt = performance.now() }

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
