<script lang="ts">
  import { locale, t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import {
    addCategory,
    createUnit,
    deleteUnit,
    placeUnit,
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
    ROOM_CELL,
    UNIT_ICONS,
    isRoom,
    roomOf,
    shapeOf,
    fullPlaceLabel,
    levelLabel,
    makePlaceOf,
    orphanedContainers,
    orphanedItems,
    placeableTargets,
    unitLocationLabel,
  } from '../../lib/storage/layout';
  import { SYSTEM_CATEGORIES } from '../../lib/storage/systemCatalog';
  import type { StoragePlacement, StorageUnit, StorageUnitKind } from '../../lib/types';
  import PlacePicker from './PlacePicker.svelte';
  import UnitGrid from './UnitGrid.svelte';

  // `placeIn`: creating a new container straight into a cell ("New container
  // here" from a cell) — it starts as a movable box already sitting there.
  let {
    unit = null,
    placeIn = null,
    initialKind = null,
    onDone,
    onDeleted,
  }: {
    unit?: StorageUnit | null;
    placeIn?: StoragePlacement | null;
    initialKind?: StorageUnitKind | null;
    onDone: (unitId: string) => void;
    onDeleted?: () => void;
  } = $props();

  // Snapshot of the unit being edited — the form edits a copy, saved on submit.
  // svelte-ignore state_referenced_locally
  const start = unit;
  // New storage made from inside a room just goes into that room; made from
  // a cell of a shelf etc. it's a container sitting in that cell.
  // svelte-ignore state_referenced_locally
  const placeInRoom = !!placeIn && isRoom($storageUnits.find((u) => u.id === placeIn!.unitId));
  // svelte-ignore state_referenced_locally
  const placeInCell = !!placeIn && !placeInRoom;
  // svelte-ignore state_referenced_locally
  const startKind: StorageUnitKind = start?.kind ?? initialKind ?? (placeInCell ? 'custom' : 'shelving');
  // A room stays a room (things are inside it), and nothing else can become
  // one (it may itself be inside something). New units can be anything,
  // except a room when it's being created inside something.
  // svelte-ignore state_referenced_locally
  const KINDS: StorageUnitKind[] = start
    ? start.kind === 'room'
      ? ['room']
      : ['shelving', 'chest', 'drawers', 'custom']
    : placeIn
      ? ['shelving', 'chest', 'drawers', 'custom']
      : ['room', 'shelving', 'chest', 'drawers', 'custom'];
  let name = $state(start?.name ?? '');
  let kind = $state<StorageUnitKind>(startKind);
  let levels = $state(start?.levels ?? DEFAULT_SHAPES[startKind].levels);
  let rows = $state(start?.rows ?? DEFAULT_SHAPES[startKind].rows);
  let cols = $state(start?.cols ?? DEFAULT_SHAPES[startKind].cols);
  let icon = $state<string | null>(start?.icon ?? null);
  // "Other" units default to being containers; fixed furniture doesn't.
  // svelte-ignore state_referenced_locally
  let movable = $state(start?.movable ?? (startKind === 'custom' || placeInCell));
  // Which room it's in. Only chosen directly when it isn't sitting inside
  // another unit's cell — then its room is wherever that unit is.
  // svelte-ignore state_referenced_locally
  const startParentUnit = $storageUnits.find((u) => u.id === start?.parent?.unitId);
  // svelte-ignore state_referenced_locally
  let roomId = $state(isRoom(startParentUnit) ? startParentUnit!.id : placeInRoom ? placeIn!.unitId : '');
  let insideNonRoom = $derived(!!unit?.parent && !isRoom($storageUnits.find((u) => u.id === unit!.parent!.unitId)));
  let rooms = $derived($storageUnits.filter((u) => isRoom(u)).sort((a, b) => a.name.localeCompare(b.name)));
  let movableTouched = false;
  let showIcons = $state(false);
  let placing = $state(false);
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
    if (!unit && !movableTouched && !placeInCell) movable = k === 'custom';
    if (k === 'custom') {
      rows = 1;
      cols = 1;
    }
  }

  const clamp = (n: number, max: number) => Math.min(Math.max(Math.round(Number(n) || 1), 1), max);
  let shape = $derived({ levels: clamp(levels, MAX_LEVELS), rows: clamp(rows, MAX_ROWS), cols: clamp(cols, MAX_COLS) });
  let preview = $derived({ name, kind, ...shape, levelNames, cellNames: unit?.cellNames ?? {} });
  let orphans = $derived([
    ...orphanedItems(shape, unitItems),
    ...(unit ? orphanedContainers(shape, $storageUnits, unit.id) : []),
  ]);
  let location = $derived(unit ? unitLocationLabel($storageUnits, unit, $t) : null);
  // Rooms are picked with the room dropdown, not as a cell to put things in.
  let targets = $derived(unit ? placeableTargets($storageUnits, unit).filter((u) => !isRoom(u)) : []);

  async function moveTo(parent: StoragePlacement | null) {
    if (!unit || !groupId) return;
    busy = true;
    error = '';
    try {
      await placeUnit(groupId, unit, parent, {
        from: location ?? $t('storage.loose'),
        to: parent ? fullPlaceLabel($storageUnits, parent.unitId, parent.cellId, $t, shapeOf(parent)) : $t('storage.loose'),
      });
      placing = false;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  // Taken off a shelf, a box stays in the room that shelf is in.
  function takeOut() {
    const room = unit?.parent ? roomOf($storageUnits, unit.parent.unitId) : null;
    if (room) roomId = room.id;
    moveTo(room ? { unitId: room.id, cellId: ROOM_CELL } : null);
  }

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
    const room = kind === 'room';
    const draft: UnitDraft = room
      ? { name: name.trim(), kind, ...DEFAULT_SHAPES.room, categories, levelNames: {}, icon, movable: false }
      : { name: name.trim(), kind, ...shape, categories, levelNames: cleanNames, icon, movable };
    const roomPlacement: StoragePlacement | null = !room && roomId ? { unitId: roomId, cellId: ROOM_CELL } : null;
    error = '';
    busy = true;
    try {
      if (unit) {
        if (insideNonRoom && !movable) {
          // No longer a container: it can't stay in another unit's cell.
          await updateUnit(groupId, unit.id, { ...draft, parent: null });
        } else {
          await updateUnit(groupId, unit.id, draft);
          // A different room: logged as a move, like moving a container.
          if (!insideNonRoom && !room && (unit.parent?.unitId ?? '') !== roomId) {
            await placeUnit(groupId, unit, roomPlacement, {
              from: location ?? $t('storage.noRoom'),
              to: roomPlacement ? fullPlaceLabel($storageUnits, roomId, ROOM_CELL, $t) : $t('storage.noRoom'),
            });
          }
        }
        onDone(unit.id);
      } else {
        const parent = room ? null : placeInCell ? (movable ? placeIn : null) : roomPlacement;
        onDone(await createUnit(groupId, draft, parent));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function handleDelete() {
    if (!unit || !groupId) return;
    const inner = $storageUnits.filter((u) => u.parent?.unitId === unit!.id).length;
    const msg = (inner ? $t('storage.deleteKeepsContainers', { count: inner }) + '\n\n' : '') + (unitItems.length
      ? $t('storage.deleteUnitWithItems', { name: unit.name, count: unitItems.length })
      : $t('storage.deleteUnitConfirm', { name: unit.name }));
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
  <div class="row name-row">
    <button type="button" class="icon-btn" onclick={() => (showIcons = !showIcons)} title={$t('storage.icon')} aria-label={$t('storage.icon')}>
      {icon || KIND_ICONS[kind]}
    </button>
    <label class="stack field" style="flex:1">
      <span class="muted">{$t('storage.unitName')}</span>
      <input bind:value={name} placeholder={$t('storage.unitNamePlaceholder')} required />
    </label>
  </div>
  {#if showIcons}
    <div class="icons">
      <button type="button" class:on={!icon} onclick={() => ((icon = null), (showIcons = false))}>{KIND_ICONS[kind]}</button>
      {#each UNIT_ICONS as e (e)}
        <button type="button" class:on={icon === e} onclick={() => ((icon = e), (showIcons = false))}>{e}</button>
      {/each}
    </div>
  {/if}

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

  {#if kind !== 'room'}
  {#if !insideNonRoom && !placeInCell}
    <label class="stack field">
      <span class="muted">{$t('storage.room')}</span>
      <select bind:value={roomId}>
        <option value="">{$t('storage.noRoom')}</option>
        {#each rooms as r (r.id)}<option value={r.id}>{KIND_ICONS.room} {r.name}</option>{/each}
      </select>
    </label>
  {/if}
  <label class="row">
    <input type="checkbox" bind:checked={movable} onchange={() => (movableTouched = true)} />
    <span>{$t('storage.movable')}</span>
  </label>
  {#if placeInCell && !unit}
    <p class="muted" style="margin:0">{$t('storage.willBePlaced', { place: fullPlaceLabel($storageUnits, placeIn.unitId, placeIn.cellId, $t) })}</p>
  {/if}
  {#if unit && movable}
    <div class="stack field">
      <span class="muted">{$t('storage.inside')}</span>
      {#if placing}
        <PlacePicker {targets} current={insideNonRoom ? unit.parent : null} {busy} onConfirm={moveTo} onCancel={() => (placing = false)} />
      {:else}
        <div class="row">
          <span>{insideNonRoom ? location : $t('storage.notInside')}</span>
          <button type="button" onclick={() => (placing = true)} disabled={busy}>{insideNonRoom ? $t('storage.moveOrResize') : $t('storage.putInto')}</button>
          {#if insideNonRoom}
            <button type="button" onclick={takeOut} disabled={busy}>{$t('storage.takeOut')}</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

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
  {/if}

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
  .name-row {
    align-items: flex-end;
    flex-wrap: nowrap;
  }
  .icon-btn {
    font-size: 1.5em;
    padding: 0.2em 0.45em;
    line-height: 1.2;
  }
  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr));
    gap: 0.25rem;
  }
  .icons button {
    font-size: 1.3em;
    padding: 0.2em;
  }
  .icons button.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent) inset;
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
