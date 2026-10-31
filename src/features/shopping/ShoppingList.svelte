<script lang="ts">
  import { link, push, replace } from 'svelte-spa-router';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import {
    addToList,
    clearChecked,
    createList,
    deleteList,
    rememberList,
    removeShoppingItem,
    renameList,
    setChecked,
    setRestock,
    shoppingItems,
    shoppingLists,
    shoppingLoading,
    shoppingRestock,
    updateShoppingItem,
  } from '../../lib/stores/shopping';
  import { catalogOptions, storageItems } from '../../lib/stores/storage';
  import { lowStock, productOf, restockDue } from '../../lib/shopping/lowStock';
  import { t } from '../../lib/i18n';
  import type { CatalogOption } from '../../lib/storage/suggest';
  import type { ShoppingItem } from '../../lib/types';
  import ItemNameInput from '../storage/ItemNameInput.svelte';

  // Several named lists per group. Things are ticked off in the shop (and
  // stay struck through until cleared); a product can repeat every N days,
  // which puts it back on its list by itself; and anything running low in
  // storage can be pulled in with one tap.
  let { params = {} }: { params?: { listId?: string } } = $props();

  let groupId = $derived($activeGroup?.id ?? '');
  let canEdit = $derived($myAccess.shoppingList === 'edit');
  let seesStorage = $derived(!!$activeGroup?.capabilities.storage && $myAccess.storage !== 'none');

  let list = $derived($shoppingLists.find((l) => l.id === params.listId) ?? $shoppingLists[0] ?? null);
  let items = $derived($shoppingItems.filter((i) => i.listId === list?.id));
  let open = $derived(items.filter((i) => !i.checked).sort((a, b) => a.name.localeCompare(b.name)));
  let done = $derived(items.filter((i) => i.checked).sort((a, b) => a.name.localeCompare(b.name)));
  let low = $derived(seesStorage ? lowStock($storageItems, $catalogOptions, items) : []);
  let repeatOf = (productKey: string) => $shoppingRestock.find((r) => r.id === productKey);

  $effect(() => {
    if (list) rememberList(list.id);
  });

  // A group starts with one list, made the first time someone opens the tab.
  let creatingFirst = false;
  $effect(() => {
    if (!groupId || !canEdit || $shoppingLoading || $shoppingLists.length > 0 || creatingFirst) return;
    creatingFirst = true;
    createList(groupId, $t('shopping.defaultList')).catch((e) => (error = String(e)));
  });

  let error = $state('');
  let busy = $state(false);
  async function run(fn: () => Promise<unknown>) {
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

  // ── Adding ──
  let newName = $state('');
  let newNote = $state('');
  let picked = $state<CatalogOption | null>(null);
  function handleAdd(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !list) return;
    const c = picked && picked.name === name ? { name: picked.name, productKey: picked.productKey } : productOf(name, $catalogOptions);
    const listId = list.id;
    run(async () => {
      await addToList(groupId, listId, [c], 'manual', newNote.trim());
      newName = '';
      newNote = '';
      picked = null;
    });
  }

  function addLow() {
    if (!list) return;
    const listId = list.id;
    run(() => addToList(groupId, listId, low, 'storage'));
  }

  function toggle(item: ShoppingItem) {
    run(() => setChecked(groupId, item, !item.checked, $t('shopping.restockText', { name: item.name })));
  }

  // ── One item's details: note and repeat ──
  let editingId = $state<string | null>(null);
  let edNote = $state('');
  let edRepeat = $state<number | undefined>(undefined);
  function startEdit(item: ShoppingItem) {
    editingId = item.id;
    edNote = item.note;
    edRepeat = repeatOf(item.productKey)?.days;
  }
  function saveEdit(item: ShoppingItem) {
    if (!list) return;
    const days = edRepeat === undefined || edRepeat === null || Number.isNaN(edRepeat) || edRepeat <= 0 ? null : edRepeat;
    const had = repeatOf(item.productKey);
    const listId = list.id;
    run(async () => {
      if (edNote.trim() !== item.note) await updateShoppingItem(groupId, item.id, { note: edNote.trim() });
      if (days !== (had?.days ?? null) || (days && had && had.listId !== listId)) {
        await setRestock(groupId, { name: item.name, productKey: item.productKey }, days, listId);
      }
      editingId = null;
    });
  }

  // ── Lists ──
  let newListOpen = $state(false);
  let newListName = $state('');
  let newListPrefill = $state(true);
  let allLow = $derived(seesStorage ? lowStock($storageItems, $catalogOptions) : []);
  function handleNewList(e: SubmitEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    run(async () => {
      const id = await createList(groupId, name, newListPrefill ? allLow : []);
      newListOpen = false;
      newListName = '';
      push(`/shopping/${id}`);
    });
  }

  let renaming = $state(false);
  let renameDraft = $state('');
  function saveRename(e: SubmitEvent) {
    e.preventDefault();
    if (!list || !renameDraft.trim()) return;
    const id = list.id;
    run(async () => {
      await renameList(groupId, id, renameDraft);
      renaming = false;
    });
  }
  function removeList() {
    if (!list || !confirm($t('shopping.deleteListConfirm', { name: list.name, count: items.length }))) return;
    const id = list.id;
    run(async () => {
      await deleteList(groupId, id);
      replace('/shopping');
    });
  }

  let repeating = $derived([...$shoppingRestock].sort((a, b) => a.name.localeCompare(b.name)));
  function stopRepeat(productKey: string, name: string) {
    run(() => setRestock(groupId, { name, productKey }, null, ''));
  }
