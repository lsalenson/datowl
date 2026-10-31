import {
  Bell,
  Bookmark,
  Bug,
  CircleAlert,
  CirclePlay,
  Database,
  DatabaseZap,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  ListTodo,
  ListTree,
  Network,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

import { useUi, type ToolWindowId } from '@/shared/model/ui';

interface ToolWindow {
  id: ToolWindowId;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  /** Visibility accessors, for the tool windows Datowl has. */
  visible?: () => boolean;
  setVisible?: (visible: boolean) => void;
}

const ui = () => useUi.getState();

/** DataGrip's tool windows, in the order of its "More tool windows" menu. */
export const TOOL_WINDOWS: ToolWindow[] = [
  { id: 'commit', label: 'Commit', icon: GitCommitHorizontal, shortcut: '⌘0' },
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
  { id: 'find', label: 'Find', icon: Search, shortcut: '⌘3' },
  { id: 'run', label: 'Run', icon: Play, shortcut: '⌘4' },
  { id: 'debug', label: 'Debug', icon: Bug, shortcut: '⌘5' },
  { id: 'problems', label: 'Problems', icon: CircleAlert, shortcut: '⌘6' },
  { id: 'structure', label: 'Structure', icon: ListTree, shortcut: '⌘7' },
  {
    id: 'services',
    label: 'Services',
    icon: CirclePlay,
    shortcut: '⌘8',
    visible: () => ui().servicesVisible,
    setVisible: (v) => ui().setServicesVisible(v),
  },
  { id: 'git', label: 'Git', icon: GitBranch, shortcut: '⌘9' },
  { id: 'ai', label: 'AI Assistant', icon: Sparkles, shortcut: '⌥⇧1' },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'coverage', label: 'Coverage', icon: ShieldCheck },
  { id: 'changes', label: 'Database Changes', icon: DatabaseZap },
  { id: 'hierarchy', label: 'Hierarchy', icon: Network },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal, shortcut: '⌥F12' },
  { id: 'todo', label: 'TODO', icon: ListTodo },
];

export const toolWindow = (id: ToolWindowId) => TOOL_WINDOWS.find((t) => t.id === id)!;

export function toggleToolWindow(id: ToolWindowId) {
  const tool = toolWindow(id);
  tool.setVisible?.(!tool.visible?.());
}
