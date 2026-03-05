import { HandTracker }      from './xr/HandTracker'
import type { Landmark, HandData } from './xr/HandTracker'
import { GestureDetector }  from './xr/GestureDetector'
import type { GestureResult } from './xr/GestureDetector'
import { SceneManager }     from './xr/SceneManager'
import { XRWindow, WindowManager } from './ui/WindowManager'
import { HandCursor }       from './ui/HandCursor'
import { HandMesh }         from './ui/HandMesh'
import { TaskBar3D }        from './ui/TaskBar3D'
import { SettingsWindow }   from './ui/SettingsWindow'
import { SettingsXRWindow } from './ui/SettingsXRWindow'
import type { HandRenderMode } from './ui/SettingsXRWindow'
import { VRRoom }           from './ui/VRRoom'
import { CameraApp }        from './ui/CameraApp'
import { PinchParticles }   from './ui/PinchParticles'
import { AutoUpdater }      from './updater/AutoUpdater'
import { ColorGrading }     from './ui/ColorGrading'
import { MindARManager }    from './xr/MindARManager'
import * as THREE           from 'three'

const APP_VERSION: string = __APP_VERSION__

// Передаём BASE URL для MindAR (нужно для GitHub Pages /mobile-xr/)
;(window as any).__BASE__ = (import.meta as any).env?.BASE_URL ?? '/mobile-xr/'

const loadingScreen = document.getElementById('loading-screen')!
const loadProgress  = document.getElementById('load-progress')!
const loaderSub     = document.querySelector('.loader-sub') as HTMLElement
const updateBanner  = document.getElementById('update-banner')!
const updateBtn     = document.getElementById('update-btn')!
const dismissBtn    = document.getElementById('dismiss-btn')!
const leftDot       = document.getElementById('left-dot')!
const rightDot      = document.getElementById('right-dot')!
const stereoToggle  = document.getElementById('stereo-toggle')!

function setProgress(p: number, msg?: string) {
  loadProgress.style.width = `${p}%`
  if (msg && loaderSub) loaderSub.textContent = msg
}
function toast(msg: string, dur = 3000) {
  const t = document.createElement('div')
  t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
    'background:rgba(8,15,26,.94);color:#dde4f5;padding:10px 18px;border-radius:10px;' +
    'font-family:-apple-system,sans-serif;font-size:.82rem;z-index:8000;' +
    'border:1px solid rgba(79,110,247,.35);max-width:88vw;text-align:center;pointer-events:none'
  t.textContent = msg; document.body.appendChild(t)
  setTimeout(() => t.remove(), dur)
}

function lmWorld(lm: Landmark, cam: THREE.PerspectiveCamera, front: boolean): THREE.Vector3 {
  const nx = front ? (1 - lm.x) * 2 - 1 : lm.x * 2 - 1
  const ny = -(lm.y * 2 - 1)
  const depth = Math.max(0.38, Math.min(0.82, 0.58 - lm.z * 0.35))
  return cam.position.clone().addScaledVector(
    new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize(), depth)
}

