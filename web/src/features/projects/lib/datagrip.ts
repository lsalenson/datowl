// Reads the data sources of a DataGrip project (`.idea/dataSources.xml`, user names in
// `.idea/dataSources.local.xml`). Passwords stay in DataGrip's encrypted storage.

import type { ConnectionConfig, DatagripFiles } from '@/shared/api';
import { parseConnectionUrl } from '@/features/connections';

const DRIVERS: Record<string, ConnectionConfig['driver']> = {
  postgresql: 'postgres',
  postgres: 'postgres',
  clickhouse: 'clickhouse',
};

export function parseDatagripSources(files: DatagripFiles): ConnectionConfig[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(files.dataSources, 'application/xml');
  const local = files.local ? parser.parseFromString(files.local, 'application/xml') : null;
  const users = new Map<string, string>();
  for (const source of local?.querySelectorAll('data-source') ?? []) {
    const user = source.querySelector('user-name')?.textContent;
    const uuid = source.getAttribute('uuid');
    if (uuid && user) users.set(uuid, user);
  }

  const sources: ConnectionConfig[] = [];
  for (const source of doc.querySelectorAll('data-source')) {
    const driver = DRIVERS[source.querySelector('driver-ref')?.textContent?.trim().toLowerCase() ?? ''];
    const url = source.querySelector('jdbc-url')?.textContent?.trim();
    if (!driver || !url) continue;
    try {
      const { password: _ignored, ...parsed } = parseConnectionUrl(url);
      const uuid = source.getAttribute('uuid') ?? '';
      sources.push({
        id: crypto.randomUUID(),
        name: source.getAttribute('name') ?? parsed.name ?? url,
        driver,
        host: parsed.host ?? 'localhost',
        port: parsed.port ?? (driver === 'postgres' ? 5432 : 8123),
        user: users.get(uuid) ?? parsed.user ?? '',
        database: parsed.database ?? '',
        tls: parsed.tls ?? 'disable',
        savePassword: false,
        color: null,
      });
    } catch {
      // Not a URL Datowl understands (another driver's syntax): skip it.
    }
  }
  return sources;
}
