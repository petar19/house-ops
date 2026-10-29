<script lang="ts">
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { coveredOf, fullPlaceLabel, placementOf } from '../../lib/storage/layout';
  import type { StoragePlacement, StorageUnit } from '../../lib/types';
  import UnitGrid from './UnitGrid.svelte';
  import UnitPicker from './UnitPicker.svelte';

  // Pick where in one of `targets` to put a container, and exactly which
  // cells it takes up: each tap adds or removes that one cell (a big bag
  // over both depths, a tall box over two layers, an L — any shape).
  // Opened on the unit it already sits in, it starts from its current
  // cells, so this also resizes it.
  let {
    targets,
    current = null,
    busy = false,
    onConfirm,
    onCancel,
  }: {
    targets: StorageUnit[];
    current?: StoragePlacement | null;
    busy?: boolean;
    onConfirm: (placement: StoragePlacement) => void;
    onCancel: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const startHere = !!current && targets.some((u) => u.id === current!.unitId);
  // svelte-ignore state_referenced_locally
  let unitId = $state(startHere ? current!.unitId : (targets[0]?.id ?? ''));
  // svelte-ignore state_referenced_locally
  let picked = $state<Set<string>>(new Set(startHere ? coveredOf(current!) : []));
  let unit = $derived(targets.find((u) => u.id === unitId) ?? null);

  // svelte-ignore state_referenced_locally
  let lastUnit = unitId;
  $effect(() => {
    if (unitId === lastUnit) return;
    lastUnit = unitId;
    picked = new Set();
  });

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    picked = next;
  }

  let placement = $derived(picked.size > 0 ? placementOf(picked) : null);
</script>

<div class="stack">
  {#if targets.length === 0}
    <p class="muted" style="margin:0">{$t('storage.noPlaceTargets')}</p>
  {:else}
    <UnitPicker units={targets} bind:value={unitId} />
    {#if unit}
      <span class="muted">{$t('storage.placeHint')}</span>
      <UnitGrid
        {unit}
        items={$storageItems.filter((i) => i.unitId === unit!.id)}
        containers={$storageUnits.filter((c) => c.parent?.unitId === unit!.id)}
        compact
        highlight={picked}
        onPick={toggle}
      />
      {#if placement}
        <div class="row">
          <span class="muted">{fullPlaceLabel($storageUnits, unit.id, placement.cellId, $t, placement.cells)}</span>
          {#if picked.size > 1}
            <button type="button" onclick={() => (picked = new Set())}>{$t('picker.clear')}</button>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
  <div class="row">
    <button
      class="primary"
      disabled={busy || !unit || !placement}
      onclick={() => unit && placement && onConfirm({ unitId: unit.id, cellId: placement.cellId, cells: placement.cells, span: null })}
    >{$t('storage.putHere')}</button>
    <button onclick={onCancel}>{$t('common.cancel')}</button>
  </div>
</div>
