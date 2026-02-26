/**
 * WindowManager + XRWindow v6
 *
 * ГЛАВНЫЕ ФИКСЫ:
 * 1. Кнопки: hit-test через РЕАЛЬНЫЕ 3D world coords пальца (не NDC ray projection)
 *    — NDC→plane даёт неточный Z, поэтому кнопки "не жались"
 * 2. Drag: увеличена зона захвата drag bar, снижен порог pinch
 * 3. Обнаружение нажатия: убран isFingerInFront() — он ломал нажатия при неточном Z
 * 4. Cooldown раздельный для drag и press — не блокируют друг друга
 */
import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

export interface WinButton { label: string; color?: number; onClick?: () => void }
export interface WinContent { buttons: WinButton[] }
export interface WinOptions {
  title: string; width?: number; height?: number
  position?: THREE.Vector3; content?: WinContent; closeable?: boolean
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function canvasTex(fn:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void,w=512,h=128):THREE.CanvasTexture{
  const c=document.createElement('canvas');c.width=w;c.height=h
  fn(c.getContext('2d')!,w,h);const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t
}
function lighten(c:number,a:number):number{
  return(Math.min(255,((c>>16)&255)+a)<<16)|(Math.min(255,((c>>8)&255)+a)<<8)|(Math.min(255,(c&255)+a))
}
function btnTex(label:string,color:number,hov=false):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    const bg=hov?lighten(color,45):color
    ctx.fillStyle=`#${bg.toString(16).padStart(6,'0')}`
    ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,22);ctx.fill()
    if(hov){const g=ctx.createLinearGradient(0,0,0,H*.55);g.addColorStop(0,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(4,4,W-8,H*.5,22);ctx.fill()}
    ctx.fillStyle='rgba(255,255,255,.94)';ctx.font=`600 ${Math.round(H*.42)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,W/2,H/2,W-28)
  })
}
function titleTex(t:string):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    ctx.fillStyle='rgba(225,232,255,.93)';ctx.font=`700 ${Math.round(H*.55)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,H/2,W-24)
  },1024,96)
}

const C={bg:0x0d1420,titleBg:0x111e35,dragBg:0x0a111e,border:0x2a3a52,accent:0x6366f1}
const PD=0.024,TH=0.13,BRH=0.10,BTN_D=0.028

interface BtnEntry{mesh:THREE.Mesh;btn:WinButton}
interface DragState{win:XRWindow;hi:number;planeZ:number;ox:number;oy:number}

// ─── XRWindow ─────────────────────────────────────────────────────────────────
export class XRWindow {
  group:THREE.Group
  onClose?:()=>void
  readonly closeable:boolean
  private W:number;private H:number
  private glow!:THREE.Mesh;private border!:THREE.LineSegments
  private closeBtn?:THREE.Mesh
  private btnEntries:BtnEntry[]=[]
  private _dragging=false
  private floatBase=Math.random()*Math.PI*2

  constructor(opts:WinOptions){
    this.W=opts.width??1.5;this.H=opts.height??1.0
    this.closeable=opts.closeable!==false
    this.group=new THREE.Group()
    this.group.position.copy(opts.position??new THREE.Vector3(0,0,-2.6))
    this.build(opts.title,opts.content??{buttons:[]})
  }

