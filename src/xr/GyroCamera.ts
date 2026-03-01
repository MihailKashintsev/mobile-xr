/**
 * GyroCamera — поворот камеры Three.js по гироскопу устройства
 * Использует DeviceOrientation API (работает на iOS13+ и Android Chrome)
 */
import * as THREE from 'three'

export class GyroCamera {
  private camera: THREE.PerspectiveCamera
  private enabled = false
  private baseQ   = new THREE.Quaternion()  // "вперёд" при recenter
  private curQ    = new THREE.Quaternion()
  // Поворот чтобы перевести из системы устройства в систему Three.js
  // Устройство: X=right, Y=up, Z=к экрану → Three.js: X=right, Y=up, Z=от экрана
  private readonly worldQ = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
  private onEvent = (_e: DeviceOrientationEvent) => {}

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  async enable(): Promise<boolean> {
    // iOS 13+ требует явного разрешения
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission()
        if (perm !== 'granted') return false
      } catch {
        return false
      }
    }

    this.onEvent = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return
      const alpha = THREE.MathUtils.degToRad(e.alpha)  // Z (yaw)
      const beta  = THREE.MathUtils.degToRad(e.beta)   // X (pitch)
      const gamma = THREE.MathUtils.degToRad(e.gamma)  // Y (roll)

      // Euler ZXY → Quaternion (порядок как в DeviceOrientation)
      const q = new THREE.Quaternion()
      const ea = new THREE.Euler(beta, alpha, -gamma, 'YXZ')
      q.setFromEuler(ea)

      // Применяем мировой поворот (координатная система устройства → Three.js)
      this.curQ.copy(this.worldQ).multiply(q)

      // Учитываем landscape: поворот экрана на -90° по Z
      const angle = screen.orientation?.angle ?? 0
      if (angle === 90 || angle === -270) {
        const lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
        this.curQ.multiply(lq)
      } else if (angle === 270 || angle === -90) {
        const lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
        this.curQ.multiply(lq)
      }
    }

    window.addEventListener('deviceorientation', this.onEvent)
    this.enabled = true
    this.recenter()
    return true
  }

  disable(): void {
    window.removeEventListener('deviceorientation', this.onEvent)
    this.enabled = false
    this.camera.quaternion.identity()
  }

  /** Сбрасывает "вперёд" на текущее направление */
  recenter(): void {
    this.baseQ.copy(this.curQ).invert()
  }

  /** Вызывать каждый кадр в animate() */
  update(): void {
    if (!this.enabled) return
    // Применяем: baseQ (recenter) * curQ
    this.camera.quaternion.copy(this.baseQ).multiply(this.curQ)
  }

  isEnabled(): boolean { return this.enabled }
}
