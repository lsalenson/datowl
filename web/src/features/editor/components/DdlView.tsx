import { useEffect, useRef, useState } from 'react';

import { backend, errorMessage } from '@/shared/api';
import { useConnections } from '@/features/connections';
import type { EditorTab } from '@/features/workspace';
import { monaco } from '../lib/monaco';
import { EDITOR_OPTIONS } from './SqlEditor';

type DdlTab = Extract<EditorTab, { kind: 'ddl' }>;

/** Read-only DDL of a database object. */
export function DdlView({ tab }: { tab: DdlTab }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const model = monaco.editor.createModel('-- loading…', 'sql');
    const editor = monaco.editor.create(host.current!, { ...EDITOR_OPTIONS, model, readOnly: true, domReadOnly: true });
    let disposed = false;

    (async () => {
      if (!(await useConnections.getState().ensureConnected(tab.connectionId))) {
        if (!disposed) setError('Not connected');
        return;
      }
      try {
        const ddl = await backend.ddl(tab.connectionId, tab.object);
        if (!disposed) model.setValue(ddl);
      } catch (e) {
        if (!disposed) setError(errorMessage(e));
      }
    })();

    return () => {
      disposed = true;
      editor.dispose();
      model.dispose();
    };
  }, [tab.connectionId, tab.object]);

  return (
    <div className="ddl-view">
      {error && <div className="inline-error">{error}</div>}
      <div className="editor-host" ref={host} />
    </div>
  );
}
