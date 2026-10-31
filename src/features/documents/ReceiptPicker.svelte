<script lang="ts">
  import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { locale, t } from '../../lib/i18n';
  import { rankReceipts } from '../../lib/documents/match';
  import type { DocumentRecord } from '../../lib/types';

  // Picks the scanned bill an expense was paid with. The likely ones (same
  // total, a date within a few days) come first; a search narrows by shop.
  let {
    groupId,
    price,
    date,
    onPick,
  }: { groupId: string; price: number | null; date: string; onPick: (doc: DocumentRecord) => void } = $props();

  let docs = $state<DocumentRecord[] | null>(null);
  let error = $state('');
  let search = $state('');

  $effect(() => {
    getDocs(query(collection(db, 'groups', groupId, 'documents'), orderBy('processedAt', 'desc'), limit(80)))
      .then((snap) => (docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, 'id'>) }))))
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  let ranked = $derived(docs ? rankReceipts(docs, price, date, search).slice(0, 25) : []);
  let currency = $derived(new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }));
</script>

<div class="stack">
  <input type="search" bind:value={search} placeholder={$t('receipt.searchShop')} />
  {#if error}
    <p class="muted" style="color: var(--danger); margin:0">{error}</p>
  {:else if docs === null}
    <p class="muted" style="margin:0">{$t('common.loading')}</p>
  {:else if ranked.length === 0}
    <p class="muted" style="margin:0">{$t('documents.empty')}</p>
  {:else}
    <div class="list">
      {#each ranked as m (m.doc.id)}
        <button type="button" class="pick" onclick={() => onPick(m.doc)}>
          <span class="row" style="justify-content: space-between; flex-wrap: nowrap">
            <strong>{m.doc.vendor}</strong>
            <span class:match={m.sameAmount}>{m.doc.amount !== null ? currency.format(m.doc.amount) : '—'}</span>
          </span>
          <span class="muted">
            {m.doc.date ?? $t('documents.unknownDate')}
            {#if m.sameAmount}· {$t('receipt.sameAmount')}{:else if m.near}· {$t('receipt.nearDate')}{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    max-height: 18rem;
    overflow-y: auto;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: none;
    padding: 0.45rem 0.25rem;
  }
  .match {
    color: var(--success);
    font-weight: 600;
  }
</style>
