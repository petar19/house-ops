<script lang="ts">
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { SINGLE, coveredCellIds, fullPlaceLabel, spanAround, spanBetween } from '../../lib/storage/layout';
  import type { StoragePlacement, StorageSpan, StorageUnit } from '../../lib/types';
  import UnitGrid from './UnitGrid.svelte';
  import UnitPicker from './UnitPicker.svelte';

  // Pick where in one of `targets` to put a container — and how much room it
  // takes, like an item's Space picker: tap a cell, then tap another to
  // stretch it over everything in between (a big bag over both depths, a
  // tall box over two layers); Ctrl/⌘+click grows it to include each cell
  // clicked. Opened on the unit it already sits in, it starts from its
  // current spot, so this also resizes it.
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

  type Box = { cellId: string; span: StorageSpan };
  const isSingle = (b: Box | null) => !b || (b.span.levels === 1 && b.span.rows === 1 && b.span.cols === 1);

  // svelte-ignore state_referenced_locally
  const startHere = !!current && targets.some((u) => u.id === current!.unitId);
  // svelte-ignore state_referenced_locally
  let unitId = $state(startHere ? current!.unitId : (targets[0]?.id ?? ''));
  // svelte-ignore state_referenced_locally
  let box = $state<Box | null>(startHere ? { cellId: current!.cellId, span: current!.span ?? SINGLE } : null);
  // The corner a plain second tap stretches from.
  // svelte-ignore state_referenced_locally
  let anchor = $state<string | null>(startHere ? current!.cellId : null);
  let unit = $derived(targets.find((u) => u.id === unitId) ?? null);

  // svelte-ignore state_referenced_locally
  let lastUnit = unitId;
  $effect(() => {
    if (unitId === lastUnit) return;
    lastUnit = unitId;
    box = null;
    anchor = null;
  });

  let covered = $derived(box ? new Set(coveredCellIds(box.cellId, box.span)) : new Set<string>());

  function pick(id: string, e: MouseEvent) {
    if ((e.ctrlKey || e.metaKey) && box) {
      box = spanAround([...covered, id]);
      anchor = box.cellId;
    } else if (anchor && isSingle(box) && id !== anchor) {
      box = spanBetween(anchor, id);
    } else {
      anchor = id;
      box = { cellId: id, span: SINGLE };
    }
  }
</script>

<div class="stack">
  {#if targets.length === 0}
    <p class="muted" style="margin:0">{$t('storage.noPlaceTargets')}</p>
  {:else}
    <UnitPicker units={targets} bind:value={unitId} />
    {#if unit}
      <span class="muted">{$t(box && isSingle(box) ? 'storage.placeHintStretch' : 'storage.placeHint')}</span>
      <UnitGrid
        {unit}
        items={$storageItems.filter((i) => i.unitId === unit!.id)}
        containers={$storageUnits.filter((c) => c.parent?.unitId === unit!.id)}
        compact
        selected={anchor}
        highlight={covered}
        onPick={pick}
      />
      {#if box}
        <div class="row">
          <span class="muted">{fullPlaceLabel($storageUnits, unit.id, box.cellId, $t, box.span)}</span>
          {#if !isSingle(box)}
            <button type="button" onclick={() => box && (box = { cellId: anchor ?? box.cellId, span: SINGLE })}>{$t('storage.spaceReset')}</button>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
  <div class="row">
    <button
      class="primary"
      disabled={busy || !unit || !box}
      onclick={() => unit && box && onConfirm({ unitId: unit.id, cellId: box.cellId, span: isSingle(box) ? null : box.span })}
    >{$t('storage.putHere')}</button>
    <button onclick={onCancel}>{$t('common.cancel')}</button>
  </div>
</div>
