// Parses a pasted connection URL into a data source, like DataGrip's
// "Data Source from URL". Accepts libpq, JDBC and ClickHouse HTTP forms.

import type { DriverKind, TlsMode } from '@/shared/api';
import type { SourcePrefill } from '@/shared/model/ui';

const SCHEMES: Record<string, DriverKind> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  clickhouse: 'clickhouse',
  ch: 'clickhouse',
  http: 'clickhouse',
  https: 'clickhouse',
};

// Datowl talks to ClickHouse over HTTP: map the native protocol ports to theirs.
const CLICKHOUSE_NATIVE_PORTS: Record<number, number> = { 9000: 8123, 9440: 8443 };

export function parseConnectionUrl(text: string): SourcePrefill {
  const raw = text.trim().replace(/^jdbc:/i, '');
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1].toLowerCase();
  const driver = scheme ? SCHEMES[scheme] : undefined;
  if (!driver) throw new Error('Unsupported URL: expected postgresql://, clickhouse:// or http(s)://');

  let url: URL;
  try {
    // Parse as http so every engine fills host, port and credentials the same way.
    url = new URL(raw.replace(/^[^:]+:/, scheme === 'https' ? 'https:' : 'http:'));
  } catch {
    throw new Error('Malformed URL');
  }
  const params = url.searchParams;
  const decode = (s: string) => (s ? decodeURIComponent(s) : '');
  const flag = (name: string) => /^(1|true|yes|on)$/i.test(params.get(name) ?? '');
  // http:// parsing drops default ports (80/443) from `url.port`: read them back from the text.
  const explicitPort = /^[^/]*\/\/(?:[^@/]*@)?(?:\[[^\]]*\]|[^:/?#]*):(\d+)/.exec(raw)?.[1];
  let port = explicitPort ? Number(explicitPort) : undefined;
  const user = decode(url.username) || params.get('user') || params.get('username') || undefined;
  const password = decode(url.password) || params.get('password') || undefined;
  const path = decode(url.pathname.replace(/^\/+/, '').split('/')[0]);
  const host = url.hostname.replace(/^\[|\]$/g, '') || 'localhost';

  let tls: TlsMode;
  let database: string | undefined;
  if (driver === 'postgres') {
    const sslmode = params.get('sslmode');
    tls = sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full' || flag('ssl') ? 'require' : sslmode === 'disable' ? 'disable' : 'prefer';
    database = path || params.get('dbname') || undefined;
    port ??= 5432;
  } else {
    const secure = scheme === 'https' || flag('secure') || flag('ssl');
    tls = secure ? 'require' : 'disable';
    database = path || params.get('database') || undefined;
    if (port !== undefined && CLICKHOUSE_NATIVE_PORTS[port]) port = CLICKHOUSE_NATIVE_PORTS[port];
    port ??= secure ? 8443 : 8123;
  }

  return {
    driver,
    name: `${database ?? (driver === 'postgres' ? 'postgres' : 'default')}@${host}`,
    host,
    port,
    tls,
    ...(user !== undefined && { user }),
    ...(database !== undefined && { database }),
    ...(password !== undefined && { password }),
  };
}
