import { useEffect, useRef } from 'react';

import { backend, errorMessage, type Dialect, type StatementRange } from '@/shared/api';
import { log } from '@/shared/model/output';
import { useConnections } from '@/features/connections';
import { useUi } from '@/shared/model/ui';
import type { EditorTab } from '@/features/workspace';
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
  folding: false,
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

  const key = tab.kind === 'console' ? tab.name : tab.path;

  useEffect(() => {
    const doc = documentOf(tab);
    const isSql = languageOf(tab) === 'sql';
    const model = monaco.editor.getModel(doc.uri) ?? monaco.editor.createModel('', languageOf(tab), doc.uri);
    bindModel(model, tab.connectionId);
    const editor = monaco.editor.create(host.current!, { ...EDITOR_OPTIONS, model });
    const dialect = (): Dialect =>
      useConnections.getState().list.find((c) => c.id === tab.connectionId)?.driver ?? 'postgres';

    let disposed = false;
    let loading = true;
    doc.load().then(
      (text) => {
        if (!disposed && model.getValue() === '') model.setValue(text);
        loading = false;
      },
      // An unreadable file (binary, too large) opens read-only with the reason.
      (e) => {
        if (disposed) return;
        model.setValue(`Cannot open this file: ${errorMessage(e)}`);
        editor.updateOptions({ readOnly: true });
      },
    );

    let saveTimer = 0;
    const save = () => {
      window.clearTimeout(saveTimer);
      void doc.save(model.getValue()).catch((e) => log('error', 'files', errorMessage(e)));
    };
    const contentSub = model.onDidChangeContent(() => {
      if (loading) return;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 400);
      if (hasMarkers) clearMarkers();
    });

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
      if (!isSql || !tab.connectionId) return;
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
      await runSql(tab.id, tab.connectionId, text, { baseOffset: base, onErrorAt: markError });
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
      disposed = true;
      if (!loading) save();
      editorRegistry.delete(tab.id);
      contentSub.dispose();
      cursorSub.dispose();
      focusSub.dispose();
      editor.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, tab.connectionId, key]);

  useEffect(() => {
    if (active) editorRegistry.get(tab.id)?.focus();
  }, [active, tab.id]);

  return <div className="editor-host" ref={host} />;
}
