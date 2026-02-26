import { HandTracker }    from './xr/HandTracker'
import type { Landmark }  from './xr/HandTracker'
import { GestureDetector, GestureResult } from './xr/GestureDetector'
import { SceneManager }   from './xr/SceneManager'
import { XRWindow, WindowManager } from './ui/WindowManager'
import { HandCursor }     from './ui/HandCursor'
import { HandMesh }       from './ui/HandMesh'
import { TaskBar3D }      from './ui/TaskBar3D'
import { SettingsWindow } from './ui/SettingsWindow'
import type { HandRenderMode } from './ui/SettingsWindow'
import { VRRoom }         from './ui/VRRoom'
import { CameraApp }      from './ui/CameraApp'
import { AutoUpdater }    from './updater/AutoUpdater'
import * as THREE         from 'three'

const GITHUB_OWNER = 'MihailKashintsev'
const GITHUB_REPO  = 'mobile-xr'
const APP_VERSION: string = __APP_VERSION__

// ─── Loading ─────────────────────────────────────────────────────────────────
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
  loadProgress.style.width = `${p}%`
  if (msg && loaderSub) loaderSub.textContent = msg
}

function showToast(msg: string, dur=3000): void {
  const t = document.createElement('div')
  t.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(13,17,23,.95);color:#e6edf3;padding:12px 20px;border-radius:12px;font-family:-apple-system,sans-serif;font-size:.85rem;z-index:9000;border:1px solid rgba(99,102,241,.4);backdrop-filter:blur(12px);max-width:90vw;text-align:center'
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),dur)
}

