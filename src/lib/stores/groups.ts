import { derived, get, writable } from 'svelte/store';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { currentUser } from './auth';
import type { Group, GroupCapabilities, GroupMember } from '../types';

export const myGroups = writable<Group[]>([]);
export const myGroupsLoading = writable(true);

const ACTIVE_GROUP_KEY = 'expense-tracker:activeGroupId';
export const activeGroupId = writable<string | null>(
  typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_GROUP_KEY) : null,
);
activeGroupId.subscribe((id) => {
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(ACTIVE_GROUP_KEY, id);
  else localStorage.removeItem(ACTIVE_GROUP_KEY);
});

export const activeGroup = derived([myGroups, activeGroupId], ([$groups, $id]) => {
  if ($groups.length === 0) return null;
  return $groups.find((g) => g.id === $id) ?? $groups[0];
});

// A plain string, unlike activeGroup — Svelte's store equality check treats
// every object as "changed" no matter what (it can't cheaply deep-compare),
// so activeGroup emits a new reference on every single myGroups update, even
// when the resolved group's identity hasn't actually changed (e.g. any write
// to any group doc fires the listener twice — once optimistic, once
// server-confirmed). Anything that tears down/rebuilds Firestore listeners
// based on "did the active group change" (expenses, nameAliases,
// notifications) must key off this instead, or it re-reads on every no-op.
export const activeGroupResolvedId = derived(activeGroup, (g) => g?.id ?? null);

// Keep activeGroupId in sync with whatever activeGroup resolves to (e.g. after
// the previously-active group disappears or on first load).
activeGroup.subscribe((g) => {
  if (g && g.id !== get(activeGroupId)) activeGroupId.set(g.id);
});

let unsubGroups: (() => void) | null = null;

currentUser.subscribe((user) => {
  if (unsubGroups) {
    unsubGroups();
    unsubGroups = null;
  }
  if (!user) {
    myGroups.set([]);
    myGroupsLoading.set(false);
    return;
  }
  myGroupsLoading.set(true);
  const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', user.uid));
  unsubGroups = onSnapshot(
    q,
    (snap) => {
      myGroups.set(
        snap.docs.map((d) => {
          const data = d.data() as Omit<Group, 'id'>;
          // Pre-existing groups predate the capabilities field (or predate
          // shoppingList specifically) — default to "expenses only", matching
          // what every group was before capabilities existed.
          return {
            id: d.id,
            ...data,
            capabilities: {
              expenses: data.capabilities?.expenses ?? true,
              photoSaving: data.capabilities?.photoSaving ?? false,
              shoppingList: data.capabilities?.shoppingList ?? false,
              storage: data.capabilities?.storage ?? false,
            },
          };
        }),
      );
      myGroupsLoading.set(false);
    },
    (err) => {
      console.error('Failed to load groups:', err);
      myGroups.set([]);
      myGroupsLoading.set(false);
    },
  );
});

function equalSplit(count: number): number {
  return count === 0 ? 0 : Math.round((100 / count) * 100) / 100;
}

export async function createGroup(name: string, capabilities: GroupCapabilities): Promise<string> {
  const user = get(currentUser);
  if (!user || !user.email) throw new Error('Not signed in');
  const member: GroupMember = {
    role: 'admin',
    expectedPct: 100,
    displayName: user.displayName ?? user.email,
    email: user.email.toLowerCase(),
  };
  const ref = await addDoc(collection(db, 'groups'), {
    name,
    members: { [user.uid]: member },
    memberUids: [user.uid],
    capabilities,
  });
  return ref.id;
}

export async function setGroupCapabilities(group: Group, capabilities: GroupCapabilities): Promise<void> {
  await updateDoc(doc(db, 'groups', group.id), { capabilities });
}

export async function inviteMemberByEmail(group: Group, rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (Object.values(group.members).some((m) => m.email === email)) {
    throw new Error('Already a member');
  }

  const usersQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
  const snap = await getDocs(usersQuery);
  if (snap.empty) {
    throw new Error('That person needs to sign in to the app at least once first');
  }
  const userDoc = snap.docs[0];
  const uid = userDoc.id;
  const profile = userDoc.data() as { displayName?: string; email: string };

  const newMemberUids = [...group.memberUids, uid];
  const pct = equalSplit(newMemberUids.length);

  const updates: Record<string, unknown> = {
    memberUids: newMemberUids,
    [`members.${uid}`]: {
      role: 'member',
      expectedPct: pct,
      displayName: profile.displayName ?? email,
      email,
    } satisfies GroupMember,
  };
  for (const existingUid of group.memberUids) {
    updates[`members.${existingUid}.expectedPct`] = pct;
  }

  await updateDoc(doc(db, 'groups', group.id), updates);
}

export async function removeMember(group: Group, uid: string): Promise<void> {
  const remainingUids = group.memberUids.filter((u) => u !== uid);
  const pct = equalSplit(remainingUids.length);
  const updates: Record<string, unknown> = {
    memberUids: remainingUids,
    [`members.${uid}`]: deleteField(),
  };
  for (const existingUid of remainingUids) {
    updates[`members.${existingUid}.expectedPct`] = pct;
  }
  await updateDoc(doc(db, 'groups', group.id), updates);
}

export async function setMemberRole(
  group: Group,
  uid: string,
  role: 'admin' | 'member',
): Promise<void> {
  await updateDoc(doc(db, 'groups', group.id), { [`members.${uid}.role`]: role });
}

export async function setMemberExpectedPct(
  group: Group,
  uid: string,
  pct: number,
): Promise<void> {
  await updateDoc(doc(db, 'groups', group.id), { [`members.${uid}.expectedPct`]: pct });
}

export async function renameGroup(group: Group, name: string): Promise<void> {
  await updateDoc(doc(db, 'groups', group.id), { name });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId));
}
