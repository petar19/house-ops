import { derived, get, writable } from 'svelte/store';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  setDoc,
  query,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { groupIdFor } from './groups';
import { currentUser } from './auth';
import { normalizeText } from '../utils/normalize';
import { locale } from '../i18n';
import { SYSTEM_ITEMS } from '../storage/systemCatalog';
import { mergeCatalog } from '../storage/suggest';
import { canMerge, cellsOf, coveredOf, isSpanning, shapeOf, shiftCells, type PlaceOf } from '../storage/layout';
import { combineDrafts, type ImportDraft } from '../storage/importParse';
import type {
  ReceiptItemRequest,
  StorageCatalogEntry,
  StorageCategory,
  StorageEvent,
  StorageItem,
  StorageLevel,
  StoragePlacement,
  StorageUnit,
  StorageUnitKind,
} from '../types';

export const storageUnits = writable<StorageUnit[]>([]);
export const storageItems = writable<StorageItem[]>([]);
export const storageCatalog = writable<StorageCatalogEntry[]>([]);
export const storageCategories = writable<StorageCategory[]>([]);
export const storageLoading = writable(true);

// A household has hundreds to a few thousand stored items at most, so the
// whole group's inventory is kept live in memory — search and the grid's
// per-cell counts are then plain client-side filtering (Firestore has no
// full-text search anyway).
let unsubs: (() => void)[] = [];

groupIdFor('storage').subscribe((groupId) => {
  unsubs.forEach((u) => u());
  unsubs = [];
  storageUnits.set([]);
  storageItems.set([]);
  storageCatalog.set([]);
  storageCategories.set([]);
  if (!groupId) {
    storageLoading.set(false);
    return;
  }
  storageLoading.set(true);
  const sub = <T>(name: string, target: { set: (v: T[]) => void }, done?: () => void) =>
    onSnapshot(
      collection(db, 'groups', groupId, name),
      (snap) => {
        target.set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        done?.();
      },
      (err) => {
        console.error(`Failed to load ${name}:`, err);
        done?.();
      },
    );
  unsubs.push(
    sub<StorageUnit>('storageUnits', storageUnits),
    sub<StorageItem>('storageItems', storageItems, () => storageLoading.set(false)),
    sub<StorageCatalogEntry>('storageCatalog', storageCatalog),
    sub<StorageCategory>('storageCategories', storageCategories),
  );
});

// What autocomplete and search work from: the built-in items in the current
// language, with this group's own entries layered on top.
export const catalogOptions = derived([storageCatalog, locale], ([$catalog, $locale]) =>
  mergeCatalog(SYSTEM_ITEMS, $catalog, $locale),
);

// Resolves a unit + cell (+ span) to its breadcrumb for the history log.
export type { PlaceOf } from '../storage/layout';

function uid(): string {
  const user = get(currentUser);
  if (!user) throw new Error('Not signed in');
  return user.uid;
}

const col = (groupId: string, name: string) => collection(db, 'groups', groupId, name);

function logEvent(batch: WriteBatch, groupId: string, event: Omit<StorageEvent, 'id' | 'at' | 'by'>): void {
  batch.set(doc(col(groupId, 'storageEvents')), { ...event, at: Date.now(), by: uid() });
}

// Firestore caps a batch at 500 writes; every item op here is 2 (the item
// and its event), so bulk moves/removes go in chunks.
async function inChunks<T>(list: T[], size: number, fn: (batch: WriteBatch, chunk: T[]) => void): Promise<void> {
  for (let i = 0; i < list.length; i += size) {
    const batch = writeBatch(db);
    fn(batch, list.slice(i, i + size));
    await batch.commit();
  }
}

// ── Units ──────────────────────────────────────────────────────────────────

export interface UnitDraft {
  name: string;
  kind: StorageUnitKind;
  levels: number;
  rows: number;
  cols: number;
  categories: string[];
  levelNames: Record<string, string>;
  icon: string | null;
  movable: boolean;
}

export async function createUnit(groupId: string, draft: UnitDraft, parent: StoragePlacement | null = null): Promise<string> {
  const ref = await addDoc(col(groupId, 'storageUnits'), {
    ...draft,
    parent,
    cellNames: {},
    createdAt: Date.now(),
    createdBy: uid(),
  });
  return ref.id;
}

