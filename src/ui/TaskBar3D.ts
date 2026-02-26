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

  update(time: number, camera: THREE.PerspectiveCamera, _fw: THREE.Vector3|null, _p: boolean): void {
    if (!this._initialized) {
      const off = new THREE.Vector3(0, -0.40, -0.72)
      off.applyQuaternion(camera.quaternion)
      this.window.group.position.copy(camera.position).add(off)
      this.window.group.quaternion.copy(camera.quaternion)
      this._initialized = true
    }
    // Плавное следование за камерой (если не перетаскивают)
    if (!this.window.dragging) {
      const off = new THREE.Vector3(0, -0.40, -0.72)
      off.applyQuaternion(camera.quaternion)
      const target = new THREE.Vector3().copy(camera.position).add(off)
      this.window.group.position.lerp(target, 0.04)
      this.window.group.quaternion.slerp(camera.quaternion, 0.04)
    }
    this.window.update(time)
  }
}
