'use client';

import { type OS, PLATFORMS, RELEASES_URL } from '@/lib/releases';
import { useRelease } from '@/lib/useRelease';

export const OS_ICONS: Record<OS, React.ReactNode> = {
  mac: <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8ZM14.1 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.7-1.3Z" fill="currentColor" stroke="none" />,
  windows: <path d="M3 5.5 10 4.5v7H3zM11 4.3 21 3v8.5H11zM3 12.5h7v7l-7-1zM11 12.5h10V21l-10-1.4z" fill="currentColor" stroke="none" />,
  linux: (
    <>
      <path d="M12 3c-2 0-3.2 1.7-3.2 4v2.3c0 1-.9 2-1.7 3.3-.9 1.4-1.6 3-1.6 4.4 0 .5.1 1 .4 1.4M12 3c2 0 3.2 1.7 3.2 4v2.3c0 1 .9 2 1.7 3.3.9 1.4 1.6 3 1.6 4.4 0 .5-.1 1-.4 1.4" />
      <path d="M8 19.5c1 .8 2.4 1.2 4 1.2s3-.4 4-1.2M10.5 7.5h.01M13.5 7.5h.01" />
    </>
  ),
};

const DESCRIPTIONS: Record<OS, string> = {
  mac: 'Une seule app pour Apple Silicon et Intel, macOS 11 ou plus récent. Mises à jour automatiques.',
  windows: 'Un installateur classique pour Windows 10 et 11.',
  linux: 'AppImage portable ou paquet .deb pour les distributions courantes.',
};

// Vibe's plan grid: a title on the frame's edge, then four cells between full-width rules.
export function InstallGrid() {
  const { os, version, found } = useRelease();

  return (
    <section className="install" id="installer">
      <div className="install-head">
        <h2 data-reveal>Commencez à utiliser Datowl.</h2>
      </div>
      <div className="install-row">
        <div className="cells">
          <div className="cell cell-free" data-reveal>
            <div className="cell-top">
              <svg className="cell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
              </svg>
              <h3>Gratuit.</h3>
            </div>
            <p>
              Toutes les fonctionnalités, sans compte et sans limite de sources ni de lignes.
              {version && <span className="cell-version"> Version {version}.</span>}
            </p>
          </div>
          {(Object.keys(PLATFORMS) as OS[]).map((k, i) => {
            const asset = found[k];
            const pending = version !== null && !asset;
            return (
              <a
                key={k}
                className={`cell cell-os${k === os ? ' current' : ''}${pending ? ' pending' : ''}`}
                href={asset?.browser_download_url ?? RELEASES_URL}
                download={asset ? '' : undefined}
                aria-disabled={pending || undefined}
                data-reveal
                style={{ '--i': i + 1 } as React.CSSProperties}
              >
                <div className="cell-top">
                  <svg className="cell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    {OS_ICONS[k]}
                  </svg>
                  <h3>{PLATFORMS[k].name}.</h3>
                </div>
                <p>{pending ? 'Bientôt disponible.' : DESCRIPTIONS[k]}</p>
                <svg className="cell-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v12m0 0-5-5m5 5 5-5M6 20h12" />
                </svg>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
