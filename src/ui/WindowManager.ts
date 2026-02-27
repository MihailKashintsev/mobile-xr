/**
 * WindowManager + XRWindow v8
 *
 * ИЗМЕНЕНИЯ:
 * - Убраны три цветных шарика (traffic lights)
 * - Кнопки тасктбара: квадратный дизайн, правильный layout для 5 кнопок
 * - Hold-таймер: убрана привязка к конкретной руке (hi), работает с любой
 * - Hit-test: проекция пальца на реальную глубину окна
 * - Drag: кулак (grab), Press: три пальца (three_finger)
 */
import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

export interface WinButton { label: string; color?: number; onClick?: () => void }
export interface WinContent { buttons: WinButton[] }
export interface WinOptions {
  title: string; width?: number; height?: number
  position?: THREE.Vector3; content?: WinContent; closeable?: boolean
  /** Квадратные иконки вместо прямоугольных кнопок (для тасктбара) */
  squareButtons?: boolean
}

// ─── Canvas helpers ─────────────────────────────────────────────────────────
function canvasTex(fn:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void,w=512,h=128):THREE.CanvasTexture{
  const c=document.createElement('canvas');c.width=w;c.height=h
  fn(c.getContext('2d')!,w,h);const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t
}
function lighten(c:number,a:number):number{
  return(Math.min(255,((c>>16)&255)+a)<<16)|(Math.min(255,((c>>8)&255)+a)<<8)|(Math.min(255,(c&255)+a))
}

/** Прямоугольная кнопка с опциональным прогресс-кольцом */
function btnTex(label:string,color:number,hov=false,progress=0):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    // Фон
    const bg=hov?lighten(color,40):color
    const r=18
    ctx.fillStyle=`#${bg.toString(16).padStart(6,'0')}`
    ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,r);ctx.fill()
    // Gradient sheen
    if(hov){
      const g=ctx.createLinearGradient(0,0,0,H*.5)
      g.addColorStop(0,'rgba(255,255,255,.20)');g.addColorStop(1,'rgba(255,255,255,0)')
      ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(4,4,W-8,H*.5,r);ctx.fill()
    }
    // Border glow
    ctx.strokeStyle=hov?'rgba(120,160,255,.6)':'rgba(80,100,160,.3)'
    ctx.lineWidth=2
    ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,r);ctx.stroke()

    // Text
    ctx.fillStyle='rgba(255,255,255,.95)'
    ctx.font=`600 ${Math.round(H*.34)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText(label,W/2,progress>0?H*.38:H/2,W-20)

    // Progress ring
    if(progress>0){
      const cx=W/2,cy=H/2,rad=Math.min(W,H)*0.40
      ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=5
      ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke()
      ctx.strokeStyle='rgba(80,200,255,0.95)';ctx.lineWidth=5
      ctx.lineCap='round'
      ctx.beginPath();ctx.arc(cx,cy,rad,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()
      const secsLeft=((1-progress)*2).toFixed(1)
      ctx.fillStyle='rgba(160,220,255,.90)'
      ctx.font=`500 ${Math.round(H*.22)}px -apple-system,sans-serif`
      ctx.fillText(secsLeft+'с',cx,H*.76)
    }
  })
}

/** Квадратная иконка-кнопка для тасктбара */
function iconTex(label:string,color:number,hov=false,active=false,progress=0):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    // Фон: тёмный стекломорф
    const bg = active ? 0x1d4ed8 : hov ? 0x1e3a5f : 0x111827
    ctx.fillStyle=`#${bg.toString(16).padStart(6,'0')}`
    ctx.beginPath();ctx.roundRect(6,6,W-12,H-12,20);ctx.fill()

    // Внутренний градиент
    const g=ctx.createLinearGradient(0,0,0,H*.6)
    if(active){
      g.addColorStop(0,'rgba(99,130,255,.30)');g.addColorStop(1,'rgba(30,60,160,.0)')
    } else {
      g.addColorStop(0,'rgba(255,255,255,.08)');g.addColorStop(1,'rgba(255,255,255,.0)')
    }
    ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(6,6,W-12,H*.55,20);ctx.fill()

    // Border
    ctx.strokeStyle=active?'rgba(120,160,255,.8)':hov?'rgba(100,140,255,.5)':'rgba(60,80,120,.4)'
    ctx.lineWidth=active?2.5:1.5
    ctx.beginPath();ctx.roundRect(6,6,W-12,H-12,20);ctx.stroke()

    // Emoji иконка (большая)
    // Разбиваем label: первый "слово" = иконка, остальное = текст
    const parts=label.trim().split(/\s+/)
    const icon=parts[0]??''
    const text=parts.slice(1).join(' ')

    ctx.textAlign='center';ctx.textBaseline='middle'

    if(text){
      // Иконка сверху
      ctx.font=`${Math.round(H*.35)}px serif`
      ctx.fillText(icon,W/2,H*.36)
      // Текст снизу
      ctx.fillStyle='rgba(200,215,255,.92)'
      ctx.font=`600 ${Math.round(H*.18)}px -apple-system,sans-serif`
      ctx.fillText(text,W/2,H*.72,W-12)
    } else {
      // Только иконка — крупно
      ctx.font=`${Math.round(H*.42)}px serif`
      ctx.fillText(icon,W/2,H/2)
    }

    // Active dot
    if(active){
      ctx.fillStyle='rgba(120,200,255,1)'
      ctx.beginPath();ctx.arc(W*.82,H*.18,5,0,Math.PI*2);ctx.fill()
    }

    // Progress ring
    if(progress>0){
      const cx=W/2,cy=H/2,rad=Math.min(W,H)*0.44
      ctx.strokeStyle='rgba(255,255,255,.10)';ctx.lineWidth=4
      ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke()
      ctx.strokeStyle='rgba(80,210,255,.95)';ctx.lineWidth=4;ctx.lineCap='round'
      ctx.beginPath();ctx.arc(cx,cy,rad,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()
    }
  },256,256)
}

