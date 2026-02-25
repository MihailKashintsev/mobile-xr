/**
 * FloatingPanel — парящая 3D панель с glassmorphism эффектом
 */

import * as THREE from 'three'
import type { FloatingButton } from './FloatingButton'

export interface PanelOptions {
  width?: number
  height?: number
  title?: string
  position?: THREE.Vector3
}

export class FloatingPanel {
  group: THREE.Group
  private mesh: THREE.Mesh
  private titleMesh?: THREE.Mesh
  buttons: FloatingButton[] = []
  private hovered = false
  private floatOffset = Math.random() * Math.PI * 2
  private floatSpeed = 0.8 + Math.random() * 0.4

  constructor(opts: PanelOptions = {}) {
    this.group = new THREE.Group()
    const w = opts.width ?? 1.4
    const h = opts.height ?? 0.9

    // Основная панель — полупрозрачное стекло
    const geo = new THREE.RoundedBoxGeometry ? 
      new (THREE.RoundedBoxGeometry as any)(w, h, 0.02, 4, 8) :
      new THREE.BoxGeometry(w, h, 0.02)
    
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a2e,
      transparent: true,
      opacity: 0.75,
      roughness: 0.1,
      metalness: 0.05,
      transmission: 0.3,
      thickness: 0.5,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.group.add(this.mesh)

    // Бордер-свечение
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.01, h + 0.01, 0.025))
    const borderMat = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.6 })
    const border = new THREE.LineSegments(borderGeo, borderMat)
    this.group.add(border)

    // Заголовок-полоса
    if (opts.title) {
      const titleBar = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.12, 0.025),
        new THREE.MeshPhysicalMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8 })
      )
      titleBar.position.set(0, h/2 - 0.06, 0.001)
      this.group.add(titleBar)
    }

    if (opts.position) {
      this.group.position.copy(opts.position)
    } else {
      this.group.position.set(0, 0, -2.5)
    }

    // Лёгкий наклон к пользователю
    this.group.rotation.x = -0.1
  }

  addButton(btn: FloatingButton): void {
    this.buttons.push(btn)
    this.group.add(btn.mesh)
  }

  /**
   * Проверяет пересечение с 3D точкой (кончик пальца)
   * Возвращает кнопку под курсором или null
   */
  hitTest(worldPoint: THREE.Vector3): FloatingButton | null {
    for (const btn of this.buttons) {
      if (btn.containsPoint(worldPoint)) return btn
    }
    return null
  }

  update(time: number): void {
    // Парящая анимация
    const floatY = Math.sin(time * this.floatSpeed + this.floatOffset) * 0.015
    const floatRot = Math.sin(time * this.floatSpeed * 0.5 + this.floatOffset) * 0.005
    this.mesh.position.y = floatY
    this.group.rotation.z = floatRot
  }

  setHovered(v: boolean): void {
    if (this.hovered === v) return
    this.hovered = v
    const mat = this.mesh.material as THREE.MeshPhysicalMaterial
    mat.opacity = v ? 0.9 : 0.75
  }
}