export async function updateUnit(
  groupId: string,
  unitId: string,
  patch: Partial<UnitDraft> & { cellNames?: Record<string, string>; parent?: StoragePlacement | null },
): Promise<void> {
  await updateDoc(doc(col(groupId, 'storageUnits'), unitId), patch);
}

/** Deletes the unit and everything in it, logging each item's removal. */
/**
 * Deletes the unit and the items directly in it, logging each removal.
 * Containers sitting in it are kept, just taken out — they become loose,
 * with their own contents untouched.
 */
export async function deleteUnit(groupId: string, unit: StorageUnit, items: StorageItem[], placeOf: PlaceOf): Promise<void> {
  await removeItems(groupId, items, placeOf);
  const inside = get(storageUnits).filter((u) => u.parent?.unitId === unit.id);
  const batch = writeBatch(db);
  for (const child of inside) batch.update(doc(col(groupId, 'storageUnits'), child.id), { parent: null });
  batch.delete(doc(col(groupId, 'storageUnits'), unit.id));
  await batch.commit();
}

/**
 * Puts a container into a cell of another unit, or takes it out (null).
 * Its items stay attached to it, so they move along for free. Logged as a
 * move between the two places, so it shows in both units' history.
 */
export async function placeUnit(
  groupId: string,
  unit: StorageUnit,
  parent: StoragePlacement | null,
  places: { from: string; to: string },
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(col(groupId, 'storageUnits'), unit.id), { parent });
  logEvent(batch, groupId, {
    action: 'move',
    itemId: unit.id,
    itemName: unit.name,
    // A loose container's "place" is the container itself.
    unitId: unit.parent?.unitId ?? unit.id,
    cellId: unit.parent?.cellId ?? '',
    place: places.from,
    toUnitId: parent?.unitId ?? unit.id,
    toCellId: parent?.cellId ?? '',
    toPlace: places.to,
  });
  await batch.commit();
}

export async function addCategory(groupId: string, name: string): Promise<string> {
  const ref = await addDoc(col(groupId, 'storageCategories'), { name: name.trim() });
  return ref.id;
}

// ── Items ──────────────────────────────────────────────────────────────────

export interface ItemDraft {
  name: string;
  qtyMode: 'count' | 'level';
  amount: number | null;
  unit: string | null;
  level: StorageLevel | null;
  expiry: string | null;
  note: string;
}

// Records the name in the group catalog (so it autocompletes next time).
// A brand-new name starts with the categories the caller picked — usually
// the matching system item's, else the unit's — an existing one keeps its.
function isInbox(unitId: string): boolean {
  return !!get(storageUnits).find((u) => u.id === unitId)?.inbox;
}

// Also remembers where the item was put (its lastPlace, the "usually goes"
// hint) — except Unsorted, which is somewhere things wait, not where they go.
function touchCatalog(
  batch: WriteBatch,
  groupId: string,
  name: string,
  unitId: string,
  unitOfMeasure: string | null,
  categoriesIfNew: string[],
  cellId?: string,
): void {
  const key = normalizeText(name);
  if (!key) return;
  const ref = doc(col(groupId, 'storageCatalog'), key);
  const existing = get(storageCatalog).find((e) => e.id === key);
  const placed = !isInbox(unitId);
  const lastPlace = placed && cellId ? { lastPlace: { unitId, cellId, span: null } } : {};
  if (existing) {
    batch.update(ref, {
      name,
      count: increment(1),
      lastUsed: Date.now(),
      ...(placed ? { unitIds: arrayUnion(unitId) } : {}),
      ...lastPlace,
      ...(unitOfMeasure ? { unit: unitOfMeasure } : {}),
    });
  } else {
    batch.set(ref, {
      name,
      categories: categoriesIfNew,
      unit: unitOfMeasure,
      count: 1,
      lastUsed: Date.now(),
      unitIds: placed ? [unitId] : [],
      ...lastPlace,
    });
  }
}

/**
 * Adds an item to a cell. If the same thing is already counted there in the
 * same unit of measure, its amount goes up instead of a duplicate appearing.
 */
