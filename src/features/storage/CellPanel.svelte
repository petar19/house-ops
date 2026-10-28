<script lang="ts">
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import {
    addItem,
    catalogOptions,
    loadItemHistory,
    moveItems,
    removeItems,
    storageItems,
    storageUnits,
    updateItem,
    updateUnit,
    type ItemDraft,
  } from '../../lib/stores/storage';
  import { formatQty, isLow, makePlaceOf } from '../../lib/storage/layout';
  import { describeEvent } from '../../lib/storage/history';
  import { normalizeText } from '../../lib/utils/normalize';
  import type { CatalogOption } from '../../lib/storage/suggest';
  import type { StorageEvent, StorageItem, StorageLevel, StorageUnit } from '../../lib/types';
  import ItemNameInput from './ItemNameInput.svelte';
  import QtyFields from './QtyFields.svelte';
  import UnitGrid from './UnitGrid.svelte';

  // Everything about one cell: its items (quick +/−, level), multi-select
  // move/delete, adding with autocomplete, and per-item edit + history.
  let { unit, cellId, highlightIds = new Set<string>() }: { unit: StorageUnit; cellId: string; highlightIds?: Set<string> } =
    $props();

  let groupId = $derived($activeGroup?.id ?? '');
  let placeOf = $derived(makePlaceOf($storageUnits, $t));
  let items = $derived(
    $storageItems
      .filter((i) => i.unitId === unit.id && i.cellId === cellId)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let view = $state<'list' | 'edit' | 'move'>('list');
  let error = $state('');
  let busy = $state(false);

  async function run(fn: () => Promise<void>) {
    error = '';
    busy = true;
    try {
      await fn();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // Categories a brand-new catalog name gets: a known item's own, else the unit's.
  function categoriesFor(name: string, picked: CatalogOption | null): string[] {
    const key = normalizeText(name);
    const known = picked ?? $catalogOptions.find((o) => o.key === key || normalizeText(o.name) === key);
    return known?.categories.length ? known.categories : unit.categories;
  }

  // ── Cell name ──
  let renaming = $state(false);
  let nameDraft = $state('');
  function startRename() {
    nameDraft = unit.cellNames?.[cellId] ?? '';
    renaming = true;
  }
  function saveRename() {
    const cellNames = { ...(unit.cellNames ?? {}) };
    if (nameDraft.trim()) cellNames[cellId] = nameDraft.trim();
    else delete cellNames[cellId];
    run(async () => {
      await updateUnit(groupId, unit.id, { cellNames });
      renaming = false;
    });
  }

  // ── Selection ──
  let selectedIds = $state<Set<string>>(new Set());
  let selectedItems = $derived(items.filter((i) => selectedIds.has(i.id)));
  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }
  function toggleAll() {
    selectedIds = selectedItems.length === items.length ? new Set() : new Set(items.map((i) => i.id));
  }

  function deleteSelected() {
    if (!confirm($t('storage.deleteConfirm', { count: selectedItems.length }))) return;
    run(async () => {
      await removeItems(groupId, selectedItems, placeOf);
      selectedIds = new Set();
    });
  }

  // ── Quick quantity ──
  function step(item: StorageItem, delta: number) {
    const amount = Math.max((item.amount ?? 0) + delta, 0);
    if (amount === 0 && !confirm($t('storage.removeAtZero', { name: item.name }))) {
      run(() => updateItem(groupId, item, { amount: 0 }, [], placeOf));
      return;
    }
    if (amount === 0) run(() => removeItems(groupId, [item], placeOf));
    else run(() => updateItem(groupId, item, { amount }, [], placeOf));
  }
  function setLevel(item: StorageItem, level: StorageLevel) {
    run(() => updateItem(groupId, item, { level }, [], placeOf));
  }

  // ── Add ──
  let addName = $state('');
  let addPicked = $state<CatalogOption | null>(null);
  let addMode = $state<'count' | 'level'>('count');
  let addAmount = $state<number | undefined>(1);
  let addUnit = $state('');
  let addLevel = $state<StorageLevel>('some');

  function onAddPick(option: CatalogOption) {
    addPicked = option;
    if (option.unit) addUnit = option.unit;
  }

  function draftFrom(mode: 'count' | 'level', amount: number | undefined, unitOfMeasure: string, level: StorageLevel) {
    return {
      qtyMode: mode,
      amount: mode === 'count' ? (amount ?? 1) : null,
      unit: mode === 'count' ? unitOfMeasure.trim() || null : null,
      level: mode === 'level' ? level : null,
    };
  }

  function handleAdd(e: SubmitEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    if (addMode === 'count' && (addAmount === undefined || Number.isNaN(addAmount) || addAmount < 0)) {
      error = $t('storage.invalidAmount');
      return;
    }
    const draft: ItemDraft = { name, ...draftFrom(addMode, addAmount, addUnit, addLevel), expiry: null, note: '' };
    const categories = categoriesFor(name, addPicked);
    run(async () => {
      await addItem(groupId, unit.id, cellId, draft, categories, placeOf);
      addName = '';
      addPicked = null;
      addAmount = 1;
      addUnit = '';
    });
  }

  // ── Edit ──
  let editing = $state<StorageItem | null>(null);
  let edName = $state('');
  let edPicked = $state<CatalogOption | null>(null);
  let edMode = $state<'count' | 'level'>('count');
  let edAmount = $state<number | undefined>(1);
  let edUnit = $state('');
  let edLevel = $state<StorageLevel>('some');
  let edExpiry = $state('');
  let edNote = $state('');
  let history = $state<StorageEvent[] | null>(null);

  function startEdit(item: StorageItem) {
    editing = item;
    edName = item.name;
    edPicked = null;
    edMode = item.qtyMode;
    edAmount = item.amount ?? 1;
    edUnit = item.unit ?? '';
    edLevel = item.level ?? 'some';
    edExpiry = item.expiry ?? '';
    edNote = item.note ?? '';
    history = null;
    view = 'edit';
    loadItemHistory(groupId, item.id)
      .then((h) => (history = h))
      .catch(() => (history = []));
  }

  function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    const item = editing;
    if (!item || !edName.trim()) return;
    const patch: Partial<ItemDraft> = {
      name: edName.trim(),
      ...draftFrom(edMode, edAmount, edUnit, edLevel),
      expiry: edExpiry || null,
      note: edNote.trim(),
    };
    run(async () => {
      await updateItem(groupId, item, patch, categoriesFor(edName, edPicked), placeOf);
      view = 'list';
    });
  }

  function memberName(uid: string): string {
    return $activeGroup?.members[uid]?.displayName ?? '?';
  }

  // ── Move ──
  let moveUnitId = $state('');
  let moveCellId = $state<string | null>(null);
  let moveUnit = $derived($storageUnits.find((u) => u.id === moveUnitId) ?? null);

  function startMove() {
    moveUnitId = unit.id;
    moveCellId = null;
    view = 'move';
  }

  function confirmMove() {
    if (!moveUnit || !moveCellId) return;
    const target = moveCellId;
    run(async () => {
      await moveItems(groupId, selectedItems, moveUnit!.id, target, placeOf);
      selectedIds = new Set();
      view = 'list';
    });
  }

  let unitsSorted = $derived([...$storageUnits].sort((a, b) => a.name.localeCompare(b.name)));
</script>

{#if view === 'list'}
  <div class="stack">
    <div class="row" style="justify-content: space-between">
      {#if renaming}
        <form class="row" style="flex:1" onsubmit={(e) => { e.preventDefault(); saveRename(); }}>
          <input style="flex:1; width:auto" bind:value={nameDraft} placeholder={$t('storage.cellNamePlaceholder')} />
          <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
          <button type="button" onclick={() => (renaming = false)}>{$t('common.cancel')}</button>
        </form>
      {:else}
        <span></span>
        <button onclick={startRename}>✎ {$t('storage.renameCell')}</button>
      {/if}
    </div>

    {#if items.length === 0}
      <p class="muted">{$t('storage.cellEmpty')}</p>
    {:else}
      <div class="row bulk">
        <label class="row">
          <input type="checkbox" checked={selectedItems.length === items.length} onchange={toggleAll} />
          {$t('storage.selectAll')}
        </label>
        {#if selectedItems.length > 0}
          <span class="muted">{$t('storage.selected', { count: selectedItems.length })}</span>
          <button onclick={startMove} disabled={busy}>{$t('storage.move')}</button>
          <button class="danger" onclick={deleteSelected} disabled={busy}>{$t('common.delete')}</button>
        {/if}
      </div>

      <ul class="items">
        {#each items as item (item.id)}
          <li class:hit={highlightIds.has(item.id)}>
            <input type="checkbox" checked={selectedIds.has(item.id)} onchange={() => toggle(item.id)} aria-label={item.name} />
            <button class="name" onclick={() => startEdit(item)}>
              <span class:low={isLow(item)}>{item.name}</span>
              {#if item.expiry}<span class="muted">· {$t('storage.expires', { date: item.expiry })}</span>{/if}
              {#if item.note}<span class="muted note">{item.note}</span>{/if}
            </button>
            {#if item.qtyMode === 'count'}
              <div class="row stepper">
                <button onclick={() => step(item, -1)} disabled={busy} aria-label={$t('storage.decrease')}>−</button>
                <span class="qty">{formatQty(item, $t)}</span>
                <button onclick={() => step(item, 1)} disabled={busy} aria-label={$t('storage.increase')}>+</button>
              </div>
            {:else}
              <select
                class="level"
                value={item.level ?? 'some'}
                onchange={(e) => setLevel(item, e.currentTarget.value as StorageLevel)}
                aria-label={$t('storage.level')}
              >
                {#each ['plenty', 'some', 'low', 'empty'] as l (l)}<option value={l}>{$t(`storage.qty.${l}`)}</option>{/each}
              </select>
            {/if}
            <button
              class="details"
              onclick={() => startEdit(item)}
              title={$t('storage.details')}
              aria-label={$t('storage.details')}
            >ⓘ</button>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="row add" onsubmit={handleAdd}>
      <ItemNameInput
        bind:value={addName}
        options={$catalogOptions}
        unitCategories={unit.categories}
        unitId={unit.id}
        placeholder={$t('storage.addPlaceholder')}
        onPick={onAddPick}
      />
      <QtyFields bind:qtyMode={addMode} bind:amount={addAmount} bind:unit={addUnit} bind:level={addLevel} />
      <button class="primary" type="submit" disabled={busy || !addName.trim()}>{$t('common.add')}</button>
    </form>
  </div>
{:else if view === 'edit' && editing}
  <form class="stack" onsubmit={saveEdit}>
    <label class="stack field">
      <span class="muted">{$t('storage.field.name')}</span>
      <ItemNameInput
        bind:value={edName}
        options={$catalogOptions}
        unitCategories={unit.categories}
        unitId={unit.id}
        onPick={(o) => {
          edPicked = o;
          if (o.unit) edUnit = o.unit;
        }}
      />
    </label>
    <div class="stack field">
      <span class="muted">{$t('storage.quantity')}</span>
      <QtyFields bind:qtyMode={edMode} bind:amount={edAmount} bind:unit={edUnit} bind:level={edLevel} />
    </div>
    <label class="stack field">
      <span class="muted">{$t('storage.field.expiry')}</span>
      <input type="date" bind:value={edExpiry} />
    </label>
    <label class="stack field">
      <span class="muted">{$t('storage.field.note')}</span>
      <input bind:value={edNote} />
    </label>
    <div class="row">
      <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
      <button type="button" onclick={() => (view = 'list')}>{$t('common.cancel')}</button>
    </div>

    <div class="stack">
      <h3 style="margin:0">{$t('storage.history')}</h3>
      {#if history === null}
        <p class="muted">{$t('common.loading')}</p>
      {:else if history.length === 0}
        <p class="muted">{$t('storage.historyEmpty')}</p>
      {:else}
        <ul class="history">
          {#each history as ev (ev.id)}
            <li>
              <span class="muted">{new Date(ev.at).toLocaleString()} · {memberName(ev.by)}</span>
              <span>{describeEvent(ev, $t)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </form>
{:else if view === 'move'}
  <div class="stack">
    <p class="muted" style="margin:0">{$t('storage.moveHint', { count: selectedItems.length })}</p>
    <select bind:value={moveUnitId} onchange={() => (moveCellId = null)}>
      {#each unitsSorted as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
    </select>
    {#if moveUnit}
      <UnitGrid
        unit={moveUnit}
        items={$storageItems.filter((i) => i.unitId === moveUnit!.id)}
        compact
        selected={moveCellId}
        disabledCell={moveUnit.id === unit.id ? cellId : null}
        onPick={(id) => (moveCellId = id)}
      />
    {/if}
    <div class="row">
      <button class="primary" onclick={confirmMove} disabled={busy || !moveCellId}>{$t('storage.moveHere')}</button>
      <button onclick={() => (view = 'list')}>{$t('common.cancel')}</button>
    </div>
  </div>
{/if}

{#if error}<p class="muted" style="color: var(--danger); margin-top: 0.5rem">{error}</p>{/if}

<style>
  .bulk {
    justify-content: flex-start;
  }
  .items,
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.4rem;
    border-radius: 8px;
  }
  .items li.hit {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: baseline;
    border: none;
    background: none;
    padding: 0.2em 0;
    text-align: left;
  }
  .note {
    flex-basis: 100%;
  }
  .low {
    color: var(--danger);
  }
  .details {
    padding: 0.25em 0.55em;
    flex: 0 0 auto;
  }
  .stepper {
    flex-wrap: nowrap;
    gap: 0.25rem;
  }
  .stepper button {
    padding: 0.25em 0.65em;
  }
  .qty {
    min-width: 4.5em;
    text-align: center;
    white-space: nowrap;
  }
  .level {
    width: 8em;
  }
  .add {
    align-items: flex-start;
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }
  .field {
    gap: 0.25rem;
  }
  .history li {
    display: flex;
    flex-direction: column;
    font-size: 0.9em;
  }
</style>
