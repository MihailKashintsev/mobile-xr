/**
 * HandMesh v7 — исправленный трекинг
 *
 * КЛЮЧЕВЫЕ ИСПРАВЛЕНИЯ:
 * 1. Используем worldLandmarks для масштаба (метрические координаты ~20см рука)
 * 2. Масштаб SCALE увеличен чтобы рука была видимой в VR
 * 3. Позиционирование: wristWorld = проекция lm[0] на реальную глубину
 * 4. Все точки: wristWorld + (worldLm[i] - worldLm[0]) * SCALE * sign
 */
import * as THREE from 'three'
import type { GestureType } from '../xr/GestureDetector'
import type { Landmark }    from '../xr/HandTracker'

// Радиусы сегментов пальцев [палец][сегмент]: [MCP-PIP, PIP-DIP, DIP-TIP]
const FINGER_R=[
  [0.016,0.014,0.011,0.009],  // большой
  [0.014,0.012,0.010,0.008],  // указательный
  [0.015,0.013,0.011,0.009],  // средний
  [0.013,0.011,0.009,0.007],  // безымянный
  [0.011,0.009,0.008,0.006],  // мизинец
]
const UP=new THREE.Vector3(0,1,0)
const _q=new THREE.Quaternion()
const _m=new THREE.Matrix4()
const _v=new THREE.Vector3()

/** Масштаб worldLandmarks → world units.
 *  MediaPipe worldLandmarks в метрах (~0.08-0.22м для взрослой руки).
 *  Умножаем на SCALE чтобы рука выглядела нужного размера в сцене.
 *  5.5 = примерный коэффициент для телефона на расстоянии ~60см
 */
const SCALE = 5.5

function skinMat():THREE.MeshPhysicalMaterial{
  return new THREE.MeshPhysicalMaterial({
    color:0xf5c4a0,
    roughness:0.68, metalness:0.0,
    emissive:new THREE.Color(0x280800), emissiveIntensity:0.08,
    side:THREE.FrontSide,
    depthTest:true, depthWrite:true,
    transparent:false,
  })
}

function placeCylinder(m:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3):void{
  const dir=_v.subVectors(b,a)
  const len=dir.length()
  if(len<0.0005){m.visible=false;return}
  m.visible=true
  _q.setFromUnitVectors(UP,dir.normalize())
  const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5)
  _m.compose(mid,_q,new THREE.Vector3(1,len,1))
  m.matrix.copy(_m); m.matrixAutoUpdate=false
}

export class HandMesh{
  group:THREE.Group
  private caps:THREE.Mesh[][]=[]   // цилиндры [finger][segment]
  private joints:THREE.Mesh[]=[]  // суставные сферы x21
  private nails:THREE.Mesh[]=[]   // ногти x5
  private glow:THREE.Mesh

  constructor(){
    this.group=new THREE.Group()

    // 5 пальцев × 3 сегмента
    for(let fi=0;fi<5;fi++){
      const r=FINGER_R[fi]; const segs:THREE.Mesh[]=[]
      for(let si=0;si<3;si++){
        const m=new THREE.Mesh(
          new THREE.CylinderGeometry(r[si+1],r[si],1,10,1),
          skinMat())
        segs.push(m); this.group.add(m)
      }
      this.caps.push(segs)
    }

    // 21 сустав
    const jR=[
      0.024,                         // 0 запястье
      0.016,0.013,0.011,0.009,       // 1-4 большой
      0.016,0.013,0.011,0.009,       // 5-8 указательный
      0.017,0.014,0.012,0.010,       // 9-12 средний
      0.015,0.012,0.010,0.008,       // 13-16 безымянный
      0.013,0.010,0.008,0.007,       // 17-20 мизинец
    ]
    for(let i=0;i<21;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(jR[i]??0.009,8,6),skinMat())
      this.joints.push(m); this.group.add(m)
    }

