<script lang="ts">
  import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { currentUser } from '../../lib/stores/auth';
  import { myGroups } from '../../lib/stores/groups';
  import { t } from '../../lib/i18n';
  import type { Reminder } from '../../lib/types';

  // Not gated by an active group — a personal reminder isn't tied to one at
  // all, and group-scoped reminders are listed for every group you're in
  // regardless of which one happens to be active in the switcher.
  let ownedByMe = $state<Reminder[]>([]);
  let targetingMe = $state<Reminder[]>([]);
  let groupReminders = $state<Reminder[]>([]);

  // Personal list: two single-field queries (ownerUid==uid, targetUid==uid)
  // merged client-side by doc id, rather than one compound query — avoids
  // needing a composite index just for this page. A reminder someone made
  // for themselves shows up in both, so ownedByMe is filtered to scope
  // 'personal' (ownerUid also matches group reminders they created) and the
  // merge below dedupes by id.
  $effect(() => {
    const uid = $currentUser?.uid;
    if (!uid) {
      ownedByMe = [];
      targetingMe = [];
      return;
    }
    const unsubs = [
      onSnapshot(query(collection(db, 'reminders'), where('ownerUid', '==', uid)), (snap) => {
        ownedByMe = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, 'id'>) }))
          .filter((r) => r.scope === 'personal');
      }),
      onSnapshot(query(collection(db, 'reminders'), where('targetUid', '==', uid)), (snap) => {
        targetingMe = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, 'id'>) }));
      }),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let myGroupIds = $derived($myGroups.map((g) => g.id));

  // One subcollection listener per group rather than a single cross-group
  // query — group reminders live at groups/{groupId}/reminders specifically
  // so their security rule can check membership using the group id from the
  // document's PATH (see firestore.rules); that only works one group's
  // subcollection at a time, not via a top-level `where('groupId', 'in', …)`
  // query, which is exactly the shape that turned out to be unprovable-safe
  // and came back permission-denied for every reminder, not just group ones.
  $effect(() => {
    const ids = myGroupIds;
    if (ids.length === 0) {
      groupReminders = [];
      return;
    }
    const byGroupId = new Map<string, Reminder[]>();
    const unsubs = ids.map((groupId) =>
      onSnapshot(collection(db, 'groups', groupId, 'reminders'), (snap) => {
        byGroupId.set(
          groupId,
          snap.docs.map((d) => ({ id: d.id, groupId, ...(d.data() as Omit<Reminder, 'id' | 'groupId'>) })),
        );
        groupReminders = [...byGroupId.values()].flat();
      }),
    );
    return () => unsubs.forEach((u) => u());
  });

  let personalReminders = $derived.by(() => {
    const byId = new Map<string, Reminder>();
    for (const r of ownedByMe) byId.set(r.id, r);
    for (const r of targetingMe) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => a.nextTriggerAt.localeCompare(b.nextTriggerAt));
  });

  function groupName(groupId: string): string {
    return $myGroups.find((g) => g.id === groupId)?.name ?? groupId;
  }

  let groupedGroupReminders = $derived.by(() => {
    const byGroup = new Map<string, Reminder[]>();
    for (const r of groupReminders) {
      const list = byGroup.get(r.groupId!) ?? [];
      list.push(r);
      byGroup.set(r.groupId!, list);
    }
    for (const list of byGroup.values()) list.sort((a, b) => a.nextTriggerAt.localeCompare(b.nextTriggerAt));
    return [...byGroup.entries()];
  });

  function formatNext(r: Reminder): string {
    const d = new Date(r.nextTriggerAt);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  // A reminder created via the WhatsApp ?reminder(WHEN, REPEAT) command
  // stores a fixed-duration repeat (periodSeconds, e.g. "7d") rather than the
  // app picker's calendar-based periodUnit/periodAmount — see the Reminder
  // type for why those are mutually exclusive.
  function formatDurationSeconds(totalSeconds: number): string {
    const units: [string, number][] = [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]];
    const parts: string[] = [];
    let remaining = totalSeconds;
    for (const [label, size] of units) {
      const count = Math.floor(remaining / size);
      if (count > 0) {
        parts.push(`${count}${label}`);
        remaining -= count * size;
      }
    }
    return parts.length > 0 ? parts.join(' ') : '0s';
  }

  function periodLabel(r: Reminder): string {
    if (r.scheduleType !== 'recurring') return '';
    if (r.periodSeconds) return $t('reminders.everyDuration', { duration: formatDurationSeconds(r.periodSeconds) });
    const amount = r.periodAmount ?? 1;
    const unit = $t(`reminders.unit.${r.periodUnit ?? 'day'}`);
    return amount === 1 ? $t('reminders.everyOne', { unit }) : $t('reminders.everyN', { amount, unit });
  }

  // --- create form ---
  let newScope = $state<'personal' | 'group'>('personal');
  let newTargetUid = $state('');
  let newGroupId = $state('');
  let newText = $state('');
  let newWhen = $state('');
  let newScheduleType = $state<'once' | 'recurring'>('once');
  let newPeriodAmount = $state(1);
  let newPeriodUnit = $state<'day' | 'week' | 'month'>('day');
  let error = $state('');
  let saving = $state(false);

  // Every member across every group the user belongs to, deduped by uid —
  // lets a personal reminder be aimed at anyone in the household, not just
  // whoever happens to share a group with the current group switcher choice.
  let allKnownMembers = $derived.by(() => {
    const byUid = new Map<string, string>();
    for (const g of $myGroups) {
      for (const [uid, m] of Object.entries(g.members)) byUid.set(uid, m.displayName);
    }
    return [...byUid.entries()];
  });

  function resetForm() {
    newText = '';
    newWhen = '';
    newScheduleType = 'once';
    newPeriodAmount = 1;
    newPeriodUnit = 'day';
    newTargetUid = '';
  }

  async function handleCreate() {
    if (!$currentUser) return;
    error = '';
    const text = newText.trim();
    if (!text || !newWhen) {
      error = $t('reminders.missingFields');
      return;
    }
    if (newScope === 'group' && !newGroupId) {
      error = $t('reminders.pickGroup');
      return;
    }
    saving = true;
    try {
      const target = newScope === 'group' ? collection(db, 'groups', newGroupId, 'reminders') : collection(db, 'reminders');
      await addDoc(target, {
        ownerUid: $currentUser.uid,
        scope: newScope,
        ...(newScope === 'group' ? { groupId: newGroupId } : {}),
        ...(newScope === 'personal' && newTargetUid ? { targetUid: newTargetUid } : {}),
        text,
        scheduleType: newScheduleType,
        nextTriggerAt: newWhen,
        ...(newScheduleType === 'recurring' ? { periodAmount: newPeriodAmount, periodUnit: newPeriodUnit } : {}),
        status: 'active',
        createdAt: Date.now(),
        source: 'app',
      });
      resetForm();
    } catch (e) {
      error = e instanceof Error ? e.message : $t('reminders.addFailed');
    } finally {
      saving = false;
    }
  }

  // Personal reminders live at reminders/{id}; group ones at
  // groups/{groupId}/reminders/{id} — see firestore.rules for why.
  function reminderRef(r: Reminder) {
    return r.groupId ? doc(db, 'groups', r.groupId, 'reminders', r.id) : doc(db, 'reminders', r.id);
  }

  async function togglePause(r: Reminder) {
    await updateDoc(reminderRef(r), { status: r.status === 'paused' ? 'active' : 'paused' });
  }

  async function snoozeOneDay(r: Reminder) {
    const d = new Date(r.nextTriggerAt);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    await updateDoc(reminderRef(r), { nextTriggerAt: `${yyyy}-${mm}-${dd}T${hh}:${mi}` });
  }

  async function removeReminder(r: Reminder) {
    if (!confirm($t('reminders.deleteConfirm'))) return;
    await deleteDoc(reminderRef(r));
  }
