/**
 * TaskBar3D v3 — постоянная 3D панель задач
 *
 * ФИКСЫ:
 * - hitTest: теперь использует РЕАЛЬНЫЙ 3D finger world point (не NDC ray)
 * - Увеличенная зона нажатия: ±8cm вместо ±6cm
 * - setHovered: визуальная подсветка при приближении пальца
 * - Анимация нажатия: кнопка "проваливается"
 * - Drag: панель следует за камерой через lerp (не прыгает)
 */
import * as THREE from 'three'

export interface TaskBarButton {
  icon:    string
  label:   string
  onClick: () => void
  active?: boolean
}

function makeIconTexture(icon: string, label: string, active: boolean, hovered: boolean): THREE.CanvasTexture {
  const W=160, H=128
  const c = document.createElement('canvas'); c.width=W; c.height=H
  const ctx = c.getContext('2d')!

  // Background
  const bg = active ? 0x312e81 : hovered ? 0x1e2a4a : 0x111827
  ctx.fillStyle = `#${bg.toString(16).padStart(6,'0')}`
  ctx.beginPath(); ctx.roundRect(3,3,W-6,H-6,14); ctx.fill()

  if (hovered || active) {
    const g = ctx.createLinearGradient(0,0,0,H*0.5)
    g.addColorStop(0, 'rgba(255,255,255,.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(3,3,W-6,H/2,14); ctx.fill()
  }

  // Border
  if (active) {
    ctx.strokeStyle='rgba(99,102,241,.8)'; ctx.lineWidth=2
    ctx.beginPath(); ctx.roundRect(2,2,W-4,H-4,14); ctx.stroke()
  }

  // Icon
  ctx.font=`${Math.round(H*0.46)}px serif`
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(icon, W/2, H*0.43)

  // Label
  ctx.fillStyle = active ? '#a5b4fc' : 'rgba(200,210,230,.85)'
  ctx.font=`500 ${Math.round(H*0.175)}px -apple-system,sans-serif`
  ctx.fillText(label, W/2, H*0.83, W-12)

  const t = new THREE.CanvasTexture(c); t.needsUpdate=true; return t
}

export class TaskBar3D {
  group: THREE.Group
  private btnGroups: THREE.Group[] = []
  private btnDefs:   TaskBarButton[] = []
  private hoveredBtn: TaskBarButton | null = null
  private clock = 0
  private targetPos = new THREE.Vector3()

  constructor() {
    this.group = new THREE.Group()
  }

  setButtons(btns: TaskBarButton[]): void {
    this.btnDefs = btns; this.rebuild()
  }

  private rebuild(): void {
    this.group.clear(); this.btnGroups = []

    const n=this.btnDefs.length, GAP=0.14, W=0.11, H=0.11, D=0.018
    const totalW = n*W + (n-1)*GAP

    // Panel background
    const panelMat = new THREE.MeshPhysicalMaterial({
      color:0x080e1c, transparent:true, opacity:0.88, roughness:0.1, metalness:0.25
    })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(totalW+0.08, H+0.07, D*0.5), panelMat)
    this.group.add(panel)

    // Accent stripe top
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(totalW+0.08, 0.004, D*0.5),
      new THREE.MeshBasicMaterial({color:0x6366f1})
    )
    stripe.position.y = (H+0.07)/2; this.group.add(stripe)

    // Buttons
    for (let i=0; i<n; i++) {
      const btn = this.btnDefs[i]
      const bg  = new THREE.Group()
      bg.position.x = -totalW/2 + i*(W+GAP) + W/2

      const isHov = this.hoveredBtn === btn
      const btnMat = new THREE.MeshPhysicalMaterial({
        color:      btn.active ? 0x312e81 : isHov ? 0x1e2a4a : 0x111827,
        transparent:true, opacity:0.92,
        roughness:  0.15, metalness:0.1,
        emissive:   new THREE.Color(btn.active ? 0x4338ca : isHov ? 0x1e3a5f : 0x000000),
        emissiveIntensity: btn.active ? 0.4 : isHov ? 0.2 : 0,
      })
      const btnMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), btnMat)
      bg.add(btnMesh)

      const iconPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(W*0.88, H*0.88),
        new THREE.MeshBasicMaterial({
          map: makeIconTexture(btn.icon, btn.label, btn.active??false, isHov),
          transparent:true, depthWrite:false
        })
      )
      iconPlane.position.z = D/2 + 0.003; bg.add(iconPlane)

      // Active border
      if (btn.active) {
        const border = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(W+0.008, H+0.008, D+0.003)),
          new THREE.LineBasicMaterial({color:0x6366f1, transparent:true, opacity:0.8})
        )
        bg.add(border)
      }

      bg.userData = { btn, btnMesh, iconPlane }
      this.btnGroups.push(bg)
      this.group.add(bg)
    }
  }

  /** Hit-test через реальный 3D world point пальца */
  hitTest(fingerWorld: THREE.Vector3): TaskBarButton | null {
    for (const bg of this.btnGroups) {
      bg.updateWorldMatrix(true, false)
      const local = bg.worldToLocal(fingerWorld.clone())
      // Зона ±8cm X/Y, ±12cm Z
      if (Math.abs(local.x) < 0.08 && Math.abs(local.y) < 0.08 && Math.abs(local.z) < 0.12) {
        return bg.userData.btn as TaskBarButton
      }
    }
    return null
  }

  /** Обновить hover визуал */
  setHovered(btn: TaskBarButton | null): void {
    if (btn === this.hoveredBtn) return
    this.hoveredBtn = btn
    this.rebuild()
  }

  setActive(icon: string, active: boolean): void {
    const b = this.btnDefs.find(b=>b.icon===icon)
    if (b && b.active!==active) { b.active=active; this.rebuild() }
  }

  /** Анимация нажатия — кнопка проваливается */
  pressAnimation(btn: TaskBarButton): void {
    const bg = this.btnGroups.find(g=>g.userData.btn===btn)
    if (!bg) return
    const origZ = bg.position.z
    bg.position.z -= 0.012
    setTimeout(()=>{ bg.position.z=origZ }, 150)
  }

  update(time: number, camera: THREE.PerspectiveCamera): void {
    this.clock = time

    // Целевая позиция — внизу FOV камеры
    const offset = new THREE.Vector3(0, -0.33, -0.66)
    offset.applyQuaternion(camera.quaternion)
    this.targetPos.copy(camera.position).add(offset)

    // Lerp для плавности (убирает дрожание)
    this.group.position.lerp(this.targetPos, 0.12)
    this.group.quaternion.slerp(camera.quaternion, 0.12)

    // Пульсация accent stripe
    const stripe = this.group.children[1] as THREE.Mesh
    if (stripe?.material) {
      (stripe.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time*1.8)*0.4
    }
  }

  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
