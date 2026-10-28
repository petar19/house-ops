<script lang="ts">
  import { link } from 'svelte-spa-router';
  import active from 'svelte-spa-router/active';
  import { allowedRole, currentUser, signOutUser } from '../stores/auth';
  import { activeGroup } from '../stores/groups';
  import { t } from '../i18n';
  import LanguagePicker from './LanguagePicker.svelte';
  import GroupSwitcher from './GroupSwitcher.svelte';
  import Modal from './Modal.svelte';
  import AdminPanel from '../../features/admin/AdminPanel.svelte';

  let adminOpen = $state(false);
</script>

<header class="nav card" style="border-radius:0; border-width: 0 0 1px">
  <div class="nav-inner">
    <div class="row top-row">
      <a href="/" use:link class="brand">🏠 HouseOps</a>
      <div class="row user">
        <LanguagePicker />
        {#if $allowedRole === 'admin'}
          <button onclick={() => (adminOpen = true)} title={$t('nav.admin')} aria-label={$t('nav.admin')}>⚙️</button>
        {/if}
        {#if $currentUser?.photoURL}
          <img src={$currentUser.photoURL} alt="" class="avatar" />
        {/if}
        <span class="muted user-email">{$currentUser?.email}</span>
        <button onclick={signOutUser}>{$t('nav.signOut')}</button>
      </div>
    </div>
    <GroupSwitcher />
    <nav>
      {#if $activeGroup?.capabilities.expenses}
        <a href="/" use:link use:active>{$t('nav.expenses')}</a>
        <a href="/stats" use:link use:active>{$t('nav.stats')}</a>
        <a href="/settleup" use:link use:active>{$t('nav.settleUp')}</a>
      {/if}
      {#if $activeGroup?.capabilities.photoSaving}
        <a href="/documents" use:link use:active>{$t('nav.documents')}</a>
      {/if}
      {#if $activeGroup?.capabilities.shoppingList}
        <a href="/shopping" use:link use:active>{$t('nav.shopping')}</a>
      {/if}
      {#if $activeGroup?.capabilities.storage}
        <a href="/storage" use:link use:active={'/storage*'}>{$t('nav.storage')}</a>
      {/if}
      {#if $activeGroup}
        <a href="/settings" use:link use:active>{$t('nav.settings')}</a>
      {/if}
      <a href="/reminders" use:link use:active>{$t('nav.reminders')}</a>
      <a href="/categories" use:link use:active>{$t('nav.categories')}</a>
      <a href="/export-import" use:link use:active>{$t('nav.exportImport')}</a>
    </nav>
  </div>
</header>

{#if $allowedRole === 'admin'}
  <Modal open={adminOpen} onClose={() => (adminOpen = false)} title={$t('nav.admin')}>
    {#snippet children()}
      <AdminPanel />
    {/snippet}
  </Modal>
{/if}

<style>
  .nav-inner {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0.6rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .top-row {
    justify-content: space-between;
  }
  .brand {
    font-weight: 700;
    text-decoration: none;
    color: var(--text);
    white-space: nowrap;
  }
  nav {
    display: flex;
    gap: 0.9rem;
    flex-wrap: wrap;
  }
  nav a {
    text-decoration: none;
    color: var(--text-dim);
    font-size: 0.92em;
    padding: 0.25em 0;
    white-space: nowrap;
  }
  nav a:global(.active) {
    color: var(--accent);
    font-weight: 600;
  }
  .user {
    margin-left: auto;
  }
  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }
  .user-email {
    display: none;
  }

  /* Below ~640px, tabs become a horizontally scrollable single-line strip
     instead of hiding behind a hamburger menu — all of them stay visible and
     reachable with a swipe, nothing tucked away. */
  @media (max-width: 640px) {
    nav {
      flex-wrap: nowrap;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 0.2rem;
    }
    nav a {
      flex: 0 0 auto;
    }
  }
</style>