    // 5 ногтей
    for(let i=0;i<5;i++){
      const m=new THREE.Mesh(
        new THREE.BoxGeometry(0.013,0.005,0.016),
        new THREE.MeshPhysicalMaterial({
          color:0xffddd0,roughness:0.25,transparent:false,
          depthTest:true,depthWrite:true
        }))
      this.nails.push(m); this.group.add(m)
    }

    // Glow (три_пальца)
    this.glow=new THREE.Mesh(
      new THREE.SphereGeometry(0.025,10,8),
      new THREE.MeshBasicMaterial({color:0x80ccff,transparent:true,opacity:0,depthWrite:false}))
    this.group.add(this.glow)
  }

  updateFromLandmarks(
    lm:Landmark[],           // нормализованные 0-1 (screen)
    wld:Landmark[],          // world landmarks в метрах (от MediaPipe)
    wristWorld:THREE.Vector3, // 3D позиция запястья в сцене
    isFront:boolean,
    gesture:GestureType,
    pinchStrength:number,
    time:number
  ):void{
    if(!lm||lm.length<21||!wld||wld.length<21){this.group.visible=false;return}
    this.group.visible=true

    const signX=isFront?-1:1  // зеркало для фронтальной камеры
    const w0=wld[0]            // запястье в метрических координатах

    // Строим все 21 точку относительно wristWorld
    // worldLandmarks[i] - worldLandmarks[0] = смещение от запястья в метрах
    // * SCALE = в единицах сцены
    const pts:THREE.Vector3[]=[]
    for(let i=0;i<21;i++){
      const w=wld[i]
      if(!w){this.group.visible=false;return}
      pts.push(new THREE.Vector3(
        wristWorld.x + (w.x - w0.x) * signX * SCALE,
        wristWorld.y - (w.y - w0.y) * SCALE,   // Y инвертирован
        wristWorld.z - (w.z - w0.z) * SCALE,
      ))
    }

    // Суставы
    for(let i=0;i<21;i++)this.joints[i].position.copy(pts[i])

    // Цилиндры: пальцы
    // Большой:     1-2-3-4
    // Остальные:   MCP-PIP-DIP-TIP (5-6-7-8, 9-10-11-12, 13-14-15-16, 17-18-19-20)
    const fingerJoints=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]
    for(let fi=0;fi<5;fi++){
      const j=fingerJoints[fi]
      for(let si=0;si<3;si++)placeCylinder(this.caps[fi][si],pts[j[si]],pts[j[si+1]])
    }

    // Ногти
    const tipI=[4,8,12,16,20],dipI=[3,7,11,15,19]
    for(let fi=0;fi<5;fi++){
      const tip=pts[tipI[fi]],dip=pts[dipI[fi]]
      if(!tip||!dip)continue
      const dir=new THREE.Vector3().subVectors(tip,dip)
      if(dir.length()<0.001)continue
      dir.normalize()
      this.nails[fi].position.copy(tip).addScaledVector(dir,0.006)
      this.nails[fi].quaternion.setFromUnitVectors(UP,dir)
    }

    // Glow при трёх пальцах
    const emI=(gesture==='three_finger'?pinchStrength:0)*0.45
    for(const seg of this.caps.flat())
      (seg.material as THREE.MeshPhysicalMaterial).emissiveIntensity=emI*0.8
    for(const j of this.joints)
      (j.material as THREE.MeshPhysicalMaterial).emissiveIntensity=emI
    if(pts[4]&&pts[8]&&pts[12]){
      this.glow.position.set(
        (pts[4].x+pts[8].x+pts[12].x)/3,
        (pts[4].y+pts[8].y+pts[12].y)/3,
        (pts[4].z+pts[8].z+pts[12].z)/3
      )
      ;(this.glow.material as THREE.MeshBasicMaterial).opacity=emI+Math.sin(time*10)*0.03*emI
    }
  }

  setVisible(v:boolean):void{this.group.visible=v}
  addToScene(s:THREE.Scene):void{s.add(this.group)}
}