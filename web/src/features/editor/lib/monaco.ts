// Monaco is bundled locally (no CDN): the app must work offline inside the webview.
import 'monaco-editor/esm/vs/editor/edcore.main';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import { registerSqlCompletion } from './completion';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

// Disposing an editor cancels its pending timers with a `Canceled` rejection; it is expected.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof Error && e.reason.name === 'Canceled') e.preventDefault();
});

monaco.editor.defineTheme('datowl-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'f4f0eb' },
    { token: 'keyword', foreground: 'd98af5' },
    { token: 'operator', foreground: 'd98af5' },
    { token: 'predefined', foreground: 'f0cdfb' },
    { token: 'string', foreground: 'c9beb3' },
    { token: 'number', foreground: 'ff8f80' },
    { token: 'comment', foreground: '8a847e', fontStyle: 'italic' },
    { token: 'identifier.quote', foreground: 'f5c26b' },
    { token: 'delimiter', foreground: 'a8a29c' },
  ],
  colors: {
    // Transparent so the glass panel shows through the editor.
    'editor.background': '#00000000',
    'editorGutter.background': '#00000000',
    'editor.foreground': '#f4f0eb',
    'editorLineNumber.foreground': '#f4f0eb40',
    'editorLineNumber.activeForeground': '#f4f0ebb0',
    'editor.lineHighlightBackground': '#ffffff0b',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#d98af555',
    'editor.inactiveSelectionBackground': '#d98af530',
    'editor.selectionHighlightBackground': '#d98af525',
    'editor.wordHighlightBackground': '#d98af525',
    'editorCursor.foreground': '#ff5440',
    'editorIndentGuide.background1': '#ffffff10',
    'editorIndentGuide.activeBackground1': '#ffffff22',
    'editorBracketMatch.background': '#d98af540',
    'editorBracketMatch.border': '#00000000',
    'editorWidget.background': '#1c1a20f0',
    'editorWidget.border': '#ffffff22',
    'editorSuggestWidget.background': '#1c1a20f2',
    'editorSuggestWidget.border': '#ffffff22',
    'editorSuggestWidget.selectedBackground': '#d98af533',
    'editorSuggestWidget.highlightForeground': '#d98af5',
    'editorSuggestWidget.focusHighlightForeground': '#f0cdfb',
    'editorHoverWidget.background': '#1c1a20f2',
    'editorHoverWidget.border': '#ffffff22',
    'editorError.foreground': '#ff6f5e',
    'scrollbarSlider.background': '#ffffff18',
    'scrollbarSlider.hoverBackground': '#ffffff28',
    'scrollbarSlider.activeBackground': '#ffffff38',
    'editorOverviewRuler.border': '#00000000',
    focusBorder: '#00000000',
  },
});

registerSqlCompletion(monaco);

export { monaco };
