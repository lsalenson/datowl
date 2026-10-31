// Measured on 2026-10-31: medians and raw runs copied from docs/benchmarks/results.json
// (method and limits in docs/benchmarks/README.md). Do not edit by hand; re-run the
// benchmark and copy the new values.

export const METHOD_URL = 'https://github.com/lsalenson/datowl/blob/main/docs/benchmarks/README.md';

export type AppId = 'datowl' | 'datagrip' | 'dbeaver';
export type Cache = 'warm' | 'cold';

export const APPS: Record<AppId, { name: string; note?: string }> = {
  datowl: { name: 'Datowl' },
  datagrip: { name: 'DataGrip', note: 'mesuré jusqu’à son contrat utilisateur' },
  dbeaver: { name: 'DBeaver', note: 'espace de travail ouvert' },
};

type Series = { median: number; runs: number[] };
type Metric = {
  id: string;
  label: string;
  title: string;
  unit: string;
  decimals: number;
  // "less is better" for every metric here; the ratio is computed against Datowl.
  verb: string;
  note: string;
  // Per-metric caption under an app's name, when the bar needs explaining.
  appNotes?: Partial<Record<AppId, string>>;
  values: Record<Cache, Record<AppId, Series>> | Record<AppId, Series>;
};

const s = (median: number, runs: number[]): Series => ({ median, runs });
const once = (v: number): Series => ({ median: v, runs: [] });

export const METRICS: Metric[] = [
  {
    id: 'start',
    label: 'Démarrage',
    title: 'Temps jusqu’à l’écran prêt',
    unit: 's',
    decimals: 2,
    verb: 'plus rapide',
    note: 'Du lancement à l’écran affiché et stable. DataGrip n’a pu être mesuré que jusqu’à son contrat utilisateur (pas de licence) : l’IDE réellement ouvert met au moins autant.',
    values: {
      warm: {
        datowl: s(2.29, [2.247, 2.129, 2.642, 2.29, 2.387]),
        datagrip: s(4.366, [4.038, 4.849, 4.515, 4.366, 4.362]),
        dbeaver: s(6.275, [6.235, 6.174, 6.364, 6.275, 6.993]),
      },
      cold: {
        datowl: s(2.842, [2.676, 2.848, 3.043, 2.842, 2.793]),
        datagrip: s(5.619, [5.619, 4.774, 5.298, 5.846, 5.966]),
        dbeaver: s(8.264, [8.247, 9.038, 8.264, 9.277, 7.47]),
      },
    },
  },
  {
    id: 'cpu',
    label: 'CPU au lancement',
    title: 'Temps CPU consommé pendant les 30 premières secondes',
    unit: 's',
    decimals: 1,
    verb: 'moins de CPU',
    note: 'Somme user + sys de tous les processus de l’app, du lancement à +30 s.',
    values: {
      warm: {
        datowl: s(7.763, [7.383, 7.543, 8.453, 8.031, 7.763]),
        datagrip: s(15.822, [14.609, 17.633, 16.302, 15.822, 15.778]),
        dbeaver: s(18.032, [18.129, 18.032, 17.961, 17.982, 19.108]),
      },
      cold: {
        datowl: s(9.075, [8.437, 9.075, 9.521, 8.996, 9.159]),
        datagrip: s(19.024, [19.024, 17.191, 18.361, 19.747, 20.761]),
        dbeaver: s(21.228, [21.228, 24.02, 21.145, 22.945, 18.539]),
      },
    },
  },
  {
    id: 'idle',
    label: 'CPU au repos',
    title: 'CPU utilisé quand l’app ne fait rien',
    unit: '%',
    decimals: 2,
    verb: 'moins de CPU',
    note: 'Moyenne entre +20 s et +30 s après le lancement, en pourcentage d’un cœur.',
    values: {
      warm: {
        datowl: s(0.03, [0.03, 0.03, 0.03, 0.03, 0.03]),
        datagrip: s(1.73, [1.69, 2.39, 1.86, 1.62, 1.73]),
        dbeaver: s(1.89, [1.67, 2.11, 1.89, 1.64, 2.12]),
      },
      cold: {
        datowl: s(0.03, [0.03, 0.03, 0.03, 0.03, 0.03]),
        datagrip: s(2.12, [1.88, 2.22, 1.86, 2.12, 2.32]),
        dbeaver: s(2.06, [1.91, 2.41, 2.4, 2.06, 1.89]),
      },
    },
  },
  {
    id: 'ram',
    label: 'Mémoire',
    title: 'Mémoire occupée 30 s après le lancement',
    unit: 'Mo',
    decimals: 0,
    verb: 'moins de mémoire',
    note: 'PSS de tous les processus, WebKit compris pour Datowl. Mesuré sous Linux avec un rendu logiciel, qui alourdit WebKit ; sur macOS, non mesuré.',
    values: {
      warm: {
        datowl: s(473.2, [473.2, 472.1, 474.2, 473.3, 469.5]),
        datagrip: s(809.4, [801.8, 809.4, 803.2, 812.3, 812.7]),
        dbeaver: s(528.4, [523, 528.4, 536.6, 543, 524.5]),
      },
      cold: {
        datowl: s(469.2, [471.7, 469.2, 469.2, 465.4, 465.2]),
        datagrip: s(793.3, [789, 795.7, 793.3, 792.5, 810]),
        dbeaver: s(526.1, [526.1, 527.6, 536.9, 525, 518.6]),
      },
    },
  },
  {
    id: 'disk',
    label: 'Disque',
    title: 'Taille installée',
    unit: 'Mo',
    decimals: 1,
    verb: 'plus léger',
    note: 'Datowl s’appuie sur le WebKit du système, compté ici (128 Mo de paquets WebKitGTK sous Linux ; sur macOS il fait partie du système et l’app seule pèse 14,9 Mo). DataGrip et DBeaver embarquent leur propre JVM.',
    // Datowl = its 14.9 MB binary + the 128 MB WebKitGTK packages it needs on Linux.
    appNotes: { datowl: 'app 14,9 Mo + WebKit système 128 Mo' },
    values: { datowl: once(142.9), datagrip: once(2956.6), dbeaver: once(213) },
  },
];

export function seriesFor(metric: Metric, cache: Cache): Record<AppId, Series> {
  const v = metric.values as Record<string, unknown>;
  return ('warm' in v ? v[cache] : v) as Record<AppId, Series>;
}

export const hasCacheModes = (metric: Metric) => 'warm' in (metric.values as Record<string, unknown>);
