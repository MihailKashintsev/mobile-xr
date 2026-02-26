/**
 * TaskBar3D v5
 *
 * ФИКСЫ:
 * - update() принимает (time, camera, fingerWorld, pinchActive) — синхронизировано с main.ts
 * - Drag: щипок по фоновой панели тащит тасктбар
 * - Кнопки: hitTest → onClick работает
 * - depthTest:false на фоне → рука (renderOrder:999) рисуется поверх
 * - Дизайн: glassmorphism стиль
 */
import * as THREE from 'three'

export interface TaskBarButton {
  icon:    string
  label:   string
  onClick: () => void
  active?: boolean
}

function makeIconTex(icon:string,label:string,active:boolean,hov:boolean):THREE.CanvasTexture{
  const W=180,H=140
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H
  const c=cv.getContext('2d')!

  // BG gradient
  const bg=c.createLinearGradient(0,0,0,H)
  if(active){ bg.addColorStop(0,'#1e1b4b'); bg.addColorStop(1,'#312e81') }
  else if(hov){ bg.addColorStop(0,'#1a2744'); bg.addColorStop(1,'#111827') }
  else{ bg.addColorStop(0,'#0f172a'); bg.addColorStop(1,'#0a0f1e') }
  c.fillStyle=bg; c.beginPath(); c.roundRect(3,3,W-6,H-6,14); c.fill()

  // Shimmer
  if(active||hov){
    const sh=c.createLinearGradient(0,0,0,H*0.55)
    sh.addColorStop(0,'rgba(255,255,255,.18)'); sh.addColorStop(1,'rgba(255,255,255,0)')
    c.fillStyle=sh; c.beginPath(); c.roundRect(3,3,W-6,H*0.48,14); c.fill()
  }

  // Border
  c.strokeStyle=active?'rgba(129,140,248,.9)':hov?'rgba(99,102,241,.4)':'rgba(55,65,90,.5)'
  c.lineWidth=active?2:1; c.beginPath(); c.roundRect(3,3,W-6,H-6,14); c.stroke()

  // Icon
  c.font=`${Math.round(H*0.44)}px serif`
  c.textAlign='center'; c.textBaseline='middle'; c.fillText(icon,W/2,H*0.41)

  // Label
  c.fillStyle=active?'#a5b4fc':hov?'#c7d2fe':'rgba(148,163,184,.85)'
  c.font=`500 ${Math.round(H*0.175)}px -apple-system,sans-serif`
  c.textAlign='center'; c.textBaseline='top'; c.fillText(label,W/2,H*0.73,W-14)

  const t=new THREE.CanvasTexture(cv); t.needsUpdate=true; return t
}

export class TaskBar3D{
  group:THREE.Group
  private btns:TaskBarButton[]=[]
  private btnGs:THREE.Group[]=[]
  private hovBtn:TaskBarButton|null=null

  // Drag state
  private _drag=false
  private _dragOffset=new THREE.Vector3()
  private _prevPinch=false

  // Smooth follow
  private _targetPos=new THREE.Vector3()
  private _initialized=false
  private _freePos=false  // true после drag — не возвращаемся к камере

  constructor(){ this.group=new THREE.Group(); this.group.renderOrder=1 }

  setButtons(btns:TaskBarButton[]):void{ this.btns=btns; this._rebuild() }