  private build(title:string,content:WinContent):void{
    const{W,H}=this
    // Panel
    this.group.add(new THREE.Mesh(new THREE.BoxGeometry(W,H,PD),
      new THREE.MeshPhysicalMaterial({color:C.bg,transparent:true,opacity:.92,roughness:.08,metalness:.15})))
    // Title bar
    const tb=new THREE.Mesh(new THREE.BoxGeometry(W,TH,PD+.005),
      new THREE.MeshPhysicalMaterial({color:C.titleBg,roughness:.06,metalness:.18}))
    tb.position.set(0,H/2-TH/2,.001);this.group.add(tb)
    // Accent stripe
    const as=new THREE.Mesh(new THREE.BoxGeometry(W,.003,PD+.008),
      new THREE.MeshBasicMaterial({color:C.accent}))
    as.position.set(0,H/2-TH,.003);this.group.add(as)
    // Title text
    const tt=new THREE.Mesh(new THREE.PlaneGeometry(W*.76,TH*.68),
      new THREE.MeshBasicMaterial({map:titleTex(title),transparent:true,depthWrite:false}))
    tt.position.set(-.02,H/2-TH/2,PD/2+.005);this.group.add(tt)
    // Traffic lights
    ;[0xff5f56,0xffbd2e,0x27c93f].forEach((col,i)=>{
      const d=new THREE.Mesh(new THREE.SphereGeometry(.018,10,8),
        new THREE.MeshPhysicalMaterial({color:col,emissive:col,emissiveIntensity:.3,roughness:.3}))
      d.position.set(-W/2+.055+i*.052,H/2-TH/2,PD/2+.012);this.group.add(d)
    })
    // Close button
    if(this.closeable){
      this.closeBtn=new THREE.Mesh(new THREE.BoxGeometry(.075,.052,.022),
        new THREE.MeshPhysicalMaterial({color:0x991b1b,roughness:.2}))
      this.closeBtn.position.set(W/2-.048,H/2-TH/2,PD/2+.013)
      this.group.add(this.closeBtn)
      const xt=new THREE.Mesh(new THREE.PlaneGeometry(.062,.042),
        new THREE.MeshBasicMaterial({map:canvasTex((ctx,W,H)=>{
          ctx.fillStyle='rgba(255,255,255,.9)';ctx.font=`bold ${H*.72}px sans-serif`
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✕',W/2,H/2)
        },128,64),transparent:true,depthWrite:false}))
      xt.position.set(W/2-.048,H/2-TH/2,PD/2+.024);this.group.add(xt)
    }
    // Drag bar
    const db=new THREE.Mesh(new THREE.BoxGeometry(W,BRH,PD+.005),
      new THREE.MeshPhysicalMaterial({color:C.dragBg,roughness:.15,metalness:.1}))
    db.position.set(0,-H/2+BRH/2,.001);this.group.add(db)
    // Grip dots
    for(let col=-3;col<=3;col++)for(let row=0;row<2;row++){
      const d=new THREE.Mesh(new THREE.SphereGeometry(.006,5,4),new THREE.MeshBasicMaterial({color:0x3a4a62}))
      d.position.set(col*.072,-H/2+.026+row*.022,PD/2+.008);this.group.add(d)
    }
    // Glow / border
    this.glow=new THREE.Mesh(new THREE.BoxGeometry(W+.04,H+.04,PD+.04),
      new THREE.MeshBasicMaterial({color:C.accent,transparent:true,opacity:0,side:THREE.BackSide,depthWrite:false}))
    this.group.add(this.glow)
    this.border=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W+.007,H+.007,PD+.005)),
      new THREE.LineBasicMaterial({color:C.border,transparent:true,opacity:.7}))
    this.group.add(this.border)
    // Buttons
    const btns=content.buttons,cols=btns.length<=1?1:2
    const pad=.055,btnW=cols===1?W-pad*2:(W-pad*3)/2
    const top=H/2-TH-pad,bot=-H/2+BRH+pad
    const rows=Math.ceil(btns.length/cols),gap=.038
    const btnH=Math.min(.185,(top-bot-gap*(rows-1))/rows)
    btns.forEach((btn,i)=>{
      const col=i%cols,row=Math.floor(i/cols)
      const x=cols===1?0:col===0?-(btnW/2+pad/2):(btnW/2+pad/2)
      const y=top-row*(btnH+gap)-btnH/2
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(btnW,btnH,BTN_D),
        new THREE.MeshPhysicalMaterial({map:btnTex(btn.label,btn.color??0x6366f1),transparent:true,opacity:.95,roughness:.12}))
      mesh.position.set(x,y,PD/2+BTN_D/2);this.group.add(mesh)
      this.btnEntries.push({mesh,btn})
    })
  }

  // ── Hit tests ──────────────────────────────────────────────────────────────

  /** Нажатие кнопки: тест через РЕАЛЬНУЮ 3D позицию кончика пальца в world space */
  hitButtonByFinger(fingerWorld:THREE.Vector3):WinButton|null{
    this.group.updateWorldMatrix(true,true)
    for(const{mesh,btn}of this.btnEntries){
      mesh.updateWorldMatrix(true,false)
      const local=mesh.worldToLocal(fingerWorld.clone())
      const p=(mesh.geometry as THREE.BoxGeometry).parameters
      // Большая зона: +8cm по X и Y, +15cm по Z (глубина не точная)
      if(Math.abs(local.x)<p.width/2+.08&&Math.abs(local.y)<p.height/2+.08&&Math.abs(local.z)<p.depth/2+.15)
        return btn
    }
    return null
  }

  /** Drag bar hit */
  hitDragBar(wp:THREE.Vector3):boolean{
    this.group.updateWorldMatrix(true,false)
    const l=this.group.worldToLocal(wp.clone())
    // Увеличенная зона захвата
    return Math.abs(l.x)<this.W/2+.10&&l.y>-this.H/2-.08&&l.y<-this.H/2+BRH+.08&&Math.abs(l.z)<.25
  }

  /** Close button hit */
  hitCloseBtn(wp:THREE.Vector3):boolean{
    if(!this.closeable||!this.closeBtn)return false
    this.closeBtn.updateWorldMatrix(true,false)
    const l=this.closeBtn.worldToLocal(wp.clone())
    return Math.abs(l.x)<.08&&Math.abs(l.y)<.07&&Math.abs(l.z)<.18
  }

  /** NDC-ray based button hit (используется для hover) */
  hitButtonByRay(wp:THREE.Vector3):WinButton|null{
    this.group.updateWorldMatrix(true,false)
    for(const{mesh,btn}of this.btnEntries){
      mesh.updateWorldMatrix(true,false)
      const l=mesh.worldToLocal(wp.clone())
      const p=(mesh.geometry as THREE.BoxGeometry).parameters
      if(Math.abs(l.x)<p.width/2+.05&&Math.abs(l.y)<p.height/2+.05&&Math.abs(l.z)<.18)return btn
    }
    return null
  }

  getWorldZ():number{const p=new THREE.Vector3();this.group.getWorldPosition(p);return p.z}

  setDragHighlight(on:boolean):void{
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity=on?.14:0
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(on?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=on?1:.7
  }

  setButtonHovered(btn:WinButton|null):void{
    for(const b of this.btnEntries){
      const hov=b.btn===btn
      if(hov!==!!b.mesh.userData.wasHov){
        b.mesh.userData.wasHov=hov
        const m=b.mesh.material as THREE.MeshPhysicalMaterial
        const t=btnTex(b.btn.label,b.btn.color??0x6366f1,hov)
        m.map?.dispose();m.map=t;m.needsUpdate=true
        b.mesh.scale.z=hov?1.4:1;b.mesh.position.z+=hov?.004:-.004
      }
    }
  }

  pressButton(btn:WinButton):void{
    for(const b of this.btnEntries){
      if(b.btn!==btn)continue
      b.mesh.position.z-=.010;b.mesh.scale.z=.7
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
    if(this._dragging)return
    const prevY:number=this.group.userData.fY??0
    const nextY=Math.sin(t*.55+this.floatBase)*.006
    this.group.position.y+=(nextY-prevY)*.05
    this.group.userData.fY=nextY
  }

  addTo(s:THREE.Scene):void{s.add(this.group)}
  removeFrom(s:THREE.Scene):void{s.remove(this.group)}
}

// ─── WindowManager ────────────────────────────────────────────────────────────
export class WindowManager{
  private wins:XRWindow[]=[]
  private scene:THREE.Scene;private camera:THREE.PerspectiveCamera
  private stereoCamera:THREE.PerspectiveCamera|null=null
  private drag:DragState|null=null
  private cdDrag=0;private cdPress=0
  private ray=new THREE.Raycaster();private plane=new THREE.Plane()

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

  /**
   * @param gestures      — массив GestureResult [left, right]
   * @param fingerNDC     — NDC coords кончика указательного пальца [left, right]
   * @param fingerWorld   — РЕАЛЬНЫЕ 3D world coords кончика указательного [left, right]
   */
  update(
    time:number,
    gestures:(GestureResult|null)[],
    fingerNDC:({ndcX:number;ndcY:number}|null)[],
    fingerWorld:(THREE.Vector3|null)[]
  ):void{
    this.cdDrag=Math.max(0,this.cdDrag-1)
    this.cdPress=Math.max(0,this.cdPress-1)
    this.wins.forEach(w=>w.update(time))

    // ── Drag ────────────────────────────────────────────────────────────────
    for(let hi=0;hi<2;hi++){
      const g=gestures[hi];const ndc=fingerNDC[hi]
      if(!ndc)continue
      const pinching=g&&g.type==='pinch'&&g.pinchStrength>.65

      // Drag start
      if(!this.drag&&pinching&&this.cdDrag===0){
        for(const win of[...this.wins].reverse()){
          const pz=win.getWorldZ()
          const wp=this.ndcToPlane(ndc.ndcX,ndc.ndcY,pz);if(!wp)continue
          // Close
          if(win.hitCloseBtn(wp)){win.onClose?.();this.cdDrag=25;break}
          // Drag
          if(win.hitDragBar(wp)){
            const p=new THREE.Vector3();win.group.getWorldPosition(p)
            this.drag={win,hi,planeZ:pz,ox:p.x-wp.x,oy:p.y-wp.y}
            win.dragging=true;break
          }
        }
      }

      // Drag continue
      if(this.drag&&this.drag.hi===hi){
        if(g&&g.pinchStrength>.32){
          const pt=this.ndcToPlane(ndc.ndcX,ndc.ndcY,this.drag.planeZ)
          if(pt)this.drag.win.group.position.lerp(
            new THREE.Vector3(pt.x+this.drag.ox,pt.y+this.drag.oy,this.drag.planeZ),.35)
        }else{this.drag.win.dragging=false;this.drag=null;this.cdDrag=15}
      }
    }

    // ── Button hover & press ─────────────────────────────────────────────────
    for(const win of this.wins){
      if(win.dragging)continue
      let dragHov=false;let hovBtn:WinButton|null=null

      for(let hi=0;hi<2;hi++){
        const g=gestures[hi];const ndc=fingerNDC[hi];const fW=fingerWorld[hi]
        if(!ndc)continue

        const wp=this.ndcToPlane(ndc.ndcX,ndc.ndcY,win.getWorldZ())
        if(wp&&win.hitDragBar(wp))dragHov=true

        // Hover: ray-based (более надёжный для hover)
        const hBtn=wp?win.hitButtonByRay(wp):null
        if(hBtn&&!hovBtn)hovBtn=hBtn

        // НАЖАТИЕ: используем реальный 3D finger world position
        if(fW&&g&&g.pinchStrength>.75&&this.cdPress===0){
          const pressBtn=win.hitButtonByFinger(fW)
          if(pressBtn){
            win.pressButton(pressBtn)
            this.cdPress=28
          }
        }
      }
      win.setDragHighlight(dragHov)
      win.setButtonHovered(hovBtn)
    }
  }

  getWindows():XRWindow[]{return this.wins}
}
