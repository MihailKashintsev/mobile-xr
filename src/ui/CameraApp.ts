/**
 * CameraApp — приложение камеры
 * XRWindow с кнопкой "Снять фото" + flash эффект + превью
 */
import * as THREE from 'three'
import { XRWindow } from './WindowManager'

export class CameraApp {
  readonly window: XRWindow
  onSwitchCamera?: () => Promise<void>
  private renderer: THREE.WebGLRenderer | null = null
  private videoEl:  HTMLVideoElement | null    = null
  private overlay:  HTMLElement
  private flash:    HTMLElement

  constructor(renderer: THREE.WebGLRenderer | null) {
    this.renderer = renderer
    this.overlay  = this.makeEl('div', 'cam-overlay')
    this.flash    = this.makeEl('div', 'cam-flash')
    document.body.appendChild(this.overlay)
    document.body.appendChild(this.flash)
    this.addCSS()

    this.window = new XRWindow({
      title:    'Камера 📷',
      width:    1.30,
      height:   0.80,
      position: new THREE.Vector3(0, 0.1, -2.5),
      closeable: true,
      content: { buttons: [
        { label: '📸 Сфоткать',    color: 0x0e7490, onClick: () => this.takePhoto() },
        { label: '🔄 Переключить', color: 0x065f46, onClick: () => this.onSwitchCamera?.() },
      ]},
    })
  }

  setVideo(v: HTMLVideoElement):    void { this.videoEl  = v }
  setRenderer(r: THREE.WebGLRenderer): void { this.renderer = r }

  takePhoto(): void {
    if (!this.renderer) { this.showMsg('Рендерер не готов'); return }

    const rend = this.renderer
    const W = rend.domElement.width
    const H = rend.domElement.height

    const canvas = document.createElement('canvas')
    canvas.width=W; canvas.height=H
    const ctx = canvas.getContext('2d')!

    if (this.videoEl) {
      // Видео рисуем с учётом что оно может быть меньше canvas
      ctx.drawImage(this.videoEl, 0, 0, W, H)
    }
    // 3D оверлей поверх (preserveDrawingBuffer должен быть true в renderer, иначе пустой)
    ctx.drawImage(rend.domElement, 0, 0, W, H)

    // Flash
    this.flash.classList.add('on')
    setTimeout(()=>this.flash.classList.remove('on'), 300)

    // Save
    canvas.toBlob(blob=>{
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href=url; a.download=`mobile-xr-${Date.now()}.jpg`; a.click()
      setTimeout(()=>URL.revokeObjectURL(url), 5000)
    }, 'image/jpeg', 0.92)

    // Preview
    const dataURL = canvas.toDataURL('image/jpeg', 0.7)
    this.overlay.innerHTML=`
      <div class="cam-prev">
        <img src="${dataURL}" alt="Снимок"/>
        <button class="cam-x" onclick="this.closest('.cam-prev').parentElement.classList.remove('show')">✕</button>
        <div class="cam-lbl">📸 Сохранено</div>
      </div>`
    this.overlay.classList.add('show')
    setTimeout(()=>this.overlay.classList.remove('show'), 6000)
  }

  private showMsg(msg: string): void {
    const t=document.createElement('div')
    t.style.cssText='position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:10px 18px;border-radius:10px;z-index:9999;font-size:.82rem'
    t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3000)
  }

  private makeEl(tag: string, id: string): HTMLElement {
    const el=document.createElement(tag); el.id=id; return el
  }

  private addCSS(): void {
    if (document.getElementById('cam-css')) return
    const s=document.createElement('style'); s.id='cam-css'; s.textContent=`
#cam-overlay{position:fixed;inset:0;z-index:6000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72)}
#cam-overlay.show{display:flex}
.cam-prev{position:relative;max-width:92vw}
.cam-prev img{width:100%;border-radius:12px;display:block;box-shadow:0 4px 32px rgba(0,0,0,.6)}
.cam-x{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem}
.cam-lbl{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#fff;padding:5px 15px;border-radius:20px;font-size:.8rem;font-family:-apple-system,sans-serif;white-space:nowrap}
#cam-flash{position:fixed;inset:0;z-index:7000;background:#fff;opacity:0;pointer-events:none;transition:opacity .06s}
#cam-flash.on{opacity:1;transition:none}
`; document.head.appendChild(s)
  }
}
