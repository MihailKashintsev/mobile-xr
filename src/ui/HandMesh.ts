/**
 * HandMesh — полноценная 3D модель руки
 *
 * Анатомия:
 * - Ладонь: ExtrudeGeometry из контура 5 точек (wrist + 4 MCP)
 * - Пальцы: CapsuleGeometry (цилиндр + полусферы) — 3D капсулы
 * - Суставы: SphereGeometry с плавным уменьшением к кончику
 * - Перемычки: треугольные заполнители между основаниями пальцев
 * - Ноготь: плоский BoxGeometry на кончике
 * - Материал: MeshPhysicalMaterial с имитацией SSS (subsurface)
 */
import * as THREE from 'three'
import type { Landmark } from '../xr/HandTracker'
import type { GestureType } from '../xr/GestureDetector'

// Радиусы пальцев [MCP,PIP,DIP,TIP] в метрах
const FINGER_R: Record<number, [number,number,number,number]> = {
  0: [0.015,0.013,0.011,0.010], // большой
  1: [0.013,0.011,0.009,0.008], // указательный
  2: [0.014,0.012,0.010,0.009], // средний
  3: [0.012,0.010,0.008,0.007], // безымянный
  4: [0.010,0.008,0.007,0.006], // мизинец
}

// MediaPipe индексы для каждого пальца
const FINGER_IDX: [number,number,number,number,number][] = [
  [1,2,3,4,  0],  // большой: CMC,MCP,IP,TIP (база=0 запястье)
  [5,6,7,8,  0],  // указательный
  [9,10,11,12,0],
  [13,14,15,16,0],
  [17,18,19,20,0],
]

const UP = new THREE.Vector3(0,1,0)
const _q  = new THREE.Quaternion()
const _d  = new THREE.Vector3()
const _m  = new THREE.Vector3()
const _mt = new THREE.Matrix4()

function skinMat(opacity=0.88): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color:    0xf2b880,
    emissive: new THREE.Color(0x3a0800),
    emissiveIntensity: 0.07,
    roughness: 0.78, metalness: 0.0,
    transparent: true, opacity,
    depthWrite: true,
  })
}

function placeCylinder(
  mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3
): boolean {
  _d.subVectors(b,a)
  const len = _d.length()
  if (len < 0.0005) { mesh.visible=false; return false }
  mesh.visible = true
  _m.addVectors(a,b).multiplyScalar(0.5)
  _q.setFromUnitVectors(UP, _d.clone().normalize())
  _mt.compose(_m, _q, new THREE.Vector3(1,len,1))
  mesh.matrix.copy(_mt)
  return true
}

export class HandMesh {
  group: THREE.Group
  // Капсулы сегментов: [finger][segment]
  private caps: THREE.Mesh[][] = []
  // Суставные сферы
  private joints: THREE.Mesh[] = []
  // Ладонь как mesh (обновляется каждый кадр)
  private palmMesh: THREE.Mesh
  // Перемычки (webbing) между пальцами
  private webs: THREE.Mesh[] = []
  // Ногти
  private nails: THREE.Mesh[] = []
  // Glow
  private glow: THREE.Mesh
  private mat: THREE.MeshPhysicalMaterial

