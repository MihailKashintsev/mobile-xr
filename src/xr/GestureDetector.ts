/**
 * GestureDetector — определяет жесты из ланд-марков руки
 * 
 * Жесты: pinch (щипок), grab (кулак), point (указание), open (открытая ладонь)
 */

import type { Landmark } from './HandTracker'

export type GestureType = 'pinch' | 'grab' | 'point' | 'open' | 'none'

export interface GestureResult {
  type: GestureType
  pinchStrength: number  // 0..1
  indexTip: Landmark
  thumbTip: Landmark
  palmCenter: Landmark
}

// Индексы ключевых точек (MediaPipe Hands)
const THUMB_TIP   = 4
const INDEX_TIP   = 8
const INDEX_MCP   = 5
const MIDDLE_TIP  = 12
const RING_TIP    = 16
const PINKY_TIP   = 20
const WRIST       = 0

function dist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2)
}

export class GestureDetector {
  detect(lm: Landmark[]): GestureResult {
    if (lm.length < 21) {
      return this.empty(lm)
    }

    const thumbTip   = lm[THUMB_TIP]
    const indexTip   = lm[INDEX_TIP]
    const palmCenter = this.palmCenter(lm)
    const palmSize   = dist(lm[WRIST], lm[INDEX_MCP])

    // Pinch — расстояние большой + указательный
    const pinchDist = dist(thumbTip, indexTip)
    const pinchStrength = Math.max(0, 1 - pinchDist / (palmSize * 0.6))

    // Grab — все пальцы согнуты
    const fingersCurled = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP].every(i => {
      return dist(lm[i], lm[WRIST]) < palmSize * 1.2
    })

    // Point — только указательный вытянут
    const indexExtended = dist(indexTip, lm[WRIST]) > palmSize * 1.6
    const othersDown = [MIDDLE_TIP, RING_TIP, PINKY_TIP].every(i =>
      dist(lm[i], lm[WRIST]) < palmSize * 1.3
    )

    let type: GestureType = 'none'
    if (pinchStrength > 0.7)        type = 'pinch'
    else if (fingersCurled)          type = 'grab'
    else if (indexExtended && othersDown) type = 'point'
    else if (!fingersCurled)         type = 'open'

    return { type, pinchStrength, indexTip, thumbTip, palmCenter }
  }

  private palmCenter(lm: Landmark[]): Landmark {
    const pts = [0, 5, 9, 13, 17]
    return {
      x: pts.reduce((s, i) => s + lm[i].x, 0) / pts.length,
      y: pts.reduce((s, i) => s + lm[i].y, 0) / pts.length,
      z: pts.reduce((s, i) => s + lm[i].z, 0) / pts.length,
    }
  }

  private empty(lm: Landmark[]): GestureResult {
    const zero: Landmark = { x: 0, y: 0, z: 0 }
    return { type: 'none', pinchStrength: 0, indexTip: zero, thumbTip: zero, palmCenter: lm[0] || zero }
  }
}