export async function addItem(
  groupId: string,
  unitId: string,
  cellId: string,
  draft: ItemDraft,
  categoriesIfNew: string[],
  placeOf: PlaceOf,
): Promise<void> {
  const name = draft.name.trim();
  const nameKey = normalizeText(name);
  if (!nameKey) throw new Error('Name is required');
  const now = Date.now();
  const me = uid();
  const batch = writeBatch(db);

  const same = get(storageItems).find(
    (i) =>
      i.unitId === unitId && i.cellId === cellId && i.nameKey === nameKey && !isSpanning(i) &&
      i.qtyMode === 'count' && draft.qtyMode === 'count' && (i.unit ?? '') === (draft.unit ?? ''),
  );

  if (same && same.amount !== null && draft.amount !== null) {
    const amount = same.amount + draft.amount;
    batch.update(doc(col(groupId, 'storageItems'), same.id), { amount, updatedAt: now, updatedBy: me });
    logEvent(batch, groupId, {
      action: 'edit',
      itemId: same.id,
      itemName: same.name,
      unitId,
      cellId,
      place: placeOf(unitId, cellId),
      changes: { amount: { from: same.amount, to: amount } },
    });
  } else {
    const ref = doc(col(groupId, 'storageItems'));
    batch.set(ref, {
      ...draft,
      name,
      nameKey,
      unitId,
      cellId,
      addedAt: now,
      addedBy: me,
      updatedAt: now,
      updatedBy: me,
    } satisfies Omit<StorageItem, 'id'>);
    logEvent(batch, groupId, { action: 'add', itemId: ref.id, itemName: name, unitId, cellId, place: placeOf(unitId, cellId) });
  }

  touchCatalog(batch, groupId, name, unitId, draft.qtyMode === 'count' ? draft.unit : null, categoriesIfNew, cellId);
  await batch.commit();
}

const TRACKED_FIELDS: (keyof ItemDraft)[] = ['name', 'qtyMode', 'amount', 'unit', 'level', 'expiry', 'note'];

/** Where an item sits: its anchor cell and, if more than one, exactly which cells. */
export interface SpaceDraft {
  cellId: string;
  cells: string[] | null;
}

const sameCells = (a: string[], b: string[]) => a.length === b.length && a.every((c) => b.includes(c));

export async function updateItem(
  groupId: string,
  item: StorageItem,
  patch: Partial<ItemDraft> & Partial<SpaceDraft>,
  categoriesIfNew: string[],
  placeOf: PlaceOf,
): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of TRACKED_FIELDS) {
    if (key in patch && patch[key] !== item[key]) changes[key] = { from: item[key] ?? null, to: patch[key] ?? null };
  }
  const cellId = patch.cellId ?? item.cellId;
  const before = coveredOf(item);
  const after = 'cells' in patch ? cellsOf(cellId, patch.cells) : before;
  if (cellId !== item.cellId || !sameCells(before, after)) {
    // Logged as the place it covered before and after, not raw cell ids.
    changes.space = { from: placeOf(item.unitId, item.cellId, shapeOf(item)), to: placeOf(item.unitId, cellId, after) };
  }
  if (Object.keys(changes).length === 0) return;

  const batch = writeBatch(db);
  const update: Record<string, unknown> = { ...patch, updatedAt: Date.now(), updatedBy: uid() };
  // Space is now always stored as the exact cells; the older box form goes.
  if ('cells' in patch) {
    update.cells = after.length > 1 ? after : null;
    update.span = null;
  }
  if (changes.name) {
    const name = String(patch.name).trim();
    update.name = name;
    update.nameKey = normalizeText(name);
    touchCatalog(batch, groupId, name, item.unitId, patch.unit ?? item.unit, categoriesIfNew);
  }
  batch.update(doc(col(groupId, 'storageItems'), item.id), update);
  logEvent(batch, groupId, {
    action: 'edit',
    itemId: item.id,
    itemName: (update.name as string | undefined) ?? item.name,
    unitId: item.unitId,
    cellId,
    place: placeOf(item.unitId, cellId, after),
    changes,
  });
  await batch.commit();
}

