import { ChevronRight, LockOpen } from 'lucide-react';

import { useConnections } from '@/features/connections';
import { useProjects } from '@/features/projects';
import { PAGE_SIZES, useUi } from '@/shared/model/ui';
import { tabTitle, useWorkspace } from '@/features/workspace';

/** Breadcrumbs on the left, editor and connection widgets on the right. */
/** `project › folder › file` for a file of the project folder. */
function fileCrumbs(path: string, projectName?: string, projectPath?: string | null): string[] {
  if (projectPath && path.startsWith(`${projectPath}/`)) {
    return [projectName ?? '', ...path.slice(projectPath.length + 1).split('/')];
  }
  return path.split('/').filter(Boolean);
}

export function StatusBar() {
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId));
  const project = useProjects((s) => s.current);
  const connection = useConnections((s) => s.list.find((c) => c.id === tab?.connectionId));
  const state = useConnections((s) => (tab ? s.state[tab.connectionId] : undefined));
  const schema = useConnections((s) => (tab ? s.schema[tab.connectionId]?.defaultSchema : undefined));
  const caret = useUi((s) => s.caret);
  const pageSize = useUi((s) => s.pageSize);
  const setPageSize = useUi((s) => s.setPageSize);
  const openMenu = useUi((s) => s.openMenu);

  const status = state?.status ?? 'idle';
  // Path of the active object, as in DataGrip's navigation bar.
  const crumbs = tab?.kind === 'file'
    ? fileCrumbs(tab.path, project?.name, project?.path)
    : !connection || !tab
    ? [project?.name ?? 'datowl']
    : tab.kind === 'console'
      ? ['Consoles', connection.name, tabTitle(tab)]
      : [
          'Database',
          connection.name,
          ...(tab.object.schema ? [tab.object.schema] : connection.driver === 'clickhouse' ? [tab.object.database] : []),
          tab.object.kind === 'function' ? 'routines' : tab.object.kind === 'table' ? 'tables' : 'views',
          tab.object.name,
        ];

  return (
    <footer className="statusbar">
      <span className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="crumb">
            {i > 0 && <ChevronRight size={11} />}
            {c}
          </span>
        ))}
      </span>
      <span className="toolbar-spacer" />
      {tab?.kind === 'console' && caret && (
        <span className="status-item">
          {caret.line}:{caret.column}
        </span>
      )}
      <span className="status-item">LF</span>
      <span className="status-item">UTF-8</span>
      <span className="status-item">4 spaces</span>
      <button
        type="button"
        className="status-item clickable"
        title="Rows fetched per page"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(
            r.left,
            r.top - 12 - PAGE_SIZES.length * 30,
            PAGE_SIZES.map((size) => ({
              label: `${size.toLocaleString('en-US')} rows${size === pageSize ? '  ✓' : ''}`,
              onSelect: () => setPageSize(size),
            })),
          );
        }}
      >
        {pageSize.toLocaleString('en-US')} rows
      </button>
      {connection && (
        <span className={`status-item conn-${status}`} title={state?.error ?? state?.serverVersion}>
          <span className="status-dot" />
          {schema ?? connection.database}
        </span>
      )}
      <span className="status-item" title="Read-write">
        <LockOpen size={12} />
      </span>
    </footer>
  );
}
