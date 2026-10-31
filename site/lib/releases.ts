export const RELEASES_REPO = 'lsalenson/datowl';
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases/latest`;

export type OS = 'mac' | 'windows' | 'linux';

export type Asset = { name: string; browser_download_url: string };

// Installer patterns per OS, most preferred first.
export const PLATFORMS: Record<OS, { name: string; match: RegExp[] }> = {
  mac: { name: 'macOS', match: [/universal\.dmg$/i, /\.dmg$/i] },
  windows: { name: 'Windows', match: [/setup\.exe$/i, /\.msi$/i, /\.exe$/i] },
  linux: { name: 'Linux', match: [/\.AppImage$/i, /\.deb$/i, /\.rpm$/i] },
};

export function detectOS(): OS | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform || nav.platform || nav.userAgent).toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('win')) return 'windows';
  if (p.includes('linux') || p.includes('x11')) return 'linux';
  return null;
}

export function pickAsset(assets: Asset[], os: OS): Asset | null {
  for (const re of PLATFORMS[os].match) {
    const asset = assets.find((a) => re.test(a.name));
    if (asset) return asset;
  }
  return null;
}

export async function fetchLatest(): Promise<{ version: string; assets: Asset[] } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`);
    if (!res.ok) return null;
    const release = await res.json();
    return { version: String(release.tag_name ?? '').replace(/^v/, ''), assets: release.assets ?? [] };
  } catch {
    return null;
  }
}
