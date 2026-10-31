import {
  CircleCheck,
  Database,
  Eye,
  Folder,
  KeyRound,
  Layers,
  Link2,
  ListOrdered,
  SquareFunction,
  Table2,
  TableProperties,
  type LucideIcon,
} from 'lucide-react';

import { siClickhouse, siPostgresql } from 'simple-icons';

import type { DriverKind, NodeIcon as Icon } from '../api';

const ICONS: Record<Exclude<Icon, 'column'>, [LucideIcon, string]> = {
  database: [Database, '#d98af5'],
  schema: [Layers, '#c9beb3'],
  folder: [Folder, 'rgba(244, 240, 235, 0.45)'],
  table: [Table2, '#e7dfd6'],
  view: [Eye, '#e9b8fb'],
  materializedView: [TableProperties, '#ff8f80'],
  function: [SquareFunction, '#d98af5'],
  primaryKeyColumn: [KeyRound, '#f5c26b'],
  key: [KeyRound, '#f5c26b'],
  foreignKey: [Link2, '#8fe3b0'],
  index: [ListOrdered, 'rgba(244, 240, 235, 0.45)'],
  check: [CircleCheck, '#8fe3b0'],
};

export function NodeIcon({ icon }: { icon: Icon }) {
  if (icon === 'column') {
    return (
      <svg className="node-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <rect x="2.5" y="4" width="9" height="6" rx="1.2" fill="none" stroke="#c9beb3" strokeWidth="1.3" />
        <rect x="2.5" y="4" width="3.4" height="6" rx="1" fill="#c9beb3" opacity="0.55" />
      </svg>
    );
  }
  const [Component, color] = ICONS[icon];
  return <Component className="node-icon" size={14} color={color} strokeWidth={1.8} />;
}

const DRIVER_LOGOS: Record<DriverKind, { path: string; color: string; title: string }> = {
  postgres: { path: siPostgresql.path, color: '#6b8fe8', title: 'PostgreSQL' },
  clickhouse: { path: siClickhouse.path, color: `#${siClickhouse.hex}`, title: 'ClickHouse' },
};

/** Database logo of a data source, with a dot when it is connected. */
export function DriverBadge({ driver, connected, size = 15 }: { driver: DriverKind; connected: boolean; size?: number }) {
  const logo = DRIVER_LOGOS[driver];
  return (
    <span className="driver-badge" title={logo.title}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d={logo.path} fill={logo.color} />
      </svg>
      {connected && <span className="connected-dot" />}
    </span>
  );
}
