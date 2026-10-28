<script lang="ts">
  import { t } from '../../lib/i18n';
  import { COMMON_UNITS } from '../../lib/storage/systemCatalog';
  import type { StorageLevel } from '../../lib/types';

  // Exact amount + unit, or a vague level — the ≈ button flips between them.
  let {
    qtyMode = $bindable<'count' | 'level'>('count'),
    amount = $bindable<number | undefined>(1),
    unit = $bindable(''),
    level = $bindable<StorageLevel>('some'),
  }: {
    qtyMode?: 'count' | 'level';
    amount?: number | undefined;
    unit?: string;
    level?: StorageLevel;
  } = $props();

  const LEVELS: StorageLevel[] = ['plenty', 'some', 'low', 'empty'];
</script>

<div class="qty row">
  {#if qtyMode === 'count'}
    <input type="number" min="0" step="any" class="amount" bind:value={amount} aria-label={$t('storage.amount')} />
    <input class="unit" list="storage-units" bind:value={unit} placeholder={$t('storage.unitPlaceholder')} aria-label={$t('storage.unitOfMeasure')} />
    <datalist id="storage-units">
      {#each COMMON_UNITS as u (u)}<option value={u}></option>{/each}
    </datalist>
  {:else}
    <select bind:value={level} aria-label={$t('storage.level')}>
      {#each LEVELS as l (l)}<option value={l}>{$t(`storage.qty.${l}`)}</option>{/each}
    </select>
  {/if}
  <button
    type="button"
    class="mode"
    title={qtyMode === 'count' ? $t('storage.switchToLevel') : $t('storage.switchToCount')}
    aria-label={qtyMode === 'count' ? $t('storage.switchToLevel') : $t('storage.switchToCount')}
    onclick={() => (qtyMode = qtyMode === 'count' ? 'level' : 'count')}
  >{qtyMode === 'count' ? '≈' : '#'}</button>
</div>

<style>
  .qty {
    flex-wrap: nowrap;
    gap: 0.3rem;
  }
  .amount {
    width: 5em !important;
  }
  .unit {
    width: 5.5em !important;
  }
  select {
    width: 8em !important;
  }
  .mode {
    padding: 0.5em 0.7em;
  }
</style>
