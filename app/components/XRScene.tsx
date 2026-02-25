import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text,
  Dimensions, Platform, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { cameraWithTensors } from '@tensorflow/tfjs-react-native';
import FloatingUI from './FloatingUI';
import HandOverlay from './HandOverlay';
import { useHandTracking } from '@hooks/useHandTracking';
import { useGyroscope } from '@hooks/useGyroscope';
import * as Haptics from 'expo-haptics';

const TensorCamera = cameraWithTensors(CameraView);
const SCREEN = Dimensions.get('window');

// Camera tensor dimensions
const TENSOR_W = 152;
const TENSOR_H = 200;

interface Props {
  mode: 'ar' | 'vr';
  onExit: () => void;
}

export default function XRScene({ mode, onExit }: Props) {
  const [permission] = useCameraPermissions();
  const { hands, isModelReady, detectFromTensor } = useHandTracking(TENSOR_W, TENSOR_H);
  const { orientation, recenter } = useGyroscope();
  const [fps, setFps] = useState(0);
  const [showHUD, setShowHUD] = useState(true);
  const frameCountRef = useRef(0);
  const lastFpsUpdate = useRef(Date.now());
  const prevPinchRef = useRef(false);

  // Haptic feedback on pinch
  useEffect(() => {
    const rightHand = hands.find(h => h.handedness === 'Right') || hands[0];
    if (!rightHand) return;

    if (rightHand.gestures.isPinching && !prevPinchRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevPinchRef.current = rightHand.gestures.isPinching;
  }, [hands]);

  const handleCameraStream = useCallback(
    (images: IterableIterator<tf.Tensor3D>) => {
      let loop = true;

      const processFrame = async () => {
        if (!loop) return;

        const now = Date.now();
        frameCountRef.current++;

        if (now - lastFpsUpdate.current > 1000) {
          setFps(Math.round(frameCountRef.current * 1000 / (now - lastFpsUpdate.current)));
          frameCountRef.current = 0;
          lastFpsUpdate.current = now;
        }

        const img = images.next().value;
        if (img && isModelReady) {
          await detectFromTensor(img);
          tf.dispose(img);
        } else if (img) {
          tf.dispose(img);
        }

        requestAnimationFrame(processFrame);
      };

      processFrame();
      return () => { loop = false; };
    },
    [isModelReady, detectFromTensor]
  );

  if (!permission?.granted) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Camera permission required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera background (AR passthrough) */}
      {mode === 'ar' && (
        <TensorCamera
          style={StyleSheet.absoluteFillObject}
          facing="front"
          resizeWidth={TENSOR_W}
          resizeHeight={TENSOR_H}
          resizeDepth={3}
          autorender
          onReady={handleCameraStream}
        />
      )}

      {/* VR mode: pure black background */}
      {mode === 'vr' && <View style={[StyleSheet.absoluteFillObject, styles.vrBg]} />}

      {/* 3D Floating UI Layer */}
      <FloatingUI
        width={SCREEN.width}
        height={SCREEN.height}
        orientation={orientation}
        hands={hands}
        vrMode={mode === 'vr'}
      />

      {/* Hand tracking skeleton overlay */}
      <HandOverlay
        hands={hands}
        width={SCREEN.width}
        height={SCREEN.height}
      />

      {/* HUD Controls */}
      {showHUD && (
        <View style={styles.hud}>
          <View style={styles.hudLeft}>
            <View style={[styles.statusDot, { backgroundColor: isModelReady ? '#00ff88' : '#ff4444' }]} />
            <Text style={styles.hudText}>
              {isModelReady ? `Tracking • ${fps}fps` : 'Loading AI...'}
            </Text>
          </View>

          <View style={styles.hudRight}>
            <TouchableOpacity style={styles.hudBtn} onPress={recenter}>
              <Text style={styles.hudBtnText}>⊙ Center</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hudBtn} onPress={() => setShowHUD(false)}>
              <Text style={styles.hudBtnText}>▲ Hide</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.hudBtn, styles.hudBtnExit]} onPress={onExit}>
              <Text style={styles.hudBtnText}>✕ Exit</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Show HUD button when hidden */}
      {!showHUD && (
        <TouchableOpacity style={styles.showHudBtn} onPress={() => setShowHUD(true)}>
          <Text style={styles.hudBtnText}>▼ Menu</Text>
        </TouchableOpacity>
      )}

      {/* Gesture hint */}
      <View style={styles.gestureHints}>
        <Text style={styles.hintText}>
          🤏 Pinch to select  •  👆 Point for cursor  •  ✋ Open palm for menu
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  vrBg: { backgroundColor: '#000013' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  errorText: { color: '#fff', fontSize: 16 },
  hud: {
    position: 'absolute', top: 12, left: 12, right: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  hudLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  hudText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hudRight: { flexDirection: 'row', gap: 6 },
  hudBtn: {
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  hudBtnExit: { borderColor: 'rgba(255,60,60,0.4)' },
  hudBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  showHudBtn: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  gestureHints: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.5)', fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, paddingVertical: 4,
    borderRadius: 12,
  },
});
