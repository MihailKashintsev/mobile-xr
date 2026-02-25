/**
 * HandMesh — полупрозрачная 3D модель руки в стиле Quest 3
 * Цилиндры = сегменты пальцев, сферы = суставы
 */
import * as THREE from 'three'
import type { Landmark } from '../xr/HandTracker'
import type { GestureType } from '../xr/GestureDetector'

const BONES: [number, number][] = [
  [0,1],[0,5],[0,17],[5,9],[9,13],[13,17],  // ладонь
  [1,2],[2,3],[3,4],   // большой
  [5,6],[6,7],[7,8],   // указательный
  [9,10],[10,11],[11,12], // средний
  [13,14],[14,15],[15,16],// безымянный
  [17,18],[18,19],[19,20],// мизинец
]

function boneRadius(a: number, b: number): number {
  const m = Math.max(a, b)
  if (m <= 1)  return 0.013 // запястье→CMC (самая толстая кость)
  if (m <= 4)  return 0.010 // большой
  if (m <= 8)  return 0.009 // указательный
  if (m <= 12) return 0.0085
  if (m <= 16) return 0.008
  return 0.007
}

function jointRadius(i: number): number {
  if (i === 0)                        return 0.020 // запястье
  if ([5,9,13,17].includes(i))        return 0.014 // MCP
  if ([4,8,12,16,20].includes(i))     return 0.011 // кончики
  return 0.010
}

const SKIN  = 0xdeb887  // нейтральный бежевый
const JOINT = 0xd2a679

const UP = new THREE.Vector3(0, 1, 0)

export class HandMesh {
  group: THREE.Group
  private boneMeshes:  THREE.Mesh[] = []
  private jointMeshes: THREE.Mesh[] = []
  private pinchGlow:   THREE.Mesh

  constructor() {
    this.group = new THREE.Group()
    this.build()
    // Glow щипка
    this.pinchGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, depthWrite: false })
    )
    this.group.add(this.pinchGlow)
  }

  private mat(color: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color, transparent: true, opacity: 0.72,
      roughness: 0.6, metalness: 0,
      depthWrite: true, depthTest: true,
    })
  }

  private build(): void {
    for (const [a, b] of BONES) {
      const r = boneRadius(a, b)
      // Цилиндр высотой 1 — растянем через scale.y в updateFromLandmarks
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 1, 8), this.mat(SKIN))
      m.matrixAutoUpdate = false
      this.boneMeshes.push(m)
      this.group.add(m)
    }
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(jointRadius(i), 10, 8), this.mat(JOINT))
      this.jointMeshes.push(m)
      this.group.add(m)
    }
  }

  updateFromLandmarks(
    landmarks: Landmark[],
    toWorld: (lm: Landmark) => THREE.Vector3,
    gesture: GestureType,
    pinchStrength: number,
    time: number
  ): void {
    if (landmarks.length < 21) { this.group.visible = false; return }
    this.group.visible = true

    const pts = landmarks.map(lm => toWorld(lm))

    // Суставы
    for (let i = 0; i < 21; i++) this.jointMeshes[i].position.copy(pts[i])

    // Кости: ориентировать цилиндр между двумя точками
    const q   = new THREE.Quaternion()
    const dir = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const mat = new THREE.Matrix4()
    for (let bi = 0; bi < BONES.length; bi++) {
      const [a, b] = BONES[bi]
      dir.subVectors(pts[b], pts[a])
      const len = dir.length()
      if (len < 0.0001) { this.boneMeshes[bi].visible = false; continue }
      this.boneMeshes[bi].visible = true
      mid.addVectors(pts[a], pts[b]).multiplyScalar(0.5)
      q.setFromUnitVectors(UP, dir.clone().normalize())
      mat.compose(mid, q, new THREE.Vector3(1, len, 1))
      this.boneMeshes[bi].matrix.copy(mat)
    }

    // Лёгкое свечение при щипке
    const pinchOpacity = pinchStrength * (gesture === 'pinch' ? 1 : 0.3)
    for (const m of this.boneMeshes)  (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = pinchOpacity * 0.15
    for (const m of this.jointMeshes) (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = pinchOpacity * 0.2

    const cx = (pts[4].x + pts[8].x + pts[12].x) / 3
    const cy = (pts[4].y + pts[8].y + pts[12].y) / 3
    const cz = (pts[4].z + pts[8].z + pts[12].z) / 3
    this.pinchGlow.position.set(cx, cy, cz)
    ;(this.pinchGlow.material as THREE.MeshBasicMaterial).opacity =
      pinchStrength * 0.6 + Math.sin(time * 9) * 0.05 * pinchStrength
    this.pinchGlow.scale.setScalar(0.85 + pinchStrength * 1.3)
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
