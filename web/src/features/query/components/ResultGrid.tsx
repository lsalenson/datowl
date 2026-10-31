import DataEditor, {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { ResultBuffer } from '../lib/buffer';
import { gridTheme, NULL_COLOR, NUMBER_COLOR } from '../lib/gridTheme';

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

interface Props {
  buffer: ResultBuffer;
  /** Called when the viewport gets close to the last loaded row. */
  onNearEnd?: () => void;
  sort?: SortState | null;
  onHeaderClick?: (column: string) => void;
  /** Indices of the rows to show (profile filters); all rows when absent. */
  view?: number[] | null;
  /** Column to select and scroll to, set from the profile panel. */
  focusColumn?: { index: number } | null;
  /** The column of the selection changed in the grid. */
  onColumnFocus?: (index: number) => void;
}

const EMPTY_SELECTION: GridSelection = { columns: CompactSelection.empty(), rows: CompactSelection.empty() };

const CHAR_WIDTH = 7.6;
const SAMPLE_ROWS = 200;
const numberTheme = { textDark: NUMBER_COLOR };
const nullTheme = { textDark: NULL_COLOR };

function estimateWidths(buffer: ResultBuffer): number[] {
  return buffer.columns.map((column, i) => {
    let chars = column.name.length + 2;
    const sample = Math.min(buffer.rows.length, SAMPLE_ROWS);
    for (let r = 0; r < sample; r++) {
      const value = buffer.rows[r][i];
      chars = Math.max(chars, value === null ? 6 : Math.min(value.length, 60));
    }
    return Math.round(Math.min(Math.max(chars * CHAR_WIDTH + 22, 64), 480));
  });
}

/** Canvas-rendered grid: scrolls through hundreds of thousands of rows at 60 fps. */
export function ResultGrid({ buffer, onNearEnd, sort, onHeaderClick, view, focusColumn, onColumnFocus }: Props) {
  useSyncExternalStore(buffer.subscribe, buffer.getVersion);
  const rowCount = view ? view.length : buffer.rows.length;
  const editor = useRef<DataEditorRef>(null);
  const [selection, setSelection] = useState<GridSelection>(EMPTY_SELECTION);

  useEffect(() => {
    if (!focusColumn) return;
    setSelection({ columns: CompactSelection.fromSingleSelection(focusColumn.index), rows: CompactSelection.empty() });
    editor.current?.scrollTo(focusColumn.index, 0, 'horizontal');
  }, [focusColumn]);

  const onSelectionChange = (next: GridSelection) => {
    const columnOf = (s: GridSelection) => s.current?.cell[0] ?? s.columns.first();
    const column = columnOf(next);
    if (column !== undefined && column !== columnOf(selection)) onColumnFocus?.(column);
    setSelection(next);
  };
  const hasRows = rowCount > 0;
  const [resized, setResized] = useState<Record<number, number>>({});

  // Re-estimate once the first rows arrive, then keep widths stable while paging.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const estimated = useMemo(() => estimateWidths(buffer), [buffer, buffer.columns, hasRows]);

  const columns = useMemo<GridColumn[]>(
    () =>
      buffer.columns.map((c, i) => ({
        id: String(i),
        title: sort?.column === c.name ? `${c.name} ${sort.direction === 'asc' ? '↑' : '↓'}` : c.name,
        width: resized[i] ?? estimated[i],
      })),
    [buffer.columns, estimated, resized, sort],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const value = buffer.rows[view ? view[row] : row]?.[col];
      const numeric = buffer.columns[col]?.numeric ?? false;
      const align = numeric ? 'right' : 'left';
      if (value === null || value === undefined) {
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '<null>',
          copyData: '',
          allowOverlay: false,
          readonly: true,
          contentAlign: align,
          themeOverride: nullTheme,
        };
      }
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value.length > 500 ? `${value.slice(0, 500)}…` : value,
        allowOverlay: true,
        readonly: true,
        contentAlign: align,
        themeOverride: numeric ? numberTheme : undefined,
      };
    },
    [buffer, view],
  );

  const onVisibleRegionChanged = useCallback(
    (region: Rectangle) => {
      if (onNearEnd && !view && region.y + region.height >= buffer.rows.length - 30) onNearEnd();
    },
    [buffer, onNearEnd, view],
  );

  if (buffer.columns.length === 0) return <div className="grid-empty">No columns</div>;

  return (
    <div className="grid-host">
      <DataEditor
        ref={editor}
        columns={columns}
        rows={rowCount}
        getCellContent={getCellContent}
        getCellsForSelection
        rowMarkers="number"
        smoothScrollX
        smoothScrollY
        theme={gridTheme}
        width="100%"
        height="100%"
        rowHeight={24}
        headerHeight={28}
        onColumnResize={(_column, size, index) => setResized((w) => ({ ...w, [index]: size }))}
        onVisibleRegionChanged={onVisibleRegionChanged}
        gridSelection={selection}
        onGridSelectionChange={onSelectionChange}
        onHeaderClicked={onHeaderClick ? (col) => onHeaderClick(buffer.columns[col].name) : undefined}
      />
    </div>
  );
}