</script>

{#snippet itemRow(item: ShoppingItem)}
  {@const repeat = repeatOf(item.productKey)}
  <li class:done={item.checked}>
    <label class="tick">
      <input type="checkbox" checked={item.checked} disabled={!canEdit || busy} onchange={() => toggle(item)} />
      <span class="name">
        <span>{item.name}</span>
        {#if item.note}<span class="muted">· {item.note}</span>{/if}
        {#if repeat}<span class="muted" title={$t('shopping.repeats', { days: repeat.days })}>🔁</span>{/if}
        {#if item.source === 'storage'}<span class="muted" title={$t('shopping.fromStorage')}>📦</span>{/if}
      </span>
    </label>
    {#if canEdit}
      <button class="icon" onclick={() => (editingId === item.id ? (editingId = null) : startEdit(item))} aria-label={$t('common.edit')}>⋯</button>
      <button class="icon" onclick={() => run(() => removeShoppingItem(groupId, item.id))} aria-label={$t('common.remove')}>×</button>
    {/if}
  </li>
  {#if editingId === item.id}
    <li class="edit">
      <form class="stack" onsubmit={(e) => { e.preventDefault(); saveEdit(item); }}>
        <label class="stack field">
          <span class="muted">{$t('shopping.note')}</span>
          <input bind:value={edNote} placeholder={$t('shopping.notePlaceholder')} />
        </label>
        <label class="stack field">
          <span class="muted">{$t('shopping.repeatEvery')}</span>
          <span class="row">
            <input type="number" min="1" style="width:6em" bind:value={edRepeat} />
            <span class="muted">{$t('shopping.daysOptional')}</span>
          </span>
          <span class="muted hint">{$t('shopping.repeatHint')}</span>
        </label>
        <div class="row">
          <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
          <button type="button" onclick={() => (editingId = null)}>{$t('common.cancel')}</button>
        </div>
      </form>
    </li>
  {/if}
{/snippet}

<div class="page stack">
  <h2 style="margin:0">{$t('shopping.title')}</h2>

  {#if !$activeGroup}
    <p class="muted">{$t('exportImport.pickGroup')}</p>
  {:else if !$activeGroup.capabilities.shoppingList}
    <p class="muted">{$t('shopping.capabilityOff')}</p>
  {:else if $myAccess.shoppingList === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else if $shoppingLoading}
    <p class="muted">{$t('common.loading')}</p>
  {:else}
    <div class="chips">
      {#each $shoppingLists as l (l.id)}
        {@const count = $shoppingItems.filter((i) => i.listId === l.id && !i.checked).length}
        <a class="chip" class:on={l.id === list?.id} href="/shopping/{l.id}" use:link>
          {l.name}{#if count > 0} <span class="count">{count}</span>{/if}
        </a>
      {/each}
      {#if canEdit}
        <button class="chip" onclick={() => (newListOpen = !newListOpen)}>+ {$t('shopping.newList')}</button>
      {/if}
    </div>

    {#if newListOpen}
      <form class="card stack" onsubmit={handleNewList}>
        <input bind:value={newListName} placeholder={$t('shopping.listNamePlaceholder')} />
        {#if seesStorage}
          <label class="row">
            <input type="checkbox" bind:checked={newListPrefill} />
            {$t('shopping.prefillLow', { count: allLow.length })}
          </label>
        {/if}
        <div class="row">
          <button class="primary" type="submit" disabled={busy || !newListName.trim()}>{$t('shopping.createList')}</button>
          <button type="button" onclick={() => (newListOpen = false)}>{$t('common.cancel')}</button>
        </div>
      </form>
    {/if}

    {#if list}
      <div class="card stack">
        <div class="row" style="justify-content: space-between">
          {#if renaming}
            <form class="row" style="flex:1" onsubmit={saveRename}>
              <input style="flex:1; width:auto" bind:value={renameDraft} />
              <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
              <button type="button" onclick={() => (renaming = false)}>{$t('common.cancel')}</button>
            </form>
          {:else}
            <h3 style="margin:0">{list.name}</h3>
            {#if canEdit}
              <div class="row">
                <button onclick={() => { renameDraft = list!.name; renaming = true; }}>✎ {$t('shopping.rename')}</button>
                {#if $shoppingLists.length > 1}
                  <button class="danger" onclick={removeList}>{$t('common.delete')}</button>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

        {#if canEdit}
          <form class="row add" onsubmit={handleAdd}>
            <ItemNameInput
              bind:value={newName}
              options={$catalogOptions}
              unitCategories={[]}
              unitId=""
              placeholder={$t('shopping.namePlaceholder')}
              onPick={(o) => (picked = o)}
            />
            <input class="note-in" bind:value={newNote} placeholder={$t('shopping.notePlaceholder')} />
            <button class="primary" type="submit" disabled={busy || !newName.trim()}>{$t('common.add')}</button>
          </form>
          {#if low.length > 0}
            <button onclick={addLow} disabled={busy}>📦 {$t('shopping.addLow', { count: low.length })}</button>
          {/if}
        {/if}

        {#if open.length === 0 && done.length === 0}
          <p class="muted" style="margin:0">{$t('shopping.empty')}</p>
        {/if}
        <ul class="items">
          {#each open as item (item.id)}{@render itemRow(item)}{/each}
        </ul>
        {#if done.length > 0}
          <div class="row" style="justify-content: space-between">
            <span class="muted">{$t('shopping.boughtCount', { count: done.length })}</span>
            {#if canEdit}<button onclick={() => run(() => clearChecked(groupId, list!.id))} disabled={busy}>{$t('shopping.clearBought')}</button>{/if}
          </div>
          <ul class="items">
            {#each done as item (item.id)}{@render itemRow(item)}{/each}
          </ul>
        {/if}
        {#if error}<p class="muted" style="color: var(--danger); margin:0">{error}</p>{/if}
      </div>
    {/if}

    {#if repeating.length > 0}
      <div class="card stack">
        <h3 style="margin:0">🔁 {$t('shopping.repeating')}</h3>
        <p class="muted" style="margin:0">{$t('shopping.repeatingHint')}</p>
        <ul class="items">
          {#each repeating as r (r.id)}
            <li>
              <span class="name">
                <span>{r.name}</span>
                <span class="muted">
                  · {$t('shopping.repeats', { days: r.days })}
                  · {$shoppingLists.find((l) => l.id === r.listId)?.name ?? '?'}
                  {#if r.lastBoughtAt}· {$t('shopping.backOn', { date: restockDue(r.lastBoughtAt, r.days) })}{/if}
                </span>
              </span>
              {#if canEdit}
                <button class="icon" onclick={() => stopRepeat(r.id, r.name)} title={$t('shopping.stopRepeat')} aria-label={$t('shopping.stopRepeat')}>×</button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    padding: 0.3em 0.8em;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 0.92em;
    text-decoration: none;
    color: var(--text);
  }
  .chip.on {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .count {
    opacity: 0.75;
    font-size: 0.85em;
  }
  .add {
    align-items: flex-start;
  }
  .note-in {
    flex: 0 1 9rem;
    width: auto;
    min-width: 6rem;
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.2rem;
    border-bottom: 1px solid var(--border);
  }
  .items li:last-child {
    border-bottom: none;
  }
  .items li.edit {
    display: block;
    padding: 0.5rem 0.2rem 0.75rem;
  }
  .tick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
  }
  .tick input {
    width: 1.2rem;
    height: 1.2rem;
    flex: 0 0 auto;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: baseline;
  }
  li.done .name > span:first-child {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .icon {
    padding: 0.2em 0.55em;
    flex: 0 0 auto;
  }
  .field {
    gap: 0.25rem;
  }
  .hint {
    font-size: 0.85em;
  }
</style>
