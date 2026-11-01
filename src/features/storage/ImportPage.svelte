<script lang="ts">
  import { setChecked, shoppingItems, shoppingLists } from '../../lib/stores/shopping';
  import { productOf } from '../../lib/shopping/lowStock';
  import type { ShoppingItem } from '../../lib/types';
  import { shelfFor } from '../../lib/storage/expirySuggest';
  import { daysBetween } from '../../lib/storage/shelfLife';
  import { shrinkPhoto } from '../../lib/utils/image';
  import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
  import { link, push } from 'svelte-spa-router';
  import { db } from '../../lib/firebase';
  import { t } from '../../lib/i18n';
  import { activeGroup, groupIdFor, myAccess } from '../../lib/stores/groups';
  import {
    importToUnsorted,
    markReceiptImported,
    catalogOptions,
    learnShelfLife,
    recordPurchases,
    requestShelfLife,
    saveShelfLifeAnswers,
    shelfLifeLearned,
    requestReceiptItems,
    requestReceiptPhoto,
    requestReceiptText,
    storageUnits,
    type ImportDraft,
  } from '../../lib/stores/storage';
  import { makePlaceOf } from '../../lib/storage/layout';
  import { matchQuality } from '../../lib/storage/suggest';
  import { toIso } from '../../lib/utils/date';
  import type { DocumentRecord, DocumentVendor, ReceiptItemRequest, ReceiptLineItem, ReceiptTextRequest, ShelfLifeRequest } from '../../lib/types';
  import ImportRows, { newRow, type ImportRow } from './ImportRows.svelte';

  // Collect a whole shopping trip into Unsorted in one go — typed/pasted, a
  // receipt pasted as text, or read off a scanned bill — then put things
  // away from there whenever.
  let mode = $state<'list' | 'paste' | 'photo' | 'bill'>('list');
  let rows = $state<ImportRow[]>([newRow()]);
  let busy = $state(false);
  let error = $state('');

  let groupId = $derived($activeGroup?.id ?? '');
  let canEdit = $derived($myAccess.storage === 'edit');
  // Bills come from the Documents tab (photo saving with OCR on).
  let canUseBills = $derived($myAccess.photoSaving !== 'none');
  let ready = $derived(rows.filter((r) => r.include && r.name.trim()));

  // Where and when it was bought — for the price history. Filled in from a
  // bill or a pasted receipt; a row's own shop (under ⋯) wins over this.
  let importShop = $state('');
  let importDate = $state(toIso(new Date()));

  function rowFromLine(li: ReceiptLineItem): ImportRow {
    return newRow({
      name: li.name,
      amount: li.quantity ?? 1,
      unit: li.unit ?? '',
      raw: li.raw,
      price: li.price ?? undefined,
      brand: li.brand ?? '',
      packAmount: li.packAmount ?? null,
      packUnit: li.packUnit ?? null,
    });
  }

  function toDrafts(list: ImportRow[], billNote: string): ImportDraft[] {
    return list.map((r) => ({
      name: r.name.trim(),
      qtyMode: r.qtyMode,
      amount: r.qtyMode === 'count' ? (r.amount ?? 1) : null,
      unit: r.qtyMode === 'count' ? r.unit.trim() || null : null,
      level: r.qtyMode === 'level' ? r.level : null,
      expiry: r.expiry || null,
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
      // Pasted receipts have no shop/date on hand — the raw line is note enough.
      const { unitId } = await importToUnsorted(groupId, $t('import.unsortedName'), toDrafts(ready, billNote), makePlaceOf($storageUnits, $t));
      await recordPurchases(
        groupId,
        ready.map((r) => ({
          name: r.name.trim(),
          raw: r.raw,
          quantity: r.qtyMode === 'count' ? (r.amount ?? 1) : null,
          unit: r.qtyMode === 'count' ? r.unit.trim() || null : null,
          packAmount: r.packAmount,
          packUnit: r.packUnit,
          price: r.price === undefined || r.price === null || Number.isNaN(r.price) ? null : r.price,
          shop: r.shop.trim() || importShop.trim() || null,
          brand: r.brand.trim() || null,
          date: importDate || toIso(new Date()),
          documentId: selectedBill?.id ?? null,
        })),
      );
      // Dates someone typed or left as suggested are what this group goes by
      // from now on for those products.
      await learnShelfLife(
        groupId,
        ready
          .filter((r) => r.expiry && (r.expiryTouched || r.expiryBasis === 'type'))
          .map((r) => ({ name: r.name, climate: r.climate ?? 'room', days: daysBetween(importDate || toIso(new Date()), r.expiry) })),
      ).catch(() => {}); // a suggestion not learned is no reason to fail the import
      if (selectedBill) {
        await markReceiptImported(groupId, selectedBill.id, requests.get(selectedBill.id)?.status ?? 'done');
      }
      // Bought things that are on a shopping list: offer to tick them off.
      const keys = new Set(ready.map((r) => productOf(r.name, $catalogOptions).productKey));
      const onLists = canShop ? $shoppingItems.filter((i) => !i.checked && keys.has(i.productKey)) : [];
      if (onLists.length > 0) {
        afterImport = { unitId, items: onLists };
        tickIds = new Set(onLists.map((i) => i.id));
      } else {
        push(`/storage/${unitId}`);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // ── After importing: tick off what was on the shopping lists ──
  let canShop = $derived(!!$activeGroup?.capabilities.shoppingList && $myAccess.shoppingList === 'edit');
  let afterImport = $state<{ unitId: string; items: ShoppingItem[] } | null>(null);
  let tickIds = $state<Set<string>>(new Set());
  async function tickBought() {
    if (!afterImport) return;
    const { unitId, items } = afterImport;
    busy = true;
    try {
      for (const item of items.filter((i) => tickIds.has(i.id))) {
        await setChecked(groupId, item, true, $t('shopping.restockText', { name: item.name }));
      }
      push(`/storage/${unitId}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  function toggleTick(id: string) {
    const next = new Set(tickIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    tickIds = next;
  }

  // ── Expiry dates Gemini is asked about ──
  // Rows with no suggestion that could be food: one request for all of them;
  // the answers are stored as learned, so the rows fill themselves in and the
  // same products never need asking again.
  let undated = $derived(
    ready.filter((r) => !r.expiry && !r.expiryTouched && !shelfFor(r.name, $catalogOptions, $shelfLifeLearned).nonFood),
  );
  let shelfRequestId = $state<string | null>(null);
  let shelfRequest = $state<ShelfLifeRequest | null>(null);
  async function askShelfLife() {
    if (!groupId || undated.length === 0) return;
    error = '';
    shelfRequest = null;
    try {
      shelfRequestId = await requestShelfLife(groupId, undated.map((r) => r.name));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  $effect(() => {
    const id = shelfRequestId;
    if (!id || !groupId) return;
    const gid = groupId;
    const unsub = onSnapshot(doc(db, 'groups', gid, 'shelfLifeRequests', id), (snap) => {
      const req = snap.data() as ShelfLifeRequest | undefined;
      if (!req) return;
      shelfRequest = req;
      if (req.status === 'done' && req.results) {
        saveShelfLifeAnswers(gid, req.results).catch((e) => (error = String(e)));
        shelfRequestId = null;
      }
    });
    return unsub;
  });

  // ── Bills ──
  const billsGroupId = groupIdFor('photoSaving');
  let bills = $state<DocumentRecord[] | null>(null);
  let requests = $state(new Map<string, ReceiptItemRequest>());
  let selectedBill = $state<DocumentRecord | null>(null);

  // Searching by shop name: the list above only holds the latest bills, so
  // a search looks up matching vendors in the full vendor list and loads all
  // of their bills (the same per-vendor query the Documents tab uses).
  let billQuery = $state('');
  let vendorNames = $state<string[] | null>(null);
  let searchResults = $state<DocumentRecord[] | null>(null);
  let searching = $state(false);

  async function loadVendorNames(gid: string): Promise<string[]> {
    if (vendorNames) return vendorNames;
    const snap = await getDocs(collection(db, 'groups', gid, 'documentVendors'));
    vendorNames = snap.docs.map((d) => (d.data() as DocumentVendor).displayName).filter(Boolean);
    return vendorNames;
  }

  $effect(() => {
    const q = billQuery.trim();
    const gid = $billsGroupId;
    if (!q || !gid) {
      searchResults = null;
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      searching = true;
      try {
        const names = (await loadVendorNames(gid)).filter((n) => matchQuality(q, n) > 0).slice(0, 8);
        const snaps = await Promise.all(
          names.map((n) => getDocs(query(collection(db, 'groups', gid, 'documents'), where('vendor', '==', n)))),
        );
        if (cancelled) return;
        searchResults = snaps
          .flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, 'id'>) })))
          .sort((a, b) => (b.date ?? b.processedAt).localeCompare(a.date ?? a.processedAt));
      } catch (e) {
        if (!cancelled) error = e instanceof Error ? e.message : String(e);
      } finally {
        if (!cancelled) searching = false;
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  let shownBills = $derived(searchResults ?? bills);
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
    importShop = bill.vendor;
    if (bill.date) importDate = bill.date;
    return (bill.lineItems ?? []).map(rowFromLine);
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
      searchResults = searchResults?.map((b) => (b.id === fresh.id ? fresh : b)) ?? null;
      rows = rowsFromBill(fresh);
      waitingSince = null;
    });
  });

  let selectedStatus = $derived(selectedBill ? requests.get(selectedBill.id) : undefined);
  let slow = $derived(!!waitingSince && selectedStatus?.status === 'pending' && now - waitingSince > 45_000);

  function retry() {
    if (selectedBill) void chooseBill({ ...selectedBill, lineItems: undefined });
  }

  function switchMode(m: 'list' | 'paste' | 'photo' | 'bill') {
    mode = m;
    selectedBill = null;
    rows = m === 'list' ? [newRow()] : [];
    error = '';
    pasteRequestId = null;
    pasteRequest = null;
    photoPreview = '';
    importShop = '';
    importDate = toIso(new Date());
  }

  // ── Pasted receipt text ──
  // Any shop's digital receipt, pasted as-is: the OCR watcher reads the
  // products out of it with Gemini (same as a scanned bill), so the layout
  // doesn't matter the way it does for the line-by-line list above.
  let pasteText = $state('');
  let pasteRequestId = $state<string | null>(null);
  let pasteRequest = $state<ReceiptTextRequest | null>(null);
  let pasteSince = $state<number | null>(null);

  async function readPasted() {
    if (!groupId || !pasteText.trim()) return;
    error = '';
    rows = [];
    pasteRequest = null;
    try {
      pasteRequestId = await requestReceiptText(groupId, pasteText.trim().slice(0, 20000));
      pasteSince = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    const id = pasteRequestId;
    if (!id || !groupId) return;
    const timer = setInterval(() => (now = Date.now()), 5000);
    const unsub = onSnapshot(doc(db, 'groups', groupId, 'receiptTextRequests', id), (snap) => {
      const req = snap.data() as ReceiptTextRequest | undefined;
      if (!req) return;
      pasteRequest = req;
      if (req.status === 'done') {
        rows = (req.items ?? []).map(rowFromLine);
        if (req.shop) importShop = req.shop;
        if (req.date) importDate = req.date;
        pasteSince = null;
      }
    });
    return () => {
      unsub();
      clearInterval(timer);
    };
  });

  // ── Photo ── a receipt, or the shopping itself on the table: shrunk on
  // the phone, then read like a pasted receipt (same request, same answer).
  let photoPreview = $state('');
  async function readPhoto(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !groupId) return;
    error = '';
    rows = [];
    pasteRequest = null;
    try {
      const { base64, dataUrl } = await shrinkPhoto(file);
      photoPreview = dataUrl;
      pasteRequestId = await requestReceiptPhoto(groupId, base64);
      pasteSince = Date.now();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  let pasteSlow = $derived(!!pasteSince && pasteRequest?.status !== 'done' && now - pasteSince > 45_000);
</script>

<div class="page stack">
  <a href="/storage" use:link class="muted" style="text-decoration:none">← {$t('storage.title')}</a>
  <h2 style="margin:0">{$t('import.title')}</h2>

  {#if !canEdit}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else if afterImport}
    <div class="card stack">
      <strong>✓ {$t('import.done')}</strong>
      <span>🛒 {$t('import.onLists', { count: afterImport.items.length })}</span>
      {#each afterImport.items as item (item.id)}
        <label class="row">
          <input type="checkbox" checked={tickIds.has(item.id)} onchange={() => toggleTick(item.id)} />
          <span>{item.name} <span class="muted">· {$shoppingLists.find((l) => l.id === item.listId)?.name ?? ''}</span></span>
        </label>
      {/each}
      <div class="row">
        <button class="primary" onclick={tickBought} disabled={busy || tickIds.size === 0}>{$t('import.tickOff', { count: tickIds.size })}</button>
        <button onclick={() => push(`/storage/${afterImport!.unitId}`)} disabled={busy}>{$t('import.skipTick')}</button>
      </div>
      {#if error}<p class="muted" style="color: var(--danger); margin:0">{error}</p>{/if}
    </div>
  {:else}
    <p class="muted" style="margin:0">{$t('import.intro')}</p>
    <div class="tabs row">
      <button class:primary={mode === 'list'} onclick={() => switchMode('list')}>✍️ {$t('import.typeList')}</button>
      <button class:primary={mode === 'paste'} onclick={() => switchMode('paste')}>📋 {$t('import.pasteReceipt')}</button>
      <button class:primary={mode === 'photo'} onclick={() => switchMode('photo')}>📷 {$t('import.photo')}</button>
      <button class:primary={mode === 'bill'} onclick={() => switchMode('bill')}>🧾 {$t('import.fromBill')}</button>
    </div>

    {#if mode === 'list'}
      <div class="card stack">
        <p class="muted" style="margin:0">{$t('import.listHint')}</p>
        <ImportRows bind:rows date={importDate} />
      </div>
    {:else if mode === 'paste'}
      <div class="card stack">
        <p class="muted" style="margin:0">{$t('import.pasteHint')}</p>
        <textarea rows="10" bind:value={pasteText} placeholder={$t('import.pastePlaceholder')}></textarea>
        <div class="row">
          <button class="primary" onclick={readPasted} disabled={!pasteText.trim() || (!!pasteRequestId && pasteRequest?.status !== 'done' && pasteRequest?.status !== 'error')}>
            ✨ {$t('import.readWithAi')}
          </button>
        </div>
        {#if pasteRequestId && pasteRequest?.status === 'error'}
          <p class="muted" style="color: var(--danger); margin:0">{$t('import.readFailed', { error: pasteRequest.error ?? '' })}</p>
        {:else if pasteRequestId && pasteRequest?.status !== 'done'}
          <p class="muted" style="margin:0">⏳ {$t('import.readingText')}</p>
          {#if pasteSlow}<p class="muted" style="margin:0">{$t('import.readingSlow')}</p>{/if}
        {:else if pasteRequest?.status === 'done'}
          <p class="muted" style="margin:0">{$t('import.billHint', { count: rows.length })}</p>
          <ImportRows bind:rows showInclude date={importDate} />
        {/if}
      </div>
    {:else if mode === 'photo'}
      <div class="card stack">
        <p class="muted" style="margin:0">{$t('import.photoHint')}</p>
        <label class="button-like">
          📷 {photoPreview ? $t('import.photoAnother') : $t('import.photoTake')}
          <input type="file" accept="image/*" capture="environment" onchange={readPhoto} hidden />
        </label>
        {#if photoPreview}<img src={photoPreview} alt="" class="preview" />{/if}
        {#if pasteRequestId && pasteRequest?.status === 'error'}
          <p class="muted" style="color: var(--danger); margin:0">{$t('import.readFailed', { error: pasteRequest.error ?? '' })}</p>
        {:else if pasteRequestId && pasteRequest?.status !== 'done'}
          <p class="muted" style="margin:0">⏳ {$t('import.readingPhoto')}</p>
          {#if pasteSlow}<p class="muted" style="margin:0">{$t('import.readingSlow')}</p>{/if}
        {:else if pasteRequest?.status === 'done'}
          <p class="muted" style="margin:0">{$t('import.billHint', { count: rows.length })}</p>
          <ImportRows bind:rows showInclude date={importDate} />
        {/if}
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
          <input type="search" bind:value={billQuery} placeholder={$t('import.searchBills')} aria-label={$t('import.searchBills')} />
          {#if searching}<p class="muted" style="margin:0">{$t('common.loading')}</p>{/if}
          {#if searchResults && searchResults.length === 0 && !searching}
            <p class="muted" style="margin:0">{$t('storage.noResults')}</p>
          {/if}
          {#each shownBills ?? [] as bill (bill.id)}
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
          <ImportRows bind:rows showInclude date={importDate} />
        {/if}
      </div>
    {/if}

    {#if rows.length > 0}
      <div class="row where-when">
        <label class="stack field">
          <span class="muted">{$t('import.shop')}</span>
          <input bind:value={importShop} placeholder={$t('import.shopPlaceholder')} />
        </label>
        <label class="stack field">
          <span class="muted">{$t('import.date')}</span>
          <input type="date" bind:value={importDate} />
        </label>
      </div>
      <div class="stack expiry-note">
        <span class="muted">{$t('expiry.importHint')}</span>
        {#if undated.length > 0}
          <div class="row">
            <span class="muted">{$t('expiry.undated', { count: undated.length })}</span>
            <button onclick={askShelfLife} disabled={!!shelfRequestId}>
              {shelfRequestId ? `⏳ ${$t('expiry.asking')}` : `✨ ${$t('expiry.askAi')}`}
            </button>
          </div>
        {/if}
        {#if shelfRequest?.status === 'error'}
          <span class="muted" style="color: var(--danger)">{shelfRequest.error}</span>
        {/if}
      </div>
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
  .where-when .field {
    flex: 1 1 10rem;
    gap: 0.2rem;
  }
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
  .button-like {
    display: inline-block;
    align-self: flex-start;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 0.55em 1em;
    cursor: pointer;
    color: var(--accent);
  }
  .preview {
    max-width: 100%;
    max-height: 14rem;
    object-fit: contain;
    align-self: flex-start;
    border-radius: 8px;
  }
</style>
