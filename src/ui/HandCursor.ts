/**
 * HandCursor — полная визуализация руки: скелет + суставы + курсор щипка
 *
 * Топология MediaPipe Hands (21 точка):
 *  0  — запястье
 *  1-4  — большой (CMC, MCP, IP, TIP)
 *  5-8  — указательный (MCP, PIP, DIP, TIP)
 *  9-12 — средний
 *  13-16— безымянный
 *  17-20— мизинец
 */

import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'
import type { Landmark } from '../xr/HandTracker'

// Кости руки — пары индексов
const BONES: [number, number][] = [
  // Ладонь
  [0,1],[0,5],[0,17],[5,9],[9,13],[13,17],
  // Большой
  [1,2],[2,3],[3,4],
  // Указательный
  [5,6],[6,7],[7,8],
  // Средний
  [9,10],[10,11],[11,12],
  // Безымянный
  [13,14],[14,15],[15,16],
  // Мизинец
  [17,18],[18,19],[19,20],
]

// Кончики пальцев
const TIPS = [4, 8, 12, 16, 20]

// Цвет суставов по пальцу (0=запястье/ладонь, 1=большой...5=мизинец)
const FINGER_COLORS = [
  0x6b7280,  // запястье / ладонь
  0xff9f43,  // большой   — оранжевый
  0x06b6d4,  // указательный — cyan
  0xa78bfa,  // средний    — фиолетовый
  0x34d399,  // безымянный — зелёный
  0xf472b6,  // мизинец    — розовый
]

// К какому пальцу принадлежит индекс
const FINGER_IDX = [
  0,          // 0  запястье
  1,1,1,1,    // 1-4  большой
  2,2,2,2,    // 5-8  указательный
  3,3,3,3,    // 9-12 средний
  4,4,4,4,    // 13-16 безымянный
  5,5,5,5,    // 17-20 мизинец
]

export class HandCursor {
  group: THREE.Group
  private handColor: number

  // Скелет (линии костей)
  private boneLines: THREE.Line[] = []
  private bonePositions: Float32Array[] = []

  // Суставы (сферы)
  private jointMeshes: THREE.Mesh[] = []

  // Курсор щипка — треугольник большой+указательный+средний
  private pinchTriLine: THREE.Line
  private pinchTriPositions: Float32Array

  // Подсветка щипка
  private pinchGlow: THREE.Mesh

  constructor(color: number = 0x06b6d4) {
    this.group = new THREE.Group()
    this.handColor = color

    // ── Линии костей ──────────────────────────────────────────────────────────
    for (const _ of BONES) {
      const positions = new Float32Array(6) // 2 точки × 3 компонента
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.55, linewidth: 1
        })
      )
      this.boneLines.push(line)
      this.bonePositions.push(positions)
      this.group.add(line)
    }

    // ── Суставы ───────────────────────────────────────────────────────────────
    for (let i = 0; i < 21; i++) {
      const isTip   = TIPS.includes(i)
      const isWrist = i === 0
      const radius  = isTip ? 0.018 : isWrist ? 0.016 : 0.011
      const jointColor = FINGER_COLORS[FINGER_IDX[i]]

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 8),
        new THREE.MeshPhysicalMaterial({
          color: jointColor,
          emissive: jointColor,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.85,
          roughness: 0.2,
        })
      )
      this.jointMeshes.push(mesh)
      this.group.add(mesh)
    }

    // ── Треугольник щипка: большой(4) + указательный(8) + средний(12) ────────
    this.pinchTriPositions = new Float32Array(12) // 4 точки (замкнутый треугольник)
    const triGeo = new THREE.BufferGeometry()
    triGeo.setAttribute('position', new THREE.BufferAttribute(this.pinchTriPositions, 3))
    this.pinchTriLine = new THREE.Line(
      triGeo,
      new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 })
    )
    this.group.add(this.pinchTriLine)

    // Glow-сфера в центре щипка
    this.pinchGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24, transparent: true, opacity: 0
      })
    )
    this.group.add(this.pinchGlow)
  }

  /**
   * Обновляет все элементы по массиву ланд-марков (нормализованные 0..1)
   * и результату жеста
   */
  updateFromLandmarks(
    landmarks: Landmark[],
    toWorld: (lm: Landmark) => THREE.Vector3,
    gesture: GestureType,
    pinchStrength: number,
    time: number
  ): void {
    if (landmarks.length < 21) { this.setVisible(false); return }
    this.setVisible(true)

    // Конвертируем все 21 точку в world coords
    const pts = landmarks.map(lm => toWorld(lm))

    // ── Кости ─────────────────────────────────────────────────────────────────
    for (let bi = 0; bi < BONES.length; bi++) {
      const [a, b] = BONES[bi]
      const pa = pts[a], pb = pts[b]
      const pos = this.bonePositions[bi]
      pos[0]=pa.x; pos[1]=pa.y; pos[2]=pa.z
      pos[3]=pb.x; pos[4]=pb.y; pos[5]=pb.z
      const attr = this.boneLines[bi].geometry.attributes.position as THREE.BufferAttribute
      attr.needsUpdate = true

      // Яркость костей зависит от жеста
      const mat = this.boneLines[bi].material as THREE.LineBasicMaterial
      mat.opacity = gesture === 'pinch' ? 0.75 : gesture === 'open' ? 0.45 : 0.55
    }

    // ── Суставы ───────────────────────────────────────────────────────────────
    for (let i = 0; i < 21; i++) {
      this.jointMeshes[i].position.copy(pts[i])
      const mat = this.jointMeshes[i].material as THREE.MeshPhysicalMaterial

      // Пульсация кончиков при щипке
      if (TIPS.includes(i) && gesture === 'pinch') {
        mat.emissiveIntensity = 0.5 + Math.sin(time * 10) * 0.3
        this.jointMeshes[i].scale.setScalar(1 + pinchStrength * 0.3)
      } else {
        mat.emissiveIntensity = 0.3
        this.jointMeshes[i].scale.setScalar(1)
      }
    }

    // ── Треугольник щипка ─────────────────────────────────────────────────────
    const pThumb  = pts[4]
    const pIndex  = pts[8]
    const pMiddle = pts[12]
    const tp = this.pinchTriPositions
    // Замкнутый треугольник: thumb → index → middle → thumb
    tp[0]=pThumb.x;  tp[1]=pThumb.y;  tp[2]=pThumb.z
    tp[3]=pIndex.x;  tp[4]=pIndex.y;  tp[5]=pIndex.z
    tp[6]=pMiddle.x; tp[7]=pMiddle.y; tp[8]=pMiddle.z
    tp[9]=pThumb.x;  tp[10]=pThumb.y; tp[11]=pThumb.z
    ;(this.pinchTriLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true

    const triMat = this.pinchTriLine.material as THREE.LineBasicMaterial
    triMat.opacity = pinchStrength * 0.9

    // Центр треугольника для glow
    const cx = (pThumb.x + pIndex.x + pMiddle.x) / 3
    const cy = (pThumb.y + pIndex.y + pMiddle.y) / 3
    const cz = (pThumb.z + pIndex.z + pMiddle.z) / 3
    this.pinchGlow.position.set(cx, cy, cz)
    const glowMat = this.pinchGlow.material as THREE.MeshBasicMaterial
    glowMat.opacity    = pinchStrength * 0.7
    this.pinchGlow.scale.setScalar(0.8 + pinchStrength * 1.4)
  }

  setVisible(v: boolean): void {
    this.group.visible = v
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group)
  }
}
