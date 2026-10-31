import { CircleCheck, CircleX, LoaderCircle, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { Modal } from '@/shared/ui/Modal';
import { backend, errorMessage, type ConnectionConfig, type DriverKind, type TlsMode } from '@/shared/api';
import { useConnections } from '../model/connections';
import { useUi, type SourcePrefill } from '@/shared/model/ui';
import { useWorkspace } from '@/features/workspace';
import { DriverBadge } from '@/shared/ui/NodeIcon';

interface Draft {
  config: ConnectionConfig;
  /** `null` keeps the stored password. */
  password: string | null;
  isNew: boolean;
  dirty: boolean;
}

const DEFAULTS: Record<DriverKind, Pick<ConnectionConfig, 'port' | 'user' | 'database'>> = {
  postgres: { port: 5432, user: 'postgres', database: 'postgres' },
  clickhouse: { port: 8123, user: 'default', database: 'default' },
};
const DRIVER_NAMES: Record<DriverKind, string> = { postgres: 'PostgreSQL', clickhouse: 'ClickHouse' };
const COLORS = [null, '#9d7cff', '#5fb3ff', '#4fc4a6', '#e3b341', '#ff7a90'];

function newDraft(driver: DriverKind): Draft {
  return {
    config: {
      id: crypto.randomUUID(),
      name: `${driver}@localhost`,
      driver,
      host: 'localhost',
      ...DEFAULTS[driver],
      tls: 'disable',
      savePassword: true,
      color: null,
    },
    password: '',
    isNew: true,
    dirty: true,
  };
}

function connectionUrl(c: ConnectionConfig): string {
  if (c.driver === 'postgres') {
    return `postgresql://${c.user ? `${c.user}@` : ''}${c.host}:${c.port}/${c.database}${c.tls !== 'disable' ? `?sslmode=${c.tls}` : ''}`;
  }
  return `${c.tls === 'require' ? 'https' : 'http'}://${c.host}:${c.port}/?database=${c.database || 'default'}`;
}

type TestState = { status: 'idle' } | { status: 'running' } | { status: 'ok'; version: string } | { status: 'error'; message: string };

export function DataSourcesDialog() {
  const open = useUi((s) => s.dataSourcesOpen);
  return open ? <Dialog /> : null;
}

function Dialog() {
  const saved = useConnections((s) => s.list);
  const initialSelection = useUi((s) => s.dataSourcesSelection);
  const close = useUi((s) => s.closeDataSources);
  const openMenu = useUi((s) => s.openMenu);

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const entries = saved.map((config) => [config.id, { config, password: null, isNew: false, dirty: false }]);
    return Object.fromEntries(entries);
  });
  const [order, setOrder] = useState<string[]>(() => saved.map((c) => c.id));
  const [selected, setSelected] = useState<string | null>(initialSelection?.startsWith('new') ? null : (initialSelection ?? saved[0]?.id ?? null));
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (driver: DriverKind, prefill?: SourcePrefill | null) => {
    const draft = newDraft(driver);
    if (prefill) {
      const { password, ...config } = prefill;
      draft.config = { ...draft.config, ...config };
      if (password !== undefined) draft.password = password;
    }
    setDrafts((d) => ({ ...d, [draft.config.id]: draft }));
    setOrder((o) => [...o, draft.config.id]);
    setSelected(draft.config.id);
  };

  // 'new' or 'new:<driver>' opens the dialog on a fresh data source (once, even when
  // StrictMode runs the effect twice).
  const added = useRef(false);
  useEffect(() => {
    if (added.current) return;
    added.current = true;
    if (initialSelection?.startsWith('new')) {
      add((initialSelection.split(':')[1] as DriverKind | undefined) ?? 'postgres', useUi.getState().dataSourcesPrefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setTest({ status: 'idle' }), [selected]);

  const draft = selected ? drafts[selected] : undefined;
  const update = (patch: Partial<ConnectionConfig>, password?: string) => {
    if (!draft) return;
    setDrafts((d) => ({
      ...d,
      [draft.config.id]: {
        ...draft,
        config: { ...draft.config, ...patch },
        password: password === undefined ? draft.password : password,
        dirty: true,
      },
    }));
  };

  const changeDriver = (driver: DriverKind) => {
    if (!draft || driver === draft.config.driver) return;
    const old = DEFAULTS[draft.config.driver];
    const next = DEFAULTS[driver];
    update({
      driver,
      port: draft.config.port === old.port ? next.port : draft.config.port,
      user: draft.config.user === old.user ? next.user : draft.config.user,
      database: draft.config.database === old.database ? next.database : draft.config.database,
      name: draft.config.name === `${draft.config.driver}@${draft.config.host}` ? `${driver}@${draft.config.host}` : draft.config.name,
    });
  };

  const showAddMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: 'PostgreSQL', onSelect: () => add('postgres') },
      { label: 'ClickHouse', onSelect: () => add('clickhouse') },
    ]);
  };

  const remove = async () => {
    if (!draft) return;
    if (!draft.isNew) {
      const ok = await useUi.getState().ask({
        title: 'Delete Data Source',
        message: `Delete data source “${draft.config.name}”? Its query consoles are deleted too.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok === null) return;
      await useConnections.getState().remove(draft.config.id);
      useWorkspace.getState().forgetConnection(draft.config.id);
    }
    const rest = order.filter((id) => id !== draft.config.id);
    setOrder(rest);
    setDrafts((d) => {
      const copy = { ...d };
      delete copy[draft.config.id];
      return copy;
    });
    setSelected(rest[0] ?? null);
  };

  const runTest = async () => {
    if (!draft) return;
    setTest({ status: 'running' });
    try {
      const version = await backend.testConnection(draft.config, draft.password || (draft.isNew ? '' : null));
      setTest({ status: 'ok', version });
    } catch (e) {
      setTest({ status: 'error', message: errorMessage(e) });
    }
  };

  const apply = async (): Promise<string[]> => {
    setSaving(true);
    setError(null);
    const created: string[] = [];
    try {
      for (const id of order) {
        const d = drafts[id];
        if (!d?.dirty) continue;
        if (!d.config.name.trim() || !d.config.host.trim()) throw new Error('Name and host are required');
        const password = d.password === '' && !d.isNew ? null : d.password;
        await useConnections.getState().save(d.config, password);
        if (d.isNew) created.push(id);
        setDrafts((all) => ({ ...all, [id]: { ...d, isNew: false, dirty: false, password: null } }));
      }
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setSaving(false);
    }
    return created;
  };

  const ok = async () => {
    try {
      const created = await apply();
      close();
      for (const id of created) useWorkspace.getState().openConsole(id);
    } catch {
      // Error shown in the dialog.
    }
  };

  const dirty = useMemo(() => Object.values(drafts).some((d) => d.dirty), [drafts]);

  return (
    <Modal
      title="Data Sources"
      width={860}
      onClose={close}
      footer={
        <>
          <div className="footer-left">
            <button type="button" className="link-btn" disabled={!draft || test.status === 'running'} onClick={runTest}>
              Test Connection
            </button>
            {test.status === 'running' && <LoaderCircle size={14} className="spin" />}
            {test.status === 'ok' && (
              <span className="test-ok">
                <CircleCheck size={14} /> Succeeded · {test.version}
              </span>
            )}
            {test.status === 'error' && (
              <span className="test-error" title={test.message}>
                <CircleX size={14} /> {test.message}
              </span>
            )}
            {error && <span className="test-error">{error}</span>}
          </div>
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!dirty || saving} onClick={() => void apply().catch(() => {})}>
            Apply
          </button>
          <button type="button" className="btn primary" disabled={saving} onClick={ok}>
            OK
          </button>
        </>
      }
    >
      <div className="datasources">
        <aside className="ds-list">
          <div className="ds-list-toolbar">
            <span className="label">Sources</span>
            <IconButton icon={Plus} label="Add data source" size={15} onClick={showAddMenu} />
            <IconButton icon={Minus} label="Remove data source" size={15} disabled={!draft} onClick={() => void remove()} />
          </div>
          <div className="ds-items">
          {order.map((id) => {
            const d = drafts[id];
            if (!d) return null;
            return (
              <button
                key={id}
                type="button"
                className={`ds-item${id === selected ? ' selected' : ''}`}
                onClick={() => setSelected(id)}
              >
                <DriverBadge driver={d.config.driver} connected={false} />
                <span className="ds-name">{d.config.name || 'unnamed'}</span>
                {d.dirty && <span className="ds-dirty">•</span>}
              </button>
            );
          })}
          </div>
        </aside>
        {draft ? (
          <div className="ds-form">
            <label className="field wide">
              <span>Name</span>
              <input value={draft.config.name} onChange={(e) => update({ name: e.target.value })} autoFocus />
            </label>

            <div className="field wide">
              <span>Driver</span>
              <div className="segmented">
                {(['postgres', 'clickhouse'] as DriverKind[]).map((driver) => (
                  <button
                    key={driver}
                    type="button"
                    className={draft.config.driver === driver ? 'on' : ''}
                    onClick={() => changeDriver(driver)}
                  >
                    {DRIVER_NAMES[driver]}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section label">General</div>
            <div className="field-row">
              <label className="field grow">
                <span>Host</span>
                <input value={draft.config.host} onChange={(e) => update({ host: e.target.value })} spellCheck={false} />
              </label>
              <label className="field port">
                <span>Port</span>
                <input
                  value={draft.config.port}
                  inputMode="numeric"
                  onChange={(e) => update({ port: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                />
              </label>
            </div>
            <label className="field">
              <span>User</span>
              <input value={draft.config.user} onChange={(e) => update({ user: e.target.value })} spellCheck={false} />
            </label>
            <div className="field-row">
              <label className="field grow">
                <span>Password</span>
                <input
                  type="password"
                  value={draft.password ?? ''}
                  placeholder={draft.isNew ? '' : '<hidden>'}
                  onChange={(e) => update({}, e.target.value)}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.config.savePassword}
                  onChange={(e) => update({ savePassword: e.target.checked })}
                />
                Save in Keychain
              </label>
            </div>
            <label className="field">
              <span>Database</span>
              <input value={draft.config.database} onChange={(e) => update({ database: e.target.value })} spellCheck={false} />
            </label>
            <label className="field">
              <span>{draft.config.driver === 'postgres' ? 'SSL mode' : 'Protocol'}</span>
              <select value={draft.config.tls} onChange={(e) => update({ tls: e.target.value as TlsMode })}>
                {draft.config.driver === 'postgres' ? (
                  <>
                    <option value="disable">disable</option>
                    <option value="prefer">prefer</option>
                    <option value="require">require</option>
                  </>
                ) : (
                  <>
                    <option value="disable">HTTP</option>
                    <option value="require">HTTPS</option>
                  </>
                )}
              </select>
            </label>
            <div className="field wide">
              <span>URL</span>
              <code className="url-preview">{connectionUrl(draft.config)}</code>
            </div>
            <div className="field wide">
              <span>Color</span>
              <div className="swatches">
                {COLORS.map((color) => (
                  <button
                    key={color ?? 'none'}
                    type="button"
                    aria-label={color ?? 'No color'}
                    className={`swatch${draft.config.color === color ? ' on' : ''}${color ? '' : ' none'}`}
                    style={color ? { background: color } : undefined}
                    onClick={() => update({ color })}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="ds-form empty">Add a data source with +</div>
        )}
      </div>
    </Modal>
  );
}