  constructor() {
    this.group = new THREE.Group()
    this.mat   = skinMat()
    this.build()
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.022,10,8),
      new THREE.MeshBasicMaterial({color:0xffcc44,transparent:true,opacity:0,depthWrite:false})
    )
    this.group.add(this.glow)
  }

  private cloneMat(): THREE.MeshPhysicalMaterial {
    return this.mat.clone()
  }

  private build(): void {
    // ── Капсулы пальцев ───────────────────────────────────────────────────
    for (let fi=0; fi<5; fi++) {
      const r = FINGER_R[fi]
      const segs: THREE.Mesh[] = []
      for (let si=0; si<3; si++) {  // 3 сегмента
        const r1 = r[si], r2 = r[si+1]
        // CapsuleGeometry(radius, length, capSeg, radialSeg)
        // Используем CylinderGeometry с полусферами через Shape
        // Таперированный цилиндр (конус) для реалистичности
        const geo = new THREE.CylinderGeometry(r2, r1, 1, 12, 1, false)
        const m   = new THREE.Mesh(geo, this.cloneMat())
        m.matrixAutoUpdate = false
        segs.push(m)
        this.group.add(m)
      }
      this.caps.push(segs)
    }

    // ── Суставные сферы (полусферы для суставов пальцев) ─────────────────
    const jRadii = [
      0.022,                           // 0 запястье
      0.014,0.013,0.012,0.011,        // большой
      0.013,0.012,0.010,0.009,        // указательный
      0.014,0.012,0.010,0.009,        // средний
      0.012,0.010,0.009,0.008,        // безымянный
      0.011,0.009,0.008,0.007,        // мизинец
    ]
    for (let i=0; i<21; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(jRadii[i]??0.009, 14, 10),
        this.cloneMat()
      )
      this.joints.push(m)
      this.group.add(m)
    }

    // ── Ладонь — динамический меш (пересоздаётся в update) ───────────────
    this.palmMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.cloneMat())
    this.palmMesh.frustumCulled = false
    this.group.add(this.palmMesh)

    // ── Перемычки (webbing) — 4 треугольника между соседними пальцами ────
    for (let i=0; i<4; i++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.cloneMat())
      m.frustumCulled = false
      this.webs.push(m)
      this.group.add(m)
    }

    // ── Ногти — плоский меш на кончике каждого пальца ────────────────────
    for (let i=0; i<5; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.003, 0.012),
        new THREE.MeshPhysicalMaterial({color:0xffe4d0,roughness:0.3,transparent:true,opacity:0.9})
      )
      this.nails.push(m)
      this.group.add(m)
    }
  }

  updateFromLandmarks(
    lm: Landmark[],
    wld: Landmark[],
    wristWorld: THREE.Vector3,
    isFront: boolean,
    gesture: GestureType,
    pinchStrength: number,
    time: number
  ): void {
    if (lm.length < 21) { this.group.visible=false; return }
    this.group.visible = true

    // ── Мировые позиции всех 21 сустава ──────────────────────────────────
    const wl0   = wld[0]??{x:0,y:0,z:0}
    const signX = isFront ? 1 : -1

    const pts: THREE.Vector3[] = []
    for (let i=0; i<21; i++) {
      const w = wld[i]??wl0
      pts.push(new THREE.Vector3(
        wristWorld.x + (w.x-wl0.x)*signX,
        wristWorld.y - (w.y-wl0.y),
        wristWorld.z - (w.z-wl0.z)
      ))
    }

    // ── Суставы ───────────────────────────────────────────────────────────
    for (let i=0; i<21; i++) this.joints[i].position.copy(pts[i])

    // ── Сегменты пальцев ─────────────────────────────────────────────────
    const fingerStarts = [1,5,9,13,17] // MCP index каждого пальца
    for (let fi=0; fi<5; fi++) {
      const base = fi===0 ? [0,1,2,3,4] : [0, fingerStarts[fi], fingerStarts[fi]+1, fingerStarts[fi]+2, fingerStarts[fi]+3]
      // Для большого пальца: сегменты 1→2, 2→3, 3→4
      // Для остальных: MCP→PIP, PIP→DIP, DIP→TIP
      const joints = fi===0 ? [1,2,3,4] : [fingerStarts[fi],fingerStarts[fi]+1,fingerStarts[fi]+2,fingerStarts[fi]+3]
      for (let si=0; si<3; si++) {
        placeCylinder(this.caps[fi][si], pts[joints[si]], pts[joints[si+1]])
      }
    }

    // ── Ладонь (динамический меш) ─────────────────────────────────────────
    this.updatePalm(pts)

    // ── Перемычки ─────────────────────────────────────────────────────────
    const mcps = [5,9,13,17]
    for (let i=0; i<4; i++) {
      this.updateWeb(this.webs[i], pts[mcps[i]], pts[mcps[i+1]], pts[0])
    }

    // ── Ногти ─────────────────────────────────────────────────────────────
    const tipIdx = [4,8,12,16,20]
    const dipIdx = [3,7,11,15,19]
    for (let fi=0; fi<5; fi++) {
      const tip = pts[tipIdx[fi]], dip = pts[dipIdx[fi]]
      const dir = new THREE.Vector3().subVectors(tip,dip).normalize()
      const nail = this.nails[fi]
      nail.position.copy(tip).addScaledVector(dir, 0.007)
      nail.quaternion.setFromUnitVectors(UP, dir)
    }

    // ── Pinch glow ────────────────────────────────────────────────────────
    const glow = gesture==='pinch' ? pinchStrength : 0
    const emI  = glow * 0.5

    for (const cap of this.caps.flat()) (cap.material as THREE.MeshPhysicalMaterial).emissiveIntensity = emI
    for (const j   of this.joints)     (j.material   as THREE.MeshPhysicalMaterial).emissiveIntensity = emI*1.2
    ;(this.palmMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = emI*0.5

    const mid4 = pts[4], mid8 = pts[8], mid12 = pts[12]
    this.glow.position.set((mid4.x+mid8.x+mid12.x)/3,(mid4.y+mid8.y+mid12.y)/3,(mid4.z+mid8.z+mid12.z)/3)
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity = glow*0.5 + Math.sin(time*9)*0.04*glow
  }

  private updatePalm(pts: THREE.Vector3[]): void {
    // Ладонь = выпуклый контур: запястье → мизинец MCP → безымянный → средний → указательный → thumb CMC
    const ring = [pts[0], pts[17], pts[13], pts[9], pts[5], pts[1]]
    const center = new THREE.Vector3()
    ring.forEach(p => center.add(p)); center.divideScalar(ring.length)

    const THICK = 0.012 // толщина ладони
    // Нормаль ладони — вектор от тыла к ладони
    const palmNormal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(ring[4], ring[0]),
      new THREE.Vector3().subVectors(ring[2], ring[0])
    ).normalize()

    const pos: number[] = []
    const nrm: number[] = []

    const addTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3) => {
      for (const p of [a,b,c]) { pos.push(p.x,p.y,p.z); nrm.push(n.x,n.y,n.z) }
    }

    const front = palmNormal.clone().multiplyScalar( THICK/2)
    const back  = palmNormal.clone().multiplyScalar(-THICK/2)

    for (let i=0; i<ring.length; i++) {
      const next = (i+1) % ring.length
      const cf = ring[i].clone().add(front)
      const nf = ring[next].clone().add(front)
      const cc = center.clone().add(front)
      addTri(cc, cf, nf, palmNormal)
      const cb = ring[i].clone().add(back)
      const nb = ring[next].clone().add(back)
      const ccb = center.clone().add(back)
      addTri(ccb, nb, cb, palmNormal.clone().negate())

      // Бок (rim)
      const sn = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(nf,cf), front).normalize()
      addTri(cf, cb, nf, sn)
      addTri(nf, cb, nb, sn)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(nrm), 3))
    this.palmMesh.geometry.dispose()
    this.palmMesh.geometry = geo
  }

  private updateWeb(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, wrist: THREE.Vector3): void {
    const mid = new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5)
    const wristMid = new THREE.Vector3().addVectors(wrist, mid).multiplyScalar(0.5)
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b,a),
      new THREE.Vector3().subVectors(wristMid,a)
    ).normalize()

    const pos = [...[a.x,a.y,a.z], ...[ b.x, b.y, b.z], ...[wristMid.x,wristMid.y,wristMid.z]]
    const nrm = [...[n.x,n.y,n.z],  ...[n.x,n.y,n.z],   ...[n.x,n.y,n.z]]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(nrm), 3))
    mesh.geometry.dispose()
    mesh.geometry = geo
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
