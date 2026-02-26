import type { StereoRenderer, StereoCalibration } from '../xr/StereoRenderer'
import { DEFAULT_CALIBRATION } from '../xr/StereoRenderer'

interface SliderDef {
  key: keyof StereoCalibration
  label: string; min: number; max: number; step: number; unit: string; hint: string
}

const SLIDERS: SliderDef[] = [
  { key:'ipd',            label:'Межзрачковое (IPD)',      min:50,   max:80,   step:0.5,  unit:'мм', hint:'Расстояние между зрачками. Среднее — 63 мм.' },
  { key:'fov',            label:'Поле зрения (FOV)',        min:60,   max:130,  step:1,    unit:'°',  hint:'Угол обзора камер. Зависит от линз.' },
  { key:'lensDistance',   label:'Центр линзы (Y)',          min:0.1,  max:0.9,  step:0.01, unit:'',   hint:'Вертикальный центр оптической дисторсии.' },
  { key:'k1',             label:'Дисторсия K1',             min:0,    max:0.8,  step:0.01, unit:'',   hint:'Основная бочкообразная коррекция линзы.' },
  { key:'k2',             label:'Дисторсия K2',             min:0,    max:0.5,  step:0.01, unit:'',   hint:'Вторичная коррекция — тонкая настройка.' },
  { key:'verticalOffset', label:'Вертикальный сдвиг',       min:-0.1, max:0.1,  step:0.005,unit:'',   hint:'Если изображение плывёт вверх/вниз.' },
  { key:'zoom',           label:'Масштаб',                  min:0.6,  max:1.5,  step:0.01, unit:'x',  hint:'Увеличение/уменьшение изображения.' },
  { key:'eyeShiftL',      label:'⬅ Сдвиг левого глаза',    min:-0.15,max:0.15, step:0.005,unit:'',   hint:'Горизонтальный сдвиг картинки левого глаза.' },
  { key:'eyeShiftR',      label:'Сдвиг правого глаза ➡',   min:-0.15,max:0.15, step:0.005,unit:'',   hint:'Горизонтальный сдвиг картинки правого глаза.' },
]

const PRESETS: Record<string, Partial<StereoCalibration> & { name: string }> = {
  generic:    { name:'📦 Cardboard',        ipd:63, fov:90,  k1:0.22, k2:0.10, zoom:1.0,  lensDistance:0.5,  verticalOffset:0, eyeShiftL:0, eyeShiftR:0 },
  gear_vr2:   { name:'🌌 Samsung Gear VR 2',ipd:64, fov:101, k1:0.34, k2:0.13, zoom:0.98, lensDistance:0.48, verticalOffset:0, eyeShiftL:0, eyeShiftR:0 },
  vr_box:     { name:'🥽 VR BOX',           ipd:63, fov:96,  k1:0.30, k2:0.15, zoom:0.95, lensDistance:0.45, verticalOffset:0, eyeShiftL:0, eyeShiftR:0 },
  shinecon:   { name:'🎮 Shinecon',         ipd:64, fov:100, k1:0.18, k2:0.08, zoom:1.0,  lensDistance:0.5,  verticalOffset:0, eyeShiftL:0, eyeShiftR:0 },
  cardboard_v2:{name:'📎 Cardboard v2',     ipd:60, fov:80,  k1:0.22, k2:0.10, zoom:1.0,  lensDistance:0.48, verticalOffset:0, eyeShiftL:0, eyeShiftR:0 },
  flat:       { name:'⬛ Без дисторсии',    ipd:63, fov:90,  k1:0,    k2:0,    zoom:1.0,  lensDistance:0.5,  verticalOffset:0, eyeShiftL:0, eyeShiftR:0 },
}

export type HandRenderMode = 'skeleton' | '3d'

export class CalibrationPanel {
  private container: HTMLElement
  private stereo: StereoRenderer
  private visible = false
  private sliderEls: Map<keyof StereoCalibration, HTMLInputElement> = new Map()
  private valueEls:  Map<keyof StereoCalibration, HTMLSpanElement>  = new Map()
  private onHandModeChange?: (m: HandRenderMode) => void