async function main() {
  const vb = document.getElementById('version-badge')
  if (vb) vb.textContent = `v${APP_VERSION}`

  setProgress(10, 'Инициализация 3D...')
  const appEl  = document.getElementById('app')!
  const scene  = new SceneManager(appEl)
  const mindAR = new MindARManager()
  const winMgr = new WindowManager(scene.scene, scene.camera)
  const taskbar      = new TaskBar3D()
  const settingsHtml = new SettingsWindow()
  const settingsXR   = new SettingsXRWindow()
  const vrRoom    = new VRRoom()
  const particles = new PinchParticles(scene.scene)
  settingsHtml.version = APP_VERSION

  scene.scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const sun = new THREE.DirectionalLight(0xffffff, 0.8)
  sun.position.set(1, 3, 2); scene.scene.add(sun)
  vrRoom.addToScene(scene.scene)
  taskbar.addToScene(scene.scene)

  const cg = new ColorGrading(scene.renderer.domElement)
  settingsHtml.setColorGrading(cg)
  settingsXR.setColorGrading(cg)

  let handMode: HandRenderMode = 'skeleton'
  const lCursor = new HandCursor(0x06b6d4), rCursor = new HandCursor(0xa78bfa)
  const lMesh   = new HandMesh(),           rMesh   = new HandMesh()
  lCursor.addToScene(scene.scene); rCursor.addToScene(scene.scene)
  lMesh.addToScene(scene.scene);   rMesh.addToScene(scene.scene)
  lCursor.setVisible(false); rCursor.setVisible(false)
  lMesh.setVisible(false);   rMesh.setVisible(false)
  settingsHtml.onHandMode = (m: HandRenderMode) => { handMode = m }
  settingsXR.onHandMode   = (m: HandRenderMode) => { handMode = m }

  winMgr.add(settingsXR.window)

  let cameraApp: CameraApp | null = null
  let stereoActive = false
  let arActive = false

  // Используем активную камеру (нашу или MindAR)
  function getCamera(): THREE.PerspectiveCamera {
    return (arActive && mindAR.arCamera) ? mindAR.arCamera : scene.camera
  }

  function spawnInFront(win: XRWindow, ox = 0, oy = 0, dist = 1.5) {
    const cam = getCamera()
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion)
    const rgt = new THREE.Vector3(1,0, 0).applyQuaternion(cam.quaternion)
    const up  = new THREE.Vector3(0,1, 0).applyQuaternion(cam.quaternion)
    win.group.position.copy(cam.position)
      .addScaledVector(fwd, dist).addScaledVector(rgt, ox).addScaledVector(up, oy)
    win.group.quaternion.copy(cam.quaternion)
  }

  function openCamera() {
    if (cameraApp) {
      cameraApp.window.group.visible = !cameraApp.window.group.visible
      taskbar.setActive('📷', cameraApp.window.group.visible); return
    }
    cameraApp = new CameraApp(scene.renderer)
    spawnInFront(cameraApp.window, 0.3, 0.05, 1.5)
    cameraApp.window.onClose = () => {
      winMgr.remove(cameraApp!.window); cameraApp = null; taskbar.setActive('📷', false)
    }
    cameraApp.onSwitchCamera = async () => {
      await tracker.switchNextCamera()
      scene.setupARBackground(tracker.getVideoElement())
      if (cameraApp) (cameraApp as any).setVideo(tracker.getVideoElement())
    }
    if (videoReady) cameraApp.setVideo(tracker.getVideoElement())
    winMgr.add(cameraApp.window); taskbar.setActive('📷', true)
  }

  function toggleRoom() {
    const on = !vrRoom.isVisible(); vrRoom.setVisible(on)
    taskbar.setActive('🏠', on); toast(on ? '🏠 VR комната' : '📷 AR режим')
  }

  function toggleVR() {
    stereoActive = scene.toggleStereo()
    taskbar.setActive('👓', stereoActive)
    stereoToggle.textContent = stereoActive ? '⚙️ Калибровка' : '👓 VR'
    if (stereoActive) {
      const sr = scene.getStereoRenderer()!
      settingsHtml.setStereo(sr); winMgr.setStereoCamera(sr.camL)
      try { (screen.orientation as any)?.lock?.('landscape') } catch {}
    } else {
      winMgr.setStereoCamera(null)
      try { (screen.orientation as any)?.unlock?.() } catch {}
    }
  }

  function openSettings() {
    if (!settingsXR.isOpen()) spawnInFront(settingsXR.window, -0.4, 0.05, 1.5)
    settingsXR.toggle(); taskbar.setActive('⚙️', settingsXR.isOpen())
  }

  function closeAll() {
    winMgr.hideAll([settingsXR.window, taskbar.window])
    if (cameraApp) { cameraApp.window.group.visible = false; taskbar.setActive('📷', false) }
    settingsXR.close(); taskbar.setActive('⚙️', false)
    vrRoom.setVisible(false); taskbar.setActive('🏠', false)
    toast('✕ Все окна закрыты')
  }

  async function toggleAR() {
    if (arActive) {
      toast('AR уже активен — наведи на распечатанный маркер')
      return
    }
    toast('📍 Загрузка AR трекинга...')
    const ok = await mindAR.start(appEl, scene.scene)
    if (!ok) { toast('⚠️ AR недоступен. Нет marker.mind файла или ошибка CDN'); return }
    arActive = true
    taskbar.setActive('📍', true)
    toast('✅ AR активен! Наведи на маркер')

    // Когда маркер найден первый раз — перемещаем окна к нему
    let spawned = false
    const check = setInterval(() => {
      if (!mindAR.isFound || spawned) return
      spawned = true; clearInterval(check)
      const anchor = mindAR.anchor3D!
      // Тасктбар над маркером
      taskbar.window.group.removeFromParent()
      taskbar.window.group.position.set(0, 0.25, 0)
      taskbar.window.group.quaternion.identity()
      anchor.add(taskbar.window.group)
      toast('🎯 Окна зафиксированы в пространстве!')
    }, 100)
  }

  taskbar.setButtons([
    { label: '⚙️',   onClick: openSettings },
    { label: '📷',   onClick: openCamera   },
    { label: '📍 AR', onClick: toggleAR    },
    { label: '🏠',   onClick: toggleRoom   },
    { label: '👓',   onClick: toggleVR     },
    { label: '✕',    onClick: closeAll     },
  ])
  winMgr.add(taskbar.window)

  let leftG:  GestureResult | null = null, rightG:  GestureResult | null = null
  let leftLM: Landmark[] | null = null,    rightLM: Landmark[] | null = null
  let leftWD: Landmark[] | null = null,    rightWD: Landmark[] | null = null
  let handsReady = false, videoReady = false, isFront = false
  const gesture = new GestureDetector()
  let prevT = performance.now() * 0.001

  function animate() {
    requestAnimationFrame(animate)
    const t  = performance.now() * 0.001
    const dt = Math.min(t - prevT, 0.05); prevT = t
    const cam = getCamera()

    const ndcOf = (lm: Landmark) => isFront
      ? { ndcX: (1-lm.x)*2-1, ndcY: -(lm.y*2-1) }
      : { ndcX:  lm.x*2-1,    ndcY: -(lm.y*2-1) }

    const fNDC = [leftG ? ndcOf(leftG.indexTip) : null, rightG ? ndcOf(rightG.indexTip) : null]
    const fWld = [
      leftLM  ? lmWorld(leftLM[8],  cam, isFront) : null,
      rightLM ? lmWorld(rightLM[8], cam, isFront) : null,
    ]

    if (handsReady) winMgr.update(t, [leftG, rightG], fNDC, fWld)
    taskbar.update(t, cam, fWld[0] ?? fWld[1] ?? null, false)

    const hands = [
      { lm: leftLM,  wd: leftWD,  g: leftG,  cursor: lCursor, mesh: lMesh },
      { lm: rightLM, wd: rightWD, g: rightG, cursor: rCursor, mesh: rMesh },
    ]
    const pinchHands: { isPinching: boolean; pinchPoint: THREE.Vector3 | null }[] = []
    for (const { lm, wd, g, cursor, mesh } of hands) {
      const vis = !!(lm && g)
      cursor.setVisible(vis && handMode === 'skeleton')
      mesh.setVisible(  vis && handMode === '3d')
      let pp: THREE.Vector3 | null = null
      if (vis) {
        const tw = (lmk: Landmark) => lmWorld(lmk, cam, isFront)
        if (handMode === 'skeleton') cursor.updateFromLandmarks(lm!, tw, g!.type, g!.pinchStrength, t)
        else mesh.updateFromLandmarks(lm!, wd ?? lm!, tw(lm![0]), isFront, g!.type, g!.pinchStrength, t)
        if (g!.isGun) {
          const th = tw(lm![4]), ix = tw(lm![8])
          pp = new THREE.Vector3().addVectors(th, ix).multiplyScalar(0.5)
        }
      }
      pinchHands.push({ isPinching: vis && !!g?.isGun, pinchPoint: pp })
    }
    particles.update(dt, pinchHands)

    // Рендерим только если MindAR не активен (он рендерит сам)
    if (!arActive) cg.renderWithGrading(() => scene.render())
  }
  animate()

  setProgress(50, 'Запрос камеры...')
  const tracker = new HandTracker()
  try {
    await tracker.init(p => {
      const msgs: [number,string][] = [[0,'Загрузка MediaPipe...'],[35,'Библиотека...'],[50,'WASM...'],[80,'Камера...'],[100,'Готово!']]
      setProgress(50 + p*0.5, [...msgs].reverse().find(([k]) => p>=k)?.[1] ?? '')
    })
    scene.setupARBackground(tracker.getVideoElement())
    isFront = tracker.isFront(); videoReady = true
    if (cameraApp) (cameraApp as any).setVideo(tracker.getVideoElement())

    tracker.onHands((hands: HandData[]) => {
      leftG = null; rightG = null; leftLM = null; rightLM = null; leftWD = null; rightWD = null
      isFront = tracker.isFront()
      for (const h of hands) {
        const g    = gesture.detect(h.landmarks)
        const side = isFront ? h.handedness : (h.handedness === 'Left' ? 'Right' : 'Left')
        if (side === 'Left') { leftG  = g; leftLM  = h.landmarks; leftWD  = h.worldLandmarks }
        else                 { rightG = g; rightLM = h.landmarks; rightWD = h.worldLandmarks }
      }
      leftDot.classList.toggle('active',  !!leftG)
      rightDot.classList.toggle('active', !!rightG)
    })
    settingsHtml.setTracker(tracker)
    settingsHtml.onSwitchCamera = () => {
      scene.setupARBackground(tracker.getVideoElement())
      if (cameraApp) (cameraApp as any).setVideo(tracker.getVideoElement())
    }
    handsReady = true
    setProgress(100, '✅ Готово!')
    setTimeout(() => loadingScreen.classList.add('hidden'), 400)
  } catch (err: any) {
    console.error(err)
    setProgress(100, `⚠️ ${err.message}`)
    if (loaderSub) loaderSub.style.color = '#f87171'
    setTimeout(() => { loadingScreen.classList.add('hidden'); toast('Трекинг рук недоступен', 5000) }, 3000)
  }

  stereoToggle.addEventListener('click', () => stereoActive ? settingsHtml.toggle() : toggleVR())

  const upd = new AutoUpdater('MihailKashintsev', 'mobile-xr', APP_VERSION)
  upd.startAutoCheck(rel => {
    updateBanner.classList.add('show')
    const sp = updateBanner.querySelector('span')
    if (sp) sp.textContent = `🆕 ${rel.tag_name} — обновите страницу`
  })
  updateBtn.addEventListener('click', () => location.reload())
  dismissBtn.addEventListener('click', () => updateBanner.classList.remove('show'))
}

declare const __APP_VERSION__: string // v2
main().catch(e => console.error('Fatal:', e))
