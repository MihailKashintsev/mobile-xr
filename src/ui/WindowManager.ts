/**
 * WindowManager — менеджер окон в мировом пространстве
 *
 * Окна закреплены в 3D пространстве (не следуют за камерой).
 * Перемещение: ущипнуть полосу снизу окна → тащить.
 * Каждое окно — самостоятельный Three.js объект в scene (не child камеры).
 */

import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

// ─── Константы ────────────────────────────────────────────────────────────────

const DRAG_BAR_HEIGHT  = 0.10   // высота полосы захвата
const TITLE_BAR_HEIGHT = 0.13   // высота заголовка
const DRAG_THRESHOLD   = 0.04   // минимальное расстояние пальцев для pinch

// Цвета темы
const THEME = {
  windowBg:     0x0d1117,
  titleBar:     0x161b22,
  border:       0x30363d,
  dragBar:      0x1a1f26,
  dragBarHover: 0x2d333b,
  accent:       0x6366f1,
  accentHover:  0x818cf8,
  text:         0xe6edf3,
  textMuted:    0x8b949e,
  btnClose:     0xff5f56,
  btnMin:       0xffbd2e,
  btnMax:       0x27c93f,
  glassAlpha:   0.88,
}

// ─── Интерфейсы ──────────────────────────────────────────────────────────────

export interface WindowContent {
  type: 'buttons' | 'text' | 'grid'
  buttons?: WindowButton[]
  text?: string
}

export interface WindowButton {
  label: string
  icon?: string
  color?: number
  onClick?: () => void
}

export interface WindowOptions {
  title: string
  icon?: string
  width?: number
  height?: number
  position?: THREE.Vector3
  content?: WindowContent
  closable?: boolean
}

// ─── XRWindow ─────────────────────────────────────────────────────────────────

export class XRWindow {
  group: THREE.Group
  private opts: Required<WindowOptions>
  private bodyMesh!: THREE.Mesh
  private titleBarMesh!: THREE.Mesh
  private dragBarMesh!: THREE.Mesh
  private borderMesh!: THREE.LineSegments
  private buttons3d: { mesh: THREE.Mesh; btn: WindowButton }[] = []
  private dragBarHighlight: THREE.Mesh
  private floatPhase: number
  private _isDragging = false
  private _isMinimized = false
  private originalHeight: number

  constructor(opts: WindowOptions) {
    this.opts = {
      title: opts.title,
      icon: opts.icon ?? '🪟',
      width: opts.width ?? 1.6,
      height: opts.height ?? 1.1,
      position: opts.position ?? new THREE.Vector3(0, 0, -2.5),
      content: opts.content ?? { type: 'buttons', buttons: [] },
      closable: opts.closable ?? true,
    }
    this.originalHeight = this.opts.height
    this.floatPhase = Math.random() * Math.PI * 2
    this.group = new THREE.Group()
    this.group.position.copy(this.opts.position)

    // Placeholder (будет заменён в build)
    this.dragBarHighlight = new THREE.Mesh()

    this.build()
  }

  // ─── Построение геометрии ─────────────────────────────────────────────────

