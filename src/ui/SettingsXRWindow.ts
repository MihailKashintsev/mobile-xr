/**
 * SettingsXRWindow — настройки в виде XRWindow (нажимается рукой)
 *
 * Отображает только MR-нужные настройки:
 * - Режим руки: Скелет / 3D меш
 * - Цветокоррекция: Вкл/Выкл + яркость + контраст + насыщенность
 *
 * Кнопки созданы как XRWindow buttons → нажимаются щипком.
 *
 * VR-калибровка и камера (сложные слайдеры) остаются в HTML SettingsWindow
 * и открываются отдельной кнопкой (стандартный стерео toggle).
 */
import * as THREE from 'three'
import { XRWindow } from './WindowManager'
import type { ColorGrading } from './ColorGrading'

export type HandRenderMode = 'skeleton' | '3d'

export class SettingsXRWindow {
  readonly window: XRWindow
  onHandMode?: (m: HandRenderMode) => void

  private _handMode: HandRenderMode = 'skeleton'
  private _cg?: ColorGrading

  constructor() {
    this.window = new XRWindow({
      title:    '⚙️ Настройки',
      width:    1.40,
      height:   0.80,
      closeable: true,
      position: new THREE.Vector3(-0.8, 0.1, -2.4),
      content:  { buttons: [] },
    })
    this.window.group.visible = false
    this._rebuild()
  }

  setColorGrading(cg: ColorGrading): void { this._cg = cg; this._rebuild() }

  toggle(): void {
    this.window.group.visible = !this.window.group.visible
  }
  isOpen(): boolean { return this.window.group.visible }
  open():  void { this.window.group.visible = true  }
  close(): void { this.window.group.visible = false }

  private _rebuild(): void {
    const cg = this._cg
    const hm = this._handMode
    const cgOn = cg?.getParams().enabled ?? false

    const btns = [
      // Режим руки
      {
        label: hm === 'skeleton' ? '✋ Скелет ✓' : '✋ Скелет',
        color: hm === 'skeleton' ? 0x1d4ed8 : 0x1e293b,
        onClick: () => { this._handMode = 'skeleton'; this.onHandMode?.('skeleton'); this._rebuild() },
      },
      {
        label: hm === '3d' ? '🖐 3D меш ✓' : '🖐 3D меш',
        color: hm === '3d' ? 0x1d4ed8 : 0x1e293b,
        onClick: () => { this._handMode = '3d'; this.onHandMode?.('3d'); this._rebuild() },
      },
      // Цветокоррекция
      {
        label: cgOn ? '🎨 Цвет ВКЛ ✓' : '🎨 Цвет ВЫКЛ',
        color: cgOn ? 0x065f46 : 0x1e293b,
        onClick: () => { cg?.setParams({ enabled: !cgOn }); this._rebuild() },
      },
      // Яркость -/+
      {
        label: '☀ Ярче',
        color: 0x78350f,
        onClick: () => {
          const p = cg?.getParams()
          if (p) cg?.setParams({ brightness: Math.min(0.5, (p.brightness ?? 0) + 0.1) })
        },
      },
      {
        label: '🌑 Темнее',
        color: 0x1e293b,
        onClick: () => {
          const p = cg?.getParams()
          if (p) cg?.setParams({ brightness: Math.max(-0.5, (p.brightness ?? 0) - 0.1) })
        },
      },
      // Контраст -/+
      {
        label: '⬛ Контраст+',
        color: 0x1e3a5f,
        onClick: () => {
          const p = cg?.getParams()
          if (p) cg?.setParams({ contrast: Math.min(2.0, (p.contrast ?? 1) + 0.1) })
        },
      },
      {
        label: '⬜ Контраст-',
        color: 0x374151,
        onClick: () => {
          const p = cg?.getParams()
          if (p) cg?.setParams({ contrast: Math.max(0.5, (p.contrast ?? 1) - 0.1) })
        },
      },
      // Сброс
      {
        label: '↺ Сброс цвета',
        color: 0x4c1d95,
        onClick: () => { cg?.reset(); this._rebuild() },
      },
    ]

    this.window.replaceButtons(btns)
  }
}
