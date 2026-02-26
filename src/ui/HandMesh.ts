/**
 * HandMesh — точная 3D модель руки как в Quest 3
 *
 * Ключевое отличие от предыдущих версий:
 * Использует worldLandmarks (метрические координаты относительно запястья)
 * для правильной глубины каждого сустава — пальцы реально сгибаются в 3D.
 *
 * Алгоритм:
 * 1. Проецируем wrist (lm[0]) на глубину по его screen-z
 * 2. Для каждого joint i: берём wrist world pos + worldLandmarks[i] как метрический offset
 * 3. Рука строго следует за реальной рукой без дрейфа
 */

import * as THREE from 'three'
import type { Landmark } from '../xr/HandTracker'
import type { GestureType } from '../xr/GestureDetector'

const BONES: [number, number][] = [
  [0,1],[0,5],[0,9],[0,13],[0,17],[5,9],[9,13],[13,17], // ладонь
  [1,2],[2,3],[3,4],     // большой
  [5,6],[6,7],[7,8],     // указательный
  [9,10],[10,11],[11,12],// средний
  [13,14],[14,15],[15,16],// безымянный
  [17,18],[18,19],[19,20],// мизинец
]

// Радиус цилиндра по самому дальнему индексу кости
function boneR(maxIdx: number): number {
  if (maxIdx <= 1)  return 0.014
  if (maxIdx <= 4)  return 0.011
  if (maxIdx <= 8)  return 0.010
  if (maxIdx <= 12) return 0.009
  if (maxIdx <= 16) return 0.009
  return 0.008
}

function jointR(i: number): number {
  if (i === 0)                     return 0.020
  if ([1,5,9,13,17].includes(i))   return 0.013
  if ([4,8,12,16,20].includes(i))  return 0.011
  return 0.010
}

const SKIN_BASE  = new THREE.Color(0xf5c9a0) // нейтральный телесный
const JOINT_BASE = new THREE.Color(0xedb88c)

const UP = new THREE.Vector3(0, 1, 0)

export class HandMesh {
  group: THREE.Group
  private bones:  THREE.Mesh[] = []
  private joints: THREE.Mesh[] = []
  private glow:   THREE.Mesh

  constructor() {
    this.group = new THREE.Group()
    this.buildMeshes()
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, depthWrite: false })
    )
    this.group.add(this.glow)
  }

  private skinMat(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: SKIN_BASE.clone(),
      transparent: true,
      opacity: 0.78,
      roughness: 0.65,
      metalness: 0.0,
      depthWrite: true,
      depthTest: true,
    })
  }

  private buildMeshes(): void {
    for (const [a, b] of BONES) {
      const r = boneR(Math.max(a, b))
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.85, r, 1, 10, 1),
        this.skinMat()
      )
      m.matrixAutoUpdate = false
      this.bones.push(m)
      this.group.add(m)
    }
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(jointR(i), 12, 10),
        this.skinMat()
      )
      this.joints.push(m)
      this.group.add(m)
    }
  }

  /**
   * @param landmarks - нормализованные 2D ланд-марки MediaPipe (x,y,z)
   * @param worldLandmarks - метрические 3D координаты относительно запястья
   * @param screenToWorld - проецирует screen-landmark в мировую позицию (для wrist)
   * @param wristWorld - уже вычисленная мировая позиция запястья
   * @param isFront - фронтальная камера?
   */
  updateFromLandmarks(
    landmarks:      Landmark[],
    worldLandmarks: Landmark[],
    wristWorld:     THREE.Vector3,
    isFront:        boolean,
    gesture:        GestureType,
    pinchStrength:  number,
    time:           number
  ): void {
    if (landmarks.length < 21) { this.group.visible = false; return }
    this.group.visible = true

    const wl0 = worldLandmarks[0] ?? { x: 0, y: 0, z: 0 }

    // Масштаб worldLandmarks в метрах → сцена
    // MediaPipe worldLandmarks в метрах. Рука ≈ 0.18м.
    // Визуально хотим руку ≈ 0.18м в сцене → scale = 1.0
    const SCALE = 1.0
    // Знак X: для задней камеры worldLandmarks не зеркалируются — нужно инвертировать X
    const signX = isFront ? 1 : -1

    // Мировые позиции всех суставов
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 21; i++) {
      const wli = worldLandmarks[i] ?? { x: 0, y: 0, z: 0 }
      // offset относительно запястья
      const dx = (wli.x - wl0.x) * signX * SCALE
      const dy = -(wli.y - wl0.y) * SCALE  // Y инвертирован: MediaPipe вниз, Three.js вверх
      const dz = (wli.z - wl0.z) * SCALE   // z: в Three.js -Z = вглубь
      pts.push(new THREE.Vector3(
        wristWorld.x + dx,
        wristWorld.y + dy,
        wristWorld.z - dz   // MP z положительный = ближе к камере = +Z в сцене
      ))
    }

    // Суставы
    for (let i = 0; i < 21; i++) this.joints[i].position.copy(pts[i])

    // Кости — цилиндр между точками
    const q   = new THREE.Quaternion()
    const dir = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const mat = new THREE.Matrix4()

    for (let bi = 0; bi < BONES.length; bi++) {
      const [a, b] = BONES[bi]
      dir.subVectors(pts[b], pts[a])
      const len = dir.length()
      if (len < 0.001) { this.bones[bi].visible = false; continue }
      this.bones[bi].visible = true
      mid.addVectors(pts[a], pts[b]).multiplyScalar(0.5)
      q.setFromUnitVectors(UP, dir.clone().normalize())
      mat.compose(mid, q, new THREE.Vector3(1, len, 1))
      this.bones[bi].matrix.copy(mat)
    }

    // Свечение при щипке
    const glow = gesture === 'pinch' ? pinchStrength : 0
    for (const m of [...this.bones, ...this.joints]) {
      const mat2 = m.material as THREE.MeshPhysicalMaterial
      mat2.emissive?.setHex(0xfbbf24)
      mat2.emissiveIntensity = glow * 0.25
    }

    const c4 = pts[4], c8 = pts[8], c12 = pts[12]
    this.glow.position.set((c4.x+c8.x+c12.x)/3, (c4.y+c8.y+c12.y)/3, (c4.z+c8.z+c12.z)/3)
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity =
      glow * 0.55 + Math.sin(time * 9) * 0.04 * glow
    this.glow.scale.setScalar(0.9 + glow * 1.2)
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
