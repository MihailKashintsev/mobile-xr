export interface Landmark { x: number; y: number; z: number }
export interface HandData { landmarks: Landmark[]; worldLandmarks: Landmark[]; handedness: 'Left' | 'Right' }
export type HandsCallback = (hands: HandData[]) => void
export interface CameraInfo { deviceId: string; label: string; facing: 'user' | 'environment' | 'unknown' }

const MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240'

export class HandTracker {
  private hands: any = null
  private videoEl: HTMLVideoElement
  private callbacks: HandsCallback[] = []
  private isRunning = false
  private loopActive = false
  private currentDeviceId: string | null = null
  private isFrontCamera = false

  constructor() {
    this.videoEl = document.createElement('video')
    this.videoEl.setAttribute('playsinline', ''); this.videoEl.muted = true
    this.videoEl.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:0;left:0;'
    document.body.appendChild(this.videoEl)
  }

  async init(onProgress?: (p: number) => void): Promise<void> {
    onProgress?.(10)
    await this.loadScript(`${MP_CDN}/hands.js`)
    onProgress?.(35)
    const HandsClass = await this.waitForGlobal('Hands', 8000)
    onProgress?.(50)

    this.hands = new HandsClass({ locateFile: (f: string) => `${MP_CDN}/${f}` })
    this.hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.65, minTrackingConfidence: 0.5, selfieMode: false })
    this.hands.onResults((results: any) => {
      const hands: HandData[] = []
      if (results.multiHandLandmarks) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          hands.push({ landmarks: results.multiHandLandmarks[i], worldLandmarks: results.multiHandWorldLandmarks?.[i] || [], handedness: results.multiHandedness[i].label })
        }
      }
      this.callbacks.forEach(cb => cb(hands))
    })

    onProgress?.(60)
    await Promise.race([
      this.hands.initialize(),
      new Promise<void>((_, r) => setTimeout(() => r(new Error('Таймаут модели')), 15000))
    ])
    onProgress?.(80)

    // Пробуем заднюю камеру сначала
    await this.startCamera(null, 'environment')
    onProgress?.(100)
  }

  async getCameras(): Promise<CameraInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'videoinput').map(d => {
      const label = d.label || `Камера ${d.deviceId.slice(0,6)}`
      const lc = label.toLowerCase()
      const facing: CameraInfo['facing'] =
        lc.includes('front') || lc.includes('фронт') || lc.includes('user') ? 'user'
        : lc.includes('back') || lc.includes('rear') || lc.includes('зад') ? 'environment'
        : 'unknown'
      return { deviceId: d.deviceId, label, facing }
    })
  }

  async switchCamera(deviceId: string): Promise<void> {
    this.isRunning = false
    ;(this.videoEl.srcObject as MediaStream)?.getTracks().forEach(t => t.stop())
    this.videoEl.srcObject = null
    await this.startCamera(deviceId, null)
  }

  async switchNextCamera(): Promise<void> {
    const cameras = await this.getCameras()
    if (cameras.length < 2) return
    const idx = cameras.findIndex(cam => cam.deviceId === this.currentDeviceId)
    const next = cameras[(idx+1) % cameras.length]
    await this.switchCamera(next.deviceId)
  }

  private async startCamera(deviceId: string | null, prefer: 'user' | 'environment' | null): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Нужен HTTPS для доступа к камере')
    let stream: MediaStream | null = null

    if (deviceId) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }) } catch {}
    }
    if (!stream && prefer) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: prefer }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }) } catch {}
    }
    if (!stream) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }) } catch (e: any) {
        throw new Error(e.name === 'NotAllowedError' ? 'Доступ к камере запрещён' : `Ошибка: ${e.message}`)
      }
    }

    this.videoEl.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      this.videoEl.onloadedmetadata = () => this.videoEl.play().then(resolve).catch(reject)
      setTimeout(() => reject(new Error('Таймаут камеры')), 10000)
    })

    const track = stream.getVideoTracks()[0]
    const settings = track?.getSettings()
    this.currentDeviceId = settings?.deviceId ?? null
    this.isFrontCamera = settings?.facingMode === 'user'

    // selfieMode: зеркало только для фронтальной
    this.hands?.setOptions({ selfieMode: this.isFrontCamera })

    this.isRunning = true
    if (!this.loopActive) { this.loopActive = true; this.processLoop() }
  }

  private async processLoop(): Promise<void> {
    if (!this.isRunning || !this.hands) { await new Promise(r => setTimeout(r, 50)); requestAnimationFrame(() => this.processLoop()); return }
    if (this.videoEl.readyState >= 2) { try { await this.hands.send({ image: this.videoEl }) } catch {} }
    requestAnimationFrame(() => this.processLoop())
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return }
      const s = document.createElement('script'); s.src = src
      s.onload = () => res(); s.onerror = () => rej(new Error(`Не загрузился: ${src}`))
      document.head.appendChild(s)
    })
  }

  private waitForGlobal(name: string, ms: number): Promise<any> {
    return new Promise((res, rej) => {
      const end = Date.now() + ms
      const check = () => { const v = (window as any)[name]; if (v) res(v); else if (Date.now() > end) rej(new Error(`${name} не появился`)); else setTimeout(check, 100) }
      check()
    })
  }

  getCurrentDeviceId() { return this.currentDeviceId }
  async switchToDevice(deviceId: string): Promise<void> { await this.switchCamera(deviceId) }
  getCurrentLabel(): string { return this.currentDeviceId ? `Устройство ${this.currentDeviceId.slice(0,8)}` : "—" }
  isFront() { return this.isFrontCamera }
  onHands(cb: HandsCallback) { this.callbacks.push(cb) }
  getVideoElement() { return this.videoEl }
  stop() { this.isRunning = false; this.loopActive = false; (this.videoEl.srcObject as MediaStream)?.getTracks().forEach(t => t.stop()) }
}
