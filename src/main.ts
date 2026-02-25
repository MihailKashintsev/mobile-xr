/**
 * main.ts — Mobile XR точка входа
 * Сцена грузится сразу, MediaPipe — в фоне нон-блокирующим образом
 */

import { HandTracker } from './xr/HandTracker'
import { GestureDetector } from './xr/GestureDetector'
import { SceneManager } from './xr/SceneManager'
import { FloatingPanel } from './ui/FloatingPanel'
import { FloatingButton } from './ui/FloatingButton'
import { HandCursor } from './ui/HandCursor'
import { CalibrationPanel } from './ui/CalibrationPanel'
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
  // ── 1. Сцена (мгновенно) ─────────────────────────────────────────────────
  setProgress(10, 'Инициализация 3D сцены...')
  const appEl = document.getElementById('app')!
  const scene = new SceneManager(appEl)

  // ── 2. Курсоры рук ───────────────────────────────────────────────────────
  const leftCursor  = new HandCursor(0x06b6d4)
  const rightCursor = new HandCursor(0xa78bfa)
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)
  leftCursor.setVisible(false)
  rightCursor.setVisible(false)

  // ── 3. UI панели ─────────────────────────────────────────────────────────
  setProgress(20, 'Создание интерфейса...')

  const mainPanel = new FloatingPanel({
    title: 'Mobile XR',
    position: new THREE.Vector3(0, 0.1, -2.8)
  })
  const btnHello = new FloatingButton({
    label: '✨ Частицы', color: 0x6366f1,
    position: new THREE.Vector3(-0.35, 0.1, 0.03),
    onClick: () => spawnParticles(scene.scene)
  })
  const btnInfo = new FloatingButton({
    label: 'ℹ Инфо', color: 0x0891b2,
    position: new THREE.Vector3(0.35, 0.1, 0.03),
    onClick: () => showInfo()
  })
  const btnStereo = new FloatingButton({
    label: '👓 VR режим', color: 0x059669, width: 0.8,
    position: new THREE.Vector3(0, -0.2, 0.03),
    onClick: () => toggleStereo()
  })
  mainPanel.addButton(btnHello)
  mainPanel.addButton(btnInfo)
  mainPanel.addButton(btnStereo)
  scene.scene.add(mainPanel.group)

  const sidePanel = new FloatingPanel({ position: new THREE.Vector3(1.6, 0, -2.5) })
  sidePanel.group.rotation.y = -0.3
  const btnSettings = new FloatingButton({
    label: '⚙ Настройки', color: 0x7c3aed,
    position: new THREE.Vector3(0, 0.1, 0.03),
    onClick: () => calibPanel?.open()
  })
  sidePanel.addButton(btnSettings)
  scene.scene.add(sidePanel.group)

  setProgress(35, 'Загрузка MediaPipe с CDN...')

  // ── 4. Запускаем рендер ДО загрузки MediaPipe ─────────────────────────────
  const gesture = new GestureDetector()
  let leftHandData:  ReturnType<GestureDetector['detect']> | null = null
  let rightHandData: ReturnType<GestureDetector['detect']> | null = null
  let handTrackingReady = false

  const panels = [mainPanel, sidePanel]

  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001
    panels.forEach(p => p.update(time))

    if (handTrackingReady) {
      const hideCursors = scene.isStereo()
      const cursors: [HandCursor, () => ReturnType<GestureDetector['detect']> | null][] = [
        [leftCursor,  () => leftHandData],
        [rightCursor, () => rightHandData],
      ]
      for (const [cursor, getData] of cursors) {
        const data = getData()
        if (!data || hideCursors) { cursor.setVisible(false); continue }
        cursor.setVisible(true)
        const worldPos = landmarkToWorld(data.indexTip, scene.camera)
        cursor.update(worldPos, data.type, data.pinchStrength, time)
        for (const panel of panels) {
          const btn = panel.hitTest(worldPos)
          panel.buttons.forEach(b => b.setHovered(b === btn))
          if (btn && data.type === 'pinch' && data.pinchStrength > 0.8) btn.triggerPress()
        }
      }
    }
    scene.render()
  }
  animate()

  // ── 5. Убираем лоадер — сцена уже видна ──────────────────────────────────
  setProgress(50, 'Запрос доступа к камере...')

  // ── 6. Инициализируем HandTracker (может занять 5-15 сек) ─────────────────
  const tracker = new HandTracker()
  try {
    await tracker.init(p => {
      const mapped = 50 + p * 0.5
      const msgs: Record<number, string> = {
        10: 'Загрузка MediaPipe...',
        35: 'Загрузка библиотеки рук...',
        50: 'Инициализация модели...',
        60: 'Загрузка WASM модели...',
        80: 'Запуск камеры...',
        100: 'Готово!'
      }
      const key = Object.keys(msgs).map(Number).reverse().find(k => p >= k) ?? 10
      setProgress(mapped, msgs[key])
    })

    // Подключаем AR фон
    scene.setupARBackground(tracker.getVideoElement())

    tracker.onHands(hands => {
      leftHandData = null
      rightHandData = null
      for (const hand of hands) {
        const g = gesture.detect(hand.landmarks)
        if (hand.handedness === 'Left') leftHandData = g
        else rightHandData = g
      }
      leftDot.classList.toggle('active',  !!leftHandData)
      rightDot.classList.toggle('active', !!rightHandData)
    })

    handTrackingReady = true
    setProgress(100, '✅ Готово!')
    setTimeout(() => loadingScreen.classList.add('hidden'), 400)

  } catch (err: any) {
    // Ошибка MediaPipe — показываем сцену без отслеживания рук
    console.error('HandTracker error:', err)
    setProgress(100, `⚠️ ${err.message}`)
    if (loaderSub) loaderSub.style.color = '#f87171'

    // Через 3 сек всё равно показываем сцену
    setTimeout(() => {
      loadingScreen.classList.add('hidden')
      showToast('Отслеживание рук недоступно. Используй кнопки на экране.', 5000)
    }, 3000)
  }

  // ── 7. Стерео / калибровка ────────────────────────────────────────────────
  let calibPanel: CalibrationPanel | null = null

  function ensureCalibPanel(): void {
    if (!calibPanel) {
      const sr = scene.getStereoRenderer()
      if (sr) calibPanel = new CalibrationPanel(sr)
    }
  }

  stereoToggleEl.addEventListener('click', () => {
    if (scene.isStereo()) {
      ensureCalibPanel()
      calibPanel?.toggle()
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

  // ── 8. Автообновление ─────────────────────────────────────────────────────
  const updater = new AutoUpdater(GITHUB_OWNER, GITHUB_REPO, APP_VERSION)
  updater.startAutoCheck(release => {
    updateBanner.classList.add('show')
    const label = updateBanner.querySelector('span')!
    label.textContent = `🆕 Версия ${release.tag_name} доступна!`
  })
  updateBtn.addEventListener('click', () => location.reload())
  dismissBtn.addEventListener('click', () => updateBanner.classList.remove('show'))
}

// ─── Вспомогательные ──────────────────────────────────────────────────────────

function landmarkToWorld(lm: { x: number; y: number; z: number }, camera: THREE.PerspectiveCamera): THREE.Vector3 {
  const ndcX = (1 - lm.x) * 2 - 1
  const ndcY = -(lm.y * 2 - 1)
  const depth = Math.max(-1.5, Math.min(-4.5, -2.5 + lm.z * 8))
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera)
  const dir = vec.sub(camera.position).normalize()
  return camera.position.clone().addScaledVector(dir, Math.abs(depth))
}

function spawnParticles(scene: THREE.Scene): void {
  const count = 40
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random()-0.5) * 3
    pos[i*3+1] = (Math.random()-0.5) * 3
    pos[i*3+2] = -2 - Math.random() * 2
    colors[i*3]   = Math.random()
    colors[i*3+1] = Math.random() * 0.5
    colors[i*3+2] = 1
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
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

function showInfo(): void {
  showToast(`Mobile XR v${APP_VERSION} — WebXR Hand Tracking PWA`, 3000)
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
  console.error('Fatal init error:', err)
  if (loaderSub) {
    loaderSub.textContent = `❌ ${err.message}`
    ;(loaderSub as HTMLElement).style.color = '#f87171'
  }
})

const loaderSub = document.querySelector('.loader-sub') as HTMLElement
