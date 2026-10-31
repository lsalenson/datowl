import { Check, ChevronDown, ChevronsRight, Ellipsis, FolderOpen, GitBranch, Plus, Search, Settings, Sparkles } from 'lucide-react';
import type { MouseEvent } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import { TOOL_WINDOWS, toggleToolWindow, toolWindow } from './toolWindows';
import { editorRegistry } from '@/features/editor';
import { backend, errorMessage, isTauri, type Project } from '@/shared/api';
import { useConnections } from '@/features/connections';
import { displayPath, projectBadge, useProjects } from '@/features/projects';
import { tabResults, useResults } from '@/features/query';
import { useUpdates } from '@/features/updates';
import { useUi, type MenuItem } from '@/shared/model/ui';
import { useWorkspace } from '@/features/workspace';

export function ProjectBadge({ name, size = 18 }: { name: string; size?: number }) {
  const { initials, color } = projectBadge(name);
  return (
    <span className="project-badge" style={{ background: color, width: size, height: size, fontSize: size * 0.5 }}>
      {initials}
    </span>
  );
}

async function pickFolder(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const folder = await open({ directory: true, title: 'Open Project' });
    return typeof folder === 'string' ? folder : null;
  }
  return useUi.getState().ask({ title: 'Open Project', input: { label: 'Folder', value: '', placeholder: '/path/to/project' } });
}

/** Main toolbar, as in DataGrip: project and VCS widgets with the run button on the left,
 *  tool window toggles in the middle, AI, search and settings on the right. */
