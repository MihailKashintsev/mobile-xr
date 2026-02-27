/**
 * GyroCamera — вращение камеры по гироскопу (DeviceOrientation API)
 *
 * На телефоне гироскоп даёт реальную ориентацию устройства.
 * Камера поворачивается вместе с головой — окна остаются в world space.
 *
 * Использование:
 *   const gyro = new GyroCamera(camera)
 *   gyro.enable()   // запросить разрешение (iOS 13+) и начать слушать
 *   gyro.disable()
 *   gyro.update()   // вызывать каждый кадр
 */
import * as THREE from 'three'

export class GyroCamera {
  private camera: THREE.PerspectiveCamera
  private enabled = false
  private alpha = 0  // compass (z-axis), 0-360
  private beta  = 0  // front-back tilt (-180..180)
  private gamma = 0  // left-right tilt (-90..90)

  // Offset: нажал "сбросить" — запомнили текущие углы как "вперёд"
  private alphaOffset = 0

  private _euler = new THREE.Euler()
  private _q     = new THREE.Quaternion()

  // Конверсия из системы координат телефона в Three.js
  // Three.js: X=вправо, Y=вверх, Z=к зрителю
  // DeviceOrientation: beta=наклон вперёд, gamma=наклон вбок, alpha=поворот
  private readonly screenTransform = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0))

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  async enable(): Promise<boolean> {
    // iOS 13+ требует явного разрешения
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const res = await (DeviceOrientationEvent as any).requestPermission()
        if (res !== 'granted') return false
      } catch {
        return false
      }
    }

    window.addEventListener('deviceorientation', this._onOrientation)
    this.enabled = true
    this.alphaOffset = this.alpha  // сбросить при включении
    return true
  }

  disable(): void {
    window.removeEventListener('deviceorientation', this._onOrientation)
    this.enabled = false
    // Вернуть камеру в нейтраль
    this.camera.quaternion.set(0, 0, 0, 1)
  }

  get isEnabled(): boolean { return this.enabled }

  /** Сбросить "вперёд" на текущее направление телефона */
  recenter(): void {
    this.alphaOffset = this.alpha
  }

  /** Вызывать каждый кадр */
  update(): void {
    if (!this.enabled) return

    const a = THREE.MathUtils.degToRad(this.alpha - this.alphaOffset)
    const b = THREE.MathUtils.degToRad(this.beta)
    const g = THREE.MathUtils.degToRad(this.gamma)

    // Euler в порядке YXZ (стандарт для DeviceOrientation)
    this._euler.set(b, a, -g, 'YXZ')
    this._q.setFromEuler(this._euler)

    // Применяем поворот системы координат
    this.camera.quaternion.copy(this._q).multiply(this.screenTransform)
  }

  private _onOrientation = (e: DeviceOrientationEvent): void => {
    this.alpha = e.alpha ?? 0
    this.beta  = e.beta  ?? 0
    this.gamma = e.gamma ?? 0
  }
}