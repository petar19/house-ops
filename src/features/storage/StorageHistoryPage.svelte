<script lang="ts">
  import { link, push } from 'svelte-spa-router';
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import StorageHistory from './StorageHistory.svelte';
</script>

<div class="page stack">
  <a href="/storage" use:link class="muted" style="text-decoration:none">← {$t('storage.title')}</a>
  <h2 style="margin:0">{$t('storage.historyTitle')}</h2>
  {#if !$activeGroup?.capabilities.storage}
    <p class="muted">{$t('storage.capabilityOff')}</p>
  {:else}
    <div class="card">
      <StorageHistory onOpenCell={(unitId, cellId) => push(`/storage/${unitId}?cell=${cellId}`)} />
    </div>
  {/if}
</div>
