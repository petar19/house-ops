<script lang="ts">
  import Router, { router } from 'svelte-spa-router';
  import { routes } from './lib/router';
  import Nav from './lib/components/Nav.svelte';
  import Login from './features/auth/Login.svelte';
  import NotAllowed from './lib/components/NotAllowed.svelte';
  import { t } from './lib/i18n';
  import {
    allowedLoading,
    allowedRole,
    authInitializing,
    currentUser,
  } from './lib/stores/auth';
  import { activeGroupId, activeGroupResolvedId, myGroups } from './lib/stores/groups';

  // Links from outside (QR labels, the bot's WhatsApp messages) carry
  // ?group= so they open in the group they're about, whichever one you were
  // last looking at.
  let linkGroup = $derived(new URLSearchParams(router.querystring ?? '').get('group'));
  $effect(() => {
    if (linkGroup && $myGroups.some((g) => g.id === linkGroup) && $activeGroupResolvedId !== linkGroup) {
      activeGroupId.set(linkGroup);
    }
  });
</script>

{#if $authInitializing}
  <div class="center-screen"><p class="muted">{$t('app.loading')}</p></div>
{:else if !$currentUser}
  <Login />
{:else if $allowedLoading}
  <div class="center-screen"><p class="muted">{$t('app.checkingAccess')}</p></div>
{:else if !$allowedRole}
  <NotAllowed />
{:else}
  <Nav />
  <Router {routes} />
{/if}
