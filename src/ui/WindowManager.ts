/**
 * WindowManager + XRWindow — 3D окна с закрытием и перетаскиванием
 */
import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

const DB = 0.022; const TH = 0.13; const BRH = 0.09
const C = { panelBg:0x0d1420, titleBg:0x131c2e, dragBg:0x0f1726, border:0x2a3a52, accent:0x6366f1 }

function canvasTex(fn:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void, w=512, h=128): THREE.CanvasTexture {
  const c=document.createElement('canvas'); c.width=w; c.height=h
  fn(c.getContext('2d')!, w, h)
  const t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t
}

function titleTex(text: string): THREE.CanvasTexture {
  return canvasTex((ctx,w,h)=>{
    ctx.fillStyle='rgba(240,244,255,.93)'
    ctx.font=`bold ${Math.round(h*.48)}px -apple-system,sans-serif`
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(text,w/2,h/2,w-24)
  },1024,96)
}

function btnTex(label: string, color: number, hov=false): THREE.CanvasTexture {
  return canvasTex((ctx,w,h)=>{
    const bg = hov ? new THREE.Color(color).addScalar(0.15) : new THREE.Color(color)
    ctx.fillStyle=`#${Math.round(bg.r*255).toString(16).padStart(2,'0')}${Math.round(bg.g*255).toString(16).padStart(2,'0')}${Math.round(bg.b*255).toString(16).padStart(2,'0')}`
    ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,18); ctx.fill()
    const gr=ctx.createLinearGradient(0,0,0,h); gr.addColorStop(0,'rgba(255,255,255,.14)'); gr.addColorStop(.5,'rgba(255,255,255,0)')
    ctx.fillStyle=gr; ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,18); ctx.fill()
    ctx.fillStyle='rgba(255,255,255,.93)'
    ctx.font=`600 ${Math.round(h*.42)}px -apple-system,sans-serif`
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(label,w/2,h/2,w-28)
  })
}

export interface WinButton { label: string; color?: number; onClick?: () => void }
export interface WinContent { buttons: WinButton[] }
export interface WinOptions {
  title: string; icon?: string; width?: number; height?: number
  position?: THREE.Vector3; content?: WinContent; closeable?: boolean
}

export class XRWindow {
  group: THREE.Group
  private W: number; private H: number
  private border!: THREE.LineSegments
  private glow!: THREE.Mesh
  private dragBar!: THREE.Mesh
  private btnMeshes: {mesh:THREE.Mesh;btn:WinButton}[] = []
  private floatBase: number
  private _dragging = false
  closeable = true
  private closeBtn!: THREE.Mesh
  onClose?: () => void

  constructor(opts: WinOptions) {
    this.W=opts.width??1.55; this.H=opts.height??1.05
    this.floatBase=Math.random()*Math.PI*2
    this.group=new THREE.Group()
    this.group.position.copy(opts.position??new THREE.Vector3(0,0,-2.6))
    this.build(opts.title+(opts.icon?'  '+opts.icon:''), opts.content??{buttons:[]})
  }