  private _rebuild():void{
    this.group.clear(); this.btnGs=[]
    const n=this.btns.length, BW=0.118,BH=0.118,BD=0.022,GAP=0.010
    const TW=n*BW+(n-1)*GAP

    // Panel — depthTest:false = рука рисуется поверх благодаря renderOrder:999
    const panel=new THREE.Mesh(
      new THREE.BoxGeometry(TW+0.055,BH+0.055,BD*0.35),
      new THREE.MeshPhysicalMaterial({
        color:0x050c1a, transparent:true, opacity:0.88,
        roughness:0.05, metalness:0.35,
        depthTest:false, // ← ключевое
      })
    )
    panel.renderOrder=1; this.group.add(panel)

    // Glow border
    const border=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(TW+0.060,BH+0.060,BD*0.36)),
      new THREE.LineBasicMaterial({color:0x4f46e5,transparent:true,opacity:0.35,depthTest:false})
    )
    border.renderOrder=1; this.group.add(border)

    // Top accent strip
    const accent=new THREE.Mesh(
      new THREE.BoxGeometry(TW+0.055,0.004,BD*0.35),
      new THREE.MeshBasicMaterial({color:0x6366f1,depthTest:false})
    )
    accent.position.y=(BH+0.055)/2; accent.renderOrder=1; this.group.add(accent)

    for(let i=0;i<n;i++){
      const btn=this.btns[i]
      const bg=new THREE.Group(); bg.renderOrder=1
      bg.position.x=-TW/2+i*(BW+GAP)+BW/2

      const isHov=this.hovBtn===btn
      const face=new THREE.Mesh(
        new THREE.BoxGeometry(BW,BH,BD),
        new THREE.MeshPhysicalMaterial({
          color:btn.active?0x1e1b4b:isHov?0x1a2744:0x0f172a,
          transparent:true,opacity:0.95,
          roughness:0.1,metalness:0.05,
          emissive:new THREE.Color(btn.active?0x3730a3:isHov?0x1e3a6e:0),
          emissiveIntensity:btn.active?0.55:isHov?0.25:0,
          depthTest:false,
        })
      )
      face.renderOrder=1; bg.add(face)

      const plane=new THREE.Mesh(
        new THREE.PlaneGeometry(BW*0.90,BH*0.90),
        new THREE.MeshBasicMaterial({
          map:makeIconTex(btn.icon,btn.label,btn.active??false,isHov),
          transparent:true,depthWrite:false,depthTest:false
        })
      )
      plane.position.z=BD/2+0.003; plane.renderOrder=1; bg.add(plane)

      bg.userData={btn}
      this.btnGs.push(bg); this.group.add(bg)
    }
  }

  /** Hit-test кнопки через fingerWorld */
  hitTest(fw:THREE.Vector3):TaskBarButton|null{
    for(const bg of this.btnGs){
      bg.updateWorldMatrix(true,false)
      const l=bg.worldToLocal(fw.clone())
      if(Math.abs(l.x)<0.09&&Math.abs(l.y)<0.09&&Math.abs(l.z)<0.16)
        return bg.userData.btn as TaskBarButton
    }
    return null
  }

  /** Hit-test панели для drag */
  private _hitPanel(fw:THREE.Vector3):boolean{
    this.group.updateWorldMatrix(true,false)
    const l=this.group.worldToLocal(fw.clone())
    const n=this.btns.length, TW=n*0.118+(n-1)*0.010
    return Math.abs(l.x)<TW/2+0.04&&Math.abs(l.y)<0.09&&Math.abs(l.z)<0.16
  }

  setHovered(btn:TaskBarButton|null):void{
    if(btn===this.hovBtn)return; this.hovBtn=btn; this._rebuild()
  }

  setActive(icon:string,active:boolean):void{
    const b=this.btns.find(b=>b.icon===icon)
    if(b&&b.active!==active){b.active=active;this._rebuild()}
  }

  pressAnimation(btn:TaskBarButton):void{
    const bg=this.btnGs.find(g=>g.userData.btn===btn); if(!bg)return
    const oz=bg.position.z; bg.position.z-=0.015
    setTimeout(()=>{bg.position.z=oz},130)
  }

  /**
   * @param time      performance time
   * @param camera    main camera
   * @param fw        fingerWorld (кончик указательного) или null
   * @param pinching  true если щипок активен
   */
  update(time:number, camera:THREE.PerspectiveCamera, fw:THREE.Vector3|null, pinching:boolean):void{
    // Первый кадр — позиционируем перед камерой
    if(!this._initialized){
      const off=new THREE.Vector3(0,-0.33,-0.67)
      off.applyQuaternion(camera.quaternion)
      this.group.position.copy(camera.position).add(off)
      this.group.quaternion.copy(camera.quaternion)
      this._initialized=true
    }

    // Drag логика
    if(fw){
      const onPanel=this._hitPanel(fw)
      const pinchStart = pinching && !this._prevPinch
      const pinchEnd   = !pinching && this._prevPinch

      if(!this._drag && pinchStart && onPanel){
        // Начало drag — запоминаем смещение
        this._drag=true
        this._freePos=true
        const gp=new THREE.Vector3(); this.group.getWorldPosition(gp)
        this._dragOffset.subVectors(gp,fw)
      }
      if(this._drag && pinching){
        // Тащим
        const target=new THREE.Vector3().addVectors(fw,this._dragOffset)
        this.group.position.lerp(target,0.45)
        this.group.quaternion.slerp(camera.quaternion,0.12)
      }
      if(this._drag && pinchEnd){
        this._drag=false
      }
    }else{
      if(!pinching) this._drag=false
    }
    this._prevPinch=pinching

    // Если не в drag и не в свободном положении — следим за камерой
    if(!this._drag && !this._freePos){
      const off=new THREE.Vector3(0,-0.33,-0.67)
      off.applyQuaternion(camera.quaternion)
      const target=new THREE.Vector3().copy(camera.position).add(off)
      this.group.position.lerp(target,0.08)
      this.group.quaternion.slerp(camera.quaternion,0.10)
    }else if(!this._drag && this._freePos){
      // После drag — только поворот камеры, позиция свободна
      this.group.quaternion.slerp(camera.quaternion,0.08)
    }

    // Accent пульсация
    const ac=this.group.children[2] as THREE.Mesh
    if(ac?.material)(ac.material as THREE.MeshBasicMaterial).opacity=0.55+Math.sin(time*1.5)*0.45
  }

  addToScene(s:THREE.Scene):void{s.add(this.group)}
}
