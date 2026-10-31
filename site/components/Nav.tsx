import { RELEASES_URL } from '@/lib/releases';
import { Owl } from './Owl';

const LINKS: [string, string][] = [
  ['Performances', '#performances'],
  ['Télécharger', '#installer'],
  ['FAQ', '#faq'],
];

// Header as a row of cells split by hairlines, like Vibe's.
export function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a className="nav-cell nav-brand" href="#">
          <Owl />
          Datowl
        </a>
        <nav className="nav-links">
          {LINKS.map(([label, href]) => (
            <a key={href} className="nav-cell" href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-right">
          <a className="nav-cell nav-muted" href={RELEASES_URL}>
            Versions
          </a>
          <a className="nav-cell nav-cta" href="#installer">
            Installer
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v12m0 0-5-5m5 5 5-5" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
