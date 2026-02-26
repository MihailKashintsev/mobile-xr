/**
 * TaskBar3D — постоянная 3D панель задач
 *
 * Прикреплена к камере (всегда в поле зрения).
 * Нельзя закрыть. Кнопки запускают приложения.
 */
import * as THREE from 'three'

export interface TaskBarButton {
  icon: string
  label: string
  onClick: () => void
  active?: boolean
}

function makeIconTexture(icon: string, active: boolean): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas'); c.width=c.height=S
  const ctx = c.getContext('2d')!

  if (active) {
    const g = ctx.createRadialGradient(S/2,S/2,4, S/2,S/2,S/2)
    g.addColorStop(0,'rgba(99,102,241,0.9)')
    g.addColorStop(1,'rgba(99,102,241,0)')
    ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
  }

  ctx.font = `${S*0.52}px serif`
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(icon, S/2, S/2)

  const t = new THREE.CanvasTexture(c); t.needsUpdate=true
  return t
}

export class TaskBar3D {
  group: THREE.Group
  private btnGroups: THREE.Group[] = []
  private btnDefs:   TaskBarButton[] = []
  private clock: number = 0

  constructor() {
    this.group = new THREE.Group()
    // Прикреплён к камере — позиционируется в main.ts
  }

  setButtons(btns: TaskBarButton[]): void {
    this.btnDefs = btns
    this.rebuild()
  }

  private rebuild(): void {
    this.group.clear()
    this.btnGroups = []

    const n   = this.btnDefs.length
    const GAP = 0.13
    const W   = 0.10  // ширина кнопки
    const H   = 0.10
    const D   = 0.016
    const totalW = n * W + (n-1) * GAP

    // Фоновая панель
    const panelMat = new THREE.MeshPhysicalMaterial({
      color: 0x090e1a, transparent: true, opacity: 0.82,
      roughness: 0.1, metalness: 0.2
    })
    const panel = new THREE.Mesh(new THREE.BoxGeometry(totalW+0.06, H+0.06, D*0.5), panelMat)
    this.group.add(panel)

    // Линия-акцент сверху
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(totalW+0.06, 0.003, D*0.5),
      new THREE.MeshBasicMaterial({color:0x6366f1})
    )
    accent.position.y = (H+0.06)/2
    this.group.add(accent)

    // Кнопки
    for (let i=0; i<n; i++) {
      const btn = this.btnDefs[i]
      const bg = new THREE.Group()
      bg.position.x = -totalW/2 + W/2 + i*(W+GAP)

      // Фон кнопки
      const btnBg = new THREE.Mesh(
        new THREE.BoxGeometry(W, H, D),
        new THREE.MeshPhysicalMaterial({
          color: btn.active ? 0x312e81 : 0x111827,
          transparent:true, opacity:0.9,
          roughness:0.15, metalness:0.1,
          emissive: new THREE.Color(btn.active ? 0x4338ca : 0x000000),
          emissiveIntensity: 0.3
        })
      )
      bg.add(btnBg)

      // Иконка
      const iconPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(W*0.7, W*0.7),
        new THREE.MeshBasicMaterial({
          map: makeIconTexture(btn.icon, btn.active??false),
          transparent:true, depthWrite:false
        })
      )
      iconPlane.position.z = D/2+0.002
      bg.add(iconPlane)

      // Рамка при active
      if (btn.active) {
        const border = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(W+0.006,H+0.006,D+0.002)),
          new THREE.LineBasicMaterial({color:0x6366f1})
        )
        bg.add(border)
      }

      bg.userData = { btn, bgMesh: btnBg, iconPlane }
      this.btnGroups.push(bg)
      this.group.add(bg)
    }
  }

  /**
   * Обновить состояние кнопки (active/inactive)
   */
  setActive(icon: string, active: boolean): void {
    const idx = this.btnDefs.findIndex(b => b.icon===icon)
    if (idx >= 0) { this.btnDefs[idx].active = active; this.rebuild() }
  }

  /**
   * Hit-test: возвращает кнопку если worldPt попадает в неё
   */
  hitTest(worldPt: THREE.Vector3): TaskBarButton | null {
    for (const bg of this.btnGroups) {
      bg.updateWorldMatrix(true,false)
      const local = bg.worldToLocal(worldPt.clone())
      if (Math.abs(local.x)<0.06 && Math.abs(local.y)<0.06 && Math.abs(local.z)<0.12) {
        return bg.userData.btn as TaskBarButton
      }
    }
    return null
  }

  update(time: number, camera: THREE.PerspectiveCamera): void {
    this.clock = time
    // Следуем за камерой — внизу поля зрения
    const offset = new THREE.Vector3(0, -0.32, -0.65)
    offset.applyQuaternion(camera.quaternion)
    this.group.position.copy(camera.position).add(offset)
    this.group.quaternion.copy(camera.quaternion)

    // Лёгкое дыхание акцент-линии
    const accent = this.group.children[1] as THREE.Mesh
    if (accent?.material) {
      const m = accent.material as THREE.MeshBasicMaterial
      m.color.setHex(0x6366f1)
      m.opacity = 0.7 + Math.sin(time*2)*0.3
    }
  }

  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
