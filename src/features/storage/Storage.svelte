<script lang="ts">
  import { link, push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import { catalogOptions, storageItems, storageLoading, storageUnits } from '../../lib/stores/storage';
  import { formatQty, isLow, isRoom, makePlaceOf, unitIcon, unitLocationLabel } from '../../lib/storage/layout';
  import { matchQuality } from '../../lib/storage/suggest';
  import { searchItems } from '../../lib/storage/suggest';
  import Modal from '../../lib/components/Modal.svelte';
  import UnitEditor from './UnitEditor.svelte';
  import type { StorageUnitKind } from '../../lib/types';
  import UnitCard from './UnitCard.svelte';

  let q = $state('');
  let creating = $state<StorageUnitKind | null>(null);

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  // Grouped by room: each room's own units as cards, then whatever isn't in a
  // room yet. Units sitting inside other units show up there, not here.
  let rooms = $derived($storageUnits.filter((u) => isRoom(u)).sort(byName));
  // Unsorted gets its own banner (below) rather than a card among the rest.
  let noRoom = $derived($storageUnits.filter((u) => !u.parent && !isRoom(u) && !u.inbox).sort(byName));
  let unsorted = $derived($storageUnits.find((u) => u.inbox) ?? null);
  let unsortedCount = $derived(unsorted ? $storageItems.filter((i) => i.unitId === unsorted!.id).length : 0);
  let roomFilter = $state<string>('all'); // 'all' | 'none' | a room id
  let shownRooms = $derived(roomFilter === 'all' ? rooms : rooms.filter((r) => r.id === roomFilter));
  let showNoRoom = $derived((roomFilter === 'all' || roomFilter === 'none') && noRoom.length > 0);
  function inRoom(roomId: string) {
    return $storageUnits.filter((u) => u.parent?.unitId === roomId).sort(byName);
  }
  function looseCount(roomId: string) {
    return $storageItems.filter((i) => i.unitId === roomId).length;
  }
  let containerResults = $derived(
    q.trim() ? $storageUnits.filter((u) => matchQuality(q, u.name) > 0).sort((a, b) => a.name.localeCompare(b.name)) : [],
  );
  let placeOf = $derived(makePlaceOf($storageUnits, $t));
  let results = $derived(
    searchItems(q, $storageItems, $catalogOptions).sort((a, b) => a.name.localeCompare(b.name)),
  );

  function openCell(unitId: string, cellId: string) {
    // A room shows its loose things right on its page — no cell to open.
    const params = new URLSearchParams(isRoom($storageUnits.find((u) => u.id === unitId)) ? {} : { cell: cellId });
    if (q.trim()) params.set('q', q.trim());
    push(`/storage/${unitId}?${params}`);
  }
</script>

<div class="page stack">
  <div class="row" style="justify-content: space-between">
    <h2 style="margin:0">{$t('storage.title')}</h2>
    {#if $myAccess.storage !== 'none'}
      <div class="row">
        <a href="/storage/products" use:link class="button-link">🏷️ {$t('products.title')}</a>
        <a href="/storage/history" use:link class="button-link">🕘 {$t('storage.historyTitle')}</a>
        {#if $myAccess.storage === 'edit'}
          <a href="/storage/import" use:link class="button-link">📥 {$t('import.title')}</a>
          <button onclick={() => (creating = 'room')}>+ {$t('storage.newRoom')}</button>
          <button class="primary" onclick={() => (creating = 'shelving')}>+ {$t('storage.newUnit')}</button>
        {/if}
      </div>
    {/if}
  </div>

  {#if !$activeGroup}
    <p class="muted">{$t('exportImport.pickGroup')}</p>
  {:else if !$activeGroup.capabilities.storage}
    <p class="muted">{$t('storage.capabilityOff')}</p>
  {:else if $myAccess.storage === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else}
    <input type="search" bind:value={q} placeholder={$t('storage.searchPlaceholder')} />

    {#if unsorted && unsortedCount > 0 && !q.trim()}
      <a href="/storage/{unsorted.id}" use:link class="card unsorted">
        <span>📥 <strong>{unsorted.name}</strong></span>
        <span>{$t('inbox.banner', { count: unsortedCount })} ›</span>
      </a>
    {/if}

    {#if q.trim()}
      <div class="card stack">
        {#each containerResults as c (c.id)}
          <button class="result" onclick={() => push(`/storage/${c.id}`)}>
            <strong>{unitIcon(c)} {c.name}</strong>
            <span class="muted">{unitLocationLabel($storageUnits, c, $t) ?? $t('storage.noRoom')}</span>
          </button>
        {/each}
        {#if results.length === 0 && containerResults.length === 0}
          <p class="muted" style="margin:0">{$t('storage.noResults')}</p>
        {:else}
          {#each results as item (item.id)}
            <button class="result" onclick={() => openCell(item.unitId, item.cellId)}>
              <span class="row" style="justify-content: space-between; flex-wrap: nowrap">
                <strong class:low={isLow(item)}>{item.name}</strong>
                <span class="muted">{formatQty(item, $t)}</span>
              </span>
              <span class="muted">{placeOf(item.unitId, item.cellId, item.span)}</span>
            </button>
          {/each}
        {/if}
      </div>
    {:else if $storageLoading}
      <p class="muted">{$t('common.loading')}</p>
    {:else if $storageUnits.length === 0}
      <div class="card stack">
        <p style="margin:0">{$t('storage.noUnits')}</p>
        <p class="muted" style="margin:0">{$t('storage.noUnitsHint')}</p>
      </div>
    {:else}
      {#if rooms.length > 0}
        <div class="chips">
          <button class="chip" class:on={roomFilter === 'all'} onclick={() => (roomFilter = 'all')}>{$t('storage.allRooms')}</button>
          {#each rooms as r (r.id)}
            <button class="chip" class:on={roomFilter === r.id} onclick={() => (roomFilter = r.id)}>{unitIcon(r)} {r.name}</button>
          {/each}
          {#if noRoom.length > 0}
            <button class="chip" class:on={roomFilter === 'none'} onclick={() => (roomFilter = 'none')}>{$t('storage.noRoom')}</button>
          {/if}
        </div>
      {/if}

      {#each shownRooms as room (room.id)}
        {@const units = inRoom(room.id)}
        {@const loose = looseCount(room.id)}
        <section class="stack">
          <div class="row" style="justify-content: space-between">
            <a href="/storage/{room.id}" use:link class="room-title">{unitIcon(room)} {room.name} ›</a>
            {#if loose > 0}<span class="muted">{$t('storage.looseCount', { count: loose })}</span>{/if}
          </div>
          {#if units.length === 0 && loose === 0}
            <p class="muted" style="margin:0">{$t('storage.roomEmpty')}</p>
          {/if}
          {#each units as unit (unit.id)}
            <UnitCard {unit} onOpenCell={openCell} />
          {/each}
        </section>
      {/each}

      {#if showNoRoom}
        <section class="stack">
          {#if rooms.length > 0}<h3 class="room-title" style="margin:0">{$t('storage.noRoom')}</h3>{/if}
          {#each noRoom as unit (unit.id)}
            <UnitCard {unit} onOpenCell={openCell} />
          {/each}
        </section>
      {/if}
    {/if}
  {/if}
</div>

<Modal
  open={!!creating}
  onClose={() => (creating = null)}
  title={creating === 'room' ? $t('storage.newRoom') : $t('storage.newUnit')}
>
  {#snippet children()}
    {#key creating}
      <UnitEditor
        initialKind={creating}
        onDone={(id) => {
          creating = null;
          push(`/storage/${id}`);
        }}
      />
    {/key}
  {/snippet}
</Modal>

<style>
  .button-link {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.55em 1em;
    text-decoration: none;
    color: var(--text);
    background: var(--surface);
  }
  .unsorted {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--text);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }
  .room-title {
    font-weight: 700;
    font-size: 1.1em;
    text-decoration: none;
    color: var(--text);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    padding: 0.3em 0.75em;
    border-radius: 999px;
    font-size: 0.88em;
  }
  .chip.on {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .result {
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
  .result:last-child {
    border-bottom: none;
  }
  .low {
    color: var(--danger);
  }
</style>
