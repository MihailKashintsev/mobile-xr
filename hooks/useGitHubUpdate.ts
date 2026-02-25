import { useState, useEffect, useCallback } from 'react';
import Constants from 'expo-constants';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
  html_url: string;
}

export interface UpdateInfo {
  available: boolean;
  release: GitHubRelease | null;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string | null;
  releaseNotes: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getPlatformAsset(assets: GitHubRelease['assets']): string | null {
  const Platform = require('react-native').Platform;
  if (Platform.OS === 'android') {
    const apk = assets.find(a => a.name.endsWith('.apk'));
    return apk?.browser_download_url || null;
  }
  if (Platform.OS === 'ios') {
    const ipa = assets.find(a => a.name.endsWith('.ipa'));
    return ipa?.browser_download_url || null;
  }
  return null;
}

export function useGitHubUpdate(checkOnMount = true) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoSlug = Constants.expoConfig?.extra?.githubRepo as string | undefined;
  const currentVersion = Constants.expoConfig?.version || '0.0.0';

  const checkForUpdates = useCallback(async () => {
    if (!repoSlug) {
      setError('GitHub repo not configured in app.json');
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoSlug}/releases/latest`,
        {
          headers: { Accept: 'application/vnd.github.v3+json' },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.status === 404) {
        // No releases yet
        setUpdateInfo({
          available: false,
          release: null,
          currentVersion,
          latestVersion: currentVersion,
          downloadUrl: null,
          releaseNotes: '',
        });
        return;
      }

      if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

      const release: GitHubRelease = await response.json();
      const latestVersion = release.tag_name;
      const isNewer = compareVersions(latestVersion, currentVersion) > 0;
      const downloadUrl = isNewer ? getPlatformAsset(release.assets) : null;

      setUpdateInfo({
        available: isNewer,
        release: isNewer ? release : null,
        currentVersion,
        latestVersion,
        downloadUrl,
        releaseNotes: release.body || '',
      });
    } catch (e: any) {
      setError(e.message || 'Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  }, [repoSlug, currentVersion]);

  useEffect(() => {
    if (checkOnMount) {
      // Delay check to not slow down app startup
      const timer = setTimeout(checkForUpdates, 3000);
      return () => clearTimeout(timer);
    }
  }, [checkOnMount, checkForUpdates]);

  return { updateInfo, isChecking, error, checkForUpdates };
}
