<script lang="ts">
  import { link, replace } from 'svelte-spa-router';
  import { endOfMonth, format, startOfMonth } from 'date-fns';
  import { activeGroup, myAccess, myGroups, myGroupsLoading } from '../../lib/stores/groups';
  import { firstAvailableRoute } from '../../lib/utils/access';
  import { categories } from '../../lib/stores/categories';
  import {
    deleteExpense,
    expenses,
    expensesLoading,
    expensesRangeStart,
    loadFullExpenseHistory,
  } from '../../lib/stores/expenses';
  import { filterExpenses, flowTotals } from '../../lib/utils/stats';
  import { locale, t } from '../../lib/i18n';
  import MonthPicker from '../../lib/components/MonthPicker.svelte';
  import ExpenseForm from './ExpenseForm.svelte';
  import Modal from '../../lib/components/Modal.svelte';
  import ReceiptView from '../documents/ReceiptView.svelte';
  import type { Expense } from '../../lib/types';

  // Someone who can't see expenses here (the group doesn't use them, or an
  // admin hid them from this member) lands on the first tab they can use.
  $effect(() => {
    if ($activeGroup && $myAccess.expenses === 'none') replace(firstAvailableRoute($myAccess));
  });
  let canEdit = $derived($myAccess.expenses === 'edit');

  let showForm = $state(false);
  let editingExpense = $state<Expense | null>(null);

  function categoryName(id: string): string {
    return $categories.find((c) => c.id === id)?.name ?? id;
  }

  function memberName(uid: string): string {
    if (!$activeGroup) return uid;
    return $activeGroup.members[uid]?.displayName ?? uid;
  }

  function startAdd() {
    editingExpense = null;
    showForm = true;
  }

  function startEdit(expense: Expense) {
    editingExpense = expense;
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editingExpense = null;
  }

  async function handleDelete(expense: Expense) {
    if (!$activeGroup) return;
    if (!confirm($t('expenseList.deleteConfirm', { name: expense.name }))) return;
    await deleteExpense($activeGroup.id, expense.id);
  }

  // The list shows one period at a time (this month by default) with what
  // went out and came in over it. The live store only holds this month until
  // asked for more, so a range reaching further back widens it first.
  let from = $state(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  let to = $state(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  // Only as far back as needed: an older month widens the live range to that
  // month (not the whole history); clearing the dates loads everything.
  $effect(() => {
    if (!$expensesRangeStart) return;
    if (!from) loadFullExpenseHistory();
    else if (from < $expensesRangeStart) expensesRangeStart.set(from);
  });

  // Search and category narrow the list, and the totals with it — so
  // picking a category shows what went on it this month.
  let search = $state('');
  let categoryFilter = $state(''); // '' = all, NO_CATEGORY, or a category id
  const NO_CATEGORY = '__none';

  let shown = $derived(
    filterExpenses($expenses, {
      from: from || undefined,
      to: to || undefined,
      search: search.trim() || undefined,
      uncategorized: categoryFilter === NO_CATEGORY,
      categoryIds: categoryFilter && categoryFilter !== NO_CATEGORY ? [categoryFilter] : undefined,
    }),
  );
  let filtering = $derived(!!search.trim() || !!categoryFilter);
  // Without a category in the period shown — a way into sorting them all.
  let uncategorizedHere = $derived(
    filterExpenses($expenses, { from: from || undefined, to: to || undefined, uncategorized: true }).length,
  );
  let totals = $derived(flowTotals(shown));

  let receiptOf = $state<Expense | null>(null);
  let seesBills = $derived(!!$activeGroup?.capabilities.photoSaving && $myAccess.photoSaving !== 'none');

  let currency = $derived(
    new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }),
  );
</script>

