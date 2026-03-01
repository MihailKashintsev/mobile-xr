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

  private screenQ(): THREE.Quaternion {
    const q = new THREE.Quaternion()
    const angle = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number
    if (angle === 90)               q.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI/2)
    if (angle === 270 || angle === -90) q.setFromAxisAngle(new THREE.Vector3(0,0,1),  Math.PI/2)
    return q
  }

  update(time: number, camera: THREE.PerspectiveCamera, _fw: THREE.Vector3|null, _p: boolean): void {
    if (!this._initialized) {
      const q       = this.screenQ()
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
      const down    = new THREE.Vector3(0, -1,  0).applyQuaternion(q)
      this.window.group.position
        .copy(camera.position)
        .addScaledVector(forward, 0.85)
        .addScaledVector(down, 0.32)
      this.window.group.quaternion.copy(q)
      this._initialized = true
    }
    this.window.update(time)
  }
}
