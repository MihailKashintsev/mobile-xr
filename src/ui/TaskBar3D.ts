/**
 * TaskBar3D v8 — постоянное XR окно, нажимается рукой
 *
 * Обёртка над XRWindow. Тасктбар = реальное 3D окно в пространстве.
 * Кнопки нажимаются через WindowManager.update() (щипок пальца).
 * Всегда следует за камерой (lerp), перетаскиваем за нижнюю полосу.
 */
import * as THREE from 'three'
import { XRWindow } from './WindowManager'

export interface TaskBarButton {
  label:   string       // полный лейбл включая иконку, напр. "⚙️ Настройки"
  onClick: () => void
  active?: boolean
}

export class TaskBar3D {
  readonly window: XRWindow
  group:   THREE.Group

  private btns:        TaskBarButton[] = []
  private _initialized = false

  constructor() {
    this.window = new XRWindow({
      title:    'Панель задач',
      width:    1.72,
      height:   0.52,
      closeable: false,
      position: new THREE.Vector3(0, -0.40, -0.72),
      content:  { buttons: [] },
    })
    this.group = this.window.group
  }

  setButtons(btns: TaskBarButton[]): void {
    this.btns = [...btns]
    this._sync()
  }

  private _sync(): void {
    this.window.replaceButtons(
      this.btns.map(b => ({
        label:   b.label,
        color:   b.active ? 0x1d4ed8 : 0x1e293b,
        onClick: b.onClick,
      }))
    )
  }

  /**
   * icon — первый символ (эмодзи) из label кнопки, напр. '📷'
   * Сравниваем startsWith чтобы найти нужную кнопку
   */
  setActive(icon: string, active: boolean): void {
    const btn = this.btns.find(b => b.label.startsWith(icon))
    if (!btn || btn.active === active) return
    btn.active = active
    this._sync()
  }

  addToScene(s: THREE.Scene): void { this.window.addTo(s) }

  /**
   * Ставим тасктбар один раз перед камерой при старте.
   * После — НЕ следует за камерой (world-space фиксация).
   * Пользователь может перетащить drag bar чтобы переместить.
   */
  update(time: number, camera: THREE.PerspectiveCamera, _fw: THREE.Vector3|null, _p: boolean): void {
    if (!this._initialized) {
      // Ставим прямо перед камерой снизу при первом кадре
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      const down    = new THREE.Vector3(0, -1,  0).applyQuaternion(camera.quaternion)
      this.window.group.position
        .copy(camera.position)
        .addScaledVector(forward, 0.80)
        .addScaledVector(down, 0.36)
      this.window.group.quaternion.copy(camera.quaternion)
      this._initialized = true
    }
    this.window.update(time)
  }
}
