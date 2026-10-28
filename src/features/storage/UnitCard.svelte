<script lang="ts">
  import { link } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { isLow, unitIcon } from '../../lib/storage/layout';
  import type { StorageUnit } from '../../lib/types';
  import UnitGrid from './UnitGrid.svelte';

  // One unit as a card: name, counts, and its grid in miniature — tapping a
  // cell opens it. Used on the Storage page and on room pages.
  let { unit, onOpenCell }: { unit: StorageUnit; onOpenCell: (unitId: string, cellId: string) => void } = $props();

  let items = $derived($storageItems.filter((i) => i.unitId === unit.id));
  let containers = $derived($storageUnits.filter((c) => c.parent?.unitId === unit.id));
  let lowCount = $derived(items.filter(isLow).length);
</script>

<div class="card stack">
  <div class="row" style="justify-content: space-between">
    <a href="/storage/{unit.id}" use:link class="unit-title">{unitIcon(unit)} {unit.name}</a>
    <span class="muted">
      {$t('storage.itemCount', { count: items.length + containers.length })}
      {#if lowCount > 0}· <span class="low">{$t('storage.lowCount', { count: lowCount })}</span>{/if}
    </span>
  </div>
  <UnitGrid {unit} {items} {containers} compact onPick={(cellId) => onOpenCell(unit.id, cellId)} />
</div>

<style>
  .unit-title {
    font-weight: 600;
    text-decoration: none;
    color: var(--text);
  }
  .low {
    color: var(--danger);
  }
</style>
