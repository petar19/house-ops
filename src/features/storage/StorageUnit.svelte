<script lang="ts">
  import { link, push, router } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import { catalogOptions, storageItems, storageLoading, storageUnits } from '../../lib/stores/storage';
  import { KIND_ICONS, cellExists, cellLabel, coveredCellIds, levelLabel, parseCellId, spanOf } from '../../lib/storage/layout';
  import { searchItems } from '../../lib/storage/suggest';
  import Modal from '../../lib/components/Modal.svelte';
  import CellPanel from './CellPanel.svelte';
  import StorageHistory from './StorageHistory.svelte';
  import UnitEditor from './UnitEditor.svelte';
  import UnitGrid from './UnitGrid.svelte';

  let { params }: { params: { unitId: string } } = $props();

  let unit = $derived($storageUnits.find((u) => u.id === params.unitId) ?? null);
  let unitItems = $derived($storageItems.filter((i) => i.unitId === params.unitId));

  // Arriving from a search result: ?cell= opens that cell, ?q= keeps the
  // matches highlighted.
  const initial = new URLSearchParams(router.querystring ?? '');
  let q = $state(initial.get('q') ?? '');
  let openCellId = $state<string | null>(initial.get('cell'));
  let editing = $state(false);
  let showHistory = $state(false);

  // A history entry in this unit just opens the cell here; one that now
  // lives in another unit navigates there.
  function openFromHistory(unitId: string, cellId: string) {
    showHistory = false;
    if (unitId === params.unitId) openCellId = cellId;
    else push(`/storage/${unitId}?cell=${cellId}`);
  }

  let matches = $derived(searchItems(q, unitItems, $catalogOptions));
  let matchIds = $derived(new Set(matches.map((i) => i.id)));
  let highlightCells = $derived(new Set(matches.flatMap((i) => coveredCellIds(i.cellId, spanOf(i)))));

  let cellTitle = $derived.by(() => {
    if (!unit || !openCellId) return '';
    const p = parseCellId(openCellId);
    const parts = [p ? levelLabel(unit, p.level, $t) : '', cellLabel(unit, openCellId, $t)].filter(Boolean);
    return parts.join(' › ');
  });
</script>

<div class="page stack">
  <a href="/storage" use:link class="muted back">← {$t('storage.title')}</a>

  {#if !$activeGroup?.capabilities.storage}
    <p class="muted">{$t('storage.capabilityOff')}</p>
  {:else if !unit}
    <p class="muted">{$storageLoading ? $t('common.loading') : $t('storage.unitNotFound')}</p>
  {:else}
    <div class="row" style="justify-content: space-between">
      <h2 style="margin:0">{KIND_ICONS[unit.kind]} {unit.name}</h2>
      <div class="row">
        <button onclick={() => (showHistory = true)}>🕘 {$t('storage.unitHistory')}</button>
        <button onclick={() => (editing = true)}>✎ {$t('common.edit')}</button>
      </div>
    </div>

    <input type="search" bind:value={q} placeholder={$t('storage.filterPlaceholder')} />
    {#if q.trim()}
      <p class="muted" style="margin:0">{$t('storage.matchesHere', { count: matches.length })}</p>
    {/if}

    <div class="card">
      <UnitGrid {unit} items={unitItems} highlight={highlightCells} onPick={(id) => (openCellId = id)} />
    </div>
  {/if}
</div>

{#if unit}
  <Modal open={!!openCellId && cellExists(unit, openCellId)} onClose={() => (openCellId = null)} title={cellTitle}>
    {#snippet children()}
      {#key openCellId}
        <CellPanel {unit} cellId={openCellId!} highlightIds={matchIds} />
      {/key}
    {/snippet}
  </Modal>

  <Modal open={showHistory} onClose={() => (showHistory = false)} title={$t('storage.unitHistoryTitle', { name: unit.name })}>
    {#snippet children()}
      <StorageHistory unitId={unit.id} onOpenCell={openFromHistory} />
    {/snippet}
  </Modal>

  <Modal open={editing} onClose={() => (editing = false)} title={$t('storage.editUnit')}>
    {#snippet children()}
      <UnitEditor
        {unit}
        onDone={() => (editing = false)}
        onDeleted={() => {
          editing = false;
          push('/storage');
        }}
      />
    {/snippet}
  </Modal>
{/if}

<style>
  .back {
    text-decoration: none;
  }
</style>