  private build(title: string, content: WinContent): void {
    const {W,H} = this; const D=DB

    // Панель
    const panel=new THREE.Mesh(new THREE.BoxGeometry(W,H,D),
      new THREE.MeshPhysicalMaterial({color:C.panelBg,transparent:true,opacity:.92,roughness:.08,metalness:.15}))
    this.group.add(panel)

    // Title bar
    const tbar=new THREE.Mesh(new THREE.BoxGeometry(W,TH,D+.004),
      new THREE.MeshPhysicalMaterial({color:C.titleBg,roughness:.06,metalness:.2}))
    tbar.position.set(0,H/2-TH/2,.001); this.group.add(tbar)

    // Accent line
    const acc=new THREE.Mesh(new THREE.BoxGeometry(W,.003,D+.006),new THREE.MeshBasicMaterial({color:C.accent}))
    acc.position.set(0,H/2-TH,.003); this.group.add(acc)

    // Title text
    const tp=new THREE.Mesh(new THREE.PlaneGeometry(W*.78,TH*.65),
      new THREE.MeshBasicMaterial({map:titleTex(title),transparent:true,depthWrite:false}))
    tp.position.set(0,H/2-TH/2,D/2+.005); this.group.add(tp)

    // Traffic lights
    const tlC=[0xff5f56,0xffbd2e,0x27c93f]
    for (let i=0;i<3;i++) {
      const d=new THREE.Mesh(new THREE.SphereGeometry(.018,14,10),
        new THREE.MeshPhysicalMaterial({color:tlC[i],emissive:tlC[i],emissiveIntensity:.4,roughness:.3}))
      d.position.set(-W/2+.055+i*.052,H/2-TH/2,D/2+.011); this.group.add(d)
    }

    // Close button (X) — правый верхний
    if (this.closeable) {
      const closeTex = canvasTex((ctx,w,h)=>{
        ctx.fillStyle='#c0392b'
        ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,12); ctx.fill()
        ctx.fillStyle='white'; ctx.font=`bold ${Math.round(h*.55)}px sans-serif`
        ctx.textAlign='center'; ctx.textBaseline='middle'
        ctx.fillText('✕',w/2,h/2+1)
      }, 128, 128)
      this.closeBtn = new THREE.Mesh(new THREE.PlaneGeometry(TH*.65,TH*.65),
        new THREE.MeshBasicMaterial({map:closeTex,transparent:true,depthWrite:false}))
      this.closeBtn.position.set(W/2-TH*.4, H/2-TH/2, D/2+.006)
      this.closeBtn.userData.isCloseBtn = true
      this.group.add(this.closeBtn)
    }

    // Drag bar
    this.dragBar=new THREE.Mesh(new THREE.BoxGeometry(W,BRH,D+.004),
      new THREE.MeshPhysicalMaterial({color:C.dragBg,roughness:.15,metalness:.1}))
    this.dragBar.position.set(0,-H/2+BRH/2,.001); this.group.add(this.dragBar)

    // Grip dots
    for (let col=-3;col<=3;col++) for (let row=-1;row<=1;row++) {
      const d=new THREE.Mesh(new THREE.SphereGeometry(.006,6,5),new THREE.MeshBasicMaterial({color:0x4a5568}))
      d.position.set(col*.07,-H/2+BRH/2+row*.022,D/2+.007); this.group.add(d)
    }

    // Glow
    this.glow=new THREE.Mesh(new THREE.BoxGeometry(W+.04,H+.04,D+.04),
      new THREE.MeshBasicMaterial({color:C.accent,transparent:true,opacity:0,side:THREE.BackSide,depthWrite:false}))
    this.group.add(this.glow)

