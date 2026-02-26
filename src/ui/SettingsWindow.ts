/**
 * SettingsWindow — HTML bottom-sheet настроек
 * Вкладки: Камера | VR Калибровка | Руки | О приложении
 * Открывается кнопкой в TaskBar3D
 */
import type { StereoRenderer, StereoCalibration } from '../xr/StereoRenderer'
import { DEFAULT_CALIBRATION } from '../xr/StereoRenderer'
import type { HandTracker } from '../xr/HandTracker'

export type HandRenderMode = 'skeleton' | '3d'

interface SD { key: keyof StereoCalibration; label: string; min: number; max: number; step: number; unit: string }

const SLIDERS: SD[] = [
  { key:'ipd',            label:'IPD (межзрачковое)',   min:50,   max:80,   step:0.5,  unit:'мм' },
  { key:'fov',            label:'FOV (угол обзора)',    min:60,   max:130,  step:1,    unit:'°'  },
  { key:'lensDistance',   label:'Центр линзы Y',        min:0.1,  max:0.9,  step:0.01, unit:''   },
  { key:'k1',             label:'Дисторсия K1',         min:0,    max:0.8,  step:0.01, unit:''   },
  { key:'k2',             label:'Дисторсия K2',         min:0,    max:0.5,  step:0.01, unit:''   },
  { key:'verticalOffset', label:'Верт. сдвиг',          min:-0.1, max:0.1,  step:0.005,unit:''   },
  { key:'zoom',           label:'Масштаб',              min:0.6,  max:1.5,  step:0.01, unit:'x'  },
  { key:'eyeShiftL',      label:'⬅ Сдвиг лев. глаза',  min:-0.15,max:0.15, step:0.005,unit:''   },
  { key:'eyeShiftR',      label:'Сдвиг пр. глаза ➡',   min:-0.15,max:0.15, step:0.005,unit:''   },
]

