/**
 * HandTracker — MediaPipe Hands через CDN script-tag (не npm import!)
 *
 * npm-пакет @mediapipe/hands не работает с Vite/bundler —
 * WASM файлы не резолвятся. Единственный рабочий способ в браузере —
 * загрузить hands.js скриптом напрямую с CDN.
 */

export interface Landmark { x: number; y: number; z: number }
export interface HandData {
  landmarks: Landmark[]
  worldLandmarks: Landmark[]
  handedness: 'Left' | 'Right'
}
export type HandsCallback = (hands: HandData[]) => void

const MP_VERSION = '0.4.1675469240'
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}`

export class HandTracker {
  private hands: any = null
  private videoEl: HTMLVideoElement
  private callbacks: HandsCallback[] = []
  private isRunning = false

  constructor() {
    this.videoEl = document.createElement('video')
    this.videoEl.setAttribute('playsinline', '')
    this.videoEl.setAttribute('muted', '')
    this.videoEl.muted = true
    this.videoEl.style.cssText =
      'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:0;left:0;'
    document.body.appendChild(this.videoEl)
  }

  async init(onProgress?: (p: number) => void): Promise<void> {
    onProgress?.(10)

    // 1. Грузим скрипт рук с CDN
    await this.loadScript(`${MP_CDN}/hands.js`)
    onProgress?.(35)

    // 2. Ждём появления window.Hands (скрипт может грузиться асинхронно)
    const HandsClass = await this.waitForGlobal('Hands', 8000)
    onProgress?.(50)

    // 3. Создаём экземпляр
    this.hands = new HandsClass({
      locateFile: (file: string) => `${MP_CDN}/${file}`
    })

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.5,
      selfieMode: true
    })

    this.hands.onResults((results: any) => {
      const hands: HandData[] = []
      if (results.multiHandLandmarks) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          hands.push({
            landmarks: results.multiHandLandmarks[i],
            worldLandmarks: results.multiHandWorldLandmarks?.[i] || [],
            handedness: results.multiHandedness[i].label as 'Left' | 'Right'
          })
        }
      }
      this.callbacks.forEach(cb => cb(hands))
    })

    onProgress?.(60)

    // 4. Инициализируем WASM модель
    await Promise.race([
      this.hands.initialize(),
      new Promise<void>((_, rej) =>
        setTimeout(() => rej(new Error('Таймаут загрузки модели (>15с). Проверьте интернет.')), 15000)
      )
    ])
    onProgress?.(80)

    // 5. Запускаем камеру
    await this.startCamera()
    onProgress?.(100)
  }

  private async startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Камера недоступна. Нужен HTTPS и современный браузер.')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      })
    } catch (e: any) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        throw new Error('Доступ к камере запрещён — разрешите в браузере и перезагрузите.')
      }
      // Fallback: любая камера
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    }

    this.videoEl.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      this.videoEl.onloadedmetadata = () => this.videoEl.play().then(resolve).catch(reject)
      this.videoEl.onerror = () => reject(new Error('Ошибка видеопотока'))
      setTimeout(() => reject(new Error('Таймаут камеры')), 10000)
    })

    this.isRunning = true
    this.processLoop()
  }

  private async processLoop(): Promise<void> {
    if (!this.isRunning) return
    if (this.videoEl.readyState >= 2) {
      try { await this.hands.send({ image: this.videoEl }) } catch { /* skip frame */ }
    }
    requestAnimationFrame(() => this.processLoop())
  }

  // ─── Хелперы ────────────────────────────────────────────────────────────────

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.onload  = () => resolve()
      s.onerror = () => reject(new Error(`Не загрузился скрипт: ${src}\nПроверьте интернет.`))
      document.head.appendChild(s)
    })
  }

  /** Ждёт появления window[name] с таймаутом */
  private waitForGlobal(name: string, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const check = () => {
        const val = (window as any)[name]
        if (val) { resolve(val); return }
        if (Date.now() > deadline) {
          reject(new Error(`window.${name} не появился — CDN недоступен?`))
          return
        }
        setTimeout(check, 100)
      }
      check()
    })
  }

  onHands(cb: HandsCallback): void      { this.callbacks.push(cb) }
  getVideoElement(): HTMLVideoElement    { return this.videoEl }
  stop(): void {
    this.isRunning = false
    ;(this.videoEl.srcObject as MediaStream)?.getTracks().forEach(t => t.stop())
  }
}
