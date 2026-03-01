import * as THREE from 'three'

export class GyroCamera {
  private camera:  THREE.PerspectiveCamera
  private enabled = false
  private baseQ   = new THREE.Quaternion()
  private curQ    = new THREE.Quaternion()
  private onEvent = (_e: DeviceOrientationEvent) => {}

  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera }

  async enable(): Promise<boolean> {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission()
        if (perm !== 'granted') return false
      } catch { return false }
    }

    this.onEvent = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return

      const alpha = THREE.MathUtils.degToRad(e.alpha ?? 0)
      const beta  = THREE.MathUtils.degToRad(e.beta  ?? 0)
      const gamma = THREE.MathUtils.degToRad(e.gamma ?? 0)

      // Стандартная формула DeviceOrientation → Three.js camera quaternion
      // Порядок Euler: 'YXZ' соответствует yaw-pitch-roll устройства
      const euler = new THREE.Euler(beta, -alpha, -gamma, 'YXZ')
      this.curQ.setFromEuler(euler)
    }

    window.addEventListener('deviceorientation', this.onEvent)
    this.enabled = true
    // Ждём первые данные перед recenter
    setTimeout(() => this.recenter(), 500)
    return true
  }

  disable(): void {
    window.removeEventListener('deviceorientation', this.onEvent)
    this.enabled = false
    this.camera.quaternion.identity()
  }

  recenter(): void {
    this.baseQ.copy(this.curQ).invert()
  }

  update(): void {
    if (!this.enabled) return
    this.camera.quaternion.copy(this.baseQ).multiply(this.curQ)
  }

  isEnabled(): boolean { return this.enabled }
}
