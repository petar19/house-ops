<script lang="ts">
  import { t } from '../../lib/i18n';
  import { suggest, type CatalogOption } from '../../lib/storage/suggest';

  // Name field with category-aware suggestions: by default only items whose
  // categories overlap the unit's (or that were stored in this unit before),
  // with a "show all" escape hatch. Typing a name that isn't suggested is
  // fine — it becomes a new catalog entry on save.
  let {
    value = $bindable(''),
    options,
    unitCategories,
    unitId,
    placeholder = '',
    onPick,
  }: {
    value?: string;
    options: CatalogOption[];
    unitCategories: string[];
    unitId: string;
    placeholder?: string;
    onPick?: (option: CatalogOption) => void;
  } = $props();

  let open = $state(false);
  let showAll = $state(false);
  let activeIndex = $state(-1);

  let result = $derived(suggest(value, options, { unitCategories, unitId, showAll }));

  $effect(() => {
    // Any new query starts with nothing highlighted, so Enter submits the
    // typed text as-is unless the user deliberately arrowed onto a suggestion.
    void value;
    activeIndex = -1;
  });

  function pick(option: CatalogOption) {
    value = option.name;
    open = false;
    onPick?.(option);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open || result.results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % result.results.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = activeIndex <= 0 ? result.results.length - 1 : activeIndex - 1;
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pick(result.results[activeIndex]);
    } else if (e.key === 'Escape') {
      // Only close the list — not the modal this input is usually inside.
      e.stopPropagation();
      open = false;
    }
  }
</script>

<div class="autocomplete">
  <input
    bind:value
    {placeholder}
    autocomplete="off"
    onfocus={() => (open = true)}
    onblur={() => (open = false)}
    oninput={() => (open = true)}
    onkeydown={handleKeydown}
  />
  {#if open && (result.results.length > 0 || result.hiddenCount > 0 || showAll)}
    <!-- mousedown + preventDefault keeps focus in the input, so blur doesn't
         close the list before the click lands. -->
    <ul class="suggestions card" role="listbox">
      {#each result.results as option, i (option.key)}
        <li role="option" aria-selected={i === activeIndex}>
          <button
            type="button"
            class:active={i === activeIndex}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => pick(option)}
          >
            <span>{option.name}</span>
            {#if option.unit}<span class="muted">{option.unit}</span>{/if}
          </button>
        </li>
      {/each}
      {#if result.hiddenCount > 0 || showAll}
        <li>
          <button type="button" class="toggle" onmousedown={(e) => e.preventDefault()} onclick={() => (showAll = !showAll)}>
            {showAll ? $t('storage.suggestFiltered') : $t('storage.suggestShowAll', { count: result.hiddenCount })}
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .autocomplete {
    flex: 1 1 10rem;
    min-width: 8rem;
  }
  /* In the page flow rather than a floating overlay: this input mostly
     lives inside a scrolling modal, where an absolutely positioned list
     gets clipped by the modal's own overflow. */
  .suggestions {
    margin: 2px 0 0;
    padding: 0.25rem;
    list-style: none;
    max-height: 16rem;
    overflow-y: auto;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  }
  .suggestions button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    border: none;
    border-radius: 6px;
    padding: 0.4em 0.6em;
    text-align: left;
  }
  .suggestions button:hover,
  .suggestions button.active {
    background: var(--bg);
  }
  .suggestions .toggle {
    color: var(--accent);
    font-size: 0.9em;
  }
</style>
