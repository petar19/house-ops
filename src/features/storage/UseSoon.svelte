<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { expiringSoon } from '../../lib/storage/expiry';
  import { formatQty, fullPlaceLabel, isRoom, shapeOf } from '../../lib/storage/layout';
  import { toIso } from '../../lib/utils/date';

  // Things with an expiry date in the next `within` days, or already past —
  // on the Storage page and the home page.
  let { within = 7, limit = 8 }: { within?: number; limit?: number } = $props();

  let all = $derived(expiringSoon($storageItems, toIso(new Date()), within));
  let showAll = $state(false);
  let shown = $derived(showAll ? all : all.slice(0, limit));

  function when(days: number): string {
    if (days < 0) return $t('expiry.expired', { days: -days });
    if (days === 0) return $t('expiry.today');
    if (days === 1) return $t('expiry.tomorrow');
    return $t('expiry.inDays', { days });
  }
  function open(unitId: string, cellId: string) {
    const room = isRoom($storageUnits.find((u) => u.id === unitId));
    push(`/storage/${unitId}${room ? '' : `?cell=${cellId}`}`);
  }
</script>

{#if all.length > 0}
  <div class="card stack">
    <h3 style="margin:0">⏳ {$t('expiry.useSoon')}</h3>
    <div class="list">
      {#each shown as { item, days } (item.id)}
        <button class="row-btn" onclick={() => open(item.unitId, item.cellId)}>
          <span class="row" style="justify-content: space-between; flex-wrap: nowrap">
            <strong>{item.name} <span class="muted qty">{formatQty(item, $t)}</span></strong>
            <span class="when" class:past={days < 0} class:near={days >= 0 && days <= 1}>{when(days)}</span>
          </span>
          <span class="muted">{fullPlaceLabel($storageUnits, item.unitId, item.cellId, $t, shapeOf(item))}</span>
        </button>
      {/each}
    </div>
    {#if all.length > limit}
      <button onclick={() => (showAll = !showAll)}>{showAll ? $t('expiry.showLess') : $t('expiry.showAll', { count: all.length })}</button>
    {/if}
  </div>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
  }
  .row-btn {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding: 0.45rem 0.25rem;
    background: none;
  }
  .row-btn:last-child {
    border-bottom: none;
  }
  .qty {
    font-weight: normal;
  }
  .when {
    white-space: nowrap;
  }
  .near {
    color: var(--warning, #d97706);
  }
  .past {
    color: var(--danger);
  }
</style>
