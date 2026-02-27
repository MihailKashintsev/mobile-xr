/**
 * HandMesh v8 — правильный масштаб, точный трекинг
 *
 * КЛЮЧ: screen landmarks дают нормализованные координаты 0-1.
 * Конвертируем через camera unproject на реальную глубину руки.
 * Это точнее чем worldLandmarks которые имеют ненадёжный масштаб.
 *
 * landmarkToWorld уже вызывается снаружи для запястья (wristWorld).
 * Для остальных точек используем ТУ ЖЕ функцию — через toWorld callback.
 */
import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'
import type { Landmark }    from '../xr/HandTracker'

// Радиусы суставов пальцев — в метрах сцены (~1-1.5см реальных)
const FINGER_R = [
  [0.012, 0.010, 0.009, 0.008],  // большой
  [0.011, 0.009, 0.008, 0.007],  // указательный
  [0.012, 0.010, 0.009, 0.008],  // средний
  [0.010, 0.009, 0.008, 0.007],  // безымянный
  [0.009, 0.008, 0.007, 0.006],  // мизинец
]

const UP = new THREE.Vector3(0, 1, 0)
const _q  = new THREE.Quaternion()
const _m  = new THREE.Matrix4()

function skinMat(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf2b47e,
    roughness: 0.70, metalness: 0.0,
    emissive: new THREE.Color(0x200800), emissiveIntensity: 0.08,
    side: THREE.FrontSide,
    depthTest: false, depthWrite: false,
    transparent: true, opacity: 0.96,
  })
}

function placeCylinder(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  if (len < 0.0005) { m.visible = false; return }
  m.visible = true
  _q.setFromUnitVectors(UP, dir.normalize())
  _m.compose(
    new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
    _q,
    new THREE.Vector3(1, len, 1)
  )
  m.matrix.copy(_m)
  m.matrixAutoUpdate = false
}

export class HandMesh {
  group: THREE.Group
  private caps:   THREE.Mesh[][] = []
  private joints: THREE.Mesh[]   = []
  private nails:  THREE.Mesh[]   = []
  private glow:   THREE.Mesh

  constructor() {
    this.group = new THREE.Group()
    this.group.renderOrder = 998

    // 5 пальцев × 3 сегмента
    for (let fi = 0; fi < 5; fi++) {
      const r = FINGER_R[fi]
      const segs: THREE.Mesh[] = []
      for (let si = 0; si < 3; si++) {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(r[si+1], r[si], 1, 10, 1),
          skinMat()
        )
        m.renderOrder = 998
        segs.push(m)
        this.group.add(m)
      }
      this.caps.push(segs)
    }

    // 21 сустав — сферы
    const jR = [
      0.018,                          // 0 запястье
      0.013,0.011,0.009,0.008,        // 1-4 большой
      0.013,0.011,0.009,0.008,        // 5-8 указательный
      0.014,0.012,0.010,0.008,        // 9-12 средний
      0.012,0.010,0.009,0.007,        // 13-16 безымянный
      0.011,0.009,0.008,0.006,        // 17-20 мизинец
    ]
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(jR[i] ?? 0.008, 8, 6),
        skinMat()
      )
      m.renderOrder = 998
      this.joints.push(m)
      this.group.add(m)
    }

    // 5 ногтей
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.010, 0.004, 0.013),
        new THREE.MeshPhysicalMaterial({
          color: 0xffddd0, roughness: 0.25,
          depthTest: false, depthWrite: false,
          transparent: true, opacity: 0.88,
        })
      )
      m.renderOrder = 998
      this.nails.push(m)
      this.group.add(m)
    }

    // Glow (активируется при three_finger)
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.020, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0x80ccff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false,
      })
    )
    this.glow.renderOrder = 999
    this.group.add(this.glow)
  }

  /**
   * @param lm         - нормализованные screen landmarks (0-1)
   * @param _wld       - worldLandmarks (не используем — ненадёжный масштаб)
   * @param _wristWorld - не используем (считаем сами через toWorld)
   * @param _isFront   - не используем (toWorld уже учитывает)
   * @param toWorld    - функция конвертации lm → THREE.Vector3 (передаётся из main)
   * @param gesture    - текущий жест
   * @param pinchStrength
   * @param time
   */
  updateFromLandmarks(
    lm: Landmark[],
    _wld: Landmark[],
    _wristWorld: THREE.Vector3,
    _isFront: boolean,
    gesture: GestureType,
    pinchStrength: number,
    time: number,
    toWorld: (lm: Landmark) => THREE.Vector3
  ): void {
    if (!lm || lm.length < 21) { this.group.visible = false; return }
    this.group.visible = true

    // Конвертируем все 21 точку через toWorld (та же функция что и для скелета)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 21; i++) {
      if (!lm[i]) { this.group.visible = false; return }
      pts.push(toWorld(lm[i]))
    }

    // Суставы
    for (let i = 0; i < 21; i++) this.joints[i].position.copy(pts[i])

    // Цилиндры пальцев
    const fingerJoints = [
      [1,2,3,4],    // большой
      [5,6,7,8],    // указательный
      [9,10,11,12], // средний
      [13,14,15,16],// безымянный
      [17,18,19,20],// мизинец
    ]
    for (let fi = 0; fi < 5; fi++) {
      const j = fingerJoints[fi]
      for (let si = 0; si < 3; si++) {
        placeCylinder(this.caps[fi][si], pts[j[si]], pts[j[si+1]])
      }
    }

    // Ногти (у кончиков пальцев)
    const tipI = [4, 8, 12, 16, 20]
    const dipI = [3, 7, 11, 15, 19]
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
        (pts[4].z + pts[8].z + pts[12].z) / 3
      )
      ;(this.glow.material as THREE.MeshBasicMaterial).opacity =
        emI + Math.sin(time * 10) * 0.03 * emI
    }
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}