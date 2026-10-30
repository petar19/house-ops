<script lang="ts" module>
  import type { StorageLevel } from '../../lib/types';

  export interface ImportRow {
    id: number;
    include: boolean;
    name: string;
    qtyMode: 'count' | 'level';
    amount: number | undefined;
    unit: string;
    level: StorageLevel;
    raw: string | null; // the receipt line it came from, shown under the row
    categories: string[];
    // For the price history (all optional): what the line cost in total,
    // and — under ⋯ — brand, a shop other than the import's, pack size.
    price: number | undefined;
    brand: string;
    shop: string;
    packAmount: number | null;
    packUnit: string | null;
    showMore: boolean;
  }

  let nextId = 1;
  export function newRow(over: Partial<ImportRow> = {}): ImportRow {
    return {
      id: nextId++,
      include: true,
      name: '',
      qtyMode: 'count',
      amount: 1,
      unit: '',
      level: 'some',
      raw: null,
      categories: [],
      price: undefined,
      brand: '',
      shop: '',
      packAmount: null,
      packUnit: null,
      showMore: false,
      ...over,
    };
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { catalogOptions } from '../../lib/stores/storage';
  import { parseImportText } from '../../lib/storage/importParse';
  import type { CatalogOption } from '../../lib/storage/suggest';
  import ItemNameInput from './ItemNameInput.svelte';
  import QtyFields from './QtyFields.svelte';

  // A list you type like lines, but each line has the usual autocomplete:
  // Enter in the name jumps to the amount, Enter there starts a new row.
  // Pasting several lines into a name field splits them into rows.
  let { rows = $bindable(), showInclude = false }: { rows: ImportRow[]; showInclude?: boolean } = $props();

  let listEl: HTMLElement;

  async function focusRow(index: number, field: 'name' | 'amount' = 'name') {
    await tick();
    const row = listEl?.querySelectorAll<HTMLElement>('.import-row')[index];
    const input = field === 'name' ? row?.querySelector<HTMLInputElement>('.autocomplete input') : row?.querySelector<HTMLInputElement>('.qty input');
    input?.focus();
  }

  function onKeydown(e: KeyboardEvent, index: number) {
    if (e.key !== 'Enter' || e.defaultPrevented) return; // autocomplete took it
    const target = e.target as HTMLElement;
    e.preventDefault();
    if (target.closest('.autocomplete')) {
      focusRow(index, 'amount');
    } else {
      if (index === rows.length - 1) rows = [...rows, newRow()];
      focusRow(index + 1);
    }
  }

  function onPaste(e: ClipboardEvent, index: number) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/\n/.test(text.trim())) return; // one line: paste normally
    e.preventDefault();
    const parsed = parseImportText(text).map((p) => {
      const extra = { price: p.price ?? undefined, shop: p.shop ?? '', brand: p.brand ?? '' };
      return p.level
        ? newRow({ name: p.name, qtyMode: 'level', level: p.level, ...extra })
        : newRow({ name: p.name, amount: p.amount ?? 1, unit: p.unit ?? '', ...extra });
    });
    // Replace this row if it was still empty, otherwise insert after it.
    const keep = rows[index].name.trim() ? 1 : 0;
    rows = [...rows.slice(0, index + keep), ...parsed, ...rows.slice(index + 1)];
  }

  function pick(row: ImportRow, option: CatalogOption) {
    if (option.unit) row.unit = option.unit;
    row.categories = option.categories;
  }

  function remove(index: number) {
    rows = rows.length === 1 ? [newRow()] : rows.filter((_, i) => i !== index);
  }
</script>

<div class="stack" bind:this={listEl}>
  {#each rows as row, i (row.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="import-row" class:excluded={!row.include} onkeydown={(e) => onKeydown(e, i)} onpaste={(e) => onPaste(e, i)}>
      <div class="row line">
        {#if showInclude}
          <input type="checkbox" bind:checked={row.include} aria-label={$t('import.include')} />
        {/if}
        <ItemNameInput
          bind:value={row.name}
          options={$catalogOptions}
          unitCategories={[]}
          unitId=""
          placeholder={$t('import.namePlaceholder')}
          onPick={(o) => pick(row, o)}
        />
        <QtyFields bind:qtyMode={row.qtyMode} bind:amount={row.amount} bind:unit={row.unit} bind:level={row.level} />
        <input
          class="price"
          type="number"
          min="0"
          step="0.01"
          bind:value={row.price}
          placeholder="€"
          aria-label={$t('import.price')}
          title={$t('import.price')}
        />
        <button
          type="button"
          class="more"
          class:on={row.showMore || row.brand || row.shop}
          onclick={() => (row.showMore = !row.showMore)}
          aria-label={$t('import.moreDetails')}
          title={$t('import.moreDetails')}
        >⋯</button>
        <button type="button" class="remove" onclick={() => remove(i)} aria-label={$t('common.remove')}>✕</button>
      </div>
      {#if row.showMore}
        <div class="row details">
          <input bind:value={row.brand} placeholder={$t('import.brand')} aria-label={$t('import.brand')} />
          <input bind:value={row.shop} placeholder={$t('import.rowShop')} aria-label={$t('import.rowShop')} />
        </div>
      {/if}
      {#if row.raw}<span class="muted raw">{$t('import.fromLine', { line: row.raw })}</span>{/if}
    </div>
  {/each}
  <button type="button" onclick={() => ((rows = [...rows, newRow()]), focusRow(rows.length))}>+ {$t('import.addRow')}</button>
</div>

<style>
  .import-row {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .line {
    flex-wrap: nowrap;
    align-items: flex-start;
  }
  .excluded {
    opacity: 0.45;
  }
  .raw {
    padding-left: 0.25rem;
    font-size: 0.82em;
  }
  .remove,
  .more {
    padding: 0.45em 0.6em;
  }
  .more.on {
    color: var(--accent);
    border-color: var(--accent);
  }
  .price {
    width: 5.5em !important;
    flex: 0 0 auto;
  }
  .details {
    flex-wrap: nowrap;
    padding-left: 0.25rem;
  }
  .details input {
    flex: 1 1 8rem;
    width: auto;
  }
  @media (max-width: 520px) {
    .line {
      flex-wrap: wrap;
    }
  }
</style>
