import { CirclePlay, Database, Folder, type LucideIcon } from 'lucide-react';

import { useUi, type ToolWindowId } from '@/shared/model/ui';

interface ToolWindow {
  id: ToolWindowId;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  visible: () => boolean;
  setVisible: (visible: boolean) => void;
}

const ui = () => useUi.getState();

export const TOOL_WINDOWS: ToolWindow[] = [
  {
    id: 'explorer',
    label: 'Database Explorer',
    icon: Database,
    shortcut: '⌘1',
    visible: () => ui().explorerVisible,
    setVisible: (v) => ui().setExplorerVisible(v),
  },
  {
    id: 'files',
    label: 'Files',
    icon: Folder,
    shortcut: '⌘2',
    visible: () => ui().filesVisible,
    setVisible: (v) => ui().setFilesVisible(v),
  },
  {
    id: 'services',
    label: 'Services',
    icon: CirclePlay,
    shortcut: '⌘8',
    visible: () => ui().servicesVisible,
    setVisible: (v) => ui().setServicesVisible(v),
  },
];

export const toolWindow = (id: ToolWindowId) => TOOL_WINDOWS.find((t) => t.id === id)!;

export function toggleToolWindow(id: ToolWindowId) {
  const tool = toolWindow(id);
  tool.setVisible(!tool.visible());
}
