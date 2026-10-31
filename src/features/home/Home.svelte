<script lang="ts">
  import { link } from 'svelte-spa-router';
  import { collection, getDocs, query, where } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { locale, t } from '../../lib/i18n';
  import { currentUser } from '../../lib/stores/auth';
  import { activeGroup, myAccess, myGroups, myGroupsLoading } from '../../lib/stores/groups';
  import { expenses, expensesLoading, expensesRangeStart } from '../../lib/stores/expenses';
  import { addToList, defaultListId, shoppingItems, shoppingLists } from '../../lib/stores/shopping';
  import { catalogOptions, storageItems, storageUnits } from '../../lib/stores/storage';
  import { filterExpenses, flowTotals } from '../../lib/utils/stats';
  import { lowStock } from '../../lib/shopping/lowStock';
  import { toIso } from '../../lib/utils/date';
  import UseSoon from '../storage/UseSoon.svelte';
  import type { Reminder } from '../../lib/types';

  // The start page: a glance at each part of the house the group uses —
  // this month's money, what's on the shopping lists, what to use up soon,
  // what's waiting to be put away, and reminders coming up. Every card only
  // shows for features the group has on and this member can see.
  let group = $derived($activeGroup);
  let can = $derived({
    expenses: !!group?.capabilities.expenses && $myAccess.expenses !== 'none',
    shopping: !!group?.capabilities.shoppingList && $myAccess.shoppingList !== 'none',
    storage: !!group?.capabilities.storage && $myAccess.storage !== 'none',
  });

  let currency = $derived(new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }));

  // ── Money this month ──
  let monthStart = $derived(toIso(new Date()).slice(0, 8) + '01');
  let month = $derived(flowTotals(filterExpenses($expenses, { from: monthStart })));
  let monthLabel = $derived(new Date().toLocaleDateString($locale === 'hr' ? 'hr-HR' : 'en-US', { month: 'long', year: 'numeric' }));

  // ── Shopping ──
  let listsWithCounts = $derived(
    $shoppingLists.map((l) => ({ list: l, open: $shoppingItems.filter((i) => i.listId === l.id && !i.checked) })),
  );
  let low = $derived(can.storage && can.shopping ? lowStock($storageItems, $catalogOptions, $shoppingItems) : []);
  let canShop = $derived($myAccess.shoppingList === 'edit');
  let lowAdded = $state('');
  async function addLow() {
    const listId = defaultListId();
    if (!group || !listId) return;
    const n = await addToList(group.id, listId, low, 'storage');
    lowAdded = $t('home.lowAdded', { count: n, list: $shoppingLists.find((l) => l.id === listId)?.name ?? '' });
  }

  // ── Unsorted ──
  let unsorted = $derived($storageUnits.find((u) => u.inbox) ?? null);
  let unsortedCount = $derived(unsorted ? $storageItems.filter((i) => i.unitId === unsorted!.id).length : 0);

  // ── Reminders in the next two days (this group's, and my own) — fetched
  // once per visit rather than kept live. ──
  let reminders = $state<Reminder[]>([]);
  $effect(() => {
    const uid = $currentUser?.uid;
    const gid = group?.id;
    if (!uid) return;
    const soon = `${toIso(new Date(Date.now() + 2 * 86_400_000))}T23:59`;
    Promise.all([
      getDocs(query(collection(db, 'reminders'), where('ownerUid', '==', uid))),
      gid ? getDocs(collection(db, 'groups', gid, 'reminders')) : Promise.resolve(null),
    ])
      .then(([mine, groupSnap]) => {
        const all = [...mine.docs, ...(groupSnap?.docs ?? [])].map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, 'id'>) }));
        reminders = all
          .filter((r) => r.status === 'active' && r.nextTriggerAt <= soon && (r.scope === 'personal' || r.groupId === gid))
          .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
          .sort((a, b) => a.nextTriggerAt.localeCompare(b.nextTriggerAt))
          .slice(0, 6);
      })
      .catch(() => (reminders = []));
  });
  function when(at: string): string {
    const [date, time] = at.split('T');
    const today = toIso(new Date());
    const tomorrow = toIso(new Date(Date.now() + 86_400_000));
    const day = date === today ? $t('home.today') : date === tomorrow ? $t('home.tomorrow') : date;
    return `${day} ${time ?? ''}`.trim();
  }
