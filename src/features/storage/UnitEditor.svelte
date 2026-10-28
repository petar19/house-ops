<script lang="ts">
  import { locale, t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import {
    addCategory,
    createUnit,
    deleteUnit,
    storageCategories,
    storageItems,
    storageUnits,
    updateUnit,
    type UnitDraft,
  } from '../../lib/stores/storage';
  import {
    DEFAULT_SHAPES,
    KIND_ICONS,
    MAX_COLS,
    MAX_LEVELS,
    MAX_ROWS,
    levelLabel,
    makePlaceOf,
    orphanedItems,
  } from '../../lib/storage/layout';
  import { SYSTEM_CATEGORIES } from '../../lib/storage/systemCatalog';
  import type { StorageUnit, StorageUnitKind } from '../../lib/types';
  import UnitGrid from './UnitGrid.svelte';

  let {
    unit = null,
    onDone,
    onDeleted,
  }: { unit?: StorageUnit | null; onDone: (unitId: string) => void; onDeleted?: () => void } = $props();

  const KINDS: StorageUnitKind[] = ['shelving', 'chest', 'drawers', 'custom'];

  // Snapshot of the unit being edited — the form edits a copy, saved on submit.
  // svelte-ignore state_referenced_locally
  const start = unit;
  let name = $state(start?.name ?? '');
  let kind = $state<StorageUnitKind>(start?.kind ?? 'shelving');
  let levels = $state(start?.levels ?? DEFAULT_SHAPES.shelving.levels);
  let rows = $state(start?.rows ?? DEFAULT_SHAPES.shelving.rows);
  let cols = $state(start?.cols ?? DEFAULT_SHAPES.shelving.cols);
  let categories = $state<string[]>(start?.categories ?? []);
  let levelNames = $state<Record<string, string>>({ ...(start?.levelNames ?? {}) });
  let newCategory = $state('');
  let error = $state('');
  let busy = $state(false);

  let groupId = $derived($activeGroup?.id ?? '');
  let unitItems = $derived(unit ? $storageItems.filter((i) => i.unitId === unit!.id) : []);

  // A fresh unit follows the kind's default shape when the kind changes;
  // an existing one keeps its numbers (its items already live in them).
  function pickKind(k: StorageUnitKind) {
    kind = k;
    if (!unit) ({ levels, rows, cols } = DEFAULT_SHAPES[k]);
    if (k === 'custom') {
      rows = 1;
      cols = 1;
    }
  }

  const clamp = (n: number, max: number) => Math.min(Math.max(Math.round(Number(n) || 1), 1), max);
  let shape = $derived({ levels: clamp(levels, MAX_LEVELS), rows: clamp(rows, MAX_ROWS), cols: clamp(cols, MAX_COLS) });
  let preview = $derived({ name, kind, ...shape, levelNames, cellNames: unit?.cellNames ?? {} });
  let orphans = $derived(orphanedItems(shape, unitItems));

  function toggleCategory(id: string) {
    categories = categories.includes(id) ? categories.filter((c) => c !== id) : [...categories, id];
  }

  async function handleAddCategory() {
    const label = newCategory.trim();
    if (!label || !groupId) return;
    const id = await addCategory(groupId, label);
    categories = [...categories, id];
    newCategory = '';
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim() || !groupId) return;
    if (orphans.length > 0) {
      error = $t('storage.shrinkBlocked', { count: orphans.length });
      return;
    }
    // Only keep names for levels that still exist and aren't blank.
    const cleanNames: Record<string, string> = {};
    for (let l = 1; l <= shape.levels; l++) {
      const v = levelNames[String(l)]?.trim();
      if (v) cleanNames[String(l)] = v;
    }
    const draft: UnitDraft = { name: name.trim(), kind, ...shape, categories, levelNames: cleanNames };
    error = '';
    busy = true;
    try {
      if (unit) {
        await updateUnit(groupId, unit.id, draft);
        onDone(unit.id);
      } else {
        onDone(await createUnit(groupId, draft));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function handleDelete() {
    if (!unit || !groupId) return;
    const msg = unitItems.length
      ? $t('storage.deleteUnitWithItems', { name: unit.name, count: unitItems.length })
      : $t('storage.deleteUnitConfirm', { name: unit.name });
    if (!confirm(msg)) return;
    busy = true;
    try {
      await deleteUnit(groupId, unit, unitItems, makePlaceOf($storageUnits, $t));
      onDeleted?.();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      busy = false;
    }
  }

  let dimLabels = $derived({
    levels: $t(`storage.dims.${kind}.levels`),
    rows: $t(`storage.dims.${kind}.rows`),
    cols: $t(`storage.dims.${kind}.cols`),
  });
</script>

<form class="stack" onsubmit={handleSubmit}>
  <label class="stack field">
    <span class="muted">{$t('storage.unitName')}</span>
    <input bind:value={name} placeholder={$t('storage.unitNamePlaceholder')} required />
  </label>

  <div class="stack field">
    <span class="muted">{$t('storage.kind')}</span>
    <div class="kinds">
      {#each KINDS as k (k)}
        <button type="button" class:primary={kind === k} onclick={() => pickKind(k)}>
          {KIND_ICONS[k]} {$t(`storage.kind.${k}`)}
        </button>
      {/each}
    </div>
    <span class="muted">{$t(`storage.kindHint.${kind}`)}</span>
  </div>

  <div class="row dims">
    <label class="stack field">
      <span class="muted">{dimLabels.levels}</span>
      <input type="number" min="1" max={MAX_LEVELS} bind:value={levels} />
    </label>
    {#if kind !== 'custom'}
      <label class="stack field">
        <span class="muted">{dimLabels.rows}</span>
        <input type="number" min="1" max={MAX_ROWS} bind:value={rows} />
      </label>
      <label class="stack field">
        <span class="muted">{dimLabels.cols}</span>
        <input type="number" min="1" max={MAX_COLS} bind:value={cols} />
      </label>
    {/if}
  </div>

  <div class="preview card">
    <UnitGrid unit={preview} items={unitItems} compact />
  </div>
  {#if orphans.length > 0}
    <p class="muted" style="color: var(--danger); margin:0">{$t('storage.shrinkBlocked', { count: orphans.length })}</p>
  {/if}

  <details>
    <summary class="muted">{$t('storage.levelNames')}</summary>
    <div class="stack" style="margin-top:0.5rem">
      {#each Array.from({ length: shape.levels }, (_, i) => i + 1) as l (l)}
        <input
          value={levelNames[String(l)] ?? ''}
          oninput={(e) => (levelNames = { ...levelNames, [String(l)]: e.currentTarget.value })}
          placeholder={levelLabel({ kind, levels: shape.levels, levelNames: {} }, l, $t)}
        />
      {/each}
    </div>
  </details>

  <div class="stack field">
    <span class="muted">{$t('storage.categories')}</span>
    <span class="muted">{$t('storage.categoriesHint')}</span>
    <div class="chips">
      {#each SYSTEM_CATEGORIES as c (c.id)}
        <button type="button" class="chip" class:on={categories.includes(c.id)} onclick={() => toggleCategory(c.id)}>
          {$locale === 'hr' ? c.hr : c.en}
        </button>
      {/each}
      {#each $storageCategories as c (c.id)}
        <button type="button" class="chip" class:on={categories.includes(c.id)} onclick={() => toggleCategory(c.id)}>
          {c.name}
        </button>
      {/each}
    </div>
    <div class="row">
      <input style="flex:1; width:auto" bind:value={newCategory} placeholder={$t('storage.newCategory')} />
      <button type="button" onclick={handleAddCategory} disabled={!newCategory.trim()}>{$t('common.add')}</button>
    </div>
  </div>

  <div class="row" style="justify-content: space-between">
    <button class="primary" type="submit" disabled={busy || !name.trim() || orphans.length > 0}>
      {unit ? $t('common.save') : $t('storage.createUnit')}
    </button>
    {#if unit}
      <button type="button" class="danger" onclick={handleDelete} disabled={busy}>{$t('storage.deleteUnit')}</button>
    {/if}
  </div>
  {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
</form>

<style>
  .field {
    gap: 0.25rem;
  }
  .kinds,
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .dims .field {
    flex: 1 1 6rem;
  }
  .preview {
    padding: 0.6rem;
    max-height: 18rem;
    overflow: auto;
  }
  .chip {
    padding: 0.3em 0.75em;
    border-radius: 999px;
    font-size: 0.88em;
  }
  .chip.on {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
</style>
