<script lang="ts">
  import { link, push, router } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroupId, activeGroupResolvedId, myAccess, myGroups, myGroupsLoading } from '../../lib/stores/groups';
  import { catalogOptions, storageItems, storageLoading, storageUnits } from '../../lib/stores/storage';
  import {
    cellExists,
    cellLabel,
    coveredCellIds,
    levelLabel,
    isRoom,
    parseCellId,
    spanOf,
    unitIcon,
    unitLocationLabel,
  } from '../../lib/storage/layout';
  import { searchItems } from '../../lib/storage/suggest';
  import Modal from '../../lib/components/Modal.svelte';
  import CellPanel from './CellPanel.svelte';
  import InboxView from './InboxView.svelte';
  import RoomView from './RoomView.svelte';
  import ShareLabel from './ShareLabel.svelte';
  import StorageHistory from './StorageHistory.svelte';
  import UnitEditor from './UnitEditor.svelte';
  import UnitGrid from './UnitGrid.svelte';

  let { params }: { params: { unitId: string } } = $props();

  let unit = $derived($storageUnits.find((u) => u.id === params.unitId) ?? null);
  let unitItems = $derived($storageItems.filter((i) => i.unitId === params.unitId));
  let innerContainers = $derived($storageUnits.filter((u) => u.parent?.unitId === params.unitId));
  let location = $derived(unit ? unitLocationLabel($storageUnits, unit, $t) : null);
  // Link back up to where this unit sits: a room is just its page, a cell
  // of another unit opens that cell.
  let parentHref = $derived.by(() => {
    const parent = unit?.parent;
    if (!parent) return '';
    const parentUnit = $storageUnits.find((u) => u.id === parent.unitId);
    return isRoom(parentUnit) ? `/storage/${parent.unitId}` : `/storage/${parent.unitId}?cell=${parent.cellId}`;
  });
  let sharing = $state(false);
  let shareCell = $state<string | null>(null);

  // Shared links (and QR/NFC labels) carry ?group= so they open in the right
  // group even if you were last looking at another one.
  let linkGroup = $derived(new URLSearchParams(router.querystring ?? '').get('group'));
  let notInLinkGroup = $derived(!!linkGroup && !$myGroupsLoading && !$myGroups.some((g) => g.id === linkGroup));
  $effect(() => {
    if (linkGroup && $myGroups.some((g) => g.id === linkGroup) && $activeGroupResolvedId !== linkGroup) {
      activeGroupId.set(linkGroup);
    }
  });

  // Going from one unit straight to another (opening a container, a history
  // entry elsewhere) reuses this page — start fresh for the new unit.
  // svelte-ignore state_referenced_locally
  let shownUnitId = params.unitId;
  $effect(() => {
    if (params.unitId === shownUnitId) return;
    shownUnitId = params.unitId;
    const query = new URLSearchParams(router.querystring ?? '');
    openCellId = query.get('cell');
    q = query.get('q') ?? '';
    editing = false;
    showHistory = false;
    sharing = false;
  });

  // Arriving from a search result: ?cell= opens that cell, ?q= keeps the
  // matches highlighted.
  const initial = new URLSearchParams(router.querystring ?? '');
  let q = $state(initial.get('q') ?? '');
  let openCellId = $state<string | null>(initial.get('cell'));
  let editing = $state(false);
  let readonly = $derived($myAccess.storage !== 'edit');
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

  {#if notInLinkGroup}
    <p class="muted">{$t('share.notInGroup')}</p>
  {:else if $myAccess.storage === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else if !unit}
    <p class="muted">{$storageLoading ? $t('common.loading') : $t('storage.unitNotFound')}</p>
  {:else}
    {#if unit.parent && location}
      <a href={parentHref} use:link class="muted inside">📍 {location}</a>
    {/if}
    <div class="row" style="justify-content: space-between">
      <h2 style="margin:0">{unitIcon(unit)} {unit.name}</h2>
      <div class="row">
        <button onclick={() => ((shareCell = null), (sharing = true))}>🔗 {$t('share.share')}</button>
        <button onclick={() => (showHistory = true)}>🕘 {$t('storage.unitHistory')}</button>
        {#if readonly}
          <span class="muted">{$t('access.viewOnly')}</span>
        {:else}
          <button onclick={() => (editing = true)}>✎ {$t('common.edit')}</button>
        {/if}
      </div>
    </div>

    {#if isRoom(unit)}
      <RoomView room={unit} {readonly} />
    {:else if unit.inbox}
      <InboxView {unit} {readonly} />
    {:else}
    <input type="search" bind:value={q} placeholder={$t('storage.filterPlaceholder')} />
    {#if q.trim()}
      <p class="muted" style="margin:0">{$t('storage.matchesHere', { count: matches.length })}</p>
    {/if}

    <div class="card">
      <UnitGrid {unit} items={unitItems} containers={innerContainers} highlight={highlightCells} onPick={(id) => (openCellId = id)} />
    </div>
    {/if}
  {/if}
</div>

{#if unit}
  <Modal open={!!openCellId && !isRoom(unit) && !unit.inbox && cellExists(unit, openCellId)} onClose={() => (openCellId = null)} title={cellTitle}>
    {#snippet children()}
      {#key openCellId}
        <CellPanel
          {unit}
          cellId={openCellId!}
          highlightIds={matchIds}
          {readonly}
          onShare={() => {
            shareCell = openCellId;
            openCellId = null;
            sharing = true;
          }}
        />
      {/key}
    {/snippet}
  </Modal>

  <Modal open={showHistory} onClose={() => (showHistory = false)} title={$t('storage.unitHistoryTitle', { name: unit.name })}>
    {#snippet children()}
      <StorageHistory unitId={unit.id} onOpenCell={openFromHistory} />
    {/snippet}
  </Modal>

  <Modal open={sharing} onClose={() => (sharing = false)} title={$t('share.title')}>
    {#snippet children()}
      <ShareLabel {unit} groupId={$activeGroupResolvedId ?? ''} cellId={shareCell} />
    {/snippet}
  </Modal>

  <Modal open={editing && !readonly} onClose={() => (editing = false)} title={$t('storage.editUnit')}>
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
  .back,
  .inside {
    text-decoration: none;
  }
</style>