</script>

<div class="page stack">
  {#if $myGroupsLoading}
    <p class="muted">{$t('common.loading')}</p>
  {:else if $myGroups.length === 0}
    <div class="center-screen">
      <h2>{$t('expenseList.noGroupsTitle')}</h2>
      <p class="muted">{$t('expenseList.noGroupsBody')}</p>
    </div>
  {:else if group}
    <h2 style="margin:0">{group.name}</h2>

    {#if can.expenses}
      <a class="card stack tile" href="/expenses" use:link>
        <span class="row" style="justify-content: space-between">
          <strong>💶 {monthLabel}</strong>
          <span class="muted">{$t('nav.expenses')} ›</span>
        </span>
        {#if $expensesLoading || ($expensesRangeStart && $expensesRangeStart > monthStart)}
          <span class="muted">{$t('common.loading')}</span>
        {:else}
          <span class="totals">
            <span><span class="muted">{$t('expenseList.out', { count: month.outCount })}</span><strong>{currency.format(month.out)}</strong></span>
            <span><span class="muted">{$t('expenseList.in', { count: month.inCount })}</span><strong style="color: var(--success)">{currency.format(month.in)}</strong></span>
            <span><span class="muted">{$t('expenseList.net')}</span><strong>{currency.format(month.net)}</strong></span>
          </span>
        {/if}
      </a>
    {/if}

    {#if can.shopping}
      <div class="card stack">
        <a class="row head" href="/shopping" use:link style="justify-content: space-between">
          <strong>🛒 {$t('shopping.title')}</strong>
          <span class="muted">›</span>
        </a>
        {#each listsWithCounts as { list, open } (list.id)}
          <a class="list-row" href="/shopping/{list.id}" use:link>
            <span>{list.name} <span class="muted">({open.length})</span></span>
            <span class="muted preview">{open.slice(0, 4).map((i) => i.name).join(', ')}{open.length > 4 ? '…' : ''}</span>
          </a>
        {/each}
        {#if low.length > 0 && canShop}
          <div class="row" style="justify-content: space-between">
            <span class="muted">{$t('home.lowInStorage', { count: low.length })}</span>
            <button onclick={addLow}>+ {$t('home.addToList')}</button>
          </div>
        {/if}
        {#if lowAdded}<span class="muted">✓ {lowAdded}</span>{/if}
      </div>
    {/if}

    {#if can.storage}
      {#if unsorted && unsortedCount > 0}
        <a href="/storage/{unsorted.id}" use:link class="card row tile" style="justify-content: space-between">
          <span>📥 <strong>{unsorted.name}</strong></span>
          <span>{$t('inbox.banner', { count: unsortedCount })} ›</span>
        </a>
      {/if}
      <UseSoon limit={5} />
    {/if}

    {#if reminders.length > 0}
      <div class="card stack">
        <a class="row head" href="/reminders" use:link style="justify-content: space-between">
          <strong>⏰ {$t('home.comingUp')}</strong>
          <span class="muted">›</span>
        </a>
        {#each reminders as r (r.id)}
          <div class="row" style="justify-content: space-between; flex-wrap: nowrap">
            <span>{r.text}</span>
            <span class="muted" style="white-space: nowrap">{when(r.nextTriggerAt)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .tile,
  .head,
  .list-row {
    text-decoration: none;
    color: var(--text);
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .totals > span {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .totals .muted {
    font-size: 0.85em;
  }
  .list-row {
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0;
    border-top: 1px solid var(--border);
  }
  .preview {
    font-size: 0.88em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
