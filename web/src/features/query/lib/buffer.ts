import type { Column, Row } from '@/shared/api';

/**
 * Rows of one result set. Rows can number in the hundreds of thousands, so they live
 * in a plain mutable array outside React state. Components subscribe to `version`,
 * and notifications are coalesced to one per animation frame.
 */
export class ResultBuffer {
  columns: Column[] = [];
  rows: Row[] = [];
  private version = 0;
  private listeners = new Set<() => void>();
  private scheduled = false;

  setColumns(columns: Column[]) {
    this.columns = columns;
    this.bump();
  }

  append(rows: Row[]) {
    for (const row of rows) this.rows.push(row);
    this.bump();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private bump() {
    this.version++;
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      for (const listener of this.listeners) listener();
    });
  }
}
