/**
 * WindowManager — окна в мировом пространстве (Quest 3 style)
 *
 * Ключевые особенности:
 * - Окна закреплены в world space, не следуют за головой
 * - При инициализации позиционируются перед камерой
 * - Depth occlusion: руки перекрывают/перекрываются окнами через Z-test
 * - Кнопки не срабатывают если палец за плоскостью окна
 */

import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

const DRAG_BAR_H  = 0.10
const TITLE_BAR_H = 0.13

const C = {
  bg:          0x0d1117,
  title:       0x161b22,
  border:      0x30363d,
  dragBar:     0x1e2430,
  dragBarHov:  0x2a3441,
  accent:      0x6366f1,
  btnClose:    0xff5f56,
  btnMin:      0xffbd2e,
  btnMax:      0x27c93f,
  alpha:       0.90,
}

export interface WinButton {
  label:   string
  color?:  number
  onClick?: () => void
}

export interface WinContent {
  buttons: WinButton[]
}

export interface WinOptions {
  title:     string
  icon?:     string
  width?:    number
  height?:   number
  position?: THREE.Vector3
  content?:  WinContent
}

// ─── XRWindow ──────────────────────────────────────────────────────────────────

export class XRWindow {
  group:    THREE.Group
  private W: number
  private H: number
  private D = 0.018

  private bodyMesh!: THREE.Mesh
  private dragBar!:  THREE.Mesh
  private dragGlow!: THREE.Mesh
  private border!:   THREE.LineSegments
  private buttons3d: { mesh: THREE.Mesh; btn: WinButton }[] = []
  private floatOff:  number
  private _dragging = false

  constructor(opts: WinOptions) {
    this.W = opts.width  ?? 1.6
    this.H = opts.height ?? 1.1
    this.floatOff = Math.random() * Math.PI * 2
    this.group = new THREE.Group()
    this.group.position.copy(opts.position ?? new THREE.Vector3(0, 0, -2.5))
    this.build(opts.title, opts.content ?? { buttons: [] })
  }

