/**
 * HandMesh v4 — 3D модель руки
 *
 * ИСПРАВЛЕНИЕ застывания кадра:
 * - Старый код создавал новый THREE.BufferGeometry() каждый кадр для ладони и
 *   4 перемычек → огромный GC pressure → периодические заморозки рендера
 * - Теперь используем ПРЕДВЫДЕЛЕННЫЕ Float32Array буферы которые только обновляются
 *   через geometry.attributes.position.needsUpdate = true
 * - Ноль аллокаций в рендер-луп, ноль dispose/create циклов
 */
import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'
import type { Landmark }    from '../xr/HandTracker'

// ── Материал кожи ────────────────────────────────────────────────────────────
function skinMat(opacity=0.82): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf0b07a, transparent: true, opacity,
    roughness: 0.72, metalness: 0,
    emissive: new THREE.Color(0x3a0a00), emissiveIntensity: 0.10,
    side: THREE.DoubleSide,
  })
}

// Радиусы пальцев: [MCP, PIP, DIP, TIP]
const FINGER_R = [
  [0.013, 0.011, 0.009, 0.008], // большой
  [0.011, 0.009, 0.008, 0.007], // указательный
  [0.012, 0.010, 0.009, 0.008], // средний
  [0.011, 0.009, 0.008, 0.007], // безымянный
  [0.009, 0.008, 0.007, 0.006], // мизинец
]

const UP = new THREE.Vector3(0,1,0)
const _q  = new THREE.Quaternion()
const _m  = new THREE.Matrix4()
const _mt = new THREE.Matrix4()

function placeCylinder(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): boolean {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  if (len < 0.001) { mesh.visible=false; return false }
  mesh.visible = true
  _q.setFromUnitVectors(UP, dir.normalize())
  const mid = new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5)
  _m.makeTranslation(mid.x, mid.y, mid.z)
  _mt.compose(mid, _q, new THREE.Vector3(1, len, 1))
  mesh.matrix.copy(_mt)
  mesh.matrixAutoUpdate = false
  return true
}

// Количество вершин для ладони (6 секторов * 2 треугольника front/back + 2 rim = 6*4 = 24 треугольника = 72 вершин)
const PALM_VERTS = 72 * 3  // xyz
const WEB_VERTS  = 6  * 3  // 2 треугольника (двусторонний)

export class HandMesh {
  group: THREE.Group

  private caps:   THREE.Mesh[][] = []
  private joints: THREE.Mesh[]   = []
  private palmMesh!: THREE.Mesh
  private webs:   THREE.Mesh[]   = []
  private nails:  THREE.Mesh[]   = []
  private glow:   THREE.Mesh
  private mat:    THREE.MeshPhysicalMaterial

  // Предвыделённые буферы — без аллокаций в рендер-луп
  private palmPos!: Float32Array
  private palmNrm!: Float32Array
  private webPos:   Float32Array[] = []
  private webNrm:   Float32Array[] = []

