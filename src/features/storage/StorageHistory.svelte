<script lang="ts">
  import { t } from '../../lib/i18n';
  import { activeGroup } from '../../lib/stores/groups';
  import { loadHistoryPage, storageUnits } from '../../lib/stores/storage';
  import { cellExists } from '../../lib/storage/layout';
  import { describeEvent } from '../../lib/storage/history';
  import type { StorageEvent } from '../../lib/types';

  // A newest-first feed of storage changes — the whole group's, or one
  // unit's when `unitId` is set. Fetched on demand in pages, not kept live.
  let {
    unitId = null,
    onOpenCell,
  }: { unitId?: string | null; onOpenCell?: (unitId: string, cellId: string) => void } = $props();

  let events = $state<StorageEvent[]>([]);
  let loading = $state(false);
  let hasMore = $state(false);
  let error = $state('');

  let groupId = $derived($activeGroup?.id ?? null);

  async function load(reset: boolean) {
    if (!groupId) return;
    loading = true;
    error = '';
    try {
      const before = reset || events.length === 0 ? null : events[events.length - 1].at;
      const seen = new Set(reset ? [] : events.map((e) => e.id));
      const page = await loadHistoryPage(groupId, unitId, before, seen);
      events = reset ? page.events : [...events, ...page.events];
      hasMore = page.hasMore && page.events.length > 0;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void groupId;
    void unitId;
    load(true);
  });

  function memberName(uid: string): string {
    return $activeGroup?.members[uid]?.displayName ?? '?';
  }

  // Where an entry's item is now (or was last): a move points at its
  // destination. Only offered while that unit and cell still exist.
  function target(ev: StorageEvent): { unitId: string; cellId: string } | null {
    const u = ev.action === 'move' && ev.toUnitId ? ev.toUnitId : ev.unitId;
    const c = ev.action === 'move' && ev.toCellId ? ev.toCellId : ev.cellId;
    const unit = $storageUnits.find((x) => x.id === u);
    return unit && cellExists(unit, c) ? { unitId: u, cellId: c } : null;
  }

  function dayLabel(at: number): string {
    return new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Entries grouped under a heading per calendar day.
  let days = $derived.by(() => {
    const groups: { day: string; events: StorageEvent[] }[] = [];
    for (const ev of events) {
      const day = dayLabel(ev.at);
      if (groups.at(-1)?.day !== day) groups.push({ day, events: [] });
      groups.at(-1)!.events.push(ev);
    }
    return groups;
  });

  const ICONS: Record<StorageEvent['action'], string> = { add: '＋', remove: '−', move: '→', edit: '✎' };
</script>

<div class="stack">
  {#if error}
    <p class="muted" style="color: var(--danger); margin:0">{error}</p>
  {/if}

  {#if events.length === 0 && !loading && !error}
    <p class="muted" style="margin:0">{$t('storage.historyEmpty')}</p>
  {/if}

  {#each days as group (group.day)}
    <div class="stack day">
      <h4>{group.day}</h4>
      <ul>
        {#each group.events as ev (ev.id)}
          {@const where = target(ev)}
          <li>
            <span class="icon {ev.action}" aria-hidden="true">{ICONS[ev.action]}</span>
            <div class="body">
              <div>
                {#if where && onOpenCell}
                  <button class="link" onclick={() => onOpenCell(where.unitId, where.cellId)}>{ev.itemName}</button>
                {:else}
                  <strong>{ev.itemName}</strong>
                {/if}
                <span>— {describeEvent(ev, $t)}</span>
              </div>
              <span class="muted">
                {new Date(ev.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {memberName(ev.by)}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/each}

  {#if loading}
    <p class="muted" style="margin:0">{$t('common.loading')}</p>
  {:else if hasMore}
    <button onclick={() => load(false)}>{$t('storage.loadMore')}</button>
  {/if}
</div>

<style>
  .day {
    gap: 0.35rem;
  }
  h4 {
    margin: 0;
    font-size: 0.85em;
    color: var(--text-dim);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  li {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
  }
  .icon {
    flex: 0 0 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.85em;
    background: var(--border);
  }
  .icon.add {
    background: color-mix(in srgb, var(--success) 25%, transparent);
  }
  .icon.remove {
    background: color-mix(in srgb, var(--danger) 25%, transparent);
  }
  .icon.move {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 0.92em;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    font-weight: 600;
    color: var(--accent);
  }
</style>