  private build(): void {
    // Очищаем группу
    while (this.group.children.length) this.group.remove(this.group.children[0])
    this.buttons3d = []

    const W = this.opts.width
    const H = this.opts.height
    const D = 0.018  // толщина

    // ── Основное тело окна ─────────────────────────────────────────────────
    this.bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W, H, D),
      new THREE.MeshPhysicalMaterial({
        color: THEME.windowBg,
        transparent: true,
        opacity: THEME.glassAlpha,
        roughness: 0.1,
        metalness: 0.0,
      })
    )
    this.group.add(this.bodyMesh)

    // ── Тайтлбар ──────────────────────────────────────────────────────────
    this.titleBarMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W, TITLE_BAR_HEIGHT, D + 0.002),
      new THREE.MeshPhysicalMaterial({
        color: THEME.titleBar,
        transparent: true,
        opacity: 0.95,
        roughness: 0.2,
      })
    )
    this.titleBarMesh.position.set(0, H / 2 - TITLE_BAR_HEIGHT / 2, 0.001)
    this.group.add(this.titleBarMesh)

    // Accent линия под тайтлбаром
    const accentLine = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.003, D + 0.004),
      new THREE.MeshBasicMaterial({ color: THEME.accent })
    )
    accentLine.position.set(0, H / 2 - TITLE_BAR_HEIGHT, 0.002)
    this.group.add(accentLine)

    // ── Traffic-light кнопки (close/min/max) ──────────────────────────────
    if (this.opts.closable) {
      const dots = [
        { color: THEME.btnClose, x: -W / 2 + 0.08 },
        { color: THEME.btnMin,   x: -W / 2 + 0.16 },
        { color: THEME.btnMax,   x: -W / 2 + 0.24 },
      ]
      for (const d of dots) {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.022, 16),
          new THREE.MeshBasicMaterial({ color: d.color, side: THREE.DoubleSide })
        )
        dot.position.set(d.x, H / 2 - TITLE_BAR_HEIGHT / 2, D / 2 + 0.005)
        this.group.add(dot)
      }
    }

    // ── Полоса захвата (drag bar) — снизу ──────────────────────────────────
    this.dragBarMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W, DRAG_BAR_HEIGHT, D + 0.004),
      new THREE.MeshPhysicalMaterial({
        color: THEME.dragBar,
        transparent: true,
        opacity: 0.9,
        roughness: 0.3,
      })
    )
    this.dragBarMesh.position.set(0, -H / 2 + DRAG_BAR_HEIGHT / 2, 0.001)
    this.group.add(this.dragBarMesh)

    // Grip-черточки на полосе
    for (let i = -2; i <= 2; i++) {
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.008, 0.002),
        new THREE.MeshBasicMaterial({ color: THEME.border, transparent: true, opacity: 0.8 })
      )
      grip.position.set(i * 0.1, -H / 2 + DRAG_BAR_HEIGHT / 2, D / 2 + 0.003)
      this.group.add(grip)
    }

    // Иконка "хватай" (⠿)
    // (делаем просто ещё одну горизонталь немного выше)
    const gripIcon = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.006, 0.002),
      new THREE.MeshBasicMaterial({ color: THEME.accentHover, transparent: true, opacity: 0.6 })
    )
    gripIcon.position.set(0, -H / 2 + DRAG_BAR_HEIGHT / 2 + 0.02, D / 2 + 0.004)
    this.group.add(gripIcon)

    // Подсветка drag bar при ховере (изначально невидима)
    this.dragBarHighlight = new THREE.Mesh(
      new THREE.BoxGeometry(W, DRAG_BAR_HEIGHT, D + 0.006),
      new THREE.MeshBasicMaterial({
        color: THEME.accent,
        transparent: true,
        opacity: 0,
      })
    )
    this.dragBarHighlight.position.set(0, -H / 2 + DRAG_BAR_HEIGHT / 2, 0.002)
    this.group.add(this.dragBarHighlight)

    // ── Рамка ──────────────────────────────────────────────────────────────
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.004, H + 0.004, D + 0.002))
    this.borderMesh = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: THEME.border, transparent: true, opacity: 0.7 })
    )
    this.group.add(this.borderMesh)

    // ── Контент ────────────────────────────────────────────────────────────
    if (this.opts.content.type === 'buttons' && this.opts.content.buttons) {
      this.buildButtons(this.opts.content.buttons, W, H)
    }
  }

  private buildButtons(btns: WindowButton[], W: number, H: number): void {
    const contentH = H - TITLE_BAR_HEIGHT - DRAG_BAR_HEIGHT
    const startY   = H / 2 - TITLE_BAR_HEIGHT - 0.12
    const cols     = btns.length <= 2 ? btns.length : 2
    const rows     = Math.ceil(btns.length / cols)
    const btnW     = cols === 1 ? W * 0.75 : W * 0.42
    const btnH     = Math.min(0.18, (contentH - 0.1) / rows - 0.05)

    btns.forEach((btn, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = cols === 1 ? 0 : (col === 0 ? -W * 0.24 : W * 0.24)
      const y = startY - row * (btnH + 0.06) - btnH / 2

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(btnW, btnH, 0.022),
        new THREE.MeshPhysicalMaterial({
          color: btn.color ?? THEME.accent,
          transparent: true,
          opacity: 0.9,
          roughness: 0.15,
          emissive: btn.color ?? THEME.accent,
          emissiveIntensity: 0.08,
        })
      )
      mesh.position.set(x, y, 0.014)
      mesh.userData = { button: btn, baseColor: btn.color ?? THEME.accent }
      this.group.add(mesh)
      this.buttons3d.push({ mesh, btn })
    })
  }

  // ─── Публичные методы ─────────────────────────────────────────────────────

  setContent(content: WindowContent): void {
    this.opts.content = content
    this.build()
  }

  /** Проверить попадание точки в drag bar */
  hitDragBar(worldPoint: THREE.Vector3): boolean {
    const local = this.dragBarMesh.worldToLocal(worldPoint.clone())
    const W = this.opts.width
    return (
      Math.abs(local.x) < W / 2 + 0.05 &&
      Math.abs(local.y) < DRAG_BAR_HEIGHT / 2 + 0.04 &&
      Math.abs(local.z) < 0.12
    )
  }

  /** Проверить попадание в кнопку */
  hitButton(worldPoint: THREE.Vector3): WindowButton | null {
    for (const { mesh, btn } of this.buttons3d) {
      const local = mesh.worldToLocal(worldPoint.clone())
      const geo = mesh.geometry as THREE.BoxGeometry
      const p = geo.parameters
      if (
        Math.abs(local.x) < p.width / 2 + 0.04 &&
        Math.abs(local.y) < p.height / 2 + 0.04 &&
        Math.abs(local.z) < 0.1
      ) return btn
    }
    return null
  }

  setDragBarHovered(v: boolean): void {
    const mat = this.dragBarHighlight.material as THREE.MeshBasicMaterial
    mat.opacity = v ? 0.15 : 0
    const barMat = this.dragBarMesh.material as THREE.MeshPhysicalMaterial
    barMat.color.setHex(v ? THEME.dragBarHover : THEME.dragBar)
  }

  setButtonHovered(btn: WindowButton | null): void {
    for (const { mesh, btn: b } of this.buttons3d) {
      const mat = mesh.material as THREE.MeshPhysicalMaterial
      const isHov = b === btn
      mat.emissiveIntensity = isHov ? 0.35 : 0.08
      mat.opacity = isHov ? 1.0 : 0.9
    }
  }

  pressButton(btn: WindowButton): void {
    for (const { mesh, btn: b } of this.buttons3d) {
      if (b !== btn) continue
      const mat = mesh.material as THREE.MeshPhysicalMaterial
      mat.emissiveIntensity = 1.0
      mesh.scale.setScalar(0.93)
      setTimeout(() => {
        mat.emissiveIntensity = 0.08
        mesh.scale.setScalar(1.0)
      }, 180)
      btn.onClick?.()
    }
  }

  get isDragging() { return this._isDragging }
  set isDragging(v: boolean) {
    this._isDragging = v
    const borderMat = this.borderMesh.material as THREE.LineBasicMaterial
    borderMat.color.setHex(v ? THEME.accent : THEME.border)
    borderMat.opacity = v ? 1.0 : 0.7
  }

  update(time: number): void {
    if (!this._isDragging) {
      // Лёгкое парение
      const floatY = Math.sin(time * 0.6 + this.floatPhase) * 0.008
      this.bodyMesh.position.y = floatY
      this.titleBarMesh.position.y = this.opts.height / 2 - TITLE_BAR_HEIGHT / 2 + floatY
    }
  }

  addToScene(scene: THREE.Scene): void { scene.add(this.group) }
  removeFromScene(scene: THREE.Scene): void { scene.remove(this.group) }
}