  constructor(stereo: StereoRenderer, onHandMode?: (m: HandRenderMode) => void) {
    this.stereo = stereo
    this.onHandModeChange = onHandMode
    this.container = document.createElement('div')
    this.container.id = 'calib-panel'
    this.buildCSS(); this.buildHTML()
    document.body.appendChild(this.container)
  }

  open(): void {
    this.visible = true
    this.container.classList.add('open')
    this.syncSlidersFromCalib()
  }

  close(): void { this.visible = false; this.container.classList.remove('open') }
  toggle(): void { this.visible ? this.close() : this.open() }
  isOpen(): boolean { return this.visible }

  private buildHTML(): void {
    this.container.innerHTML = `
      <div class="calib-backdrop"></div>
      <div class="calib-sheet">
        <div class="calib-header">
          <div class="calib-title">⚙️ Настройки VR</div>
          <button class="calib-close" id="calib-close-btn">✕</button>
        </div>

        <div class="calib-section-label">Гарнитура / очки</div>
        <div class="preset-grid" id="preset-grid"></div>

        <div class="calib-section-label">Отображение рук</div>
        <div class="hand-mode-row" id="hand-mode-row">
          <button class="hand-mode-btn active" data-mode="skeleton">💀 Скелет</button>
          <button class="hand-mode-btn" data-mode="3d">🖐 3D модель</button>
        </div>

        <div class="calib-section-label">Тонкая настройка</div>
        <div class="sliders-list" id="sliders-list"></div>

        <div class="calib-footer">
          <button class="calib-btn calib-btn-reset" id="calib-reset-btn">↺ Сброс</button>
          <button class="calib-btn calib-btn-apply" id="calib-apply-btn">✓ Готово</button>
        </div>
        <div class="calib-tip">💡 Надень очки — регулируй пока не пропадёт двоение</div>
      </div>
    `

    const grid = this.container.querySelector('#preset-grid')!
    for (const [id, p] of Object.entries(PRESETS)) {
      const btn = document.createElement('button')
      btn.className = 'preset-btn'; btn.textContent = p.name
      btn.addEventListener('click', () => {
        this.applyPreset(id)
        grid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
      grid.appendChild(btn)
    }

    const modeRow = this.container.querySelector('#hand-mode-row')!
    modeRow.querySelectorAll('.hand-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as HandRenderMode
        modeRow.querySelectorAll('.hand-mode-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.onHandModeChange?.(mode)
      })
    })

    const list = this.container.querySelector('#sliders-list')!
    const calib = this.stereo.getCalibration()
    for (const def of SLIDERS) {
      const row = document.createElement('div')
      row.className = 'slider-row'
      const dp = def.step < 0.01 ? 3 : def.step < 0.1 ? 2 : 1
      const val = (calib[def.key] as number).toFixed(dp)
      row.innerHTML = `
        <div class="slider-top">
          <span class="slider-label">${def.label}</span>
          <span class="slider-value" id="val-${def.key}">${val}${def.unit}</span>
        </div>
        <input type="range" class="slider-input" id="sl-${def.key}"
          min="${def.min}" max="${def.max}" step="${def.step}" value="${calib[def.key]}" />
        <div class="slider-hint">${def.hint}</div>
      `
      list.appendChild(row)
      const input = row.querySelector(`#sl-${def.key}`) as HTMLInputElement
      const vel   = row.querySelector(`#val-${def.key}`) as HTMLSpanElement
      this.sliderEls.set(def.key, input); this.valueEls.set(def.key, vel)
      input.addEventListener('input', () => {
        const n = parseFloat(input.value)
        vel.textContent = `${n.toFixed(dp)}${def.unit}`
        this.stereo.setCalibration({ [def.key]: n } as Partial<StereoCalibration>)
      })
    }

    this.container.querySelector('#calib-close-btn')!.addEventListener('click',  () => this.close())
    this.container.querySelector('.calib-backdrop')!.addEventListener('click',   () => this.close())
    this.container.querySelector('#calib-reset-btn')!.addEventListener('click',  () => { this.stereo.resetCalibration(); this.syncSlidersFromCalib() })
    this.container.querySelector('#calib-apply-btn')!.addEventListener('click',  () => this.close())
  }

