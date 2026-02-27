/**
 * WindowManager + XRWindow v7
 *
 * НОВЫЕ ФИЧИ:
 * 1. PINCH-HOLD активация: щипок удерживается 2 сек → круглый прогресс → нажатие
 *    — Анимация: радиальное кольцо на кнопке заполняется за 2 сек
 *    — Если отпустить раньше — сброс
 * 2. WORLD-SPACE окна: position фиксируется при создании в мировых координатах
 *    — Окна НЕ следуют за камерой (голова поворачивается — окна остаются)
 *    — Drag по-прежнему работает (перетащить можно)
 * 3. DEPTH ORDERING: renderOrder по дальности от камеры
 *    — Ближние окна рисуются поверх дальних
 *    — depthTest:true (корректная Z-сортировка между объектами)
 */
import * as THREE from 'three'
import type { GestureResult } from '../xr/GestureDetector'

export interface WinButton { label: string; color?: number; onClick?: () => void }
export interface WinContent { buttons: WinButton[] }
export interface WinOptions {
  title: string; width?: number; height?: number
  position?: THREE.Vector3; content?: WinContent; closeable?: boolean
}

// ─── Canvas helpers ────────────────────────────────────────────────────────
function canvasTex(fn:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void,w=512,h=128):THREE.CanvasTexture{
  const c=document.createElement('canvas');c.width=w;c.height=h
  fn(c.getContext('2d')!,w,h);const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t
}
function lighten(c:number,a:number):number{
  return(Math.min(255,((c>>16)&255)+a)<<16)|(Math.min(255,((c>>8)&255)+a)<<8)|(Math.min(255,(c&255)+a))
}

