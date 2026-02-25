import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

export interface HandLandmark {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  z: number;
  name?: string;
}

export interface TrackedHand {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  score: number;
  gestures: DetectedGestures;
}

export interface DetectedGestures {
  isPinching: boolean;      // index + thumb close
  isPointing: boolean;      // index extended, others closed
  isOpenPalm: boolean;      // all fingers extended
  isFist: boolean;          // all fingers closed
  pinchStrength: number;    // 0..1
  cursorX: number;          // normalized cursor position
  cursorY: number;
}

// Finger tip indices in MediaPipe hand model
const FINGERTIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky
const FINGER_BASES = [2, 5, 9, 13, 17];

function distance3D(a: HandLandmark, b: HandLandmark): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

function isFingerExtended(landmarks: HandLandmark[], fingerIndex: number): boolean {
  const tipIdx = FINGERTIPS[fingerIndex];
  const baseIdx = FINGER_BASES[fingerIndex];
  const wrist = landmarks[0];
  return distance3D(landmarks[tipIdx], wrist) > distance3D(landmarks[baseIdx], wrist) * 1.2;
}

function analyzeGestures(landmarks: HandLandmark[], imageWidth: number, imageHeight: number): DetectedGestures {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];

  const pinchDist = distance3D(thumbTip, indexTip);
  const handSize = distance3D(wrist, landmarks[9]); // wrist to middle base
  const pinchStrength = Math.max(0, 1 - pinchDist / (handSize * 0.8));
  const isPinching = pinchStrength > 0.7;

  const fingers = [0, 1, 2, 3, 4].map(i => isFingerExtended(landmarks, i));
  const isOpenPalm = fingers.every(f => f);
  const isFist = fingers.every(f => !f);
  const isPointing = !fingers[0] && fingers[1] && !fingers[2] && !fingers[3] && !fingers[4];

  // Cursor position from index tip
  const cursorX = indexTip.x;
  const cursorY = indexTip.y;

  return { isPinching, isPointing, isOpenPalm, isFist, pinchStrength, cursorX, cursorY };
}

export function useHandTracking(imageWidth = 640, imageHeight = 480) {
  const [hands, setHands] = useState<TrackedHand[]>([]);
  const [isModelReady, setIsModelReady] = useState(false);
  const [tfReady, setTfReady] = useState(false);
  const detectorRef = useRef<handPoseDetection.HandDetector | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await tf.ready();
        if (cancelled) return;
        setTfReady(true);

        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const config: handPoseDetection.MediaPipeHandsTfjsModelConfig = {
          runtime: 'tfjs',
          modelType: 'lite', // 'lite' for performance, 'full' for accuracy
          maxHands: 2,
        };

        detectorRef.current = await handPoseDetection.createDetector(model, config);
        if (!cancelled) setIsModelReady(true);
      } catch (e) {
        console.error('[HandTracking] Init error:', e);
      }
    };

    init();
    return () => {
      cancelled = true;
      detectorRef.current?.dispose();
    };
  }, []);

  const detectFromTensor = useCallback(async (imageTensor: tf.Tensor3D) => {
    if (!detectorRef.current || !isModelReady || processingRef.current) return;

    processingRef.current = true;
    try {
      const predictions = await detectorRef.current.estimateHands(imageTensor, {
        flipHorizontal: true, // mirror for front camera
      });

      const tracked: TrackedHand[] = predictions.map(pred => {
        const landmarks: HandLandmark[] = (pred.keypoints3D || pred.keypoints).map(kp => ({
          x: kp.x / imageWidth,
          y: kp.y / imageHeight,
          z: (kp.z || 0) / imageWidth,
          name: kp.name,
        }));

        return {
          landmarks,
          handedness: pred.handedness as 'Left' | 'Right',
          score: pred.score || 0,
          gestures: analyzeGestures(landmarks, imageWidth, imageHeight),
        };
      });

      setHands(tracked);
      return tracked;
    } catch (e) {
      // Skip frame on error
    } finally {
      processingRef.current = false;
    }
  }, [isModelReady, imageWidth, imageHeight]);

  return { hands, isModelReady, tfReady, detectFromTensor };
}
