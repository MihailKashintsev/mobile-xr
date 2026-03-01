/**
 * MindARManager — интеграция MindAR.js с Three.js
 *
 * MindAR отслеживает изображение-маркер через камеру и возвращает
 * матрицу трансформации → мы прикрепляем к ней якорный объект.
 * Окна Three.js привязаны к этому якорю → висят в реальном пространстве.
 *
 * Маркер: любое чёткое изображение (логотип, QR-код и т.д.)
 * Скомпилировать .mind файл: https://hiukim.github.io/mind-ar-js-doc/tools/compile
 */
import * as THREE from 'three'

// MindAR загружается через CDN в index.html как глобальная переменная
declare const MINDAR: any

export class MindARManager {
  private mindar:  any = null
  private anchor:  THREE.Group | null = null
  private _active  = false
  private _found   = false
  private _lostAt  = 0

  /** Инициализирует MindAR и возвращает якорную группу Three.js.
   *  Все окна которые нужно "приклеить" к реальному миру — добавляй в anchor.
   *  После нахождения маркера они появятся в правильном месте.
   */
  async init(
    renderer:  THREE.WebGLRenderer,
    scene:     THREE.Scene,
    camera:    THREE.PerspectiveCamera,
    mindFile:  string = '/targets/marker.mind'
  ): Promise<THREE.Group> {
    if (!window.hasOwnProperty('MINDAR') && !(window as any).MindARThree) {
      throw new Error('MindAR not loaded. Add CDN script to index.html')
    }

    const MindARThree = (window as any).MindARThree

    this.mindar = new MindARThree({
      container:    renderer.domElement.parentElement ?? document.body,
      imageTargetSrc: mindFile,
      maxTrack:     1,
      uiLoading:    'no',
      uiScanning:   'no',
      uiError:      'no',
    })

    // MindAR создаёт свой renderer/camera — берём их
    const { renderer: mrend, scene: mscene, camera: mcam } = this.mindar.getThree()

    // Синхронизируем наш рендерер с MindAR
    renderer.domElement.style.display = 'none'

    this.anchor = new THREE.Group()
    const target = this.mindar.addAnchor(0)
    target.group.add(this.anchor)

    target.onTargetFound = () => {
      this._found = true
      console.log('[MindAR] Marker found')
    }
    target.onTargetLost = () => {
      this._found = false
      this._lostAt = performance.now()
      console.log('[MindAR] Marker lost')
    }

    await this.mindar.start()
    this._active = true

    // MindAR рендерит сам — подключаем наши объекты к его сцене
    mscene.add(scene)

    return this.anchor
  }

  get isActive(): boolean  { return this._active }
  get isFound():  boolean  { return this._found  }

  /** Маркер недавно был виден (даём 2 сек буфера после потери) */
  get isVisible(): boolean {
    return this._found || (performance.now() - this._lostAt < 2000)
  }

  stop(): void {
    if (this.mindar) { this.mindar.stop(); this._active = false }
  }
}
