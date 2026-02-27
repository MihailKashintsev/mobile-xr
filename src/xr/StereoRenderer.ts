/**
 * StereoRenderer — исправленный цвет
 * 
 * Проблема была: RT рендерился с LinearSRGBColorSpace (без гаммы),
 * а 3D объекты ожидают sRGB выход → цвета выглядели иначе.
 * 
 * Решение: outputColorSpace = SRGBColorSpace ВСЕГДА.
 * RT хранит sRGB-данные. Quad шейдер читает raw texture2D() (без конвертации
 * т.к. ShaderMaterial) → выводит sRGB на sRGB-канвас. Всё согласовано.
 */
import * as THREE from 'three'

export interface StereoCalibration {
  ipd: number; lensDistance: number; k1: number; k2: number
  verticalOffset: number; fov: number; zoom: number
  eyeShiftL: number; eyeShiftR: number
}
export const DEFAULT_CALIBRATION: StereoCalibration = {
  ipd:63, lensDistance:0.5, k1:0.22, k2:0.10, verticalOffset:0, fov:90, zoom:1.0, eyeShiftL:0, eyeShiftR:0
}
const STORAGE_KEY = 'mxr-calib-v5'
const VERT = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`
const FRAG = `
precision highp float;
uniform sampler2D tEye;uniform float k1,k2,zoom,eyeShift;uniform vec2 lensCenter;
varying vec2 vUv;
void main(){
  vec2 uv=vec2(vUv.x+eyeShift,vUv.y);
  vec2 d=uv-lensCenter;float r2=dot(d,d);float b=1.0+k1*r2+k2*r2*r2;
  vec2 s=lensCenter+d*b*zoom;
  if(s.x<0.||s.x>1.||s.y<0.||s.y>1.)gl_FragColor=vec4(0.,0.,0.,1.);
  else gl_FragColor=texture2D(tEye,s);
}`

export class StereoRenderer {
  private r: THREE.WebGLRenderer; calib: StereoCalibration
  camL=new THREE.PerspectiveCamera(90,1,0.01,100)
  camR=new THREE.PerspectiveCamera(90,1,0.01,100)
  private rtL!:THREE.WebGLRenderTarget; private rtR!:THREE.WebGLRenderTarget
  private matL!:THREE.ShaderMaterial;   private matR!:THREE.ShaderMaterial
  private qsL=new THREE.Scene(); private qsR=new THREE.Scene()
  private qCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  private bgL=new THREE.Scene(); private bgR=new THREE.Scene()
  private bgCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1)
  private lastW=0; private lastH=0

  constructor(r: THREE.WebGLRenderer, ov?: Partial<StereoCalibration>) {
    this.r=r; this.calib={...DEFAULT_CALIBRATION,...this.load(),...ov}; this.rebuild()
  }

  setCalibration(p: Partial<StereoCalibration>): void { this.calib={...this.calib,...p}; this.applyCalib(); this.save() }
  getCalibration(): StereoCalibration { return {...this.calib} }
  resetCalibration(): void { this.calib={...DEFAULT_CALIBRATION}; this.applyCalib(); this.save() }

  setupARBackground(vt: THREE.VideoTexture): void {
    // SRGBColorSpace: Three.js decode sRGB→linear → re-encode sRGB на выходе = identity
    vt.colorSpace = THREE.SRGBColorSpace
    this.bgL.clear(); this.bgR.clear()
    const m=()=>new THREE.MeshBasicMaterial({map:vt,depthTest:false,depthWrite:false})
    this.bgL.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),m()))
    this.bgR.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),m()))
  }

  render(scene: THREE.Scene, main: THREE.PerspectiveCamera): void {
    this.syncCams(main)
    const PW=this.r.domElement.width, PH=this.r.domElement.height, PHW=Math.max(1,PW>>1)
    if (this.lastW!==PHW||this.lastH!==PH) {
      this.rtL.dispose();this.rtR.dispose()
      this.rtL=this.makeRT(PHW,PH);this.rtR=this.makeRT(PHW,PH)
      this.matL.uniforms.tEye.value=this.rtL.texture
      this.matR.uniforms.tEye.value=this.rtR.texture
      this.updateAspect(PHW,PH);this.lastW=PHW;this.lastH=PH
    }
    const sz=new THREE.Vector2(); this.r.getSize(sz)
    const CW=sz.x,CH=sz.y,CHW=CW>>1

    // ФИКС ДВОЙНОЙ ГАММЫ В VR:
    // Рендерим в RT с LINEAR colorspace → данные в RT линейные
    // ShaderMaterial читает их как линейные, выводит на sRGB канвас через outputColorSpace
    const savedCS = this.r.outputColorSpace
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace  // рендер в RT без гаммы
    for (const [rt,bg,cam] of [[this.rtL,this.bgL,this.camL],[this.rtR,this.bgR,this.camR]] as any[]) {
      this.r.setRenderTarget(rt);this.r.autoClear=true;this.r.clear();this.r.autoClear=false
      this.r.render(bg,this.bgCam);this.r.render(scene,cam)
    }
    this.r.outputColorSpace = savedCS  // восстанавливаем для quad-вывода

    // Вывод quad-ов на экран
    this.r.setRenderTarget(null);this.r.autoClear=true;this.r.clear();this.r.autoClear=false
    this.r.setScissorTest(true)
    this.r.setViewport(0,0,CHW,CH);this.r.setScissor(0,0,CHW,CH);this.r.render(this.qsL,this.qCam)
    this.r.setViewport(CHW,0,CHW,CH);this.r.setScissor(CHW,0,CHW,CH);this.r.render(this.qsR,this.qCam)
    this.r.setScissorTest(false);this.r.setViewport(0,0,CW,CH);this.r.setScissor(0,0,CW,CH)
    this.r.autoClear=true
  }

  onResize():void{this.lastW=0;this.lastH=0}
  dispose():void{this.rtL.dispose();this.rtR.dispose()}

  private rebuild():void{
    const PW=this.r.domElement.width,PH=this.r.domElement.height,PHW=Math.max(1,PW>>1)
    this.rtL?.dispose();this.rtR?.dispose()
    this.rtL=this.makeRT(PHW,PH);this.rtR=this.makeRT(PHW,PH)
    this.lastW=PHW;this.lastH=PH
    this.matL=this.makeMat(this.rtL.texture,this.calib.eyeShiftL)
    this.matR=this.makeMat(this.rtR.texture,this.calib.eyeShiftR)
    this.qsL.clear();this.qsR.clear()
    this.qsL.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.matL))
    this.qsR.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.matR))
    this.updateAspect(PHW,PH)
  }

  private makeRT(w:number,h:number):THREE.WebGLRenderTarget{
    // colorSpace: NoColorSpace → raw data, ShaderMaterial читает как есть
    return new THREE.WebGLRenderTarget(w,h,{
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
      format:THREE.RGBAFormat,colorSpace:THREE.NoColorSpace
    })
  }

  private makeMat(tex:THREE.Texture,shift:number):THREE.ShaderMaterial{
    return new THREE.ShaderMaterial({
      vertexShader:VERT,fragmentShader:FRAG,depthTest:false,depthWrite:false,
      uniforms:{
        tEye:{value:tex},k1:{value:this.calib.k1},k2:{value:this.calib.k2},
        zoom:{value:this.calib.zoom},eyeShift:{value:shift},
        lensCenter:{value:new THREE.Vector2(0.5,this.calib.lensDistance)}
      }
    })
  }

  private updateAspect(w:number,h:number):void{
    const a=h>0?w/h:1
    this.camL.aspect=a;this.camR.aspect=a
    this.camL.fov=this.calib.fov;this.camR.fov=this.calib.fov
    this.camL.updateProjectionMatrix();this.camR.updateProjectionMatrix()
  }

  private syncCams(main:THREE.PerspectiveCamera):void{
  const half=(this.calib.ipd/1000)/2, vOff=this.calib.verticalOffset, q=main.quaternion
  this.camL.quaternion.copy(q); this.camR.quaternion.copy(q)
  // IPD по локальному X камеры (вправо по взгляду), не мировому X
  const right=new THREE.Vector3(1,0,0).applyQuaternion(q)
  const up   =new THREE.Vector3(0,1,0).applyQuaternion(q)
  this.camL.position.copy(main.position).addScaledVector(right,-half).addScaledVector(up, vOff)
  this.camR.position.copy(main.position).addScaledVector(right, half).addScaledVector(up, vOff)
  this.camL.updateProjectionMatrix(); this.camR.updateProjectionMatrix()
}

  private applyCalib():void{
    const lc=new THREE.Vector2(0.5,this.calib.lensDistance)
    const set=(m:THREE.ShaderMaterial,shift:number)=>{
      m.uniforms.k1.value=this.calib.k1;m.uniforms.k2.value=this.calib.k2
      m.uniforms.zoom.value=this.calib.zoom;m.uniforms.eyeShift.value=shift
      m.uniforms.lensCenter.value=lc.clone()
    }
    if(this.matL)set(this.matL,this.calib.eyeShiftL)
    if(this.matR)set(this.matR,this.calib.eyeShiftR)
    const PHW=Math.max(1,this.r.domElement.width>>1)
    this.updateAspect(PHW,this.r.domElement.height)
  }

  private save():void{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.calib))}catch{}}
  private load():Partial<StereoCalibration>{try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):{}}catch{return{}}}
}
