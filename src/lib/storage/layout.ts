import type { StorageItem, StorageSpan, StorageUnit, StorageUnitKind } from '../types';
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
  room: { levels: 1, rows: 1, cols: 1 },
};

/** The one cell of a room, where everything in it sits. */
export const ROOM_CELL = '1.1.1';

export function isRoom(unit: Pick<StorageUnit, 'kind'> | null | undefined): boolean {
  return unit?.kind === 'room';
}

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

// ── Space taken up ───────────────────────────────────────────────────────

export const SINGLE: StorageSpan = { levels: 1, rows: 1, cols: 1 };

// How much room something takes, as stored: an explicit list of cells
// (any shape), or — on older entries — a box counted from the anchor.
export type Shape = string[] | StorageSpan | null | undefined;

export function shapeOf(x: { cells?: string[] | null; span?: StorageSpan | null }): Shape {
  return x.cells && x.cells.length > 0 ? x.cells : (x.span ?? null);
}

/** Every cell an item anchored at `id` with `span` covers. */
export function coveredCellIds(id: string, span: StorageSpan = SINGLE): string[] {
  const p = parseCellId(id);
  if (!p) return [id];
  const ids: string[] = [];
  for (let l = p.level; l < p.level + span.levels; l++) {
    for (let r = p.row; r < p.row + span.rows; r++) {
      for (let c = p.col; c < p.col + span.cols; c++) ids.push(cellId(l, r, c));
    }
  }
  return ids;
}

/** The cells something anchored at `id` takes up. */
export function cellsOf(id: string, shape: Shape): string[] {
  if (Array.isArray(shape)) return shape.length > 0 ? shape : [id];
  return coveredCellIds(id, shape ?? SINGLE);
}

export function coveredOf(x: { cellId: string; cells?: string[] | null; span?: StorageSpan | null }): string[] {
  return cellsOf(x.cellId, shapeOf(x));
}

export function isSpanning(x: { cellId?: string; cells?: string[] | null; span?: StorageSpan | null }): boolean {
  if (x.cells && x.cells.length > 1) return true;
  const s = x.span ?? SINGLE;
  return s.levels > 1 || s.rows > 1 || s.cols > 1;
}

export function cellsFit(shape: Omit<UnitShape, 'kind'>, cells: string[]): boolean {
  return cells.every((c) => cellExists(shape, c));
}

const order = (a: string, b: string) => {
  const p = parseCellId(a);
  const q = parseCellId(b);
  if (!p || !q) return a.localeCompare(b);
  return p.level - q.level || p.row - q.row || p.col - q.col;
};

/**
 * A picked set of cells as something to store: the anchor is the first one
 * (top, back, left); `cells` only when there's more than one.
 */
export function placementOf(cells: Iterable<string>): { cellId: string; cells: string[] | null } {
  const sorted = [...new Set(cells)].sort(order);
  return { cellId: sorted[0] ?? '', cells: sorted.length > 1 ? sorted : null };
}

/** The same shape moved so its anchor sits at `toAnchor` (for moving things). */
export function shiftCells(cells: string[], fromAnchor: string, toAnchor: string): string[] {
  const a = parseCellId(fromAnchor);
  const b = parseCellId(toAnchor);
  if (!a || !b) return [toAnchor];
  return cells.map((c) => {
    const p = parseCellId(c);
    return p ? cellId(p.level + b.level - a.level, p.row + b.row - a.row, p.col + b.col - a.col) : c;
  });
}

/** Whether something keeps fitting when its anchor moves to `toAnchor` in `shape`. */
export function fitsAt(
  shape: Omit<UnitShape, 'kind'>,
  x: { cellId: string; cells?: string[] | null; span?: StorageSpan | null },
  toAnchor: string,
): boolean {
  return cellsFit(shape, shiftCells(coveredOf(x), x.cellId, toAnchor));
}

export function coversCell(item: { cellId: string; cells?: string[] | null; span?: StorageSpan | null }, id: string): boolean {
  return coveredOf(item).includes(id);
}

