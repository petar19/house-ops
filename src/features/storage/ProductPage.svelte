<script lang="ts">
  import type { ChartConfiguration } from 'chart.js/auto';
  import { link, push } from 'svelte-spa-router';
  import { locale, t } from '../../lib/i18n';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import {
    catalogOptions,
    deletePurchase,
    loadPurchases,
    mergeProducts,
    storageCategories,
    storageItems,
    storageUnits,
    updateProduct,
  } from '../../lib/stores/storage';
  import { formatQty, fullPlaceLabel, shapeOf } from '../../lib/storage/layout';
  import { formatUnitPrice } from '../../lib/storage/pricing';
  import { priceVsUsual, summarizeProducts } from '../../lib/storage/products';
  import { matchQuality, type CatalogOption } from '../../lib/storage/suggest';
  import { SYSTEM_CATEGORIES, type PriceUnit } from '../../lib/storage/systemCatalog';
  import ChartView from '../../lib/components/ChartView.svelte';
  import type { Purchase } from '../../lib/types';

  // One product: where it is now, what it has cost over time (per kg / l /
  // piece, so pack sizes and shops compare), and editing its names, aliases
  // and categories — or hiding it, or merging a duplicate into another.
  let { params }: { params: { key: string } } = $props();

  let productKey = $derived.by(() => {
    try {
      return decodeURIComponent(params.key);
    } catch {
      return params.key;
    }
  });
  let groupId = $derived($activeGroup?.id ?? '');
  let canEdit = $derived($myAccess.storage === 'edit');

  let purchases = $state<Purchase[] | null>(null);
  let error = $state('');
  let busy = $state(false);

  async function reload() {
    if (!groupId) return;
    try {
      purchases = await loadPurchases(groupId, [productKey]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      purchases = [];
    }
  }
  $effect(() => {
    void productKey;
    void groupId;
    purchases = null;
    reload();
  });

  let summary = $derived(summarizeProducts($catalogOptions, $storageItems, purchases ?? [], { includeHidden: true }).get(productKey));
  let product = $derived(summary?.option ?? null);
  let currency = $derived(new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }));
  const money = (n: number) => currency.format(n);

  function categoryName(id: string): string {
    const sys = SYSTEM_CATEGORIES.find((c) => c.id === id);
    if (sys) return $locale === 'hr' ? sys.hr : sys.en;
    return $storageCategories.find((c) => c.id === id)?.name ?? id;
  }

  // ── Price chart: per-unit price over time, one line per shop ──
  let chartConfig = $derived.by((): ChartConfiguration | null => {
    const priced = (purchases ?? []).filter((p) => p.unitPrice !== null).sort((a, b) => a.date.localeCompare(b.date));
    if (priced.length < 2) return null;
    const dates = [...new Set(priced.map((p) => p.date))];
    const shops = [...new Set(priced.map((p) => p.shop || '—'))];
    const palette = ['#4f46e5', '#16a34a', '#dc2626', '#d97706', '#0891b2', '#9333ea', '#db2777'];
    return {
      type: 'line',
      data: {
        labels: dates,
        datasets: shops.map((shop, i) => ({
          label: shop,
          data: dates.map((d) => priced.find((p) => p.date === d && (p.shop || '—') === shop)?.unitPrice ?? null),
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length],
          spanGaps: true,
          tension: 0.2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: shops.length > 1 } },
        scales: { y: { beginAtZero: false, ticks: { callback: (v) => money(Number(v)) } } },
      },
    };
  });

  // ── Edit ──
  let editing = $state(false);
  let edName = $state('');
  let edAliases = $state('');
  let edCategories = $state<string[]>([]);
  let edPriceUnit = $state<PriceUnit>('pcs');

  function startEdit() {
    if (!product) return;
    edName = product.name;
    edAliases = product.aliases.join(', ');
    edCategories = [...product.categories];
    edPriceUnit = product.priceUnit;
    editing = true;
  }

  async function run(fn: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!product || !edName.trim()) return;
    const p = product;
    run(async () => {
      await updateProduct(groupId, p, {
        name: edName.trim(),
        aliases: edAliases.split(',').map((a) => a.trim()).filter(Boolean),
        categories: edCategories,
        priceUnit: edPriceUnit,
      });
      editing = false;
    });
  }

  function toggleHidden() {
    if (!product) return;
    const p = product;
    run(() => updateProduct(groupId, p, { hidden: !p.hidden }));
  }

  // ── Merge into another product ──
  let merging = $state(false);
  let mergeQuery = $state('');
  let mergeTargets = $derived.by((): CatalogOption[] => {
    if (!mergeQuery.trim()) return [];
    const seen = new Set<string>();
    return $catalogOptions
      .filter((o) => !o.hidden && o.productKey !== productKey)
      .map((o) => ({ o, score: Math.max(matchQuality(mergeQuery, o.name), ...o.altNames.map((n) => matchQuality(mergeQuery, n))) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.o)
      .filter((o) => (seen.has(o.productKey) ? false : (seen.add(o.productKey), true)))
      .slice(0, 8);
  });

  function mergeInto(target: CatalogOption) {
    if (!product) return;
    if (!confirm($t('products.mergeConfirm', { from: product.name, into: target.name }))) return;
    const from = product;
    run(async () => {
      await mergeProducts(groupId, from, target);
      push(`/storage/products/${encodeURIComponent(target.productKey)}`);
    });
  }

  function removePurchase(p: Purchase) {
    if (!confirm($t('products.deletePurchaseConfirm'))) return;
    run(async () => {
      await deletePurchase(groupId, p.id);
      await reload();
    });
  }

  function lineAmount(p: Purchase): string {
    const qty = p.quantity !== null ? `${p.quantity}${p.unit ? ' ' + p.unit : ''}` : '';
    const pack = p.packAmount ? ` × ${p.packAmount} ${p.packUnit ?? ''}` : '';
    return (qty + pack).trim();
  }
</script>

<div class="page stack">
  <a href="/storage/products" use:link class="muted" style="text-decoration:none">← {$t('products.title')}</a>

  {#if $myAccess.storage === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else if !product}
    <p class="muted">{$t('products.notFound')}</p>
  {:else}
    <div class="row" style="justify-content: space-between">
      <h2 style="margin:0">{product.name}</h2>
      {#if canEdit && !editing}
        <div class="row">
          <button onclick={startEdit}>✎ {$t('common.edit')}</button>
          <button onclick={() => (merging = !merging)}>⇢ {$t('products.merge')}</button>
          {#if product.builtIn || product.hidden}
            <button onclick={toggleHidden} disabled={busy}>{product.hidden ? $t('products.unhide') : $t('products.hide')}</button>
          {/if}
        </div>
      {/if}
    </div>
    {#if product.mergedInto}
      <p class="muted" style="margin:0">{$t('products.wasMerged')}</p>
    {:else if product.hidden}
      <p class="muted" style="margin:0">{$t('products.isHidden')}</p>
    {/if}

    {#if editing}
      <form class="card stack" onsubmit={saveEdit}>
        <label class="stack field">
          <span class="muted">{$t('products.name')}</span>
          <input bind:value={edName} required />
        </label>
        <label class="stack field">
          <span class="muted">{$t('products.aliases')}</span>
          <input bind:value={edAliases} placeholder={$t('products.aliasesPlaceholder')} />
        </label>
        <label class="stack field">
          <span class="muted">{$t('products.priceUnit')}</span>
          <select bind:value={edPriceUnit}>
            <option value="kg">{$t('products.per.kg')}</option>
            <option value="l">{$t('products.per.l')}</option>
            <option value="pcs">{$t('products.per.pcs')}</option>
          </select>
        </label>
        <div class="stack field">
          <span class="muted">{$t('storage.categories')}</span>
          <div class="chips">
            {#each [...SYSTEM_CATEGORIES.map((c) => c.id), ...$storageCategories.map((c) => c.id)] as id (id)}
              <button
                type="button"
                class="chip"
                class:on={edCategories.includes(id)}
                onclick={() => (edCategories = edCategories.includes(id) ? edCategories.filter((c) => c !== id) : [...edCategories, id])}
              >{categoryName(id)}</button>
            {/each}
          </div>
        </div>
        <div class="row">
          <button class="primary" type="submit" disabled={busy}>{$t('common.save')}</button>
          <button type="button" onclick={() => (editing = false)}>{$t('common.cancel')}</button>
        </div>
      </form>
    {:else}
      <div class="row facts">
        {#each product.categories as c (c)}<span class="chip static">{categoryName(c)}</span>{/each}
        <span class="muted">{$t(`products.per.${product.priceUnit}`)}</span>
      </div>
      {#if product.aliases.length > 0}
        <p class="muted" style="margin:0">{$t('products.alsoCalled', { names: product.aliases.join(', ') })}</p>
      {/if}
    {/if}

    {#if merging}
      <div class="card stack">
        <p class="muted" style="margin:0">{$t('products.mergeHint', { name: product.name })}</p>
        <input type="search" bind:value={mergeQuery} placeholder={$t('products.search')} />
        {#each mergeTargets as target (target.productKey)}
          <button class="target" onclick={() => mergeInto(target)} disabled={busy}>
            <strong>{target.name}</strong>
            {#if target.aliases.length}<span class="muted">{target.aliases.slice(0, 3).join(', ')}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="card stack">
      <h3 style="margin:0">{$t('products.inStorageNow')}</h3>
      {#if !summary || summary.items.length === 0}
        <p class="muted" style="margin:0">{$t('products.notInStorage')}</p>
      {:else}
        {#each summary.items as it (it.id)}
          <a class="place" href="/storage/{it.unitId}?cell={it.cellId}" use:link>
            <span>{it.name} <span class="muted">{formatQty(it, $t)}</span></span>
            <span class="muted">{fullPlaceLabel($storageUnits, it.unitId, it.cellId, $t, shapeOf(it))}</span>
          </a>
        {/each}
      {/if}
    </div>

    <div class="card stack">
      <h3 style="margin:0">{$t('products.priceHistory')}</h3>
      {#if purchases === null}
        <p class="muted" style="margin:0">{$t('common.loading')}</p>
      {:else if purchases.length === 0}
        <p class="muted" style="margin:0">{$t('products.noPurchases')}</p>
      {:else}
        {#if chartConfig}<ChartView config={chartConfig} height={200} />{/if}
        <ul class="history">
          {#each purchases as p (p.id)}
            {@const vs = priceVsUsual(p, purchases)}
            <li>
              <div class="row" style="justify-content: space-between; flex-wrap: nowrap">
                <span>
                  <strong>{p.date}</strong>
                  {#if lineAmount(p)}<span class="muted"> · {lineAmount(p)}</span>{/if}
                </span>
                <span class="price">
                  {#if p.price !== null}{money(p.price)}{:else}<span class="muted">—</span>{/if}
                  {#if p.unitPrice !== null && p.priceUnit}
                    <span class="muted"> ({formatUnitPrice(p.unitPrice, p.priceUnit, money)})</span>
                  {/if}
                  {#if vs !== null && Math.abs(vs) >= 0.05}
                    <span class="vs" class:up={vs > 0} title={$t('products.vsUsual')}>{vs > 0 ? '▲' : '▼'} {Math.abs(Math.round(vs * 100))}%</span>
                  {/if}
                </span>
              </div>
              <div class="row" style="justify-content: space-between; flex-wrap: nowrap">
                <span class="muted">
                  {[p.shop, p.brand && p.brand.toLowerCase() !== (p.shop ?? '').toLowerCase() ? p.brand : null].filter(Boolean).join(' · ') || '—'}
                  {#if p.raw}· {p.raw}{/if}
                </span>
                {#if canEdit}
                  <button class="del" onclick={() => removePurchase(p)} aria-label={$t('common.delete')} disabled={busy}>✕</button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
  {/if}
</div>

<style>
  .field {
    gap: 0.25rem;
  }
  .chips,
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
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
  .chip.static {
    border: 1px solid var(--border);
  }
  .target,
  .place {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    text-decoration: none;
    color: var(--text);
  }
  .place {
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--border);
  }
  .place:last-child {
    border-bottom: none;
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .history li {
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }
  .history li:last-child {
    border-bottom: none;
  }
  .price {
    white-space: nowrap;
  }
  .vs {
    font-size: 0.8em;
    color: var(--success);
    margin-left: 0.3em;
  }
  .vs.up {
    color: var(--danger);
  }
  .del {
    padding: 0.15em 0.5em;
    border: none;
    background: none;
    color: var(--text-dim);
  }
</style>