  private applyPreset(id: string): void {
    const { name, ...vals } = PRESETS[id]
    this.stereo.setCalibration(vals)
    this.syncSlidersFromCalib()
  }

  private syncSlidersFromCalib(): void {
    const calib = this.stereo.getCalibration()
    for (const def of SLIDERS) {
      const input = this.sliderEls.get(def.key)
      const vel   = this.valueEls.get(def.key)
      if (!input || !vel) continue
      const n  = calib[def.key] as number
      const dp = def.step < 0.01 ? 3 : def.step < 0.1 ? 2 : 1
      input.value = String(n); vel.textContent = `${n.toFixed(dp)}${def.unit}`
    }
  }

  private buildCSS(): void {
    const s = document.createElement('style')
    s.textContent = `
      #calib-panel{position:fixed;inset:0;z-index:5000;display:none;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
      #calib-panel.open{display:flex;}
      .calib-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(5px);}
      .calib-sheet{position:relative;z-index:1;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:#111827;border-radius:20px 20px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.08);box-shadow:0 -8px 40px rgba(0,0,0,.6);-webkit-overflow-scrolling:touch;}
      .calib-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}
      .calib-title{font-size:1.1rem;font-weight:700;color:#f9fafb;}
      .calib-close{background:rgba(255,255,255,.08);border:none;color:#9ca3af;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;}
      .calib-section-label{font-size:.7rem;font-weight:600;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin-bottom:10px;}
      .preset-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;}
      .preset-btn{background:#1f2937;border:1px solid rgba(255,255,255,.07);color:#d1d5db;border-radius:10px;padding:10px 8px;font-size:.76rem;cursor:pointer;text-align:center;transition:all .15s;}
      .preset-btn.active,.preset-btn:active{background:#312e81;border-color:#6366f1;color:#a5b4fc;}
      .hand-mode-row{display:flex;gap:8px;margin-bottom:20px;}
      .hand-mode-btn{flex:1;background:#1f2937;border:1px solid rgba(255,255,255,.07);color:#d1d5db;border-radius:10px;padding:12px 8px;font-size:.85rem;cursor:pointer;transition:all .15s;}
      .hand-mode-btn.active{background:#312e81;border-color:#6366f1;color:#a5b4fc;}
      .sliders-list{display:flex;flex-direction:column;gap:14px;margin-bottom:20px;}
      .slider-row{background:#1f2937;border-radius:12px;padding:12px 14px;border:1px solid rgba(255,255,255,.05);}
      .slider-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;}
      .slider-label{font-size:.82rem;color:#e5e7eb;font-weight:500;}
      .slider-value{font-size:.85rem;color:#6366f1;font-weight:700;font-variant-numeric:tabular-nums;min-width:54px;text-align:right;}
      .slider-input{width:100%;height:4px;-webkit-appearance:none;appearance:none;background:linear-gradient(90deg,#6366f1 var(--val,50%),#374151 var(--val,50%));border-radius:99px;outline:none;cursor:pointer;}
      .slider-input::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;background:#6366f1;border-radius:50%;box-shadow:0 0 0 3px rgba(99,102,241,.3);}
      .slider-hint{font-size:.72rem;color:#6b7280;margin-top:6px;}
      .calib-footer{display:flex;gap:10px;margin-bottom:12px;}
      .calib-btn{flex:1;padding:13px;border:none;border-radius:12px;font-size:.9rem;font-weight:600;cursor:pointer;}
      .calib-btn-reset{background:#374151;color:#9ca3af;}
      .calib-btn-apply{background:#6366f1;color:#fff;}
      .calib-tip{text-align:center;font-size:.75rem;color:#4b5563;line-height:1.5;padding:0 8px;}
    `
    document.head.appendChild(s)
  }
}
