import {
  ArrowDownToLine,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  FileCode2,
  Folder,
  LoaderCircle,
  Minus,
  Plus,
  Square,
  SquarePlus,
  SquareTerminal,
  Table2,
  Trash2,
  WrapText,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { useConnections } from '@/features/connections';
import { useOutput, type LogEntry } from '@/shared/model/output';
import { tabResults, useResults } from '../model/results';
import { useUi } from '@/shared/model/ui';
import { tabTitle, useWorkspace } from '@/features/workspace';
import { DriverBadge } from '@/shared/ui/NodeIcon';
import { cancelRun, formatMs } from '../model/runner';
import { ResultView } from './ResultView';

/** Services tool window, as in DataGrip: sessions on the left (one per open console or
 *  data editor), the output and result sets of the selected one on the right. */
export function ServicesPanel() {
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId));
  const consoleTab = tab?.kind === 'console' ? tab : undefined;
  const results = useResults(tabResults(consoleTab?.id ?? null));
  const running = useResults(tabResults(tab?.id ?? null)).running;
  const bottomTab = useUi((s) => s.bottomTab);
  const setBottomTab = useUi((s) => s.setBottomTab);
  const hide = useUi((s) => s.setServicesVisible);

  const active = results.sets.find((s) => s.id === results.activeSetId);
  const showResults = bottomTab === 'results' && consoleTab && active;

  return (
    <section className="card services">
      <header className="card-header">
        <span className="card-title">Services</span>
        <div className="card-actions">
          <IconButton icon={Minus} label="Hide" size={14} onClick={() => hide(false)} />
        </div>
      </header>
      <div className="services-body">
        <div className="services-rail">
          <IconButton icon={Square} tone="stop" label="Stop" size={11} disabled={!running} onClick={() => tab && void cancelRun(tab.id)} />
        </div>
        <SessionsTree />
        <div className="services-main">
          {consoleTab && (
            <nav className="tool-tabs">
              <button type="button" className={`tool-tab${!showResults ? ' active' : ''}`} onClick={() => setBottomTab('output')}>
                <SquareTerminal size={13} /> Output
              </button>
              {results.sets.map((set) => (
                <div key={set.id} className={`tool-tab${showResults && set.id === active?.id ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="tool-tab-label"
                    onClick={() => {
                      useResults.getState().activateSet(consoleTab.id, set.id);
                      setBottomTab('results');
                    }}
                    title={set.sql}
                  >
                    <Table2 size={13} /> {set.title}
                  </button>
                  <button
                    type="button"
                    className="tool-tab-close"
                    aria-label="Close result"
                    onClick={() => useResults.getState().closeSet(consoleTab.id, set.id)}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </nav>
          )}
          {showResults ? (
            <ResultView key={active.id} tabId={consoleTab.id} connectionId={consoleTab.connectionId} set={active} />
          ) : (
            <OutputView placeholder={tab?.kind === 'table' ? 'Data editor output' : 'Run a statement with ⌘↵ to see its output'} />
          )}
        </div>
      </div>
    </section>
  );
}

function SessionsTree() {
  const connections = useConnections((s) => s.list);
  const state = useConnections((s) => s.state);
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const workspace = useWorkspace.getState();
  const byTab = useResults((s) => s.byTab);
  const openMenu = useUi((s) => s.openMenu);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sessions = tabs.filter((t) => t.kind !== 'ddl');
  const sources = connections.filter((c) => state[c.id]?.status === 'connected' || sessions.some((t) => t.connectionId === c.id));
  const active = tabs.find((t) => t.id === activeId);

  const newMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(
      r.left,
      r.bottom + 4,
      connections.map((c) => ({ label: `New Console · ${c.name}`, onSelect: () => void workspace.newConsole(c.id) })),
    );
  };
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <div className="sessions-pane">
      <div className="toolbar sessions-toolbar">
        <IconButton icon={Plus} label="Add Service" size={14} onClick={newMenu} disabled={!connections.length} />
        <IconButton icon={Eye} label="View Options" size={14} disabled />
        <IconButton
          icon={SquarePlus}
          label="New Session"
          size={14}
          disabled={!active}
          onClick={() => active && void workspace.newConsole(active.connectionId)}
        />
        <IconButton icon={ChevronsUpDown} label="Expand All" size={14} onClick={() => setCollapsed({})} />
        <IconButton
          icon={ChevronsDownUp}
          label="Collapse All"
          size={14}
          onClick={() => setCollapsed(Object.fromEntries([['root', true], ...sources.map((c) => [c.id, true])]))}
        />
      </div>
      <div className="sessions">
        <button type="button" className="session-row depth-0" onClick={() => toggle('root')}>
          <ChevronDown size={12} className={`twisty${collapsed.root ? ' closed' : ''}`} />
          <Folder size={13} />
          <span>Database</span>
        </button>
        {!collapsed.root &&
          sources.map((c) => (
            <div key={c.id}>
              <button type="button" className="session-row depth-1" onClick={() => toggle(c.id)}>
                <ChevronDown size={12} className={`twisty${collapsed[c.id] ? ' closed' : ''}`} />
                <DriverBadge driver={c.driver} connected={state[c.id]?.status === 'connected'} />
                <span className="session-name">{c.name}</span>
              </button>
              {!collapsed[c.id] &&
                sessions
                  .filter((t) => t.connectionId === c.id)
                  .map((t) => {
                    const run = byTab[t.id];
                    const last = run?.sets.at(-1);
                    const Icon = t.kind === 'console' ? SquareTerminal : t.kind === 'file' ? FileCode2 : Table2;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`session-row depth-2${t.id === activeId ? ' selected' : ''}`}
                        onClick={() => workspace.activate(t.id)}
                      >
                        {run?.running ? <LoaderCircle size={13} className="spin" /> : <Icon size={13} className={`kind-${t.kind}`} />}
                        <span className="session-name">{tabTitle(t)}</span>
                        {last && !run?.running && <span className="session-time">{formatMs(last.elapsedMs)}</span>}
                      </button>
                    );
                  })}
            </div>
          ))}
      </div>
    </div>
  );
}

const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour12: false });

function OutputView({ placeholder }: { placeholder: string }) {
  const entries = useOutput((s) => s.entries);
  const clear = useOutput((s) => s.clear);
  const ref = useRef<HTMLDivElement>(null);
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [entries, follow]);

  return (
    <div className="output-pane">
      {entries.length === 0 ? (
        <div className="output empty">{placeholder}</div>
      ) : (
        <div className={`output${wrap ? '' : ' nowrap'}`} ref={ref}>
          {entries.map((entry: LogEntry) => (
            <div key={entry.id} className={`log-line level-${entry.level}`}>
              <span className="log-time">{time(entry.time)}</span>
              <span className="log-text">
                {entry.level === 'sql' && <span className="log-source">{entry.source}&gt; </span>}
                {entry.text}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="output-rail">
        <IconButton icon={WrapText} label="Soft-Wrap" size={14} active={wrap} onClick={() => setWrap(!wrap)} />
        <IconButton icon={ArrowDownToLine} label="Scroll to the End" size={14} active={follow} onClick={() => setFollow(!follow)} />
        <IconButton icon={Trash2} label="Clear All" size={14} onClick={clear} disabled={entries.length === 0} />
      </div>
    </div>
  );
}