/** Рисует кнопку с опциональным прогресс-кольцом (0..1) */
function btnTex(label:string,color:number,hov=false,progress=0):THREE.CanvasTexture{
  return canvasTex((ctx,W,H)=>{
    const bg=hov?lighten(color,45):color
    ctx.fillStyle=`#${bg.toString(16).padStart(6,'0')}`
    ctx.beginPath();ctx.roundRect(4,4,W-8,H-8,22);ctx.fill()
    if(hov){
      const g=ctx.createLinearGradient(0,0,0,H*.55)
      g.addColorStop(0,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)')
      ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(4,4,W-8,H*.5,22);ctx.fill()
    }
    ctx.fillStyle='rgba(255,255,255,.94)'
    ctx.font=`600 ${Math.round(H*.38)}px -apple-system,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,W/2,H*.44,W-28)

    // Radial progress ring
    if(progress>0){
      const cx=W/2,cy=H/2,r=Math.min(W,H)*0.44
      // Track
      ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=6
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke()
      // Fill
      const startAngle=-Math.PI/2
      const endAngle=startAngle+Math.PI*2*progress
      ctx.strokeStyle='rgba(99,210,255,0.95)';ctx.lineWidth=6
      ctx.lineCap='round'
      ctx.beginPath();ctx.arc(cx,cy,r,startAngle,endAngle);ctx.stroke()
      // Time left text
      const secsLeft=((1-progress)*2).toFixed(1)
      ctx.fillStyle='rgba(180,230,255,.90)'
      ctx.font=`500 ${Math.round(H*.24)}px -apple-system,sans-serif`
      ctx.fillText(secsLeft+'с',cx,H*.80)
    }
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

/** Время удержания щипка для активации (секунды) */
const HOLD_TIME = 2.0

interface BtnEntry{mesh:THREE.Mesh;btn:WinButton;holdProgress:number}
interface DragState{win:XRWindow;hi:number;planeZ:number;ox:number;oy:number}

// ─── XRWindow ──────────────────────────────────────────────────────────────
export class XRWindow {
  group:THREE.Group
  onClose?:()=>void
  readonly closeable:boolean
  private W:number;private H:number
  private glow!:THREE.Mesh;private border!:THREE.LineSegments
  private closeBtn?:THREE.Mesh
  btnEntries:BtnEntry[]=[]
  private _dragging=false
  // World-space: НЕ следует за камерой
  private _worldFixed=true

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
    const panel=new THREE.Mesh(new THREE.BoxGeometry(W,H,PD),
      new THREE.MeshPhysicalMaterial({color:C.bg,transparent:true,opacity:.92,roughness:.08,metalness:.15}))
    this.group.add(panel)
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
    // Build buttons
    this._buildButtons(content.buttons)
  }

  private _buildButtons(btns:WinButton[]):void{
    const{W,H}=this
    const cols=btns.length<=1?1:btns.length<=4?btns.length:Math.ceil(btns.length/2)
    const pad=.042,btnW=btns.length<=4?(W-pad*2-pad*(btns.length-1))/btns.length:(W-pad*3)/2
    const top=H/2-TH-pad,bot=-H/2+BRH+pad
    const rows=Math.ceil(btns.length/cols),gap=.028
    const btnH=Math.min(.185,(top-bot-gap*(rows-1))/rows)
    btns.forEach((btn,i)=>{
      const col=i%cols,row=Math.floor(i/cols)
      let x:number
      if(cols===1)x=0
      else if(btns.length<=4)x=-W/2+pad+col*(btnW+pad)+btnW/2
      else x=col===0?-(btnW/2+pad/2):(btnW/2+pad/2)
      const y=top-row*(btnH+gap)-btnH/2
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(btnW,btnH,BTN_D),
        new THREE.MeshPhysicalMaterial({map:btnTex(btn.label,btn.color??0x6366f1),transparent:true,opacity:.95,roughness:.12}))
      mesh.position.set(x,y,PD/2+BTN_D/2);this.group.add(mesh)
      this.btnEntries.push({mesh,btn,holdProgress:0})
    })
  }

  // ── replaceButtons ────────────────────────────────────────────────────────
  replaceButtons(btns:WinButton[]):void{
    for(const e of this.btnEntries){
      this.group.remove(e.mesh)
      e.mesh.geometry.dispose()
      ;(e.mesh.material as THREE.MeshPhysicalMaterial).dispose()
    }
    this.btnEntries=[]
    this._buildButtons(btns)
  }

  // ── Hit tests ─────────────────────────────────────────────────────────────
  hitButtonByFinger(fingerWorld:THREE.Vector3):BtnEntry|null{
    this.group.updateWorldMatrix(true,true)
    for(const e of this.btnEntries){
      e.mesh.updateWorldMatrix(true,false)
      const local=e.mesh.worldToLocal(fingerWorld.clone())
      const p=(e.mesh.geometry as THREE.BoxGeometry).parameters
      if(Math.abs(local.x)<p.width/2+.08&&Math.abs(local.y)<p.height/2+.08&&Math.abs(local.z)<p.depth/2+.15)
        return e
    }
    return null
  }

  hitDragBar(wp:THREE.Vector3):boolean{
    this.group.updateWorldMatrix(true,false)
    const l=this.group.worldToLocal(wp.clone())
    return Math.abs(l.x)<this.W/2+.10&&l.y>-this.H/2-.08&&l.y<-this.H/2+BRH+.08&&Math.abs(l.z)<.25
  }

  hitCloseBtn(wp:THREE.Vector3):boolean{
    if(!this.closeable||!this.closeBtn)return false
    this.closeBtn.updateWorldMatrix(true,false)
    const l=this.closeBtn.worldToLocal(wp.clone())
    return Math.abs(l.x)<.08&&Math.abs(l.y)<.07&&Math.abs(l.z)<.18
  }

  hitButtonByRay(wp:THREE.Vector3):BtnEntry|null{
    this.group.updateWorldMatrix(true,false)
    for(const e of this.btnEntries){
      e.mesh.updateWorldMatrix(true,false)
      const l=e.mesh.worldToLocal(wp.clone())
      const p=(e.mesh.geometry as THREE.BoxGeometry).parameters
      if(Math.abs(l.x)<p.width/2+.05&&Math.abs(l.y)<p.height/2+.05&&Math.abs(l.z)<.18)return e
    }
    return null
  }

  getWorldZ():number{const p=new THREE.Vector3();this.group.getWorldPosition(p);return p.z}

  /** Обновить прогресс-кольцо на кнопке */
  updateButtonProgress(entry:BtnEntry, progress:number):void{
    entry.holdProgress=progress
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=btnTex(entry.btn.label,entry.btn.color??0x6366f1,true,progress)
    m.map?.dispose();m.map=t;m.needsUpdate=true
  }

  resetButtonProgress(entry:BtnEntry):void{
    if(entry.holdProgress===0)return
    entry.holdProgress=0
    const m=entry.mesh.material as THREE.MeshPhysicalMaterial
    const t=btnTex(entry.btn.label,entry.btn.color??0x6366f1,false,0)
    m.map?.dispose();m.map=t;m.needsUpdate=true
  }

  setDragHighlight(on:boolean):void{
    ;(this.glow.material as THREE.MeshBasicMaterial).opacity=on?.14:0
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(on?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=on?1:.7
  }

  setButtonHovered(entry:BtnEntry|null):void{
    for(const e of this.btnEntries){
      const hov=e===entry
      if(hov!==!!e.mesh.userData.wasHov){
        e.mesh.userData.wasHov=hov
        if(e.holdProgress>0)return // Don't reset ring texture during hold
        const m=e.mesh.material as THREE.MeshPhysicalMaterial
        const t=btnTex(e.btn.label,e.btn.color??0x6366f1,hov,0)
        m.map?.dispose();m.map=t;m.needsUpdate=true
        e.mesh.scale.z=hov?1.4:1
      }
    }
  }

  pressButton(entry:BtnEntry):void{
    entry.mesh.position.z-=.010;entry.mesh.scale.z=.7
    setTimeout(()=>{entry.mesh.position.z+=.010;entry.mesh.scale.z=1;this.resetButtonProgress(entry)},150)
    entry.btn.onClick?.()
  }

  get dragging(){return this._dragging}
  set dragging(v:boolean){
    this._dragging=v
    ;(this.border.material as THREE.LineBasicMaterial).color.setHex(v?C.accent:C.border)
    ;(this.border.material as THREE.LineBasicMaterial).opacity=v?1:.7
  }

  /** Обновление z-порядка по дистанции от камеры */
  updateRenderOrder(camera:THREE.PerspectiveCamera):void{
    const camPos=camera.position
    const winPos=new THREE.Vector3();this.group.getWorldPosition(winPos)
    const dist=camPos.distanceTo(winPos)
    // Ближние = высокий renderOrder → рисуются поверх
    const order=Math.round(1000-dist*100)
    this.group.traverse((obj:THREE.Object3D)=>{obj.renderOrder=order})
  }

  // Плавающая анимация убрана — окна в world space, не дёргаем
  update(_t:number):void{}

  addTo(s:THREE.Scene):void{s.add(this.group)}
  removeFrom(s:THREE.Scene):void{s.remove(this.group)}
}

// ─── WindowManager ─────────────────────────────────────────────────────────
export class WindowManager{
  private wins:XRWindow[]=[]
  private scene:THREE.Scene;private camera:THREE.PerspectiveCamera
  private stereoCamera:THREE.PerspectiveCamera|null=null
  private drag:DragState|null=null
  private cdDrag=0
  private ray=new THREE.Raycaster();private plane=new THREE.Plane()

  // Hold state per button (across all windows)
  private holdState:{entry:BtnEntry;win:XRWindow;hi:number;startTime:number}|null=null

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

  update(
    time:number,
    gestures:(GestureResult|null)[],
    fingerNDC:({ndcX:number;ndcY:number}|null)[],
    fingerWorld:(THREE.Vector3|null)[]
  ):void{
    this.cdDrag=Math.max(0,this.cdDrag-1)
    // Update render order (depth sorting)
    for(const w of this.wins)w.updateRenderOrder(this.camera)

    // ── Drag ──────────────────────────────────────────────────────────────
    for(let hi=0;hi<2;hi++){
      const g=gestures[hi];const ndc=fingerNDC[hi]
      if(!ndc)continue
      const pinching=g&&g.type==='grab'&&g.grabStrength>.55  // GRAB = тащить

      // GRAB = тащить drag bar
      if(!this.drag&&pinching&&this.cdDrag===0){
        for(const win of[...this.wins].reverse()){
          const pz=win.getWorldZ()
          const wp=this.ndcToPlane(ndc.ndcX,ndc.ndcY,pz);if(!wp)continue
          if(win.hitDragBar(wp)){
            const p=new THREE.Vector3();win.group.getWorldPosition(p)
            this.drag={win,hi,planeZ:pz,ox:p.x-wp.x,oy:p.y-wp.y}
            win.dragging=true;break
          }
        }
      }
      // THREE_FINGER на close btn = закрыть окно
      if(g&&g.threeFingerStrength>.60&&this.cdDrag===0){
        const fW=fingerWorld[hi];if(fW){
          for(const win of[...this.wins].reverse()){
            if(win.hitCloseBtn(fW)){win.onClose?.();this.cdDrag=25;break}
          }
        }
      }

      if(this.drag&&this.drag.hi===hi){
        if(g&&g.pinchStrength>.32){
          const pt=this.ndcToPlane(ndc.ndcX,ndc.ndcY,this.drag.planeZ)
          if(pt)this.drag.win.group.position.lerp(
            new THREE.Vector3(pt.x+this.drag.ox,pt.y+this.drag.oy,this.drag.planeZ),.35)
        }else if(!g||g.grabStrength<.35){this.drag.win.dragging=false;this.drag=null;this.cdDrag=15}
      }
    }

    // ── Button hold-to-press ───────────────────────────────────────────────
    for(const win of this.wins){
      if(win.dragging)continue
      let hovEntry:BtnEntry|null=null
      let dragHov=false

      for(let hi=0;hi<2;hi++){
        const g=gestures[hi];const ndc=fingerNDC[hi];const fW=fingerWorld[hi]
        if(!ndc||!fW)continue

        const wp=this.ndcToPlane(ndc.ndcX,ndc.ndcY,win.getWorldZ())
        if(wp&&win.hitDragBar(wp))dragHov=true

        // Hover via ray
        const hEntry=wp?win.hitButtonByRay(wp):null  // wp already uses win depth
        if(hEntry&&!hovEntry)hovEntry=hEntry

        // ── HOLD-TO-PRESS ──
        const touching=g&&g.threeFingerStrength>.55  // THREE_FINGER = нажать (hold)
        // Project finger to window's actual depth for accurate hit test
        const winZ=win.getWorldZ()
        const fWAtDepth = ndc ? this.ndcToPlane(ndc.ndcX,ndc.ndcY,winZ) : fW
        const hitEntry=fWAtDepth?win.hitButtonByFinger(fWAtDepth):null

        if(touching&&hitEntry){
          if(this.holdState&&this.holdState.entry===hitEntry){
            // Continue hold
            const elapsed=time-this.holdState.startTime
            const progress=Math.min(1,elapsed/HOLD_TIME)
            win.updateButtonProgress(hitEntry,progress)
            if(progress>=1){
              // FIRE!
              win.pressButton(hitEntry)
              this.holdState=null
              this.cdDrag=20
            }
          } else {
            // New hold — cancel previous
            if(this.holdState){
              this.holdState.win.resetButtonProgress(this.holdState.entry)
            }
            this.holdState={entry:hitEntry,win,hi,startTime:time}
            win.updateButtonProgress(hitEntry,0.01)
          }
        } else if(this.holdState&&this.holdState.hi===hi){
          // Released — cancel hold
          this.holdState.win.resetButtonProgress(this.holdState.entry)
          this.holdState=null
        }
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
