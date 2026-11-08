<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { storageItems, storageUnits } from '../../lib/stores/storage';
  import { coveredOf, isLow, unitIcon } from '../../lib/storage/layout';
  import { buildRoom, type CellState, type Palette } from '../../lib/storage/render3d';
  import type { StorageUnit } from '../../lib/types';
  import Scene3D from './Scene3D.svelte';

  // A room in 3D from its floor plan: each unit standing on its spot, with
  // the same filled/low cells as its own 3D view. Tap one to open it.
  let { room, units }: { room: StorageUnit; units: StorageUnit[] } = $props();

  let scene: Scene3D | undefined = $state();

  // Per unit, per cell: how many things and whether any is low.
  let cells = $derived.by(() => {
    const ids = new Set(units.map((u) => u.id));
    const map = new Map<string, { count: number; low: boolean }>();
    const add = (unitId: string, cellId: string, low: boolean) => {
      const key = `${unitId}|${cellId}`;
      const e = map.get(key) ?? { count: 0, low: false };
      e.count++;
      e.low ||= low;
      map.set(key, e);
    };
    for (const i of $storageItems) if (ids.has(i.unitId)) for (const id of coveredOf(i)) add(i.unitId, id, isLow(i));
    for (const c of $storageUnits) if (c.parent && ids.has(c.parent.unitId)) for (const id of coveredOf(c.parent)) add(c.parent.unitId, id, false);
    return map;
  });

  function count(unitId: string): number {
    return $storageItems.filter((i) => i.unitId === unitId).length + $storageUnits.filter((u) => u.parent?.unitId === unitId).length;
  }

  function cellState(unitId: string, cellId: string): CellState {
    const e = cells.get(`${unitId}|${cellId}`);
    return { count: e?.count ?? 0, low: e?.low ?? false, highlight: false, label: null };
  }

  let build = $derived.by(() => {
    void cells;
    void units;
    void room.floor;
    return (pal: Palette) => buildRoom(room, units, cellState, count, unitIcon, pal);
  });
</script>

<div class="stack">
  <Scene3D bind:this={scene} {build} viewKey={`${room.id}:${room.floor?.rows}x${room.floor?.cols}`} onPick={(p) => p.unitId && push(`/storage/${p.unitId}`)} />
  <div class="row" style="justify-content: space-between">
    <span class="muted hint">{$t('view3d.roomHint')}</span>
    <button onclick={() => scene?.resetView()}>⟲ {$t('view3d.reset')}</button>
  </div>
</div>

<style>
  .hint {
    font-size: 0.85em;
  }
</style>
