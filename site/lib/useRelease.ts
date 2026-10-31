'use client';

import { useEffect, useState } from 'react';
import { type Asset, type OS, PLATFORMS, detectOS, fetchLatest, pickAsset } from './releases';

export type Release = {
  os: OS | null;
  version: string | null;
  found: Partial<Record<OS, Asset | null>>;
};

// One request per page load, shared by every install button.
let latest: ReturnType<typeof fetchLatest> | null = null;

export function useRelease(): Release {
  const [release, setRelease] = useState<Release>({ os: null, version: null, found: {} });

  useEffect(() => {
    const os = detectOS();
    setRelease((r) => ({ ...r, os }));
    latest ??= fetchLatest();
    latest.then((r) => {
      if (!r) return;
      const found = Object.fromEntries((Object.keys(PLATFORMS) as OS[]).map((k) => [k, pickAsset(r.assets, k)]));
      setRelease({ os, version: r.version, found });
    });
  }, []);

  return release;
}
