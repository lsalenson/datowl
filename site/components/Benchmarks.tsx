'use client';

import { useEffect, useRef, useState } from 'react';
import { APPS, type AppId, type Cache, hasCacheModes, METHOD_URL, METRICS, seriesFor } from '@/lib/benchmarks';

const ORDER: AppId[] = ['datowl', 'datagrip', 'dbeaver'];

const fmt = (v: number, decimals: number) =>
  v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Animates a number towards `to` whenever it changes (or when `run` flips on).
function useCount(to: number, run: boolean) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = origin + (to - origin) * eased;
      setValue(v);
      from.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [to, run]);
  return value;
}

function Bar({ app, median, runs, max, unit, decimals, note, shown }: { app: AppId; median: number; runs: number[]; max: number; unit: string; decimals: number; note?: string; shown: boolean }) {
  const value = useCount(median, shown);
  const pct = (v: number) => `${Math.max(0.6, (v / max) * 100)}%`;
  return (
    <div className={`bar-row bar-${app}`}>
      <div className="bar-label">
        <span className="bar-name">{APPS[app].name}</span>
        {(note ?? APPS[app].note) && <span className="bar-note">{note ?? APPS[app].note}</span>}
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: shown ? pct(median) : '0%' }} />
        {runs.map((r, i) => (
          <i key={i} className="bar-run" style={{ left: shown ? pct(r) : '0%' }} title={`${fmt(r, decimals)} ${unit}`} />
        ))}
      </div>
      <span className="bar-value">
        {fmt(value, decimals)}
        <small> {unit}</small>
      </span>
    </div>
  );
}

// Interactive comparison built only from the measured medians (docs/benchmarks).
export function Benchmarks() {
  const [metricId, setMetricId] = useState(METRICS[0].id);
  const [cache, setCache] = useState<Cache>('warm');
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const metric = METRICS.find((m) => m.id === metricId)!;
  const series = seriesFor(metric, cache);
  const max = Math.max(...ORDER.flatMap((a) => [series[a].median, ...series[a].runs]));
  const ratios = (['datagrip', 'dbeaver'] as AppId[]).map((a) => ({ app: a, x: series[a].median / series.datowl.median }));

  return (
    <div className="rule">
      <section className="frame bench" id="performances">
        <div className="bench-side">
          <h2 className="section-title" data-reveal>
            Mesuré, pas promis.
          </h2>
          <p className="bench-lead" data-reveal>
            Datowl, DataGrip et DBeaver lancés sur la même machine, avec la même méthode. Médiane de cinq lancements ; chaque point est un lancement.
          </p>
          <div className="bench-toggle" role="radiogroup" aria-label="Cache disque" data-reveal style={{ visibility: hasCacheModes(metric) ? 'visible' : 'hidden' }}>
            {(['warm', 'cold'] as Cache[]).map((c) => (
              <button key={c} role="radio" aria-checked={cache === c} className={cache === c ? 'on' : undefined} onClick={() => setCache(c)}>
                {c === 'warm' ? 'Cache chaud' : 'Cache froid'}
              </button>
            ))}
          </div>
          <p className="bench-meta" data-reveal>
            Ubuntu 24.04 · VM 4 vCPU, 16 Go · 31 octobre 2026
            <br />
            <a href={METHOD_URL}>Méthode, limites et données brutes ↗</a>
          </p>
        </div>

        <div className="bench-main" ref={ref}>
          <div className="bench-tabs" role="tablist">
            {METRICS.map((m) => (
              <button key={m.id} role="tab" aria-selected={m.id === metricId} className={m.id === metricId ? 'on' : undefined} onClick={() => setMetricId(m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="bench-panel" key={metric.id}>
            <div className="bench-head">
              <p className="bench-title">{metric.title}</p>
              <p className="bench-ratio">
                {ratios.map((r, i) => (
                  <span key={r.app}>
                    {i > 0 && <i> · </i>}
                    <b>{fmt(r.x, r.x >= 10 ? 0 : 1)}×</b> {metric.verb} que {APPS[r.app].name}
                  </span>
                ))}
              </p>
            </div>
            <div className="bars">
              {ORDER.map((a) => (
                <Bar key={a} app={a} median={series[a].median} runs={series[a].runs} max={max} unit={metric.unit} decimals={metric.decimals} note={metric.appNotes?.[a]} shown={shown} />
              ))}
            </div>
            <p className="bench-note">{metric.note}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
