import type { StereoRenderer, StereoCalibration } from '../xr/StereoRenderer'
import { DEFAULT_CALIBRATION } from '../xr/StereoRenderer'
import type { HandTracker } from '../xr/HandTracker'
import type { HandRenderMode } from './AppTypes'
export type { HandRenderMode }

interface SD { key:keyof StereoCalibration; label:string; min:number; max:number; step:number; unit:string }
const SLIDERS:SD[]=[
  {key:'ipd',label:'IPD (межзрачковое)',min:50,max:80,step:0.5,unit:'мм'},
  {key:'fov',label:'FOV (угол обзора)',min:60,max:130,step:1,unit:'°'},
  {key:'lensDistance',label:'Центр линзы Y',min:0.1,max:0.9,step:0.01,unit:''},
  {key:'k1',label:'Дисторсия K1',min:0,max:0.8,step:0.01,unit:''},
  {key:'k2',label:'Дисторсия K2',min:0,max:0.5,step:0.01,unit:''},
  {key:'verticalOffset',label:'Вертикальный сдвиг',min:-0.1,max:0.1,step:0.005,unit:''},
  {key:'zoom',label:'Масштаб',min:0.6,max:1.5,step:0.01,unit:'x'},
  {key:'eyeShiftL',label:'⬅ Сдвиг лев. глаза',min:-0.15,max:0.15,step:0.005,unit:''},
  {key:'eyeShiftR',label:'Сдвиг пр. глаза ➡',min:-0.15,max:0.15,step:0.005,unit:''},
]
const PRESETS:{name:string;vals:Partial<StereoCalibration>}[]=[
  {name:'📦 Cardboard',    vals:{ipd:63,fov:90, k1:0.22,k2:0.10,zoom:1.0, lensDistance:0.5, verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'🌌 Gear VR 2',   vals:{ipd:64,fov:101,k1:0.34,k2:0.13,zoom:0.98,lensDistance:0.48,verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'🥽 VR BOX',      vals:{ipd:63,fov:96, k1:0.30,k2:0.15,zoom:0.95,lensDistance:0.45,verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'🎮 Shinecon',    vals:{ipd:64,fov:100,k1:0.18,k2:0.08,zoom:1.0, lensDistance:0.5, verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
  {name:'⬛ Без дисторсии',vals:{ipd:63,fov:90, k1:0,   k2:0,   zoom:1.0, lensDistance:0.5, verticalOffset:0,eyeShiftL:0,eyeShiftR:0}},
]

export class SettingsPanel {
  private el:HTMLElement; private visible=false
  private stereo:StereoRenderer|null=null; private tracker:HandTracker; private ver:string
  private sls:Map<keyof StereoCalibration,HTMLInputElement>=new Map()
  private svs:Map<keyof StereoCalibration,HTMLSpanElement>=new Map()
  private onCam?:()=>void; private onHand?:(m:HandRenderMode)=>void

  constructor(tracker:HandTracker, ver:string, onCam?:()=>void, onHand?:(m:HandRenderMode)=>void) {
    this.tracker=tracker; this.ver=ver; this.onCam=onCam; this.onHand=onHand
    this.el=document.createElement('div'); this.el.id='sp'
    this.css(); this.html(); document.body.appendChild(this.el)
  }

  setStereo(sr:StereoRenderer): void { this.stereo=sr; this.syncSliders() }
  open(tab='camera'): void { this.visible=true; this.el.classList.add('open'); this.tab(tab); this.syncSliders(); this.refreshCams() }
  close(): void { this.visible=false; this.el.classList.remove('open') }
  toggle(t='camera'): void { this.visible?this.close():this.open(t) }

  private tab(id:string): void {
    this.el.querySelectorAll('.sp-tab').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.t===id))
    this.el.querySelectorAll('.sp-pane').forEach(p=>p.classList.toggle('active',p.id==='pane-'+id))
  }

  private html(): void {
    this.el.innerHTML=`
<div class="sp-bd"></div>
<div class="sp-sh">
  <div class="sp-hd"><span class="sp-ti">⚙️ Настройки</span><button id="sp-x">✕</button></div>
  <div class="sp-tabs">
    <button class="sp-tab active" data-t="camera">📷 Камера</button>
    <button class="sp-tab" data-t="vr">👓 VR</button>
    <button class="sp-tab" data-t="hands">🖐 Руки</button>
    <button class="sp-tab" data-t="about">ℹ️</button>
  </div>
  <div class="sp-body">
    <div class="sp-pane active" id="pane-camera">
      <div class="sp-lbl">Выбор камеры</div>
      <div id="cam-list"></div>
    </div>
    <div class="sp-pane" id="pane-vr">
      <div class="sp-lbl">Гарнитура</div>
      <div class="pr-grid" id="presets"></div>
      <div class="sp-lbl">Параметры</div>
      <div id="vr-sl"></div>
      <button class="sp-btn sp-ghost" id="vr-rst">↺ Сброс</button>
    </div>
    <div class="sp-pane" id="pane-hands">
      <div class="sp-lbl">Режим рук</div>
      <div class="hm-row">
        <button class="hm-btn active" data-m="skeleton">💀 Скелет</button>
        <button class="hm-btn" data-m="3d">🖐 3D модель</button>
      </div>
    </div>
    <div class="sp-pane" id="pane-about">
      <div class="ab-card">
        <div style="font-size:3rem;margin-bottom:8px">🥽</div>
        <div style="font-size:1.1rem;font-weight:700;color:#f9fafb">Mobile XR</div>
        <div style="color:#6366f1;margin:4px 0 10px;font-size:.85rem">v${this.ver}</div>
        <div style="color:#6b7280;font-size:.8rem">WebXR Hand Tracking · 3D floating UI</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="sp-btn sp-prime" onclick="window.open('https://github.com/MihailKashintsev/mobile-xr','_blank')">🐙 GitHub</button>
        <button class="sp-btn sp-ghost" onclick="location.reload()">🔄 Перезагрузить</button>
      </div>
    </div>
  </div>
</div>`
    this.el.querySelectorAll('.sp-tab').forEach(b=>b.addEventListener('click',()=>this.tab((b as HTMLElement).dataset.t!)))
    this.el.querySelector('#sp-x')!.addEventListener('click',()=>this.close())
    this.el.querySelector('.sp-bd')!.addEventListener('click',()=>this.close())
    // Presets
    const pg=this.el.querySelector('#presets')!
    PRESETS.forEach(p=>{
      const btn=document.createElement('button'); btn.className='pr-btn'; btn.textContent=p.name
      btn.addEventListener('click',()=>{
        this.stereo?.setCalibration(p.vals); this.syncSliders()
        pg.querySelectorAll('.pr-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active')
      }); pg.appendChild(btn)
    })
    // Sliders
    const sl=this.el.querySelector('#vr-sl')!
    SLIDERS.forEach(d=>{
      const dp=d.step<0.01?3:d.step<0.1?2:1
      const row=document.createElement('div'); row.className='sl-row'
      row.innerHTML=`<div class="sl-top"><span class="sl-lb">${d.label}</span><span class="sl-vl" id="sv-${d.key}">${(DEFAULT_CALIBRATION[d.key] as number).toFixed(dp)}${d.unit}</span></div><input type="range" class="sl-in" id="sl-${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${DEFAULT_CALIBRATION[d.key]}"/>`
      sl.appendChild(row)
      const inp=row.querySelector(`#sl-${d.key}`) as HTMLInputElement
      const vel=row.querySelector(`#sv-${d.key}`) as HTMLSpanElement
      this.sls.set(d.key,inp); this.svs.set(d.key,vel)
      inp.addEventListener('input',()=>{const n=parseFloat(inp.value);vel.textContent=`${n.toFixed(dp)}${d.unit}`;this.stereo?.setCalibration({[d.key]:n} as any)})
    })
    this.el.querySelector('#vr-rst')!.addEventListener('click',()=>{this.stereo?.resetCalibration();this.syncSliders()})
    // Hand mode
    this.el.querySelectorAll('.hm-btn').forEach(b=>b.addEventListener('click',()=>{
      const m=(b as HTMLElement).dataset.m as HandRenderMode
      this.el.querySelectorAll('.hm-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active')
      this.onHand?.(m)
    }))
  }

  private syncSliders(): void {
    if (!this.stereo) return
    const c=this.stereo.getCalibration()
    SLIDERS.forEach(d=>{
      const inp=this.sls.get(d.key),vel=this.svs.get(d.key); if(!inp||!vel) return
      const n=c[d.key] as number; const dp=d.step<0.01?3:d.step<0.1?2:1
      inp.value=String(n); vel.textContent=`${n.toFixed(dp)}${d.unit}`
    })
  }

  private async refreshCams(): Promise<void> {
    const list=this.el.querySelector('#cam-list')!; list.innerHTML='<div class="cam-ld">Загрузка...</div>'
    try {
      const devs=await navigator.mediaDevices.enumerateDevices()
      const cams=devs.filter(d=>d.kind==='videoinput')
      list.innerHTML=''
      const cur=this.tracker.getCurrentDeviceId()??''
      cams.forEach((cam,i)=>{
        const lb=cam.label||`Камера ${i+1}`
        const icon=lb.toLowerCase().includes('front')||lb.toLowerCase().includes('user')?'🤳':'📷'
        const btn=document.createElement('button')
        btn.className=`cam-btn${cam.deviceId===cur?' active':''}`
        btn.innerHTML=`<span>${icon}</span><span class="cam-lb">${lb}</span>${cam.deviceId===cur?'<span style="color:#6366f1">●</span>':''}`
        btn.addEventListener('click',async()=>{await this.tracker.switchCamera(cam.deviceId);this.onCam?.();this.refreshCams()})
        list.appendChild(btn)
      })
      if (!cams.length) list.innerHTML='<div class="cam-ld">Камеры не найдены</div>'
    } catch { list.innerHTML='<div class="cam-ld">Нет доступа</div>' }
  }

  private css(): void {
    const s=document.createElement('style')
    s.textContent=`
#sp{position:fixed;inset:0;z-index:5000;display:none;align-items:flex-end;justify-content:center;font-family:-apple-system,sans-serif}
#sp.open{display:flex}
.sp-bd{position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px)}
.sp-sh{position:relative;z-index:1;width:100%;max-width:540px;height:82vh;display:flex;flex-direction:column;background:#0f1724;border-radius:20px 20px 0 0;border-top:1px solid rgba(255,255,255,.08);box-shadow:0 -8px 40px rgba(0,0,0,.6)}
.sp-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 0}
.sp-ti{font-size:1.1rem;font-weight:700;color:#f9fafb}
.sp-hd button{background:rgba(255,255,255,.08);border:none;color:#9ca3af;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem}
.sp-tabs{display:flex;padding:10px 14px 0;border-bottom:1px solid rgba(255,255,255,.06);gap:2px}
.sp-tab{flex:1;background:none;border:none;color:#6b7280;padding:10px 2px;font-size:.72rem;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
.sp-tab.active{color:#6366f1;border-bottom-color:#6366f1}
.sp-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.sp-pane{display:none;padding:14px}
.sp-pane.active{display:block}
.sp-lbl{font-size:.7rem;font-weight:600;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;margin:10px 0 8px}
.cam-ld{color:#6b7280;text-align:center;padding:20px;font-size:.85rem}
.cam-btn{display:flex;align-items:center;gap:10px;width:100%;background:#1a2440;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;color:#e5e7eb;font-size:.86rem;text-align:left;transition:all .15s}
.cam-btn.active{border-color:#6366f1;background:#1e254a}
.cam-lb{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px}
.pr-btn{background:#1a2440;border:1px solid rgba(255,255,255,.07);color:#d1d5db;border-radius:9px;padding:10px 6px;font-size:.74rem;cursor:pointer;transition:all .15s}
.pr-btn.active{background:#312e81;border-color:#6366f1;color:#a5b4fc}
.sl-row{background:#1a2440;border-radius:9px;padding:10px 12px;margin-bottom:9px}
.sl-top{display:flex;justify-content:space-between;margin-bottom:5px}
.sl-lb{font-size:.79rem;color:#e5e7eb}
.sl-vl{font-size:.8rem;color:#6366f1;font-weight:700;min-width:48px;text-align:right}
.sl-in{width:100%;height:4px;-webkit-appearance:none;background:linear-gradient(90deg,#6366f1 50%,#374151 50%);border-radius:99px;outline:none;cursor:pointer}
.sl-in::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;background:#6366f1;border-radius:50%;box-shadow:0 0 0 3px rgba(99,102,241,.3)}
.hm-row{display:flex;gap:8px}
.hm-btn{flex:1;background:#1a2440;border:1px solid rgba(255,255,255,.07);color:#d1d5db;border-radius:9px;padding:14px 8px;font-size:.86rem;cursor:pointer;transition:all .15s}
.hm-btn.active{background:#312e81;border-color:#6366f1;color:#a5b4fc}
.ab-card{text-align:center;padding:20px 0 12px}
.sp-btn{padding:12px;border:none;border-radius:9px;font-size:.86rem;font-weight:600;cursor:pointer;flex:1}
.sp-prime{background:#6366f1;color:#fff}
.sp-ghost{background:#1f2937;color:#9ca3af;width:100%;margin-top:8px}
`
    document.head.appendChild(s)
  }
}
