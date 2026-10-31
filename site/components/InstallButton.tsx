'use client';

import { PLATFORMS, RELEASES_URL } from '@/lib/releases';
import { useRelease } from '@/lib/useRelease';

// Points straight at the installer for the visitor's OS from the latest GitHub release;
// until a release is reachable it falls back to the releases page.
export function InstallButton({ light = false }: { light?: boolean }) {
  const { os, version, found } = useRelease();
  const asset = os ? found[os] : null;
  const unavailable = os !== null && version !== null && !asset;

  let label = 'Installer Datowl';
  if (os) label = unavailable ? `Bientôt sur ${PLATFORMS[os].name}` : `Installer pour ${PLATFORMS[os].name}`;

  return (
    <a
      className={light ? 'btn btn-dark' : 'btn'}
      href={asset?.browser_download_url ?? RELEASES_URL}
      download={asset ? '' : undefined}
      aria-disabled={unavailable || undefined}
    >
      {label}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </a>
  );
}
