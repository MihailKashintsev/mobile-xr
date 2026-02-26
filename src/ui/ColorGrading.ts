/**
 * ColorGrading — постобработка цвета
 *
 * ИСПРАВЛЕНИЕ чёрного экрана:
 * - Проблема: renderer рендерил bgScene (видео) + 3D scene.
 *   При включении CG мы рендерили scene.render() в RT, но scene.render()
 *   сам по себе рендерит ТОЛЬКО 3D объекты без видео-фона.
 *   Видео-фон рисуется отдельно в SceneManager. Поэтому RT была пустой.
 *
 * - Решение: CG работает как простые CSS-фильтры через HTML overlay.
 *   Никакого RT, никакой WebGL постобработки.
 *   CSS filter применяется к canvas, что работает всегда.
 */

export interface ColorGradingParams {
  brightness:  number   // -0.5 .. 0.5, default 0 → CSS brightness(1+val)
  contrast:    number   // 0.5 .. 2.0, default 1
  saturation:  number   // 0 .. 2, default 1
  tintR:       number   // 0.5 .. 1.5 → через sepia+hue-rotate не точно, используем backdrop
  tintG:       number
  tintB:       number
  enabled:     boolean
}

export const DEFAULT_CG: ColorGradingParams = {
  brightness: 0, contrast: 1, saturation: 1,
  tintR: 1, tintG: 1, tintB: 1, enabled: false
}

const STORAGE_KEY = 'mxr-cg-v2'

export class ColorGrading {
  params: ColorGradingParams
  private canvas: HTMLCanvasElement
  private overlay: HTMLCanvasElement  // 2D tint overlay

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.params = { ...DEFAULT_CG, ...this.load() }

    // Tint overlay — прозрачный canvas поверх основного
    this.overlay = document.createElement('canvas')
    this.overlay.style.cssText = `
      position:fixed; inset:0; width:100%; height:100%;
      pointer-events:none; z-index:10; display:none;
      mix-blend-mode:multiply;
    `
    document.body.appendChild(this.overlay)

    this.apply()
  }

  setParams(p: Partial<ColorGradingParams>): void {
    Object.assign(this.params, p)
    this.apply()
    this.save()
  }

  getParams(): ColorGradingParams { return { ...this.params } }

  reset(): void {
    this.params = { ...DEFAULT_CG }
    this.apply()
    this.save()
  }

  // Вызывать ВМЕСТО scene.render — просто проксирует (CG через CSS)
  renderWithGrading(renderFn: () => void): void {
    renderFn()
  }

  private apply(): void {
    const p = this.params

    if (!p.enabled) {
      this.canvas.style.filter = ''
      this.overlay.style.display = 'none'
      return
    }

    // CSS filter на основной canvas
    const br = 1 + p.brightness        // brightness(1.3) = +30%
    const ct = p.contrast              // contrast(1.2)
    const st = p.saturation            // saturate(1.5)
    this.canvas.style.filter = `brightness(${br.toFixed(3)}) contrast(${ct.toFixed(3)}) saturate(${st.toFixed(3)})`

    // RGB tint через отдельный canvas с mix-blend-mode:multiply
    const needTint = Math.abs(p.tintR-1)>0.02 || Math.abs(p.tintG-1)>0.02 || Math.abs(p.tintB-1)>0.02
    if (needTint) {
      this.overlay.style.display = 'block'
      this.overlay.width  = window.innerWidth
      this.overlay.height = window.innerHeight
      const ctx = this.overlay.getContext('2d')!
      const r = Math.round(Math.min(255, p.tintR * 255))
      const g = Math.round(Math.min(255, p.tintG * 255))
      const b = Math.round(Math.min(255, p.tintB * 255))
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(0, 0, this.overlay.width, this.overlay.height)
    } else {
      this.overlay.style.display = 'none'
    }
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.params)) } catch {}
  }
  private load(): Partial<ColorGradingParams> {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
  }

  dispose(): void {
    this.canvas.style.filter = ''
    this.overlay.remove()
  }
}