function titleTex(t:string):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    ctx.fillStyle='rgba(210,225,255,.90)';ctx.font=`600 ${Math.round(H*.52)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,W/2,H/2,W-24)
  },1024,96)
}

const C={bg:0x080f1a,titleBg:0x0d1528,dragBg:0x060c16,border:0x1e2d45,accent:0x4f6ef7}
const PD=0.020, TH=0.10, BRH=0.072, BTN_D=0.022
const HOLD_TIME=2.0

interface BtnEntry{mesh:THREE.Mesh;btn:WinButton;holdProgress:number;isSquare:boolean}
interface DragState{win:XRWindow;hi:number;planeZ:number;ox:number;oy:number}

// ─── XRWindow ────────────────────────────────────────────────────────────────
export class XRWindow {
  group:THREE.Group
  onClose?:()=>void
  readonly closeable:boolean
  private W:number;private H:number
  private glow!:THREE.Mesh;private border!:THREE.LineSegments
  private closeBtn?:THREE.Mesh
  btnEntries:BtnEntry[]=[]
  private _dragging=false
  private _squareButtons:boolean

  constructor(opts:WinOptions){
    this.W=opts.width??1.5;this.H=opts.height??1.0
    this.closeable=opts.closeable!==false
    this._squareButtons=opts.squareButtons??false
    this.group=new THREE.Group()
    this.group.position.copy(opts.position??new THREE.Vector3(0,0,-2.0))
    this.build(opts.title,opts.content??{buttons:[]})
  }

  private build(title:string,content:WinContent):void{
    const{W,H}=this

    // ── Панель ───────────────────────────────────────────────────────────────
    const panel=new THREE.Mesh(
      new THREE.BoxGeometry(W,H,PD),
      new THREE.MeshPhysicalMaterial({
        color:C.bg,transparent:true,opacity:.94,
        roughness:.05,metalness:.12,
      }))
    this.group.add(panel)

    // ── Title bar ─────────────────────────────────────────────────────────────
    const tb=new THREE.Mesh(
      new THREE.BoxGeometry(W,TH,PD+.004),
      new THREE.MeshPhysicalMaterial({color:C.titleBg,roughness:.04,metalness:.20}))
    tb.position.set(0,H/2-TH/2,.001);this.group.add(tb)

    // Accent line под заголовком
    const al=new THREE.Mesh(
      new THREE.BoxGeometry(W,.002,PD+.006),
      new THREE.MeshBasicMaterial({color:C.accent}))
    al.position.set(0,H/2-TH,.002);this.group.add(al)

    // Title text — центрируем
    const tt=new THREE.Mesh(
      new THREE.PlaneGeometry(W*.80,TH*.65),
      new THREE.MeshBasicMaterial({map:titleTex(title),transparent:true,depthWrite:false}))
    tt.position.set(0,H/2-TH/2,PD/2+.004);this.group.add(tt)

    // ── Close button (только если closeable) ─────────────────────────────────
    if(this.closeable){
      // Маленький квадратный красный крест в правом углу заголовка
      this.closeBtn=new THREE.Mesh(
        new THREE.BoxGeometry(.068,.050,.020),
        new THREE.MeshPhysicalMaterial({color:0x8b0000,roughness:.25,emissive:0x300000,emissiveIntensity:.4}))
      this.closeBtn.position.set(W/2-.042,H/2-TH/2,PD/2+.011)
      this.group.add(this.closeBtn)

      const xt=new THREE.Mesh(
        new THREE.PlaneGeometry(.056,.040),
        new THREE.MeshBasicMaterial({
          map:canvasTex((ctx,W,H)=>{
            ctx.fillStyle='rgba(255,200,200,.95)';ctx.font=`bold ${H*.75}px sans-serif`
            ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✕',W/2,H/2)
          },96,64),
          transparent:true,depthWrite:false}))
      xt.position.set(W/2-.042,H/2-TH/2,PD/2+.021);this.group.add(xt)
    }

    // ── Drag bar (снизу) ──────────────────────────────────────────────────────
    const db=new THREE.Mesh(
      new THREE.BoxGeometry(W,BRH,PD+.004),
      new THREE.MeshPhysicalMaterial({color:C.dragBg,roughness:.20,metalness:.08}))
    db.position.set(0,-H/2+BRH/2,.001);this.group.add(db)

    // Grip lines (три горизонтальных полосы вместо точек)
    for(let row=0;row<3;row++){
      const gl=new THREE.Mesh(
        new THREE.BoxGeometry(W*.35,.002,PD+.006),
        new THREE.MeshBasicMaterial({color:0x2a3f60,transparent:true,opacity:.7}))
      gl.position.set(0,-H/2+BRH/2+row*.018-.018,.001);this.group.add(gl)
    }

    // ── Glow & border ─────────────────────────────────────────────────────────
    this.glow=new THREE.Mesh(
      new THREE.BoxGeometry(W+.03,H+.03,PD+.03),
      new THREE.MeshBasicMaterial({color:C.accent,transparent:true,opacity:0,side:THREE.BackSide,depthWrite:false}))
    this.group.add(this.glow)

    this.border=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W+.005,H+.005,PD+.004)),
      new THREE.LineBasicMaterial({color:C.border,transparent:true,opacity:.65}))
    this.group.add(this.border)

    // Buttons
    this._buildButtons(content.buttons)
  }

  private _buildButtons(btns:WinButton[]):void{
    if(btns.length===0)return
    const{W,H}=this
    const sq=this._squareButtons

    if(sq){
      // Квадратные иконки в один ряд — для тасктбара
      const pad=.028
      const size=Math.min((W-pad*(btns.length+1))/btns.length, H-TH-BRH-pad*2)
      const totalW=size*btns.length+pad*(btns.length-1)
      const startX=-totalW/2
      const cy=(H/2-TH + (-H/2+BRH))/2  // центр между заголовком и drag bar

      btns.forEach((btn,i)=>{
        const cx=startX+i*(size+pad)+size/2
        const mesh=new THREE.Mesh(
          new THREE.BoxGeometry(size,size,BTN_D),
          new THREE.MeshPhysicalMaterial({
            map:iconTex(btn.label,btn.color??0x111827,false,false,0),
            transparent:true,opacity:.98,roughness:.08
          }))
        mesh.position.set(cx,cy,PD/2+BTN_D/2)
        this.group.add(mesh)
        this.btnEntries.push({mesh,btn,holdProgress:0,isSquare:true})
      })
    } else {
      // Прямоугольные кнопки сеткой
      const n=btns.length
      const cols=n<=2?n:n<=4?2:n<=6?3:3
      const rows=Math.ceil(n/cols)
      const pad=.038
      const btnW=(W-pad*(cols+1))/cols
      const availH=H-TH-BRH-pad*(rows+1)
      const btnH=Math.min(.170,availH/rows)
      const totalH=btnH*rows+pad*(rows-1)
      const startY=(H/2-TH+(-H/2+BRH))/2+totalH/2-btnH/2

      btns.forEach((btn,i)=>{
        const col=i%cols, row=Math.floor(i/cols)
        const x=-W/2+pad+col*(btnW+pad)+btnW/2
        const y=startY-row*(btnH+pad)
        const mesh=new THREE.Mesh(
          new THREE.BoxGeometry(btnW,btnH,BTN_D),
          new THREE.MeshPhysicalMaterial({
            map:btnTex(btn.label,btn.color??0x1e293b),
            transparent:true,opacity:.96,roughness:.10
          }))
        mesh.position.set(x,y,PD/2+BTN_D/2)
        this.group.add(mesh)
        this.btnEntries.push({mesh,btn,holdProgress:0,isSquare:false})
      })
    }
  }

  replaceButtons(btns:WinButton[]):void{
    for(const e of this.btnEntries){
      this.group.remove(e.mesh)
      e.mesh.geometry.dispose()
      ;(e.mesh.material as THREE.MeshPhysicalMaterial).map?.dispose()
      ;(e.mesh.material as THREE.MeshPhysicalMaterial).dispose()
    }
    this.btnEntries=[]
    this._buildButtons(btns)
  }

  // ── Hit tests ────────────────────────────────────────────────────────────
  hitButtonByFinger(fw:THREE.Vector3):BtnEntry|null{
    this.group.updateWorldMatrix(true,true)
    for(const e of this.btnEntries){
      e.mesh.updateWorldMatrix(true,false)
      const local=e.mesh.worldToLocal(fw.clone())
      const p=(e.mesh.geometry as THREE.BoxGeometry).parameters
      // Увеличенная зона по X/Y, глубокая по Z (глубина не точная)
      const mx=e.isSquare?.06:.07, my=e.isSquare?.06:.06, mz=.18
      if(Math.abs(local.x)<p.width/2+mx&&Math.abs(local.y)<p.height/2+my&&Math.abs(local.z)<p.depth/2+mz)
        return e
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
    return Math.abs(l.x)<.08&&Math.abs(l.y)<.07&&Math.abs(l.z)<.16
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
  getWorldPos():THREE.Vector3{const p=new THREE.Vector3();this.group.getWorldPosition(p);return p}

  updateButtonProgress(entry:BtnEntry,progress:number):void{
    entry.holdProgress=progress
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=entry.isSquare
      ?iconTex(entry.btn.label,entry.btn.color??0x111827,true,false,progress)
      :btnTex(entry.btn.label,entry.btn.color??0x1e293b,true,progress)
    m.map?.dispose();m.map=t;m.needsUpdate=true
  }

  resetButtonProgress(entry:BtnEntry):void{
    if(entry.holdProgress===0)return
    entry.holdProgress=0
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=entry.isSquare
      ?iconTex(entry.btn.label,entry.btn.color??0x111827,false,false,0)
      :btnTex(entry.btn.label,entry.btn.color??0x1e293b,false,0)
    m.map?.dispose();m.map=t;m.needsUpdate=true
  }

  setDragHighlight(on:boolean):void{
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity=on?.12:0
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(on?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=on?1:.65
  }

  setButtonHovered(entry:BtnEntry|null):void{
    for(const e of this.btnEntries){
      const hov=e===entry
      if(hov!==!!e.mesh.userData.wasHov){
        e.mesh.userData.wasHov=hov
        if(e.holdProgress>0)continue
        const m=e.mesh.material as THREE.MeshPhysicalMaterial
        const t=e.isSquare
          ?iconTex(e.btn.label,e.btn.color??0x111827,hov,false,0)
          :btnTex(e.btn.label,e.btn.color??0x1e293b,hov,0)
        m.map?.dispose();m.map=t;m.needsUpdate=true
        e.mesh.position.z+= hov? .004:-.004
        e.mesh.scale.z=hov?1.35:1
      }
    }
  }

  /** Обновить иконку квадратной кнопки с active-состоянием */
  setIconActive(entry:BtnEntry,active:boolean):void{
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=iconTex(entry.btn.label,entry.btn.color??0x111827,false,active,0)
    m.map?.dispose();m.map=t;m.needsUpdate=true
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
    ;(this.border.material as THREE.LineBasicMaterial).opacity=v?1:.65
  }

  updateRenderOrder(camera:THREE.PerspectiveCamera):void{
    const d=camera.position.distanceTo(this.getWorldPos())
    const order=Math.round(1000-d*100)
    this.group.traverse((obj:THREE.Object3D)=>{obj.renderOrder=order})
  }

  update(_t:number):void{}
  addTo(s:THREE.Scene):void{s.add(this.group)}
  removeFrom(s:THREE.Scene):void{s.remove(this.group)}
}

// ─── WindowManager ──────────────────────────────────────────────────────────
export class WindowManager{
  private wins:XRWindow[]=[]
  private scene:THREE.Scene;private camera:THREE.PerspectiveCamera
  private stereoCamera:THREE.PerspectiveCamera|null=null
  private drag:DragState|null=null
  private cdDrag=0
  private ray=new THREE.Raycaster();private plane=new THREE.Plane()

  // Hold state — без привязки к руке (hi убран из ключа)
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

  /** Проецирует NDC пальца на РЕАЛЬНУЮ мировую глубину окна */
  private fingerAtWinDepth(ndc:{ndcX:number;ndcY:number}, win:XRWindow):THREE.Vector3|null{
    return this.ndcToPlane(ndc.ndcX, ndc.ndcY, win.getWorldZ())
  }

  update(
    time:number,
    gestures:(GestureResult|null)[],
    fingerNDC:({ndcX:number;ndcY:number}|null)[],
    _fingerWorld:(THREE.Vector3|null)[]   // оставлен для совместимости
  ):void{
    this.cdDrag=Math.max(0,this.cdDrag-1)
    this.cdPress=Math.max(0,this.cdPress-1)
    for(const w of this.wins)w.updateRenderOrder(this.camera)

    // ── Drag (GRAB) ──────────────────────────────────────────────────────────
    for(let hi=0;hi<2;hi++){
      const g=gestures[hi];const ndc=fingerNDC[hi]
      if(!ndc)continue
      const grabbing=g&&g.type==='grab'&&g.grabStrength>.55

      if(!this.drag&&grabbing&&this.cdDrag===0){
        for(const win of[...this.wins].reverse()){
          const wp=this.fingerAtWinDepth(ndc,win);if(!wp)continue
          if(win.hitDragBar(wp)){
            const p=win.getWorldPos()
            this.drag={win,hi,planeZ:win.getWorldZ(),ox:p.x-wp.x,oy:p.y-wp.y}
            win.dragging=true;break
          }
        }
      }

      // Close via three_finger на кнопку закрыть
      if(g&&g.threeFingerStrength>.62&&this.cdDrag===0&&this.cdPress===0){
        const ndc2=fingerNDC[hi];if(ndc2){
          for(const win of[...this.wins].reverse()){
            const wp=this.fingerAtWinDepth(ndc2,win);if(!wp)continue
            if(win.hitCloseBtn(wp)){win.onClose?.();this.cdDrag=30;this.cdPress=30;break}
          }
        }
      }

      if(this.drag&&this.drag.hi===hi){
        if(g&&g.grabStrength>.30){
          const pt=this.ndcToPlane(ndc.ndcX,ndc.ndcY,this.drag.planeZ)
          if(pt)this.drag.win.group.position.lerp(
            new THREE.Vector3(pt.x+this.drag.ox,pt.y+this.drag.oy,this.drag.planeZ),.38)
        }else{this.drag.win.dragging=false;this.drag=null;this.cdDrag=12}
      }
    }

    // ── Button hold-to-press (THREE_FINGER) ──────────────────────────────────
    // Определяем лучшую руку для нажатия (с наибольшим threeFingerStrength)
    let bestG:GestureResult|null=null, bestNDC:{ndcX:number;ndcY:number}|null=null
    for(let hi=0;hi<2;hi++){
      const g=gestures[hi]
      if(g&&g.threeFingerStrength>(bestG?.threeFingerStrength??0)){
        bestG=g;bestNDC=fingerNDC[hi]
      }
    }

    const pressing=bestG&&bestG.threeFingerStrength>.52
    let anyHit=false

    if(pressing&&bestNDC&&this.cdPress===0){
      for(const win of this.wins){
        if(!win.group.visible||win.dragging)continue
        const wp=this.fingerAtWinDepth(bestNDC,win);if(!wp)continue
        const hitEntry=win.hitButtonByFinger(wp)
        if(hitEntry){
          anyHit=true
          if(this.holdState&&this.holdState.entry===hitEntry){
            // Продолжаем hold
            const elapsed=time-this.holdState.startTime
            const progress=Math.min(1,elapsed/HOLD_TIME)
            win.updateButtonProgress(hitEntry,progress)
            if(progress>=1){
              win.pressButton(hitEntry)
              this.holdState=null
              this.cdPress=25
            }
          } else {
            // Новый hold
            if(this.holdState)this.holdState.win.resetButtonProgress(this.holdState.entry)
            this.holdState={entry:hitEntry,win,startTime:time}
            win.updateButtonProgress(hitEntry,0.01)
          }
          break
        }
      }
    }

    // Если палец убрали — сбрасываем таймер
    if(!pressing||!anyHit){
      if(this.holdState){
        this.holdState.win.resetButtonProgress(this.holdState.entry)
        this.holdState=null
      }
    }

    // ── Hover ────────────────────────────────────────────────────────────────
    for(const win of this.wins){
      if(!win.group.visible)continue
      let hovEntry:BtnEntry|null=null, dragHov=false
      for(let hi=0;hi<2;hi++){
        const ndc=fingerNDC[hi];if(!ndc)continue
        const wp=this.fingerAtWinDepth(ndc,win);if(!wp)continue
        if(win.hitDragBar(wp))dragHov=true
        const h=win.hitButtonByRay(wp);if(h&&!hovEntry)hovEntry=h
      }
      win.setDragHighlight(dragHov)
      win.setButtonHovered(hovEntry)
    }
  }

  hideAll(except?:XRWindow[]):void{
    for(const w of this.wins){
      if(except&&except.includes(w))continue
      w.group.visible=false
    }
  }
  showAll():void{for(const w of this.wins)w.group.visible=true}
  getWindows():XRWindow[]{return this.wins}
}