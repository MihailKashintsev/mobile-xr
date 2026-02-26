import { HandTracker }    from './xr/HandTracker'
import type { Landmark }  from './xr/HandTracker'
import { GestureDetector, GestureResult } from './xr/GestureDetector'
import { SceneManager }   from './xr/SceneManager'
import { XRWindow, WindowManager } from './ui/WindowManager'
import { HandCursor }     from './ui/HandCursor'
import { HandMesh }       from './ui/HandMesh'
import { TaskBar3D }      from './ui/TaskBar3D'
import { SettingsWindow } from './ui/SettingsWindow'
import { SettingsXRWindow } from './ui/SettingsXRWindow'
import type { HandRenderMode } from './ui/SettingsXRWindow'
import { VRRoom }         from './ui/VRRoom'
import { CameraApp }      from './ui/CameraApp'
import { PinchParticles } from './ui/PinchParticles'
import { AutoUpdater }    from './updater/AutoUpdater'
import { ColorGrading }   from './ui/ColorGrading'
import * as THREE         from 'three'

const APP_VERSION: string = __APP_VERSION__

// ─── DOM refs ────────────────────────────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen')!
const loadProgress  = document.getElementById('load-progress')!
const loaderSub     = document.querySelector('.loader-sub') as HTMLElement
const updateBanner  = document.getElementById('update-banner')!
const updateBtn     = document.getElementById('update-btn')!
const dismissBtn    = document.getElementById('dismiss-btn')!
const leftDot       = document.getElementById('left-dot')!
const rightDot      = document.getElementById('right-dot')!
const stereoToggle  = document.getElementById('stereo-toggle')!

function setProgress(p: number, msg?: string): void {
  loadProgress.style.width=`${p}%`; if (msg&&loaderSub) loaderSub.textContent=msg
}
function toast(msg: string, dur=3000): void {
  const t=document.createElement('div')
  t.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(13,17,23,.92);color:#e6edf3;padding:10px 18px;border-radius:10px;font-family:-apple-system,sans-serif;font-size:.82rem;z-index:8000;border:1px solid rgba(99,102,241,.3);max-width:88vw;text-align:center'
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),dur)
}

