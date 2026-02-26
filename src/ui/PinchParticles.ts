/**
 * PinchParticles — эффект частиц при щипке
 *
 * Вместо отдельного "режима частиц" это автоматический эффект:
 * при каждом щипке от точки соприкосновения пальцев вырываются
 * искры разных цветов, разлетаются и гаснут (~0.6 сек).
 *
 * Работает поверх любого режима руки (skeleton или 3D).
 */
import * as THREE from 'three'

const COLORS = [0x6366f1, 0x06b6d4, 0xa78bfa, 0xfbbf24, 0xf472b6, 0x34d399]
const MAX_PARTICLES = 180

interface Particle {
  pos:      THREE.Vector3
  vel:      THREE.Vector3
  life:     number   // 0..1, убывает
  maxLife:  number
  color:    THREE.Color
  size:     number
}

export class PinchParticles {
  private scene: THREE.Scene
  private particles: Particle[] = []
  private geometry: THREE.BufferGeometry
  private positions: Float32Array
  private colors:    Float32Array
  private sizes:     Float32Array
  private points:    THREE.Points

  // State tracking per hand
  private wasPinching: boolean[] = [false, false]
  private pinchPos:    (THREE.Vector3 | null)[] = [null, null]

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.positions = new Float32Array(MAX_PARTICLES * 3)
    this.colors    = new Float32Array(MAX_PARTICLES * 3)
    this.sizes     = new Float32Array(MAX_PARTICLES)

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color',    new THREE.BufferAttribute(this.colors,    3))
    this.geometry.setAttribute('size',     new THREE.BufferAttribute(this.sizes,     1))

    const mat = new THREE.PointsMaterial({
      size: 0.025,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(this.geometry, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  /**
   * Вызывается каждый кадр.
   * handIdx: 0=левая, 1=правая
   * isPinching: текущий жест щипок
   * pinchPoint: мировая точка между большим и указательным пальцами
   * dt: delta time в секундах
   */
  update(
    dt: number,
    hands: { isPinching: boolean; pinchPoint: THREE.Vector3 | null }[]
  ): void {
    // Spawn burst on pinch start
    for (let hi = 0; hi < hands.length; hi++) {
      const { isPinching, pinchPoint } = hands[hi]
      if (isPinching && !this.wasPinching[hi] && pinchPoint) {
        this.spawnBurst(pinchPoint, 24 + Math.floor(Math.random() * 12))
      }
      // Continuous trail while holding pinch
      if (isPinching && pinchPoint) {
        if (Math.random() < 0.25) this.spawnBurst(pinchPoint, 2)
      }
      this.wasPinching[hi] = isPinching
    }

    // Update existing particles
    let alive = 0
    for (const p of this.particles) {
      p.life -= dt / p.maxLife
      if (p.life <= 0) continue

      p.pos.addScaledVector(p.vel, dt)
      // Gravity + drag
      p.vel.y -= dt * 0.6
      p.vel.multiplyScalar(1 - dt * 1.8)

      // Write to buffers
      const i = alive * 3
      this.positions[i]   = p.pos.x
      this.positions[i+1] = p.pos.y
      this.positions[i+2] = p.pos.z
      const alpha = Math.pow(Math.max(0, p.life), 0.5)
      this.colors[i]   = p.color.r * alpha
      this.colors[i+1] = p.color.g * alpha
      this.colors[i+2] = p.color.b * alpha
      this.sizes[alive] = p.size * (0.5 + p.life * 0.5)
      alive++
    }

    // Compact alive particles
    this.particles = this.particles.filter(p => p.life > 0)

    // Zero out dead slots
    for (let i = alive; i < MAX_PARTICLES; i++) {
      this.positions[i*3] = this.positions[i*3+1] = this.positions[i*3+2] = 0
      this.sizes[i] = 0
    }

    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.color.needsUpdate    = true
    this.geometry.attributes.size.needsUpdate     = true
    this.geometry.setDrawRange(0, Math.max(alive, 1))
  }

  private spawnBurst(origin: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break

      const c = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)])
      // Random direction — mostly forward/up/sideways
      const theta = Math.random() * Math.PI * 2
      const phi   = (Math.random() - 0.3) * Math.PI * 0.8
      const speed = 0.4 + Math.random() * 1.2

      this.particles.push({
        pos:     origin.clone().addScalar((Math.random() - 0.5) * 0.03),
        vel:     new THREE.Vector3(
          Math.cos(theta) * Math.cos(phi) * speed,
          Math.sin(phi)   * speed,
          Math.sin(theta) * Math.cos(phi) * speed
        ),
        life:    1.0,
        maxLife: 0.35 + Math.random() * 0.45,
        color:   c,
        size:    0.012 + Math.random() * 0.022,
      })
    }
  }

  dispose(): void {
    this.geometry.dispose()
    this.scene.remove(this.points)
  }
}
