<script lang="ts">
  import { link } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import { moveItems, storageCatalog, storageItems, storageUnits } from '../../lib/stores/storage';
  import { formatQty, fullPlaceLabel, makePlaceOf, usualPlace } from '../../lib/storage/layout';
  import Modal from '../../lib/components/Modal.svelte';
  import type { StorageItem, StorageUnit } from '../../lib/types';
  import CellPanel from './CellPanel.svelte';

  // The Unsorted container: imported things wait here. Its list is the usual
  // cell panel (select → Move), plus "put away where they usually go", which
  // shows every suggested move first and only moves the ticked ones.
  let { unit, readonly = false }: { unit: StorageUnit; readonly?: boolean } = $props();

  let groupId = $derived($activeGroup?.id ?? '');
  let items = $derived($storageItems.filter((i) => i.unitId === unit.id).sort((a, b) => a.name.localeCompare(b.name)));
  let plans = $derived(
    items.map((item) => ({ item, place: usualPlace($storageCatalog, $storageUnits, item) })),
  );
  let withPlace = $derived(plans.filter((p) => p.place));
  let withoutPlace = $derived(plans.filter((p) => !p.place));

  let previewing = $state(false);
  let unticked = $state(new Set<string>());
  let busy = $state(false);
  let error = $state('');

  function openPreview() {
    unticked = new Set();
    error = '';
    previewing = true;
  }

  function toggle(id: string) {
    const next = new Set(unticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    unticked = next;
  }

  async function confirm() {
    busy = true;
    error = '';
    try {
      const placeOf = makePlaceOf($storageUnits, $t);
      // One move per destination cell, so same items heading there merge.
      const byTarget = new Map<string, { unitId: string; cellId: string; items: StorageItem[] }>();
      for (const { item, place } of withPlace) {
        if (!place || unticked.has(item.id)) continue;
        const key = `${place.unitId}|${place.cellId}`;
        const entry = byTarget.get(key) ?? { ...place, items: [] };
        entry.items.push(item);
        byTarget.set(key, entry);
      }
      for (const { unitId, cellId, items: list } of byTarget.values()) {
        await moveItems(groupId, list, unitId, cellId, placeOf);
      }
      previewing = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  let ticked = $derived(withPlace.filter((p) => !unticked.has(p.item.id)).length);
</script>

<div class="stack">
  {#if !readonly}
    <div class="row">
      {#if withPlace.length > 0}
        <button class="primary" onclick={openPreview}>📍 {$t('inbox.putAway', { count: withPlace.length })}</button>
      {/if}
      <a href="/storage/import" use:link class="button-link">📥 {$t('inbox.importMore')}</a>
    </div>
  {/if}
  {#if items.length === 0}
    <p class="muted" style="margin:0">{$t('inbox.empty')}</p>
  {:else}
    <p class="muted" style="margin:0">{$t('inbox.hint')}</p>
  {/if}
  <div class="card">
    <CellPanel {unit} cellId="1.1.1" {readonly} looseOnly showUsual />
  </div>
</div>

<Modal open={previewing} onClose={() => (previewing = false)} title={$t('inbox.previewTitle')}>
  {#snippet children()}
    <div class="stack">
      <p class="muted" style="margin:0">{$t('inbox.previewHint')}</p>
      <ul class="plan">
        {#each withPlace as { item, place } (item.id)}
          <li>
            <label class="row">
              <input type="checkbox" checked={!unticked.has(item.id)} onchange={() => toggle(item.id)} />
              <span class="what"><strong>{item.name}</strong> <span class="muted">{formatQty(item, $t)}</span></span>
            </label>
            <span class="muted where">→ {place ? fullPlaceLabel($storageUnits, place.unitId, place.cellId, $t) : ''}</span>
          </li>
        {/each}
      </ul>
      {#if withoutPlace.length > 0}
        <p class="muted" style="margin:0">
          {$t('inbox.noUsual', { names: withoutPlace.map((p) => p.item.name).join(', ') })}
        </p>
      {/if}
      <div class="row">
        <button class="primary" onclick={confirm} disabled={busy || ticked === 0}>{$t('inbox.confirm', { count: ticked })}</button>
        <button onclick={() => (previewing = false)}>{$t('common.cancel')}</button>
      </div>
      {#if error}<p class="muted" style="color: var(--danger); margin:0">{error}</p>{/if}
    </div>
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
  .plan {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .plan li {
    display: flex;
    flex-direction: column;
  }
  .where {
    padding-left: 1.75rem;
  }
</style>