async function main(): Promise<void> {
  const vb=document.getElementById('version-badge'); if(vb) vb.textContent=`v${APP_VERSION}`

  setProgress(10,'Инициализация 3D...')
  const appEl  = document.getElementById('app')!
  const scene  = new SceneManager(appEl)
  const winMgr   = new WindowManager(scene.scene, scene.camera)
  const taskbar  = new TaskBar3D()
  const settingsHtml = new SettingsWindow()   // HTML-настройки для VR-калибровки
  const settingsXR   = new SettingsXRWindow() // XR 3D окно настроек (режим руки + цвет)
  const vrRoom   = new VRRoom()
  const particles = new PinchParticles(scene.scene)
  settingsHtml.version = APP_VERSION

  // Освещение
  scene.scene.add(new THREE.AmbientLight(0xffffff,0.45))
  const sun=new THREE.DirectionalLight(0xffffff,0.75); sun.position.set(1,3,2); scene.scene.add(sun)

  vrRoom.addToScene(scene.scene)
  taskbar.addToScene(scene.scene)
  const cg = new ColorGrading(scene.renderer.domElement)
  settingsHtml.setColorGrading(cg)
  settingsXR.setColorGrading(cg)

  // ─── Руки ─────────────────────────────────────────────────────────────────
  let handMode: HandRenderMode = 'skeleton'
  const leftCursor =new HandCursor(0x06b6d4); const rightCursor=new HandCursor(0xa78bfa)
  const leftMesh   =new HandMesh();            const rightMesh  =new HandMesh()
  leftCursor.addToScene(scene.scene);  rightCursor.addToScene(scene.scene)
  leftMesh.addToScene(scene.scene);    rightMesh.addToScene(scene.scene)
  leftCursor.setVisible(false);        rightCursor.setVisible(false)
  leftMesh.setVisible(false);          rightMesh.setVisible(false)
  settingsHtml.onHandMode=(m: HandRenderMode)=>{ handMode=m }
  settingsXR.onHandMode =(m: HandRenderMode)=>{ handMode=m }

  // Добавляем XR окно настроек в WindowManager
  winMgr.add(settingsXR.window)

  // ─── App windows ──────────────────────────────────────────────────────────
  let cameraApp: CameraApp | null = null
  let stereoActive = false

  // Camera window
  function openCamera(): void {
    if (cameraApp) {
      cameraApp.window.group.visible=!cameraApp.window.group.visible
      taskbar.setActive('📷',cameraApp.window.group.visible)
      return
    }
    cameraApp=new CameraApp(scene.renderer)
    // Спаун окна в мировом пространстве перед камерой
    spawnWindowInFrontOfCamera(cameraApp.window, 0.0, 0.05)
    cameraApp.window.onClose=()=>{
      winMgr.remove(cameraApp!.window)
      cameraApp=null
      taskbar.setActive('📷',false)
    }
    cameraApp.onSwitchCamera=async()=>{
      await tracker.switchNextCamera()
      scene.setupARBackground(tracker.getVideoElement())
      ;(cameraApp as CameraApp|null)?.setVideo(tracker.getVideoElement())
    }
    if (videoReady) cameraApp.setVideo(tracker.getVideoElement())
    winMgr.add(cameraApp.window)
    taskbar.setActive('📷',true)
  }

  // VR Room (toggle)
  function toggleRoom(): void {
    const on=!vrRoom.isVisible(); vrRoom.setVisible(on)
    taskbar.setActive('🏠',on)
    toast(on?'🏠 VR комната включена':'📷 Режим AR')
  }

  // VR stereo
  function toggleVR(): void {
    stereoActive=scene.toggleStereo()
    taskbar.setActive('👓',stereoActive)
    stereoToggle.textContent=stereoActive?'⚙️ Калибровка':'👓 VR'
    if (stereoActive) {
      const sr=scene.getStereoRenderer()!
      settingsHtml.setStereo(sr); winMgr.setStereoCamera(sr.camL)
      try{(screen.orientation as any)?.lock('landscape')}catch{}
    } else {
      winMgr.setStereoCamera(null)
      try{(screen.orientation as any)?.unlock()}catch{}
    }
  }



  // Закрыть все окна (кроме тасктбара)
  function closeAllWindows(): void {
    winMgr.hideAll([settingsXR.window, taskbar.window])
    if (cameraApp) { cameraApp.window.group.visible = false; taskbar.setActive('📷',false) }
    settingsXR.close();  taskbar.setActive('⚙️',false)
    vrRoom.setVisible(false); taskbar.setActive('🏠',false)
    toast('✕ Все окна закрыты')
  }

  // ─── Taskbar кнопки (нажимаются рукой!) ──────────────────────────────────
  taskbar.setButtons([
    { label: '⚙️ Настройки', onClick: openSettingsXR },
    { label: '📷 Камера',    onClick: openCamera      },
    { label: '🏠 Комната',   onClick: toggleRoom      },
    { label: '👓 VR',        onClick: toggleVR        },
    { label: '✕✕ Закрыть',  onClick: closeAllWindows },
  ])
  // Тасктбар всегда в WindowManager (не удаляется!)
  winMgr.add(taskbar.window)

  // ─── State ────────────────────────────────────────────────────────────────
  let leftG:  GestureResult|null=null, rightG: GestureResult|null=null
  let leftLM: Landmark[]|null=null,    rightLM:Landmark[]|null=null
  let leftWLD:Landmark[]|null=null,    rightWLD:Landmark[]|null=null
  let handsReady=false, videoReady=false, isFrontCam=false, taskbarCD=0
  const gesture=new GestureDetector()
  let prevTime=performance.now()*0.001

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Разместить XRWindow в мировом пространстве перед камерой */
  function spawnWindowInFrontOfCamera(win: import('./ui/WindowManager').XRWindow, offsetX=0, offsetY=0, dist=1.4): void {
    const cam = scene.camera
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(cam.quaternion)
    const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(cam.quaternion)
    win.group.position
      .copy(cam.position)
      .addScaledVector(forward, dist)
      .addScaledVector(right, offsetX)
      .addScaledVector(up, offsetY)
    win.group.quaternion.copy(cam.quaternion)
  }

  // Спаун XR настроек перед камерой при первом открытии
  function openSettingsXR(): void {
    if (!settingsXR.isOpen()) spawnWindowInFrontOfCamera(settingsXR.window, -0.45, 0.05)
    settingsXR.toggle()
    taskbar.setActive('⚙️', settingsXR.isOpen())
  }

  // ─── Render loop ──────────────────────────────────────────────────────────
  function animate(): void {
    requestAnimationFrame(animate)
    const time=performance.now()*0.001
    const dt=Math.min(time-prevTime,0.05); prevTime=time

    const ndcOf=(lm:Landmark)=>isFrontCam
      ?{ndcX:(1-lm.x)*2-1,ndcY:-(lm.y*2-1)}
      :{ndcX:lm.x*2-1,    ndcY:-(lm.y*2-1)}

    const fingerNDC=[
      leftG ?ndcOf(leftG.indexTip) :null,
      rightG?ndcOf(rightG.indexTip):null,
    ]
    // 3D world positions кончиков указательных пальцев (полная глубина — для HandMesh)
    const fingerWorld=[
      leftLM  ? landmarkToWorld(leftLM[8],  scene.camera, isFrontCam) : null,
      rightLM ? landmarkToWorld(rightLM[8], scene.camera, isFrontCam) : null,
    ]
    // Projected to UI plane (~0.65m) — для hit-test тасктбара и окон
    // Окна и тасктбар живут на 0.5-0.7м от камеры
    const fingerNear=[
      leftG  ? landmarkToWorldAtDist(leftG.indexTip,  scene.camera, isFrontCam, 0.65) : null,
      rightG ? landmarkToWorldAtDist(rightG.indexTip, scene.camera, isFrontCam, 0.65) : null,
    ]

    if (handsReady) {
      winMgr.update(time,[leftG,rightG],fingerNDC,fingerNear)
    }

    // Taskbar (HTML overlay) — кнопки работают через touch/click напрямую
    // update() вызываем для совместимости
    const tbFinger = fingerNear[0] ?? fingerNear[1] ?? null
    const tbPinch  = Math.max(leftG?.pinchStrength??0, rightG?.pinchStrength??0)
    taskbar.update(time, scene.camera, tbFinger, tbPinch > 0.70)

    // Hands
    const lms=[
      {lm:leftLM, wld:leftWLD, g:leftG, cursor:leftCursor, mesh:leftMesh},
      {lm:rightLM,wld:rightWLD,g:rightG,cursor:rightCursor,mesh:rightMesh},
    ]
    const pinchHands:{isPinching:boolean;pinchPoint:THREE.Vector3|null}[]=[]

    for (const {lm,wld,g,cursor,mesh} of lms) {
      const vis=!!(lm&&g)
      cursor.setVisible(vis&&handMode==='skeleton')
      mesh.setVisible(  vis&&handMode==='3d')

      let pinchPt:THREE.Vector3|null=null
      if (vis) {
        const toWorld=(lmk:Landmark)=>landmarkToWorld(lmk,scene.camera,isFrontCam)
        if (handMode==='skeleton') cursor.updateFromLandmarks(lm!,toWorld,g!.type,g!.pinchStrength,time)
        else mesh.updateFromLandmarks(lm!,wld??lm!,toWorld(lm![0]),isFrontCam,g!.type,g!.pinchStrength,time)
        // Pinch point = midpoint between thumb tip and index tip
        if (g!.pinchStrength>0.5) {
          const t=toWorld(lm![4]),i=toWorld(lm![8])
          pinchPt=new THREE.Vector3().addVectors(t,i).multiplyScalar(0.5)
        }
      }
      pinchHands.push({isPinching:vis&&(g?.type==='pinch'),pinchPoint:pinchPt})
    }

    // Particle effect on pinch
    particles.update(dt, pinchHands)

    cg.renderWithGrading(()=>scene.render())
  }
  animate()

  setProgress(50,'Запрос камеры...')

  // ─── HandTracker ──────────────────────────────────────────────────────────
  const tracker=new HandTracker()
  try {
    await tracker.init(p=>{
      const msgs:[number,string][]=[
        [0,'Загрузка MediaPipe...'],[35,'Библиотека...'],[50,'WASM...'],[80,'Камера...'],[100,'Готово!']
      ]
      setProgress(50+p*0.5,[...msgs].reverse().find(([k])=>p>=k)?.[1]??'')
    })
    scene.setupARBackground(tracker.getVideoElement())
    isFrontCam=tracker.isFront()
    videoReady=true
    ;(cameraApp as CameraApp|null)?.setVideo(tracker.getVideoElement())

    tracker.onHands(hands=>{
      leftG=null;rightG=null;leftLM=null;rightLM=null;leftWLD=null;rightWLD=null
      isFrontCam=tracker.isFront()
      for (const hand of hands) {
        const g=gesture.detect(hand.landmarks)
        const side=isFrontCam?hand.handedness:(hand.handedness==='Left'?'Right':'Left')
        if(side==='Left'){leftG=g;leftLM=hand.landmarks;leftWLD=hand.worldLandmarks}
        else             {rightG=g;rightLM=hand.landmarks;rightWLD=hand.worldLandmarks}
      }
      leftDot.classList.toggle('active',!!leftG)
      rightDot.classList.toggle('active',!!rightG)
    })

    settingsHtml.setTracker(tracker)
    settingsHtml.onSwitchCamera=()=>{
      scene.setupARBackground(tracker.getVideoElement())
      ;(cameraApp as CameraApp|null)?.setVideo(tracker.getVideoElement())
    }
    handsReady=true
    setProgress(100,'✅ Готово!')
    setTimeout(()=>loadingScreen.classList.add('hidden'),400)

  } catch(err:any) {
    console.error(err)
    setProgress(100,`⚠️ ${err.message}`)
    if(loaderSub) loaderSub.style.color='#f87171'
    setTimeout(()=>{loadingScreen.classList.add('hidden');toast('Трекинг рук недоступен',5000)},3000)
  }

  // stereo btn
  stereoToggle.addEventListener('click',()=>stereoActive?settingsHtml.toggle():toggleVR())

  // ─── Auto updater ─────────────────────────────────────────────────────────
  const updater=new AutoUpdater('MihailKashintsev','mobile-xr',APP_VERSION)
  updater.startAutoCheck(rel=>{
    updateBanner.classList.add('show')
    const sp=updateBanner.querySelector('span')
    if(sp) sp.textContent=`🆕 Версия ${rel.tag_name} — обновите страницу`
  })
  updateBtn.addEventListener('click',()=>location.reload())
  dismissBtn.addEventListener('click',()=>updateBanner.classList.remove('show'))
}

function landmarkToWorld(lm:Landmark,cam:THREE.PerspectiveCamera,isFront:boolean):THREE.Vector3{
  const ndcX=isFront?(1-lm.x)*2-1:lm.x*2-1
  const ndcY=-(lm.y*2-1)
  // Ближняя проекция для HandMesh (рука должна быть близко к AR фону)
  const depth=Math.max(0.5,Math.min(1.5,0.9-lm.z*3))
  const dir=new THREE.Vector3(ndcX,ndcY,0.5).unproject(cam).sub(cam.position).normalize()
  return cam.position.clone().addScaledVector(dir,depth)
}

/** Проецирует NDC точку пальца на фиксированную дистанцию — для UI hit-test */
function landmarkToWorldAtDist(lm:Landmark,cam:THREE.PerspectiveCamera,isFront:boolean,dist:number):THREE.Vector3{
  const ndcX=isFront?(1-lm.x)*2-1:lm.x*2-1
  const ndcY=-(lm.y*2-1)
  const dir=new THREE.Vector3(ndcX,ndcY,0.5).unproject(cam).sub(cam.position).normalize()
  return cam.position.clone().addScaledVector(dir,dist)
}

declare const __APP_VERSION__: string
main().catch(err=>console.error('Fatal:',err))
