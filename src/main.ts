import { HandTracker }    from './xr/HandTracker'
import type { Landmark }  from './xr/HandTracker'
import { GestureDetector }from './xr/GestureDetector'
import { SceneManager }   from './xr/SceneManager'
import { XRWindow, WindowManager } from './ui/WindowManager'
import { HandCursor }     from './ui/HandCursor'
import { HandMesh }       from './ui/HandMesh'
import type { HandRenderMode } from './ui/CalibrationPanel'
import { CalibrationPanel }   from './ui/CalibrationPanel'
import { CameraPicker }   from './ui/CameraPicker'
import { AutoUpdater }    from './updater/AutoUpdater'
import * as THREE         from 'three'

const GITHUB_OWNER = 'MihailKashintsev'
const GITHUB_REPO  = 'mobile-xr'
const APP_VERSION  = __APP_VERSION__

const loadingScreen  = document.getElementById('loading-screen')!
const loadProgress   = document.getElementById('load-progress')!
const loaderSub      = document.querySelector('.loader-sub') as HTMLElement
const updateBanner   = document.getElementById('update-banner')!
const updateBtn      = document.getElementById('update-btn')!
const dismissBtn     = document.getElementById('dismiss-btn')!
const leftDot        = document.getElementById('left-dot')!
const rightDot       = document.getElementById('right-dot')!
const stereoToggleEl = document.getElementById('stereo-toggle')!

function setProgress(p: number, msg?: string): void {
  loadProgress.style.width = `${p}%`
  if (msg && loaderSub) loaderSub.textContent = msg
}

