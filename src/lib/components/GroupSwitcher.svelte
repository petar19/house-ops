<script lang="ts">
  import { activeGroupId, createGroup, myGroups } from '../stores/groups';
  import { t } from '../i18n';

  let creating = $state(false);
  let newName = $state('');
  let newExpenses = $state(true);
  let newPhotoSaving = $state(false);
  let newShoppingList = $state(false);
  let newStorage = $state(false);
  let error = $state('');
  let saving = $state(false);

  function startCreate() {
    creating = true;
    newName = '';
    newExpenses = true;
    newPhotoSaving = false;
    newShoppingList = false;
    newStorage = false;
    error = '';
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    error = '';
    saving = true;
    try {
      const id = await createGroup(name, {
        expenses: newExpenses,
        photoSaving: newPhotoSaving,
        shoppingList: newShoppingList,
        storage: newStorage,
      });
      activeGroupId.set(id);
      creating = false;
    } catch (e) {
      error = e instanceof Error ? e.message : $t('groups.createFailed');
    } finally {
      saving = false;
    }
  }
</script>

<div class="row group-switcher">
  {#if $myGroups.length > 0}
    <select bind:value={$activeGroupId} aria-label={$t('groups.switcherLabel')}>
      {#each $myGroups as group (group.id)}
        <option value={group.id}>{group.name}</option>
      {/each}
    </select>
  {/if}
  <button onclick={startCreate} title={$t('groups.create')}>+ {$t('groups.newGroup')}</button>
</div>

{#if creating}
  <div class="card stack">
    <form class="stack" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
      <label>
        {$t('groups.newNamePlaceholder')}
        <input bind:value={newName} placeholder={$t('groups.newNamePlaceholder')} required />
      </label>
      <span>{$t('groups.capabilities')}</span>
      <label class="row"><input type="checkbox" bind:checked={newExpenses} /> {$t('groups.capabilityExpenses')}</label>
      <label class="row"><input type="checkbox" bind:checked={newPhotoSaving} /> {$t('groups.capabilityPhotoSaving')}</label>
      <label class="row"><input type="checkbox" bind:checked={newShoppingList} /> {$t('groups.capabilityShoppingList')}</label>
      <label class="row"><input type="checkbox" bind:checked={newStorage} /> {$t('groups.capabilityStorage')}</label>
      {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
      <div class="row">
        <button class="primary" type="submit" disabled={saving}>{$t('groups.create')}</button>
        <button type="button" onclick={() => (creating = false)}>{$t('common.cancel')}</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .group-switcher {
    align-items: center;
  }
</style>
