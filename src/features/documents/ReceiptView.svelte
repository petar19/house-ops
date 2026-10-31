<script lang="ts">
  import { doc, getDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { locale, t } from '../../lib/i18n';
  import type { DocumentRecord } from '../../lib/types';

  // One scanned bill: shop, date, total, the products read off it (if it
  // was ever imported into storage) and the raw OCR text. Fetched on open.
  let { groupId, documentId }: { groupId: string; documentId: string } = $props();

  let receipt = $state<DocumentRecord | null>(null);
  let error = $state('');
  let showText = $state(false);

  $effect(() => {
    receipt = null;
    error = '';
    getDoc(doc(db, 'groups', groupId, 'documents', documentId))
      .then((snap) => {
        if (snap.exists()) receipt = { id: snap.id, ...(snap.data() as Omit<DocumentRecord, 'id'>) };
        else error = $t('receipt.missing');
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  let currency = $derived(new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }));
</script>

{#if error}
  <p class="muted" style="color: var(--danger)">{error}</p>
{:else if !receipt}
  <p class="muted">{$t('common.loading')}</p>
{:else}
  <div class="stack">
    <div class="row" style="justify-content: space-between">
      <strong>{receipt.vendor}</strong>
      <strong>{receipt.amount !== null ? currency.format(receipt.amount) : '—'}</strong>
    </div>
    <span class="muted">{receipt.date ?? $t('documents.unknownDate')}{#if receipt.category} · {receipt.category}{/if}</span>
    {#if receipt.lineItems?.length}
      <ul class="lines">
        {#each receipt.lineItems as line, i (i)}
          <li>
            <span>{line.name}{#if line.quantity !== null} <span class="muted">{line.quantity}{line.unit ? ' ' + line.unit : ''}</span>{/if}</span>
            {#if line.price !== null && line.price !== undefined}<span>{currency.format(line.price)}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    <button onclick={() => (showText = !showText)}>{showText ? $t('receipt.hideText') : $t('receipt.showText')}</button>
    {#if showText}
      <p class="muted" style="white-space: pre-wrap; margin:0">{receipt.fullText || $t('documents.noText')}</p>
    {/if}
  </div>
{/if}

<style>
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .lines li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--border);
  }
</style>