/** Items that would no longer fit (some covered cell gone) in a new shape. */
export function orphanedItems(shape: Omit<UnitShape, 'kind'>, items: StorageItem[]): StorageItem[] {
  return items.filter((i) => !cellsFit(shape, coveredOf(i)));
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

/** If the cells form a full box, that box as anchor + span. */
function asBox(cells: string[]): { cellId: string; span: StorageSpan } | null {
  const ps = cells.map(parseCellId);
  if (ps.some((p) => !p)) return null;
  const pts = ps as { level: number; row: number; col: number }[];
  const lo = { level: Math.min(...pts.map((p) => p.level)), row: Math.min(...pts.map((p) => p.row)), col: Math.min(...pts.map((p) => p.col)) };
  const span = {
    levels: Math.max(...pts.map((p) => p.level)) - lo.level + 1,
    rows: Math.max(...pts.map((p) => p.row)) - lo.row + 1,
    cols: Math.max(...pts.map((p) => p.col)) - lo.col + 1,
  };
  if (span.levels * span.rows * span.cols !== new Set(cells).size) return null;
  return { cellId: cellId(lo.level, lo.row, lo.col), span };
}

function boxLabel(unit: StorageUnit, id: string, t: Translate, span: StorageSpan): string[] {
  const p = parseCellId(id);
  const parts: string[] = [];
  if (p) {
    const top = levelLabel(unit, p.level, t);
    parts.push(span.levels > 1 ? `${top} – ${levelLabel(unit, p.level + span.levels - 1, t)}` : top);
  }
  const cell = cellLabel(unit, id, t);
  if (p && (span.rows > 1 || span.cols > 1)) {
    const far = cellLabel(unit, cellId(p.level, p.row + span.rows - 1, p.col + span.cols - 1), t);
    if (cell || far) parts.push(`${cell} – ${far}`);
  } else if (cell) {
    parts.push(cell);
  }
  return parts;
}

/**
 * Full breadcrumb, e.g. "Chest freezer › Layer 2 › 3". Something taking up
 * several cells reads as a range when they form a box ("Layer 1 – Layer 2
 * › 3"), otherwise as a list ("Layer 1 › 1 + Layer 2 › 2").
 */
export function placeLabel(unit: StorageUnit, id: string, t: Translate, shape: Shape = null): string {
  // A room has no shelves or cells to name — being in it is just its name.
  if (unit.kind === 'room') return unit.name;
  const cells = cellsOf(id, shape);
  if (cells.length <= 1) return [unit.name, ...boxLabel(unit, id, t, SINGLE)].join(' › ');
  const box = asBox(cells);
  if (box) return [unit.name, ...boxLabel(unit, box.cellId, t, box.span)].join(' › ');
  // Any other shape: per level, the cells taken up there.
  const byLevel = new Map<number, string[]>();
  for (const c of [...cells].sort(order)) {
    const level = parseCellId(c)?.level ?? 0;
    byLevel.set(level, [...(byLevel.get(level) ?? []), c]);
  }
  const pieces = [...byLevel].map(([level, ids]) => {
    const names = ids.map((c) => cellLabel(unit, c, t)).filter(Boolean);
    return [levelLabel(unit, level, t), ...(names.length ? [names.join(' + ')] : [])].join(' › ');
  });
  return `${unit.name} › ${pieces.join(' + ')}`;
}

/** Resolves a unit + anchor cell (+ span) to its breadcrumb. */
export type PlaceOf = (unitId: string, cellId: string, shape?: Shape) => string;

// Containers nest, but a corrupt parent chain must never hang the UI.
const MAX_DEPTH = 12;

/**
 * Breadcrumb through every container a place is inside, e.g. "Garage
 * shelves › Shelf 2 › Left › Red toolbox › Top tray".
 */
export function fullPlaceLabel(units: StorageUnit[], unitId: string, id: string, t: Translate, shape?: Shape): string {
  const parts: string[] = [];
  let current: { unitId: string; cellId: string; shape: Shape } | null = { unitId, cellId: id, shape };
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    const here: { unitId: string; cellId: string; shape: Shape } = current;
    const unit = units.find((u) => u.id === here.unitId);
    if (!unit) {
      parts.unshift(here.cellId);
      break;
    }
    parts.unshift(placeLabel(unit, here.cellId, t, here.shape));
    current = unit.parent ? { unitId: unit.parent.unitId, cellId: unit.parent.cellId, shape: shapeOf(unit.parent) } : null;
  }
  return parts.join(' › ');
}

/** Where a unit itself sits ("Garage shelves › Shelf 2 › Left"), or null if loose. */
export function unitLocationLabel(units: StorageUnit[], unit: StorageUnit, t: Translate): string | null {
  return unit.parent ? fullPlaceLabel(units, unit.parent.unitId, unit.parent.cellId, t, shapeOf(unit.parent)) : null;
}

