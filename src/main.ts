import { HandTracker } from './xr/HandTracker'
import type { Landmark } from './xr/HandTracker'
import { GestureDetector } from './xr/GestureDetector'
import { SceneManager } from './xr/SceneManager'
import { XRWindow, WindowManager } from './ui/WindowManager'
import { HandCursor } from './ui/HandCursor'
import { CalibrationPanel } from './ui/CalibrationPanel'
import { CameraPicker } from './ui/CameraPicker'
import { AutoUpdater } from './updater/AutoUpdater'
import * as THREE from 'three'

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
  setProgress(10, 'Инициализация 3D сцены...')
  const appEl = document.getElementById('app')!
  const scene = new SceneManager(appEl)

  const winManager = new WindowManager(scene.scene, scene.camera)

  let cameraPicker: CameraPicker  | null = null
  let calibPanel:   CalibrationPanel | null = null

  const mainWin = new XRWindow({
    title: 'Mobile XR', icon: '🥽',
    position: new THREE.Vector3(-0.85, 0.15, -2.6),
    content: { buttons: [
      { label: '✨ Частицы', color: 0x6366f1, onClick: () => spawnParticles(scene.scene) },
      { label: '📷 Камера',  color: 0x0891b2, onClick: () => cameraPicker?.toggle() },
      { label: '👓 VR режим',color: 0x059669, onClick: () => toggleStereo() },
      { label: '⚙ Настройки',color: 0x7c3aed, onClick: () => { ensureCalibPanel(); calibPanel?.open() } },
    ]}
  })
  winManager.add(mainWin)

  const infoWin = new XRWindow({
    title: 'Инфо', icon: 'ℹ️',
    width: 1.25, height: 0.90,
    position: new THREE.Vector3(0.95, 0.05, -2.4),
    content: { buttons: [
      { label: `📦 v${APP_VERSION}`,  color: 0x374151, onClick: () => showToast(`Mobile XR v${APP_VERSION}`) },
      { label: '🐙 GitHub',           color: 0x24292e, onClick: () => window.open(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`, '_blank') },
      { label: '🔄 Перезагрузить',    color: 0x1d4ed8, onClick: () => location.reload() },
    ]}
  })
  winManager.add(infoWin)

  // Курсоры — полные скелеты рук
  const leftCursor  = new HandCursor(0x06b6d4)
  const rightCursor = new HandCursor(0xa78bfa)
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)
  leftCursor.setVisible(false)
  rightCursor.setVisible(false)

  setProgress(35, 'Загрузка MediaPipe с CDN...')

  const gesture = new GestureDetector()
  type GR = ReturnType<GestureDetector['detect']>

  // Текущее состояние рук
  let leftG:  GR | null = null
  let rightG: GR | null = null
  let leftLM:  Landmark[] | null = null
  let rightLM: Landmark[] | null = null
  let handsReady = false

  // ─── Рендер-цикл ──────────────────────────────────────────────────────────
  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001

    // NDC кончиков указательных пальцев для WindowManager
    const fingerNDC = [
      leftG  ? { ndcX: (1 - leftG.indexTip.x)  * 2 - 1, ndcY: -(leftG.indexTip.y  * 2 - 1) } : null,
      rightG ? { ndcX: (1 - rightG.indexTip.x) * 2 - 1, ndcY: -(rightG.indexTip.y * 2 - 1) } : null,
    ]

    if (handsReady) {
      winManager.update(time, [leftG, rightG], fingerNDC)
    }

    // Полная визуализация рук
    // Руки показываем всегда — и в обычном режиме и в VR
    ;[
      { cursor: leftCursor,  lm: leftLM,  g: leftG  },
      { cursor: rightCursor, lm: rightLM, g: rightG },
    ].forEach(({ cursor, lm, g }) => {
      if (!lm || !g) { cursor.setVisible(false); return }
      cursor.updateFromLandmarks(
        lm,
        (lmk) => landmarkToWorld(lmk, scene.camera),
        g.type, g.pinchStrength, time
      )
    })

    scene.render()
  }
  animate()

  setProgress(50, 'Запрос доступа к камере...')

  // ─── HandTracker ──────────────────────────────────────────────────────────
  const tracker = new HandTracker()
  try {
    await tracker.init(p => {
      const msgs: [number, string][] = [
        [0,  'Загрузка MediaPipe...'],
        [35, 'Загрузка библиотеки рук...'],
        [50, 'Инициализация WASM...'],
        [80, 'Запуск камеры...'],
        [100,'Готово!'],
      ]
      const msg = [...msgs].reverse().find(([k]) => p >= k)?.[1] ?? ''
      setProgress(50 + p * 0.5, msg)
    })

    scene.setupARBackground(tracker.getVideoElement())

    tracker.onHands(hands => {
      leftG = null; rightG = null
      leftLM = null; rightLM = null
      for (const hand of hands) {
        const g = gesture.detect(hand.landmarks)
        if (hand.handedness === 'Left') {
          leftG = g; leftLM = hand.landmarks
        } else {
          rightG = g; rightLM = hand.landmarks
        }
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
    setTimeout(() => {
      loadingScreen.classList.add('hidden')
      showToast('Отслеживание рук недоступно', 5000)
    }, 3000)
  }

  // ─── CameraPicker — создаём всегда после init (даже если были ошибки) ────────
  cameraPicker = new CameraPicker(tracker, () => {
    scene.setupARBackground(tracker.getVideoElement())
  })
  document.getElementById('camera-btn')?.addEventListener('click', () => cameraPicker!.toggle())

  // ─── Стерео / калибровка ──────────────────────────────────────────────────
  function ensureCalibPanel(): void {
    if (!calibPanel) { const sr = scene.getStereoRenderer(); if (sr) calibPanel = new CalibrationPanel(sr) }
  }

  stereoToggleEl.addEventListener('click', () => {
    if (scene.isStereo()) { ensureCalibPanel(); calibPanel?.toggle() }
    else toggleStereo()
  })

  function toggleStereo(): void {
    const on = scene.toggleStereo()
    stereoToggleEl.textContent = on ? '⚙️ Калибровка' : '👓 VR'
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

function landmarkToWorld(lm: Landmark, cam: THREE.PerspectiveCamera): THREE.Vector3 {
  const ndcX = (1 - lm.x) * 2 - 1
  const ndcY = -(lm.y * 2 - 1)
  // z из MediaPipe: 0 у ладони, отрицательный вперёд; масштабируем в глубину сцены
  const depth = Math.max(1.2, Math.min(4.5, 2.5 - lm.z * 6))
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam)
  return cam.position.clone().addScaledVector(vec.sub(cam.position).normalize(), depth)
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
  t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(13,17,23,0.95);color:#e6edf3;padding:12px 20px;border-radius:12px;font-family:-apple-system,sans-serif;font-size:0.85rem;z-index:9000;border:1px solid rgba(99,102,241,0.4);backdrop-filter:blur(12px);max-width:90vw;text-align:center;'
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
