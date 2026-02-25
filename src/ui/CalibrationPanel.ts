/**
 * CalibrationPanel — HTML-оверлей для настройки стерео/VR
 *
 * Открывается по кнопке, поверх 3D сцены.
 * Не использует Three.js — чистый DOM для отзывчивости.
 * Изменения применяются мгновенно (live preview).
 */

import type { StereoRenderer, StereoCalibration } from '../xr/StereoRenderer'
import { DEFAULT_CALIBRATION } from '../xr/StereoRenderer'

interface SliderDef {
  key:   keyof StereoCalibration
  label: string
  min:   number
  max:   number
  step:  number
  unit:  string
  hint:  string
}

const SLIDERS: SliderDef[] = [
  { key: 'ipd',            label: 'Межзрачковое расстояние (IPD)', min: 50,   max: 80,  step: 0.5, unit: 'мм',  hint: 'Расстояние между зрачками. Среднее — 63 мм.' },
  { key: 'fov',            label: 'Поле зрения (FOV)',             min: 60,   max: 120, step: 1,   unit: '°',   hint: 'Угол обзора. Зависит от линз очков.' },
  { key: 'lensDistance',   label: 'Дистанция линзы',               min: 0.1,  max: 0.9, step: 0.01, unit: '',   hint: 'Как далеко ваши глаза от линзы.' },
  { key: 'k1',             label: 'Дисторсия (K1)',                min: 0,    max: 0.6, step: 0.01, unit: '',   hint: 'Основная бочкообразная коррекция линзы.' },
  { key: 'k2',             label: 'Дисторсия (K2)',                min: 0,    max: 0.4, step: 0.01, unit: '',   hint: 'Вторичная коррекция (тонкая настройка).' },
  { key: 'verticalOffset', label: 'Вертикальный сдвиг',            min: -0.1, max: 0.1, step: 0.005, unit: '', hint: 'Коррекция если изображение плывёт вверх/вниз.' },
  { key: 'zoom',           label: 'Масштаб',                       min: 0.7,  max: 1.4, step: 0.01, unit: 'x', hint: 'Увеличение/уменьшение изображения.' },
]

// Пресеты для популярных очков
const PRESETS: Record<string, Partial<StereoCalibration> & { name: string }> = {
  generic: {
    name: '📦 Общий (Cardboard)',
    ipd: 63, fov: 90, k1: 0.22, k2: 0.1, zoom: 1.0, lensDistance: 0.5, verticalOffset: 0
  },
  vr_box: {
    name: '🥽 VR BOX',
    ipd: 63, fov: 96, k1: 0.30, k2: 0.15, zoom: 0.95, lensDistance: 0.45, verticalOffset: 0
  },
  shinecon: {
    name: '🎮 Shinecon',
    ipd: 64, fov: 100, k1: 0.18, k2: 0.08, zoom: 1.0, lensDistance: 0.5, verticalOffset: 0
  },
  googlasso: {
    name: '🖨 Google Cardboard',
    ipd: 60, fov: 80, k1: 0.22, k2: 0.10, zoom: 1.0, lensDistance: 0.48, verticalOffset: 0
  },
  no_distortion: {
    name: '⬛ Без дисторсии',
    ipd: 63, fov: 90, k1: 0, k2: 0, zoom: 1.0, lensDistance: 0.5, verticalOffset: 0
  }
}

export class CalibrationPanel {
  private container: HTMLElement
  private stereo: StereoRenderer
  private visible = false
  private sliderEls: Map<keyof StereoCalibration, HTMLInputElement> = new Map()
  private valueEls:  Map<keyof StereoCalibration, HTMLSpanElement>  = new Map()

  constructor(stereo: StereoRenderer) {
    this.stereo = stereo
    this.container = document.createElement('div')
    this.container.id = 'calib-panel'
    this.buildCSS()
    this.buildHTML()
    document.body.appendChild(this.container)
  }

  // ─── Открыть / Закрыть ────────────────────────────────────────────────────────

