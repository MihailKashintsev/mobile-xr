import * as THREE from 'three'

let _loaded = false

// MindAR загружается через <script> в index.html — ждём пока появится в window
async function loadMindAR(): Promise<void> {
  if (_loaded) return
  // Ждём максимум 10 сек пока скрипт из index.html загрузится
  for (let i = 0; i < 100; i++) {
    if (getMindARThree()) { _loaded = true; return }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('MindAR не загрузился за 10 сек')
}

function getMindARThree(): any {
  const w = window as any

  // Проверяем все возможные места
  const candidates = [
    w.MindARThree,
    w.MINDAR?.IMAGE?.MindARThree,
    w.MindAR?.IMAGE?.MindARThree,
    w.mindar?.IMAGE?.MindARThree,
    w.Module?.MindARThree,
  ].filter(Boolean)

  if (candidates.length > 0) return candidates[0]

  // Последний шанс — ищем в Module
  const mod = w.Module
  if (mod) {
    console.log('[MindAR] Module keys:', Object.keys(mod).slice(0, 30).join(', '))
    for (const key of Object.keys(mod)) {
      if (key.toLowerCase().includes('mindar') || key.toLowerCase().includes('three')) {
        console.log('[MindAR] Found in Module:', key, typeof mod[key])
        return mod[key]
      }
    }
  }

  // Ищем по всему window
  for (const key of Object.keys(w)) {
    const val = w[key]
    if (val && typeof val === 'function' && key.toLowerCase().includes('mind')) {
      console.log('[MindAR] Found in window:', key)
      return val
    }
    if (val && typeof val === 'object' && val.MindARThree) {
      console.log('[MindAR] Found nested:', key, '.MindARThree')
      return val.MindARThree
    }
  }

  return null
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
    await loadMindAR()

    const MindARThree = getMindARThree()
    if (!MindARThree) throw new Error('MindARThree не найден после загрузки')

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

    await this._mindar.start()
    this._active = true
    renderer.setAnimationLoop(() => renderer.render(scene, camera))
    return true
  }

  stop(): void {
    this._arRend?.setAnimationLoop(null)
    try { this._mindar?.stop() } catch {}
    this._active = false
    this._found  = false
    this._mindar = null
    this._arCam  = null
  }
}
