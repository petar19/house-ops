import type { StorageItem, StorageUnit, StorageUnitKind } from '../types';
import type { Translate } from '../i18n';

export interface UnitShape {
  kind: StorageUnitKind;
  levels: number;
  rows: number;
  cols: number;
}

export const MAX_LEVELS = 20;
export const MAX_ROWS = 6;
export const MAX_COLS = 8;

// Sensible starting shapes per kind — the chest freezer is 3 stacked layers
// of 4 boxes along its length, shelving is shelves × left/middle/right.
export const DEFAULT_SHAPES: Record<StorageUnitKind, Omit<UnitShape, 'kind'>> = {
  shelving: { levels: 5, rows: 1, cols: 3 },
  chest: { levels: 3, rows: 1, cols: 4 },
  drawers: { levels: 4, rows: 1, cols: 1 },
  custom: { levels: 3, rows: 1, cols: 1 },
};

export function cellId(level: number, row: number, col: number): string {
  return `${level}.${row}.${col}`;
}

export function parseCellId(id: string): { level: number; row: number; col: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(id);
  if (!m) return null;
  return { level: Number(m[1]), row: Number(m[2]), col: Number(m[3]) };
}

export function cellExists(shape: Omit<UnitShape, 'kind'>, id: string): boolean {
  const p = parseCellId(id);
  return (
    !!p &&
    p.level >= 1 && p.level <= shape.levels &&
    p.row >= 1 && p.row <= shape.rows &&
    p.col >= 1 && p.col <= shape.cols
  );
}

/** Every cell id of one level, row-major (back row first, left to right). */
export function levelCellIds(shape: Omit<UnitShape, 'kind'>, level: number): string[] {
  const ids: string[] = [];
  for (let r = 1; r <= shape.rows; r++) {
    for (let c = 1; c <= shape.cols; c++) ids.push(cellId(level, r, c));
  }
  return ids;
}

export function allCellIds(shape: Omit<UnitShape, 'kind'>): string[] {
  const ids: string[] = [];
  for (let l = 1; l <= shape.levels; l++) ids.push(...levelCellIds(shape, l));
  return ids;
}

/** Items that would be left in a cell the new shape no longer has. */
export function orphanedItems(shape: Omit<UnitShape, 'kind'>, items: StorageItem[]): StorageItem[] {
  return items.filter((i) => !cellExists(shape, i.cellId));
}

export function levelLabel(unit: Pick<StorageUnit, 'kind' | 'levels' | 'levelNames'>, level: number, t: Translate): string {
  const custom = unit.levelNames?.[String(level)]?.trim();
  if (custom) return custom;
  const base = t(`storage.level.${unit.kind}`, { n: level });
  // Stacked kinds read top-down, so say which end is which.
  if ((unit.kind === 'chest' || unit.kind === 'drawers') && unit.levels > 1) {
    if (level === 1) return `${base} (${t('storage.top')})`;
    if (level === unit.levels) return `${base} (${t('storage.bottom')})`;
  }
  return base;
}

export function colLabel(cols: number, col: number, t: Translate): string {
  if (cols === 1) return '';
  if (cols === 2) return t(col === 1 ? 'storage.left' : 'storage.right');
  if (cols === 3) return t(col === 1 ? 'storage.left' : col === 2 ? 'storage.middle' : 'storage.right');
  return String(col);
}

export function rowLabel(rows: number, row: number, t: Translate): string {
  if (rows === 1) return '';
  if (rows === 2) return t(row === 1 ? 'storage.back' : 'storage.front');
  return t('storage.row', { n: row });
}

/** The cell's own short name: a custom name, else e.g. "Back · Left". */
export function cellLabel(unit: Pick<StorageUnit, 'rows' | 'cols' | 'cellNames'>, id: string, t: Translate): string {
  const custom = unit.cellNames?.[id]?.trim();
  if (custom) return custom;
  const p = parseCellId(id);
  if (!p) return id;
  return [rowLabel(unit.rows, p.row, t), colLabel(unit.cols, p.col, t)].filter(Boolean).join(' · ');
}

/** Full breadcrumb, e.g. "Chest freezer › Layer 2 › 3". */
export function placeLabel(unit: StorageUnit, id: string, t: Translate): string {
  const p = parseCellId(id);
  const parts = [unit.name];
  if (p) parts.push(levelLabel(unit, p.level, t));
  const cell = cellLabel(unit, id, t);
  if (cell) parts.push(cell);
  return parts.join(' › ');
}

/** Binds the current units + translator into the store's PlaceOf callback. */
export function makePlaceOf(units: StorageUnit[], t: Translate): (unitId: string, cellId: string) => string {
  return (unitId, id) => {
    const unit = units.find((u) => u.id === unitId);
    return unit ? placeLabel(unit, id, t) : id;
  };
}

export function formatQty(item: Pick<StorageItem, 'qtyMode' | 'amount' | 'unit' | 'level'>, t: Translate): string {
  if (item.qtyMode === 'level') return t(`storage.qty.${item.level ?? 'some'}`);
  const amount = item.amount ?? 0;
  return item.unit ? `${amount} ${item.unit}` : String(amount);
}

/** Running low: a vague level of low/empty, or an exact count at zero. */
export function isLow(item: Pick<StorageItem, 'qtyMode' | 'amount' | 'level'>): boolean {
  return item.qtyMode === 'level' ? item.level === 'low' || item.level === 'empty' : (item.amount ?? 0) <= 0;
}

export const KIND_ICONS: Record<StorageUnitKind, string> = {
  shelving: '🗄️',
  chest: '🧊',
  drawers: '🗃️',
  custom: '📦',
};
