import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

export interface WinButton  { label: string; color?: number; onClick?: () => void }
export interface WinContent { buttons: WinButton[] }
export interface WinOptions {
  title: string; width?: number; height?: number
  position?: THREE.Vector3; content?: WinContent; closeable?: boolean
}

function canvasTex(fn:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void,w=512,h=128):THREE.CanvasTexture{
  const c=document.createElement('canvas');c.width=w;c.height=h
  fn(c.getContext('2d')!,w,h);const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t
}
function lighten(c:number,a:number):number{
  return(Math.min(255,((c>>16)&255)+a)<<16)|(Math.min(255,((c>>8)&255)+a)<<8)|(Math.min(255,(c&255)+a))
}

function btnTex(label:string,color:number,hov=false,progress=0):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    const bg=hov?lighten(color,40):color
    ctx.fillStyle=`#${bg.toString(16).padStart(6,'0')}`
    ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,16);ctx.fill()
    if(hov){
      const g=ctx.createLinearGradient(0,0,0,H*.5)
      g.addColorStop(0,'rgba(255,255,255,.18)');g.addColorStop(1,'rgba(255,255,255,0)')
      ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(4,4,W-8,H*.5,16);ctx.fill()
    }
    ctx.strokeStyle=hov?'rgba(120,160,255,.55)':'rgba(60,90,160,.25)'
    ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,16);ctx.stroke()
    ctx.fillStyle='rgba(255,255,255,.95)'
    ctx.font=`600 ${Math.round(H*.34)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(label,W/2,progress>0?H*.38:H/2,W-20)
    if(progress>0){
      const cx=W/2,cy=H/2,r=Math.min(W,H)*.40
      ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=5
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke()
      ctx.strokeStyle='rgba(80,200,255,.95)';ctx.lineWidth=5;ctx.lineCap='round'
      ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()
      ctx.fillStyle='rgba(160,220,255,.90)'
      ctx.font=`500 ${Math.round(H*.22)}px -apple-system,sans-serif`
      ctx.fillText(((1-progress)*2).toFixed(1)+'с',cx,H*.76)
    }
  })
}

function titleTex(t:string):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    ctx.fillStyle='rgba(210,225,255,.92)'
    ctx.font=`600 ${Math.round(H*.52)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,H/2,W-24)
  },1024,96)
}