export function MainToolbar() {
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId));
  const running = useResults(tabResults(tab?.id ?? null)).running;
  const project = useProjects((s) => s.current);
  // Re-render when a pinned tool window opens or closes.
  useUi((s) => `${s.explorerVisible}${s.servicesVisible}${s.filesVisible}`);
  const pinned = useUi((s) => s.pinnedTools);
  // Actions are read at call time: subscribing to the whole store would re-render
  // the toolbar on every caret move.
  const ui = useUi.getState();
  const target = tab?.connectionId ?? useConnections.getState().list[0]?.id;

  const fail = (e: unknown) => void ui.ask({ title: 'Project', message: errorMessage(e), confirmLabel: 'Close' });

  const newProject = async () => {
    const name = await ui.ask({ title: 'New Project', input: { label: 'Name', value: '' }, confirmLabel: 'Create' });
    if (name) await useProjects.getState().create(name, null).catch(fail);
  };

  const openFolder = async () => {
    const path = await pickFolder();
    if (!path) return;
    const projects = useProjects.getState();
    const existing = projects.list.find((p) => p.path === path);
    if (existing) return projects.open(existing.id).catch(fail);
    const name = path.replace(/\/+$/, '').split('/').pop() || path;
    await projects.create(name, path).catch(fail);
  };

  const projectItem = (p: Project, current: boolean): MenuItem => ({
    label: p.name,
    icon: <ProjectBadge name={p.name} size={16} />,
    detail: (
      <>
        {p.path && <span>{displayPath(p.path)}</span>}
        {current && p.branch && (
          <span className="menu-detail-branch">
            <GitBranch size={10} /> {p.branch}
          </span>
        )}
      </>
    ),
    onSelect: current ? undefined : () => void useProjects.getState().open(p.id).catch(fail),
  });

  // DataGrip's project widget: new / open, the open project, then recent ones.
  const projectMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { list, current } = useProjects.getState();
    const recent = list.filter((p) => p.id !== current?.id);
    ui.openMenu(r.left, r.bottom + 4, [
      { label: 'New Project…', icon: <Plus size={14} />, onSelect: () => void newProject() },
      { label: 'Open…', icon: <FolderOpen size={14} />, onSelect: () => void openFolder() },
      ...(current ? [{ header: 'Open Projects' }, projectItem(current, true)] : []),
      ...(recent.length ? [{ header: 'Recent Projects' }, ...recent.map((p) => projectItem(p, false))] : []),
      { separator: true },
      {
        label: 'Rename Project…',
        disabled: !current,
        onSelect: async () => {
          if (!current) return;
          const name = await ui.ask({ title: 'Rename Project', input: { label: 'Name', value: current.name }, confirmLabel: 'Rename' });
          if (name) await useProjects.getState().rename(current.id, name).catch(fail);
        },
      },
      {
        label: 'Delete Project',
        disabled: !recent.length,
        submenu: recent.map((p) => ({
          label: p.name,
          danger: true,
          onSelect: async () => {
            const ok = await ui.ask({
              title: 'Delete Project',
              message: (
                <>
                  Delete project <b>{p.name}</b> with its data sources and consoles? Its folder on disk is not touched.
                </>
              ),
              confirmLabel: 'Delete',
              danger: true,
            });
            if (ok !== null) await useProjects.getState().remove(p.id).catch(fail);
          },
        })),
      },
    ]);
  };

  const settingsMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    ui.openMenu(r.right - 220, r.bottom + 4, [
      { label: 'Data Sources…', shortcut: '⌘;', onSelect: () => ui.openDataSources(target ?? null) },
      { separator: true },
      { label: 'Check for Updates…', disabled: !isTauri, onSelect: () => void useUpdates.getState().check(true) },
      { label: `Datowl ${__APP_VERSION__}`, disabled: true },
    ]);
  };

  const branchMenu = async (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const branches = await backend.gitBranches().catch(() => []);
    ui.openMenu(r.left, r.bottom + 4, [
      { header: 'Local Branches' },
      ...branches.map((b) => ({
        label: b,
        icon: b === project?.branch ? <Check size={13} /> : <GitBranch size={13} />,
        // Datowl shows the branch; switching it stays a git job.
        disabled: b !== project?.branch,
      })),
    ]);
  };

  // "More tool windows", as in DataGrip: every tool window, with a pin column that
  // chooses which ones sit in the toolbar. Pinning keeps the menu open.
  const moreMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const items = () =>
      TOOL_WINDOWS.map((tool) => ({
        label: tool.label,
        icon: <tool.icon size={14} strokeWidth={1.75} />,
        shortcut: tool.shortcut,
        disabled: !tool.setVisible,
        pinned: useUi.getState().pinnedTools.includes(tool.id),
        onPin: tool.setVisible
          ? () => {
              useUi.getState().togglePinned(tool.id);
              ui.openMenu(r.left, r.bottom + 4, items());
            }
          : undefined,
        onSelect: () => toggleToolWindow(tool.id),
      }));
    ui.openMenu(r.left, r.bottom + 4, items());
  };

  return (
    <header className="topbar" data-tauri-drag-region>
      <button type="button" className="widget project" onClick={projectMenu} title={project?.path ?? undefined}>
        {project ? <ProjectBadge name={project.name} /> : <img src="/logo.svg" alt="" width={19.5} height={21} />}
        <span>{project?.name ?? 'datowl'}</span>
        <ChevronDown size={12} />
      </button>
      {project?.branch && (
        <button type="button" className="widget" onClick={(e) => void branchMenu(e)}>
          <GitBranch size={14} />
          <span>{project.branch}</span>
          <ChevronDown size={12} />
        </button>
      )}
      <button
        type="button"
        className="run-square"
        title="Execute (⌘↵)"
        aria-label="Execute"
        disabled={!(tab?.kind === 'console' || (tab?.kind === 'file' && tab.connectionId && /\.sql$/i.test(tab.path))) || running}
        onClick={() => tab && editorRegistry.get(tab.id)?.run()}
      >
        <ChevronsRight size={15} />
      </button>

      <div className="topbar-center" data-tauri-drag-region>
        {pinned.map((id) => {
          const tool = toolWindow(id);
          return (
            <IconButton
              key={id}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.shortcut}
              active={tool.visible?.()}
              size={16}
              onClick={() => toggleToolWindow(id)}
            />
          );
        })}
        <IconButton icon={Ellipsis} label="More Tool Windows" size={16} onClick={moreMenu} />
      </div>

      <div className="topbar-right">
        <IconButton icon={Sparkles} label="AI Assistant (not available yet)" size={16} disabled />
        <IconButton icon={Search} label="Search Everywhere" shortcut="⌘K" size={16} onClick={() => ui.setPaletteOpen(true)} />
        <IconButton icon={Settings} label="Settings" size={16} onClick={settingsMenu} />
      </div>
    </header>
  );
}
