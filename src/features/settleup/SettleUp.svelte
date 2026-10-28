<script lang="ts">
  import { onMount } from 'svelte';
  import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { activeGroup, groupIdFor, myAccess } from '../../lib/stores/groups';
  import { expenseMemberUids } from '../../lib/utils/access';
  import { currentUser } from '../../lib/stores/auth';
  import { expenses, loadFullExpenseHistory } from '../../lib/stores/expenses';
  import { filterExpenses } from '../../lib/utils/stats';
  import { applyDebts, computeBalances, simplifyDebts } from '../../lib/utils/debt';
  import { todayIso } from '../../lib/utils/date';
  import { locale, t } from '../../lib/i18n';
  import MonthPicker from '../../lib/components/MonthPicker.svelte';
  import type { Debt } from '../../lib/types';

  let from = $state('');
  let to = $state('');

  // Settle-up defaults to "all time" (no from/to) — see Stats.svelte for why
  // this page needs to explicitly widen the live expenses store to match.
  onMount(() => {
    loadFullExpenseHistory();
  });

  let currency = $derived(
    new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }),
  );

  let filtered = $derived(
    filterExpenses($expenses, { from: from || undefined, to: to || undefined }),
  );
  let subsetTotal = $derived(filtered.reduce((sum, e) => sum + e.price, 0));

  // Settle-up is only between people who take part in expenses.
  let payerEntries = $derived(
    $activeGroup ? Object.entries($activeGroup.members).filter(([uid]) => expenseMemberUids($activeGroup!).includes(uid)) : [],
  );
  let canEdit = $derived($myAccess.expenses === 'edit');
  const debtsGroupId = groupIdFor('expenses');

  let memberInputs = $derived(
    $activeGroup
      ? payerEntries.map(([uid, member]) => ({
          uid,
          displayName: member.displayName,
          expectedPct: member.expectedPct,
          totalPaid: filtered.filter((e) => e.paidBy === uid).reduce((sum, e) => sum + e.price, 0),
        }))
      : [],
  );

  // Debts are a standing balance, not a per-period line item — every
  // unsettled one is folded in regardless of the from/to range above (see
  // applyDebts). Live-subscribed (not on-demand like Documents) since this
  // page also lets you settle/delete debts right here, and the balance below
  // should update immediately when that happens.
  let debts = $state<Debt[]>([]);
  let activeDebts = $derived(debts.filter((d) => !d.settled));

  $effect(() => {
    const groupId = $debtsGroupId;
    if (!groupId) {
      debts = [];
      return;
    }
    const unsub = onSnapshot(collection(db, 'groups', groupId, 'debts'), (snap) => {
      debts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Debt, 'id'>) }));
    });
    return unsub;
  });

  let balances = $derived(
    applyDebts(
      computeBalances(memberInputs, subsetTotal),
      activeDebts.map((d) => ({ creditorUid: d.creditorUid, debtorUid: d.debtorUid, amount: d.amount })),
    ),
  );
  let transfers = $derived(simplifyDebts(balances));

  function memberName(uid: string): string {
    return $activeGroup?.members[uid]?.displayName ?? uid;
  }

  let newCreditor = $state('');
  let newDebtor = $state('');
  // Declared number-typed, matching what a number <input>'s bind:value
  // actually assigns at runtime regardless of declared type (undefined when
  // empty) — declaring this as a string would silently misbehave.
  let newAmount = $state<number | undefined>(undefined);
  let newDescription = $state('');
  let debtError = $state('');
  let addingDebt = $state(false);

  async function handleAddDebt() {
    if (!$activeGroup || !$currentUser) return;
    debtError = '';
    if (!newCreditor || !newDebtor) {
      debtError = $t('debts.pickBoth');
      return;
    }
    if (newCreditor === newDebtor) {
      debtError = $t('debts.samePerson');
      return;
    }
    if (newAmount === undefined || Number.isNaN(newAmount) || newAmount <= 0) {
      debtError = $t('debts.invalidAmount');
      return;
    }
    addingDebt = true;
    try {
      const description = newDescription.trim();
      await addDoc(collection(db, 'groups', $activeGroup.id, 'debts'), {
        creditorUid: newCreditor,
        debtorUid: newDebtor,
        amount: newAmount,
        ...(description ? { description } : {}),
        date: todayIso(),
        settled: false,
        createdBy: $currentUser.uid,
        createdAt: Date.now(),
        source: 'manual',
      });
      newCreditor = '';
      newDebtor = '';
      newAmount = undefined;
      newDescription = '';
    } catch (e) {
      debtError = e instanceof Error ? e.message : $t('debts.addFailed');
    } finally {
      addingDebt = false;
    }
  }

  async function toggleSettled(debt: Debt) {
    if (!$activeGroup) return;
    await updateDoc(doc(db, 'groups', $activeGroup.id, 'debts', debt.id), { settled: !debt.settled });
  }

  async function removeDebt(debt: Debt) {
    if (!$activeGroup) return;
    if (!confirm($t('debts.deleteConfirm'))) return;
    await deleteDoc(doc(db, 'groups', $activeGroup.id, 'debts', debt.id));
  }
