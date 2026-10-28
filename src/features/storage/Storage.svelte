<script lang="ts">
  import { link, push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import { catalogOptions, storageItems, storageLoading, storageUnits } from '../../lib/stores/storage';
  import { KIND_ICONS, formatQty, isLow, makePlaceOf } from '../../lib/storage/layout';
  import { searchItems } from '../../lib/storage/suggest';
  import Modal from '../../lib/components/Modal.svelte';
  import UnitEditor from './UnitEditor.svelte';
  import UnitGrid from './UnitGrid.svelte';

  let q = $state('');
  let creating = $state(false);

  let units = $derived([...$storageUnits].sort((a, b) => a.name.localeCompare(b.name)));
  let placeOf = $derived(makePlaceOf($storageUnits, $t));
  let results = $derived(
    searchItems(q, $storageItems, $catalogOptions).sort((a, b) => a.name.localeCompare(b.name)),
  );

  function openCell(unitId: string, cellId: string) {
    const params = new URLSearchParams({ cell: cellId });
    if (q.trim()) params.set('q', q.trim());
    push(`/storage/${unitId}?${params}`);
  }
</script>

<div class="page stack">
  <div class="row" style="justify-content: space-between">
    <h2 style="margin:0">{$t('storage.title')}</h2>
    {#if $activeGroup?.capabilities.storage}
      <div class="row">
        <a href="/storage/history" use:link class="button-link">🕘 {$t('storage.historyTitle')}</a>
        <button class="primary" onclick={() => (creating = true)}>+ {$t('storage.newUnit')}</button>
      </div>
    {/if}
  </div>

  {#if !$activeGroup}
    <p class="muted">{$t('exportImport.pickGroup')}</p>
  {:else if !$activeGroup.capabilities.storage}
    <p class="muted">{$t('storage.capabilityOff')}</p>
  {:else}
    <input type="search" bind:value={q} placeholder={$t('storage.searchPlaceholder')} />

    {#if q.trim()}
      <div class="card stack">
        {#if results.length === 0}
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
    {:else if units.length === 0}
      <div class="card stack">
        <p style="margin:0">{$t('storage.noUnits')}</p>
        <p class="muted" style="margin:0">{$t('storage.noUnitsHint')}</p>
      </div>
    {:else}
      {#each units as unit (unit.id)}
        {@const unitItems = $storageItems.filter((i) => i.unitId === unit.id)}
        {@const lowCount = unitItems.filter(isLow).length}
        <div class="card stack">
          <div class="row" style="justify-content: space-between">
            <a href="/storage/{unit.id}" use:link class="unit-title">{KIND_ICONS[unit.kind]} {unit.name}</a>
            <span class="muted">
              {$t('storage.itemCount', { count: unitItems.length })}
              {#if lowCount > 0}· <span class="low">{$t('storage.lowCount', { count: lowCount })}</span>{/if}
            </span>
          </div>
          <UnitGrid {unit} items={unitItems} compact onPick={(cellId) => openCell(unit.id, cellId)} />
        </div>
      {/each}
    {/if}
  {/if}
</div>

<Modal open={creating} onClose={() => (creating = false)} title={$t('storage.newUnit')}>
  {#snippet children()}
    <UnitEditor
      onDone={(id) => {
        creating = false;
        push(`/storage/${id}`);
      }}
    />
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
  .unit-title {
    font-weight: 600;
    text-decoration: none;
    color: var(--text);
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