  open(): void {
    this.visible = true
    this.container.classList.add('open')
    this.syncSlidersFromCalib()
    // Блокируем ориентацию — чтобы не вращало во время настройки
    try { screen.orientation?.lock('portrait') } catch {}
  }

  close(): void {
    this.visible = false
    this.container.classList.remove('open')
    try { screen.orientation?.unlock() } catch {}
  }

  toggle(): void { this.visible ? this.close() : this.open() }
  isOpen(): boolean { return this.visible }

  // ─── Построение UI ────────────────────────────────────────────────────────────

  private buildHTML(): void {
    this.container.innerHTML = `
      <div class="calib-backdrop"></div>
      <div class="calib-sheet">
        <div class="calib-header">
          <div class="calib-title">⚙️ Настройка VR</div>
          <button class="calib-close" id="calib-close-btn">✕</button>
        </div>

        <div class="calib-section-label">Очки / гарнитура</div>
        <div class="preset-grid" id="preset-grid"></div>

        <div class="calib-section-label">Тонкая настройка</div>
        <div class="sliders-list" id="sliders-list"></div>

        <div class="calib-footer">
          <button class="calib-btn calib-btn-reset" id="calib-reset-btn">↺ Сброс</button>
          <button class="calib-btn calib-btn-apply" id="calib-apply-btn">✓ Применить</button>
        </div>

        <div class="calib-tip">
          💡 Надень очки и регулируй пока изображение не станет чётким и без двоения
        </div>
      </div>
    `

    // Пресеты
    const grid = this.container.querySelector('#preset-grid')!
    for (const [id, preset] of Object.entries(PRESETS)) {
      const btn = document.createElement('button')
      btn.className = 'preset-btn'
      btn.textContent = preset.name
      btn.addEventListener('click', () => {
        this.applyPreset(id)
        grid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
      grid.appendChild(btn)
    }

    // Слайдеры
    const list = this.container.querySelector('#sliders-list')!
    const calib = this.stereo.getCalibration()
    for (const def of SLIDERS) {
      const row = document.createElement('div')
      row.className = 'slider-row'

      const val = (calib[def.key] as number).toFixed(def.step < 0.01 ? 3 : def.step < 0.1 ? 2 : 1)
      row.innerHTML = `
        <div class="slider-top">
          <span class="slider-label">${def.label}</span>
          <span class="slider-value" id="val-${def.key}">${val}${def.unit}</span>
        </div>
        <input type="range"
          class="slider-input"
          id="sl-${def.key}"
          min="${def.min}" max="${def.max}" step="${def.step}"
          value="${calib[def.key]}"
        />
        <div class="slider-hint">${def.hint}</div>
      `
      list.appendChild(row)

      const input = row.querySelector(`#sl-${def.key}`) as HTMLInputElement
      const valueEl = row.querySelector(`#val-${def.key}`) as HTMLSpanElement
      this.sliderEls.set(def.key, input)
      this.valueEls.set(def.key, valueEl)

      // Live preview при перетаскивании
      input.addEventListener('input', () => {
        const num = parseFloat(input.value)
        const dp = def.step < 0.01 ? 3 : def.step < 0.1 ? 2 : 1
        valueEl.textContent = `${num.toFixed(dp)}${def.unit}`
        this.stereo.setCalibration({ [def.key]: num } as Partial<StereoCalibration>)
      })
    }

    // Кнопки
    this.container.querySelector('#calib-close-btn')!.addEventListener('click', () => this.close())
    this.container.querySelector('.calib-backdrop')!.addEventListener('click', () => this.close())
    this.container.querySelector('#calib-reset-btn')!.addEventListener('click', () => {
      this.stereo.resetCalibration()
      this.syncSlidersFromCalib()
    })
    this.container.querySelector('#calib-apply-btn')!.addEventListener('click', () => this.close())
  }

  private applyPreset(id: string): void {
    const preset = PRESETS[id]
    if (!preset) return
    const { name, ...vals } = preset
    this.stereo.setCalibration(vals)
    this.syncSlidersFromCalib()
  }

  private syncSlidersFromCalib(): void {
    const calib = this.stereo.getCalibration()
    for (const def of SLIDERS) {
      const input = this.sliderEls.get(def.key)
      const valueEl = this.valueEls.get(def.key)
      if (!input || !valueEl) continue
      const num = calib[def.key] as number
      input.value = String(num)
      const dp = def.step < 0.01 ? 3 : def.step < 0.1 ? 2 : 1
      valueEl.textContent = `${num.toFixed(dp)}${def.unit}`
    }
  }

  // ─── CSS ──────────────────────────────────────────────────────────────────────

  private buildCSS(): void {
    const style = document.createElement('style')
    style.textContent = `
      #calib-panel {
        position: fixed; inset: 0; z-index: 5000;
        display: none; align-items: flex-end; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #calib-panel.open { display: flex; }

      .calib-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      }
      .calib-sheet {
        position: relative; z-index: 1;
        width: 100%; max-width: 520px;
        max-height: 85vh; overflow-y: auto;
        background: #111827;
        border-radius: 20px 20px 0 0;
        padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
        border-top: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 -8px 40px rgba(0,0,0,0.6);
        -webkit-overflow-scrolling: touch;
      }
      .calib-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
      }
      .calib-title { font-size: 1.1rem; font-weight: 700; color: #f9fafb; }
      .calib-close {
        background: rgba(255,255,255,0.08); border: none; color: #9ca3af;
        width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
        font-size: 1rem; display: flex; align-items: center; justify-content: center;
      }

      .calib-section-label {
        font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em;
        color: #6b7280; text-transform: uppercase; margin-bottom: 10px;
      }

      .preset-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 8px; margin-bottom: 20px;
      }
      .preset-btn {
        background: #1f2937; border: 1px solid rgba(255,255,255,0.07);
        color: #d1d5db; border-radius: 10px; padding: 10px 8px;
        font-size: 0.78rem; cursor: pointer; text-align: center;
        transition: all 0.15s;
      }
      .preset-btn.active, .preset-btn:active {
        background: #312e81; border-color: #6366f1; color: #a5b4fc;
      }

      .sliders-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
      .slider-row {
        background: #1f2937; border-radius: 12px; padding: 12px 14px;
        border: 1px solid rgba(255,255,255,0.05);
      }
      .slider-top {
        display: flex; justify-content: space-between; align-items: baseline;
        margin-bottom: 8px;
      }
      .slider-label { font-size: 0.82rem; color: #e5e7eb; font-weight: 500; }
      .slider-value {
        font-size: 0.85rem; color: #6366f1; font-weight: 700;
        font-variant-numeric: tabular-nums; min-width: 48px; text-align: right;
      }
      .slider-input {
        width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
        background: linear-gradient(90deg, #6366f1 var(--val, 50%), #374151 var(--val, 50%));
        border-radius: 99px; outline: none; cursor: pointer;
      }
      .slider-input::-webkit-slider-thumb {
        -webkit-appearance: none; width: 20px; height: 20px;
        background: #6366f1; border-radius: 50%;
        box-shadow: 0 0 0 3px rgba(99,102,241,0.3);
      }
      .slider-hint { font-size: 0.72rem; color: #6b7280; margin-top: 6px; }

      .calib-footer {
        display: flex; gap: 10px; margin-bottom: 12px;
      }
      .calib-btn {
        flex: 1; padding: 13px; border: none; border-radius: 12px;
        font-size: 0.9rem; font-weight: 600; cursor: pointer;
      }
      .calib-btn-reset { background: #374151; color: #9ca3af; }
      .calib-btn-apply { background: #6366f1; color: white; }
      .calib-tip {
        text-align: center; font-size: 0.75rem; color: #4b5563;
        line-height: 1.5; padding: 0 8px;
      }
    `
    document.head.appendChild(style)
  }
}