<div class="page stack">
  {#if $myGroupsLoading}
    <p class="muted">{$t('common.loading')}</p>
  {:else if $myGroups.length === 0}
    <div class="center-screen">
      <h2>{$t('expenseList.noGroupsTitle')}</h2>
      <p class="muted">{$t('expenseList.noGroupsBody')}</p>
    </div>
  {:else if $activeGroup}
    <div class="row" style="justify-content: space-between">
      <h2 style="margin:0">{$activeGroup.name}</h2>
      {#if canEdit}
        <button class="primary" onclick={startAdd}>{$t('expenseList.addExpense')}</button>
      {/if}
    </div>

    {#if showForm && !editingExpense}
      <ExpenseForm group={$activeGroup} expense={null} onDone={closeForm} />
    {/if}

    <div class="card stack">
      <div class="row" style="justify-content: space-between">
        <MonthPicker onSelect={(f, toDate) => { from = f; to = toDate; }} />
        <button type="button" onclick={() => { from = ''; to = ''; }} disabled={!from && !to}>{$t('expenseList.allTime')}</button>
      </div>
      <div class="row">
        <label>{$t('stats.from')} <input type="date" bind:value={from} /></label>
        <label>{$t('stats.to')} <input type="date" bind:value={to} /></label>
      </div>
      {#if canEdit && uncategorizedHere > 0}
        <a class="sort-link" href="/expenses/categories" use:link>🏷 {$t('expenseList.sortCategories', { count: uncategorizedHere })}</a>
      {/if}
      <div class="row filters">
        <input type="search" placeholder={$t('expenseList.searchPlaceholder')} bind:value={search} />
        <select bind:value={categoryFilter}>
          <option value="">{$t('expenseList.allCategories')}</option>
          <option value={NO_CATEGORY}>{$t('expenseList.noCategory')}</option>
          {#each $categories as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
      {#if !$expensesLoading}
        <div class="totals">
          <div>
            <span class="muted">{$t('expenseList.out', { count: totals.outCount })}</span>
            <strong>{currency.format(totals.out)}</strong>
          </div>
          <div>
            <span class="muted">{$t('expenseList.in', { count: totals.inCount })}</span>
            <strong style="color: var(--success)">{currency.format(totals.in)}</strong>
          </div>
          <div>
            <span class="muted">{$t('expenseList.net')}</span>
            <strong>{currency.format(totals.net)}</strong>
          </div>
        </div>
      {/if}
    </div>

    {#if $expensesLoading}
      <p class="muted">{$t('expenseList.loadingExpenses')}</p>
    {:else if $expenses.length === 0}
      <p class="muted">{$t('expenseList.empty')}</p>
    {:else if shown.length === 0}
      <p class="muted">{filtering ? $t('expenseList.noMatches') : $t('expenseList.emptyPeriod')}</p>
      {#if filtering && (from || to)}
        <div class="row">
          <button type="button" onclick={() => { from = ''; to = ''; }}>{$t('expenseList.searchAllTime')}</button>
        </div>
      {/if}
    {:else}
      <div class="stack">
        {#each shown as expense (expense.id)}
          {#if editingExpense?.id === expense.id}
            <ExpenseForm group={$activeGroup} expense={editingExpense} onDone={closeForm} />
          {:else}
            <div class="card stack">
              <div class="row" style="justify-content: space-between">
                <div>
                  <strong>{expense.name}</strong>
                  {#if expense.description}
                    <span class="muted"> — {expense.description}</span>
                  {/if}
                </div>
                <strong style:color={expense.price < 0 ? 'var(--success)' : undefined}>{currency.format(expense.price)}</strong>
              </div>
              <div class="row muted">
                <span>{expense.date}</span>
                <span>· {$t('expenseList.paidBy', { name: memberName(expense.paidBy) })}</span>
                {#if expense.itemCount}<span>· {$t('expenseList.items', { count: expense.itemCount })}</span>{/if}
                {#if expense.subitems.length > 0}<span>· {$t('expenseList.subitems', { count: expense.subitems.length })}</span>{/if}
                {#if expense.location}<span>· {$t('expenseList.location')}</span>{/if}
                {#if expense.source === 'migrated'}<span>· {$t('expenseList.migrated')}</span>{/if}
                {#if expense.documentId && seesBills}
                  <button class="receipt" onclick={() => (receiptOf = expense)}>🧾 {expense.documentLabel ?? $t('receipt.title')}</button>
                {/if}
              </div>
              {#if expense.categories.length > 0}
                <div class="row">
                  {#each expense.categories as catId (catId)}
                    <span class="muted card" style="padding: 0.1em 0.6em">{categoryName(catId)}</span>
                  {/each}
                </div>
              {/if}
              {#if canEdit}
                <div class="row">
                  <button onclick={() => startEdit(expense)}>{$t('common.edit')}</button>
                  <button class="danger" onclick={() => handleDelete(expense)}>{$t('common.delete')}</button>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if receiptOf?.documentId && $activeGroup}
  <Modal open={true} onClose={() => (receiptOf = null)} title={$t('receipt.title')}>
    {#snippet children()}
      <ReceiptView groupId={$activeGroup!.id} documentId={receiptOf!.documentId!} />
    {/snippet}
  </Modal>
{/if}

<style>
  .sort-link {
    font-size: 0.95em;
  }
  .filters input {
    flex: 2 1 10rem;
  }
  .filters select {
    flex: 1 1 8rem;
    width: auto;
  }
  .receipt {
    padding: 0 0.5em;
    font-size: 0.95em;
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    border-top: 1px solid var(--border);
    padding-top: 0.6rem;
  }
  .totals div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }
  .totals span {
    font-size: 0.85em;
  }
</style>
