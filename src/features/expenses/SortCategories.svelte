<script lang="ts">
  import { link, replace } from 'svelte-spa-router';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import { addKeywordToCategory, categories } from '../../lib/stores/categories';
  import { expenses, expensesLoading, expensesRangeStart, loadFullExpenseHistory, setCategoriesOnExpenses } from '../../lib/stores/expenses';
  import { groupUncategorized, keywordToLearn, type NameGroup } from '../../lib/utils/categorizeBatch';
  import { locale, t } from '../../lib/i18n';

  // Expenses with no category, one row per name: pick the categories once
  // and they go on every expense of that name. Rows start with a suggestion
  // picked (what the same name has elsewhere, or what its keywords pick).
  $effect(() => {
    if ($activeGroup && $myAccess.expenses !== 'edit') replace('/expenses');
  });
  // Every expense, not just this month's.
  $effect(() => {
    if ($expensesRangeStart) loadFullExpenseHistory();
  });

  let groups = $derived(groupUncategorized($expenses, $categories));
  let total = $derived(groups.reduce((n, g) => n + g.expenses.length, 0));

  // What's picked per row; a row not touched yet uses its suggestion.
  let choices = $state<Record<string, string[]>>({});
  const chosen = (g: NameGroup) => choices[g.key] ?? g.suggested;
  function toggle(g: NameGroup, id: string) {
    const now = chosen(g);
    choices[g.key] = now.includes(id) ? now.filter((c) => c !== id) : [...now, id];
  }

  let remember = $state(true);
  let busy = $state<string | null>(null); // row key, or '*' for all
  let status = $state('');
  let shownCount = $state(40);

  async function apply(g: NameGroup): Promise<number> {
    const cats = chosen(g);
    const failed = await setCategoriesOnExpenses($activeGroup!.id, g.expenses.map((e) => e.id), cats);
    if (remember) {
      for (const id of cats) {
        const category = $categories.find((c) => c.id === id);
        const keyword = category && keywordToLearn(g.displayName, category);
        if (keyword) await addKeywordToCategory(id, keyword);
      }
    }
    delete choices[g.key];
    return failed;
  }

  async function applyOne(g: NameGroup) {
    busy = g.key;
    status = '';
    try {
      const failed = await apply(g);
      status = failed
        ? $t('sortCats.someFailed', { count: failed })
        : $t('sortCats.saved', { count: g.expenses.length, name: g.displayName });
    } catch (e) {
      status = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  let ready = $derived(groups.filter((g) => chosen(g).length > 0));
  let readyCount = $derived(ready.reduce((n, g) => n + g.expenses.length, 0));

  async function applyAll() {
    if (!confirm($t('sortCats.applyAllConfirm', { count: readyCount, names: ready.length }))) return;
    busy = '*';
    status = '';
    let failed = 0;
    try {
      for (const g of [...ready]) failed += await apply(g);
      status = failed ? $t('sortCats.someFailed', { count: failed }) : $t('sortCats.allSaved');
    } catch (e) {
      status = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  let currency = $derived(
    new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }),
  );
  function span(g: NameGroup): string {
    const dates = g.expenses.map((e) => e.date).sort();
    const sum = g.expenses.reduce((n, e) => n + e.price, 0);
    const range = dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} – ${dates[dates.length - 1]}`;
    return `${range} · ${currency.format(sum)}`;
  }
</script>

<div class="page stack">
  <div class="row" style="justify-content: space-between">
    <h2 style="margin:0">{$t('sortCats.title')}</h2>
    <a href="/expenses" use:link>{$t('sortCats.back')}</a>
  </div>

  {#if $expensesLoading || $expensesRangeStart}
    <p class="muted">{$t('common.loading')}</p>
  {:else if groups.length === 0}
    <p class="muted">{$t('sortCats.none')}</p>
  {:else}
    <div class="card stack">
      <p style="margin:0">{$t('sortCats.summary', { count: total, names: groups.length })}</p>
      <label class="row" style="flex-wrap: nowrap; align-items: flex-start">
        <input type="checkbox" style="width:auto; flex:none; margin-top:0.2em" bind:checked={remember} />
        <span>{$t('sortCats.remember')}</span>
      </label>
      <div class="row">
        <button class="primary" disabled={!!busy || ready.length === 0} onclick={applyAll}>
          {$t('sortCats.applyAll', { count: readyCount, names: ready.length })}
        </button>
      </div>
      {#if status}<p class="muted" style="margin:0">{status}</p>{/if}
    </div>

    {#each groups.slice(0, shownCount) as g (g.key)}
      {@const picked = chosen(g)}
      <div class="card stack">
        <div class="row" style="justify-content: space-between">
          <div>
            <strong>{g.displayName}</strong> <span class="muted">×{g.expenses.length}</span>
            <div class="muted small">
              {span(g)}
              {#if g.source && !choices[g.key]} · {$t(`sortCats.source.${g.source}`)}{/if}
            </div>
          </div>
          <button class="primary" disabled={!!busy || picked.length === 0} onclick={() => applyOne(g)}>
            {busy === g.key ? '…' : $t('sortCats.apply', { count: g.expenses.length })}
          </button>
        </div>
        <div class="row">
          {#each $categories as c (c.id)}
            <button
              type="button"
              disabled={!!busy}
              onclick={() => toggle(g, c.id)}
              style={picked.includes(c.id)
                ? 'background: var(--accent); color: var(--accent-text); border-color: var(--accent)'
                : g.hinted.includes(c.id)
                  ? 'border-color: var(--accent)'
                  : ''}
            >
              {c.name}
            </button>
          {/each}
        </div>
      </div>
    {/each}
    {#if groups.length > shownCount}
      <button onclick={() => (shownCount += 40)}>{$t('sortCats.showMore', { count: groups.length - shownCount })}</button>
    {/if}
  {/if}
</div>

<style>
  .small {
    font-size: 0.85em;
  }
</style>
