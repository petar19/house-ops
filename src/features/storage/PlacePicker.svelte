<script lang="ts">
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { fullPlaceLabel, spanFits } from '../../lib/storage/layout';
  import type { StoragePlacement, StorageSpan, StorageUnit } from '../../lib/types';
  import UnitGrid from './UnitGrid.svelte';
  import UnitPicker from './UnitPicker.svelte';

  // Pick a cell in one of `targets` to put a container into. The container's
  // own span (if it takes up several cells) has to fit from the picked cell.
  let {
    targets,
    span = null,
    busy = false,
    onConfirm,
    onCancel,
  }: {
    targets: StorageUnit[];
    span?: StorageSpan | null;
    busy?: boolean;
    onConfirm: (placement: StoragePlacement) => void;
    onCancel: () => void;
  } = $props();

  let sorted = $derived([...targets].sort((a, b) => a.name.localeCompare(b.name)));
  // svelte-ignore state_referenced_locally
  let unitId = $state(targets[0]?.id ?? '');
  let cellId = $state<string | null>(null);
  let unit = $derived(targets.find((u) => u.id === unitId) ?? null);
  $effect(() => {
    void unitId;
    cellId = null;
  });
  let fits = $derived(!!unit && !!cellId && spanFits(unit, cellId, span ?? undefined));
</script>

<div class="stack">
  {#if sorted.length === 0}
    <p class="muted" style="margin:0">{$t('storage.noPlaceTargets')}</p>
  {:else}
    <UnitPicker units={targets} bind:value={unitId} />
    {#if unit}
      <UnitGrid
        {unit}
        items={$storageItems.filter((i) => i.unitId === unit!.id)}
        containers={$storageUnits.filter((c) => c.parent?.unitId === unit!.id)}
        compact
        selected={cellId}
        onPick={(id) => (cellId = id)}
      />
      {#if cellId}
        <span class="muted">
          {fits ? fullPlaceLabel($storageUnits, unit.id, cellId, $t, span) : $t('storage.doesNotFit')}
        </span>
      {/if}
    {/if}
  {/if}
  <div class="row">
    <button
      class="primary"
      disabled={busy || !fits}
      onclick={() => unit && cellId && onConfirm({ unitId: unit.id, cellId, span: span ?? null })}
    >{$t('storage.putHere')}</button>
    <button onclick={onCancel}>{$t('common.cancel')}</button>
  </div>
</div>
