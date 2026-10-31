<script lang="ts">
  import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { t } from '../../lib/i18n';
  import { DEFAULT_ALERT_DAYS, parseAlertDays } from '../../lib/storage/expiry';
  import type { DiscoveredWhatsAppGroup, Group, StorageAlertConfig, WhatsAppIntegration } from '../../lib/types';

  // Expiry alerts for storage: on/off, which WhatsApp chat (the expenses
  // chat is offered first), at what time, and how many days ahead.
  let { group }: { group: Group } = $props();

  let config = $state<StorageAlertConfig | null>(null);
  let chats = $state<DiscoveredWhatsAppGroup[]>([]);
  let expensesJid = $state<string | null>(null);
  let loading = $state(true);
  let error = $state('');
  let saved = $state(false);

  let enabled = $state(false);
  let jid = $state('');
  let days = $state<number[]>(DEFAULT_ALERT_DAYS);
  let time = $state('09:00');
  let newDay = $state<number | undefined>(undefined);

  $effect(() => {
    const groupId = group.id;
    const unsubs = [
      onSnapshot(
        doc(db, 'storageAlerts', groupId),
        (snap) => {
          config = snap.exists() ? (snap.data() as StorageAlertConfig) : null;
          enabled = config?.enabled ?? false;
          jid = config?.whatsappGroupJid ?? '';
          days = config?.daysBefore ?? DEFAULT_ALERT_DAYS;
          time = config?.time ?? '09:00';
          loading = false;
        },
        (e) => {
          error = e.message;
          loading = false;
        },
      ),
      onSnapshot(collection(db, 'whatsappGroups'), (snap) => {
        chats = snap.docs.map((d) => d.data() as DiscoveredWhatsAppGroup).sort((a, b) => a.subject.localeCompare(b.subject));
      }),
      onSnapshot(doc(db, 'whatsappIntegrations', groupId), (snap) => {
        expensesJid = snap.exists() ? ((snap.data() as WhatsAppIntegration).whatsappGroupJid ?? null) : null;
      }, () => {}),
    ];
    return () => unsubs.forEach((u) => u());
  });

  // The expenses chat first, so "same chat as expenses" is one obvious pick.
  let orderedChats = $derived(
    [...chats].sort((a, b) => Number(b.jid === expensesJid) - Number(a.jid === expensesJid)),
  );

  function addDay(e: SubmitEvent) {
    e.preventDefault();
    const parsed = parseAlertDays(String(newDay ?? ''));
    if (parsed.length === 0) return;
    days = parseAlertDays([...days, ...parsed].join(','));
    newDay = undefined;
    saved = false;
  }
  function removeDay(d: number) {
    days = days.filter((x) => x !== d);
    saved = false;
  }

  async function save(extra: Partial<StorageAlertConfig> = {}) {
    error = '';
    saved = false;
    if (enabled && !jid) {
      error = $t('alerts.pickChat');
      return;
    }
    try {
      await setDoc(
        doc(db, 'storageAlerts', group.id),
        { enabled, whatsappGroupJid: jid || null, daysBefore: days, time, ...extra },
        { merge: true },
      );
      saved = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function dayLabel(d: number): string {
    return d === 0 ? $t('alerts.onTheDay') : $t('alerts.daysBefore', { days: d });
  }
</script>

<div class="card stack">
  <h3 style="margin:0">⏰ {$t('alerts.title')}</h3>
  <p class="muted" style="margin:0">{$t('alerts.intro')}</p>
  {#if loading}
    <p class="muted">{$t('common.loading')}</p>
  {:else}
    <label class="row">
      <input type="checkbox" bind:checked={enabled} onchange={() => (saved = false)} />
      {$t('alerts.enabled')}
    </label>

    <label class="stack field">
      <span class="muted">{$t('alerts.chat')}</span>
      <select bind:value={jid} onchange={() => (saved = false)}>
        <option value="">—</option>
        {#each orderedChats as c (c.jid)}
          <option value={c.jid}>{c.subject}{c.jid === expensesJid ? ` (${$t('alerts.expensesChat')})` : ''}</option>
        {/each}
      </select>
    </label>

    <label class="stack field">
      <span class="muted">{$t('alerts.time')}</span>
      <input type="time" bind:value={time} onchange={() => (saved = false)} style="width:auto" />
    </label>

    <div class="stack field">
      <span class="muted">{$t('alerts.when')}</span>
      <div class="chips">
        {#each days as d (d)}
          <span class="chip">
            {dayLabel(d)}
            <button type="button" onclick={() => removeDay(d)} aria-label={$t('common.remove')}>×</button>
          </span>
        {/each}
        {#if days.length === 0}<span class="muted">{$t('alerts.noDays')}</span>{/if}
      </div>
      <form class="row" onsubmit={addDay}>
        <input type="number" min="0" max="365" bind:value={newDay} placeholder={$t('alerts.daysPlaceholder')} style="width:7em" />
        <button type="submit">{$t('common.add')}</button>
      </form>
    </div>

    <div class="row">
      <button class="primary" onclick={() => save()}>{$t('common.save')}</button>
      {#if config?.enabled && config.whatsappGroupJid}
        <button onclick={() => save({ testRequestedAt: Date.now() })} title={$t('alerts.testHint')}>{$t('alerts.test')}</button>
      {/if}
      {#if saved}<span class="muted">✓ {$t('alerts.saved')}</span>{/if}
    </div>
    {#if config?.lastSentDate}
      <span class="muted hint">{$t('alerts.lastChecked', { date: config.lastSentDate })}</span>
    {/if}
  {/if}
  {#if error}<p class="muted" style="color: var(--danger); margin:0">{error}</p>{/if}
</div>

<style>
  .field {
    gap: 0.25rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2em 0.3em 0.2em 0.75em;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 0.9em;
  }
  .chip button {
    padding: 0 0.4em;
    border: none;
    background: none;
  }
  .hint {
    font-size: 0.85em;
  }
</style>