  private build(title: string, content: WinContent): void {
    const { W, H, D } = this

    // Тело окна — depthWrite: true чтобы руки правильно перекрывались
    this.bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W, H, D),
      new THREE.MeshPhysicalMaterial({
        color: C.bg, transparent: true, opacity: C.alpha,
        depthWrite: true, roughness: 0.12,
      })
    )
    this.group.add(this.bodyMesh)

    // Тайтлбар
    const titleBar = new THREE.Mesh(
      new THREE.BoxGeometry(W, TITLE_BAR_H, D + 0.002),
      new THREE.MeshPhysicalMaterial({
        color: C.title, transparent: true, opacity: 0.97, depthWrite: true,
      })
    )
    titleBar.position.set(0, H/2 - TITLE_BAR_H/2, 0.001)
    this.group.add(titleBar)

    // Accent линия
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.003, D + 0.004),
      new THREE.MeshBasicMaterial({ color: C.accent })
    )
    accent.position.set(0, H/2 - TITLE_BAR_H, 0.002)
    this.group.add(accent)

    // Traffic lights
    for (const { color, x } of [
      { color: C.btnClose, x: -W/2 + 0.07 },
      { color: C.btnMin,   x: -W/2 + 0.15 },
      { color: C.btnMax,   x: -W/2 + 0.23 },
    ]) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.021, 16),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      )
      dot.position.set(x, H/2 - TITLE_BAR_H/2, D/2 + 0.005)
      this.group.add(dot)
    }

    // Drag bar
    this.dragBar = new THREE.Mesh(
      new THREE.BoxGeometry(W, DRAG_BAR_H, D + 0.004),
      new THREE.MeshPhysicalMaterial({
        color: C.dragBar, transparent: true, opacity: 0.92, depthWrite: true, roughness: 0.3,
      })
    )
    this.dragBar.position.set(0, -H/2 + DRAG_BAR_H/2, 0.001)
    this.group.add(this.dragBar)

    // Grip штрихи
    for (let i = -3; i <= 3; i++) {
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.007, 0.003),
        new THREE.MeshBasicMaterial({ color: 0x4b5563, transparent: true, opacity: 0.8 })
      )
      g.position.set(i * 0.09, -H/2 + DRAG_BAR_H/2, D/2 + 0.003)
      this.group.add(g)
    }

    // Glow drag bar
    this.dragGlow = new THREE.Mesh(
      new THREE.BoxGeometry(W, DRAG_BAR_H + 0.01, D + 0.008),
      new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0 })
    )
    this.dragGlow.position.set(0, -H/2 + DRAG_BAR_H/2, 0.002)
    this.group.add(this.dragGlow)

    // Рамка
    this.border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.005, H + 0.005, D + 0.002)),
      new THREE.LineBasicMaterial({ color: C.border, transparent: true, opacity: 0.65 })
    )
    this.group.add(this.border)

    // Кнопки контента
    const btns = content.buttons
    const cols = btns.length <= 1 ? 1 : 2
    const contentTop = H/2 - TITLE_BAR_H - 0.10
    const contentBot = -H/2 + DRAG_BAR_H + 0.06
    const contentH   = contentTop - contentBot
    const rows = Math.ceil(btns.length / cols)
    const btnW = cols === 1 ? W * 0.74 : W * 0.43
    const btnH = Math.min(0.175, contentH / rows - 0.055)

    btns.forEach((btn, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = cols === 1 ? 0 : (col === 0 ? -(W * 0.43 / 2 + 0.03) : (W * 0.43 / 2 + 0.03))
      const y = contentTop - row * (btnH + 0.055) - btnH / 2

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(btnW, btnH, 0.022),
        new THREE.MeshPhysicalMaterial({
          color: btn.color ?? C.accent,
          transparent: true, opacity: 0.88,
          depthWrite: true,
          roughness: 0.15,
          emissive: btn.color ?? C.accent, emissiveIntensity: 0.06,
        })
      )
      mesh.position.set(x, y, D/2 + 0.013)
      mesh.userData = { btn }
      this.group.add(mesh)
      this.buttons3d.push({ mesh, btn })
    })
  }

  hitDragBar(worldPt: THREE.Vector3): boolean {
    this.group.updateWorldMatrix(true, false)
    const local = this.group.worldToLocal(worldPt.clone())
    return (
      Math.abs(local.x) < this.W/2 + 0.05 &&
      local.y > -this.H/2 - 0.04 &&
      local.y < -this.H/2 + DRAG_BAR_H + 0.04 &&
      Math.abs(local.z) < 0.15
    )
  }

  hitButton(worldPt: THREE.Vector3): WinButton | null {
    this.group.updateWorldMatrix(true, false)
    for (const { mesh, btn } of this.buttons3d) {
      mesh.updateWorldMatrix(true, false)
      const local = mesh.worldToLocal(worldPt.clone())
      const p = (mesh.geometry as THREE.BoxGeometry).parameters
      if (
        Math.abs(local.x) < p.width  / 2 + 0.04 &&
        Math.abs(local.y) < p.height / 2 + 0.04 &&
        Math.abs(local.z) < 0.12
      ) return btn
    }
    return null
  }

  /** Получить Z плоскости окна в мировых координатах */
  getWorldZ(): number {
    const wp = new THREE.Vector3()
    this.group.getWorldPosition(wp)
    return wp.z
  }

  /** Палец находится ПЕРЕД окном (ближе к камере) */
  isFingerInFront(fingerWorld: THREE.Vector3): boolean {
    // Больший Z = ближе к камере (камера смотрит в -Z)
    return fingerWorld.z > this.getWorldZ()
  }

  setDragHighlight(on: boolean): void {
    ;(this.dragGlow.material  as THREE.MeshBasicMaterial).opacity   = on ? 0.12 : 0
    ;(this.dragBar.material   as THREE.MeshPhysicalMaterial).color.setHex(on ? C.dragBarHov : C.dragBar)
  }

  setButtonHovered(btn: WinButton | null): void {
    for (const { mesh, btn: b } of this.buttons3d) {
      const m = mesh.material as THREE.MeshPhysicalMaterial
      m.emissiveIntensity = b === btn ? 0.35 : 0.06
      m.opacity           = b === btn ? 1.00 : 0.88
    }
  }

  pressButton(btn: WinButton): void {
    for (const { mesh, btn: b } of this.buttons3d) {
      if (b !== btn) continue
      mesh.scale.setScalar(0.92)
      setTimeout(() => mesh.scale.setScalar(1), 180)
      btn.onClick?.()
    }
  }

  get dragging() { return this._dragging }
  set dragging(v: boolean) {
    this._dragging = v
    const m = this.border.material as THREE.LineBasicMaterial
    m.color.setHex(v ? C.accent : C.border)
    m.opacity = v ? 1.0 : 0.65
  }

  update(t: number): void {
    if (this._dragging) return
    // Лёгкое парение
    this.bodyMesh.position.y = Math.sin(t * 0.55 + this.floatOff) * 0.006
  }

  addTo(scene: THREE.Scene):    void { scene.add(this.group) }
  removeFrom(scene: THREE.Scene):void { scene.remove(this.group) }
}