/** Binds the current units + translator into a PlaceOf. */
export function makePlaceOf(units: StorageUnit[], t: Translate): PlaceOf {
  return (unitId, id, shape) => fullPlaceLabel(units, unitId, id, t, shape);
}

// ── Containers ─────────────────────────────────────────────────────────────

/** The unit and every container nested inside it, at any depth. */
export function selfAndDescendants(units: StorageUnit[], unitId: string): Set<string> {
  const found = new Set([unitId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of units) {
      if (u.parent && found.has(u.parent.unitId) && !found.has(u.id)) {
        found.add(u.id);
        grew = true;
      }
    }
  }
  return found;
}

/** Units a container may be put into: anything but itself or what's inside it. */
export function placeableTargets(units: StorageUnit[], container: StorageUnit): StorageUnit[] {
  const blocked = selfAndDescendants(units, container.id);
  return units.filter((u) => !blocked.has(u.id));
}

/** Containers sitting in (or reaching into) a given cell of a unit. */
export function containersInCell(units: StorageUnit[], unitId: string, id: string): StorageUnit[] {
  return units.filter(
    (u) => u.parent?.unitId === unitId && coveredOf(u.parent).includes(id),
  );
}

/** Containers that would no longer fit if `unitId` took a new shape. */
export function orphanedContainers(shape: Omit<UnitShape, 'kind'>, units: StorageUnit[], unitId: string): StorageUnit[] {
  return units.filter((u) => u.parent?.unitId === unitId && !cellsFit(shape, coveredOf(u.parent)));
}

export function unitIcon(unit: Pick<StorageUnit, 'kind' | 'icon'>): string {
  return unit.icon || KIND_ICONS[unit.kind];
}

// Picked from in the unit editor. Emoji has no coloured boxes, so the
// coloured squares/circles serve as "the red one", "the blue one" markers.
export const UNIT_ICONS = [
  '📦', '🗃️', '🗄️', '🧰', '🧳', '💼', '👜', '👝', '🛍️', '🎒', '🧺', '🪣',
  '🫙', '🥡', '🧊', '🍱', '🧵', '🔧', '🔌', '💊', '🎄', '🧸', '👟', '📚',
  '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛', '⬜',
  '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪',
];

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
  room: '🚪',
};

/**
 * A link straight to a unit (or one of its cells) that anyone in the group
 * can open — what Share, the printed QR label and an NFC tag all carry. The
 * group id rides along so the app switches to the right group on open.
 */
export function storageLink(origin: string, base: string, groupId: string, unitId: string, cellId?: string | null): string {
  const query = new URLSearchParams({ group: groupId });
  if (cellId) query.set('cell', cellId);
  return `${origin}${base}#/storage/${unitId}?${query}`;
}

/** The room a unit is in, directly or through the units it sits inside. */
export function roomOf(units: StorageUnit[], unitId: string): StorageUnit | null {
  let current = units.find((u) => u.id === unitId);
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current.kind === 'room') return current;
    const parentId: string | undefined = current.parent?.unitId;
    current = parentId ? units.find((u) => u.id === parentId) : undefined;
  }
  return null;
}

/**
 * Where an item usually goes: the catalog's record of where this thing was
 * last put away, as long as that spot still exists and the item fits there.
 */
export function usualPlace(
  catalog: { id: string; lastPlace?: { unitId: string; cellId: string } | null }[],
  units: StorageUnit[],
  item: Pick<StorageItem, 'nameKey' | 'unitId' | 'cellId' | 'span' | 'cells'>,
): { unitId: string; cellId: string } | null {
  const place = catalog.find((e) => e.id === item.nameKey)?.lastPlace;
  if (!place) return null;
  const unit = units.find((u) => u.id === place.unitId);
  if (!unit || unit.inbox || !fitsAt(unit, item, place.cellId)) return null;
  if (place.unitId === item.unitId && place.cellId === item.cellId) return null; // already there
  return { unitId: place.unitId, cellId: place.cellId };
}

/**
 * Two entries that are really the same stock: same thing, both counted in
 * the same unit of measure, neither stretched over several cells. Moving
 * one onto the other adds the amounts instead of keeping two lines.
 */
export function canMerge(a: StorageItem, b: StorageItem): boolean {
  return (
    a.nameKey === b.nameKey &&
    a.qtyMode === 'count' && b.qtyMode === 'count' &&
    a.amount !== null && b.amount !== null &&
    (a.unit ?? '') === (b.unit ?? '') &&
    !isSpanning(a) && !isSpanning(b)
  );
}
