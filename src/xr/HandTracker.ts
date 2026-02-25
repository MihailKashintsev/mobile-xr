/**
 * HandTracker — обёртка над MediaPipe Hands
 * Загружает модель динамически с CDN для экономии бандла
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandData {
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
  handedness: 'Left' | 'Right';
}

export type HandsCallback = (hands: HandData[]) => void;

export class HandTracker {
  private hands: any = null;
  private camera: any = null;
  private videoEl: HTMLVideoElement;
  private callbacks: HandsCallback[] = [];
  private isRunning = false;

  constructor() {
    this.videoEl = document.createElement('video');
    this.videoEl.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;';
    document.body.appendChild(this.videoEl);
  }

  async init(onProgress?: (p: number) => void): Promise<void> {
    onProgress?.(10);

    // Динамическая загрузка MediaPipe
    const { Hands } = await import('@mediapipe/hands');
    onProgress?.(40);

    this.hands = new Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,       // 0 = быстрая модель, хватает для телефона
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
      selfieMode: true           // фронтальная камера
    });

    this.hands.onResults((results: any) => {
      const hands: HandData[] = [];
      if (results.multiHandLandmarks) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          hands.push({
            landmarks: results.multiHandLandmarks[i],
            worldLandmarks: results.multiHandWorldLandmarks?.[i] || [],
            handedness: results.multiHandedness[i].label as 'Left' | 'Right'
          });
        }
      }
      this.callbacks.forEach(cb => cb(hands));
    });

    onProgress?.(70);
    await this.startCamera();
    onProgress?.(100);
  }

  private async startCamera(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 60 }
        }
      });
      this.videoEl.srcObject = stream;
      await this.videoEl.play();

      // Запускаем петлю обработки кадров
      this.isRunning = true;
      this.processLoop();
    } catch (e) {
      console.error('Camera error:', e);
      throw new Error('Нет доступа к камере. Разрешите доступ и перезагрузите.');
    }
  }

  private async processLoop(): Promise<void> {
    if (!this.isRunning) return;
    if (this.videoEl.readyState >= 2) {
      await this.hands.send({ image: this.videoEl });
    }
    requestAnimationFrame(() => this.processLoop());
  }

  onHands(cb: HandsCallback): void {
    this.callbacks.push(cb);
  }

  getVideoElement(): HTMLVideoElement {
    return this.videoEl;
  }

  stop(): void {
    this.isRunning = false;
    const stream = this.videoEl.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
  }
}
