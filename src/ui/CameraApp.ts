/**
 * CameraApp — окно-приложение камеры с фото-функцией
 */
import * as THREE from 'three'
import { XRWindow } from './WindowManager'

export class CameraApp {
  window: XRWindow
  onSwitchCamera?: () => Promise<void>
  private renderer: THREE.WebGLRenderer | null
  private videoEl:  HTMLVideoElement | null = null
  private overlay:  HTMLElement
  private flash:    HTMLElement

  constructor(renderer: THREE.WebGLRenderer | null) {
    this.renderer = renderer
    this.overlay  = document.createElement('div'); this.overlay.id='cam-overlay'
    this.flash    = document.createElement('div'); this.flash.id='cam-flash'
    document.body.appendChild(this.overlay); document.body.appendChild(this.flash)

    const s = document.createElement('style')
    s.textContent=`
#cam-overlay{position:fixed;inset:0;z-index:6000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75)}
#cam-overlay.show{display:flex}
.cam-prev{position:relative;max-width:90vw;max-height:80vh}
.cam-prev img{width:100%;height:auto;border-radius:12px;box-shadow:0 4px 32px rgba(0,0,0,.6)}
.cam-prev-x{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem}
.cam-lbl{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#fff;padding:6px 16px;border-radius:20px;font-size:.82rem;font-family:-apple-system,sans-serif;white-space:nowrap}
#cam-flash{position:fixed;inset:0;z-index:7000;background:white;opacity:0;pointer-events:none;transition:opacity .08s}
#cam-flash.flash{opacity:0.9;transition:opacity .04s}`
    document.head.appendChild(s)

    this.window = new XRWindow({
      title: 'Камера 📷',
      width: 1.25, height: 0.78,
      position: new THREE.Vector3(0, 0.1, -2.5),
      closeable: true,
      content: { buttons: [
        { label: '📸 Сфоткать', color: 0x0891b2, onClick: () => this.takePhoto() },
        { label: '🔄 Переключить', color: 0x059669, onClick: () => this.onSwitchCamera?.() },
      ]},
    })
  }

  setVideo(v: HTMLVideoElement): void { this.videoEl = v }
  setRenderer(r: THREE.WebGLRenderer): void { this.renderer = r }

  takePhoto(): void {
    if (!this.renderer) return
    const W=this.renderer.domElement.width, H=this.renderer.domElement.height
    const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H
    const ctx=canvas.getContext('2d')!
    if (this.videoEl) ctx.drawImage(this.videoEl,0,0,W,H)
    ctx.drawImage(this.renderer.domElement,0,0,W,H)
    this.flash.classList.add('flash'); setTimeout(()=>this.flash.classList.remove('flash'),350)
    const url=canvas.toDataURL('image/jpeg',0.9)
    canvas.toBlob(blob=>{
      if (!blob) return
      const a=document.createElement('a')
      a.href=URL.createObjectURL(blob); a.download=`mobile-xr-${Date.now()}.jpg`; a.click()
    },'image/jpeg',0.9)
    this.overlay.innerHTML=`<div class="cam-prev"><img src="${url}"/><button class="cam-prev-x">✕</button><div class="cam-lbl">📸 Сохранено!</div></div>`
    this.overlay.classList.add('show')
    this.overlay.querySelector('.cam-prev-x')!.addEventListener('click',()=>this.overlay.classList.remove('show'))
    setTimeout(()=>this.overlay.classList.remove('show'),5000)
  }
}
