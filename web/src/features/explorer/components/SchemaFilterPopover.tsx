import { RefreshCw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { IconButton } from '@/shared/ui/IconButton';
import type { ConnectionConfig, NodeRef } from '@/shared/api';
import { defaultSchema, isShown, useSchemaFilter } from '../model/schemaFilter';
import { useTree } from '../model/treeStore';

interface Props {
  /** Tree key of the node listing the schemas. */
  treeKey: string;
  connection: ConnectionConfig;
  node: NodeRef;
  x: number;
  y: number;
  onClose: () => void;
}

/** DataGrip's "N of M" schema chooser: which schemas (ClickHouse: databases) the tree shows. */
export function SchemaFilterPopover({ treeKey, connection, node, x, y, onClose }: Props) {
  const nodes = useTree((s) => s.children[treeKey]);
  const names = (nodes ?? []).map((c) => c.label);
  const choice = useSchemaFilter((s) => s.choices[connection.id]);
  const setChoice = useSchemaFilter((s) => s.set);
  const ref = useRef<HTMLDivElement>(null);
  const fallback = defaultSchema(connection);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && onClose();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const toggle = (name: string) => {
    const shown = names.filter((n) => isShown(choice, n));
    const next = shown.includes(name) ? shown.filter((n) => n !== name) : [...shown, name];
    setChoice(connection.id, next);
  };

  return (
    <div className="schema-popover" ref={ref} style={{ left: x, top: y }} role="dialog" aria-label="Schemas">
      <header>
        <span>{connection.name}</span>
        <IconButton
          icon={RefreshCw}
          label="Refresh"
          size={13}
          onClick={() => void useTree.getState().refresh(treeKey, connection.id, node)}
        />
        <IconButton icon={X} label="Close" size={13} onClick={onClose} />
      </header>
      <div className="schema-list">
        <label className="schema-option all">
          <input type="checkbox" checked={choice === 'all'} onChange={(e) => setChoice(connection.id, e.target.checked ? 'all' : null)} />
          All schemas
        </label>
        {names.map((name) => (
          <label key={name} className="schema-option">
            <input type="checkbox" checked={isShown(choice, name)} disabled={choice === 'all'} onChange={() => toggle(name)} />
            {name}
            {name === fallback && <span className="schema-note">(Default schema)</span>}
          </label>
        ))}
      </div>
      <footer>Changes apply right away. Click outside or press Enter to close.</footer>
    </div>
  );
}
