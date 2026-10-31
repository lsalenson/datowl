'use client';

import { useEffect, useRef, useState } from 'react';
import { HeroConsole, QUERIES, type Result } from './HeroConsole';
import { InstallButton } from './InstallButton';

// Native console width and the height of its suggestion list below the bar (gap included).
const CONSOLE_WIDTH = 540;
const LIST_DROP = 190;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v11m0 0-4-4m4 4 4-4" />
    </svg>
  );
}

// Hero row (¼ pitch, ½ orchid field, ¼ empty). The field is a full-screen layer clipped to
// its cell; scrolling opens the clip to the whole screen, then the console turns into a
// chip and the last query's result lands in a card below it.
export function HeroStage() {
  const stage = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState<{ sql: string; result: Result }>({ sql: QUERIES[0].sql, result: QUERIES[0].result });
  const [phase, setPhase] = useState({ expanding: false, demo: 0 });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const s = sticky.current, sl = slot.current, p = panel.current, c = center.current, st = stage.current;
      if (!s || !sl || !p || !c || !st) return;
      const animated = window.matchMedia('(min-width: 761px) and (prefers-reduced-motion: no-preference)').matches;
      st.dataset.animated = String(animated);
      const vh = window.innerHeight;
      const y = window.scrollY;
      const e = animated ? ease(clamp(y / (vh * 0.6))) : 0;
      const d = animated ? clamp((y - vh * 0.65) / (vh * 0.7)) : 0;

      const W = s.clientWidth, H = s.clientHeight;
      const k = 1 - e;
      const top = sl.offsetTop * k;
      const left = sl.offsetLeft * k;
      const right = (W - sl.offsetLeft - sl.offsetWidth) * k;
      const bottom = Math.max(0, H - sl.offsetTop - sl.offsetHeight) * k;
      p.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;

      // The console is drawn at full-screen size and shrunk into the cell, its bar spanning
      // 53% of the cell like Vibe's prompt; it grows back as the field opens.
      const s0 = animated ? (0.53 * sl.offsetWidth) / CONSOLE_WIDTH : Math.min(1, (sl.offsetWidth - 32) / CONSOLE_WIDTH);
      const scale = s0 + (1 - s0) * e;
      // Centre the bar + list group, not just the bar (the list hangs below it).
      const lift = (LIST_DROP / 2) * scale * (1 - e);
      const fromX = sl.offsetLeft + sl.offsetWidth / 2;
      const fromY = sl.offsetTop + sl.offsetHeight / 2;
      c.style.left = `${fromX + (W / 2 - fromX) * e}px`;
      c.style.top = `${fromY + (H / 2 - fromY) * e - lift}px`;
      c.style.setProperty('--s', String(scale));

      setPhase((ph) => {
        const next = { expanding: e > 0.06, demo: d };
        return ph.expanding === next.expanding && Math.abs(ph.demo - next.demo) < 0.001 ? ph : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    if (sticky.current) ro.observe(sticky.current);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const { demo } = phase;
  const chip = clamp(demo * 3);
  const card = clamp(demo * 2.2 - 0.35);
  const content = clamp(demo * 2.2 - 0.9);

  return (
    <section className="stage" ref={stage}>
      <div className="stage-sticky" ref={sticky}>
        <div className="stage-grid">
          <div className="stage-side">
            <div className="arrows" aria-hidden="true">
              <Arrow />
              <Arrow />
              <Arrow />
            </div>
            <div>
              <p className="hero-lead">L’IDE base de données pensé pour la vitesse, pour PostgreSQL et ClickHouse. Gratuit.</p>
              <InstallButton />
            </div>
          </div>
          <div className="stage-slot" ref={slot} />
          <div className="stage-empty" />
        </div>

        <div className={phase.expanding ? 'stage-panel expanding' : 'stage-panel'} ref={panel}>
          <div className="stage-center" ref={center}>
            <div className="stage-console" style={{ opacity: 1 - chip, pointerEvents: chip > 0.5 ? 'none' : undefined }}>
              <HeroConsole onRun={(sql, result) => setLast({ sql, result })} />
            </div>

            <div className="stage-demo" aria-hidden={demo === 0} style={{ visibility: demo > 0 ? 'visible' : 'hidden' }}>
              <div className="demo-chip" style={{ opacity: chip, transform: `translateY(${(1 - chip) * 40}px)` }}>
                {last.sql}
              </div>
              <div className="demo-line" style={{ transform: `scaleY(${chip})` }} />
              <div className="demo-card" style={{ opacity: card, transform: `translateY(${(1 - card) * 30}px) scale(${0.96 + card * 0.04})` }}>
                <div className="demo-card-inner" style={{ opacity: content }}>
                  <div className="demo-head">
                    <span className="demo-title">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
                        <path d="M2 6h12M6.5 6v7.5" />
                      </svg>
                      Résultat · {last.result.source}
                    </span>
                    <span className="demo-meta">
                      {last.result.rows.length} lignes · {last.result.ms} ms
                    </span>
                  </div>
                  <table className="demo-table">
                    <thead>
                      <tr>
                        {last.result.columns.map((col, j) => (
                          <th key={col} className={last.result.numeric.includes(j) ? 'r' : undefined}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {last.result.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <td key={j} className={last.result.numeric.includes(j) ? 'r n' : undefined}>
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="demo-foot">Les premières lignes s’affichent avant même la fin de la requête.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
