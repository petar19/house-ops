import { get, writable } from 'svelte/store';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { groupIdFor } from './groups';
import { currentUser } from './auth';
import { restockDue, type ListCandidate } from '../shopping/lowStock';
import { toIso } from '../utils/date';
import type { ShoppingItem, ShoppingList, ShoppingRestock } from '../types';

export const shoppingLists = writable<ShoppingList[]>([]);
export const shoppingItems = writable<ShoppingItem[]>([]);
export const shoppingRestock = writable<ShoppingRestock[]>([]);
export const shoppingLoading = writable(true);

let unsubs: (() => void)[] = [];

groupIdFor('shoppingList').subscribe((groupId) => {
  unsubs.forEach((u) => u());
  unsubs = [];
  shoppingLists.set([]);
  shoppingItems.set([]);
  shoppingRestock.set([]);
  if (!groupId) {
    shoppingLoading.set(false);
    return;
  }
  shoppingLoading.set(true);
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
    sub<ShoppingList>('shoppingLists', {
      set: (lists) => shoppingLists.set(lists.sort((a, b) => a.createdAt - b.createdAt)),
    }, () => shoppingLoading.set(false)),
    sub<ShoppingItem>('shoppingItems', shoppingItems),
    sub<ShoppingRestock>('shoppingRestock', shoppingRestock),
  );
});

function uid(): string {
  const user = get(currentUser);
  if (!user) throw new Error('Not signed in');
  return user.uid;
}

const col = (groupId: string, name: string) => collection(db, 'groups', groupId, name);

// The list "add to shopping list" buttons elsewhere (storage) put things on:
// whichever one was used last on this device, else the first.
const LAST_LIST_KEY = 'shopping.lastList';
export function rememberList(listId: string): void {
  try {
    localStorage.setItem(LAST_LIST_KEY, listId);
  } catch {
    /* private mode — falls back to the first list */
  }
}
export function defaultListId(): string | null {
  const lists = get(shoppingLists);
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_LIST_KEY);
  } catch {
    /* ignore */
  }
  return lists.find((l) => l.id === last)?.id ?? lists[0]?.id ?? null;
}

/** Creates a list, optionally already holding the given things; returns its id. */
export async function createList(groupId: string, name: string, prefill: ListCandidate[] = []): Promise<string> {
  const me = uid();
  const ref = doc(col(groupId, 'shoppingLists'));
  const batch = writeBatch(db);
  batch.set(ref, { name: name.trim(), createdAt: Date.now(), createdBy: me });
  for (const c of prefill.slice(0, 400)) {
    batch.set(doc(col(groupId, 'shoppingItems')), newItem(ref.id, c, 'storage', me));
  }
  await batch.commit();
  return ref.id;
}

export async function renameList(groupId: string, listId: string, name: string): Promise<void> {
  await updateDoc(doc(col(groupId, 'shoppingLists'), listId), { name: name.trim() });
}

/** Deletes a list and everything on it. */
export async function deleteList(groupId: string, listId: string): Promise<void> {
  const items = await getDocs(query(col(groupId, 'shoppingItems'), where('listId', '==', listId)));
  const batch = writeBatch(db);
  items.docs.slice(0, 450).forEach((d) => batch.delete(d.ref));
  batch.delete(doc(col(groupId, 'shoppingLists'), listId));
  await batch.commit();
}

function newItem(listId: string, c: ListCandidate, source: ShoppingItem['source'], me: string, note = '') {
  return {
    listId,
    name: c.name,
    productKey: c.productKey,
    note,
    checked: false,
    addedAt: Date.now(),
    addedBy: me,
    source,
  } satisfies Omit<ShoppingItem, 'id'>;
}

/**
 * Puts things on a list. Something already on it (not yet ticked) isn't
 * added twice; a ticked copy is un-ticked instead of duplicated.
 * Returns how many were actually added or brought back.
 */
export async function addToList(
  groupId: string,
  listId: string,
  candidates: ListCandidate[],
  source: ShoppingItem['source'] = 'manual',
  note = '',
): Promise<number> {
  const me = uid();
  const onList = get(shoppingItems).filter((i) => i.listId === listId);
  const batch = writeBatch(db);
  let changed = 0;
  for (const c of candidates.slice(0, 400)) {
    const existing = onList.find((i) => i.productKey === c.productKey);
    if (existing && !existing.checked) continue;
    if (existing) batch.update(doc(col(groupId, 'shoppingItems'), existing.id), { checked: false, note: note || existing.note });
    else batch.set(doc(col(groupId, 'shoppingItems')), newItem(listId, c, source, me, note));
    changed++;
  }
  if (changed > 0) await batch.commit();
  rememberList(listId);
  return changed;
}

