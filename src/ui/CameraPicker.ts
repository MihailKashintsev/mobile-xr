/**
 * CameraPicker — выбор камеры, выдвигается снизу
 */

import type { HandTracker, CameraInfo } from '../xr/HandTracker'

export class CameraPicker {
  private container: HTMLElement
  private tracker: HandTracker
  private visible = false
  private cameras: CameraInfo[] = []
  private onSwitch?: (deviceId: string) => void

  constructor(tracker: HandTracker, onSwitch?: (deviceId: string) => void) {
    this.tracker = tracker
    this.onSwitch = onSwitch
    this.container = document.createElement('div')
    this.container.id = 'camera-picker'
    this.buildCSS()
    this.buildShell()
    document.body.appendChild(this.container)
  }

  async open(): Promise<void> {
    this.visible = true
    this.container.classList.add('open')
    await this.refreshList()
  }

  close(): void {
    this.visible = false
    this.container.classList.remove('open')
  }

  toggle(): void { this.visible ? this.close() : this.open() }

  private async refreshList(): Promise<void> {
    const list = this.container.querySelector('#cam-list')!
    list.innerHTML = '<div class="cam-loading">🔍 Сканирование камер...</div>'

    try {
      this.cameras = await this.tracker.getCameras()
    } catch {
      list.innerHTML = '<div class="cam-error">Не удалось получить список камер</div>'
      return
    }

    if (this.cameras.length === 0) {
      list.innerHTML = '<div class="cam-error">Камеры не найдены</div>'
      return
    }

    const currentId = this.tracker.getCurrentDeviceId()
    list.innerHTML = ''

    for (const cam of this.cameras) {
      const btn = document.createElement('button')
      btn.className = 'cam-item' + (cam.deviceId === currentId ? ' active' : '')

      const icon = cam.facing === 'user' ? '🤳'
        : cam.facing === 'environment' ? '📷'
        : '📸'

      const facingLabel = cam.facing === 'user' ? 'Фронтальная'
        : cam.facing === 'environment' ? 'Основная'
        : 'Камера'

      btn.innerHTML = `
        <div class="cam-icon">${icon}</div>
        <div class="cam-info">
          <div class="cam-name">${this.truncate(cam.label, 40)}</div>
          <div class="cam-sub">${facingLabel}</div>
        </div>
        ${cam.deviceId === currentId ? '<div class="cam-check">✓</div>' : ''}
      `

      btn.addEventListener('click', async () => {
        // Отмечаем активную
        list.querySelectorAll('.cam-item').forEach(el => {
          el.classList.remove('active')
          el.querySelector('.cam-check')?.remove()
        })
        btn.classList.add('active')
        const check = document.createElement('div')
        check.className = 'cam-check'
        check.textContent = '✓'
        btn.appendChild(check)

        // Показываем спиннер
        btn.classList.add('switching')

        try {
          await this.tracker.switchCamera(cam.deviceId)
          this.onSwitch?.(cam.deviceId)
          setTimeout(() => this.close(), 300)
        } catch (e: any) {
          btn.classList.remove('switching', 'active')
          this.showError(`Не удалось переключить: ${e.message}`)
        }
      })

      list.appendChild(btn)
    }
  }

  private showError(msg: string): void {
    const err = document.createElement('div')
    err.className = 'cam-error-toast'
    err.textContent = msg
    this.container.querySelector('.cam-sheet')!.appendChild(err)
    setTimeout(() => err.remove(), 3000)
  }

  private truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '…' : s
  }

  private buildShell(): void {
    this.container.innerHTML = `
      <div class="cam-backdrop"></div>
      <div class="cam-sheet">
        <div class="cam-header">
          <div class="cam-title">📷 Выбор камеры</div>
          <button class="cam-close" id="cam-close-btn">✕</button>
        </div>
        <div id="cam-list"></div>
        <div class="cam-hint">
          Для отслеживания рук лучше всего подходит фронтальная камера
        </div>
      </div>
    `
    this.container.querySelector('.cam-backdrop')!.addEventListener('click', () => this.close())
    this.container.querySelector('#cam-close-btn')!.addEventListener('click', () => this.close())
  }

  private buildCSS(): void {
    const style = document.createElement('style')
    style.textContent = `
      #camera-picker {
        position: fixed; inset: 0; z-index: 6000;
        display: none; align-items: flex-end; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #camera-picker.open { display: flex; }

      .cam-backdrop {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
      }
      .cam-sheet {
        position: relative; z-index: 1;
        width: 100%; max-width: 520px;
        background: #111827;
        border-radius: 20px 20px 0 0;
        padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
        border-top: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 -8px 40px rgba(0,0,0,0.6);
      }
      .cam-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 16px;
      }
      .cam-title { font-size: 1.05rem; font-weight: 700; color: #f9fafb; }
      .cam-close {
        background: rgba(255,255,255,0.08); border: none; color: #9ca3af;
        width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 1rem;
      }

      .cam-loading, .cam-error {
        text-align: center; padding: 24px; color: #6b7280; font-size: 0.9rem;
      }
      .cam-item {
        width: 100%; display: flex; align-items: center; gap: 12px;
        background: #1f2937; border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 14px; margin-bottom: 8px;
        cursor: pointer; transition: all 0.15s; color: inherit;
        text-align: left;
      }
      .cam-item:active, .cam-item.active {
        background: #1e1b4b; border-color: #6366f1;
      }
      .cam-item.switching { opacity: 0.5; pointer-events: none; }
      .cam-icon { font-size: 1.6rem; flex-shrink: 0; }
      .cam-info { flex: 1; min-width: 0; }
      .cam-name {
        font-size: 0.85rem; color: #e5e7eb; font-weight: 500;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .cam-sub { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
      .cam-check {
        color: #6366f1; font-size: 1.1rem; font-weight: 700; flex-shrink: 0;
      }
      .cam-hint {
        font-size: 0.75rem; color: #4b5563; text-align: center;
        margin-top: 12px; padding: 0 8px; line-height: 1.5;
      }
      .cam-error-toast {
        background: #7f1d1d; color: #fca5a5; border-radius: 8px;
        padding: 10px 14px; font-size: 0.82rem; margin-top: 10px;
        text-align: center;
      }
    `
    document.head.appendChild(style)
  }
}
