<script lang="ts">
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { unitIcon, unitLocationLabel } from '../../lib/storage/layout';
  import { matchQuality } from '../../lib/storage/suggest';
  import type { StorageUnit } from '../../lib/types';

  // Choosing which unit to move something into, once there are too many for
  // a dropdown: search by name or by where it sits ("garage"), and the units
  // whose contents changed most recently first — so wherever you've just
  // been putting things away is at the top.
  let { units, value = $bindable('') }: { units: StorageUnit[]; value?: string } = $props();

  let q = $state('');

  let lastUsed = $derived.by(() => {
    const map = new Map<string, number>();
    for (const item of $storageItems) map.set(item.unitId, Math.max(map.get(item.unitId) ?? 0, item.updatedAt ?? 0));
    return map;
  });

  let entries = $derived(
    units.map((u) => ({ unit: u, where: unitLocationLabel($storageUnits, u, $t) ?? '', used: lastUsed.get(u.id) ?? u.createdAt ?? 0 })),
  );

  let shown = $derived.by(() => {
    if (!q.trim()) return [...entries].sort((a, b) => b.used - a.used || a.unit.name.localeCompare(b.unit.name));
    return entries
      .map((e) => ({ ...e, score: Math.max(matchQuality(q, e.unit.name) * 2, matchQuality(q, e.where)) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score || b.used - a.used);
  });
</script>

<div class="stack picker">
  <input type="search" bind:value={q} placeholder={$t('picker.search')} aria-label={$t('picker.search')} />
  <ul>
    {#each shown as { unit, where } (unit.id)}
      <li>
        <button type="button" class:on={unit.id === value} onclick={() => (value = unit.id)}>
          <span class="icon">{unitIcon(unit)}</span>
          <span class="text">
            <span class="name">{unit.name}</span>
            {#if where}<span class="muted where">{where}</span>{/if}
          </span>
        </button>
      </li>
    {:else}
      <li class="muted none">{$t('storage.noResults')}</li>
    {/each}
  </ul>
</div>

<style>
  .picker {
    gap: 0.4rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 13rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  li button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
    padding: 0.4em 0.6em;
  }
  li button.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent) inset;
  }
  .icon {
    font-size: 1.2em;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .where {
    font-size: 0.82em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .none {
    padding: 0.4em;
  }
</style>
