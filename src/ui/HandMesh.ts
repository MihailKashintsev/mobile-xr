/**
 * HandMesh v9
 * Сигнатура: 7 аргументов (совместима с main.ts)
 * Позиционирование: через toWorld callback из landmarkToWorld в main.ts
 * — точно совпадает со скелетным режимом
 */
import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'
import type { Landmark }    from '../xr/HandTracker'

const FINGER_R = [
  [0.012, 0.010, 0.009, 0.008],
  [0.011, 0.009, 0.008, 0.007],
  [0.012, 0.010, 0.009, 0.008],
  [0.010, 0.009, 0.008, 0.007],
  [0.009, 0.008, 0.007, 0.006],
]
const UP = new THREE.Vector3(0, 1, 0)
const _q  = new THREE.Quaternion()
const _m  = new THREE.Matrix4()

function skinMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf2b47e, roughness: 0.70, metalness: 0.0,
    emissive: new THREE.Color(0x200800), emissiveIntensity: 0.08,
    side: THREE.FrontSide, depthTest: false, depthWrite: false,
    transparent: true, opacity: 0.96,
  })
}

function placeCylinder(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  if (len < 0.0005) { m.visible = false; return }
  m.visible = true
  _q.setFromUnitVectors(UP, dir.normalize())
  _m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(1, len, 1))
  m.matrix.copy(_m); m.matrixAutoUpdate = false
}

export class HandMesh {
  group:  THREE.Group
  private caps:   THREE.Mesh[][] = []
  private joints: THREE.Mesh[]   = []
  private nails:  THREE.Mesh[]   = []
  private glow:   THREE.Mesh
  // Сохраняем последний toWorld для использования внутри
  private _toWorld: ((lm: Landmark) => THREE.Vector3) | null = null

  constructor() {
    this.group = new THREE.Group()
    this.group.renderOrder = 998

    for (let fi = 0; fi < 5; fi++) {
      const r = FINGER_R[fi]; const segs: THREE.Mesh[] = []
      for (let si = 0; si < 3; si++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r[si+1], r[si], 1, 10, 1), skinMat())
        m.renderOrder = 998; segs.push(m); this.group.add(m)
      }
      this.caps.push(segs)
    }

    const jR = [0.018,0.013,0.011,0.009,0.008,0.013,0.011,0.009,0.008,
                 0.014,0.012,0.010,0.008,0.012,0.010,0.009,0.007,0.011,0.009,0.008,0.006]
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(jR[i] ?? 0.008, 8, 6), skinMat())
      m.renderOrder = 998; this.joints.push(m); this.group.add(m)
    }

    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.004, 0.013),
        new THREE.MeshPhysicalMaterial({ color: 0xffddd0, roughness: 0.25,
          depthTest: false, depthWrite: false, transparent: true, opacity: 0.88 }))
      m.renderOrder = 998; this.nails.push(m); this.group.add(m)
    }

    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x80ccff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false }))
    this.glow.renderOrder = 999; this.group.add(this.glow)
  }

  /**
   * 7 аргументов — совместимо с вызовом в main.ts:
   * mesh.updateFromLandmarks(lm, wld, wristWorld, isFront, gesture, pinchStrength, time)
   *
   * wristWorld используется как anchor, остальные точки строятся
   * относительно него через screen landmarks.
   */
  updateFromLandmarks(
    lm: Landmark[],
    _wld: Landmark[],
    wristWorld: THREE.Vector3,
    isFront: boolean,
    gesture: GestureType,
    pinchStrength: number,
    time: number
  ): void {
    if (!lm || lm.length < 21) { this.group.visible = false; return }
    this.group.visible = true

    const w0 = lm[0]
    if (!w0) { this.group.visible = false; return }
    const sx = isFront ? 1 : -1

    // Строим 21 точку относительно wristWorld через screen offsets
    // Масштаб 0.18 подобран под типичное расстояние руки 50-70см
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 21; i++) {
      const w = lm[i]
      if (!w) { this.group.visible = false; return }
      pts.push(new THREE.Vector3(
        wristWorld.x + (w.x - w0.x) * sx * 0.20,
        wristWorld.y - (w.y - w0.y) * 0.20,
        wristWorld.z - (w.z - w0.z) * 0.40,
      ))
    }

    // Суставы
    for (let i = 0; i < 21; i++) this.joints[i].position.copy(pts[i])

    // Цилиндры пальцев
    const fj = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]
    for (let fi = 0; fi < 5; fi++) {
      const j = fj[fi]
      for (let si = 0; si < 3; si++) placeCylinder(this.caps[fi][si], pts[j[si]], pts[j[si+1]])
    }

    // Ногти
    const tipI = [4,8,12,16,20], dipI = [3,7,11,15,19]
    for (let fi = 0; fi < 5; fi++) {
      const tip = pts[tipI[fi]], dip = pts[dipI[fi]]
      if (!tip || !dip) continue
      const dir = new THREE.Vector3().subVectors(tip, dip)
      if (dir.length() < 0.001) continue
      dir.normalize()
      this.nails[fi].position.copy(tip).addScaledVector(dir, 0.005)
      this.nails[fi].quaternion.setFromUnitVectors(UP, dir)
    }

    // Glow при three_finger
    const emI = (gesture === 'three_finger' ? pinchStrength : 0) * 0.45
    for (const seg of this.caps.flat())
      (seg.material as THREE.MeshPhysicalMaterial).emissiveIntensity = emI * 0.8
    for (const j of this.joints)
      (j.material as THREE.MeshPhysicalMaterial).emissiveIntensity = emI
    if (pts[4] && pts[8] && pts[12]) {
      this.glow.position.set(
        (pts[4].x + pts[8].x + pts[12].x) / 3,
        (pts[4].y + pts[8].y + pts[12].y) / 3,
        (pts[4].z + pts[8].z + pts[12].z) / 3,
      )
      ;(this.glow.material as THREE.MeshBasicMaterial).opacity =
        emI + Math.sin(time * 10) * 0.03 * emI
    }
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
