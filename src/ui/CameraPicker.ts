/**
 * CameraPicker — выдвижная панель выбора камеры
 * Работает независимо от состояния HandTracker
 */
import type { HandTracker, CameraInfo } from '../xr/HandTracker'

export class CameraPicker {
  private tracker: HandTracker
  private onSwitch: () => void
  private panel: HTMLElement
  private visible = false

  constructor(tracker: HandTracker, onSwitch: () => void) {
    this.tracker = tracker
    this.onSwitch = onSwitch
    this.panel = this.createPanel()
    document.body.appendChild(this.panel)
  }

  toggle(): void { this.visible ? this.close() : this.open() }

  async open(): Promise<void> {
    this.visible = true
    this.panel.style.display = 'flex'
    // Небольшая задержка для анимации
    requestAnimationFrame(() => this.panel.classList.add('open'))
    await this.refreshList()
  }

  close(): void {
    this.visible = false
    this.panel.classList.remove('open')
    setTimeout(() => { if (!this.visible) this.panel.style.display = 'none' }, 300)
  }

  private async refreshList(): Promise<void> {
    const list = this.panel.querySelector('#cp-list')!
    list.innerHTML = '<div class="cp-loading">🔍 Поиск камер...</div>'

    let cameras: CameraInfo[] = []
    try {
      cameras = await this.tracker.getCameras()
    } catch {
      list.innerHTML = '<div class="cp-msg">Не удалось получить список камер</div>'
      return
    }

    if (!cameras.length) {
      list.innerHTML = '<div class="cp-msg">Камеры не найдены</div>'
      return
    }

    const currentId = this.tracker.getCurrentDeviceId()
    list.innerHTML = ''

    for (const cam of cameras) {
      const btn = document.createElement('button')
      btn.className = 'cp-item' + (cam.deviceId === currentId ? ' active' : '')

      const icon = cam.facing === 'user' ? '🤳'
        : cam.facing === 'environment' ? '📷' : '📸'
      const label = cam.facing === 'user' ? 'Фронтальная'
        : cam.facing === 'environment' ? 'Задняя' : 'Камера'
      const name = cam.label.length > 38 ? cam.label.slice(0, 38) + '…' : cam.label

      btn.innerHTML = `
        <span class="cp-icon">${icon}</span>
        <span class="cp-info">
          <span class="cp-name">${name}</span>
          <span class="cp-label">${label}</span>
        </span>
        ${cam.deviceId === currentId ? '<span class="cp-check">✓</span>' : ''}
      `

      btn.addEventListener('click', async () => {
        if (btn.classList.contains('switching')) return
        btn.classList.add('switching')
        list.querySelectorAll('.cp-item').forEach(el => {
          el.classList.remove('active')
          el.querySelector('.cp-check')?.remove()
        })
        btn.classList.add('active')
        const check = document.createElement('span')
        check.className = 'cp-check'; check.textContent = '✓'
        btn.appendChild(check)
        try {
          await this.tracker.switchCamera(cam.deviceId)
          this.onSwitch()
          setTimeout(() => this.close(), 400)
        } catch (e: any) {
          btn.classList.remove('switching', 'active')
          btn.querySelector('.cp-check')?.remove()
          const err = document.createElement('div')
          err.className = 'cp-err'
          err.textContent = `Ошибка: ${e.message}`
          list.appendChild(err)
          setTimeout(() => err.remove(), 3000)
        }
      })

      list.appendChild(btn)
    }
  }

  private createPanel(): HTMLElement {
    const style = document.createElement('style')
    style.textContent = `
      #camera-picker {
        display: none; position: fixed; inset: 0; z-index: 8000;
        align-items: flex-end; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #camera-picker.open .cp-backdrop { opacity: 1 }
      #camera-picker.open .cp-sheet { transform: translateY(0) }

      .cp-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
        opacity: 0; transition: opacity .3s;
      }
      .cp-sheet {
        display: flex; flex-direction: column;
        position: relative; z-index: 1;
        width: 100%; max-width: 480px; max-height: 80vh;
        background: #111827; border-radius: 20px 20px 0 0;
        padding: 0 0 calc(16px + env(safe-area-inset-bottom));
        border-top: 1px solid rgba(255,255,255,.08);
        box-shadow: 0 -8px 40px rgba(0,0,0,.7);
        transform: translateY(100%); transition: transform .3s cubic-bezier(.32,.72,0,1);
        overflow-y: hidden;
      }
      .cp-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 18px 20px 12px; border-bottom: 1px solid rgba(255,255,255,.06);
        position: sticky; top: 0; background: #111827; z-index: 1;
      }
      .cp-title { font-size: 1rem; font-weight: 700; color: #f9fafb; }
      .cp-close {
        width: 30px; height: 30px; border-radius: 50%; border: none;
        background: rgba(255,255,255,.1); color: #9ca3af;
        font-size: .9rem; cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      #cp-list { padding: 12px 16px; overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; min-height: 0; }
      .cp-loading, .cp-msg {
        text-align: center; padding: 24px; color: #6b7280; font-size: .9rem;
      }
      .cp-item {
        width: 100%; display: flex; align-items: center; gap: 12px;
        background: #1f2937; border: 1px solid rgba(255,255,255,.06);
        border-radius: 12px; padding: 14px 16px; margin-bottom: 8px;
        cursor: pointer; color: inherit; text-align: left;
        transition: background .15s, border-color .15s; position: relative;
      }
      .cp-item.active  { background: #1e1b4b; border-color: #6366f1; }
      .cp-item.switching { opacity: .5; pointer-events: none; }
      .cp-item:active  { background: #2d3748; }
      .cp-icon  { font-size: 1.8rem; flex-shrink: 0; }
      .cp-info  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .cp-name  { font-size: .85rem; color: #e5e7eb; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cp-label { font-size: .72rem; color: #6b7280; }
      .cp-check { color: #6366f1; font-weight: 700; font-size: 1.1rem; flex-shrink: 0; }
      .cp-hint  { font-size: .72rem; color: #4b5563; text-align: center; padding: 4px 16px 8px; flex-shrink: 0; }
      .cp-err   { background: #7f1d1d; color: #fca5a5; border-radius: 8px; padding: 10px 14px; font-size: .82rem; margin-top: 8px; text-align: center; }
    `
    document.head.appendChild(style)

    const el = document.createElement('div')
    el.id = 'camera-picker'
    el.innerHTML = `
      <div class="cp-backdrop"></div>
      <div class="cp-sheet">
        <div class="cp-header">
          <span class="cp-title">📷 Выбор камеры</span>
          <button class="cp-close">✕</button>
        </div>
        <div id="cp-list"></div>
        <div class="cp-hint">Для AR лучше работает задняя камера</div>
      </div>
    `
    el.querySelector('.cp-backdrop')!.addEventListener('click', () => this.close())
    el.querySelector('.cp-close')!.addEventListener('click',    () => this.close())
    return el
  }
}
