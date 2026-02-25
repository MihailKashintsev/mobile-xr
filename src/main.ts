/**
 * main.ts — точка входа Mobile XR
 */

import { HandTracker } from './xr/HandTracker'
import { GestureDetector } from './xr/GestureDetector'
import { SceneManager } from './xr/SceneManager'
import { FloatingPanel } from './ui/FloatingPanel'
import { FloatingButton } from './ui/FloatingButton'
import { HandCursor } from './ui/HandCursor'
import { AutoUpdater } from './updater/AutoUpdater'
import * as THREE from 'three'

// ─── Конфигурация ──────────────────────────────────────────────────────────────
const GITHUB_OWNER = 'MihailKashintsev'  // <-- заменить!
const GITHUB_REPO  = 'mobile-xr'
const APP_VERSION  = __APP_VERSION__

// ─── UI элементы ──────────────────────────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen')!
const loadProgress  = document.getElementById('load-progress')!
const updateBanner  = document.getElementById('update-banner')!
const updateBtn     = document.getElementById('update-btn')!
const dismissBtn    = document.getElementById('dismiss-btn')!
const leftDot       = document.getElementById('left-dot')!
const rightDot      = document.getElementById('right-dot')!
const stereoToggle  = document.getElementById('stereo-toggle')!

function setProgress(p: number): void {
  loadProgress.style.width = `${p}%`
}

// ─── Инициализация ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  setProgress(5)

  // Сцена
  const appEl = document.getElementById('app')!
  const scene = new SceneManager(appEl)
  setProgress(15)

  // Отслеживание рук
  const tracker = new HandTracker()
  await tracker.init(p => setProgress(15 + p * 0.7))

  // AR фон (видео с камеры)
  scene.setupARBackground(tracker.getVideoElement())
  setProgress(95)

  // Детектор жестов
  const gesture = new GestureDetector()

  // Курсоры рук
  const leftCursor  = new HandCursor(0x06b6d4)   // cyan
  const rightCursor = new HandCursor(0xa78bfa)    // violet
  leftCursor.addToScene(scene.scene)
  rightCursor.addToScene(scene.scene)

  // ─── Создание UI панелей ─────────────────────────────────────────────────────

  // Главная панель
  const mainPanel = new FloatingPanel({
    title: 'Mobile XR',
    position: new THREE.Vector3(0, 0.1, -2.8)
  })

  const btnHello = new FloatingButton({
    label: 'Привет!',
    color: 0x6366f1,
    position: new THREE.Vector3(-0.35, 0.1, 0.03),
    onClick: () => spawnParticles(scene.scene)
  })
  const btnInfo = new FloatingButton({
    label: 'Инфо',
    color: 0x0891b2,
    position: new THREE.Vector3(0.35, 0.1, 0.03),
    onClick: () => showInfo()
  })
  const btnStereo = new FloatingButton({
    label: '👓 Cardboard',
    color: 0x059669,
    width: 0.8,
    position: new THREE.Vector3(0, -0.2, 0.03),
    onClick: () => toggleStereo()
  })

  mainPanel.addButton(btnHello)
  mainPanel.addButton(btnInfo)
  mainPanel.addButton(btnStereo)
  scene.scene.add(mainPanel.group)

  // Вторая панель — справа
  const sidePanel = new FloatingPanel({
    position: new THREE.Vector3(1.6, 0, -2.5)
  })
  sidePanel.group.rotation.y = -0.3

  const btnSettings = new FloatingButton({
    label: '⚙ Настройки',
    color: 0x7c3aed,
    position: new THREE.Vector3(0, 0.1, 0.03),
    onClick: () => console.log('Settings')
  })
  sidePanel.addButton(btnSettings)
  scene.scene.add(sidePanel.group)

  setProgress(100)

  // ─── Обработка результатов отслеживания ──────────────────────────────────────
  let leftHandData:  ReturnType<GestureDetector['detect']> | null = null
  let rightHandData: ReturnType<GestureDetector['detect']> | null = null

  tracker.onHands(hands => {
    leftHandData = null
    rightHandData = null

    for (const hand of hands) {
      const g = gesture.detect(hand.landmarks)
      if (hand.handedness === 'Left')  leftHandData  = g
      else                             rightHandData = g
    }

    leftDot.classList.toggle('active',  !!leftHandData)
    rightDot.classList.toggle('active', !!rightHandData)
  })

  // ─── Главный цикл ─────────────────────────────────────────────────────────────
  const panels = [mainPanel, sidePanel]
  const cursors: [HandCursor, () => ReturnType<GestureDetector['detect']> | null][] = [
    [leftCursor,  () => leftHandData],
    [rightCursor, () => rightHandData],
  ]

  function animate(): void {
    requestAnimationFrame(animate)
    const time = performance.now() * 0.001

    // Обновляем панели
    panels.forEach(p => p.update(time))

    // Обновляем курсоры и проверяем взаимодействия
    for (const [cursor, getData] of cursors) {
      const data = getData()
      if (!data) { cursor.setVisible(false); continue }
      cursor.setVisible(true)

      // Конвертируем нормализованные координаты → 3D мировые
      const worldPos = landmarkToWorld(data.indexTip, scene.camera)
      cursor.update(worldPos, data.type, data.pinchStrength, time)

      // Проверяем попадание в кнопки
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

  // Скрываем загрузку
  setTimeout(() => loadingScreen.classList.add('hidden'), 500)

  // ─── Stereo toggle ─────────────────────────────────────────────────────────────
  let stereoActive = false
  function toggleStereo(): void {
    stereoActive = scene.toggleStereo()
    stereoToggle.textContent = stereoActive ? '📱 Моно' : '👓 Cardboard'
  }
  stereoToggle.addEventListener('click', toggleStereo)

  // ─── Автообновление ────────────────────────────────────────────────────────────
  const updater = new AutoUpdater(GITHUB_OWNER, GITHUB_REPO, APP_VERSION)
  updater.startAutoCheck(release => {
    updateBanner.classList.add('show')
    const label = updateBanner.querySelector('span')!
    label.textContent = `🆕 Версия ${release.tag_name} доступна!`
  })

  updateBtn.addEventListener('click', () => location.reload())
  dismissBtn.addEventListener('click', () => updateBanner.classList.remove('show'))
}

// ─── Вспомогательные функции ───────────────────────────────────────────────────

/**
 * Конвертирует MediaPipe ланд-марк (0..1) → 3D точку в мировых координатах
 */
function landmarkToWorld(lm: { x: number; y: number; z: number }, camera: THREE.PerspectiveCamera): THREE.Vector3 {
  // NDC координаты (−1..1)
  const ndcX = (1 - lm.x) * 2 - 1   // зеркало по X (selfie)
  const ndcY = -(lm.y * 2 - 1)

  // Unproject на заданную глубину
  const depth = Math.max(-1.5, Math.min(-4.5, -2.5 + lm.z * 8))
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5)
  vec.unproject(camera)
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
    life -= 0.02
    mat.opacity = life
    if (life > 0) requestAnimationFrame(tick)
    else scene.remove(pts)
  }
  tick()
}

function showInfo(): void {
  console.log(`Mobile XR v${APP_VERSION} — WebXR Hand Tracking PWA`)
}

// ─── Объявление глобальной переменной версии (инжектируется Vite) ──────────────
declare const __APP_VERSION__: string

// ─── Запуск ───────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error('Init error:', err)
  const sub = document.querySelector('.loader-sub')!
  sub.textContent = `❌ ${err.message}`
  sub.classList.add('error')
})
