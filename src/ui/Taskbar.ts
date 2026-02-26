import * as THREE from 'three'

export interface TApp { id:string; icon:string; label:string; color:number; onClick:()=>void }

function btnTex(icon:string,label:string,color:number,hov=false): THREE.CanvasTexture {
  const W=160,H=140,c=document.createElement('canvas'); c.width=W; c.height=H
  const ctx=c.getContext('2d')!
  const bg=hov?lighten(color,35):color
  ctx.fillStyle=`#${bg.toString(16).padStart(6,'0')}cc`
  ctx.beginPath(); ctx.roundRect(3,3,W-6,H-6,16); ctx.fill()
  if (hov) {
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgba(255,255,255,.18)'); g.addColorStop(0.5,'rgba(255,255,255,0)')
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect(3,3,W-6,H-6,16); ctx.fill()
  }
  ctx.font='48px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(icon,W/2,H*0.40)
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font=`bold 18px -apple-system,sans-serif`
  ctx.textBaseline='bottom'; ctx.fillText(label,W/2,H-8,W-12)
  const t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t
}

function lighten(c:number,a:number): number {
  return (Math.min(255,((c>>16)&255)+a)<<16)|(Math.min(255,((c>>8)&255)+a)<<8)|(Math.min(255,(c&255)+a))
}

export class Taskbar {
  group: THREE.Group
  private btns:{mesh:THREE.Mesh;app:TApp;hov:boolean}[]=[]

  constructor(apps:TApp[]) {
    this.group=new THREE.Group()
    this.group.position.set(0,-0.95,-2.4)
    this.build(apps)
  }

  private build(apps:TApp[]): void {
    const BW=0.200,BH=0.165,GAP=0.022,D=0.016
    const total=apps.length*(BW+GAP)-GAP
    const bH=BH+0.038,bD=D
    // Background
    this.group.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(total+0.055,bH+0.032,bD),
      new THREE.MeshPhysicalMaterial({color:0x080c18,transparent:true,opacity:0.93,roughness:0.08,metalness:0.2,depthWrite:true}))))
    // Accent top line
    const al=new THREE.Mesh(new THREE.BoxGeometry(total+0.055,0.003,bD+0.002),
      new THREE.MeshBasicMaterial({color:0x6366f1}))
    al.position.set(0,bH/2+0.018,0.001); this.group.add(al)
    // Border
    this.group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(total+0.057,bH+0.034,bD+0.002)),
      new THREE.LineBasicMaterial({color:0x2a3a52,transparent:true,opacity:0.65})))

    apps.forEach((app,i)=>{
      const x=-total/2+i*(BW+GAP)+BW/2
      const tex=btnTex(app.icon,app.label,app.color)
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(BW,BH,D),
        new THREE.MeshPhysicalMaterial({map:tex,transparent:true,opacity:0.95,roughness:0.12,depthWrite:true}))
      mesh.position.set(x,0,bD/2+D/2)
      this.group.add(mesh)
      this.btns.push({mesh,app,hov:false})
    })
  }

  getWorldZ(): number { return this.group.position.z }

  hitButton(worldPt:THREE.Vector3): TApp|null {
    this.group.updateWorldMatrix(true,false)
    for (const b of this.btns) {
      b.mesh.updateWorldMatrix(true,false)
      const l=b.mesh.worldToLocal(worldPt.clone())
      const p=(b.mesh.geometry as THREE.BoxGeometry).parameters
      if (Math.abs(l.x)<p.width/2+0.03&&Math.abs(l.y)<p.height/2+0.03&&Math.abs(l.z)<0.10) return b.app
    }
    return null
  }

  isFingerInFront(p:THREE.Vector3): boolean { return p.z>this.getWorldZ() }

  setHovered(app:TApp|null): void {
    for (const b of this.btns) {
      const isH=b.app===app
      if (isH!==b.hov) {
        b.hov=isH
        const t=btnTex(b.app.icon,b.app.label,b.app.color,isH)
        const m=b.mesh.material as THREE.MeshPhysicalMaterial
        m.map?.dispose(); m.map=t; m.needsUpdate=true
        b.mesh.scale.z=isH?1.5:1; b.mesh.position.z+=isH?0.004:-0.004
      }
    }
  }

  pressButton(app:TApp): void {
    for (const b of this.btns) {
      if (b.app!==app) continue
      b.mesh.position.z-=0.008; b.mesh.scale.z=0.7
      setTimeout(()=>{b.mesh.position.z+=0.008;b.mesh.scale.z=1},150)
      app.onClick()
    }
  }

  addTo(scene:THREE.Scene): void { scene.add(this.group) }

  followCamera(cam:THREE.PerspectiveCamera): void {
    const dir=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion)
    const target=cam.position.clone().add(dir.multiplyScalar(2.4)).add(new THREE.Vector3(0,-0.85,0))
    this.group.position.lerp(target,0.04)
    this.group.quaternion.slerp(cam.quaternion,0.04)
  }
}
