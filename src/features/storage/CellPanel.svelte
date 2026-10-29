<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import {
    addItem,
    catalogOptions,
    convertItemToContainer,
    loadItemHistory,
    moveItems,
    placeUnit,
    removeItems,
    storageCatalog,
    storageItems,
    storageUnits,
    updateItem,
    updateUnit,
    type ItemDraft,
  } from '../../lib/stores/storage';
  import {
    SINGLE,
    containersInCell,
    coveredCellIds,
    coversCell,
    fullPlaceLabel,
    formatQty,
    isLow,
    isSpanning,
    makePlaceOf,
    placeLabel,
    spanBetween,
    spanFits,
    spanOf,
    selfAndDescendants,
    unitIcon,
    unitLocationLabel,
    usualPlace,
  } from '../../lib/storage/layout';
  import { describeEvent } from '../../lib/storage/history';
  import { normalizeText } from '../../lib/utils/normalize';
  import type { CatalogOption } from '../../lib/storage/suggest';
  import type { StorageEvent, StorageItem, StorageLevel, StorageSpan, StorageUnit } from '../../lib/types';
  import ItemNameInput from './ItemNameInput.svelte';
  import QtyFields from './QtyFields.svelte';
  import UnitEditor from './UnitEditor.svelte';
  import UnitGrid from './UnitGrid.svelte';

  // Everything about one cell: its items (quick +/−, level), multi-select
  // move/delete, adding with autocomplete, and per-item edit + history.
  // `readonly` (view-only storage access): everything shows, nothing edits —
  // item details open as a plain summary with its history.
  let {
    unit,
    cellId,
    highlightIds = new Set<string>(),
    readonly = false,
    onShare,
    looseOnly = false,
    showUsual = false,
  }: {
    unit: StorageUnit;
    cellId: string;
    highlightIds?: Set<string>;
    readonly?: boolean;
    onShare?: () => void;
    // A room's page shows its storage as cards itself and embeds this panel
    // just for the loose things (vacuum on the floor) — no container list.
    looseOnly?: boolean;
    // Unsorted: show where each thing usually goes, with a one-tap move.
    showUsual?: boolean;
  } = $props();

  let groupId = $derived($activeGroup?.id ?? '');
  let placeOf = $derived(makePlaceOf($storageUnits, $t));
  let items = $derived(
    $storageItems
      .filter((i) => i.unitId === unit.id && coversCell(i, cellId))
      // Big items that reach into this cell from elsewhere come first.
      .sort((a, b) => Number(isSpanning(b)) - Number(isSpanning(a)) || a.name.localeCompare(b.name)),
  );

  // "Layer 1 (top) – Layer 2 › 3" — the place without the unit's own name.
  function spanText(item: Pick<StorageItem, 'cellId' | 'span'>): string {
    return placeLabel(unit, item.cellId, $t, spanOf(item)).slice(unit.name.length + 3);
  }

  let view = $state<'list' | 'edit' | 'move' | 'newContainer'>('list');

  function usualOf(item: StorageItem) {
    return showUsual ? usualPlace($storageCatalog, $storageUnits, item) : null;
  }
  function putUsual(item: StorageItem) {
    const place = usualOf(item);
    if (place) run(() => moveItems(groupId, [item], place.unitId, place.cellId, placeOf));
  }

  // ── Containers in this cell ──
  let containers = $derived(
    containersInCell($storageUnits, unit.id, cellId).sort((a, b) => a.name.localeCompare(b.name)),
  );
  function contentCount(containerId: string): number {
    return (
      $storageItems.filter((i) => i.unitId === containerId).length +
      $storageUnits.filter((u) => u.parent?.unitId === containerId).length
    );
  }
  // Containers that could be put here: movable, not already here, and not
  // this unit itself or anything this unit sits inside (no loops).
  let placeable = $derived.by(() => {
    const ancestorsAndSelf = new Set<string>();
    for (const c of $storageUnits) {
      if (selfAndDescendants($storageUnits, c.id).has(unit.id)) ancestorsAndSelf.add(c.id);
    }
    return $storageUnits
      .filter((c) => c.movable && !ancestorsAndSelf.has(c.id) && !(c.parent?.unitId === unit.id && c.parent.cellId === cellId))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  let placingId = $state('');

  function putContainerHere() {
    const c = $storageUnits.find((u) => u.id === placingId);
    if (!c) return;
    run(async () => {
      await placeUnit(groupId, c, { unitId: unit.id, cellId, span: null }, {
        from: unitLocationLabel($storageUnits, c, $t) ?? $t('storage.loose'),
        to: fullPlaceLabel($storageUnits, unit.id, cellId, $t),
      });
      placingId = '';
    });
  }
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
  // Space: tapping a cell makes the item cover the box between its top-back-
  // left corner and that cell; "one cell" shrinks it back to this cell.
  let edCorner = $state(''); // the fixed corner taps stretch from
  let edCellId = $state('');
  let edSpan = $state<StorageSpan>(SINGLE);
  let edCovered = $derived(new Set(coveredCellIds(edCellId, edSpan)));

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
    edCorner = item.cellId;
    edCellId = item.cellId;
    edSpan = spanOf(item);
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
    const space = { cellId: edCellId, span: edSpan };
    run(async () => {
      await updateItem(groupId, item, { ...patch, ...space }, categoriesFor(edName, edPicked), placeOf);
      view = 'list';
    });
  }

  function memberName(uid: string): string {
    return $activeGroup?.members[uid]?.displayName ?? '?';
  }

  function makeContainer() {
    const item = editing;
    if (!item || !confirm($t('storage.makeContainerConfirm', { name: item.name }))) return;
    run(async () => {
      const id = await convertItemToContainer(groupId, item, placeOf);
      push(`/storage/${id}`);
    });
  }

  function pickCorner(id: string) {
    ({ cellId: edCellId, span: edSpan } = spanBetween(edCorner, id));
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
    const tooBig = selectedItems.filter((i) => !spanFits(moveUnit!, target, spanOf(i)));
    if (tooBig.length > 0) {
      error = $t('storage.spanNoFit', { names: tooBig.map((i) => i.name).join(', ') });
      return;
    }
    run(async () => {
      await moveItems(groupId, selectedItems, moveUnit!.id, target, placeOf);
      selectedIds = new Set();
      view = 'list';
    });
  }

  let unitsSorted = $derived([...$storageUnits].sort((a, b) => a.name.localeCompare(b.name)));
</script>

{#snippet historyList()}
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
{/snippet}

{#if view === 'list'}
  <div class="stack">
    {#if !looseOnly}
    <div class="row" style="justify-content: space-between">
      {#if renaming}
        <form class="row" style="flex:1" onsubmit={(e) => { e.preventDefault(); saveRename(); }}>
          <input style="flex:1; width:auto" bind:value={nameDraft} placeholder={$t('storage.cellNamePlaceholder')} />
          <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
          <button type="button" onclick={() => (renaming = false)}>{$t('common.cancel')}</button>
        </form>
      {:else}
        {#if onShare}<button onclick={onShare}>🔗 {$t('share.shareCell')}</button>{:else}<span></span>{/if}
        {#if !readonly}<button onclick={startRename}>✎ {$t('storage.renameCell')}</button>{/if}
      {/if}
    </div>
    {/if}

    {#if containers.length > 0 && !looseOnly}
      <ul class="containers">
        {#each containers as c (c.id)}
          <li>
            <button class="container-link" onclick={() => push(`/storage/${c.id}`)}>
              <span class="c-icon">{unitIcon(c)}</span>
              <span class="c-name">{c.name}</span>
              <span class="muted">{$t('storage.itemCount', { count: contentCount(c.id) })} ›</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if items.length === 0 && (containers.length === 0 || looseOnly)}
      <p class="muted">{$t('storage.cellEmpty')}</p>
    {:else if items.length === 0}
      <!-- only containers here -->
    {:else}
      {#if !readonly}
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
      {/if}

      <ul class="items">
        {#each items as item (item.id)}
          <li class:hit={highlightIds.has(item.id)}>
            {#if !readonly}
              <input type="checkbox" checked={selectedIds.has(item.id)} onchange={() => toggle(item.id)} aria-label={item.name} />
            {/if}
            <button class="name" onclick={() => startEdit(item)}>
              <span class:low={isLow(item)}>{#if isSpanning(item)}<span class="span-mark">⧉</span> {/if}{item.name}</span>
              {#if isSpanning(item)}<span class="muted span-text">{$t('storage.spansOver', { place: spanText(item) })}</span>{/if}
              {#if item.expiry}<span class="muted">· {$t('storage.expires', { date: item.expiry })}</span>{/if}
              {#if item.note}<span class="muted note">{item.note}</span>{/if}
              {#if usualOf(item)}
                {@const u = usualOf(item)!}
                <span class="muted note">📍 {$t('inbox.usually', { place: fullPlaceLabel($storageUnits, u.unitId, u.cellId, $t) })}</span>
              {/if}
            </button>
            {#if readonly}
              <span class="qty">{formatQty(item, $t)}</span>
            {:else if item.qtyMode === 'count'}
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
            {#if !readonly && usualOf(item)}
              <button class="details" onclick={() => putUsual(item)} disabled={busy} title={$t('inbox.putThere')} aria-label={$t('inbox.putThere')}>📍</button>
            {/if}
            <button
              class="details"
              onclick={() => startEdit(item)}
              title={$t('storage.details')}
              aria-label={$t('storage.details')}
            >
              <!-- Drawn rather than the ⓘ character, which not every font has. -->
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
                <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if !readonly}
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
    {#if !looseOnly}
    <div class="row container-actions">
      {#if placeable.length > 0}
        <select bind:value={placingId} aria-label={$t('storage.putContainerHere')}>
          <option value="">{$t('storage.putContainerHere')}…</option>
          {#each placeable as c (c.id)}<option value={c.id}>{unitIcon(c)} {c.name}</option>{/each}
        </select>
        <button onclick={putContainerHere} disabled={busy || !placingId}>{$t('storage.putHere')}</button>
      {/if}
      <button onclick={() => (view = 'newContainer')}>+ {$t('storage.newContainerHere')}</button>
    </div>
    {/if}
    {/if}
  </div>
{:else if view === 'newContainer'}
  <div class="stack">
    <UnitEditor placeIn={{ unitId: unit.id, cellId }} onDone={() => (view = 'list')} />
    <button onclick={() => (view = 'list')}>{$t('common.cancel')}</button>
  </div>
{:else if view === 'edit' && editing && readonly}
  <!-- View-only access: a plain summary rather than a greyed-out form. -->
  <div class="stack">
    <dl class="facts">
      <dt>{$t('storage.field.name')}</dt>
      <dd>{editing.name}</dd>
      <dt>{$t('storage.quantity')}</dt>
      <dd>{formatQty(editing, $t)}</dd>
      {#if editing.expiry}
        <dt>{$t('storage.field.expiry')}</dt>
        <dd>{editing.expiry}</dd>
      {/if}
      {#if editing.note}
        <dt>{$t('storage.field.note')}</dt>
        <dd>{editing.note}</dd>
      {/if}
      {#if isSpanning(editing)}
        <dt>{$t('storage.space')}</dt>
        <dd>{spanText(editing)}</dd>
      {/if}
    </dl>
    <div class="row">
      <button type="button" onclick={() => (view = 'list')}>← {$t('access.back')}</button>
    </div>
    {@render historyList()}
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
    <div class="stack field">
      <span class="muted">{$t('storage.space')}</span>
      <span class="muted">{$t('storage.spaceHint')}</span>
      <UnitGrid unit={unit} items={[]} compact highlight={edCovered} selected={edCorner} onPick={pickCorner} />
      <div class="row">
        <span class="muted">{spanText({ cellId: edCellId, span: edSpan })}</span>
        {#if edCovered.size > 1}
          <button type="button" onclick={() => ((edCorner = edCellId = cellId), (edSpan = SINGLE))}>{$t('storage.spaceReset')}</button>
        {/if}
      </div>
    </div>
    <div class="row" style="justify-content: space-between">
      <div class="row">
        <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
        <button type="button" onclick={() => (view = 'list')}>{$t('common.cancel')}</button>
      </div>
      <button type="button" onclick={makeContainer} disabled={busy} title={$t('storage.makeContainerHint')}>📦 {$t('storage.makeContainer')}</button>
    </div>
    {@render historyList()}
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
  .span-mark {
    color: var(--accent);
  }
  .span-text {
    flex-basis: 100%;
  }
  .containers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .container-link {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
  }
  .c-icon {
    font-size: 1.3em;
  }
  .c-name {
    flex: 1;
    font-weight: 600;
  }
  .container-actions select {
    flex: 1 1 12rem;
    width: auto;
  }
  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
  }
  .facts dt {
    color: var(--text-dim);
  }
  .facts dd {
    margin: 0;
  }
  .details {
    display: grid;
    place-items: center;
    padding: 0.3em 0.45em;
    flex: 0 0 auto;
    color: var(--accent);
    border-color: var(--accent);
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
