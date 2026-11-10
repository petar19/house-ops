import { derived, get, writable } from 'svelte/store';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { groupIdFor } from './groups';
import { currentUser } from './auth';
import { normalizeText } from '../utils/normalize';
import { sortByRecency } from '../utils/stats';
import type { Expense, KnownName } from '../types';

export const expenses = writable<Expense[]>([]);
export const expensesLoading = writable(true);
export const knownNames = writable<KnownName[]>([]);

function startOfCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// The default live view only needs recent data (the expense list, adding new
// expenses) — but a group migrated from years of WhatsApp history can have
// thousands of documents, and onSnapshot re-reads the *entire* matched result
// on every fresh page load. Scoping to null means "no lower bound" (full
// history); pages that genuinely need that (Stats, SettleUp, ExportImport)
// call loadFullExpenseHistory() themselves rather than the list silently
// showing an incomplete picture by default.
export const expensesRangeStart = writable<string | null>(startOfCurrentMonth());

export function loadFullExpenseHistory(): void {
  expensesRangeStart.set(null);
}

let unsubExpenses: (() => void) | null = null;
let unsubKnownNames: (() => void) | null = null;
let lastGroupId: string | null = null;
let knownNamesGroupId: string | null = null;

const expensesGroupId = groupIdFor('expenses');

const expensesSubscriptionKey = derived(
  [expensesGroupId, expensesRangeStart],
  ([groupId, rangeStart]) => `${groupId ?? ''}|${rangeStart ?? ''}`,
);

expensesSubscriptionKey.subscribe(() => {
  const groupId = get(expensesGroupId);
  const rangeStart = get(expensesRangeStart);

  // Switching groups starts over at the default (small) window rather than
  // carrying over however far a previous group's view had been widened.
  if (groupId !== lastGroupId) {
    lastGroupId = groupId;
    if (groupId && rangeStart !== startOfCurrentMonth()) {
      expensesRangeStart.set(startOfCurrentMonth());
      return; // the .set above re-triggers this subscription with the reset range
    }
  }

  if (unsubExpenses) {
    unsubExpenses();
    unsubExpenses = null;
  }
  // Name suggestions don't depend on the date range — only re-read them when
  // the group changes, not every time the expense window widens.
  if (unsubKnownNames && knownNamesGroupId !== groupId) {
    unsubKnownNames();
    unsubKnownNames = null;
    knownNamesGroupId = null;
  }

  if (!groupId) {
    expenses.set([]);
    expensesLoading.set(false);
    knownNames.set([]);
    return;
  }

  expensesLoading.set(true);
  const expensesQuery = rangeStart
    ? query(
        collection(db, 'groups', groupId, 'expenses'),
        where('date', '>=', rangeStart),
        orderBy('date', 'desc'),
      )
    : query(collection(db, 'groups', groupId, 'expenses'), orderBy('date', 'desc'));
  unsubExpenses = onSnapshot(
    expensesQuery,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }));
      expenses.set(sortByRecency(docs));
      expensesLoading.set(false);
    },
    () => {
      expenses.set([]);
      expensesLoading.set(false);
    },
  );

  if (!unsubKnownNames) {
    knownNamesGroupId = groupId;
    unsubKnownNames = onSnapshot(collection(db, 'groups', groupId, 'knownNames'), (snap) => {
      knownNames.set(
        snap.docs.map((d) => ({ name: d.id, ...(d.data() as Omit<KnownName, 'name'>) })),
      );
    });
  }
});

/** One-time (non-live) fetch of a group's full expense history — used where
 * correctness needs every document regardless of the live view's current
 * range (e.g. import duplicate-detection), without widening the live
 * listener for the rest of the session. */
export async function fetchAllExpenses(groupId: string): Promise<Expense[]> {
  const snap = await getDocs(collection(db, 'groups', groupId, 'expenses'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }));
}

export type NewExpense = Omit<Expense, 'id' | 'createdBy' | 'createdAt' | 'source'>;

export async function addExpense(groupId: string, data: NewExpense): Promise<void> {
  const user = get(currentUser);
  if (!user) throw new Error('Not signed in');
  await addDoc(collection(db, 'groups', groupId, 'expenses'), {
    ...data,
    createdBy: user.uid,
    createdAt: Date.now(),
    source: 'manual',
  });
  await bumpKnownName(groupId, data.name);
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  data: Partial<NewExpense>,
): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId, 'expenses', expenseId), data);
  if (data.name) await bumpKnownName(groupId, data.name);
}

/** Sets the same categories on many expenses at once (the Sort categories
 * page), in batches of 400 — under Firestore's 500 writes per batch. One
 * expense the rules refuse fails its whole batch, so that batch is then
 * tried one by one. Returns how many couldn't be saved. */
export async function setCategoriesOnExpenses(groupId: string, expenseIds: string[], categories: string[]): Promise<number> {
  const ref = (id: string) => doc(db, 'groups', groupId, 'expenses', id);
  let failed = 0;
  for (let i = 0; i < expenseIds.length; i += 400) {
    const chunk = expenseIds.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const id of chunk) batch.update(ref(id), { categories });
    try {
      await batch.commit();
    } catch {
      for (const id of chunk) await updateDoc(ref(id), { categories }).catch(() => failed++);
    }
  }
  return failed;
}

export async function deleteExpense(groupId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId, 'expenses', expenseId));
}

export async function bumpKnownName(groupId: string, name: string): Promise<void> {
  const key = normalizeText(name);
  if (!key) return;
  await setDoc(
    doc(db, 'groups', groupId, 'knownNames', key),
    { count: increment(1), lastUsed: Date.now(), displayName: name },
    { merge: true },
  );
}
