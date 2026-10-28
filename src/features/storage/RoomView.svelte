<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import { placeUnit, storageUnits } from '../../lib/stores/storage';
  import { ROOM_CELL, fullPlaceLabel, isRoom, unitIcon, unitLocationLabel } from '../../lib/storage/layout';
  import Modal from '../../lib/components/Modal.svelte';
  import type { StorageUnit } from '../../lib/types';
  import CellPanel from './CellPanel.svelte';
  import UnitCard from './UnitCard.svelte';
  import UnitEditor from './UnitEditor.svelte';

  // A room's page: the storage in it as cards, plus the things lying loose
  // in it (its single cell). No floor plan — where in the room isn't stored.
  let { room, readonly = false }: { room: StorageUnit; readonly?: boolean } = $props();

  let groupId = $derived($activeGroup?.id ?? '');
  let inRoom = $derived(
    $storageUnits.filter((u) => u.parent?.unitId === room.id).sort((a, b) => a.name.localeCompare(b.name)),
  );
  // Anything that isn't a room and isn't already directly in this one. A box
  // currently on a shelf elsewhere is taken off it when moved here.
  let candidates = $derived(
    $storageUnits
      .filter((u) => !isRoom(u) && u.parent?.unitId !== room.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let addId = $state('');
  let creating = $state(false);
  let busy = $state(false);
  let error = $state('');

  async function addExisting() {
    const unit = $storageUnits.find((u) => u.id === addId);
    if (!unit) return;
    busy = true;
    error = '';
    try {
      await placeUnit(groupId, unit, { unitId: room.id, cellId: ROOM_CELL }, {
        from: unitLocationLabel($storageUnits, unit, $t) ?? $t('storage.noRoom'),
        to: fullPlaceLabel($storageUnits, room.id, ROOM_CELL, $t),
      });
      addId = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function openCell(unitId: string, cellId: string) {
    push(`/storage/${unitId}?cell=${cellId}`);
  }
</script>

<div class="stack">
  {#if inRoom.length === 0}
    <p class="muted" style="margin:0">{$t('storage.noStorageInRoom')}</p>
  {/if}
  {#each inRoom as unit (unit.id)}
    <UnitCard {unit} onOpenCell={openCell} />
  {/each}

  {#if !readonly}
    <div class="row">
      {#if candidates.length > 0}
        <select bind:value={addId} aria-label={$t('storage.addToRoom')} style="flex: 1 1 12rem; width:auto">
          <option value="">{$t('storage.addToRoom')}…</option>
          {#each candidates as u (u.id)}
            <option value={u.id}>{unitIcon(u)} {u.name}{u.parent ? ` (${unitLocationLabel($storageUnits, u, $t)})` : ''}</option>
          {/each}
        </select>
        <button onclick={addExisting} disabled={busy || !addId}>{$t('storage.putHere')}</button>
      {/if}
      <button onclick={() => (creating = true)}>+ {$t('storage.newInRoom')}</button>
    </div>
    {#if error}<p class="muted" style="color: var(--danger); margin:0">{error}</p>{/if}
  {/if}

  <div class="card stack">
    <h3 style="margin:0">{$t('storage.looseInRoom')}</h3>
    <CellPanel unit={room} cellId={ROOM_CELL} {readonly} looseOnly />
  </div>
</div>

<Modal open={creating} onClose={() => (creating = false)} title={$t('storage.newInRoom')}>
  {#snippet children()}
    <UnitEditor placeIn={{ unitId: room.id, cellId: ROOM_CELL }} onDone={() => (creating = false)} />
  {/snippet}
</Modal>
