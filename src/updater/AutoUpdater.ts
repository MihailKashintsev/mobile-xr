/**
 * AutoUpdater — проверяет релизы на GitHub и предлагает обновление
 */

interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  body: string;
  published_at: string;
}

export class AutoUpdater {
  private owner: string;
  private repo: string;
  private currentVersion: string;
  private checkInterval: number;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(owner: string, repo: string, currentVersion: string) {
    this.owner = owner;
    this.repo = repo;
    this.currentVersion = currentVersion;
    this.checkInterval = 1000 * 60 * 60; // каждый час
  }

  async checkForUpdates(): Promise<GitHubRelease | null> {
    try {
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) return null;

      const release: GitHubRelease = await res.json();
      const latestVersion = release.tag_name.replace(/^v/, '');
      const current = this.currentVersion.replace(/^v/, '');

      if (this.isNewer(latestVersion, current)) {
        return release;
      }
      return null;
    } catch {
      return null; // Нет сети — тихо игнорируем
    }
  }

  private isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map(Number);
    const [la, lb, lc] = parse(latest);
    const [ca, cb, cc] = parse(current);
    if (la !== ca) return la > ca;
    if (lb !== cb) return lb > cb;
    return (lc || 0) > (cc || 0);
  }

  startAutoCheck(onUpdate: (release: GitHubRelease) => void): void {
    // Первая проверка через 10 секунд после запуска
    setTimeout(async () => {
      const release = await this.checkForUpdates();
      if (release) onUpdate(release);
    }, 10_000);

    // Периодические проверки
    this.intervalId = setInterval(async () => {
      const release = await this.checkForUpdates();
      if (release) onUpdate(release);
    }, this.checkInterval);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
