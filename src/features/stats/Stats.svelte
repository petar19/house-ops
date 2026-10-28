<script lang="ts">
  import { onMount } from 'svelte';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import { expenseMemberUids } from '../../lib/utils/access';
  import { expenses, knownNames, loadFullExpenseHistory } from '../../lib/stores/expenses';
  import { categories } from '../../lib/stores/categories';
  import { nameAliases, saveAlias } from '../../lib/stores/nameAliases';
  import { locale, t } from '../../lib/i18n';
  import ChartView from '../../lib/components/ChartView.svelte';
  import MonthPicker from '../../lib/components/MonthPicker.svelte';
  import {
    aggregateByCategory,
    aggregateByName,
    aggregateBySpender,
    aggregateByTime,
    filterExpenses,
    sortExpenses,
    suggestBucketSize,
    type BucketSize,
    type SortKey,
  } from '../../lib/utils/stats';

  let from = $state('');
  let to = $state('');
  let selectedCategories = $state<string[]>([]);
  let selectedSpenders = $state<string[]>([]);
  let search = $state('');
  let sortKey = $state<SortKey>('date-desc');
  let bucket = $state<BucketSize | 'auto'>('auto');

  // Stats analyzes a group's whole history by default (no from/to means "all
  // time") — the live expenses store defaults to a smaller recent window to
  // save reads elsewhere, so this page needs to widen it itself rather than
  // silently charting only what happened to already be loaded.
  onMount(() => {
    loadFullExpenseHistory();
  });

  let currency = $derived(
    new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }),
  );

  let filtered = $derived(
    filterExpenses($expenses, {
      from: from || undefined,
      to: to || undefined,
      categoryIds: selectedCategories.length ? selectedCategories : undefined,
      spenderUids: selectedSpenders.length ? selectedSpenders : undefined,
      search: search || undefined,
    }),
  );
  let sorted = $derived(sortExpenses(filtered, sortKey));
  let total = $derived(filtered.reduce((sum, e) => sum + e.price, 0));

  let effectiveBucket = $derived(bucket === 'auto' ? suggestBucketSize(filtered) : bucket);
  let timeAgg = $derived(aggregateByTime(filtered, effectiveBucket));
  let categoryAgg = $derived(aggregateByCategory(filtered));
  let spenderAgg = $derived(aggregateBySpender(filtered));

  let nameCounts = $derived(
    Object.fromEntries($knownNames.map((k) => [k.displayName, k.count])) as Record<string, number>,
  );
  let nameResult = $derived(aggregateByName(filtered, nameCounts, $nameAliases));

  function categoryName(id: string): string {
    return $categories.find((c) => c.id === id)?.name ?? id;
  }
  function memberName(uid: string): string {
    return $activeGroup?.members[uid]?.displayName ?? uid;
  }
  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function clustersToReview() {
    return nameResult.clusters.filter((c) => c.members.length > 1);
  }

  async function acceptCluster(canonicalName: string, members: string[]) {
    if (!$activeGroup) return;
    await saveAlias($activeGroup.id, members, canonicalName);
  }

  let bucketLabel = $derived(
    { day: $t('stats.bucketDay'), week: $t('stats.bucketWeek'), month: $t('stats.bucketMonth') }[effectiveBucket],
  );

  let timeChartConfig = $derived({
    type: 'bar' as const,
    data: {
      labels: timeAgg.map((a) => a.key),
      datasets: [{ label: $t('stats.overTime', { bucket: bucketLabel }), data: timeAgg.map((a) => a.total), backgroundColor: '#4f46e5' }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  let categoryChartConfig = $derived({
    type: 'doughnut' as const,
    data: {
      labels: categoryAgg.map((a) => categoryName(a.key)),
      datasets: [
        {
          data: categoryAgg.map((a) => a.total),
          backgroundColor: [
            '#4f46e5', '#818cf8', '#f59e0b', '#16a34a', '#dc2626', '#0ea5e9', '#a855f7', '#eab308',
          ],
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
</script>

<div class="page stack">
  <h2>{$t('stats.title')}</h2>

  {#if !$activeGroup}
    <p class="muted">{$t('stats.pickGroup')}</p>
  {:else if $myAccess.expenses === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else}
    <div class="card stack">
      <MonthPicker onSelect={(f, toDate) => { from = f; to = toDate; }} />
      <div class="row">
        <label>{$t('stats.from')} <input type="date" bind:value={from} /></label>
        <label>{$t('stats.to')} <input type="date" bind:value={to} /></label>
        <label>
          {$t('stats.sort')}
          <select bind:value={sortKey}>
            <option value="date-desc">{$t('stats.sortDateDesc')}</option>
            <option value="date-asc">{$t('stats.sortDateAsc')}</option>
            <option value="price-desc">{$t('stats.sortPriceDesc')}</option>
            <option value="price-asc">{$t('stats.sortPriceAsc')}</option>
            <option value="name-asc">{$t('stats.sortNameAsc')}</option>
          </select>
        </label>
        <label>
          {$t('stats.bucket')}
          <select bind:value={bucket}>
            <option value="auto">{$t('stats.bucketAuto')}</option>
            <option value="day">{$t('stats.bucketDay')}</option>
            <option value="week">{$t('stats.bucketWeek')}</option>
            <option value="month">{$t('stats.bucketMonth')}</option>
          </select>
        </label>
      </div>
      <input placeholder={$t('stats.searchPlaceholder')} bind:value={search} />
      <div class="row">
        <span class="muted">{$t('stats.categoriesLabel')}</span>
        {#each $categories as cat (cat.id)}
          <button
            type="button"
            onclick={() => (selectedCategories = toggle(selectedCategories, cat.id))}
            style={selectedCategories.includes(cat.id) ? 'background:var(--accent); color:var(--accent-text)' : ''}
          >
            {cat.name}
          </button>
        {/each}
      </div>
      {#if $activeGroup}
        <div class="row">
          <span class="muted">{$t('stats.spenderLabel')}</span>
          {#each Object.entries($activeGroup.members).filter(([uid]) => expenseMemberUids($activeGroup!).includes(uid)) as [uid, member] (uid)}
            <button
              type="button"
              onclick={() => (selectedSpenders = toggle(selectedSpenders, uid))}
              style={selectedSpenders.includes(uid) ? 'background:var(--accent); color:var(--accent-text)' : ''}
            >
              {member.displayName}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="card row" style="justify-content: space-between">
      <strong>{$t('stats.expenseCount', { count: filtered.length })}</strong>
      <strong>{currency.format(total)}</strong>
    </div>

    {#if timeAgg.length > 0}
      <div class="card">
        <h3>{$t('stats.overTime', { bucket: bucketLabel })}</h3>
        <ChartView config={timeChartConfig} />
      </div>
    {/if}

    {#if categoryAgg.length > 0}
      <div class="card">
        <h3>{$t('stats.byCategory')}</h3>
        <ChartView config={categoryChartConfig} />
      </div>
    {/if}

    <div class="card stack">
      <h3 style="margin:0">{$t('stats.bySpender')}</h3>
      {#each spenderAgg as agg (agg.key)}
        <div class="row" style="justify-content: space-between">
          <span>{memberName(agg.key)}</span>
          <span>{currency.format(agg.total)} <span class="muted">({agg.count})</span></span>
        </div>
      {/each}
    </div>

    <div class="card stack">
      <h3 style="margin:0">{$t('stats.byName')}</h3>
      {#each nameResult.aggregates.slice(0, 25) as agg (agg.key)}
        <div class="row" style="justify-content: space-between">
          <span>{agg.key}</span>
          <span>{currency.format(agg.total)} <span class="muted">({agg.count})</span></span>
        </div>
      {/each}
      {#if $myAccess.expenses === 'edit' && clustersToReview().length > 0}
        <details>
          <summary class="muted">{$t('stats.suggestedGroupings', { count: clustersToReview().length })}</summary>
          <div class="stack">
            {#each clustersToReview() as cluster (cluster.canonicalName + cluster.members.join())}
              <div class="row" style="justify-content: space-between">
                <span>{cluster.members.join(' + ')} → <strong>{cluster.canonicalName}</strong></span>
                <button onclick={() => acceptCluster(cluster.canonicalName, cluster.members)}>
                  {$t('stats.saveAsAlias')}
                </button>
              </div>
            {/each}
          </div>
        </details>
      {/if}
    </div>

    <div class="card stack">
      <h3 style="margin:0">{$t('stats.expensesHeader', { count: sorted.length })}</h3>
      <div class="stack" style="max-height:400px; overflow-y:auto">
        {#each sorted as expense (expense.id)}
          <div class="row" style="justify-content: space-between">
            <span>{expense.date} · {expense.name}</span>
            <span>{currency.format(expense.price)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