const PRESETS: {name:string; vals:Partial<StereoCalibration>}[] = [
  {name:'📦 Cardboard',     vals:{ipd:63,fov:90, k1:0.22,k2:0.10,zoom:1.0, lensDistance:0.5, verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'🌌 Gear VR 2',     vals:{ipd:64,fov:101,k1:0.34,k2:0.13,zoom:0.98,lensDistance:0.48,verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'🥽 VR BOX',        vals:{ipd:63,fov:96, k1:0.30,k2:0.15,zoom:0.95,lensDistance:0.45,verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'🎮 Shinecon',      vals:{ipd:64,fov:100,k1:0.18,k2:0.08,zoom:1.0, lensDistance:0.5, verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'⬛ Без дисторсии', vals:{ipd:63,fov:90, k1:0,   k2:0,   zoom:1.0, lensDistance:0.5, verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
]

export class SettingsWindow {
  private el:       HTMLElement
  private stereo?:  StereoRenderer
  private tracker?: HandTracker
  private sls  = new Map<keyof StereoCalibration, HTMLInputElement>()
  private vals = new Map<keyof StereoCalibration, HTMLSpanElement>()
  private visible = false
  onHandMode?:     (m: HandRenderMode) => void
  onSwitchCamera?: () => void
  version = '1.0.0'

  constructor() {
    this.el = document.createElement('div')
    this.el.id = 'sw'
    this.css()
    this.html()
    document.body.appendChild(this.el)
  }

  setStereo(sr: StereoRenderer): void { this.stereo=sr; this.sync() }
  setTracker(t: HandTracker): void { this.tracker=t }
  open(): void  { this.visible=true;  this.el.classList.add('open'); this.sync(); this.loadCams() }
  close(): void { this.visible=false; this.el.classList.remove('open') }
  toggle(): void { this.visible?this.close():this.open() }
  isOpen(): boolean { return this.visible }

  private tab(id: string): void {
    this.el.querySelectorAll('.sw-tab').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.t===id))
    this.el.querySelectorAll('.sw-pane').forEach(p=>p.classList.toggle('active',p.id===`sp-${id}`))
  }

  private html(): void {
    this.el.innerHTML=`
<div class="sw-bd"></div>
<div class="sw-sh">
  <div class="sw-hd">
    <span class="sw-ti">⚙️ Настройки</span>
    <button id="sw-x">✕</button>
  </div>
  <div class="sw-tabs">
    <button class="sw-tab active" data-t="camera">📷 Камера</button>
    <button class="sw-tab" data-t="vr">👓 VR</button>
    <button class="sw-tab" data-t="hands">🖐 Руки</button>
    <button class="sw-tab" data-t="about">ℹ️</button>
  </div>
  <div class="sw-body">

    <!-- КАМЕРА -->
    <div class="sw-pane active" id="sp-camera">
      <div class="sw-lbl">Выбор камеры</div>
      <div id="cam-list" class="cam-list"></div>
    </div>

    <!-- VR КАЛИБРОВКА -->
    <div class="sw-pane" id="sp-vr">
      <div class="sw-lbl">Гарнитура</div>
      <div class="pr-grid" id="pr-grid"></div>
      <div class="sw-lbl">Параметры линз</div>
      <div id="sw-sliders"></div>
      <button class="sw-btn sw-ghost" id="sw-reset">↺ Сброс к умолчанию</button>
    </div>

    <!-- РУКИ -->
    <div class="sw-pane" id="sp-hands">
      <div class="sw-lbl">Режим отображения</div>
      <div class="hm-row">
        <button class="hm-btn active" data-m="skeleton">💀 Скелет</button>
        <button class="hm-btn" data-m="3d">🖐 3D модель</button>
      </div>
      <div class="sw-info-box">
        <div class="sw-info-icon">✨</div>
        <div>Эффект частиц при щипке работает в обоих режимах автоматически.</div>
      </div>
    </div>

    <!-- О ПРИЛОЖЕНИИ -->
    <div class="sw-pane" id="sp-about">
      <div class="ab-card">
        <div class="ab-icon">🥽</div>
        <div class="ab-name">Mobile XR</div>
        <div class="ab-ver" id="sw-ver">v${this.version}</div>
        <div class="ab-desc">WebXR hand tracking · floating 3D interface</div>
      </div>
      <div class="ab-row">
        <div class="ab-item"><span class="ab-il">🎯</span>Технологии</div>
        <div class="ab-val">MediaPipe · Three.js · WebXR</div>
        <div class="ab-item"><span class="ab-il">📡</span>Требования</div>
        <div class="ab-val">HTTPS · Chrome Android · Камера</div>
        <div class="ab-item"><span class="ab-il">🔗</span>Исходный код</div>
        <div class="ab-val"><a href="https://github.com/MihailKashintsev/mobile-xr" target="_blank" style="color:#6366f1">GitHub ↗</a></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="sw-btn sw-prime" onclick="location.reload()">🔄 Перезагрузить</button>
        <button class="sw-btn sw-ghost" onclick="window.open('https://github.com/MihailKashintsev/mobile-xr','_blank')">🐙 GitHub</button>
      </div>
    </div>

  </div>
</div>`

    // Tabs
    this.el.querySelectorAll('.sw-tab').forEach(b=>b.addEventListener('click',()=>this.tab((b as HTMLElement).dataset.t!)))
    this.el.querySelector('#sw-x')!.addEventListener('click',()=>this.close())
    this.el.querySelector('.sw-bd')!.addEventListener('click',()=>this.close())

    // Presets
    const pg = this.el.querySelector('#pr-grid')!
    PRESETS.forEach(p=>{
      const btn=document.createElement('button'); btn.className='pr-btn'; btn.textContent=p.name
      btn.addEventListener('click',()=>{
        this.stereo?.setCalibration(p.vals); this.sync()
        pg.querySelectorAll('.pr-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active')
      }); pg.appendChild(btn)
    })

    // Sliders
    const slc = this.el.querySelector('#sw-sliders')!
    for (const d of SLIDERS) {
      const dp = d.step<0.01?3:d.step<0.1?2:1
      const row = document.createElement('div'); row.className='sl-row'
      row.innerHTML=`
        <div class="sl-top">
          <span class="sl-lb">${d.label}</span>
          <span class="sl-vl" id="sv-${d.key}">${(DEFAULT_CALIBRATION[d.key] as number).toFixed(dp)}${d.unit}</span>
        </div>
        <input type="range" class="sl-in" id="sl-${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${DEFAULT_CALIBRATION[d.key]}"/>`
      slc.appendChild(row)
      const inp = row.querySelector(`#sl-${d.key}`) as HTMLInputElement
      const vel = row.querySelector(`#sv-${d.key}`) as HTMLSpanElement
      this.sls.set(d.key,inp); this.vals.set(d.key,vel)
      inp.addEventListener('input',()=>{const n=parseFloat(inp.value);vel.textContent=`${n.toFixed(dp)}${d.unit}`;this.stereo?.setCalibration({[d.key]:n} as any)})
    }
    this.el.querySelector('#sw-reset')!.addEventListener('click',()=>{this.stereo?.resetCalibration();this.sync()})

    // Hand mode
    this.el.querySelectorAll('.hm-btn').forEach(b=>b.addEventListener('click',()=>{
      const m=(b as HTMLElement).dataset.m as HandRenderMode
      this.el.querySelectorAll('.hm-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active')
      this.onHandMode?.(m)
    }))
  }

  private sync(): void {
    const ver = this.el.querySelector('#sw-ver')
    if (ver) ver.textContent=`v${this.version}`
    if (!this.stereo) return
    const c=this.stereo.getCalibration()
    for (const d of SLIDERS) {
      const inp=this.sls.get(d.key),vel=this.vals.get(d.key); if(!inp||!vel) continue
      const n=c[d.key] as number; const dp=d.step<0.01?3:d.step<0.1?2:1
      inp.value=String(n); vel.textContent=`${n.toFixed(dp)}${d.unit}`
    }
  }

  private async loadCams(): Promise<void> {
    const list = this.el.querySelector('#cam-list')!
    list.innerHTML='<div class="cam-msg">Загрузка...</div>'
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      const cams = devs.filter(d=>d.kind==='videoinput')
      list.innerHTML=''
      if (!cams.length) { list.innerHTML='<div class="cam-msg">Камеры не найдены</div>'; return }
      const curId = this.tracker?.getCurrentDeviceId()??''
      cams.forEach((cam,i)=>{
        const lb  = cam.label||`Камера ${i+1}`
        const lbl = lb.toLowerCase()
        const ico = lbl.includes('front')||lbl.includes('фронт')||lbl.includes('user')?'🤳':'📷'
        const btn = document.createElement('button')
        btn.className=`cam-btn${cam.deviceId===curId?' active':''}`
        btn.innerHTML=`<span>${ico}</span><span class="cam-lb">${lb}</span>${cam.deviceId===curId?'<span style="color:#6366f1;font-size:.7rem">● текущая</span>':''}`
        btn.addEventListener('click',async()=>{
          if (!this.tracker) return
          await this.tracker.switchCamera(cam.deviceId)
          this.onSwitchCamera?.()
          this.loadCams()
        })
        list.appendChild(btn)
      })
    } catch { list.innerHTML='<div class="cam-msg">Ошибка доступа к камерам</div>' }
  }

  private css(): void {
    const s=document.createElement('style'); s.textContent=`
#sw{position:fixed;inset:0;z-index:5000;display:none;align-items:flex-end;justify-content:center;font-family:-apple-system,sans-serif}
#sw.open{display:flex}
.sw-bd{position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}
.sw-sh{position:relative;z-index:1;width:100%;max-width:520px;height:80vh;display:flex;flex-direction:column;background:#0f1724;border-radius:18px 18px 0 0;border-top:1px solid rgba(255,255,255,.08)}
.sw-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 0}
.sw-ti{font-size:1.05rem;font-weight:700;color:#f9fafb}
.sw-hd button{background:rgba(255,255,255,.08);border:none;color:#9ca3af;width:30px;height:30px;border-radius:50%;cursor:pointer}
.sw-tabs{display:flex;padding:10px 14px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.sw-tab{flex:1;background:none;border:none;color:#6b7280;padding:9px 2px;font-size:.71rem;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
.sw-tab.active{color:#6366f1;border-bottom-color:#6366f1}
.sw-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.sw-pane{display:none;padding:14px}
.sw-pane.active{display:block}
.sw-lbl{font-size:.68rem;font-weight:600;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin:10px 0 7px}
.cam-list{display:flex;flex-direction:column;gap:7px}
.cam-msg{color:#6b7280;text-align:center;padding:18px;font-size:.84rem}
.cam-btn{display:flex;align-items:center;gap:10px;width:100%;background:#1a2440;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;cursor:pointer;color:#e5e7eb;font-size:.84rem;text-align:left;transition:all .15s}
.cam-btn.active{border-color:#6366f1;background:#1e254a}
.cam-lb{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}
.pr-btn{background:#1a2440;border:1px solid rgba(255,255,255,.07);color:#d1d5db;border-radius:9px;padding:9px 6px;font-size:.73rem;cursor:pointer;transition:all .15s}
.pr-btn.active{background:#312e81;border-color:#6366f1;color:#a5b4fc}
.sl-row{background:#1a2440;border-radius:9px;padding:9px 12px;margin-bottom:8px}
.sl-top{display:flex;justify-content:space-between;margin-bottom:4px}
.sl-lb{font-size:.78rem;color:#e5e7eb}
.sl-vl{font-size:.79rem;color:#6366f1;font-weight:700;min-width:46px;text-align:right}
.sl-in{width:100%;height:4px;-webkit-appearance:none;background:linear-gradient(90deg,#6366f1 50%,#374151 50%);border-radius:99px;outline:none;cursor:pointer}
.sl-in::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;background:#6366f1;border-radius:50%;box-shadow:0 0 0 3px rgba(99,102,241,.3)}
.hm-row{display:flex;gap:8px;margin-bottom:12px}
.hm-btn{flex:1;background:#1a2440;border:1px solid rgba(255,255,255,.07);color:#d1d5db;border-radius:9px;padding:13px 8px;font-size:.84rem;cursor:pointer;transition:all .15s}
.hm-btn.active{background:#312e81;border-color:#6366f1;color:#a5b4fc}
.sw-info-box{background:#1a2440;border:1px solid rgba(255,255,255,.06);border-radius:9px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px;font-size:.81rem;color:#9ca3af;line-height:1.5}
.sw-info-icon{font-size:1.2rem;flex-shrink:0}
.ab-card{text-align:center;padding:18px 0 10px}
.ab-icon{font-size:2.8rem;margin-bottom:7px}
.ab-name{font-size:1.1rem;font-weight:700;color:#f9fafb}
.ab-ver{color:#6366f1;font-size:.83rem;margin:3px 0 8px}
.ab-desc{color:#6b7280;font-size:.79rem}
.ab-row{display:flex;flex-direction:column;gap:4px;margin-top:10px;background:#1a2440;border-radius:9px;padding:10px 12px}
.ab-item{display:flex;align-items:center;gap:7px;color:#9ca3af;font-size:.78rem;margin-top:5px}
.ab-il{font-size:1rem}
.ab-val{color:#e5e7eb;font-size:.8rem;padding-left:24px;margin-top:1px}
.sw-btn{padding:11px;border:none;border-radius:9px;font-size:.84rem;font-weight:600;cursor:pointer;flex:1;width:100%;margin-top:8px}
.sw-prime{background:#6366f1;color:#fff}
.sw-ghost{background:#1f2937;color:#9ca3af}
`; document.head.appendChild(s)
  }
}
