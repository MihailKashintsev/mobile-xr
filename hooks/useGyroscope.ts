import { useEffect, useRef, useState, useCallback } from 'react';
import { DeviceMotion } from 'expo-sensors';

export interface HeadOrientation {
  pitch: number; // up/down radians
  yaw: number;   // left/right radians
  roll: number;  // tilt radians
  alpha: number; // compass
  beta: number;
  gamma: number;
}

const SMOOTHING = 0.12; // lower = smoother but more lag

export function useGyroscope() {
  const [orientation, setOrientation] = useState<HeadOrientation>({
    pitch: 0, yaw: 0, roll: 0, alpha: 0, beta: 0, gamma: 0,
  });
  const smoothRef = useRef({ pitch: 0, yaw: 0, roll: 0 });
  const baseRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);

  useEffect(() => {
    DeviceMotion.setUpdateInterval(16); // ~60fps

    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) return;
      const { alpha, beta, gamma } = rotation;

      // Set baseline on first reading
      if (!baseRef.current) {
        baseRef.current = { alpha, beta, gamma };
      }

      const dAlpha = alpha - baseRef.current.alpha;
      const dBeta  = beta  - baseRef.current.beta;
      const dGamma = gamma - baseRef.current.gamma;

      // Convert to radians, apply smoothing
      const targetPitch = dBeta  * (Math.PI / 180);
      const targetYaw   = dAlpha * (Math.PI / 180);
      const targetRoll  = dGamma * (Math.PI / 180);

      smoothRef.current.pitch += (targetPitch - smoothRef.current.pitch) * SMOOTHING;
      smoothRef.current.yaw   += (targetYaw   - smoothRef.current.yaw)   * SMOOTHING;
      smoothRef.current.roll  += (targetRoll  - smoothRef.current.roll)  * SMOOTHING;

      setOrientation({
        pitch: smoothRef.current.pitch,
        yaw:   smoothRef.current.yaw,
        roll:  smoothRef.current.roll,
        alpha, beta, gamma,
      });
    });

    return () => sub.remove();
  }, []);

  const recenter = useCallback(() => {
    baseRef.current = null;
    smoothRef.current = { pitch: 0, yaw: 0, roll: 0 };
  }, []);

  return { orientation, recenter };
}
