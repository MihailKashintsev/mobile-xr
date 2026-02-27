/**
 * GestureDetector v2 — новые жесты
 *
 * НОВЫЕ ЖЕСТЫ:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ THREE_FINGER  = большой + указательный + средний сведены        │
 * │               → нажатие кнопок (hold 2 сек)                     │
 * │                                                                  │
 * │ GRAB          = все 4 пальца согнуты (кулак)                     │
 * │               → перетащить окно                                  │
 * │                                                                  │
 * │ GUN           = кулак, но большой и указательный открыты         │
 * │               и образуют прямой угол (как пистолет ☝️👍)          │
 * │               → частицы                                          │
 * │                                                                  │
 * │ POINT         = только указательный вытянут                      │
 * │ OPEN          = открытая ладонь                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * threeFingerStrength — аналог pinchStrength для THREE_FINGER жеста
 */

import type { Landmark } from './HandTracker'

export type GestureType = 'three_finger' | 'grab' | 'gun' | 'point' | 'open' | 'none'

export interface GestureResult {
  type:               GestureType
  pinchStrength:      number    // 0..1, для совместимости = threeFingerStrength
  threeFingerStrength:number    // 0..1: насколько 3 пальца сведены
  grabStrength:       number    // 0..1: насколько кулак сжат
  isGun:              boolean   // кулак + большой + указательный под ~90°
  indexTip:           Landmark
  thumbTip:           Landmark
  middleTip:          Landmark
  palmCenter:         Landmark
}

// MediaPipe Hands landmarks
const WRIST      = 0
const THUMB_CMC  = 1
const THUMB_MCP  = 2
const THUMB_IP   = 3
const THUMB_TIP  = 4
const INDEX_MCP  = 5
const INDEX_PIP  = 6
const INDEX_DIP  = 7
const INDEX_TIP  = 8
const MIDDLE_MCP = 9
const MIDDLE_TIP = 12
const RING_MCP   = 13
const RING_TIP   = 16
const PINKY_MCP  = 17
const PINKY_TIP  = 20

function dist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2)
}

/** Насколько палец согнут: 0 = прямой, 1 = полностью согнут */
function fingerBend(tip: Landmark, mcp: Landmark, wrist: Landmark): number {
  const maxDist = dist(wrist, mcp) * 1.8
  const tipDist = dist(tip, wrist)
  return Math.max(0, Math.min(1, 1 - tipDist / maxDist))
}

export class GestureDetector {
  detect(lm: Landmark[]): GestureResult {
    if (lm.length < 21) return this.empty(lm)

    const thumbTip  = lm[THUMB_TIP]
    const indexTip  = lm[INDEX_TIP]
    const middleTip = lm[MIDDLE_TIP]
    const palmSize  = dist(lm[WRIST], lm[INDEX_MCP])

    // ── Базовые расстояния ─────────────────────────────────────────────────
    const dThumbIndex  = dist(thumbTip, indexTip)
    const dThumbMiddle = dist(thumbTip, middleTip)
    const dIndexMiddle = dist(indexTip, middleTip)

    // ── THREE_FINGER: большой + указательный + средний сведены ────────────
    // Все три кончика близко друг к другу
    const maxTri = palmSize * 0.55
    const triDist = (dThumbIndex + dThumbMiddle + dIndexMiddle) / 3
    const threeFingerStrength = Math.max(0, Math.min(1, 1 - triDist / maxTri))

    // ── GRAB: насколько каждый палец согнут ───────────────────────────────
    const indexBend  = fingerBend(lm[INDEX_TIP],  lm[INDEX_MCP],  lm[WRIST])
    const middleBend = fingerBend(lm[MIDDLE_TIP], lm[MIDDLE_MCP], lm[WRIST])
    const ringBend   = fingerBend(lm[RING_TIP],   lm[RING_MCP],   lm[WRIST])
    const pinkyBend  = fingerBend(lm[PINKY_TIP],  lm[PINKY_MCP],  lm[WRIST])
    const grabStrength = (indexBend + middleBend + ringBend + pinkyBend) / 4

    // Кулак = все 4 согнуты
    const isGrab = grabStrength > 0.55

    // ── GUN: кулак + большой и указательный открыты под ~90° ──────────────
    // Условия:
    // 1. Средний, безымянный, мизинец — согнуты
    // 2. Большой вытянут (далеко от запястья)
    // 3. Указательный вытянут (далеко от запястья)
    // 4. Угол между большим и указательным ≈ 60-120°
    const threeRingPinkyClosed = (middleBend + ringBend + pinkyBend) / 3 > 0.55
    const thumbOut  = dist(thumbTip, lm[WRIST]) > palmSize * 1.4
    const indexOut  = dist(indexTip, lm[WRIST]) > palmSize * 1.6

    // Угол через dot product
    let isGun = false
    if (threeRingPinkyClosed && thumbOut && indexOut) {
      const thumbVec = {
        x: thumbTip.x - lm[THUMB_MCP].x,
        y: thumbTip.y - lm[THUMB_MCP].y,
        z: thumbTip.z - lm[THUMB_MCP].z,
      }
      const indexVec = {
        x: indexTip.x - lm[INDEX_MCP].x,
        y: indexTip.y - lm[INDEX_MCP].y,
        z: indexTip.z - lm[INDEX_MCP].z,
      }
      const tLen = Math.sqrt(thumbVec.x**2 + thumbVec.y**2 + thumbVec.z**2)
      const iLen = Math.sqrt(indexVec.x**2 + indexVec.y**2 + indexVec.z**2)
      if (tLen > 0.001 && iLen > 0.001) {
        const dot = (thumbVec.x*indexVec.x + thumbVec.y*indexVec.y + thumbVec.z*indexVec.z) / (tLen * iLen)
        const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI
        isGun = angleDeg > 50 && angleDeg < 130  // 50-130° = прямой угол ±40°
      }
    }

    // ── POINT: только указательный вытянут ────────────────────────────────
    const indexOutForPoint = dist(indexTip, lm[WRIST]) > palmSize * 1.65
    const restDownForPoint = [MIDDLE_TIP, RING_TIP, PINKY_TIP].every(i =>
      dist(lm[i], lm[WRIST]) < palmSize * 1.3
    )

    // ── Выбор типа (приоритет: gun > three_finger > grab > point > open) ──
    let type: GestureType = 'none'
    if (isGun)                              type = 'gun'
    else if (threeFingerStrength > 0.55)    type = 'three_finger'
    else if (isGrab)                        type = 'grab'
    else if (indexOutForPoint && restDownForPoint) type = 'point'
    else                                    type = 'open'

    return {
      type,
      pinchStrength:       threeFingerStrength,  // совместимость
      threeFingerStrength,
      grabStrength,
      isGun,
      indexTip, thumbTip, middleTip,
      palmCenter: this.palmCenter(lm),
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
    return {
      type: 'none', pinchStrength: 0, threeFingerStrength: 0,
      grabStrength: 0, isGun: false,
      indexTip: z, thumbTip: z, middleTip: z, palmCenter: lm[0]||z,
    }
  }
}
