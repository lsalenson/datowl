import { useEffect, useRef, useState } from 'react';

import { backend, errorMessage, type Dialect, type StatementRange } from '@/shared/api';
import { log } from '@/shared/model/output';
import { useConnections } from '@/features/connections';
import { useUi } from '@/shared/model/ui';
import { useWorkspace, type EditorTab } from '@/features/workspace';
import { runSql } from '@/features/query';
import { bindModel } from '../lib/completion';
import { monaco } from '../lib/monaco';
import { editorRegistry } from '../lib/registry';

type DocumentTab = Extract<EditorTab, { kind: 'console' | 'file' }>;

// Monaco here only bundles SQL; other project files open as plain text.
const languageOf = (tab: DocumentTab) => (tab.kind === 'console' || /\.sql$/i.test(tab.path) ? 'sql' : 'plaintext');

/** Where a tab's text lives: a console of the data source, or a file of the project folder. */
function documentOf(tab: DocumentTab) {
  if (tab.kind === 'console') {
    return {
      uri: monaco.Uri.parse(`datowl://console/${tab.connectionId}/${encodeURIComponent(tab.name)}.sql`),
      load: () => backend.readConsole(tab.connectionId, tab.name),
      save: (text: string) => backend.writeConsole(tab.connectionId, tab.name, text),
    };
  }
  return {
    uri: monaco.Uri.file(tab.path),
    load: () => backend.readFile(tab.path),
    save: (text: string) => backend.writeFile(tab.path, text),
  };
}
type Model = monaco.editor.ITextModel;

// Writes of one document go out in order, and reading it waits for them: closing a tab and
// reopening it right away must not read the file from before the last save.
const writes = new Map<string, Promise<unknown>>();
const lastWrite = (key: string) => writes.get(key) ?? Promise.resolve();

export const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  theme: 'datowl-dark',
  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  // No caret animation: the caret must land on the typed character in the same frame.
  cursorBlinking: 'blink',
  cursorSmoothCaretAnimation: 'off',
  padding: { top: 10, bottom: 10 },
  fixedOverflowWidgets: true,
  lineNumbersMinChars: 4,
  lineDecorationsWidth: 10,
  folding: true,
  showFoldingControls: 'mouseover',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  guides: { indentation: false },
  stickyScroll: { enabled: false },
  wordBasedSuggestions: 'off',
  quickSuggestions: { other: true, comments: false, strings: false },
  suggest: { showWords: false, preview: true },
  tabSize: 4,
};

async function statementAtCaret(model: Model, offset: number, dialect: Dialect): Promise<StatementRange | null> {
  const text = model.getValue();
  const ranges = await backend.splitStatements(text, dialect);
  const inside = ranges.find((r) => r.start <= offset && offset <= r.end);
  if (inside) return inside;
  // Caret just after a statement (after its `;`, on the same line) runs that statement.
  const previous = ranges.filter((r) => r.end <= offset).at(-1);
  if (previous && /^[ \t;]*$/.test(text.slice(previous.end, offset))) return previous;
  const next = ranges.find((r) => r.start >= offset);
  if (next && /^\s*$/.test(text.slice(offset, next.start))) return next;
  return null;
}

// The status bar reads the caret; coalesce updates to one per frame so typing never
// waits on a React render.
let caretFrame = 0;
let pendingCaret: monaco.IPosition | null = null;
function setCaret(position: monaco.IPosition) {
  pendingCaret = position;
  if (caretFrame) return;
  caretFrame = requestAnimationFrame(() => {
    caretFrame = 0;
    const p = pendingCaret!;
    const current = useUi.getState().caret;
    if (current?.line !== p.lineNumber || current.column !== p.column) {
      useUi.getState().setCaret({ line: p.lineNumber, column: p.column });
    }
  });
}

function toRange(model: Model, r: StatementRange): monaco.IRange {
  return monaco.Range.fromPositions(model.getPositionAt(r.start), model.getPositionAt(r.end));
}

