/**
 * GestureDetector — жесты из ланд-марков MediaPipe
 *
 * Щипок (pinch) = большой + указательный + средний пальцы сближаются
 * Grab = кулак (все пальцы согнуты)
 * Point = только указательный вытянут
 * Open = открытая ладонь
 */

import type { Landmark } from './HandTracker'

export type GestureType = 'pinch' | 'grab' | 'point' | 'open' | 'none'

export interface GestureResult {
  type:          GestureType
  pinchStrength: number    // 0..1
  indexTip:      Landmark
  thumbTip:      Landmark
  middleTip:     Landmark
  palmCenter:    Landmark
}

// Индексы точек MediaPipe Hands
const WRIST       = 0
const THUMB_TIP   = 4
const INDEX_MCP   = 5
const INDEX_TIP   = 8
const MIDDLE_TIP  = 12
const RING_TIP    = 16
const PINKY_TIP   = 20

function dist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2)
}

export class GestureDetector {
  detect(lm: Landmark[]): GestureResult {
    if (lm.length < 21) return this.empty(lm)

    const thumbTip  = lm[THUMB_TIP]
    const indexTip  = lm[INDEX_TIP]
    const middleTip = lm[MIDDLE_TIP]
    const palmSize  = dist(lm[WRIST], lm[INDEX_MCP])

    // ── Pinch: большой + указательный + средний ──────────────────────────────
    const dThumbIndex  = dist(thumbTip, indexTip)
    const dThumbMiddle = dist(thumbTip, middleTip)
    // Среднее расстояние от большого до двух пальцев
    const pinchDist    = (dThumbIndex + dThumbMiddle) / 2
    const pinchStrength = Math.max(0, Math.min(1, 1 - pinchDist / (palmSize * 0.65)))

    // ── Grab: все 4 пальца согнуты ───────────────────────────────────────────
    const grab = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP].every(i =>
      dist(lm[i], lm[WRIST]) < palmSize * 1.2
    )

    // ── Point: только указательный вытянут ───────────────────────────────────
    const indexOut = dist(indexTip, lm[WRIST]) > palmSize * 1.65
    const restDown = [MIDDLE_TIP, RING_TIP, PINKY_TIP].every(i =>
      dist(lm[i], lm[WRIST]) < palmSize * 1.3
    )

    let type: GestureType = 'none'
    if (pinchStrength > 0.68)          type = 'pinch'
    else if (grab)                     type = 'grab'
    else if (indexOut && restDown)     type = 'point'
    else if (!grab)                    type = 'open'

    return {
      type, pinchStrength, indexTip, thumbTip, middleTip,
      palmCenter: this.palmCenter(lm)
    }
  }

  private palmCenter(lm: Landmark[]): Landmark {
    const pts = [0, 5, 9, 13, 17]
    return {
      x: pts.reduce((s,i) => s + lm[i].x, 0) / pts.length,
      y: pts.reduce((s,i) => s + lm[i].y, 0) / pts.length,
      z: pts.reduce((s,i) => s + lm[i].z, 0) / pts.length,
    }
  }

  private empty(lm: Landmark[]): GestureResult {
    const z: Landmark = { x:0, y:0, z:0 }
    return { type:'none', pinchStrength:0, indexTip:z, thumbTip:z, middleTip:z, palmCenter: lm[0]||z }
  }
}
