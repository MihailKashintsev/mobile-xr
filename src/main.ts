/**
 * main.ts — Mobile XR точка входа
 */

import { HandTracker } from './xr/HandTracker'
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

// ─── DOM ──────────────────────────────────────────────────────────────────────
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

  // ─── Менеджер окон ─────────────────────────────────────────────────────────
  const winManager = new WindowManager(scene.scene, scene.camera)

  // Главное окно
  const mainWin = new XRWindow({
    title: 'Mobile XR',
    icon: '🥽',
    position: new THREE.Vector3(-0.8, 0.2, -2.6),
    content: {
      type: 'buttons',
      buttons: [
        { label: '✨ Частицы', color: 0x6366f1, onClick: () => spawnParticles(scene.scene) },
        { label: '📷 Камера',  color: 0x0891b2, onClick: () => cameraPicker?.toggle() },
        { label: '👓 VR режим',color: 0x059669, onClick: () => toggleStereo() },
        { label: '⚙ Настройки',color: 0x7c3aed, onClick: () => { ensureCalibPanel(); calibPanel?.open() } },
      ]
    }
  })
  winManager.addWindow(mainWin)

  // Второе окно — информация
  const infoWin = new XRWindow({
    title: 'Информация',
    icon: 'ℹ️',
    width: 1.3,
    height: 0.95,
    position: new THREE.Vector3(0.9, 0.1, -2.4),
    content: {
      type: 'buttons',
      buttons: [
        { label: `v${APP_VERSION}`,       color: 0x374151, onClick: () => showToast(`Mobile XR v${APP_VERSION}`) },
        { label: '📖 GitHub',             color: 0x24292e, onClick: () => window.open(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`, '_blank') },
        { label: '🔄 Обновить',           color: 0x1d4ed8, onClick: () => location.reload() },
      ]
    }
  })
  winManager.addWindow(infoWin)

  // ─── Курсоры рук ──────────────────────────────────────────────────────────
  const leftCursor  = new HandCursor(0x06b6d4)
  const rightCursor = new HandCursor(0xa78bfa)
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)
  leftCursor.setVisible(false)
  rightCursor.setVisible(false)

  setProgress(35, 'Загрузка MediaPipe с CDN...')

  // ─── Детектор жестов ──────────────────────────────────────────────────────
  const gesture = new GestureDetector()
  type GR = ReturnType<GestureDetector['detect']>
  let leftGesture:  GR | null = null
  let rightGesture: GR | null = null
  let handTrackingReady = false

  // ─── Рендер-цикл (стартует сразу, без ожидания камеры) ────────────────────
  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001

    // Конвертируем кончики пальцев в мировые координаты
    const indexTips: (THREE.Vector3 | null)[] = [
      leftGesture  ? landmarkToWorld(leftGesture.indexTip,  scene.camera) : null,
      rightGesture ? landmarkToWorld(rightGesture.indexTip, scene.camera) : null,
    ]
    const gestures = [leftGesture, rightGesture]

    // Обновляем оконный менеджер
    if (handTrackingReady) {
      winManager.update(time, gestures, indexTips)
    }

    // Курсоры
    const hideCursors = scene.isStereo()
    const cursors = [
      { cursor: leftCursor,  g: leftGesture,  tip: indexTips[0] },
      { cursor: rightCursor, g: rightGesture, tip: indexTips[1] },
    ]
    for (const { cursor, g, tip } of cursors) {
      if (!g || !tip || hideCursors) { cursor.setVisible(false); continue }
      cursor.setVisible(true)
      cursor.update(tip, g.type, g.pinchStrength, time)
    }

    scene.render()
  }
  animate()

  setProgress(50, 'Запрос доступа к камере...')

  // ─── HandTracker (нон-блокирующий) ────────────────────────────────────────
  const tracker = new HandTracker()
  let cameraPicker: CameraPicker | null = null

  try {
    await tracker.init(p => {
      const msgs: [number, string][] = [
        [10,  'Загрузка MediaPipe...'],
        [35,  'Загрузка библиотеки рук...'],
        [50,  'Инициализация WASM модели...'],
        [60,  'Загрузка весов модели...'],
        [80,  'Запуск камеры...'],
        [100, 'Готово!'],
      ]
      const msg = [...msgs].reverse().find(([k]) => p >= k)?.[1] ?? ''
      setProgress(50 + p * 0.5, msg)
    })

    scene.setupARBackground(tracker.getVideoElement())

    tracker.onHands(hands => {
      leftGesture  = null
      rightGesture = null
      for (const hand of hands) {
        const g = gesture.detect(hand.landmarks)
        if (hand.handedness === 'Left') leftGesture  = g
        else                           rightGesture = g
      }
      leftDot.classList.toggle('active',  !!leftGesture)
      rightDot.classList.toggle('active', !!rightGesture)
    })

    handTrackingReady = true
    setProgress(100, '✅ Готово!')
    setTimeout(() => loadingScreen.classList.add('hidden'), 400)

    // Пикер камер
    cameraPicker = new CameraPicker(tracker, () => {
      scene.setupARBackground(tracker.getVideoElement())
    })
    document.getElementById('camera-btn')?.addEventListener('click', () => cameraPicker!.toggle())

  } catch (err: any) {
    console.error('HandTracker error:', err)
    setProgress(100, `⚠️ ${err.message}`)
    if (loaderSub) loaderSub.style.color = '#f87171'
    setTimeout(() => {
      loadingScreen.classList.add('hidden')
      showToast('Отслеживание рук недоступно. Используй кнопки на экране.', 5000)
    }, 3000)
  }

  // ─── Стерео / калибровка ──────────────────────────────────────────────────
  let calibPanel: CalibrationPanel | null = null

  function ensureCalibPanel(): void {
    if (!calibPanel) {
      const sr = scene.getStereoRenderer()
      if (sr) calibPanel = new CalibrationPanel(sr)
    }
  }

  stereoToggleEl.addEventListener('click', () => {
    if (scene.isStereo()) {
      ensureCalibPanel(); calibPanel?.toggle()
    } else {
      toggleStereo()
    }
  })

  function toggleStereo(): void {
    const isStereo = scene.toggleStereo()
    stereoToggleEl.textContent = isStereo ? '⚙️ Калибровка' : '👓 VR'
    if (isStereo) {
      ensureCalibPanel()
      try { (screen.orientation as any)?.lock('landscape') } catch {}
    } else {
      try { (screen.orientation as any)?.unlock() } catch {}
    }
  }

  // ─── Автообновление ───────────────────────────────────────────────────────
  const updater = new AutoUpdater(GITHUB_OWNER, GITHUB_REPO, APP_VERSION)
  updater.startAutoCheck(release => {
    updateBanner.classList.add('show')
    const label = updateBanner.querySelector('span')!
    label.textContent = `🆕 Версия ${release.tag_name} доступна!`
  })
  updateBtn.addEventListener('click', () => location.reload())
  dismissBtn.addEventListener('click', () => updateBanner.classList.remove('show'))
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function landmarkToWorld(lm: { x: number; y: number; z: number }, camera: THREE.PerspectiveCamera): THREE.Vector3 {
  const ndcX = (1 - lm.x) * 2 - 1
  const ndcY = -(lm.y * 2 - 1)
  const depth = Math.max(-1.5, Math.min(-4.5, -2.5 + lm.z * 8))
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera)
  const dir = vec.sub(camera.position).normalize()
  return camera.position.clone().addScaledVector(dir, Math.abs(depth))
}

function spawnParticles(scene: THREE.Scene): void {
  const count = 50
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random()-0.5)*3; pos[i*3+1] = (Math.random()-0.5)*3; pos[i*3+2] = -2 - Math.random()*2
    col[i*3] = Math.random(); col[i*3+1] = Math.random()*0.5; col[i*3+2] = 1
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

function showToast(msg: string, duration = 3000): void {
  const t = document.createElement('div')
  t.style.cssText = `
    position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
    background:rgba(30,30,50,0.95);color:#fff;padding:12px 20px;
    border-radius:12px;font-family:-apple-system,sans-serif;font-size:0.85rem;
    z-index:9000;border:1px solid rgba(99,102,241,0.4);
    backdrop-filter:blur(12px);max-width:90vw;text-align:center;
  `
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), duration)
}

declare const __APP_VERSION__: string

main().catch(err => {
  console.error('Fatal:', err)
  const sub = document.querySelector('.loader-sub') as HTMLElement
  if (sub) { sub.textContent = `❌ ${err.message}`; sub.style.color = '#f87171' }
})
