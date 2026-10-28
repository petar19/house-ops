import { writable } from 'svelte/store';
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { groupIdFor } from './groups';
import type { NameAlias } from '../types';

export const nameAliases = writable<NameAlias[]>([]);

let unsub: (() => void) | null = null;

groupIdFor('expenses').subscribe((groupId) => {
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (!groupId) {
    nameAliases.set([]);
    return;
  }
  unsub = onSnapshot(collection(db, 'groups', groupId, 'nameAliases'), (snap) => {
    nameAliases.set(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NameAlias, 'id'>) })));
  });
});

export async function saveAlias(groupId: string, names: string[], canonicalName: string): Promise<void> {
  await addDoc(collection(db, 'groups', groupId, 'nameAliases'), { names, canonicalName });
}

export async function deleteAlias(groupId: string, aliasId: string): Promise<void> {
  await deleteDoc(doc(db, 'groups', groupId, 'nameAliases', aliasId));
}