export async function moveItems(
  groupId: string,
  items: StorageItem[],
  toUnitId: string,
  toCellId: string,
  placeOf: PlaceOf,
): Promise<void> {
  const moving = items.filter((i) => i.unitId !== toUnitId || i.cellId !== toCellId);
  const me = uid();
  const intoInbox = isInbox(toUnitId);
  // What's already in the target cell, plus each moved item once it lands —
  // so two "peas" lines moved together also end up as one.
  const atTarget: StorageItem[] = get(storageItems).filter((i) => i.unitId === toUnitId && i.cellId === toCellId);
  const runningAmount = new Map<string, number>();
  // Something taking up several cells keeps its shape, moved to the new anchor.
  const movedCells = (item: StorageItem) => shiftCells(coveredOf(item), item.cellId, toCellId);

  // Up to 6 writes per item: the item, the entry it merges into, two
  // events and its catalog entry.
  await inChunks(moving, 80, (batch, chunk) => {
    for (const item of chunk) {
      const now = Date.now();
      logEvent(batch, groupId, {
        action: 'move',
        itemId: item.id,
        itemName: item.name,
        unitId: item.unitId,
        cellId: item.cellId,
        place: placeOf(item.unitId, item.cellId, shapeOf(item)),
        toUnitId,
        toCellId,
        toPlace: placeOf(toUnitId, toCellId, movedCells(item)),
      });
      const target = atTarget.find((t) => t.id !== item.id && canMerge(t, item));
      if (target) {
        const before = runningAmount.get(target.id) ?? target.amount ?? 0;
        const after = before + (item.amount ?? 0);
        runningAmount.set(target.id, after);
        batch.delete(doc(col(groupId, 'storageItems'), item.id));
        batch.update(doc(col(groupId, 'storageItems'), target.id), { amount: after, updatedAt: now, updatedBy: me });
        logEvent(batch, groupId, {
          action: 'edit',
          itemId: target.id,
          itemName: target.name,
          unitId: toUnitId,
          cellId: toCellId,
          place: placeOf(toUnitId, toCellId),
          changes: { amount: { from: before, to: after } },
        });
      } else {
        const cells = movedCells(item);
        batch.update(doc(col(groupId, 'storageItems'), item.id), {
          unitId: toUnitId,
          cellId: toCellId,
          cells: cells.length > 1 ? cells : null,
          span: null,
          updatedAt: now,
          updatedBy: me,
        });
        atTarget.push({ ...item, unitId: toUnitId, cellId: toCellId });
      }
      if (!intoInbox && get(storageCatalog).some((e) => e.id === item.nameKey)) {
        batch.update(doc(col(groupId, 'storageCatalog'), item.nameKey), {
          unitIds: arrayUnion(toUnitId),
          lastPlace: { unitId: toUnitId, cellId: toCellId, span: null },
        });
      }
    }
  });
}

export async function removeItems(groupId: string, items: StorageItem[], placeOf: PlaceOf): Promise<void> {
  await inChunks(items, 200, (batch, chunk) => {
    for (const item of chunk) {
      batch.delete(doc(col(groupId, 'storageItems'), item.id));
      logEvent(batch, groupId, {
        action: 'remove',
        itemId: item.id,
        itemName: item.name,
        unitId: item.unitId,
        cellId: item.cellId,
        place: placeOf(item.unitId, item.cellId, shapeOf(item)),
      });
    }
  });
}

/** An item's history, newest first (fetched on demand, not kept live). */
export async function loadItemHistory(groupId: string, itemId: string): Promise<StorageEvent[]> {
  // Equality-only filter, sorted here — avoids needing a composite index.
  const snap = await getDocs(query(col(groupId, 'storageEvents'), where('itemId', '==', itemId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<StorageEvent, 'id'>) }))
    .sort((a, b) => b.at - a.at);
}

export const HISTORY_PAGE = 40;

/**
 * One newest-first page of the group's storage history, or one unit's (what
 * happened in it, including things moved in from elsewhere). Pass the oldest
 * `at` seen so far as `before` for the next page, along with the ids already
 * shown: the cursor is inclusive (a bulk move can stamp many events with the
 * same millisecond), so `seen` is what stops a page boundary repeating them.
 */