export function SqlEditor({ tab, active }: { tab: DocumentTab; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // The source of a file can change while it stays open, with its text and undo history.
  const connectionRef = useRef(tab.connectionId);
  connectionRef.current = tab.connectionId;
  const modelRef = useRef<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Text found on disk that differs from what this tab last saved, while it has edits of its own. */
  const [conflict, setConflict] = useState<string | null>(null);
  const commands = useRef({ save: () => {}, checkDisk: () => {}, reload: (_text: string) => {}, keepMine: (_text: string) => {} });

  const key = tab.kind === 'console' ? tab.name : tab.path;

  useEffect(() => {
    const doc = documentOf(tab);
    const isSql = languageOf(tab) === 'sql';
    const model = monaco.editor.createModel('', languageOf(tab), doc.uri);
    modelRef.current = model;
    const editor = monaco.editor.create(host.current!, { ...EDITOR_OPTIONS, model });
    const dialect = (): Dialect =>
      useConnections.getState().list.find((c) => c.id === connectionRef.current)?.driver ?? 'postgres';
    const workspace = useWorkspace.getState();
    const writeKey = doc.uri.toString();

    let disposed = false;
    let loading = true;
    /** What the document holds as far as this tab knows; null until loaded. */
    let saved: string | null = null;
    /** Text being applied from disk, which needs no saving. */
    let applying = false;
    const applyText = (text: string) => {
      applying = true;
      saved = text;
      model.setValue(text);
      applying = false;
    };
    lastWrite(writeKey)
      .then(() => doc.load())
      .then(
        (text) => {
          if (disposed) return;
          applyText(text);
          loading = false;
        },
        // An unreadable file (binary, too large) opens read-only with the reason. `loading`
        // stays true, so nothing can ever write over it.
        (e) => {
          if (disposed) return;
          setLoadError(errorMessage(e));
          editor.updateOptions({ readOnly: true });
        },
      );

    let saveTimer = 0;
    const save = () => {
      window.clearTimeout(saveTimer);
      if (loading || workspace.isDiscarded(tab.id)) return;
      const text = model.getValue();
      if (text === saved) {
        workspace.setSaveState(tab.id, null);
        return;
      }
      const previous = saved;
      saved = text;
      const write = lastWrite(writeKey).then(() => doc.save(text));
      writes.set(writeKey, write.catch(() => {}));
      write.then(
        () => {
          if (disposed) return;
          setSaveError(null);
          if (model.getValue() === text) workspace.setSaveState(tab.id, null);
        },
        (e) => {
          log('error', 'files', errorMessage(e));
          if (saved === text) saved = previous;
          if (disposed) return;
          setSaveError(errorMessage(e));
          workspace.setSaveState(tab.id, 'error');
        },
      );
    };
    const contentSub = model.onDidChangeContent(() => {
      if (loading || applying) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 400);
      workspace.setSaveState(tab.id, 'dirty');
      if (hasMarkers) clearMarkers();
    });

    // Another program (git, another editor) may have changed the file meanwhile.
    const checkDisk = () => {
      if (tab.kind !== 'file' || loading || disposed || !activeRef.current) return;
      void lastWrite(writeKey)
        .then(() => doc.load())
        .then((text) => {
          if (disposed || text === saved) return;
          if (model.getValue() === saved) applyText(text);
          else setConflict(text);
        })
        .catch(() => {});
    };
    window.addEventListener('focus', checkDisk);
    commands.current = {
      save,
      checkDisk,
      reload: (text) => {
        window.clearTimeout(saveTimer);
        applyText(text);
        workspace.setSaveState(tab.id, null);
        setConflict(null);
      },
      // The next save overwrites what is on disk, as the user just chose.
      keepMine: (text) => {
        saved = text;
        setConflict(null);
        save();
      },
    };

    // Faint band behind the statement under the caret, like the run target.
    const current = editor.createDecorationsCollection();
    const flash = editor.createDecorationsCollection();
    let highlightTimer = 0;
    const highlight = () => {
      if (!isSql) return;
      window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(async () => {
        const position = editor.getPosition();
        if (disposed || !position) return;
        const r = await statementAtCaret(model, model.getOffsetAt(position), dialect());
        if (disposed) return;
        current.set(r ? [{ range: toRange(model, r), options: { isWholeLine: true, className: 'datowl-current-stmt' } }] : []);
      }, 120);
    };

    let hasMarkers = false;
    const clearMarkers = () => {
      hasMarkers = false;
      monaco.editor.setModelMarkers(model, 'datowl', []);
    };

    const markError = (offset: number, message: string) => {
      hasMarkers = true;
      const position = model.getPositionAt(offset);
      const word = model.getWordAtPosition(position);
      monaco.editor.setModelMarkers(model, 'datowl', [
        {
          severity: monaco.MarkerSeverity.Error,
          message,
          startLineNumber: position.lineNumber,
          startColumn: word?.startColumn ?? position.column,
          endLineNumber: position.lineNumber,
          endColumn: word?.endColumn ?? position.column + 1,
        },
      ]);
      editor.revealPositionInCenterIfOutsideViewport(position);
    };

    const run = async (script: boolean) => {
      if (!isSql) return;
      const connectionId = connectionRef.current;
      if (!connectionId) {
        await useUi.getState().ask({ title: 'No Data Source', message: 'Choose a data source in the editor toolbar to run this file.', confirmLabel: 'Close' });
        return;
      }
      const selection = editor.getSelection();
      let text: string;
      let base: number;
      if (script) {
        text = model.getValue();
        base = 0;
      } else if (selection && !selection.isEmpty()) {
        text = model.getValueInRange(selection);
        base = model.getOffsetAt(selection.getStartPosition());
      } else {
        const r = await statementAtCaret(model, model.getOffsetAt(editor.getPosition()!), dialect());
        if (!r) return;
        text = model.getValue().slice(r.start, r.end);
        base = r.start;
        flash.set([{ range: toRange(model, r), options: { className: 'datowl-executed' } }]);
        window.setTimeout(() => flash.clear(), 500);
      }
      if (!text.trim()) return;
      if (hasMarkers) clearMarkers();
      await runSql(tab.id, connectionId, text, { baseOffset: base, onErrorAt: markError });
    };

    editor.addAction({
      id: 'datowl.execute',
      label: 'Execute Statement',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 0,
      run: () => void run(false),
    });
    editor.addAction({
      id: 'datowl.executeScript',
      label: 'Execute Script',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: () => void run(true),
    });
    editor.addAction({
      id: 'datowl.save',
      label: 'Save Console',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: save,
    });

    const cursorSub = editor.onDidChangeCursorPosition((e) => {
      if (activeRef.current) setCaret(e.position);
      highlight();
    });
    const focusSub = editor.onDidFocusEditorText(() => {
      const p = editor.getPosition();
      if (p) setCaret(p);
    });

    editorRegistry.set(tab.id, {
      run: () => void run(false),
      runScript: () => void run(true),
      focus: () => editor.focus(),
    });

    return () => {
      save();
      disposed = true;
      window.removeEventListener('focus', checkDisk);
      workspace.setSaveState(tab.id, null);
      editorRegistry.delete(tab.id);
      contentSub.dispose();
      cursorSub.dispose();
      focusSub.dispose();
      editor.dispose();
      // A reopened document must read from disk, not from what this tab last held.
      model.dispose();
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, key]);

  useEffect(() => {
    if (modelRef.current) bindModel(modelRef.current, tab.connectionId, tab.id);
  }, [tab.id, key, tab.connectionId]);

  useEffect(() => {
    if (!active) return;
    editorRegistry.get(tab.id)?.focus();
    commands.current.checkDisk();
  }, [active, tab.id]);

  return (
    <div className="ddl-view">
      {loadError && <div className="inline-error">Cannot open this file: {loadError}</div>}
      {saveError && (
        <div className="inline-error editor-notice" role="alert">
          <span>Could not save: {saveError}</span>
          <button type="button" className="link-btn" onClick={() => commands.current.save()}>
            Retry
          </button>
        </div>
      )}
      {conflict !== null && (
        <div className="inline-error editor-notice" role="alert">
          <span>This file changed on disk while you were editing it.</span>
          <button type="button" className="link-btn" onClick={() => commands.current.reload(conflict)}>
            Load from Disk
          </button>
          <button type="button" className="link-btn" onClick={() => commands.current.keepMine(conflict)}>
            Keep Mine
          </button>
        </div>
      )}
      <div className="editor-host" ref={host} />
    </div>
  );
}