  constructor() {
    this.group = new THREE.Group()
    this.mat   = skinMat()
    this.build()
    this.glow  = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 8),
      new THREE.MeshBasicMaterial({ color:0xffcc44, transparent:true, opacity:0, depthWrite:false })
    )
    this.group.add(this.glow)
  }

  private cloneMat(): THREE.MeshPhysicalMaterial { return this.mat.clone() }

  private build(): void {
    // ── Цилиндры пальцев ─────────────────────────────────────────────────
    for (let fi=0; fi<5; fi++) {
      const r = FINGER_R[fi]
      const segs: THREE.Mesh[] = []
      for (let si=0; si<3; si++) {
        const geo = new THREE.CylinderGeometry(r[si+1], r[si], 1, 10, 1, false)
        const m   = new THREE.Mesh(geo, this.cloneMat())
        m.matrixAutoUpdate = false
        segs.push(m); this.group.add(m)
      }
      this.caps.push(segs)
    }

    // ── Суставные сферы (21) ─────────────────────────────────────────────
    const jR = [
      0.022,
      0.014,0.012,0.010,0.009,
      0.013,0.011,0.009,0.008,
      0.014,0.012,0.010,0.009,
      0.012,0.010,0.009,0.008,
      0.010,0.009,0.008,0.007,
    ]
    for (let i=0; i<21; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(jR[i]??0.008, 12, 8),
        this.cloneMat()
      )
      this.joints.push(m); this.group.add(m)
    }

    // ── Ладонь (предвыделённый буфер) ────────────────────────────────────
    this.palmPos = new Float32Array(PALM_VERTS)
    this.palmNrm = new Float32Array(PALM_VERTS)
    const palmGeo = new THREE.BufferGeometry()
    palmGeo.setAttribute('position', new THREE.BufferAttribute(this.palmPos, 3))
    palmGeo.setAttribute('normal',   new THREE.BufferAttribute(this.palmNrm, 3))
    this.palmMesh = new THREE.Mesh(palmGeo, this.cloneMat())
    this.palmMesh.frustumCulled = false
    this.group.add(this.palmMesh)

    // ── Перемычки (предвыделённые буферы) ────────────────────────────────
    for (let i=0; i<4; i++) {
      const buf = new Float32Array(WEB_VERTS)
      const nrm = new Float32Array(WEB_VERTS)
      this.webPos.push(buf); this.webNrm.push(nrm)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(buf, 3))
      geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3))
      const m = new THREE.Mesh(geo, skinMat(0.55))
      m.frustumCulled = false
      this.webs.push(m); this.group.add(m)
    }

    // ── Ногти ─────────────────────────────────────────────────────────────
    for (let i=0; i<5; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.007, 0.016),
        new THREE.MeshPhysicalMaterial({ color:0xffe4d0, roughness:0.3, transparent:true, opacity:0.85 })
      )
      this.nails.push(m); this.group.add(m)
    }
  }

  updateFromLandmarks(
    lm:  Landmark[],
    wld: Landmark[],
    wristWorld: THREE.Vector3,
    isFront: boolean,
    gesture: GestureType,
    pinchStrength: number,
    time: number
  ): void {
    if (lm.length < 21) { this.group.visible=false; return }
    this.group.visible = true

    const wl0   = wld[0] ?? { x:0, y:0, z:0 }
    const signX = isFront ? 1 : -1

    // Мировые позиции 21 сустава
    const pts: THREE.Vector3[] = []
    for (let i=0; i<21; i++) {
      const w = wld[i] ?? wl0
      pts.push(new THREE.Vector3(
        wristWorld.x + (w.x - wl0.x) * signX,
        wristWorld.y - (w.y - wl0.y),
        wristWorld.z - (w.z - wl0.z)
      ))
    }

    // Суставы
    for (let i=0; i<21; i++) this.joints[i].position.copy(pts[i])

    // Цилиндры пальцев
    const fs = [1, 5, 9, 13, 17]
    for (let fi=0; fi<5; fi++) {
      const j = fi===0 ? [1,2,3,4] : [fs[fi], fs[fi]+1, fs[fi]+2, fs[fi]+3]
      for (let si=0; si<3; si++) placeCylinder(this.caps[fi][si], pts[j[si]], pts[j[si+1]])
    }

    // Ладонь — обновляем буфер без аллокаций
    this.updatePalmBuf(pts)

    // Перемычки
    const mcps = [5, 9, 13, 17]
    for (let i=0; i<4; i++) this.updateWebBuf(i, pts[mcps[i]], pts[mcps[i+1]], pts[0])

    // Ногти
    const tipI = [4,8,12,16,20], dipI = [3,7,11,15,19]
    for (let fi=0; fi<5; fi++) {
      const tip = pts[tipI[fi]], dip = pts[dipI[fi]]
      const dir = new THREE.Vector3().subVectors(tip, dip).normalize()
      this.nails[fi].position.copy(tip).addScaledVector(dir, 0.006)
      this.nails[fi].quaternion.setFromUnitVectors(UP, dir)
    }

    // Pinch glow
    const emI = (gesture==='pinch' ? pinchStrength : 0) * 0.45
    for (const cap of this.caps.flat()) (cap.material as THREE.MeshPhysicalMaterial).emissiveIntensity = emI
    for (const j of this.joints)        (j.material   as THREE.MeshPhysicalMaterial).emissiveIntensity = emI*1.2
    ;(this.palmMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = emI*0.5

    const [m4,m8,m12] = [pts[4],pts[8],pts[12]]
    this.glow.position.set((m4.x+m8.x+m12.x)/3,(m4.y+m8.y+m12.y)/3,(m4.z+m8.z+m12.z)/3)
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity = emI + Math.sin(time*9)*0.04*emI
  }

  /** Обновить буфер ладони без создания новых объектов */
  private updatePalmBuf(pts: THREE.Vector3[]): void {
    const ring = [pts[0], pts[17], pts[13], pts[9], pts[5], pts[1]]
    const center = new THREE.Vector3()
    ring.forEach(p => center.add(p)); center.divideScalar(ring.length)

    const THICK = 0.012
    const pn = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(ring[4], ring[0]),
      new THREE.Vector3().subVectors(ring[2], ring[0])
    ).normalize()

    const pos = this.palmPos
    const nrm = this.palmNrm
    let vi = 0

    const set3 = (p: THREE.Vector3, nx:number, ny:number, nz:number) => {
      pos[vi]   = p.x; pos[vi+1] = p.y; pos[vi+2] = p.z
      nrm[vi]   = nx;  nrm[vi+1] = ny;  nrm[vi+2] = nz
      vi += 3
    }

    const fhx=pn.x*THICK/2, fhy=pn.y*THICK/2, fhz=pn.z*THICK/2
    // Temp vectors reused per loop (no alloc)
    const cf=new THREE.Vector3(), nf=new THREE.Vector3(), cc=new THREE.Vector3()
    const cb=new THREE.Vector3(), nb=new THREE.Vector3(), ccb=new THREE.Vector3()

    for (let i=0; i<ring.length; i++) {
      const next = (i+1) % ring.length
      cf.copy(ring[i]).addScaledVector(pn, THICK/2)
      nf.copy(ring[next]).addScaledVector(pn, THICK/2)
      cc.copy(center).addScaledVector(pn, THICK/2)
      cb.copy(ring[i]).addScaledVector(pn, -THICK/2)
      nb.copy(ring[next]).addScaledVector(pn, -THICK/2)
      ccb.copy(center).addScaledVector(pn, -THICK/2)

      // Front face
      set3(cc,  pn.x,pn.y,pn.z); set3(cf,  pn.x,pn.y,pn.z); set3(nf, pn.x,pn.y,pn.z)
      // Back face
      set3(ccb,-pn.x,-pn.y,-pn.z); set3(nb,-pn.x,-pn.y,-pn.z); set3(cb,-pn.x,-pn.y,-pn.z)
      // Rim edge (2 triangles)
      const en = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(nf,cf),pn).normalize()
      set3(cf,en.x,en.y,en.z); set3(cb,en.x,en.y,en.z); set3(nf,en.x,en.y,en.z)
      set3(nf,en.x,en.y,en.z); set3(cb,en.x,en.y,en.z); set3(nb,en.x,en.y,en.z)
    }

    // Pad remaining to 0 if ring < 6 (shouldn't happen)
    while (vi < PALM_VERTS) { pos[vi]=0; nrm[vi]=0; vi++ }

    const pa = this.palmMesh.geometry.attributes.position as THREE.BufferAttribute
    const na = this.palmMesh.geometry.attributes.normal   as THREE.BufferAttribute
    pa.needsUpdate = true
    na.needsUpdate = true
  }

  /** Обновить буфер перемычки без аллокаций */
  private updateWebBuf(idx: number, a: THREE.Vector3, b: THREE.Vector3, wrist: THREE.Vector3): void {
    const mid = new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5)
    const wm  = new THREE.Vector3().addVectors(wrist,mid).multiplyScalar(0.5)
    const n   = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b,a),
      new THREE.Vector3().subVectors(wm,a)
    ).normalize()

    const pos = this.webPos[idx]
    const nrm = this.webNrm[idx]
    // Tri 1 (front)
    pos[0]=a.x;  pos[1]=a.y;  pos[2]=a.z
    pos[3]=b.x;  pos[4]=b.y;  pos[5]=b.z
    pos[6]=wm.x; pos[7]=wm.y; pos[8]=wm.z
    // Tri 2 (back)
    pos[9]=a.x;   pos[10]=a.y;  pos[11]=a.z
    pos[12]=wm.x; pos[13]=wm.y; pos[14]=wm.z
    pos[15]=b.x;  pos[16]=b.y;  pos[17]=b.z
    for (let i=0; i<6; i++) { nrm[i*3]=n.x; nrm[i*3+1]=n.y; nrm[i*3+2]=n.z }

    const pa = this.webs[idx].geometry.attributes.position as THREE.BufferAttribute
    const na = this.webs[idx].geometry.attributes.normal   as THREE.BufferAttribute
    pa.needsUpdate = true
    na.needsUpdate = true
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
