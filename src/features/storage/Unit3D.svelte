<script lang="ts">
  import { t } from '../../lib/i18n';
  import { coveredOf, isLow, levelLabel, unitIcon } from '../../lib/storage/layout';
  import { buildUnit, type CellState, type Palette } from '../../lib/storage/render3d';
  import type { StorageItem, StorageUnit } from '../../lib/types';
  import Scene3D from './Scene3D.svelte';

  // One unit in 3D — the same cells as the 2D grid, as a piece of furniture.
  // With several levels you can show just one (a chest's lower layers are
  // otherwise under the top one; a drawer slides out).
  let {
    unit,
    items,
    containers = [],
    highlight = new Set<string>(),
    onPick,
  }: {
    unit: StorageUnit;
    items: StorageItem[];
    containers?: StorageUnit[];
    highlight?: Set<string>;
    onPick: (cellId: string) => void;
  } = $props();

  let focusLevel = $state<number | null>(null);
  let scene: Scene3D | undefined = $state();
  let levels = $derived(Array.from({ length: unit.levels }, (_, i) => i + 1));

  // What's in each cell, containers first (same order as the 2D grid).
  let byCell = $derived.by(() => {
    const map = new Map<string, { names: string[]; low: boolean }>();
    const add = (id: string, name: string, low: boolean) => {
      const e = map.get(id) ?? { names: [], low: false };
      e.names.push(name);
      e.low ||= low;
      map.set(id, e);
    };
    for (const c of containers) if (c.parent) for (const id of coveredOf(c.parent)) add(id, `${unitIcon(c)} ${c.name}`, false);
    for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) for (const id of coveredOf(item)) add(id, item.name, isLow(item));
    return map;
  });

  // Names over the cells only when they'd still be readable.
  let cellCount = $derived((focusLevel === null ? unit.levels : 1) * unit.rows * unit.cols);
  let showLabels = $derived(cellCount <= 12);

  function cellState(cellId: string): CellState {
    const e = byCell.get(cellId);
    const count = e?.names.length ?? 0;
    return {
      count,
      low: e?.low ?? false,
      highlight: highlight.has(cellId),
      label: e ? (count > 1 ? `${e.names[0]} +${count - 1}` : e.names[0]) : null,
    };
  }

  let build = $derived.by(() => {
    void byCell;
    void highlight;
    const focus = focusLevel;
    const labels = showLabels;
    return (pal: Palette) => buildUnit(unit, cellState, pal, { focusLevel: focus, labels });
  });
</script>

<div class="stack">
  {#if unit.levels > 1}
    <div class="row levels">
      <button class:on={focusLevel === null} onclick={() => (focusLevel = null)}>{$t('view3d.allLevels')}</button>
      {#each levels as level (level)}
        <button class:on={focusLevel === level} onclick={() => (focusLevel = level)}>{levelLabel(unit, level, $t)}</button>
      {/each}
    </div>
  {/if}
  <Scene3D bind:this={scene} {build} viewKey={unit.id} onPick={(p) => p.cellId && onPick(p.cellId)} />
  <div class="row" style="justify-content: space-between">
    <span class="muted hint">{$t('view3d.hint')}</span>
    <button onclick={() => scene?.resetView()}>⟲ {$t('view3d.reset')}</button>
  </div>
</div>

<style>
  .levels {
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .levels button {
    font-size: 0.85em;
    padding: 0.25em 0.6em;
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
