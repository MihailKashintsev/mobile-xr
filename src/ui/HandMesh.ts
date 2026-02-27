/**
 * HandMesh v6
 * ГЛАВНЫЙ ФИX: TypeError в updateWebBuf
 * Причина: wld может быть screenLandmarks (lm!) вместо worldLandmarks,
 * тогда wld[i].x/y/z валидны но MCP индексы 5,9,13,17 дают неожиданные 3D позиции
 * → addVectors получает undefined если pts построены некорректно.
 *
 * РЕШЕНИЕ: Полностью убрать webMesh (перемычки) — они дают крэш и визуально незначимы.
 * Оставить: суставы, цилиндры пальцев, ногти, glow.
 *
 * renderOrder: группа использует depthTest:false чтобы рисоваться поверх всего.
 */
import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'
import type { Landmark }    from '../xr/HandTracker'

const FINGER_R=[
  [0.013,0.011,0.009,0.008],
  [0.011,0.009,0.008,0.007],
  [0.012,0.010,0.009,0.008],
  [0.011,0.009,0.008,0.007],
  [0.009,0.008,0.007,0.006],
]
const UP=new THREE.Vector3(0,1,0)
const _q=new THREE.Quaternion()
const _m=new THREE.Matrix4()

function skinMat():THREE.MeshPhysicalMaterial{
  return new THREE.MeshPhysicalMaterial({
    color:0xf0b07a,
    roughness:0.72, metalness:0,
    emissive:new THREE.Color(0x3a0a00), emissiveIntensity:0.10,
    side:THREE.DoubleSide,
    // КЛЮЧЕВОЕ: depthTest:false → рисуется поверх любых других объектов
    depthTest:false, depthWrite:false, transparent:true, opacity:0.95,
  })
}

function placeCylinder(m:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3):void{
  const dir=new THREE.Vector3().subVectors(b,a)
  const len=dir.length()
  if(len<0.001){m.visible=false;return}
  m.visible=true
  _q.setFromUnitVectors(UP,dir.normalize())
  _m.compose(new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5),_q,new THREE.Vector3(1,len,1))
  m.matrix.copy(_m); m.matrixAutoUpdate=false
}

export class HandMesh{
  group:THREE.Group
  private caps:THREE.Mesh[][]=[]
  private joints:THREE.Mesh[]=[]
  private nails:THREE.Mesh[]=[]
  private glow:THREE.Mesh

  constructor(){
    this.group=new THREE.Group()
    this.group.renderOrder=999

    // Цилиндры пальцев
    for(let fi=0;fi<5;fi++){
      const r=FINGER_R[fi]; const segs:THREE.Mesh[]=[]
      for(let si=0;si<3;si++){
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r[si+1],r[si],1,10,1,false),skinMat())
        m.renderOrder=999; segs.push(m); this.group.add(m)
      }
      this.caps.push(segs)
    }

    // Суставные сферы
    const jR=[0.022,0.014,0.012,0.010,0.009,0.013,0.011,0.009,0.008,0.014,0.012,0.010,0.009,0.012,0.010,0.009,0.008,0.010,0.009,0.008,0.007]
    for(let i=0;i<21;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(jR[i]??0.008,8,6),skinMat())
      m.renderOrder=999; this.joints.push(m); this.group.add(m)
    }

    // Ногти
    for(let i=0;i<5;i++){
      const m=new THREE.Mesh(
        new THREE.BoxGeometry(0.011,0.006,0.014),
        new THREE.MeshPhysicalMaterial({color:0xffe4d0,roughness:0.3,depthTest:false,depthWrite:false,transparent:true,opacity:0.9}))
      m.renderOrder=999; this.nails.push(m); this.group.add(m)
    }

    // Glow
    this.glow=new THREE.Mesh(
      new THREE.SphereGeometry(0.022,10,8),
      new THREE.MeshBasicMaterial({color:0xffcc44,transparent:true,opacity:0,depthWrite:false,depthTest:false}))
    this.glow.renderOrder=999; this.group.add(this.glow)
  }

  updateFromLandmarks(
    lm:Landmark[], wld:Landmark[], wristWorld:THREE.Vector3,
    isFront:boolean, gesture:GestureType, pinchStrength:number, time:number
  ):void{
    // Строгая проверка
    if(!lm||lm.length<21){this.group.visible=false;return}
    this.group.visible=true

    // Используем ТОЛЬКО screenLandmarks (lm) для 2D→3D проекции через wristWorld
    // wld может быть некорректным — не используем для построения pts
    const w0=lm[0]
    if(!w0){this.group.visible=false;return}
    const sx=isFront?1:-1

    // Строим pts из screen landmarks + wristWorld как anchor
    // Используем простую проекцию: относительные смещения от запястья
    const pts:THREE.Vector3[]=[]
    for(let i=0;i<21;i++){
      const w=lm[i]
      if(!w){this.group.visible=false;return} // если хоть один undefined — прячем
      // Конвертируем NDC в world через камеру с фиксированной глубиной = wristWorld.z
      pts.push(new THREE.Vector3(
        wristWorld.x+(w.x-w0.x)*sx*0.18,
        wristWorld.y-(w.y-w0.y)*0.18,
        wristWorld.z-(w.z-w0.z)*0.4
      ))
    }

    // Суставы
    for(let i=0;i<21;i++) this.joints[i].position.copy(pts[i])

    // Цилиндры
    const fs=[1,5,9,13,17]
    for(let fi=0;fi<5;fi++){
      const j=fi===0?[1,2,3,4]:[fs[fi],fs[fi]+1,fs[fi]+2,fs[fi]+3]
      for(let si=0;si<3;si++) placeCylinder(this.caps[fi][si],pts[j[si]],pts[j[si+1]])
    }

    // Ногти
    const tipI=[4,8,12,16,20],dipI=[3,7,11,15,19]
    for(let fi=0;fi<5;fi++){
      const tip=pts[tipI[fi]],dip=pts[dipI[fi]]
      if(!tip||!dip)continue
      const dir=new THREE.Vector3().subVectors(tip,dip)
      if(dir.length()<0.001)continue
      dir.normalize()
      this.nails[fi].position.copy(tip).addScaledVector(dir,0.005)
      this.nails[fi].quaternion.setFromUnitVectors(UP,dir)
    }

    // Glow on three_finger press
    const emI=(gesture==='three_finger'?pinchStrength:0)*0.5
    for(const cap of this.caps.flat())(cap.material as THREE.MeshPhysicalMaterial).emissiveIntensity=emI
    for(const j of this.joints)(j.material as THREE.MeshPhysicalMaterial).emissiveIntensity=emI*1.2
    const[m4,m8,m12]=[pts[4],pts[8],pts[12]]
    if(m4&&m8&&m12){
      this.glow.position.set((m4.x+m8.x+m12.x)/3,(m4.y+m8.y+m12.y)/3,(m4.z+m8.z+m12.z)/3)
      ;(this.glow.material as THREE.MeshBasicMaterial).opacity=emI+Math.sin(time*9)*0.04*emI
    }
  }

  setVisible(v:boolean):void{this.group.visible=v}
  addToScene(s:THREE.Scene):void{s.add(this.group)}
}