// ─── WindowManager ────────────────────────────────────────────────────────────

interface DragState {
  window: XRWindow
  handIndex: number      // 0 = left, 1 = right
  offset: THREE.Vector3  // смещение от центра окна до точки захвата
  startWinPos: THREE.Vector3
  startPinchPos: THREE.Vector3
}

export class WindowManager {
  private windows: XRWindow[] = []
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private dragState: DragState | null = null
  private pinchCooldown = 0   // предотвращаем дублирование нажатий

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene
    this.camera = camera
  }

  addWindow(win: XRWindow): void {
    this.windows.push(win)
    win.addToScene(this.scene)
  }

  removeWindow(win: XRWindow): void {
    this.windows = this.windows.filter(w => w !== win)
    win.removeFromScene(this.scene)
  }

  /**
   * Вызывается каждый кадр со всеми данными рук
   * hands[0] = левая, hands[1] = правая (или undefined)
   */
  update(
    time: number,
    gestures: (GestureResult | null)[],
    indexTips: (THREE.Vector3 | null)[]
  ): void {
    this.pinchCooldown = Math.max(0, this.pinchCooldown - 1)
    this.windows.forEach(w => w.update(time))

    // ── Обработка drag ──────────────────────────────────────────────────────
    for (let hi = 0; hi < 2; hi++) {
      const g = gestures[hi]
      const tip = indexTips[hi]
      if (!g || !tip) continue

      // Начало drag
      if (!this.dragState && g.type === 'pinch' && g.pinchStrength > 0.75 && this.pinchCooldown === 0) {
        // Ищем окно с drag bar под пальцем
        for (const win of [...this.windows].reverse()) {
          if (win.hitDragBar(tip)) {
            this.dragState = {
              window: win,
              handIndex: hi,
              offset: tip.clone().sub(win.group.position),
              startWinPos: win.group.position.clone(),
              startPinchPos: tip.clone(),
            }
            win.isDragging = true
            win.setDragBarHovered(false)
            break
          }
        }
      }

      // Продолжение drag
      if (this.dragState && this.dragState.handIndex === hi) {
        if (g.type === 'pinch' && g.pinchStrength > 0.4) {
          // Двигаем окно
          const newPos = tip.clone().sub(this.dragState.offset)
          // Ограничиваем Z чтобы не улетело
          newPos.z = THREE.MathUtils.clamp(newPos.z, -5, -1)
          this.dragState.window.group.position.lerp(newPos, 0.25)
        } else {
          // Отпустили
          this.dragState.window.isDragging = false
          this.dragState = null
          this.pinchCooldown = 15
        }
      }
    }

    // ── Ховер и нажатия ─────────────────────────────────────────────────────
    for (const win of this.windows) {
      if (win.isDragging) continue

      let dragBarHovered = false
      let hoveredBtn: WindowButton | null = null

      for (let hi = 0; hi < 2; hi++) {
        const g = gestures[hi]
        const tip = indexTips[hi]
        if (!tip) continue

        if (win.hitDragBar(tip)) {
          dragBarHovered = true
        }

        const btn = win.hitButton(tip)
        if (btn) {
          hoveredBtn = btn
          // Нажатие: pinch + cooldown
          if (g && g.type === 'pinch' && g.pinchStrength > 0.8 && this.pinchCooldown === 0) {
            win.pressButton(btn)
            this.pinchCooldown = 20
          }
        }
      }

      win.setDragBarHovered(dragBarHovered)
      win.setButtonHovered(hoveredBtn)
    }
  }

  getWindows(): XRWindow[] { return this.windows }
}