// ─── WindowManager ─────────────────────────────────────────────────────────────

interface DragState {
  win:       XRWindow
  handIdx:   number
  winPlaneZ: number
  offsetX:   number
  offsetY:   number
}

export class WindowManager {
  private wins:  XRWindow[] = []
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private stereoCamera: THREE.PerspectiveCamera | null = null
  private drag:  DragState | null = null
  private cooldown = 0

  private raycaster = new THREE.Raycaster()
  private dragPlane = new THREE.Plane()

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene  = scene
    this.camera = camera
  }

  setStereoCamera(cam: THREE.PerspectiveCamera | null): void {
    this.stereoCamera = cam
  }

  add(win: XRWindow):    void { this.wins.push(win); win.addTo(this.scene) }
  remove(win: XRWindow): void { this.wins = this.wins.filter(w => w !== win); win.removeFrom(this.scene) }

  private ndcToPlane(ndcX: number, ndcY: number, planeZ: number): THREE.Vector3 | null {
    const cam = this.stereoCamera ?? this.camera
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam)
    this.dragPlane.set(new THREE.Vector3(0, 0, 1), -planeZ)
    const target = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.dragPlane, target) ? target : null
  }

  /** Мировая позиция пальца по NDC */
  private fingerWorldPos(ndcX: number, ndcY: number, planeZ: number): THREE.Vector3 | null {
    return this.ndcToPlane(ndcX, ndcY, planeZ)
  }

  update(
    time: number,
    gestures: (GestureResult | null)[],
    fingerNDC: ({ ndcX: number; ndcY: number } | null)[]
  ): void {
    this.cooldown = Math.max(0, this.cooldown - 1)
    this.wins.forEach(w => w.update(time))

    for (let hi = 0; hi < 2; hi++) {
      const g   = gestures[hi]
      const ndc = fingerNDC[hi]
      if (!ndc) continue

      const isPinching = g && g.type === 'pinch' && g.pinchStrength > 0.72

      // Начало drag
      if (!this.drag && isPinching && this.cooldown === 0) {
        for (const win of [...this.wins].reverse()) {
          const planeZ  = win.getWorldZ()
          const worldPt = this.ndcToPlane(ndc.ndcX, ndc.ndcY, planeZ)
          if (!worldPt) continue
          if (win.hitDragBar(worldPt)) {
            const winPos = new THREE.Vector3()
            win.group.getWorldPosition(winPos)
            this.drag = {
              win, handIdx: hi, winPlaneZ: planeZ,
              offsetX: winPos.x - worldPt.x,
              offsetY: winPos.y - worldPt.y,
            }
            win.dragging = true
            break
          }
        }
      }

      // Продолжение drag
      if (this.drag && this.drag.handIdx === hi) {
        if (g && g.pinchStrength > 0.38) {
          const pt = this.ndcToPlane(ndc.ndcX, ndc.ndcY, this.drag.winPlaneZ)
          if (pt) {
            const target = new THREE.Vector3(
              pt.x + this.drag.offsetX,
              pt.y + this.drag.offsetY,
              this.drag.winPlaneZ
            )
            this.drag.win.group.position.lerp(target, 0.3)
          }
        } else {
          this.drag.win.dragging = false
          this.drag = null
          this.cooldown = 18
        }
      }
    }

    // Hover и нажатия
    for (const win of this.wins) {
      if (win.dragging) continue
      let dragHov = false
      let hovBtn: WinButton | null = null

      for (let hi = 0; hi < 2; hi++) {
        const g   = gestures[hi]
        const ndc = fingerNDC[hi]
        if (!ndc) continue

        const planeZ  = win.getWorldZ()
        const worldPt = this.fingerWorldPos(ndc.ndcX, ndc.ndcY, planeZ)
        if (!worldPt) continue

        if (win.hitDragBar(worldPt)) dragHov = true

        const btn = win.hitButton(worldPt)
        if (btn) {
          hovBtn = btn
          // Кнопка срабатывает только если палец ПЕРЕД окном (ближе к камере)
          const fingerInFront = win.isFingerInFront(worldPt)
          if (fingerInFront && g && g.pinchStrength > 0.82 && this.cooldown === 0) {
            win.pressButton(btn)
            this.cooldown = 22
          }
        }
      }

      win.setDragHighlight(dragHov)
      win.setButtonHovered(hovBtn)
    }
  }

  getWindows(): XRWindow[] { return this.wins }
}