</script>

<div class="page stack">
  <h2>{$t('settleUp.title')}</h2>

  {#if !$activeGroup}
    <p class="muted">{$t('settleUp.pickGroup')}</p>
  {:else if $myAccess.expenses === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else}
    <div class="card stack">
      <MonthPicker onSelect={(f, toDate) => { from = f; to = toDate; }} />
      <div class="row">
        <label>{$t('stats.from')} <input type="date" bind:value={from} /></label>
        <label>{$t('stats.to')} <input type="date" bind:value={to} /></label>
      </div>
    </div>

    <div class="card stack">
      <h3 style="margin:0">{$t('settleUp.paidVsExpected')}</h3>
      {#each memberInputs as m (m.uid)}
        <div class="row" style="justify-content: space-between">
          <span>{m.displayName} <span class="muted">({m.expectedPct}%)</span></span>
          <span>
            {$t('settleUp.paidExpected', {
              paid: currency.format(m.totalPaid),
              expected: currency.format((m.expectedPct / 100) * subsetTotal),
            })}
          </span>
        </div>
      {/each}
      <div class="row" style="justify-content: space-between">
        <strong>{$t('settleUp.total')}</strong>
        <strong>{currency.format(subsetTotal)}</strong>
      </div>
    </div>

    <div class="card stack">
      <h3 style="margin:0">{$t('settleUp.whoOwesWhom')}</h3>
      {#if transfers.length === 0}
        <p class="muted">{$t('settleUp.allEven')}</p>
      {:else}
        {#each transfers as t (t.from + t.to)}
          <div class="row" style="justify-content: space-between">
            <span>{memberName(t.from)} → {memberName(t.to)}</span>
            <strong>{currency.format(t.amount)}</strong>
          </div>
        {/each}
      {/if}
    </div>

    <div class="card stack">
      <h3 style="margin:0">{$t('debts.title')}</h3>
      <p class="muted">{$t('debts.description')}</p>
      {#if activeDebts.length === 0}
        <p class="muted">{$t('debts.empty')}</p>
      {:else}
        {#each activeDebts as debt (debt.id)}
          <div class="row" style="justify-content: space-between">
            <span>
              {memberName(debt.debtorUid)} → {memberName(debt.creditorUid)}: {currency.format(debt.amount)}
              {#if debt.description}<span class="muted"> — {debt.description}</span>{/if}
            </span>
            {#if canEdit}
              <div class="row">
                <button onclick={() => toggleSettled(debt)}>{$t('debts.markSettled')}</button>
                <button class="danger" onclick={() => removeDebt(debt)}>{$t('common.remove')}</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}

      {#if canEdit}
      <form class="row" onsubmit={(e) => { e.preventDefault(); handleAddDebt(); }}>
        <select bind:value={newDebtor}>
          <option value="">{$t('debts.debtorPlaceholder')}</option>
          {#each payerEntries as [uid, member] (uid)}
            <option value={uid}>{member.displayName}</option>
          {/each}
        </select>
        <span class="muted">{$t('debts.owes')}</span>
        <select bind:value={newCreditor}>
          <option value="">{$t('debts.creditorPlaceholder')}</option>
          {#each payerEntries as [uid, member] (uid)}
            <option value={uid}>{member.displayName}</option>
          {/each}
        </select>
        <input type="number" step="0.01" placeholder={$t('debts.amountPlaceholder')} bind:value={newAmount} style="width:6em" />
        <input placeholder={$t('debts.descriptionPlaceholder')} bind:value={newDescription} />
        <button class="primary" type="submit" disabled={addingDebt}>{$t('common.add')}</button>
      </form>
      {/if}
      {#if debtError}<p class="muted" style="color: var(--danger)">{debtError}</p>{/if}
    </div>
  {/if}
</div>