export async function updateShoppingItem(groupId: string, itemId: string, patch: Partial<Pick<ShoppingItem, 'name' | 'note'>>): Promise<void> {
  await updateDoc(doc(col(groupId, 'shoppingItems'), itemId), patch);
}

export async function removeShoppingItem(groupId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(col(groupId, 'shoppingItems'), itemId));
}

/** Removes everything ticked off a list. */
export async function clearChecked(groupId: string, listId: string): Promise<void> {
  const done = get(shoppingItems).filter((i) => i.listId === listId && i.checked);
  const batch = writeBatch(db);
  done.slice(0, 450).forEach((i) => batch.delete(doc(col(groupId, 'shoppingItems'), i.id)));
  await batch.commit();
}

/**
 * Ticks an item off (or back on). Ticking a product that repeats restarts
 * its timer from today.
 */
export async function setChecked(groupId: string, item: ShoppingItem, checked: boolean, reminderText: string): Promise<void> {
  await updateDoc(doc(col(groupId, 'shoppingItems'), item.id), { checked });
  if (!checked) return;
  const restock = get(shoppingRestock).find((r) => r.id === item.productKey);
  if (restock) await startRestockTimer(groupId, restock, reminderText);
}

// The timer is one group reminder per product, reused every cycle: due at
// 09:00 on the day the product should go back on the list. When it fires, the
// bot adds it to the list (shoppingAdd) and posts reminderText in the chat.
async function startRestockTimer(groupId: string, restock: ShoppingRestock, reminderText: string): Promise<void> {
  const today = toIso(new Date());
  const nextTriggerAt = `${restockDue(today, restock.days)}T09:00`;
  const shoppingAdd = { listId: restock.listId, name: restock.name, productKey: restock.id };
  let reminderId = restock.reminderId;
  let updated = false;
  if (reminderId) {
    try {
      await updateDoc(doc(col(groupId, 'reminders'), reminderId), {
        nextTriggerAt,
        status: 'active',
        scheduleType: 'once',
        text: reminderText,
        shoppingAdd,
      });
      updated = true;
    } catch {
      updated = false; // the reminder was deleted by hand — make a new one
    }
  }
  if (!updated) {
    const ref = await addDoc(col(groupId, 'reminders'), {
      ownerUid: uid(),
      scope: 'group',
      groupId,
      text: reminderText,
      scheduleType: 'once',
      nextTriggerAt,
      shoppingAdd,
      status: 'active',
      createdAt: Date.now(),
      source: 'app',
    });
    reminderId = ref.id;
  }
  await updateDoc(doc(col(groupId, 'shoppingRestock'), restock.id), { lastBoughtAt: today, reminderId });
}

/** Sets (or, with days = null, stops) how often a product is bought. */
export async function setRestock(
  groupId: string,
  product: ListCandidate,
  days: number | null,
  listId: string,
): Promise<void> {
  const ref = doc(col(groupId, 'shoppingRestock'), product.productKey);
  const existing = get(shoppingRestock).find((r) => r.id === product.productKey);
  if (days === null) {
    if (existing?.reminderId) {
      await deleteDoc(doc(col(groupId, 'reminders'), existing.reminderId)).catch(() => {});
    }
    await deleteDoc(ref);
    return;
  }
  await setDoc(
    ref,
    {
      name: product.name,
      days: Math.round(days),
      listId,
      lastBoughtAt: existing?.lastBoughtAt ?? null,
      reminderId: existing?.reminderId ?? null,
    } satisfies Omit<ShoppingRestock, 'id'>,
  );
  // An already running timer follows the new interval / list straight away.
  if (existing?.reminderId && existing.lastBoughtAt) {
    await updateDoc(doc(col(groupId, 'reminders'), existing.reminderId), {
      nextTriggerAt: `${restockDue(existing.lastBoughtAt, Math.round(days))}T09:00`,
      shoppingAdd: { listId, name: product.name, productKey: product.productKey },
    }).catch(() => {});
  }
}
