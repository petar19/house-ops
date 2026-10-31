<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import { storageItems, storageUnits, updateUnit } from '../../lib/stores/storage';
  import { DEFAULT_FLOOR, MAX_FLOOR, fitSpot, spotFits } from '../../lib/storage/floorPlan';
  import { unitIcon } from '../../lib/storage/layout';
  import type { StorageUnit } from '../../lib/types';

  // A room seen from above: a rows×cols grid of squares with its furniture
  // and boxes standing on it. Tap something to open it; when arranging, tap
  // something and then a square to put it there, and set how many squares it
  // takes. Purely a picture of the room — nothing about it changes where
  // items are stored.
  let { room, units, readonly = false }: { room: StorageUnit; units: StorageUnit[]; readonly?: boolean } = $props();

  let groupId = $derived($activeGroup?.id ?? '');
  let floor = $derived(room.floor ?? DEFAULT_FLOOR);
  let placed = $derived(units.filter((u) => u.floorSpot && spotFits(u.floorSpot, floor)));
  let unplaced = $derived(units.filter((u) => !u.floorSpot || !spotFits(u.floorSpot, floor)));

  let arranging = $state(false);
  let selectedId = $state<string | null>(null);
  let selected = $derived(units.find((u) => u.id === selectedId) ?? null);
  let error = $state('');

  function count(unitId: string): number {
    return $storageItems.filter((i) => i.unitId === unitId).length + $storageUnits.filter((u) => u.parent?.unitId === unitId).length;
  }

  async function save(unit: StorageUnit, spot: StorageUnit['floorSpot']) {
    error = '';
    try {
      await updateUnit(groupId, unit.id, { floorSpot: spot });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function tapSquare(row: number, col: number) {
    if (!arranging || !selected) return;
    const size = selected.floorSpot ?? { w: 1, h: 1 };
    save(selected, fitSpot({ row, col, w: size.w, h: size.h }, floor));
  }

  function tapUnit(unit: StorageUnit) {
    if (arranging) selectedId = selectedId === unit.id ? null : unit.id;
    else push(`/storage/${unit.id}`);
  }

  function resize(dw: number, dh: number) {
    if (!selected?.floorSpot) return;
    const s = selected.floorSpot;
    save(selected, fitSpot({ ...s, w: s.w + dw, h: s.h + dh }, floor));
  }

  // ── Plan size ──
  let sizing = $state(false);
  let rowsDraft = $state(DEFAULT_FLOOR.rows);
  let colsDraft = $state(DEFAULT_FLOOR.cols);
  function startSizing() {
    rowsDraft = floor.rows;
    colsDraft = floor.cols;
    sizing = true;
  }
  async function saveSize(e: SubmitEvent) {
    e.preventDefault();
    const rows = Math.min(Math.max(1, Math.round(rowsDraft || 1)), MAX_FLOOR);
    const cols = Math.min(Math.max(1, Math.round(colsDraft || 1)), MAX_FLOOR);
    error = '';
    try {
      await updateUnit(groupId, room.id, { floor: { rows, cols } });
      sizing = false;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  async function removePlan() {
    if (!confirm($t('floor.removeConfirm'))) return;
    await updateUnit(groupId, room.id, { floor: null });
  }
</script>

<div class="card stack">
  <div class="row" style="justify-content: space-between">
    <h3 style="margin:0">🗺️ {$t('floor.title')}</h3>
    {#if !readonly}
      <div class="row">
        <button class:on={arranging} onclick={() => ((arranging = !arranging), (selectedId = null))}>
          {arranging ? `✓ ${$t('floor.done')}` : `✥ ${$t('floor.arrange')}`}
        </button>
        {#if arranging}<button onclick={startSizing}>{$t('floor.size')}</button>{/if}
      </div>
    {/if}
  </div>

  {#if sizing}
    <form class="row" onsubmit={saveSize}>
      <label class="row">{$t('floor.rows')} <input type="number" min="1" max={MAX_FLOOR} bind:value={rowsDraft} style="width:4.5em" /></label>
      <label class="row">{$t('floor.cols')} <input type="number" min="1" max={MAX_FLOOR} bind:value={colsDraft} style="width:4.5em" /></label>
      <button class="primary" type="submit">{$t('common.save')}</button>
      <button type="button" onclick={() => (sizing = false)}>{$t('common.cancel')}</button>
      <button type="button" class="danger" onclick={removePlan}>{$t('floor.remove')}</button>
    </form>
  {/if}

  {#if arranging}
    <p class="muted hint" style="margin:0">{selected ? $t('floor.tapSquare', { name: selected.name }) : $t('floor.pickFirst')}</p>
  {/if}

  <div class="plan-wrap">
    <div class="plan" style="grid-template-columns: repeat({floor.cols}, minmax(2.2rem, 1fr)); grid-template-rows: repeat({floor.rows}, 2.6rem)">
      {#each Array.from({ length: floor.rows }, (_, r) => r + 1) as row (row)}
        {#each Array.from({ length: floor.cols }, (_, c) => c + 1) as col (col)}
          <button
            type="button"
            class="square"
            class:target={arranging && !!selected}
            style="grid-row: {row}; grid-column: {col}"
            disabled={!arranging || !selected}
            onclick={() => tapSquare(row, col)}
            aria-label={$t('floor.square', { row, col })}
          ></button>
        {/each}
      {/each}
      {#each placed as u (u.id)}
        {@const s = u.floorSpot!}
        <button
          type="button"
          class="piece"
          class:selected={selectedId === u.id}
          style="grid-row: {s.row} / span {s.h}; grid-column: {s.col} / span {s.w}"
          onclick={() => tapUnit(u)}
          title={u.name}
        >
          <span class="icon">{unitIcon(u)}</span>
          <span class="name">{u.name}</span>
          {#if count(u.id) > 0}<span class="count">{count(u.id)}</span>{/if}
        </button>
      {/each}
    </div>
  </div>

  {#if arranging && selected}
    <div class="row">
      <strong>{unitIcon(selected)} {selected.name}</strong>
      {#if selected.floorSpot && spotFits(selected.floorSpot, floor)}
        <span class="muted">{$t('floor.sizeNow', { w: selected.floorSpot.w, h: selected.floorSpot.h })}</span>
        <button onclick={() => resize(-1, 0)} aria-label={$t('floor.narrower')}>◂▸ −</button>
        <button onclick={() => resize(1, 0)} aria-label={$t('floor.wider')}>◂▸ +</button>
        <button onclick={() => resize(0, -1)} aria-label={$t('floor.shallower')}>▴▾ −</button>
        <button onclick={() => resize(0, 1)} aria-label={$t('floor.deeper')}>▴▾ +</button>
        <button onclick={() => save(selected!, null)}>{$t('floor.takeOff')}</button>
      {/if}
    </div>
  {/if}

  {#if unplaced.length > 0 && (arranging || placed.length === 0)}
    <div class="stack">
      <span class="muted">{$t('floor.notPlaced')}</span>
      <div class="row">
        {#each unplaced as u (u.id)}
          <button class:on={selectedId === u.id} onclick={() => (arranging ? (selectedId = u.id) : ((arranging = true), (selectedId = u.id)))} disabled={readonly}>
            {unitIcon(u)} {u.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  {#if error}<p class="muted" style="color: var(--danger); margin:0">{error}</p>{/if}
</div>

<style>
  .plan-wrap {
    overflow-x: auto;
  }
  .plan {
    display: grid;
    gap: 2px;
    padding: 2px;
    background: var(--border);
    border-radius: 8px;
    min-width: min-content;
  }
  .square {
    padding: 0;
    border: none;
    border-radius: 3px;
    background: var(--bg);
    min-width: 0;
  }
  .square:disabled {
    cursor: default;
    opacity: 1;
  }
  .square.target:hover {
    background: color-mix(in srgb, var(--accent) 25%, var(--bg));
  }
  .piece {
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 0.15rem;
    min-width: 0;
    overflow: hidden;
    border-radius: 6px;
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
    font-size: 0.78em;
    line-height: 1.15;
    position: relative;
  }
  .piece.selected {
    background: var(--accent);
    color: var(--accent-text);
  }
  .icon {
    font-size: 1.25em;
  }
  .name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    position: absolute;
    top: 1px;
    right: 3px;
    font-size: 0.85em;
    opacity: 0.75;
  }
  button.on {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .hint {
    font-size: 0.85em;
  }
</style>
