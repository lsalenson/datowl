import '@fontsource-variable/outfit';
import '@/app/styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { isTauri } from '@/shared/api';
import { useConnections } from '@/features/connections';
import { useProjects } from '@/features/projects';
import { startUpdateChecks } from '@/features/updates';
import { useWorkspace } from '@/features/workspace';

async function start() {
  // The Tauri window is translucent; the browser build paints its own backdrop.
  if (isTauri) document.documentElement.classList.add('tauri');
  await useProjects.getState().load().catch(() => {});
  const project = useProjects.getState().current;
  if (project) useWorkspace.getState().hydrate(project.id);
  await useConnections.getState().load().catch(() => {});
  // Drop restored tabs whose data source no longer exists.
  const ids = new Set(useConnections.getState().list.map((c) => c.id));
  const workspace = useWorkspace.getState();
  for (const tab of workspace.tabs) if (!ids.has(tab.connectionId)) workspace.close(tab.id);

  startUpdateChecks();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
