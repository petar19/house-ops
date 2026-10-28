<script lang="ts">
  import { replace } from 'svelte-spa-router';
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
  import { locale, t } from '../../lib/i18n';
  import ExpenseForm from './ExpenseForm.svelte';
  import type { Expense } from '../../lib/types';

  // This is also the start page — someone who can't see expenses here (the
  // group doesn't use them, or an admin hid them from this member) lands on
  // the first tab they can use instead.
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

    {#if $expensesRangeStart}
      <div class="row" style="justify-content: space-between">
        <span class="muted">{$t('expenseList.scopedNotice', { date: $expensesRangeStart })}</span>
        <button onclick={loadFullExpenseHistory}>{$t('expenseList.loadFullHistory')}</button>
      </div>
    {/if}

    {#if $expensesLoading}
      <p class="muted">{$t('expenseList.loadingExpenses')}</p>
    {:else if $expenses.length === 0}
      <p class="muted">{$t('expenseList.empty')}</p>
    {:else}
      <div class="stack">
        {#each $expenses as expense (expense.id)}
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