async function main(): Promise<void> {
  const versionBadge = document.getElementById('version-badge')
  if (versionBadge) versionBadge.textContent = `Mobile XR v${APP_VERSION}`

  setProgress(10, 'Инициализация 3D сцены...')
  const appEl = document.getElementById('app')!
  const scene = new SceneManager(appEl)
  const winManager = new WindowManager(scene.scene, scene.camera)

  let cameraPicker: CameraPicker   | null = null
  let calibPanel:   CalibrationPanel| null = null

  // ─── 3D окна ─────────────────────────────────────────────────────────────
  const mainWin = new XRWindow({
    title: 'Mobile XR', icon: '🥽',
    position: new THREE.Vector3(-0.85, 0.15, -2.6),
    content: { buttons: [
      { label: '✨ Частицы',  color: 0x6366f1, onClick: () => spawnParticles(scene.scene) },
      { label: '📷 Камера',   color: 0x0891b2, onClick: () => cameraPicker?.toggle() },
      { label: '👓 VR режим', color: 0x059669, onClick: () => toggleStereo() },
      { label: '⚙ Настройки',color: 0x7c3aed, onClick: () => { ensureCalibPanel(); calibPanel?.open() } },
    ]}
  })
  winManager.add(mainWin)

  const infoWin = new XRWindow({
    title: 'Инфо', icon: 'ℹ️',
    width: 1.25, height: 0.90,
    position: new THREE.Vector3(0.95, 0.05, -2.4),
    content: { buttons: [
      { label: `📦 v${APP_VERSION}`,color: 0x374151, onClick: () => showToast(`Mobile XR v${APP_VERSION}`) },
      { label: '🐙 GitHub',         color: 0x24292e, onClick: () => window.open(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`, '_blank') },
      { label: '🔄 Перезагрузить',  color: 0x1d4ed8, onClick: () => location.reload() },
    ]}
  })
  winManager.add(infoWin)

  // ─── Визуализаторы рук ────────────────────────────────────────────────────
  let handMode: HandRenderMode = 'skeleton'

  // Скелетные курсоры
  const leftCursor  = new HandCursor(0x06b6d4)
  const rightCursor = new HandCursor(0xa78bfa)
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)
  leftCursor.setVisible(false)
  rightCursor.setVisible(false)

  // 3D модели рук
  const leftMesh  = new HandMesh()
  const rightMesh = new HandMesh()
  leftMesh.addToScene(scene.scene)
  rightMesh.addToScene(scene.scene)
  leftMesh.setVisible(false)
  rightMesh.setVisible(false)

  setProgress(35, 'Загрузка MediaPipe...')

  const gesture = new GestureDetector()
  type GR = ReturnType<GestureDetector['detect']>

  let leftG:   GR | null = null
  let rightG:  GR | null = null
  let leftLM:  Landmark[] | null = null
  let rightLM: Landmark[] | null = null
  let handsReady = false
  let isFrontCam = false   // <-- для корректного маппинга NDC

  // ─── Render loop ──────────────────────────────────────────────────────────
  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001

    // NDC для WindowManager
    // Для задней камеры: НЕ отзеркаливаем X (1-x → x)
    const ndcLm = (lm: Landmark) => isFrontCam
      ? { ndcX: (1 - lm.x) * 2 - 1, ndcY: -(lm.y * 2 - 1) }
      : { ndcX:  lm.x       * 2 - 1, ndcY: -(lm.y * 2 - 1) }

    const fingerNDC = [
      leftG  ? ndcLm(leftG.indexTip)  : null,
      rightG ? ndcLm(rightG.indexTip) : null,
    ]

    if (handsReady) winManager.update(time, [leftG, rightG], fingerNDC)

    // Визуализация рук
    const hands = [
      { lm: leftLM,  g: leftG,  cursor: leftCursor,  mesh: leftMesh },
      { lm: rightLM, g: rightG, cursor: rightCursor, mesh: rightMesh },
    ]
    for (const { lm, g, cursor, mesh } of hands) {
      const visible = !!(lm && g)
      cursor.setVisible(visible && handMode === 'skeleton')
      mesh.setVisible(  visible && handMode === '3d')
      if (!visible) continue

      const toWorld = (lmk: Landmark) => landmarkToWorld(lmk, scene.camera, isFrontCam)
      if (handMode === 'skeleton') {
        cursor.updateFromLandmarks(lm!, toWorld, g!.type, g!.pinchStrength, time)
      } else {
        mesh.updateFromLandmarks(lm!, toWorld, g!.type, g!.pinchStrength, time)
      }
    }

    scene.render()
  }
  animate()

  setProgress(50, 'Запрос доступа к камере...')

  // ─── HandTracker ──────────────────────────────────────────────────────────
  const tracker = new HandTracker()
  try {
    await tracker.init(p => {
      const msgs: [number, string][] = [
        [0,'Загрузка MediaPipe...'], [35,'Загрузка библиотеки...'],
        [50,'Инициализация WASM...'],[80,'Запуск камеры...'], [100,'Готово!'],
      ]
      setProgress(50 + p * 0.5, [...msgs].reverse().find(([k]) => p >= k)?.[1] ?? '')
    })

    scene.setupARBackground(tracker.getVideoElement())
    isFrontCam = tracker.isFront()

    tracker.onHands(hands => {
      leftG = null; rightG = null; leftLM = null; rightLM = null
      isFrontCam = tracker.isFront()
      for (const hand of hands) {
        const g = gesture.detect(hand.landmarks)
        // Задняя камера: MediaPipe отдаёт handedness от себя →
        // то что MP считает "Left" = правая рука пользователя
        const side = isFrontCam ? hand.handedness : (hand.handedness === 'Left' ? 'Right' : 'Left')
        if (side === 'Left') { leftG = g; leftLM = hand.landmarks }
        else                 { rightG = g; rightLM = hand.landmarks }
      }
      leftDot.classList.toggle('active',  !!leftG)
      rightDot.classList.toggle('active', !!rightG)
    })

    handsReady = true
    setProgress(100, '✅ Готово!')
    setTimeout(() => loadingScreen.classList.add('hidden'), 400)

  } catch (err: any) {
    console.error('HandTracker error:', err)
    setProgress(100, `⚠️ ${err.message}`)
    if (loaderSub) loaderSub.style.color = '#f87171'
    setTimeout(() => { loadingScreen.classList.add('hidden'); showToast('Трекинг рук недоступен', 5000) }, 3000)
  }

  // ─── CameraPicker ─────────────────────────────────────────────────────────
  cameraPicker = new CameraPicker(tracker, () => {
    scene.setupARBackground(tracker.getVideoElement())
    isFrontCam = tracker.isFront()
  })
  document.getElementById('camera-btn')?.addEventListener('click', () => cameraPicker!.toggle())

  // ─── Стерео / CalibrationPanel ────────────────────────────────────────────
  function ensureCalibPanel(): void {
    if (!calibPanel) {
      const sr = scene.getStereoRenderer()
      if (!sr) return
      calibPanel = new CalibrationPanel(sr, (mode) => { handMode = mode })
    }
  }

  stereoToggleEl.addEventListener('click', () => {
    if (scene.isStereo()) { ensureCalibPanel(); calibPanel?.toggle() }
    else toggleStereo()
  })

  function toggleStereo(): void {
    const on = scene.toggleStereo()
    stereoToggleEl.textContent = on ? '⚙️ Калибровка' : '👓 VR'
    const sr = scene.getStereoRenderer()
    winManager.setStereoCamera(on && sr ? sr.camL : null)
    if (on) { ensureCalibPanel(); try { (screen.orientation as any)?.lock('landscape') } catch {} }
    else    { try { (screen.orientation as any)?.unlock() } catch {} }
  }

  // ─── Автообновление ───────────────────────────────────────────────────────
  const updater = new AutoUpdater(GITHUB_OWNER, GITHUB_REPO, APP_VERSION)
  updater.startAutoCheck(rel => {
    updateBanner.classList.add('show')
    updateBanner.querySelector('span')!.textContent = `🆕 ${rel.tag_name} доступна!`
  })
  updateBtn.addEventListener('click',  () => location.reload())
  dismissBtn.addEventListener('click', () => updateBanner.classList.remove('show'))
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Конвертация ланд-марка MediaPipe → мировые 3D координаты
 *
 * Задняя камера (selfieMode=false):
 *   MediaPipe даёт X: 0=лево кадра, 1=право кадра.
 *   НЕ зеркалируем → ndcX = x*2-1
 *
 * Фронтальная (selfieMode=true):
 *   MediaPipe зеркалирует X внутри → ndcX = (1-x)*2-1
 *
 * Y: image 0=верх, 1=низ → NDC 1=верх, -1=низ → -(y*2-1)
 */
function landmarkToWorld(lm: Landmark, cam: THREE.PerspectiveCamera, isFront: boolean): THREE.Vector3 {
  const ndcX = isFront ? (1 - lm.x) * 2 - 1 : lm.x * 2 - 1
  const ndcY = -(lm.y * 2 - 1)
  const depth = Math.max(1.2, Math.min(4.5, 2.5 - lm.z * 6))
  const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize()
  return cam.position.clone().addScaledVector(dir, depth)
}

function spawnParticles(scene: THREE.Scene): void {
  const count = 50
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pos[i*3]=(Math.random()-.5)*3; pos[i*3+1]=(Math.random()-.5)*3; pos[i*3+2]=-2-Math.random()*2
    col[i*3]=Math.random(); col[i*3+1]=Math.random()*.5; col[i*3+2]=1
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
  const mat = new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true })
  const pts = new THREE.Points(geo, mat)
  scene.add(pts)
  let life = 1.0
  const tick = () => {
    life -= 0.015; mat.opacity = life
    if (life > 0) requestAnimationFrame(tick)
    else { scene.remove(pts); geo.dispose(); mat.dispose() }
  }
  tick()
}

function showToast(msg: string, dur = 3000): void {
  const t = document.createElement('div')
  t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(13,17,23,.95);color:#e6edf3;padding:12px 20px;border-radius:12px;font-family:-apple-system,sans-serif;font-size:.85rem;z-index:9000;border:1px solid rgba(99,102,241,.4);backdrop-filter:blur(12px);max-width:90vw;text-align:center;'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), dur)
}

declare const __APP_VERSION__: string

main().catch(err => {
  console.error('Fatal:', err)
  const sub = document.querySelector('.loader-sub') as HTMLElement
  if (sub) { sub.textContent = `❌ ${err.message}`; sub.style.color = '#f87171' }
})
