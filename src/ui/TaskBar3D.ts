/**
 * TaskBar3D v6 - HTML overlay
 * 3D hit-test unreliable (depth mismatch), HTML is always reliable.
 */
import * as THREE from 'three'

export interface TaskBarButton {
  icon:    string
  label:   string
  onClick: () => void
  active?: boolean
}

export class TaskBar3D {
  group: THREE.Group
  private btns: TaskBarButton[] = []
  private bar!: HTMLElement
  private inner!: HTMLElement

  constructor() {
    this.group = new THREE.Group()
    this._createDOM()
  }

  private _createDOM(): void {
    document.getElementById('xr-taskbar')?.remove()
    const bar = document.createElement('div')
    bar.id = 'xr-taskbar'
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;align-items:flex-end;padding-bottom:env(safe-area-inset-bottom,8px);z-index:9000;pointer-events:none'
    const inner = document.createElement('div')
    inner.style.cssText = 'display:flex;gap:8px;padding:10px 16px 14px;background:rgba(5,10,25,0.90);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(99,102,241,0.30);border-bottom:none;border-radius:20px 20px 0 0;box-shadow:0 -2px 30px rgba(99,102,241,0.18);pointer-events:all'
    bar.appendChild(inner)
    document.body.appendChild(bar)
    this.bar   = bar
    this.inner = inner
  }

  private _btnCSS(active: boolean): string {
    const bg = active ? 'linear-gradient(160deg,#1e1b4b,#312e81)' : 'linear-gradient(160deg,#0f172a,#0a0f1e)'
    const bd = active ? 'rgba(129,140,248,0.75)' : 'rgba(55,65,90,0.5)'
    const sh = active ? '0 0 14px rgba(99,102,241,0.45)' : 'none'
    return 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:64px;min-height:64px;padding:8px 4px 6px;border:1px solid '+bd+';border-radius:14px;background:'+bg+';cursor:pointer;outline:none;transition:all 0.13s ease;box-shadow:'+sh+';-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation'
  }

  setButtons(btns: TaskBarButton[]): void { this.btns = btns; this._rebuild() }

  private _rebuild(): void {
    this.inner.innerHTML = ''
    for (const btn of this.btns) {
      const b = document.createElement('button')
      b.setAttribute('style', this._btnCSS(btn.active ?? false))
      b.dataset.icon = btn.icon

      const icon  = document.createElement('span')
      icon.textContent = btn.icon
      icon.style.cssText = 'font-size:23px;line-height:1;pointer-events:none'

      const lbl   = document.createElement('span')
      lbl.textContent = btn.label
      lbl.style.cssText = 'font-size:9px;font-family:-apple-system,sans-serif;font-weight:500;white-space:nowrap;color:'+(btn.active?'#c7d2fe':'rgba(148,163,184,0.8)')+';pointer-events:none'

      b.appendChild(icon); b.appendChild(lbl)

      b.addEventListener('pointerenter', () => {
        b.style.background = 'linear-gradient(160deg,#1a2744,#1e1b4b)'
        b.style.borderColor = 'rgba(99,102,241,0.6)'
        b.style.transform = 'translateY(-2px)'
      })
      b.addEventListener('pointerleave', () => { b.setAttribute('style', this._btnCSS(btn.active ?? false)); b.appendChild(icon); b.appendChild(lbl) })
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.style.transform = 'scale(0.92)' })
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); b.style.transform = ''; btn.onClick() })
      b.addEventListener('click', (e) => { e.stopPropagation(); btn.onClick() })
      b.addEventListener('contextmenu', (e) => e.preventDefault())

      this.inner.appendChild(b)
    }
  }

  setActive(icon: string, active: boolean): void {
    const btn = this.btns.find(b => b.icon === icon)
    if (!btn || btn.active === active) return
    btn.active = active
    this._rebuild()
  }

  hitTest(_fw: THREE.Vector3): TaskBarButton | null { return null }
  setHovered(_btn: TaskBarButton | null): void {}
  pressAnimation(_btn: TaskBarButton): void {}
  update(_t: number, _cam: THREE.PerspectiveCamera, _fw: THREE.Vector3|null, _p: boolean): void {}
  addToScene(s: THREE.Scene): void { s.add(this.group) }
  dispose(): void { this.bar.remove() }
}
