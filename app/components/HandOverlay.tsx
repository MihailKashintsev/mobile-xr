import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { TrackedHand } from '@hooks/useHandTracking';

// MediaPipe hand connections
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // index
  [0, 9], [9, 10], [10, 11], [11, 12],   // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17],             // palm
];

const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

interface Props {
  hands: TrackedHand[];
  width: number;
  height: number;
}

export default function HandOverlay({ hands, width, height }: Props) {
  if (!hands.length) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width={width} height={height}>
        {hands.map((hand, hi) => {
          const color = hand.handedness === 'Right' ? '#00e5ff' : '#ff6b9d';
          const lm = hand.landmarks;

          return (
            <G key={hi}>
              {/* Connections */}
              {CONNECTIONS.map(([a, b], ci) => (
                <Line
                  key={ci}
                  x1={lm[a].x * width}
                  y1={lm[a].y * height}
                  x2={lm[b].x * width}
                  y2={lm[b].y * height}
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.7}
                />
              ))}

              {/* All landmarks */}
              {lm.map((pt, pi) => (
                <Circle
                  key={pi}
                  cx={pt.x * width}
                  cy={pt.y * height}
                  r={FINGERTIP_INDICES.includes(pi) ? 6 : 4}
                  fill={FINGERTIP_INDICES.includes(pi) ? color : 'rgba(255,255,255,0.6)'}
                  stroke={color}
                  strokeWidth={1}
                />
              ))}

              {/* Gesture label */}
              <SvgText
                x={lm[0].x * width}
                y={lm[0].y * height + 20}
                fill={color}
                fontSize={12}
                fontWeight="bold"
              >
                {hand.gestures.isPinching
                  ? '🤏 Pinch'
                  : hand.gestures.isPointing
                  ? '👆 Point'
                  : hand.gestures.isOpenPalm
                  ? '✋ Open'
                  : hand.gestures.isFist
                  ? '✊ Fist'
                  : hand.handedness}
              </SvgText>

              {/* Pinch indicator */}
              {hand.gestures.isPinching && (
                <Circle
                  cx={lm[8].x * width}
                  cy={lm[8].y * height}
                  r={20 * hand.gestures.pinchStrength}
                  fill={`${color}40`}
                  stroke={color}
                  strokeWidth={2}
                />
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
