/**
 * HandTracker — MediaPipe Hands через CDN script-tag
 */

export interface Landmark { x: number; y: number; z: number }
export interface HandData {
  landmarks: Landmark[]
  worldLandmarks: Landmark[]
  handedness: 'Left' | 'Right'
}
export type HandsCallback = (hands: HandData[]) => void

export interface CameraInfo {
  deviceId: string
  label: string
  facing: 'user' | 'environment' | 'unknown'
}

const MP_VERSION = '0.4.1675469240'
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_VERSION}`

export class HandTracker {
  private hands: any = null
  private videoEl: HTMLVideoElement
  private callbacks: HandsCallback[] = []
  private isRunning = false
  private currentDeviceId: string | null = null

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
    await this.loadScript(`${MP_CDN}/hands.js`)
    onProgress?.(35)

    const HandsClass = await this.waitForGlobal('Hands', 8000)
    onProgress?.(50)

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
    await Promise.race([
      this.hands.initialize(),
      new Promise<void>((_, rej) =>
        setTimeout(() => rej(new Error('Таймаут загрузки модели (>15с). Проверьте интернет.')), 15000)
      )
    ])
    onProgress?.(80)

    await this.startCamera()
    onProgress?.(100)
  }

  /** Получить список доступных камер */
  async getCameras(): Promise<CameraInfo[]> {
    // Нужно сначала запросить разрешение, чтобы получить label
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Камера ${d.deviceId.slice(0, 6)}...`,
        facing: d.label.toLowerCase().includes('front') || d.label.toLowerCase().includes('фронт')
          ? 'user'
          : d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear') || d.label.toLowerCase().includes('зад')
            ? 'environment'
            : 'unknown'
      }))
  }

  /** Переключить камеру по deviceId */
  async switchCamera(deviceId: string): Promise<void> {
    this.stopStream()
    this.currentDeviceId = deviceId
    await this.startCamera(deviceId)
  }

  private async startCamera(deviceId?: string): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Камера недоступна. Нужен HTTPS и современный браузер.')
    }

    let stream: MediaStream
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      }
      stream = await navigator.mediaDevices.getUserMedia(constraints)
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

    // Сохраняем актуальный deviceId из потока
    const track = stream.getVideoTracks()[0]
    this.currentDeviceId = track?.getSettings().deviceId ?? null

    this.isRunning = true
    if (!this.hands) return
    this.processLoop()
  }

  private stopStream(): void {
    this.isRunning = false
    ;(this.videoEl.srcObject as MediaStream)?.getTracks().forEach(t => t.stop())
    this.videoEl.srcObject = null
  }

  private async processLoop(): Promise<void> {
    if (!this.isRunning) return
    if (this.videoEl.readyState >= 2) {
      try { await this.hands.send({ image: this.videoEl }) } catch { /* skip frame */ }
    }
    requestAnimationFrame(() => this.processLoop())
  }

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

  getCurrentDeviceId(): string | null { return this.currentDeviceId }
  onHands(cb: HandsCallback): void { this.callbacks.push(cb) }
  getVideoElement(): HTMLVideoElement { return this.videoEl }
  stop(): void { this.stopStream() }
}
