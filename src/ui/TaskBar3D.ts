import * as THREE from 'three'
import { XRWindow } from './WindowManager'

export interface TaskBarButton {
  label:   string
  onClick: () => void
  active?: boolean
}

export class TaskBar3D {
  readonly window: XRWindow
  group: THREE.Group
  private btns: TaskBarButton[] = []
  private _initialized = false

  constructor() {
    this.window = new XRWindow({
      title:     'MobileXR',
      width:     1.80,
      height:    0.50,
      closeable: false,
      position:  new THREE.Vector3(0, -0.40, -0.85),
      content:   { buttons: [] },
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

  setActive(icon: string, active: boolean): void {
    const btn = this.btns.find(b => b.label.startsWith(icon))
    if (!btn || btn.active === active) return
    btn.active = active
    this._sync()
  }

  addToScene(s: THREE.Scene): void { this.window.addTo(s) }

  update(time: number, _camera: THREE.PerspectiveCamera, _fw: THREE.Vector3|null, _p: boolean): void {
    if (!this._initialized) {
      // Камера всегда смотрит вдоль -Z, ставим тасктбар прямо перед ней
      this.window.group.position.set(0, -0.32, -0.85)
      this.window.group.quaternion.identity()
      this._initialized = true
    }
    this.window.update(time)
  }
}
