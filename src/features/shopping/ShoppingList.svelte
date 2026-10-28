<script lang="ts">
  import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { activeGroup, groupIdFor, myAccess } from '../../lib/stores/groups';
  import { currentUser } from '../../lib/stores/auth';
  import { toIso } from '../../lib/utils/date';
  import { t } from '../../lib/i18n';
  import type { ShoppingItem } from '../../lib/types';

  let items = $state<ShoppingItem[]>([]);
  const shoppingGroupId = groupIdFor('shoppingList');
  let canEdit = $derived($myAccess.shoppingList === 'edit');

  $effect(() => {
    const groupId = $shoppingGroupId;
    if (!groupId) {
      items = [];
      return;
    }
    const unsub = onSnapshot(collection(db, 'groups', groupId, 'shoppingItems'), (snap) => {
      items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ShoppingItem, 'id'>) }));
    });
    return unsub;
  });

  let activeItems = $derived(items.filter((i) => i.active).sort((a, b) => a.name.localeCompare(b.name)));
  let inactiveItems = $derived(
    items.filter((i) => !i.active && i.restockIntervalDays !== null).sort((a, b) => a.name.localeCompare(b.name)),
  );

  let newName = $state('');
  // A number-typed <input type="number"> bind:value coerces to an actual
  // number (or undefined when empty) at runtime regardless of what you
  // declare — declaring this as a string would silently break the moment
  // someone typed a digit (e.g. calling .trim() on a number).
  let newInterval = $state<number | undefined>(undefined);
  let error = $state('');
  let adding = $state(false);

  async function handleAdd() {
    if (!$activeGroup) return;
    const name = newName.trim();
    if (!name) return;
    error = '';
    if (newInterval !== undefined && (Number.isNaN(newInterval) || newInterval <= 0)) {
      error = $t('shopping.invalidInterval');
      return;
    }
    adding = true;
    try {
      await addDoc(collection(db, 'groups', $activeGroup.id, 'shoppingItems'), {
        name,
        active: true,
        restockIntervalDays: newInterval ? Math.round(newInterval) : null,
        lastBoughtAt: null,
        addedAt: Date.now(),
        reminderId: null,
        source: 'manual',
      });
      newName = '';
      newInterval = undefined;
    } catch (e) {
      error = e instanceof Error ? e.message : $t('shopping.addFailed');
    } finally {
      adding = false;
    }
  }

  // Marking a one-off item bought just removes it — a "dumb" checklist for
  // things with no restock interval. A recurring item instead goes inactive
  // and schedules (or reschedules) a WhatsApp reminder 2 days before it's
  // predicted to run out again, reusing the same /reminders doc every time
  // rather than creating a new one each purchase cycle.
  async function markBought(item: ShoppingItem) {
    if (!$activeGroup || !$currentUser) return;
    if (!item.restockIntervalDays) {
      await deleteDoc(doc(db, 'groups', $activeGroup.id, 'shoppingItems', item.id));
      return;
    }

    const today = new Date();
    const due = new Date(today);
    due.setDate(due.getDate() + Math.max(item.restockIntervalDays - 2, 0));
    const nextTriggerAt = `${toIso(due)}T18:00`;

    // Group reminders live at groups/{groupId}/reminders, not a top-level
    // collection — see firestore.rules for why (the group-membership check
    // needs the group id from the document's path, not a field on it).
    let reminderId = item.reminderId;
    let reminderOk = false;
    if (reminderId) {
      try {
        await updateDoc(doc(db, 'groups', $activeGroup.id, 'reminders', reminderId), {
          nextTriggerAt,
          status: 'active',
          scheduleType: 'once',
        });
        reminderOk = true;
      } catch {
        reminderOk = false; // the linked reminder was deleted directly — recreate it below
      }
    }
    if (!reminderOk) {
      const ref = await addDoc(collection(db, 'groups', $activeGroup.id, 'reminders'), {
        ownerUid: $currentUser.uid,
        scope: 'group',
        groupId: $activeGroup.id,
        text: $t('shopping.reminderText', { name: item.name }),
        scheduleType: 'once',
        nextTriggerAt,
        status: 'active',
        createdAt: Date.now(),
        source: 'app',
      });
      reminderId = ref.id;
    }

    await updateDoc(doc(db, 'groups', $activeGroup.id, 'shoppingItems', item.id), {
      active: false,
      lastBoughtAt: toIso(today),
      reminderId,
    });
  }

  async function addBackToList(item: ShoppingItem) {
    if (!$activeGroup) return;
    await updateDoc(doc(db, 'groups', $activeGroup.id, 'shoppingItems', item.id), { active: true });
  }

  async function removeItem(item: ShoppingItem) {
    if (!$activeGroup) return;
    if (!confirm($t('shopping.deleteConfirm', { name: item.name }))) return;
    await deleteDoc(doc(db, 'groups', $activeGroup.id, 'shoppingItems', item.id));
  }
</script>

<div class="page stack">
  <h2 style="margin:0">{$t('shopping.title')}</h2>

  {#if !$activeGroup}
    <p class="muted">{$t('exportImport.pickGroup')}</p>
  {:else if !$activeGroup.capabilities.shoppingList}
    <p class="muted">{$t('shopping.capabilityOff')}</p>
  {:else if $myAccess.shoppingList === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else}
    <div class="card stack">
      <h3 style="margin:0">{$t('shopping.needed')}</h3>
      {#if activeItems.length === 0}
        <p class="muted">{$t('shopping.empty')}</p>
      {:else}
        {#each activeItems as item (item.id)}
          <div class="row" style="justify-content: space-between">
            <span>
              {item.name}
              {#if item.restockIntervalDays}
                <span class="muted">— {$t('shopping.every', { days: item.restockIntervalDays })}</span>
              {/if}
            </span>
            {#if canEdit}
              <div class="row">
                <button class="primary" onclick={() => markBought(item)}>{$t('shopping.bought')}</button>
                <button class="danger" onclick={() => removeItem(item)}>{$t('common.remove')}</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}

      {#if canEdit}
      <form class="row" onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
        <input placeholder={$t('shopping.namePlaceholder')} bind:value={newName} />
        <input type="number" min="1" style="width:6em" placeholder={$t('shopping.intervalPlaceholder')} bind:value={newInterval} />
        <span class="muted">{$t('shopping.days')}</span>
        <button class="primary" type="submit" disabled={adding}>{$t('common.add')}</button>
      </form>
      {/if}
      {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
    </div>

    {#if inactiveItems.length > 0}
      <div class="card stack">
        <h3 style="margin:0">{$t('shopping.notNeededYet')}</h3>
        <p class="muted">{$t('shopping.notNeededYetHint')}</p>
        {#each inactiveItems as item (item.id)}
          <div class="row" style="justify-content: space-between">
            <span>
              {item.name}
              <span class="muted"> — {$t('shopping.lastBought', { date: item.lastBoughtAt ?? '' })}</span>
            </span>
            {#if canEdit}
              <div class="row">
                <button onclick={() => addBackToList(item)}>{$t('shopping.needNow')}</button>
                <button class="danger" onclick={() => removeItem(item)}>{$t('common.remove')}</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