</script>

<div class="page stack">
  <h2 style="margin:0">{$t('reminders.title')}</h2>
  <p class="muted">{$t('reminders.description')}</p>

  <div class="card stack">
    <h3 style="margin:0">{$t('reminders.newTitle')}</h3>
    <form class="stack" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
      <label>
        {$t('reminders.textLabel')}
        <input bind:value={newText} placeholder={$t('reminders.textPlaceholder')} required />
      </label>

      <div class="row">
        <label class="row"><input type="radio" name="scope" value="personal" bind:group={newScope} /> {$t('reminders.scopePersonal')}</label>
        <label class="row"><input type="radio" name="scope" value="group" bind:group={newScope} /> {$t('reminders.scopeGroup')}</label>
      </div>

      {#if newScope === 'personal'}
        <label>
          {$t('reminders.forLabel')}
          <select bind:value={newTargetUid}>
            <option value="">{$t('reminders.forMe')}</option>
            {#each allKnownMembers as [uid, name] (uid)}
              {#if uid !== $currentUser?.uid}
                <option value={uid}>{name}</option>
              {/if}
            {/each}
          </select>
        </label>
      {:else}
        <label>
          {$t('reminders.groupLabel')}
          <select bind:value={newGroupId}>
            <option value="">{$t('reminders.chooseGroup')}</option>
            {#each $myGroups as g (g.id)}
              <option value={g.id}>{g.name}</option>
            {/each}
          </select>
        </label>
        <p class="muted">{$t('reminders.groupHint')}</p>
      {/if}

      <label>
        {$t('reminders.whenLabel')}
        <input type="datetime-local" bind:value={newWhen} required />
      </label>

      <div class="row">
        <label class="row"><input type="radio" name="schedule" value="once" bind:group={newScheduleType} /> {$t('reminders.once')}</label>
        <label class="row"><input type="radio" name="schedule" value="recurring" bind:group={newScheduleType} /> {$t('reminders.recurring')}</label>
      </div>
      {#if newScheduleType === 'recurring'}
        <div class="row">
          <span>{$t('reminders.every')}</span>
          <input type="number" min="1" style="width:5em" bind:value={newPeriodAmount} />
          <select bind:value={newPeriodUnit}>
            <option value="day">{$t('reminders.unit.day')}</option>
            <option value="week">{$t('reminders.unit.week')}</option>
            <option value="month">{$t('reminders.unit.month')}</option>
          </select>
        </div>
      {/if}

      {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
      <div class="row">
        <button class="primary" type="submit" disabled={saving}>{$t('reminders.add')}</button>
      </div>
    </form>
  </div>

  <div class="card stack">
    <h3 style="margin:0">{$t('reminders.personalTitle')}</h3>
    {#if personalReminders.length === 0}
      <p class="muted">{$t('reminders.empty')}</p>
    {:else}
      {#each personalReminders as r (r.id)}
        <div class="row" style="justify-content: space-between">
          <div>
            <strong>{r.text}</strong>
            <div class="muted">
              {formatNext(r)} {periodLabel(r)}
              {#if r.targetUid && r.targetUid !== r.ownerUid}
                · {$t('reminders.forSomeone', { name: allKnownMembers.find(([uid]) => uid === r.targetUid)?.[1] ?? r.targetUid })}
              {/if}
              {#if r.timesRemaining !== undefined && r.status !== 'done'} · {$t('reminders.timesLeft', { count: r.timesRemaining })}{/if}
              {#if r.status === 'paused'} · {$t('reminders.paused')}{/if}
              {#if r.status === 'done'} · {$t('reminders.done')}{/if}
            </div>
          </div>
          <div class="row">
            <button onclick={() => snoozeOneDay(r)}>{$t('reminders.snooze')}</button>
            {#if r.status !== 'done'}
              <button onclick={() => togglePause(r)}>{r.status === 'paused' ? $t('reminders.resume') : $t('reminders.pause')}</button>
            {/if}
            <button class="danger" onclick={() => removeReminder(r)}>{$t('common.remove')}</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  {#each groupedGroupReminders as [groupId, list] (groupId)}
    <div class="card stack">
      <h3 style="margin:0">{$t('reminders.groupTitle', { name: groupName(groupId) })}</h3>
      {#each list as r (r.id)}
        <div class="row" style="justify-content: space-between">
          <div>
            <strong>{r.text}</strong>
            <div class="muted">
              {formatNext(r)} {periodLabel(r)}
              {#if r.timesRemaining !== undefined && r.status !== 'done'} · {$t('reminders.timesLeft', { count: r.timesRemaining })}{/if}
              {#if r.status === 'paused'} · {$t('reminders.paused')}{/if}
              {#if r.status === 'done'} · {$t('reminders.done')}{/if}
            </div>
          </div>
          <div class="row">
            <button onclick={() => snoozeOneDay(r)}>{$t('reminders.snooze')}</button>
            {#if r.status !== 'done'}
              <button onclick={() => togglePause(r)}>{r.status === 'paused' ? $t('reminders.resume') : $t('reminders.pause')}</button>
            {/if}
            <button class="danger" onclick={() => removeReminder(r)}>{$t('common.remove')}</button>
          </div>
        </div>
      {/each}
    </div>
  {/each}
</div>
