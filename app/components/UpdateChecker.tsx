import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Linking, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGitHubUpdate } from '@hooks/useGitHubUpdate';

export default function UpdateChecker() {
  const { updateInfo, isChecking } = useGitHubUpdate(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (updateInfo?.available) {
      setVisible(true);
    }
  }, [updateInfo]);

  const handleUpdate = async () => {
    if (updateInfo?.downloadUrl) {
      await Linking.openURL(updateInfo.downloadUrl);
    } else if (updateInfo?.release?.html_url) {
      await Linking.openURL(updateInfo.release.html_url);
    }
    setVisible(false);
  };

  if (!visible || !updateInfo?.available) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient colors={['#1a1a2e', '#16213e']} style={styles.cardInner}>
            <Text style={styles.emoji}>🚀</Text>
            <Text style={styles.title}>Update Available!</Text>
            <Text style={styles.versions}>
              {updateInfo.currentVersion} → {updateInfo.latestVersion}
            </Text>

            {updateInfo.releaseNotes ? (
              <View style={styles.notes}>
                <Text style={styles.notesTitle}>What's new:</Text>
                <Text style={styles.notesText} numberOfLines={6}>
                  {updateInfo.releaseNotes.substring(0, 300)}
                  {updateInfo.releaseNotes.length > 300 ? '...' : ''}
                </Text>
              </View>
            ) : null}

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setVisible(false)}>
                <Text style={styles.btnSecondaryText}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleUpdate}>
                <LinearGradient
                  colors={['#6c63ff', '#a855f7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnPrimaryGradient}
                >
                  <Text style={styles.btnPrimaryText}>
                    {Platform.OS === 'android' ? 'Download APK' : 'View Release'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: { width: 320, borderRadius: 20, overflow: 'hidden' },
  cardInner: { padding: 24 },
  emoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  versions: { color: '#a0aec0', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  notes: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  notesTitle: { color: '#6c63ff', fontWeight: '700', marginBottom: 4 },
  notesText: { color: '#cbd5e0', fontSize: 13, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 10 },
  btnSecondary: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#a0aec0', fontWeight: '600' },
  btnPrimary: { flex: 2, borderRadius: 10, overflow: 'hidden' },
  btnPrimaryGradient: { paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
