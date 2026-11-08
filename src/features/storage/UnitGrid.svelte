<script lang="ts">
  import { t } from '../../lib/i18n';
  import { cellLabel, coveredOf, doorShelfCount, isLow, isSpanning, levelCellIds, levelLabel, unitIcon } from '../../lib/storage/layout';
  import { dragToCell } from '../../lib/storage/dragToCell';
  import type { StorageItem, StorageUnit } from '../../lib/types';

  // The 2D view of one unit, generated purely from its template numbers:
  // each level (shelf / layer / drawer / spot) is a rows×cols grid of cells.
  // Doubles as the destination picker when moving items (`compact`).
  let {
    onDrop,
    unit,
    items,
    containers = [],
    highlight = new Set<string>(),
    selected = null,
    disabledCell = null,
    compact = false,
    onPick,
  }: {
    unit: Pick<StorageUnit, 'name' | 'kind' | 'levels' | 'rows' | 'cols' | 'levelNames' | 'cellNames' | 'doorShelves'>;
    items: StorageItem[];
    containers?: StorageUnit[]; // containers placed in this unit, shown before items
    highlight?: Set<string>;
    selected?: string | null;
    disabledCell?: string | null;
    compact?: boolean;
    onPick?: (cellId: string, event: MouseEvent) => void;
    // Set to let names be dragged onto another cell: what was dragged, the
    // cell it was dragged from (a big item shows in several) and where to.
    onDrop?: (what: { kind: 'item' | 'container'; id: string }, fromCell: string, toCell: string) => void;
  } = $props();

  let byCell = $derived.by(() => {
    const map = new Map<string, StorageItem[]>();
    // A spanning item shows up in every cell it covers, listed first there.
    for (const item of items) {
      for (const id of coveredOf(item)) {
        const list = map.get(id) ?? [];
        list.push(item);
        map.set(id, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(isSpanning(b)) - Number(isSpanning(a)) || a.name.localeCompare(b.name));
    }
    return map;
  });

  let containersByCell = $derived.by(() => {
    const map = new Map<string, StorageUnit[]>();
    for (const c of containers) {
      if (!c.parent) continue;
      for (const id of coveredOf(c.parent)) {
        const list = map.get(id) ?? [];
        list.push(c);
        map.set(id, list);
      }
    }
    return map;
  });

  // A level that is a single cell (drawers without compartments, custom
  // spots) shows its name inside the cell instead of as a separate heading.
  let singleCellLevels = $derived(unit.rows === 1 && unit.cols === 1);
  let levels = $derived(Array.from({ length: unit.levels }, (_, i) => i + 1));
  // A fridge's door shelves get their own heading, after the inside ones.
  let firstDoorLevel = $derived(doorShelfCount(unit) > 0 ? unit.levels - doorShelfCount(unit) + 1 : null);
  const PREVIEW_NAMES = 3;
</script>

<div class="unit-grid" class:compact>
  {#each levels as level (level)}
    {#if level === firstDoorLevel}
      <div class="door-heading">{$t('storage.door')}</div>
    {/if}
    <div class="level">
      {#if !singleCellLevels}
        <div class="level-label">{levelLabel(unit, level, $t)}</div>
      {/if}
      <div class="cells" style="grid-template-columns: repeat({unit.cols}, minmax({compact ? 2.5 : 3.75}rem, 1fr))">
        {#each levelCellIds(unit, level) as id (id)}
          {@const cellItems = byCell.get(id) ?? []}
          {@const cellContainers = containersByCell.get(id) ?? []}
          {@const total = cellItems.length + cellContainers.length}
          {@const label = singleCellLevels ? levelLabel(unit, level, $t) : cellLabel(unit, id, $t)}
          <button
            type="button"
            class="cell"
            class:highlight={highlight.has(id)}
            class:selected={selected === id}
            class:empty={total === 0}
            data-drop-cell={onDrop ? id : undefined}
            disabled={disabledCell === id || !onPick}
            onclick={(e) => onPick?.(id, e)}
          >
            <span class="cell-head">
              <span class="cell-label">{label}</span>
              {#if total > 0}
                <span class="count" class:low={cellItems.some(isLow)}>{total}</span>
              {/if}
            </span>
            {#if !compact}
              {#each cellContainers.slice(0, PREVIEW_NAMES) as c (c.id)}
                <span
                  class="item-name container"
                  class:draggable={!!onDrop}
                  use:dragToCell={{ enabled: !!onDrop, fromCell: id, label: `${unitIcon(c)} ${c.name}`, onDrop: (to) => onDrop?.({ kind: 'container', id: c.id }, id, to) }}
                >{unitIcon(c)} {c.name}</span>
              {/each}
              {#each cellItems.slice(0, Math.max(PREVIEW_NAMES - cellContainers.length, 0)) as item (item.id)}
                <span
                  class="item-name"
                  class:low={isLow(item)}
                  class:draggable={!!onDrop}
                  use:dragToCell={{ enabled: !!onDrop, fromCell: id, label: item.name, onDrop: (to) => onDrop?.({ kind: 'item', id: item.id }, id, to) }}
                >{#if isSpanning(item)}<span class="span-mark" title={$t('storage.spans')}>⧉</span> {/if}{item.name}</span>
              {/each}
              {#if total > PREVIEW_NAMES}
                <span class="more">{$t('storage.more', { count: total - PREVIEW_NAMES })}</span>
              {/if}
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .unit-grid {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-x: auto;
  }
  .level {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .door-heading {
    margin-top: 0.4rem;
    padding-top: 0.5rem;
    border-top: 2px dashed var(--border);
    font-size: 0.85em;
    font-weight: 700;
    color: var(--text-dim);
  }
  .level-label {
    font-size: 0.8em;
    font-weight: 600;
    color: var(--text-dim);
  }
  /* Equal 1fr columns so every level lines up; only scrolls sideways once
     the per-column minimum no longer fits (lots of columns on a phone). */
  .cells {
    display: grid;
    gap: 0.35rem;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.1rem;
    min-width: 0;
    min-height: 4.5rem;
    padding: 0.4rem 0.5rem;
    text-align: left;
    border-radius: 8px;
    background: var(--surface);
    font-size: 0.85em;
    overflow: hidden;
  }
  .compact .cell {
    min-height: 2.6rem;
  }
  .cell.empty {
    background: var(--bg);
  }
  .cell:disabled {
    cursor: default;
    opacity: 1;
  }
  .cell:not(:disabled):hover {
    border-color: var(--accent);
  }
  .cell.highlight {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent) inset;
  }
  .cell.selected {
    background: var(--accent);
    color: var(--accent-text);
  }
  .cell-head {
    display: flex;
    justify-content: space-between;
    gap: 0.3rem;
  }
  .cell-label {
    color: var(--text-dim);
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .selected .cell-label {
    color: inherit;
  }
  .count {
    font-weight: 600;
    font-size: 0.85em;
    padding: 0 0.4em;
    border-radius: 999px;
    background: var(--border);
    color: var(--text);
    flex: 0 0 auto;
  }
  .count.low {
    background: var(--danger);
    color: #fff;
  }
  .item-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-name.draggable {
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .cell:global(.drop-over) {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent) inset;
    background: color-mix(in srgb, var(--accent) 15%, var(--surface));
  }
  :global(body.cell-dragging) {
    cursor: grabbing;
  }
  .item-name.low {
    color: var(--danger);
  }
  .item-name.container {
    font-weight: 600;
  }
  .span-mark {
    color: var(--accent);
  }
  .more {
    color: var(--text-dim);
    font-size: 0.85em;
  }
</style>
