/**
 * main.ts — точка входа Mobile XR
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

// ─── Конфигурация ──────────────────────────────────────────────────────────────
const GITHUB_OWNER = 'MihailKashintsev'
const GITHUB_REPO  = 'mobile-xr'
const APP_VERSION  = __APP_VERSION__

// ─── DOM ──────────────────────────────────────────────────────────────────────
const loadingScreen  = document.getElementById('loading-screen')!
const loadProgress   = document.getElementById('load-progress')!
const updateBanner   = document.getElementById('update-banner')!
const updateBtn      = document.getElementById('update-btn')!
const dismissBtn     = document.getElementById('dismiss-btn')!
const leftDot        = document.getElementById('left-dot')!
const rightDot       = document.getElementById('right-dot')!
const stereoToggleEl = document.getElementById('stereo-toggle')!

function setProgress(p: number): void {
  loadProgress.style.width = `${p}%`
}

// ─── Инициализация ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  setProgress(5)

  const appEl = document.getElementById('app')!
  const scene = new SceneManager(appEl)
  setProgress(15)

  const tracker = new HandTracker()
  await tracker.init(p => setProgress(15 + p * 0.7))

  scene.setupARBackground(tracker.getVideoElement())
  setProgress(95)

  const gesture = new GestureDetector()

  // Курсоры рук
  const leftCursor  = new HandCursor(0x06b6d4)
  const rightCursor = new HandCursor(0xa78bfa)
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)

  // ─── UI панели ────────────────────────────────────────────────────────────────
  const mainPanel = new FloatingPanel({
    title: 'Mobile XR',
    position: new THREE.Vector3(0, 0.1, -2.8)
  })

  const btnHello = new FloatingButton({
    label: 'Привет!', color: 0x6366f1,
    position: new THREE.Vector3(-0.35, 0.1, 0.03),
    onClick: () => spawnParticles(scene.scene)
  })
  const btnInfo = new FloatingButton({
    label: 'Инфо', color: 0x0891b2,
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
    onClick: () => calibPanel.open()
  })
  sidePanel.addButton(btnSettings)
  scene.scene.add(sidePanel.group)

  setProgress(100)

  // ─── Калибровочная панель ─────────────────────────────────────────────────────
  // Создаётся после первого включения стерео (нужен StereoRenderer)
  let calibPanel: CalibrationPanel

  function ensureCalibPanel(): void {
    if (!calibPanel) {
      const sr = scene.getStereoRenderer()
      if (sr) calibPanel = new CalibrationPanel(sr)
    }
  }

  // Кнопка в HUD
  stereoToggleEl.addEventListener('click', () => {
    const isStereo = scene.isStereo()
    if (isStereo) {
      // Уже в стерео — открываем калибровку
      ensureCalibPanel()
      calibPanel?.toggle()
    } else {
      toggleStereo()
    }
  })

  // ─── Отслеживание рук ────────────────────────────────────────────────────────
  let leftHandData:  ReturnType<GestureDetector['detect']> | null = null
  let rightHandData: ReturnType<GestureDetector['detect']> | null = null

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

  // ─── Главный цикл ────────────────────────────────────────────────────────────
  const panels = [mainPanel, sidePanel]
  const cursors: [HandCursor, () => ReturnType<GestureDetector['detect']> | null][] = [
    [leftCursor,  () => leftHandData],
    [rightCursor, () => rightHandData],
  ]

  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001

    // Скрываем курсоры в стерео режиме (они мешают)
    const hideCursors = scene.isStereo()

    panels.forEach(p => p.update(time))

    for (const [cursor, getData] of cursors) {
      const data = getData()
      if (!data || hideCursors) { cursor.setVisible(false); continue }
      cursor.setVisible(true)
      const worldPos = landmarkToWorld(data.indexTip, scene.camera)
      cursor.update(worldPos, data.type, data.pinchStrength, time)

      for (const panel of panels) {
        const btn = panel.hitTest(worldPos)
        panel.buttons.forEach(b => b.setHovered(b === btn))
        if (btn && data.type === 'pinch' && data.pinchStrength > 0.8) {
          btn.triggerPress()
        }
      }
    }

    scene.render()
  }
  animate()

  setTimeout(() => loadingScreen.classList.add('hidden'), 500)

  // ─── Авто-обновление ─────────────────────────────────────────────────────────
  const updater = new AutoUpdater(GITHUB_OWNER, GITHUB_REPO, APP_VERSION)
  updater.startAutoCheck(release => {
    updateBanner.classList.add('show')
    const label = updateBanner.querySelector('span')!
    label.textContent = `🆕 Версия ${release.tag_name} доступна!`
  })
  updateBtn.addEventListener('click', () => location.reload())
  dismissBtn.addEventListener('click', () => updateBanner.classList.remove('show'))

  // ─── Функции ─────────────────────────────────────────────────────────────────
  function toggleStereo(): void {
    const isStereo = scene.toggleStereo()
    stereoToggleEl.textContent = isStereo ? '⚙️ Калибровка' : '👓 Cardboard'
    if (isStereo) {
      ensureCalibPanel()
      // Блокируем ориентацию в горизонтальный режим для VR
      try { screen.orientation?.lock('landscape') } catch {}
    } else {
      try { screen.orientation?.unlock() } catch {}
    }
  }
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
  const count = 30
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random()-0.5) * 2
    pos[i*3+1] = (Math.random()-0.5) * 2
    pos[i*3+2] = -2 - Math.random() * 2
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({ color: 0x6366f1, size: 0.04, transparent: true })
  const pts = new THREE.Points(geo, mat)
  scene.add(pts)
  let life = 1.0
  const tick = () => {
    life -= 0.02; mat.opacity = life
    if (life > 0) requestAnimationFrame(tick)
    else scene.remove(pts)
  }
  tick()
}

function showInfo(): void {
  console.log(`Mobile XR v${APP_VERSION}`)
  alert(`Mobile XR v${APP_VERSION}\nWebXR Hand Tracking PWA`)
}

declare const __APP_VERSION__: string

main().catch(err => {
  console.error('Init error:', err)
  const sub = document.querySelector('.loader-sub')!
  if (sub) sub.textContent = `❌ ${err.message}`
})