function closeBtnTex():THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    ctx.fillStyle='#7f1d1d'
    ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,12);ctx.fill()
    const g=ctx.createLinearGradient(0,0,0,H*.5)
    g.addColorStop(0,'rgba(255,255,255,.15)');g.addColorStop(1,'rgba(255,255,255,0)')
    ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(4,4,W-8,H*.5,12);ctx.fill()
    ctx.fillStyle='rgba(255,200,200,.95)'
    ctx.font=`bold ${Math.round(H*.60)}px sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✕',W/2,H/2)
  },128,128)
}

const C={bg:0x080f1a,titleBg:0x0c1525,dragBg:0x060c15,border:0x1a2840,accent:0x4f6ef7}
const PD=0.020,TH=0.096,BRH=0.068,BTN_D=0.022
const HOLD_TIME=2.0

interface BtnEntry{mesh:THREE.Mesh;btn:WinButton;holdProgress:number}
interface DragState{win:XRWindow;hi:number;planeZ:number;ox:number;oy:number}

export class XRWindow{
  group:THREE.Group
  onClose?:()=>void
  readonly closeable:boolean
  private W:number;private H:number
  private glow!:THREE.Mesh;private border!:THREE.LineSegments
  private closeBtn?:THREE.Mesh
  btnEntries:BtnEntry[]=[]
  private _dragging=false

  constructor(opts:WinOptions){
    this.W=opts.width??1.5;this.H=opts.height??1.0
    this.closeable=opts.closeable!==false
    this.group=new THREE.Group()
    this.group.position.copy(opts.position??new THREE.Vector3(0,0,-2.0))
    this.build(opts.title,opts.content??{buttons:[]})
  }

  private build(title:string,content:WinContent):void{
    const{W,H}=this
    // Panel
    this.group.add(new THREE.Mesh(
      new THREE.BoxGeometry(W,H,PD),
      new THREE.MeshPhysicalMaterial({color:C.bg,transparent:true,opacity:.93,roughness:.06,metalness:.12})
    ))
    // Title bar
    const tb=new THREE.Mesh(new THREE.BoxGeometry(W,TH,PD+.004),
      new THREE.MeshPhysicalMaterial({color:C.titleBg,roughness:.04,metalness:.20}))
    tb.position.set(0,H/2-TH/2,.001);this.group.add(tb)
    // Accent line
    const al=new THREE.Mesh(new THREE.BoxGeometry(W,.0025,PD+.006),
      new THREE.MeshBasicMaterial({color:C.accent}))
    al.position.set(0,H/2-TH,.002);this.group.add(al)
    // Close button
    if(this.closeable){
      const CSIZE=0.072
      this.closeBtn=new THREE.Mesh(
        new THREE.BoxGeometry(CSIZE,CSIZE-.004,BTN_D+.006),
        new THREE.MeshPhysicalMaterial({map:closeBtnTex(),transparent:true,opacity:.96,roughness:.10})
      )
      this.closeBtn.position.set(W/2-CSIZE/2-.010,H/2-TH/2,PD/2+BTN_D/2+.008)
      this.group.add(this.closeBtn)
    }
    // Title text
    const titleW=this.closeable?W*.72:W*.82
    const tt=new THREE.Mesh(new THREE.PlaneGeometry(titleW,TH*.65),
      new THREE.MeshBasicMaterial({map:titleTex(title),transparent:true,depthWrite:false}))
    tt.position.set(this.closeable?-.040:0,H/2-TH/2,PD/2+.004);this.group.add(tt)
    // Drag bar
    const db=new THREE.Mesh(new THREE.BoxGeometry(W,BRH,PD+.004),
      new THREE.MeshPhysicalMaterial({color:C.dragBg,roughness:.20,metalness:.08}))
    db.position.set(0,-H/2+BRH/2,.001);this.group.add(db)
    // Grip lines
    for(let row=0;row<3;row++){
      const gl=new THREE.Mesh(new THREE.BoxGeometry(W*.30,.0018,PD+.006),
        new THREE.MeshBasicMaterial({color:0x243350,transparent:true,opacity:.65}))
      gl.position.set(0,-H/2+BRH/2+row*.016-.016,.001);this.group.add(gl)
    }
    // Glow & border
    this.glow=new THREE.Mesh(new THREE.BoxGeometry(W+.03,H+.03,PD+.03),
      new THREE.MeshBasicMaterial({color:C.accent,transparent:true,opacity:0,side:THREE.BackSide,depthWrite:false}))
    this.group.add(this.glow)
    this.border=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W+.005,H+.005,PD+.004)),
      new THREE.LineBasicMaterial({color:C.border,transparent:true,opacity:.60}))
    this.group.add(this.border)
    this._buildButtons(content.buttons)
  }

  private _buildButtons(btns:WinButton[]):void{
    if(btns.length===0)return
    const{W,H}=this
    const n=btns.length
    const cols=n<=2?n:n<=4?2:3
    const rows=Math.ceil(n/cols)
    const pad=.036
    const btnW=(W-pad*(cols+1))/cols
    const contentTop=H/2-TH-pad, contentBot=-H/2+BRH+pad
    const availH=contentTop-contentBot-pad*(rows-1)
    const btnH=Math.min(.175,availH/rows)
    const totalH=btnH*rows+pad*(rows-1)
    const startY=(contentTop+contentBot)/2+totalH/2-btnH/2
    btns.forEach((btn,i)=>{
      const col=i%cols,row=Math.floor(i/cols)
      const x=-W/2+pad+col*(btnW+pad)+btnW/2
      const y=startY-row*(btnH+pad)
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(btnW,btnH,BTN_D),
        new THREE.MeshPhysicalMaterial({map:btnTex(btn.label,btn.color??0x1e293b),transparent:true,opacity:.96,roughness:.10}))
      mesh.position.set(x,y,PD/2+BTN_D/2);this.group.add(mesh)
      this.btnEntries.push({mesh,btn,holdProgress:0})
    })
  }

  replaceButtons(btns:WinButton[]):void{
    for(const e of this.btnEntries){
      this.group.remove(e.mesh);e.mesh.geometry.dispose()
      ;(e.mesh.material as THREE.MeshPhysicalMaterial).map?.dispose()
      ;(e.mesh.material as THREE.MeshPhysicalMaterial).dispose()
    }
    this.btnEntries=[];this._buildButtons(btns)
  }

  hitButtonByFinger(fw:THREE.Vector3):BtnEntry|null{
    this.group.updateWorldMatrix(true,true)
    for(const e of this.btnEntries){
      e.mesh.updateWorldMatrix(true,false)
      const l=e.mesh.worldToLocal(fw.clone())
      const p=(e.mesh.geometry as THREE.BoxGeometry).parameters
      if(Math.abs(l.x)<p.width/2+.07&&Math.abs(l.y)<p.height/2+.07&&Math.abs(l.z)<p.depth/2+.18)return e
    }
    return null
  }

  hitDragBar(wp:THREE.Vector3):boolean{
    this.group.updateWorldMatrix(true,false)
    const l=this.group.worldToLocal(wp.clone())
    return Math.abs(l.x)<this.W/2+.08&&l.y>-this.H/2-.06&&l.y<-this.H/2+BRH+.06&&Math.abs(l.z)<.20
  }

  hitCloseBtn(wp:THREE.Vector3):boolean{
    if(!this.closeable||!this.closeBtn)return false
    this.closeBtn.updateWorldMatrix(true,false)
    const l=this.closeBtn.worldToLocal(wp.clone())
    return Math.abs(l.x)<.06&&Math.abs(l.y)<.06&&Math.abs(l.z)<.16
  }

  hitButtonByRay(wp:THREE.Vector3):BtnEntry|null{
    this.group.updateWorldMatrix(true,false)
    for(const e of this.btnEntries){
      e.mesh.updateWorldMatrix(true,false)
      const l=e.mesh.worldToLocal(wp.clone())
      const p=(e.mesh.geometry as THREE.BoxGeometry).parameters
      if(Math.abs(l.x)<p.width/2+.04&&Math.abs(l.y)<p.height/2+.04&&Math.abs(l.z)<.16)return e
    }
    return null
  }

  getWorldZ():number{const p=new THREE.Vector3();this.group.getWorldPosition(p);return p.z}

  updateButtonProgress(entry:BtnEntry,progress:number):void{
    entry.holdProgress=progress
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=btnTex(entry.btn.label,entry.btn.color??0x1e293b,true,progress)
    m.map?.dispose();m.map=t;m.needsUpdate=true
  }

  resetButtonProgress(entry:BtnEntry):void{
    if(entry.holdProgress===0)return
    entry.holdProgress=0
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=btnTex(entry.btn.label,entry.btn.color??0x1e293b,false,0)
    m.map?.dispose();m.map=t;m.needsUpdate=true
  }

  setDragHighlight(on:boolean):void{
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity=on?.12:0
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(on?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=on?1:.60
  }

  setButtonHovered(entry:BtnEntry|null):void{
    for(const e of this.btnEntries){
      const hov=e===entry
      if(hov!==!!e.mesh.userData.wasHov){
        e.mesh.userData.wasHov=hov
        if(e.holdProgress>0)continue
        const m=e.mesh.material as THREE.MeshPhysicalMaterial
        const t=btnTex(e.btn.label,e.btn.color??0x1e293b,hov,0)
        m.map?.dispose();m.map=t;m.needsUpdate=true
        e.mesh.position.z+=hov?.004:-.004
        e.mesh.scale.z=hov?1.35:1
      }
    }
  }

  pressButton(entry:BtnEntry):void{
    entry.mesh.position.z-=.008;entry.mesh.scale.z=.75
    setTimeout(()=>{entry.mesh.position.z+=.008;entry.mesh.scale.z=1;this.resetButtonProgress(entry)},140)
    entry.btn.onClick?.()
  }

  get dragging(){return this._dragging}
  set dragging(v:boolean){
    this._dragging=v
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(v?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=v?1:.60
  }

  updateRenderOrder(camera:THREE.PerspectiveCamera):void{
    const wp=new THREE.Vector3();this.group.getWorldPosition(wp)
    const order=Math.round(1000-camera.position.distanceTo(wp)*100)
    this.group.traverse((obj:THREE.Object3D)=>{obj.renderOrder=order})
  }

  update(_t:number):void{}
  addTo(s:THREE.Scene):void{s.add(this.group)}
  removeFrom(s:THREE.Scene):void{s.remove(this.group)}
}

export class WindowManager{
  private wins:XRWindow[]=[]
  private scene:THREE.Scene;private camera:THREE.PerspectiveCamera
  private stereoCamera:THREE.PerspectiveCamera|null=null
  private drag:DragState|null=null
  private cdDrag=0
  private ray=new THREE.Raycaster();private plane=new THREE.Plane()
  private holdState:{entry:BtnEntry;win:XRWindow;startTime:number}|null=null
  private cdPress=0

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

  private fingerAtWinZ(ndc:{ndcX:number;ndcY:number},win:XRWindow):THREE.Vector3|null{
    return this.ndcToPlane(ndc.ndcX,ndc.ndcY,win.getWorldZ())
  }

  update(
    time:number,
    gestures:(GestureResult|null)[],
    fingerNDC:({ndcX:number;ndcY:number}|null)[],
    _fingerWorld:(THREE.Vector3|null)[]
  ):void{
    this.cdDrag=Math.max(0,this.cdDrag-1)
    this.cdPress=Math.max(0,this.cdPress-1)

    // Billboard + depth sort
    for(const w of this.wins){
      w.updateRenderOrder(this.camera)
      if(w.group.visible){
        const wp=new THREE.Vector3();w.group.getWorldPosition(wp)
        const dir=new THREE.Vector3().subVectors(this.camera.position,wp)
        if(dir.lengthSq()>0.0001){
          const m=new THREE.Matrix4().lookAt(wp,this.camera.position,new THREE.Vector3(0,1,0))
          w.group.quaternion.setFromRotationMatrix(m)
        }
      }
    }

    // ── DRAG (GRAB) ──────────────────────────────────────────────────────────
    for(let hi=0;hi<2;hi++){
      const g=gestures[hi];const ndc=fingerNDC[hi];if(!ndc)continue
      const grabbing=g&&g.type==='grab'&&g.grabStrength>.55
      if(!this.drag&&grabbing&&this.cdDrag===0){
        for(const win of[...this.wins].reverse()){
          const wp=this.fingerAtWinZ(ndc,win);if(!wp)continue
          if(win.hitDragBar(wp)){
            const p=new THREE.Vector3();win.group.getWorldPosition(p)
            this.drag={win,hi,planeZ:win.getWorldZ(),ox:p.x-wp.x,oy:p.y-wp.y}
            win.dragging=true;break
          }
        }
      }
      if(this.drag&&this.drag.hi===hi){
        if(g&&g.grabStrength>.28){
          const pt=this.ndcToPlane(ndc.ndcX,ndc.ndcY,this.drag.planeZ)
          if(pt)this.drag.win.group.position.lerp(
            new THREE.Vector3(pt.x+this.drag.ox,pt.y+this.drag.oy,this.drag.planeZ),.38)
        }else{this.drag.win.dragging=false;this.drag=null;this.cdDrag=12}
      }
    }

    // ── CLOSE кнопка ─────────────────────────────────────────────────────────
    if(this.cdPress===0){
      for(let hi=0;hi<2;hi++){
        const g=gestures[hi];const ndc=fingerNDC[hi]
        if(!ndc||!g||g.threeFingerStrength<.62)continue
        for(const win of[...this.wins].reverse()){
          const wp=this.fingerAtWinZ(ndc,win);if(!wp)continue
          if(win.hitCloseBtn(wp)){win.onClose?.();this.cdPress=30;break}
        }
      }
    }

    // ── HOLD-TO-PRESS ────────────────────────────────────────────────────────
    let bestG:GestureResult|null=null,bestNDC:{ndcX:number;ndcY:number}|null=null
    for(let hi=0;hi<2;hi++){
      const g=gestures[hi]
      if(g&&g.threeFingerStrength>(bestG?.threeFingerStrength??0)){bestG=g;bestNDC=fingerNDC[hi]}
    }
    const pressing=!!(bestG&&bestG.threeFingerStrength>.52)
    let anyHit=false
    if(pressing&&bestNDC&&this.cdPress===0){
      for(const win of this.wins){
        if(!win.group.visible||win.dragging)continue
        const wp=this.fingerAtWinZ(bestNDC,win);if(!wp)continue
        const hitEntry=win.hitButtonByFinger(wp)
        if(hitEntry){
          anyHit=true
          if(this.holdState&&this.holdState.entry===hitEntry){
            const progress=Math.min(1,(time-this.holdState.startTime)/HOLD_TIME)
            win.updateButtonProgress(hitEntry,progress)
            if(progress>=1){win.pressButton(hitEntry);this.holdState=null;this.cdPress=25}
          }else{
            if(this.holdState)this.holdState.win.resetButtonProgress(this.holdState.entry)
            this.holdState={entry:hitEntry,win,startTime:time}
            win.updateButtonProgress(hitEntry,0.01)
          }
          break
        }
      }
    }
    if(!pressing||!anyHit){
      if(this.holdState){this.holdState.win.resetButtonProgress(this.holdState.entry);this.holdState=null}
    }

    // ── HOVER ────────────────────────────────────────────────────────────────
    for(const win of this.wins){
      if(!win.group.visible)continue
      let hovEntry:BtnEntry|null=null,dragHov=false
      for(let hi=0;hi<2;hi++){
        const ndc=fingerNDC[hi];if(!ndc)continue
        const wp=this.fingerAtWinZ(ndc,win);if(!wp)continue
        if(win.hitDragBar(wp))dragHov=true
        const h=win.hitButtonByRay(wp);if(h&&!hovEntry)hovEntry=h
      }
      win.setDragHighlight(dragHov);win.setButtonHovered(hovEntry)
    }
  }

  hideAll(except?:XRWindow[]):void{
    for(const w of this.wins){if(except&&except.includes(w))continue;w.group.visible=false}
  }
  showAll():void{for(const w of this.wins)w.group.visible=true}
  getWindows():XRWindow[]{return this.wins}
}