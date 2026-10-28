import { derived, get, writable } from 'svelte/store';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { activeGroupResolvedId } from './groups';
import { currentUser } from './auth';
import { normalizeText } from '../utils/normalize';
import { locale } from '../i18n';
import { SYSTEM_ITEMS } from '../storage/systemCatalog';
import { mergeCatalog } from '../storage/suggest';
import type {
  StorageCatalogEntry,
  StorageCategory,
  StorageEvent,
  StorageItem,
  StorageLevel,
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

activeGroupResolvedId.subscribe((groupId) => {
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

/** Resolves a unit + cell to its human-readable breadcrumb for the history log. */
export type PlaceOf = (unitId: string, cellId: string) => string;

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
}

export async function createUnit(groupId: string, draft: UnitDraft): Promise<string> {
  const ref = await addDoc(col(groupId, 'storageUnits'), {
    ...draft,
    cellNames: {},
    createdAt: Date.now(),
    createdBy: uid(),
  });
  return ref.id;
}

export async function updateUnit(
  groupId: string,
  unitId: string,
  patch: Partial<UnitDraft> & { cellNames?: Record<string, string> },
): Promise<void> {
  await updateDoc(doc(col(groupId, 'storageUnits'), unitId), patch);
}

/** Deletes the unit and everything in it, logging each item's removal. */
export async function deleteUnit(groupId: string, unit: StorageUnit, items: StorageItem[], placeOf: PlaceOf): Promise<void> {
  await removeItems(groupId, items, placeOf);
  await deleteDoc(doc(col(groupId, 'storageUnits'), unit.id));
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
function touchCatalog(
  batch: WriteBatch,
  groupId: string,
  name: string,
  unitId: string,
  unitOfMeasure: string | null,
  categoriesIfNew: string[],
): void {
  const key = normalizeText(name);
  if (!key) return;
  const ref = doc(col(groupId, 'storageCatalog'), key);
  const existing = get(storageCatalog).find((e) => e.id === key);
  if (existing) {
    batch.update(ref, {
      name,
      count: increment(1),
      lastUsed: Date.now(),
      unitIds: arrayUnion(unitId),
      ...(unitOfMeasure ? { unit: unitOfMeasure } : {}),
    });
  } else {
    batch.set(ref, {
      name,
      categories: categoriesIfNew,
      unit: unitOfMeasure,
      count: 1,
      lastUsed: Date.now(),
      unitIds: [unitId],
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
      i.unitId === unitId && i.cellId === cellId && i.nameKey === nameKey &&
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

  touchCatalog(batch, groupId, name, unitId, draft.qtyMode === 'count' ? draft.unit : null, categoriesIfNew);
  await batch.commit();
}

const TRACKED_FIELDS: (keyof ItemDraft)[] = ['name', 'qtyMode', 'amount', 'unit', 'level', 'expiry', 'note'];

export async function updateItem(
  groupId: string,
  item: StorageItem,
  patch: Partial<ItemDraft>,
  categoriesIfNew: string[],
  placeOf: PlaceOf,
): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of TRACKED_FIELDS) {
    if (key in patch && patch[key] !== item[key]) changes[key] = { from: item[key] ?? null, to: patch[key] ?? null };
  }
  if (Object.keys(changes).length === 0) return;

  const batch = writeBatch(db);
  const update: Record<string, unknown> = { ...patch, updatedAt: Date.now(), updatedBy: uid() };
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
    cellId: item.cellId,
    place: placeOf(item.unitId, item.cellId),
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
  // 3 writes per item: the item, its event, its catalog entry's unitIds.
  await inChunks(moving, 150, (batch, chunk) => {
    for (const item of chunk) {
      batch.update(doc(col(groupId, 'storageItems'), item.id), {
        unitId: toUnitId,
        cellId: toCellId,
        updatedAt: Date.now(),
        updatedBy: me,
      });
      logEvent(batch, groupId, {
        action: 'move',
        itemId: item.id,
        itemName: item.name,
        unitId: item.unitId,
        cellId: item.cellId,
        place: placeOf(item.unitId, item.cellId),
        toUnitId,
        toCellId,
        toPlace: placeOf(toUnitId, toCellId),
      });
      if (get(storageCatalog).some((e) => e.id === item.nameKey)) {
        batch.update(doc(col(groupId, 'storageCatalog'), item.nameKey), {
          unitIds: arrayUnion(toUnitId),
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
        place: placeOf(item.unitId, item.cellId),
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
