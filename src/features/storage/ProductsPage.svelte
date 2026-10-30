<script lang="ts">
  import { link } from 'svelte-spa-router';
  import { locale, t } from '../../lib/i18n';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import { catalogOptions, loadAllPurchases, storageItems } from '../../lib/stores/storage';
  import { inUse, summarizeProducts } from '../../lib/storage/products';
  import { formatUnitPrice } from '../../lib/storage/pricing';
  import { matchQuality } from '../../lib/storage/suggest';
  import type { Purchase } from '../../lib/types';

  // Every product the group knows — built-in ones and its own — whether or
  // not any of it is in storage right now, with its last price.
  let q = $state('');
  let filter = $state<'used' | 'stored' | 'gone' | 'all' | 'hidden'>('used');
  let purchases = $state<Purchase[] | null>(null);
  let error = $state('');

  $effect(() => {
    const gid = $activeGroup?.id;
    if (!gid || $myAccess.storage === 'none') return;
    loadAllPurchases(gid)
      .then((p) => (purchases = p))
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  let summaries = $derived(
    summarizeProducts($catalogOptions, $storageItems, purchases ?? [], { includeHidden: filter === 'hidden' }),
  );

  let shown = $derived.by(() => {
    let list = [...summaries.values()];
    if (filter === 'used') list = list.filter(inUse);
    else if (filter === 'stored') list = list.filter((s) => s.items.length > 0);
    else if (filter === 'gone') list = list.filter((s) => s.items.length === 0 && inUse(s));
    else if (filter === 'hidden') list = list.filter((s) => s.option.hidden);
    if (q.trim()) {
      return list
        .map((s) => ({ s, score: Math.max(matchQuality(q, s.option.name), ...s.option.altNames.map((n) => matchQuality(q, n))) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.s.option.name.localeCompare(b.s.option.name))
        .map((x) => x.s);
    }
    return list.sort((a, b) => a.option.name.localeCompare(b.option.name));
  });

  let currency = $derived(new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }));
  const FILTERS = ['used', 'stored', 'gone', 'all', 'hidden'] as const;
</script>

<div class="page stack">
  <a href="/storage" use:link class="muted" style="text-decoration:none">← {$t('storage.title')}</a>
  <h2 style="margin:0">{$t('products.title')}</h2>

  {#if $myAccess.storage === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else}
    <p class="muted" style="margin:0">{$t('products.intro')}</p>
    <input type="search" bind:value={q} placeholder={$t('products.search')} />
    <div class="chips">
      {#each FILTERS as f (f)}
        <button class="chip" class:on={filter === f} onclick={() => (filter = f)}>{$t(`products.filter.${f}`)}</button>
      {/each}
    </div>
    {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}

    <div class="card stack list">
      {#if shown.length === 0}
        <p class="muted" style="margin:0">{q.trim() ? $t('storage.noResults') : $t('products.none')}</p>
      {/if}
      {#each shown as s (s.option.productKey)}
        <a class="product" href="/storage/products/{encodeURIComponent(s.option.productKey)}" use:link>
          <span class="row" style="justify-content: space-between; flex-wrap: nowrap">
            <strong>{s.option.name}</strong>
            {#if s.lastPriced?.unitPrice !== null && s.lastPriced?.unitPrice !== undefined}
              <span>{formatUnitPrice(s.lastPriced.unitPrice, s.lastPriced.priceUnit ?? s.option.priceUnit, (n) => currency.format(n))}</span>
            {/if}
          </span>
          <span class="muted">
            {s.items.length > 0 ? $t('products.inStorage', { count: s.items.length }) : inUse(s) ? $t('products.notInStorage') : $t('products.builtIn')}
            {#if s.last}· {$t('products.lastBought', { date: s.last.date })}{#if s.last.shop}, {s.last.shop}{/if}{/if}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
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
  .list {
    gap: 0;
  }
  .product {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.55rem 0.25rem;
    border-bottom: 1px solid var(--border);
    text-decoration: none;
    color: var(--text);
  }
  .product:last-child {
    border-bottom: none;
  }
</style>
