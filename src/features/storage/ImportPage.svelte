<script lang="ts">
  import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
  import { link, push } from 'svelte-spa-router';
  import { db } from '../../lib/firebase';
  import { t } from '../../lib/i18n';
  import { activeGroup, groupIdFor, myAccess } from '../../lib/stores/groups';
  import {
    importToUnsorted,
    markReceiptImported,
    requestReceiptItems,
    storageUnits,
    type ImportDraft,
  } from '../../lib/stores/storage';
  import { makePlaceOf } from '../../lib/storage/layout';
  import type { DocumentRecord, ReceiptItemRequest } from '../../lib/types';
  import ImportRows, { newRow, type ImportRow } from './ImportRows.svelte';

  // Collect a whole shopping trip into Unsorted in one go — typed/pasted, or
  // read off a scanned bill — then put things away from there whenever.
  let mode = $state<'list' | 'bill'>('list');
  let rows = $state<ImportRow[]>([newRow()]);
  let busy = $state(false);
  let error = $state('');

  let groupId = $derived($activeGroup?.id ?? '');
  let canEdit = $derived($myAccess.storage === 'edit');
  // Bills come from the Documents tab (photo saving with OCR on).
  let canUseBills = $derived($myAccess.photoSaving !== 'none');
  let ready = $derived(rows.filter((r) => r.include && r.name.trim()));

  function toDrafts(list: ImportRow[], billNote: string): ImportDraft[] {
    return list.map((r) => ({
      name: r.name.trim(),
      qtyMode: r.qtyMode,
      amount: r.qtyMode === 'count' ? (r.amount ?? 1) : null,
      unit: r.qtyMode === 'count' ? r.unit.trim() || null : null,
      level: r.qtyMode === 'level' ? r.level : null,
      expiry: null,
      note: r.raw ? `${billNote}${r.raw}` : '',
      categories: r.categories,
    }));
  }

  async function addAll() {
    if (!groupId || ready.length === 0) return;
    busy = true;
    error = '';
    try {
      const billNote = selectedBill ? `${selectedBill.vendor}${selectedBill.date ? ' ' + selectedBill.date : ''}: ` : '';
      const { unitId } = await importToUnsorted(groupId, $t('import.unsortedName'), toDrafts(ready, billNote), makePlaceOf($storageUnits, $t));
      if (selectedBill) {
        await markReceiptImported(groupId, selectedBill.id, requests.get(selectedBill.id)?.status ?? 'done');
      }
      push(`/storage/${unitId}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // ── Bills ──
  const billsGroupId = groupIdFor('photoSaving');
  let bills = $state<DocumentRecord[] | null>(null);
  let requests = $state(new Map<string, ReceiptItemRequest>());
  let selectedBill = $state<DocumentRecord | null>(null);
  let waitingSince = $state<number | null>(null);
  let now = $state(Date.now());

  $effect(() => {
    const gid = $billsGroupId;
    if (mode !== 'bill' || !gid) return;
    getDocs(query(collection(db, 'groups', gid, 'documents'), orderBy('processedAt', 'desc'), limit(40)))
      .then((snap) => (bills = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, 'id'>) }))))
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
    const unsub = onSnapshot(collection(db, 'groups', gid, 'receiptItemRequests'), (snap) => {
      requests = new Map(snap.docs.map((d) => [d.id, d.data() as ReceiptItemRequest]));
    });
    const timer = setInterval(() => (now = Date.now()), 5000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  });

  function rowsFromBill(bill: DocumentRecord): ImportRow[] {
    return (bill.lineItems ?? []).map((li) =>
      newRow({ name: li.name, amount: li.quantity ?? 1, unit: li.unit ?? '', raw: li.raw }),
    );
  }

  async function chooseBill(bill: DocumentRecord) {
    selectedBill = bill;
    error = '';
    if (bill.lineItems) {
      rows = rowsFromBill(bill);
      return;
    }
    rows = [];
    waitingSince = Date.now();
    await requestReceiptItems(groupId, bill.id).catch((e) => (error = e instanceof Error ? e.message : String(e)));
  }

  // When the OCR watcher finishes reading the picked bill, load its items.
  $effect(() => {
    const bill = selectedBill;
    const req = bill ? requests.get(bill.id) : undefined;
    if (!bill || bill.lineItems || req?.status !== 'done') return;
    getDoc(doc(db, 'groups', groupId, 'documents', bill.id)).then((snap) => {
      const fresh = { id: snap.id, ...(snap.data() as Omit<DocumentRecord, 'id'>) };
      selectedBill = fresh;
      bills = bills?.map((b) => (b.id === fresh.id ? fresh : b)) ?? null;
      rows = rowsFromBill(fresh);
      waitingSince = null;
    });
  });

  let selectedStatus = $derived(selectedBill ? requests.get(selectedBill.id) : undefined);
  let slow = $derived(!!waitingSince && selectedStatus?.status === 'pending' && now - waitingSince > 45_000);

  function retry() {
    if (selectedBill) void chooseBill({ ...selectedBill, lineItems: undefined });
  }

  function switchMode(m: 'list' | 'bill') {
    mode = m;
    selectedBill = null;
    rows = m === 'list' ? [newRow()] : [];
    error = '';
  }
</script>

<div class="page stack">
  <a href="/storage" use:link class="muted" style="text-decoration:none">← {$t('storage.title')}</a>
  <h2 style="margin:0">{$t('import.title')}</h2>

  {#if !canEdit}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else}
    <p class="muted" style="margin:0">{$t('import.intro')}</p>
    <div class="tabs row">
      <button class:primary={mode === 'list'} onclick={() => switchMode('list')}>✍️ {$t('import.typeList')}</button>
      <button class:primary={mode === 'bill'} onclick={() => switchMode('bill')}>🧾 {$t('import.fromBill')}</button>
    </div>

    {#if mode === 'list'}
      <div class="card stack">
        <p class="muted" style="margin:0">{$t('import.listHint')}</p>
        <ImportRows bind:rows />
      </div>
    {:else if !canUseBills}
      <p class="muted">{$t('import.billsUnavailable')}</p>
    {:else if !selectedBill}
      <div class="card stack">
        {#if bills === null}
          <p class="muted" style="margin:0">{$t('common.loading')}</p>
        {:else if bills.length === 0}
          <p class="muted" style="margin:0">{$t('import.noBills')}</p>
        {:else}
          <p class="muted" style="margin:0">{$t('import.pickBill')}</p>
          {#each bills as bill (bill.id)}
            {@const req = requests.get(bill.id)}
            <button class="bill" onclick={() => chooseBill(bill)}>
              <span class="row" style="justify-content: space-between; flex-wrap: nowrap">
                <strong>{bill.vendor}</strong>
                <span class="muted">{bill.amount !== null ? `${bill.amount.toFixed(2)} €` : ''}</span>
              </span>
              <span class="muted">
                {bill.date ?? '—'}
                {#if req?.importedAt}· ✓ {$t('import.importedOn', { date: new Date(req.importedAt).toLocaleDateString() })}{/if}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    {:else}
      <div class="card stack">
        <div class="row" style="justify-content: space-between">
          <strong>🧾 {selectedBill.vendor} {selectedBill.date ?? ''}</strong>
          <button onclick={() => ((selectedBill = null), (rows = []))}>{$t('import.otherBill')}</button>
        </div>
        {#if selectedStatus?.importedAt}
          <p class="muted" style="color: var(--danger); margin:0">
            {$t('import.alreadyImported', { date: new Date(selectedStatus.importedAt).toLocaleDateString() })}
          </p>
        {/if}
        {#if !selectedBill.lineItems && selectedStatus?.status === 'error'}
          <p class="muted" style="color: var(--danger); margin:0">{$t('import.readFailed', { error: selectedStatus.error ?? '' })}</p>
          <button onclick={retry}>{$t('import.retry')}</button>
        {:else if !selectedBill.lineItems}
          <p class="muted" style="margin:0">⏳ {$t('import.reading')}</p>
          {#if slow}<p class="muted" style="margin:0">{$t('import.readingSlow')}</p>{/if}
        {:else}
          <p class="muted" style="margin:0">{$t('import.billHint', { count: rows.length })}</p>
          <ImportRows bind:rows showInclude />
        {/if}
      </div>
    {/if}

    {#if rows.length > 0}
      <div class="row">
        <button class="primary" onclick={addAll} disabled={busy || ready.length === 0}>
          📥 {$t('import.addToUnsorted', { count: ready.length })}
        </button>
      </div>
    {/if}
    {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
  {/if}
</div>

<style>
  .bill {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding: 0.5rem 0.25rem;
    background: none;
  }
  .bill:last-child {
    border-bottom: none;
  }
</style>
