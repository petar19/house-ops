<script lang="ts">
  import { t } from '../../lib/i18n';
  import { storageView } from '../../lib/stores/viewMode';
</script>

<div class="toggle" role="group" aria-label={$t('view3d.choose')}>
  <button class:on={$storageView === '2d'} aria-pressed={$storageView === '2d'} onclick={() => storageView.set('2d')}>2D</button>
  <button class:on={$storageView === '3d'} aria-pressed={$storageView === '3d'} onclick={() => storageView.set('3d')}>3D</button>
</div>

<style>
  .toggle {
    display: inline-flex;
  }
  .toggle button {
    padding: 0.25em 0.7em;
    font-size: 0.85em;
  }
  .toggle button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .toggle button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    margin-left: -1px;
  }
  button.on {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
</style>
