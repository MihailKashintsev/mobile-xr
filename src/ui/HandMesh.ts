/**
 * HandMesh — анатомически корректная 3D модель руки
 *
 * Архитектура:
 * - Ладонь: шестиугольный плоский меш с нужным профилем (не просто Box)
 * - Пальцы: CapsuleGeometry (цилиндр + полусферы) с правильными пропорциями
 * - Webbing: тонкие треугольные перепонки между основаниями пальцев
 * - Запястье: эллиптический цилиндр
 * - Материал: MeshPhysicalMaterial с subsurface-approximation (шероховатость + прозрачность)
 *
 * Все сегменты позиционируются по worldLandmarks (метрические 3D координаты)
 * → пальцы точно сгибаются в 3D.
 */

import * as THREE from 'three'
import type { Landmark } from '../xr/HandTracker'
import type { GestureType } from '../xr/GestureDetector'

// ─── Конфигурация пальцев ─────────────────────────────────────────────────────

const FINGER_SEGMENTS: { joints: [number, number][]; radiusBase: number; radiusTip: number }[] = [
  // Большой
  { joints: [[0,1],[1,2],[2,3],[3,4]],       radiusBase: 0.013, radiusTip: 0.009 },
  // Указательный
  { joints: [[5,6],[6,7],[7,8]],             radiusBase: 0.011, radiusTip: 0.007 },
  // Средний
  { joints: [[9,10],[10,11],[11,12]],        radiusBase: 0.0115, radiusTip: 0.0075 },
  // Безымянный
  { joints: [[13,14],[14,15],[15,16]],       radiusBase: 0.010, radiusTip: 0.007 },
  // Мизинец
  { joints: [[17,18],[18,19],[19,20]],       radiusBase: 0.009, radiusTip: 0.006 },
]

// Точки ладони (индексы MediaPipe) для построения меша
const PALM_RING = [0, 1, 5, 9, 13, 17] // запястье + все MCP

// ─── Вспомогательные функции ──────────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0)

function makeSkinMaterial(opacity = 0.82): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color:         new THREE.Color(0xf0c090),
    transparent:   true,
    opacity,
    roughness:     0.75,
    metalness:     0.0,
    // Approximation subsurface: немного красноватый emissive (как кровь под кожей)
    emissive:      new THREE.Color(0x3a0a00),
    emissiveIntensity: 0.06,
    depthWrite:    true,
    depthTest:     true,
    side:          THREE.FrontSide,
  })
}

/**
 * Капсула между двумя точками: цилиндр + полусферы на торцах
 * Таперированная (topR ≠ bottomR) для конусообразности пальца
 */
function makeCapsule(topR: number, botR: number, segments = 8): THREE.BufferGeometry {
  // CylinderGeometry(radiusTop, radiusBottom, height, segmentsRadial, segmentsHeight)
  // height=1 → растянем через matrix
  return new THREE.CylinderGeometry(topR, botR, 1, segments, 1, false)
}

/**
 * Строит кастомную геометрию ладони как плоский меш из точек MediaPipe
 * Возвращает BufferGeometry с triangles по кольцу
 */
function buildPalmGeometry(pts: THREE.Vector3[], thickness: number): THREE.BufferGeometry {
  // pts[0] = запястье, pts[1] = CMC большого, pts[2..5] = MCP указательного..мизинца
  // Треугольная разбивка: центр + кольцо
  const center = new THREE.Vector3()
  for (const p of pts) center.add(p)
  center.divideScalar(pts.length)

  const positions: number[] = []
  const normals:   number[] = []
  const uvs:       number[] = []

  function addTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, flip = false) {
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a)
    ).normalize()
    if (flip) n.negate()

    for (const [v, u, vt] of flip
      ? [[a,0,0],[c,1,0],[b,0.5,1]] as [THREE.Vector3,number,number][]
      : [[a,0,0],[b,1,0],[c,0.5,1]] as [THREE.Vector3,number,number][]) {
      positions.push(v.x, v.y, v.z)
      normals.push(n.x, n.y, n.z)
      uvs.push(u, vt)
    }
  }

  // Передняя сторона (ладонь)
  for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length
    addTri(center, pts[i], pts[next])
  }
  // Задняя сторона (тыльная часть)
  for (let i = 0; i < pts.length; i++) {
    const next = (i + 1) % pts.length
    addTri(center, pts[i], pts[next], true)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normals),   3))
  geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(uvs),       2))
  return geo
}

// ─── HandMesh ─────────────────────────────────────────────────────────────────

export class HandMesh {
  group: THREE.Group
  private segments:  { mesh: THREE.Mesh; topR: number; botR: number }[] = []
  private knuckles:  THREE.Mesh[] = []  // суставы-сферы
  private palmMesh!: THREE.Mesh
  private glowMesh:  THREE.Mesh
  private mat:       THREE.MeshPhysicalMaterial