export async function loadHistoryPage(
  groupId: string,
  unitId: string | null,
  before: number | null,
  seen: Set<string>,
): Promise<{ events: StorageEvent[]; hasMore: boolean }> {
  const base = col(groupId, 'storageEvents');
  const page = (field?: 'unitId' | 'toUnitId') =>
    query(
      base,
      ...(field ? [where(field, '==', unitId)] : []),
      ...(before !== null ? [where('at', '<=', before)] : []),
      orderBy('at', 'desc'),
      limit(HISTORY_PAGE),
    );
  const snaps = await Promise.all((unitId ? [page('unitId'), page('toUnitId')] : [page()]).map((q) => getDocs(q)));

  const byId = new Map<string, StorageEvent>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!seen.has(d.id)) byId.set(d.id, { id: d.id, ...(d.data() as Omit<StorageEvent, 'id'>) });
    }
  }
  const events = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, HISTORY_PAGE);
  return { events, hasMore: snaps.some((s) => s.size === HISTORY_PAGE) };
}

/**
 * Turns an item (say a toolbox that was logged as a thing) into a container
 * in the same spot, so things can go inside it. The item entry is removed
 * (logged as such) and an empty one-spot container takes its place.
 */
export async function convertItemToContainer(groupId: string, item: StorageItem, placeOf: PlaceOf): Promise<string> {
  const id = await createUnit(
    groupId,
    {
      name: item.name,
      kind: 'custom',
      levels: 1,
      rows: 1,
      cols: 1,
      categories: [],
      levelNames: {},
      icon: null,
      movable: true,
    },
    { unitId: item.unitId, cellId: item.cellId, cells: isSpanning(item) ? coveredOf(item) : null },
  );
  await removeItems(groupId, [item], placeOf);
  return id;
}

export type { ImportDraft };

// ── Import / Unsorted ──────────────────────────────────────────────────────

/** The group's Unsorted container, created the first time something is imported. */
export async function ensureUnsorted(groupId: string, name: string): Promise<string> {
  const existing = get(storageUnits).find((u) => u.inbox);
  if (existing) return existing.id;
  const ref = await addDoc(col(groupId, 'storageUnits'), {
    name,
    kind: 'custom',
    levels: 1,
    rows: 1,
    cols: 1,
    categories: [],
    levelNames: {},
    cellNames: {},
    icon: '📥',
    movable: true,
    parent: null,
    inbox: true,
    createdAt: Date.now(),
    createdBy: uid(),
  } satisfies Omit<StorageUnit, 'id'>);
  return ref.id;
}

/** Adds a whole list to Unsorted (each one logged like a normal add). */
export async function importToUnsorted(
  groupId: string,
  unsortedName: string,
  drafts: ImportDraft[],
  placeOf: PlaceOf,
): Promise<{ unitId: string; count: number }> {
  const unitId = await ensureUnsorted(groupId, unsortedName);
  const list = combineDrafts(drafts);
  for (const { categories, ...draft } of list) {
    await addItem(groupId, unitId, '1.1.1', draft, categories, placeOf);
  }
  return { unitId, count: list.length };
}

/** Asks the OCR watcher to read a bill's products (see ReceiptItemRequest). */
export async function requestReceiptItems(groupId: string, documentId: string): Promise<void> {
  await setDoc(
    doc(col(groupId, 'receiptItemRequests'), documentId),
    { status: 'pending', requestedBy: uid(), requestedAt: Date.now() },
    { merge: true },
  );
}

export async function markReceiptImported(groupId: string, documentId: string, status: ReceiptItemRequest['status']): Promise<void> {
  await setDoc(
    doc(col(groupId, 'receiptItemRequests'), documentId),
    { status, requestedBy: uid(), importedAt: Date.now() },
    { merge: true },
  );
}

/** Files a pasted receipt for the OCR watcher to read; returns the request id. */
export async function requestReceiptText(groupId: string, text: string): Promise<string> {
  const ref = await addDoc(col(groupId, 'receiptTextRequests'), {
    status: 'pending',
    requestedBy: uid(),
    requestedAt: Date.now(),
    text,
  });
  return ref.id;
}
