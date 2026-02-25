/**
 * HandCursor — 3D визуализация кончика пальца и жестов
 */

import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'

export class HandCursor {
  group: THREE.Group
  private sphere: THREE.Mesh
  private ring: THREE.Mesh
  private trailPoints: THREE.Vector3[] = []
  private trailLine?: THREE.Line
  private pinchIndicator: THREE.Mesh

  constructor(color: number = 0x06b6d4) {
    this.group = new THREE.Group()

    // Основная сфера — кончик пальца
    const geo = new THREE.SphereGeometry(0.025, 16, 16)
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
      roughness: 0.1
    })
    this.sphere = new THREE.Mesh(geo, mat)
    this.group.add(this.sphere)

    // Кольцо вокруг (pulse эффект)
    const ringGeo = new THREE.RingGeometry(0.04, 0.055, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    })
    this.ring = new THREE.Mesh(ringGeo, ringMat)
    this.group.add(this.ring)

    // Индикатор пинча — маленькая сфера
    this.pinchIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 })
    )
    this.group.add(this.pinchIndicator)

    // Трейл
    this.initTrail(color)
  }

  private initTrail(color: number): void {
    for (let i = 0; i < 12; i++) this.trailPoints.push(new THREE.Vector3())
    const geo = new THREE.BufferGeometry().setFromPoints(this.trailPoints)
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 })
    this.trailLine = new THREE.Line(geo, mat)
    this.group.parent?.add(this.trailLine)
  }

  update(position: THREE.Vector3, gesture: GestureType, pinchStrength: number, time: number): void {
    this.group.position.copy(position)

    // Pulse ring
    const pulse = 1 + Math.sin(time * 4) * 0.15
    this.ring.scale.set(pulse, pulse, 1)
    this.ring.lookAt(0, 0, 0)

    // Pinch indicator
    const pinchMat = this.pinchIndicator.material as THREE.MeshBasicMaterial
    pinchMat.opacity = pinchStrength * 0.9
    const pinchScale = 0.5 + pinchStrength * 1.5
    this.pinchIndicator.scale.setScalar(pinchScale)
    this.pinchIndicator.position.y = 0.05

    // Цвет по жесту
    const mat = this.sphere.material as THREE.MeshPhysicalMaterial
    if (gesture === 'pinch')    { mat.emissiveIntensity = 1.0 + Math.sin(time * 8) * 0.3 }
    else if (gesture === 'grab'){ mat.emissiveIntensity = 0.8 }
    else                         { mat.emissiveIntensity = 0.5 }

    // Трейл
    this.trailPoints.pop()
    this.trailPoints.unshift(position.clone())
    if (this.trailLine) {
      const geo = this.trailLine.geometry as THREE.BufferGeometry
      geo.setFromPoints(this.trailPoints)
      geo.attributes.position.needsUpdate = true
    }
  }

  setVisible(v: boolean): void {
    this.group.visible = v
    if (this.trailLine) this.trailLine.visible = v
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group)
    if (this.trailLine) scene.add(this.trailLine)
  }
}