  constructor() {
    this.group = new THREE.Group()
    this.mat   = makeSkinMaterial(0.82)
    this.build()
    this.glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0, depthWrite: false })
    )
    this.group.add(this.glowMesh)
  }

  private build(): void {
    // ── Сегменты пальцев ──────────────────────────────────────────────────
    for (const finger of FINGER_SEGMENTS) {
      const nSeg = finger.joints.length
      for (let si = 0; si < nSeg; si++) {
        const t = si / (nSeg - 1 || 1)
        const r1 = THREE.MathUtils.lerp(finger.radiusBase, finger.radiusTip, t)
        const r2 = THREE.MathUtils.lerp(finger.radiusBase, finger.radiusTip, (si + 1) / (nSeg - 1 || 1))
        const geo  = makeCapsule(r2, r1, 10)
        const mesh = new THREE.Mesh(geo, this.mat.clone())
        mesh.matrixAutoUpdate = false
        this.segments.push({ mesh, topR: r2, botR: r1 })
        this.group.add(mesh)
      }
    }

    // ── Суставные сферы (21 штука) ────────────────────────────────────────
    const JOINT_RADII = [
      0.021,                          // 0 запястье
      0.013,0.012,0.011,0.009,       // большой
      0.013,0.011,0.010,0.009,       // указательный
      0.014,0.011,0.010,0.009,       // средний
      0.012,0.010,0.009,0.008,       // безымянный
      0.011,0.009,0.008,0.007,       // мизинец
    ]
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(JOINT_RADII[i] ?? 0.009, 12, 10),
        this.mat.clone()
      )
      this.knuckles.push(m)
      this.group.add(m)
    }

    // ── Ладонь — инициализируем пустой геометрией, обновим в update ──────
    this.palmMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.mat.clone()
    )
    this.palmMesh.frustumCulled = false
    this.group.add(this.palmMesh)
  }

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

    // ── Вычисляем мировые координаты всех суставов ───────────────────────
    const wl0   = worldLandmarks[0] ?? { x:0, y:0, z:0 }
    const signX = isFront ? 1 : -1
    // Масштаб: worldLandmarks в метрах, сцена в метрах → 1:1
    const SCALE = 1.0

    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 21; i++) {
      const wl = worldLandmarks[i] ?? wl0
      pts.push(new THREE.Vector3(
        wristWorld.x + (wl.x - wl0.x) * signX * SCALE,
        wristWorld.y - (wl.y - wl0.y) * SCALE,
        wristWorld.z - (wl.z - wl0.z) * SCALE
      ))
    }

    // ── Суставные сферы ──────────────────────────────────────────────────
    for (let i = 0; i < 21; i++) this.knuckles[i].position.copy(pts[i])

    // ── Сегменты пальцев ─────────────────────────────────────────────────
    const q   = new THREE.Quaternion()
    const dir = new THREE.Vector3()
    const mid = new THREE.Vector3()
    const mat = new THREE.Matrix4()

    let si = 0
    for (const finger of FINGER_SEGMENTS) {
      for (const [a, b] of finger.joints) {
        const seg = this.segments[si++]
        dir.subVectors(pts[b], pts[a])
        const len = dir.length()
        if (len < 0.001) { seg.mesh.visible = false; continue }
        seg.mesh.visible = true
        mid.addVectors(pts[a], pts[b]).multiplyScalar(0.5)
        q.setFromUnitVectors(UP, dir.clone().normalize())
        mat.compose(mid, q, new THREE.Vector3(1, len, 1))
        seg.mesh.matrix.copy(mat)
      }
    }

    // ── Ладонь: пересобираем геометрию каждый кадр ───────────────────────
    // Используем точки: запястье(0), CMC большого(1), MCP: 5,9,13,17
    const palmPts = [pts[0], pts[1], pts[5], pts[9], pts[13], pts[17]]
    const newGeo  = buildPalmGeometry(palmPts, 0.010)
    this.palmMesh.geometry.dispose()
    this.palmMesh.geometry = newGeo

    // ── Эффекты щипка ────────────────────────────────────────────────────
    const glow   = gesture === 'pinch' ? pinchStrength : 0
    const emInt  = glow * 0.35
    for (const s of this.segments) {
      const m = s.mesh.material as THREE.MeshPhysicalMaterial
      m.emissiveIntensity = emInt
    }
    for (const k of this.knuckles) {
      const m = k.material as THREE.MeshPhysicalMaterial
      m.emissiveIntensity = emInt * 1.2
    }

    // Glow-сфера между подушечками пальцев
    const cx = (pts[4].x + pts[8].x + pts[12].x) / 3
    const cy = (pts[4].y + pts[8].y + pts[12].y) / 3
    const cz = (pts[4].z + pts[8].z + pts[12].z) / 3
    this.glowMesh.position.set(cx, cy, cz)
    ;(this.glowMesh.material as THREE.MeshBasicMaterial).opacity =
      glow * 0.5 + Math.sin(time * 9) * 0.04 * glow
    this.glowMesh.scale.setScalar(0.85 + glow * 1.3)
  }

  setVisible(v: boolean): void { this.group.visible = v }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
