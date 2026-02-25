/**
 * FloatingButton — интерактивная 3D кнопка
 */

import * as THREE from 'three'

export interface ButtonOptions {
  label: string
  color?: number
  position?: THREE.Vector3
  width?: number
  height?: number
  onClick?: () => void
}

export class FloatingButton {
  mesh: THREE.Mesh
  private label: string
  private baseColor: number
  private hovered = false
  private pressed = false
  private pressTime = 0
  private _onClick?: () => void
  private size: THREE.Vector2

  constructor(opts: ButtonOptions) {
    this.label = opts.label
    this.baseColor = opts.color ?? 0x4f46e5
    this._onClick = opts.onClick
    const w = opts.width ?? 0.55
    const h = opts.height ?? 0.18
    this.size = new THREE.Vector2(w, h)

    const geo = new THREE.BoxGeometry(w, h, 0.04)
    const mat = new THREE.MeshPhysicalMaterial({
      color: this.baseColor,
      transparent: true,
      opacity: 0.9,
      roughness: 0.2,
      metalness: 0.1,
      emissive: this.baseColor,
      emissiveIntensity: 0.1
    })
    this.mesh = new THREE.Mesh(geo, mat)
    if (opts.position) this.mesh.position.copy(opts.position)
  }

  containsPoint(worldPoint: THREE.Vector3): boolean {
    const local = this.mesh.worldToLocal(worldPoint.clone())
    return (
      Math.abs(local.x) < this.size.x / 2 + 0.05 &&
      Math.abs(local.y) < this.size.y / 2 + 0.05 &&
      Math.abs(local.z) < 0.15
    )
  }

  setHovered(v: boolean): void {
    if (this.hovered === v) return
    this.hovered = v
    this.updateMaterial()
  }

  triggerPress(): void {
    if (this.pressed) return
    this.pressed = true
    this.pressTime = performance.now()
    this.updateMaterial()
    this._onClick?.()
    // Анимация нажатия
    this.mesh.scale.set(0.92, 0.92, 0.92)
    setTimeout(() => {
      this.pressed = false
      this.mesh.scale.set(1, 1, 1)
      this.updateMaterial()
    }, 200)
  }

  private updateMaterial(): void {
    const mat = this.mesh.material as THREE.MeshPhysicalMaterial
    if (this.pressed) {
      mat.emissiveIntensity = 0.8
      mat.color.setHex(0x818cf8)
    } else if (this.hovered) {
      mat.emissiveIntensity = 0.4
      mat.color.setHex(this.baseColor).lerp(new THREE.Color(0xffffff), 0.2)
    } else {
      mat.emissiveIntensity = 0.1
      mat.color.setHex(this.baseColor)
    }
  }
}
