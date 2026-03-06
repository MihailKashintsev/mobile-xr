import * as THREE from 'three'

let _loaded = false

async function loadMindAR(): Promise<any> {
  if (_loaded) return

  await new Promise<void>((res, rej) => {
    if (document.querySelector('script[data-mindar]')) { res(); return }
    const s = document.createElement('script')
    s.setAttribute('data-mindar', '1')
    s.src = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js'
    s.onload = () => { _loaded = true; res() }
    s.onerror = () => rej(new Error('MindAR CDN недоступен'))
    setTimeout(() => rej(new Error('MindAR CDN timeout')), 20000)
    document.head.appendChild(s)
  })
}

function getMindARThree(): any {
  const w = window as any
  // Логируем всё что есть в window после загрузки
  const newKeys = Object.keys(w).filter(k =>
    !['window','document','navigator','location','history','screen',
      'performance','console','fetch','XMLHttpRequest','WebSocket',
      'Promise','Array','Object','String','Number','Boolean','Symbol',
      'Map','Set','WeakMap','WeakSet','Proxy','Reflect','JSON','Math',
      'Date','RegExp','Error','TypeError','RangeError','parseInt',
      'parseFloat','isNaN','isFinite','encodeURI','decodeURI',
      'setTimeout','setInterval','clearTimeout','clearInterval',
      'requestAnimationFrame','cancelAnimationFrame','alert','confirm',
      'THREE','MediaPipe','HandLandmarker','tf','tflite'
    ].includes(k)
  )
  console.log('[MindAR] window keys after load:', newKeys.join(', '))

  return w.MindARThree
    ?? w.MINDAR?.IMAGE?.MindARThree
    ?? w.MindAR?.IMAGE?.MindARThree
    ?? w['mindar']?.IMAGE?.MindARThree
    ?? null
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
    if (!MindARThree) throw new Error('MindARThree не найден — смотри лог 🐛')

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
