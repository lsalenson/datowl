import { useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';

import { AskDialog } from '@/shared/ui/AskDialog';
import { CommandPalette } from './layout/CommandPalette';
import { ContextMenu } from '@/shared/ui/ContextMenu';
import { MainToolbar } from './layout/MainToolbar';
import { StatusBar } from './layout/StatusBar';
import { UpdateToast } from '@/features/updates';
import { DataSourcesDialog } from '@/features/connections';
import { PasswordPrompt } from '@/features/connections';
import { Explorer } from '@/features/explorer';
import { FilesPanel } from '@/features/files';
import { ServicesPanel } from '@/features/query';
import { EditorArea } from './layout/EditorArea';
import { useConnections } from '@/features/connections';
import { useUi } from '@/shared/model/ui';
import { useWorkspace } from '@/features/workspace';

/** Keeps a collapsible panel in sync with its visibility flag. */
function usePanelVisibility(visible: boolean) {
  const ref = useRef<ImperativePanelHandle>(null);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    if (visible && panel.isCollapsed()) panel.expand();
    if (!visible && !panel.isCollapsed()) panel.collapse();
  }, [visible]);
  return ref;
}

export function App() {
  const explorerVisible = useUi((s) => s.explorerVisible);
  const servicesVisible = useUi((s) => s.servicesVisible);
  const explorerRef = usePanelVisibility(explorerVisible);
  const servicesRef = usePanelVisibility(servicesVisible);
  const filesRef = usePanelVisibility(useUi((s) => s.filesVisible));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const ui = useUi.getState();
      if (e.shiftKey && e.key.toLowerCase() === 'l') {
        const { tabs, activeId, newConsole } = useWorkspace.getState();
        const connectionId = tabs.find((t) => t.id === activeId)?.connectionId ?? useConnections.getState().list[0]?.id;
        if (connectionId) void newConsole(connectionId);
      } else if (e.altKey && e.code === 'KeyP') ui.setProfileVisible(!ui.profileVisible);
      else if (e.key === 'k') ui.setPaletteOpen(!ui.paletteOpen);
      else if (e.key === '1') ui.setExplorerVisible(!ui.explorerVisible);
      else if (e.key === '2') ui.setFilesVisible(!ui.filesVisible);
      else if (e.key === '8') ui.setServicesVisible(!ui.servicesVisible);
      else if (e.key === ';') ui.openDataSources(useWorkspace.getState().tabs.find((t) => t.id === useWorkspace.getState().activeId)?.connectionId ?? null);
      else if (e.key === 'w') {
        const { activeId, close } = useWorkspace.getState();
        if (activeId) close(activeId);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <MainToolbar />
      {/* DataGrip "islands": explorer and editor side by side, Services across the bottom. */}
      <div className="workspace">
        <PanelGroup direction="vertical" autoSaveId="datowl.layout.v2" className="panels">
          <Panel id="top" order={1} minSize={20}>
            <PanelGroup direction="horizontal" autoSaveId="datowl.layout.h2">
              <Panel
                ref={explorerRef}
                id="explorer"
                order={1}
                defaultSize={42}
                minSize={14}
                collapsible
                onCollapse={() => useUi.getState().setExplorerVisible(false)}
                onExpand={() => useUi.getState().setExplorerVisible(true)}
              >
                <Explorer />
              </Panel>
              <PanelResizeHandle className="gutter vertical" />
              <Panel id="editor" order={2} minSize={25}>
                <EditorArea />
              </Panel>
              <PanelResizeHandle className="gutter vertical" />
              <Panel
                ref={filesRef}
                id="files"
                order={3}
                defaultSize={18}
                minSize={12}
                collapsible
                onCollapse={() => useUi.getState().setFilesVisible(false)}
                onExpand={() => useUi.getState().setFilesVisible(true)}
              >
                <FilesPanel />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="gutter horizontal" />
          <Panel
            ref={servicesRef}
            id="services"
            order={2}
            defaultSize={24}
            minSize={10}
            collapsible
            onCollapse={() => useUi.getState().setServicesVisible(false)}
            onExpand={() => useUi.getState().setServicesVisible(true)}
          >
            <ServicesPanel />
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar />
      <DataSourcesDialog />
      <AskDialog />
      <UpdateToast />
      <PasswordPrompt />
      <CommandPalette />
      <ContextMenu />
    </div>
  );
}
