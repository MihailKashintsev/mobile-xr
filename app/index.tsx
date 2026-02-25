import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import XRScene from '@components/XRScene';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [xrStarted, setXrStarted] = useState(false);
  const [vrMode, setVrMode] = useState<'ar' | 'vr'>('ar');

  const startXR = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission Required', 'Please grant camera access to use AR mode.');
        return;
      }
    }
    setXrStarted(true);
  }, [permission, requestPermission]);

  if (xrStarted) {
    return (
      <XRScene
        mode={vrMode}
        onExit={() => setXrStarted(false)}
      />
    );
  }

  return (
    <LinearGradient colors={['#0a0a1a', '#0d1b2a', '#1a0a2e']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📱 Mobile XR</Text>
        <Text style={styles.subtitle}>Your phone as a spatial computer</Text>
      </View>

      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeBtn, vrMode === 'ar' && styles.modeBtnActive]}
          onPress={() => setVrMode('ar')}
        >
          <Text style={styles.modeIcon}>📷</Text>
          <Text style={styles.modeBtnText}>AR Mode</Text>
          <Text style={styles.modeBtnDesc}>Camera passthrough</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, vrMode === 'vr' && styles.modeBtnActive]}
          onPress={() => setVrMode('vr')}
        >
          <Text style={styles.modeIcon}>🥽</Text>
          <Text style={styles.modeBtnText}>VR Mode</Text>
          <Text style={styles.modeBtnDesc}>Cardboard headset</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.features}>
        <FeatureItem icon="🖐️" text="Real-time hand tracking" />
        <FeatureItem icon="🪟" text="3D floating panels" />
        <FeatureItem icon="🧭" text="Gyroscope head tracking" />
        <FeatureItem icon="🤏" text="Pinch to interact" />
      </View>

      <TouchableOpacity style={styles.startBtn} onPress={startXR} activeOpacity={0.8}>
        <LinearGradient
          colors={['#6c63ff', '#a855f7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startBtnGradient}
        >
          <Text style={styles.startBtnText}>Launch XR Experience</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {vrMode === 'vr' ? '🥽 Use with Google Cardboard headset' : '👁️ Point camera forward for AR experience'}
      </Text>
    </LinearGradient>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  subtitle: { fontSize: 15, color: '#a0aec0', marginTop: 6 },
  modeSelector: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  modeBtn: {
    flex: 1, alignItems: 'center', padding: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(108,99,255,0.25)',
    borderColor: '#6c63ff',
  },
  modeIcon: { fontSize: 28, marginBottom: 6 },
  modeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modeBtnDesc: { color: '#718096', fontSize: 11, marginTop: 2 },
  features: { width: '100%', marginBottom: 28, gap: 8 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: { fontSize: 18, width: 28 },
  featureText: { color: '#e2e8f0', fontSize: 14 },
  startBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  startBtnGradient: { paddingVertical: 18, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  hint: { color: '#4a5568', fontSize: 13, textAlign: 'center' },
});
