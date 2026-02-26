/**
 * XRWindow — настоящие 3D окна
 *
 * Каждое окно = набор Box-мешей с глубиной + Canvas2D-текстуры для текста.
 * Кнопки — выступающие 3D-объекты с тенью и hover-свечением.
 * Рамка и угловые скосы создают ощущение физической панели.
 */

import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

const DB = 0.022    // базовая глубина панели
const TH = 0.14     // высота заголовка
const BRH = 0.10    // высота drag-bar

// ─── Canvas-текстура ─────────────────────────────────────────────────────────

function makeTextTexture(
  text: string,
  opts: { w?: number; h?: number; fg?: string; bg?: string; font?: string; align?: CanvasTextAlign }
): THREE.CanvasTexture {
  const W = opts.w ?? 512, H = opts.h ?? 128
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, W, H) }
  ctx.fillStyle = opts.fg ?? '#ffffff'
  ctx.font = opts.font ?? `bold ${Math.round(H * 0.52)}px -apple-system, sans-serif`
  ctx.textAlign   = opts.align ?? 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, W / 2, H / 2, W - 20)
  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

function makeButtonTexture(label: string, color: number, hovered: boolean): THREE.CanvasTexture {
  const W = 512, H = 128
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!

  // Фон с rounded rect
  const r = 22
  const bg = hovered
    ? `#${(Math.min(color + 0x303030, 0xffffff)).toString(16).padStart(6, '0')}`
    : `#${color.toString(16).padStart(6, '0')}`

  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(4, 4, W - 8, H - 8, r)
  ctx.fill()

  // Highlight верхний край
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(255,255,255,0.18)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(4, 4, W - 8, H - 8, r)
  ctx.fill()

  // Текст
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = `600 ${Math.round(H * 0.44)}px -apple-system, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, W / 2, H / 2, W - 32)

  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

// ─── Цвета и константы ───────────────────────────────────────────────────────

const C = {
  panelBg:   0x0d1420,
  titleBg:   0x131c2e,
  dragBg:    0x0f1726,
  border:    0x2a3a52,
  accent:    0x6366f1,
  glowAlpha: 0.15,
}

// ─── Интерфейсы ──────────────────────────────────────────────────────────────

export interface WinButton { label: string; color?: number; onClick?: () => void }
export interface WinContent { buttons: WinButton[] }
export interface WinOptions {
  title: string; icon?: string; width?: number; height?: number
  position?: THREE.Vector3; content?: WinContent
}

// ─── XRWindow ─────────────────────────────────────────────────────────────────

export class XRWindow {
  group: THREE.Group
  private W: number
  private H: number

  private panel!:   THREE.Mesh
  private dragBar!: THREE.Mesh
  private border!:  THREE.LineSegments
  private glow!:    THREE.Mesh

  private btnMeshes: { mesh: THREE.Mesh; btn: WinButton; tex: THREE.CanvasTexture }[] = []
  private floatBase: number
  private _dragging = false

  constructor(opts: WinOptions) {
    this.W = opts.width  ?? 1.60
    this.H = opts.height ?? 1.10
    this.floatBase = Math.random() * Math.PI * 2
    this.group = new THREE.Group()
    this.group.position.copy(opts.position ?? new THREE.Vector3(0, 0, -2.6))
    this.build(opts.title + (opts.icon ? '  ' + opts.icon : ''), opts.content ?? { buttons: [] })
  }

  private build(title: string, content: WinContent): void {
    const { W, H } = this
    const D = DB

    // ── Основная панель ──────────────────────────────────────────────────────
    const panelGeo = new THREE.BoxGeometry(W, H, D)
    this.panel = new THREE.Mesh(panelGeo, new THREE.MeshPhysicalMaterial({
      color: C.panelBg, transparent: true, opacity: 0.92,
      roughness: 0.08, metalness: 0.15,
      depthWrite: true,
    }))
    this.group.add(this.panel)

    // ── Тайтлбар (слой поверх) ───────────────────────────────────────────────
    const titleBarMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W, TH, D + 0.004),
      new THREE.MeshPhysicalMaterial({ color: C.titleBg, roughness: 0.06, metalness: 0.2, depthWrite: true })
    )
    titleBarMesh.position.set(0, H / 2 - TH / 2, 0.001)
    this.group.add(titleBarMesh)

    // Accent-линия под заголовком
    const accentLine = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.003, D + 0.006),
      new THREE.MeshBasicMaterial({ color: C.accent })
    )
    accentLine.position.set(0, H / 2 - TH, 0.003)
    this.group.add(accentLine)

    // Canvas-текст заголовка
    const titleTex = makeTextTexture(title, {
      w: 1024, h: 128,
      fg: 'rgba(240,244,255,0.95)',
      font: 'bold 56px -apple-system, Helvetica, sans-serif',
      align: 'center',
    })
    const titlePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.85, TH * 0.72),
      new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, depthWrite: false })
    )
    titlePlane.position.set(0, H / 2 - TH / 2, D / 2 + 0.005)
    this.group.add(titlePlane)

    // ── Traffic lights ───────────────────────────────────────────────────────
    const tlColors = [0xff5f56, 0xffbd2e, 0x27c93f]
    const tlX = -W / 2 + 0.065
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.020, 16, 12),
        new THREE.MeshPhysicalMaterial({
          color: tlColors[i], emissive: tlColors[i], emissiveIntensity: 0.4,
          roughness: 0.3, depthWrite: true,
        })
      )
      dot.position.set(tlX + i * 0.058, H / 2 - TH / 2, D / 2 + 0.012)
      this.group.add(dot)
    }

    // ── Drag bar ─────────────────────────────────────────────────────────────
    this.dragBar = new THREE.Mesh(
      new THREE.BoxGeometry(W, BRH, D + 0.004),
      new THREE.MeshPhysicalMaterial({ color: C.dragBg, roughness: 0.15, metalness: 0.1, depthWrite: true })
    )
    this.dragBar.position.set(0, -H / 2 + BRH / 2, 0.001)
    this.group.add(this.dragBar)

    // Grip точки
    for (let col = -3; col <= 3; col++) {
      for (let row = -1; row <= 1; row++) {
        const d = new THREE.Mesh(
          new THREE.SphereGeometry(0.007, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0x4a5568 })
        )
        d.position.set(col * 0.075, -H / 2 + BRH / 2 + row * 0.025, D / 2 + 0.008)
        this.group.add(d)
      }
    }

    // ── Glow при drag ────────────────────────────────────────────────────────
    this.glow = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.04, H + 0.04, D + 0.04),
      new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false })
    )
    this.group.add(this.glow)

    // ── Рамка — реальный 3D bevel ────────────────────────────────────────────
    this.border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.006, H + 0.006, D + 0.004)),
      new THREE.LineBasicMaterial({ color: C.border, transparent: true, opacity: 0.7 })
    )
    this.group.add(this.border)

    // Внутренняя рамка (второй слой — глубина)
    const innerBorder = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W - 0.010, H - 0.010, D * 0.5)),
      new THREE.LineBasicMaterial({ color: C.border, transparent: true, opacity: 0.25 })
    )
    this.group.add(innerBorder)

    // ── Кнопки ───────────────────────────────────────────────────────────────
    const btns = content.buttons
    const cols = btns.length <= 1 ? 1 : 2
    const pad  = 0.05
    const btnW = cols === 1 ? W - pad * 2 : (W - pad * 3) / 2
    const contentTop = H / 2 - TH - pad
    const contentBot = -H / 2 + BRH + pad
    const rows = Math.ceil(btns.length / cols)
    const gap  = 0.045
    const btnH = Math.min(0.18, (contentTop - contentBot - gap * (rows - 1)) / rows)

    btns.forEach((btn, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = cols === 1 ? 0 : col === 0 ? -(btnW / 2 + pad / 2) : (btnW / 2 + pad / 2)
      const y = contentTop - row * (btnH + gap) - btnH / 2

      const BD = 0.030   // кнопка выступает из панели
      const tex = makeButtonTexture(btn.label, btn.color ?? 0x6366f1, false)

      // Тело кнопки (выступающий блок)
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(btnW, btnH, BD),
        new THREE.MeshPhysicalMaterial({
          map: tex, transparent: true, opacity: 0.95,
          roughness: 0.12, metalness: 0.05,
          depthWrite: true,
        })
      )
      mesh.position.set(x, y, D / 2 + BD / 2)
      mesh.userData = { btn, texBase: tex }
      this.group.add(mesh)

      // Тень / bevel под кнопкой
      const shadow = new THREE.Mesh(
        new THREE.BoxGeometry(btnW + 0.012, btnH + 0.012, 0.006),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
      )
      shadow.position.set(x + 0.004, y - 0.006, D / 2 + 0.002)
      this.group.add(shadow)

      // Нижний bevel кнопки (тёмная грань)
      const bevel = new THREE.Mesh(
        new THREE.BoxGeometry(btnW, 0.008, BD),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(btn.color ?? 0x6366f1).multiplyScalar(0.4),
          transparent: true, opacity: 0.9, depthWrite: true,
        })
      )
      bevel.position.set(x, y - btnH / 2, D / 2 + BD / 2)
      this.group.add(bevel)

      this.btnMeshes.push({ mesh, btn, tex })
    })

    // ── Освещение панели ─────────────────────────────────────────────────────
    // Небольшой point light прямо перед панелью
    const pl = new THREE.PointLight(0x8090ff, 0.4, 1.5)
    pl.position.set(0, 0.2, 0.5)
    this.group.add(pl)
  }

  // ─── Hit-test ──────────────────────────────────────────────────────────────

  hitDragBar(worldPt: THREE.Vector3): boolean {
    this.group.updateWorldMatrix(true, false)
    const local = this.group.worldToLocal(worldPt.clone())
    return (
      Math.abs(local.x) < this.W / 2 + 0.06 &&
      local.y > -this.H / 2 - 0.05 &&
      local.y < -this.H / 2 + BRH + 0.05 &&
      Math.abs(local.z) < 0.18
    )
  }

  hitButton(worldPt: THREE.Vector3): WinButton | null {
    this.group.updateWorldMatrix(true, false)
    for (const { mesh, btn } of this.btnMeshes) {
      mesh.updateWorldMatrix(true, false)
      const local = mesh.worldToLocal(worldPt.clone())
      const p = (mesh.geometry as THREE.BoxGeometry).parameters
      if (
        Math.abs(local.x) < p.width  / 2 + 0.04 &&
        Math.abs(local.y) < p.height / 2 + 0.04 &&
        Math.abs(local.z) < 0.14
      ) return btn
    }
    return null
  }

  getWorldZ(): number {
    const wp = new THREE.Vector3()
    this.group.getWorldPosition(wp)
    return wp.z
  }

  isFingerInFront(fingerWorld: THREE.Vector3): boolean {
    return fingerWorld.z > this.getWorldZ()
  }

  // ─── Визуальные состояния ──────────────────────────────────────────────────

  setDragHighlight(on: boolean): void {
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity = on ? C.glowAlpha : 0
    ;(this.dragBar.material as THREE.MeshPhysicalMaterial).color.setHex(on ? 0x1a2840 : C.dragBg)
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(on ? C.accent : C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity = on ? 1 : 0.7
  }

  setButtonHovered(btn: WinButton | null): void {
    for (const b of this.btnMeshes) {
      const mat = b.mesh.material as THREE.MeshPhysicalMaterial
      const isHov = b.btn === btn
      if (isHov && !b.mesh.userData.wasHovered) {
        b.mesh.userData.wasHovered = true
        const hovTex = makeButtonTexture(b.btn.label, b.btn.color ?? 0x6366f1, true)
        mat.map?.dispose()
        mat.map = hovTex
        mat.needsUpdate = true
        b.mesh.scale.z = 1.3
        b.mesh.position.z += 0.003
      } else if (!isHov && b.mesh.userData.wasHovered) {
        b.mesh.userData.wasHovered = false
        const baseTex = makeButtonTexture(b.btn.label, b.btn.color ?? 0x6366f1, false)
        mat.map?.dispose()
        mat.map = baseTex
        mat.needsUpdate = true
        b.mesh.scale.z = 1
        b.mesh.position.z -= 0.003
      }
    }
  }

  pressButton(btn: WinButton): void {
    for (const b of this.btnMeshes) {
      if (b.btn !== btn) continue
      // Нажатие: утопить кнопку
      b.mesh.position.z -= 0.010
      b.mesh.scale.z = 0.7
      setTimeout(() => { b.mesh.position.z += 0.010; b.mesh.scale.z = 1 }, 150)
      btn.onClick?.()
    }
  }

  get dragging() { return this._dragging }
  set dragging(v: boolean) {
    this._dragging = v
    const lm = this.border.material as THREE.LineBasicMaterial
    lm.color.setHex(v ? C.accent : C.border)
    lm.opacity = v ? 1 : 0.7
  }

  update(t: number): void {
    if (this._dragging) return
    // Лёгкое парение
    this.group.position.y += (Math.sin(t * 0.55 + this.floatBase) * 0.006 - this.group.userData.floatY ?? 0) * 0.05
    this.group.userData.floatY = Math.sin(t * 0.55 + this.floatBase) * 0.006
  }

  addTo(scene: THREE.Scene): void    { scene.add(this.group) }
  removeFrom(scene: THREE.Scene): void { scene.remove(this.group) }
}

// ─── WindowManager ─────────────────────────────────────────────────────────────

interface DragState {
  win: XRWindow; handIdx: number; winPlaneZ: number; offsetX: number; offsetY: number
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
    this.scene = scene; this.camera = camera
  }

  setStereoCamera(cam: THREE.PerspectiveCamera | null): void { this.stereoCamera = cam }
  add(win: XRWindow):    void { this.wins.push(win); win.addTo(this.scene) }
  remove(win: XRWindow): void { this.wins = this.wins.filter(w => w !== win); win.removeFrom(this.scene) }

  private ndcToPlane(ndcX: number, ndcY: number, planeZ: number): THREE.Vector3 | null {
    const cam = this.stereoCamera ?? this.camera
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam)
    this.dragPlane.set(new THREE.Vector3(0, 0, 1), -planeZ)
    const t = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.dragPlane, t) ? t : null
  }

  update(time: number, gestures: (GestureResult | null)[], fingerNDC: ({ ndcX: number; ndcY: number } | null)[]): void {
    this.cooldown = Math.max(0, this.cooldown - 1)
    this.wins.forEach(w => w.update(time))

    for (let hi = 0; hi < 2; hi++) {
      const g = gestures[hi], ndc = fingerNDC[hi]
      if (!ndc) continue
      const isPinching = g && g.type === 'pinch' && g.pinchStrength > 0.72

      if (!this.drag && isPinching && this.cooldown === 0) {
        for (const win of [...this.wins].reverse()) {
          const planeZ = win.getWorldZ()
          const worldPt = this.ndcToPlane(ndc.ndcX, ndc.ndcY, planeZ)
          if (!worldPt) continue
          if (win.hitDragBar(worldPt)) {
            const wp = new THREE.Vector3(); win.group.getWorldPosition(wp)
            this.drag = { win, handIdx: hi, winPlaneZ: planeZ, offsetX: wp.x - worldPt.x, offsetY: wp.y - worldPt.y }
            win.dragging = true; break
          }
        }
      }

      if (this.drag && this.drag.handIdx === hi) {
        if (g && g.pinchStrength > 0.38) {
          const pt = this.ndcToPlane(ndc.ndcX, ndc.ndcY, this.drag.winPlaneZ)
          if (pt) this.drag.win.group.position.lerp(
            new THREE.Vector3(pt.x + this.drag.offsetX, pt.y + this.drag.offsetY, this.drag.winPlaneZ), 0.3
          )
        } else { this.drag.win.dragging = false; this.drag = null; this.cooldown = 18 }
      }
    }

    for (const win of this.wins) {
      if (win.dragging) continue
      let dragHov = false, hovBtn: WinButton | null = null
      for (let hi = 0; hi < 2; hi++) {
        const g = gestures[hi], ndc = fingerNDC[hi]
        if (!ndc) continue
        const worldPt = this.ndcToPlane(ndc.ndcX, ndc.ndcY, win.getWorldZ())
        if (!worldPt) continue
        if (win.hitDragBar(worldPt)) dragHov = true
        const btn = win.hitButton(worldPt)
        if (btn) {
          hovBtn = btn
          if (win.isFingerInFront(worldPt) && g && g.pinchStrength > 0.82 && this.cooldown === 0) {
            win.pressButton(btn); this.cooldown = 22
          }
        }
      }
      win.setDragHighlight(dragHov)
      win.setButtonHovered(hovBtn)
    }
  }

  getWindows(): XRWindow[] { return this.wins }
}