async function main(): Promise<void> {
  const vb = document.getElementById('version-badge')
  if (vb) vb.textContent = `v${APP_VERSION}`

  setProgress(10,'Инициализация 3D...')
  const appEl   = document.getElementById('app')!
  const scene   = new SceneManager(appEl)
  const winMgr  = new WindowManager(scene.scene, scene.camera)
  const taskbar = new TaskBar3D()
  const settings = new SettingsWindow()
  const vrRoom  = new VRRoom()
  settings.version = APP_VERSION

  // Основное освещение сцены
  scene.scene.add(new THREE.AmbientLight(0xffffff, 0.45))
  const sun = new THREE.DirectionalLight(0xffffff, 0.7)
  sun.position.set(1, 3, 2); scene.scene.add(sun)

  vrRoom.addToScene(scene.scene)
  taskbar.addToScene(scene.scene)

  // ─── Руки ──────────────────────────────────────────────────────────────────
  let handMode: HandRenderMode = 'skeleton'
  const leftCursor  = new HandCursor(0x06b6d4)
  const rightCursor = new HandCursor(0xa78bfa)
  const leftMesh    = new HandMesh()
  const rightMesh   = new HandMesh()
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)
  leftMesh.addToScene(scene.scene)
  rightMesh.addToScene(scene.scene)
  leftCursor.setVisible(false); rightCursor.setVisible(false)
  leftMesh.setVisible(false); rightMesh.setVisible(false)

  settings.onHandMode = (m) => { handMode = m }

  // ─── Приложения (окна) ────────────────────────────────────────────────────
  let cameraApp: CameraApp | null = null
  let stereoActive = false

  // Camera App
  function openCameraApp(): void {
    if (cameraApp) {
      cameraApp.window.group.visible = !cameraApp.window.group.visible
      taskbar.setActive('📷', cameraApp.window.group.visible)
      return
    }
    cameraApp = new CameraApp(null) // video element будет задан позже
    cameraApp.window.onClose = () => {
      winMgr.remove(cameraApp!.window)
      cameraApp = null
      taskbar.setActive('📷', false)
    }
    cameraApp.onSwitchCamera = () => tracker.switchNextCamera()
    winMgr.add(cameraApp.window)
    taskbar.setActive('📷', true)
  }

  function openSettings(): void {
    settings.toggle()
    taskbar.setActive('⚙️', settings.isOpen())
  }

  function toggleVRRoom(): void {
    const on = !vrRoom.isVisible()
    vrRoom.setVisible(on)
    taskbar.setActive('🏠', on)
    if (on) showToast('🏠 VR комната активна')
    else    showToast('🏠 Режим камеры')
  }

  function toggleVR(): void {
    stereoActive = scene.toggleStereo()
    taskbar.setActive('👓', stereoActive)
    stereoToggle.textContent = stereoActive ? '⚙️ Калибровка' : '👓 VR'
    if (stereoActive) {
      const sr = scene.getStereoRenderer()!
      settings.setStereo(sr)
      winMgr.setStereoCamera(sr.camL)
      try { (screen.orientation as any)?.lock('landscape') } catch {}
    } else {
      winMgr.setStereoCamera(null)
      try { (screen.orientation as any)?.unlock() } catch {}
    }
  }

  // ─── Taskbar ──────────────────────────────────────────────────────────────
  taskbar.setButtons([
    { icon:'⚙️', label:'Настройки', onClick: openSettings },
    { icon:'📷', label:'Камера',    onClick: openCameraApp },
    { icon:'🏠', label:'Комната',   onClick: toggleVRRoom },
    { icon:'👓', label:'VR режим',  onClick: toggleVR },
  ])

  // ─── Render loop ──────────────────────────────────────────────────────────
  let leftG:   GestureResult | null = null
  let rightG:  GestureResult | null = null
  let leftLM:  Landmark[] | null = null
  let rightLM: Landmark[] | null = null
  let leftWLD: Landmark[] | null = null
  let rightWLD:Landmark[] | null = null
  let handsReady = false
  let isFrontCam = false
  let taskbarCD  = 0

  const gesture = new GestureDetector()

  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001

    const ndcOf = (lm: Landmark) => isFrontCam
      ? { ndcX:(1-lm.x)*2-1, ndcY:-(lm.y*2-1) }
      : { ndcX: lm.x*2-1,    ndcY:-(lm.y*2-1) }

    const fingerNDC = [
      leftG  ? ndcOf(leftG.indexTip)  : null,
      rightG ? ndcOf(rightG.indexTip) : null,
    ]

    if (handsReady) {
      winMgr.update(time, [leftG, rightG], fingerNDC)

      // Taskbar hit-test
      taskbarCD = Math.max(0, taskbarCD-1)
      if (taskbarCD===0) {
        for (let hi=0; hi<2; hi++) {
          const ndc = fingerNDC[hi], g = [leftG,rightG][hi]
          if (!ndc || !g || g.pinchStrength < 0.8) continue
          const cam = (stereoActive && scene.getStereoRenderer()?.camL) ?? scene.camera
          const dir = new THREE.Vector3(ndc.ndcX, ndc.ndcY, 0.5).unproject(cam).sub(cam.position).normalize()
          const testPt = cam.position.clone().addScaledVector(dir, 0.65)
          const hit = taskbar.hitTest(testPt)
          if (hit) { hit.onClick(); taskbarCD=25; break }
        }
      }
    }

    // Update taskbar (follows camera)
    taskbar.update(time, scene.camera)

    // Update hands
    const hands = [
      { lm:leftLM,  wld:leftWLD,  g:leftG,  cursor:leftCursor,  mesh:leftMesh  },
      { lm:rightLM, wld:rightWLD, g:rightG, cursor:rightCursor, mesh:rightMesh },
    ]
    for (const { lm, wld, g, cursor, mesh } of hands) {
      const vis = !!(lm && g)
      cursor.setVisible(vis && handMode==='skeleton')
      mesh.setVisible(  vis && handMode==='3d')
      if (!vis) continue
      const toWorld=(lmk:Landmark)=>landmarkToWorld(lmk,scene.camera,isFrontCam)
      if (handMode==='skeleton') {
        cursor.updateFromLandmarks(lm!, toWorld, g!.type, g!.pinchStrength, time)
      } else {
        const wristWorld = toWorld(lm![0])
        mesh.updateFromLandmarks(lm!, wld??lm!, wristWorld, isFrontCam, g!.type, g!.pinchStrength, time)
      }
    }

    scene.render()
  }
  animate()

  setProgress(50,'Запрос доступа к камере...')

  // ─── HandTracker ──────────────────────────────────────────────────────────
  const tracker = new HandTracker()
  try {
    await tracker.init(p => {
      const msgs: [number,string][] = [
        [0,'Загрузка MediaPipe...'],[35,'Загрузка библиотеки...'],[50,'Инициализация WASM...'],[80,'Запуск камеры...'],[100,'Готово!']
      ]
      setProgress(50+p*0.5, [...msgs].reverse().find(([k])=>p>=k)?.[1]??'')
    })

    scene.setupARBackground(tracker.getVideoElement())
    isFrontCam = tracker.isFront()
    cameraApp?.setVideo(tracker.getVideoElement())

    tracker.onHands(hands => {
      leftG=null; rightG=null; leftLM=null; rightLM=null; leftWLD=null; rightWLD=null
      isFrontCam = tracker.isFront()
      for (const hand of hands) {
        const g    = gesture.detect(hand.landmarks)
        const side = isFrontCam ? hand.handedness : (hand.handedness==='Left'?'Right':'Left')
        if (side==='Left') { leftG=g; leftLM=hand.landmarks; leftWLD=hand.worldLandmarks }
        else               { rightG=g; rightLM=hand.landmarks; rightWLD=hand.worldLandmarks }
      }
      leftDot.classList.toggle('active',  !!leftG)
      rightDot.classList.toggle('active', !!rightG)
    })

    settings.setTracker(tracker)
    handsReady = true
    setProgress(100,'✅ Готово!')
    setTimeout(()=>loadingScreen.classList.add('hidden'),400)

  } catch (err: any) {
    console.error(err)
    setProgress(100,`⚠️ ${err.message}`)
    if (loaderSub) loaderSub.style.color='#f87171'
    setTimeout(()=>{ loadingScreen.classList.add('hidden'); showToast('Трекинг рук недоступен',5000) },3000)
  }

  settings.onSwitchCamera = () => tracker.switchNextCamera().then(()=>{
    scene.setupARBackground(tracker.getVideoElement())
    cameraApp?.setVideo(tracker.getVideoElement())
    isFrontCam = tracker.isFront()
  })

  // stereo toggle button (сверху)
  stereoToggle.addEventListener('click', () => {
    if (stereoActive) openSettings()
    else toggleVR()
  })

  // ─── Auto updater ─────────────────────────────────────────────────────────
  const updater = new AutoUpdater(GITHUB_OWNER, GITHUB_REPO, APP_VERSION)
  updater.startAutoCheck(rel => {
    updateBanner.classList.add('show')
    const sp = updateBanner.querySelector('span')
    if (sp) sp.textContent = `🆕 ${rel.tag_name} доступна — обновите страницу`
  })
  updateBtn.addEventListener('click', ()=>location.reload())
  dismissBtn.addEventListener('click', ()=>updateBanner.classList.remove('show'))
}

function landmarkToWorld(lm: Landmark, cam: THREE.PerspectiveCamera, isFront: boolean): THREE.Vector3 {
  const ndcX = isFront ? (1-lm.x)*2-1 : lm.x*2-1
  const ndcY  = -(lm.y*2-1)
  const depth = Math.max(1.2, Math.min(4.5, 2.5-lm.z*6))
  const dir   = new THREE.Vector3(ndcX,ndcY,0.5).unproject(cam).sub(cam.position).normalize()
  return cam.position.clone().addScaledVector(dir, depth)
}

declare const __APP_VERSION__: string
main().catch(err => console.error('Fatal:', err))