    // Border
    this.border=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W+.006,H+.006,D+.004)),
      new THREE.LineBasicMaterial({color:C.border,transparent:true,opacity:.7}))
    this.group.add(this.border)

    // Buttons
    const btns=content.buttons; const cols=btns.length<=1?1:2
    const pad=.05; const btnW=cols===1?W-pad*2:(W-pad*3)/2
    const cTop=H/2-TH-pad, cBot=-H/2+BRH+pad
    const rows=Math.ceil(btns.length/cols)
    const gap=.04; const btnH=Math.min(.16,(cTop-cBot-gap*(rows-1))/rows)
    const BD=.028

    btns.forEach((btn,i)=>{
      const col=i%cols, row=Math.floor(i/cols)
      const x=cols===1?0:col===0?-(btnW/2+pad/2):(btnW/2+pad/2)
      const y=cTop-row*(btnH+gap)-btnH/2
      const m=new THREE.Mesh(new THREE.BoxGeometry(btnW,btnH,BD),
        new THREE.MeshPhysicalMaterial({map:btnTex(btn.label,btn.color??0x6366f1),transparent:true,opacity:.95,roughness:.12,metalness:.05}))
      m.position.set(x,y,D/2+BD/2)
      m.userData={btn}
      this.group.add(m)
      this.btnMeshes.push({mesh:m,btn})

      const sh=new THREE.Mesh(new THREE.BoxGeometry(btnW+.01,btnH+.01,.005),
        new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.4,depthWrite:false}))
      sh.position.set(x+.003,y-.005,D/2+.001); this.group.add(sh)
    })

    const pl=new THREE.PointLight(0x8090ff,.35,1.4)
    pl.position.set(0,.2,.5); this.group.add(pl)
  }

  hitDragBar(wp: THREE.Vector3): boolean {
    this.group.updateWorldMatrix(true,false)
    const l=this.group.worldToLocal(wp.clone())
    return Math.abs(l.x)<this.W/2+.06 && l.y>-this.H/2-.05 && l.y<-this.H/2+BRH+.05 && Math.abs(l.z)<.18
  }

  hitCloseBtn(wp: THREE.Vector3): boolean {
    if (!this.closeable||!this.closeBtn) return false
    this.closeBtn.updateWorldMatrix(true,false)
    const l=this.closeBtn.worldToLocal(wp.clone())
    return Math.abs(l.x)<.06 && Math.abs(l.y)<.06 && Math.abs(l.z)<.14
  }

  hitButton(wp: THREE.Vector3): WinButton|null {
    this.group.updateWorldMatrix(true,false)
    for (const {mesh,btn} of this.btnMeshes) {
      mesh.updateWorldMatrix(true,false)
      const l=mesh.worldToLocal(wp.clone())
      const p=(mesh.geometry as THREE.BoxGeometry).parameters
      if (Math.abs(l.x)<p.width/2+.04 && Math.abs(l.y)<p.height/2+.04 && Math.abs(l.z)<.14) return btn
    }
    return null
  }

  getWorldZ(): number { const p=new THREE.Vector3(); this.group.getWorldPosition(p); return p.z }
  isFingerInFront(fp: THREE.Vector3): boolean { return fp.z>this.getWorldZ() }

  setDragHighlight(on: boolean): void {
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity=on?.12:0
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(on?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=on?1:.7
  }

  setButtonHovered(btn: WinButton|null): void {
    for (const b of this.btnMeshes) {
      const hov=b.btn===btn
      if (hov && !b.mesh.userData.wasHov) {
        b.mesh.userData.wasHov=true
        const m=b.mesh.material as THREE.MeshPhysicalMaterial
        m.map?.dispose(); m.map=btnTex(b.btn.label,b.btn.color??0x6366f1,true); m.needsUpdate=true
        b.mesh.position.z+=.003; b.mesh.scale.z=1.3
      } else if (!hov && b.mesh.userData.wasHov) {
        b.mesh.userData.wasHov=false
        const m=b.mesh.material as THREE.MeshPhysicalMaterial
        m.map?.dispose(); m.map=btnTex(b.btn.label,b.btn.color??0x6366f1,false); m.needsUpdate=true
        b.mesh.position.z-=.003; b.mesh.scale.z=1
      }
    }
  }

  pressButton(btn: WinButton): void {
    for (const b of this.btnMeshes) {
      if (b.btn!==btn) continue
      b.mesh.position.z-=.010; b.mesh.scale.z=.7
      setTimeout(()=>{b.mesh.position.z+=.010;b.mesh.scale.z=1},150)
      btn.onClick?.()
    }
  }

  get dragging(){return this._dragging}
  set dragging(v:boolean){
    this._dragging=v
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(v?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=v?1:.7
  }

  update(t:number):void{
    if (this._dragging) return
    const prevY:number=this.group.userData.floatY??0
    this.group.position.y+=(Math.sin(t*.55+this.floatBase)*.005-prevY)*.05
    this.group.userData.floatY=Math.sin(t*.55+this.floatBase)*.005
  }

  addTo(s:THREE.Scene):void{s.add(this.group)}
  removeFrom(s:THREE.Scene):void{s.remove(this.group)}
}

interface DragState{win:XRWindow;hi:number;planeZ:number;ox:number;oy:number}

export class WindowManager {
  private wins: XRWindow[]=[]
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private stereoCamera: THREE.PerspectiveCamera|null=null
  private drag: DragState|null=null
  private cd=0
  private ray=new THREE.Raycaster()
  private plane=new THREE.Plane()

  constructor(scene:THREE.Scene,camera:THREE.PerspectiveCamera){this.scene=scene;this.camera=camera}
  setStereoCamera(cam:THREE.PerspectiveCamera|null):void{this.stereoCamera=cam}
  add(win:XRWindow):void{this.wins.push(win);win.addTo(this.scene)}
  remove(win:XRWindow):void{this.wins=this.wins.filter(w=>w!==win);win.removeFrom(this.scene)}

  private ndcToPlane(nx:number,ny:number,pz:number):THREE.Vector3|null{
    const cam=this.stereoCamera??this.camera
    this.ray.setFromCamera(new THREE.Vector2(nx,ny),cam)
    this.plane.set(new THREE.Vector3(0,0,1),-pz)
    const t=new THREE.Vector3()
    return this.ray.ray.intersectPlane(this.plane,t)?t:null
  }

  update(time:number, gestures:(GestureResult|null)[], fingerNDC:({ndcX:number;ndcY:number}|null)[]): void {
    this.cd=Math.max(0,this.cd-1)
    this.wins.forEach(w=>w.update(time))

    for (let hi=0;hi<2;hi++) {
      const g=gestures[hi], ndc=fingerNDC[hi]
      if (!ndc) continue
      const pinching=g && g.type==='pinch' && g.pinchStrength>.72

      // Drag start
      if (!this.drag && pinching && this.cd===0) {
        for (const win of [...this.wins].reverse()) {
          const pz=win.getWorldZ(), wp=this.ndcToPlane(ndc.ndcX,ndc.ndcY,pz)
          if (!wp) continue
          // Close button
          if (win.hitCloseBtn(wp)) {
            win.onClose?.(); this.cd=20; break
          }
          if (win.hitDragBar(wp)) {
            const p=new THREE.Vector3(); win.group.getWorldPosition(p)
            this.drag={win,hi,planeZ:pz,ox:p.x-wp.x,oy:p.y-wp.y}
            win.dragging=true; break
          }
        }
      }

      // Drag continue
      if (this.drag && this.drag.hi===hi) {
        if (g && g.pinchStrength>.38) {
          const pt=this.ndcToPlane(ndc.ndcX,ndc.ndcY,this.drag.planeZ)
          if (pt) this.drag.win.group.position.lerp(
            new THREE.Vector3(pt.x+this.drag.ox,pt.y+this.drag.oy,this.drag.planeZ),.3)
        } else {this.drag.win.dragging=false;this.drag=null;this.cd=18}
      }
    }

    // Hover & press buttons
    for (const win of this.wins) {
      if (win.dragging) continue
      let dragHov=false, hovBtn:WinButton|null=null
      for (let hi=0;hi<2;hi++) {
        const g=gestures[hi], ndc=fingerNDC[hi]
        if (!ndc) continue
        const wp=this.ndcToPlane(ndc.ndcX,ndc.ndcY,win.getWorldZ())
        if (!wp) continue
        if (win.hitDragBar(wp)) dragHov=true
        const btn=win.hitButton(wp)
        if (btn) {
          hovBtn=btn
          if (win.isFingerInFront(wp) && g && g.pinchStrength>.82 && this.cd===0) {
            win.pressButton(btn);this.cd=22
          }
        }
      }
      win.setDragHighlight(dragHov)
      win.setButtonHovered(hovBtn)
    }
  }

  getWindows():XRWindow[]{return this.wins}
}
