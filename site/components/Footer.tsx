'use client';

import { type OS, PLATFORMS, RELEASES_URL } from '@/lib/releases';
import { useRelease } from '@/lib/useRelease';
import { OS_ICONS } from './InstallGrid';
import { OwlMark } from './OwlMark';

const COLUMNS: [string, [string, string][]][] = [
  ['Produit', [['Télécharger', '#installer'], ['Notes de version', RELEASES_URL], ['Questions fréquentes', '#faq']]],
  ['Bases de données', [['PostgreSQL', '#faq'], ['ClickHouse', '#faq'], ['Compatibles PostgreSQL', '#faq']]],
  ['Aide', [['Premier lancement sur macOS', '#faq'], ['Mises à jour', '#faq'], ['Mots de passe et sécurité', '#faq']]],
];

// Footer after Vibe's: link columns, a row with links and download badges, then the
// logo standing on bands of the app's colours.
export function Footer() {
  const { found } = useRelease();

  return (
    <footer className="footer">
      <div className="footer-cols-wrap">
        <div className="footer-cols">
          {COLUMNS.map(([title, links], i) => (
            <div key={title} data-reveal style={{ '--i': i } as React.CSSProperties}>
              <p className="footer-title">{title}</p>
              {links.map(([label, href]) => (
                <a key={label} href={href}>
                  {label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="footer-inner">
        <div className="footer-row">
          <a className="footer-icon" href={RELEASES_URL} aria-label="Versions sur GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
            </svg>
          </a>
          <div className="footer-get">
            <span>Obtenir Datowl</span>
            <div className="badges">
              {(Object.keys(PLATFORMS) as OS[]).map((k) => (
                <a key={k} className="badge" href={found[k]?.browser_download_url ?? RELEASES_URL}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    {OS_ICONS[k]}
                  </svg>
                  <span>
                    <small>Télécharger pour</small>
                    {PLATFORMS[k].name}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-base">
          <span>Datowl © {new Date().getFullYear()}</span>
          <div className="footer-logo" aria-hidden="true">
            <OwlMark />
          </div>
          <span>Gratuit · PostgreSQL · ClickHouse</span>
        </div>
      </div>

      <div className="stripes" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
    </footer>
  );
}
