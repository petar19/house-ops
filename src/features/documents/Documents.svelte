<script lang="ts">
  import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { activeGroup, myAccess } from '../../lib/stores/groups';
  import { locale, t } from '../../lib/i18n';
  import type { DocumentRecord, DocumentVendor } from '../../lib/types';

  // Deliberately no live onSnapshot anywhere here — everything is an
  // explicit, on-demand fetch triggered by navigation, so opening this tab
  // (or drilling into a vendor) costs only the reads for what's actually
  // being looked at, not the group's entire document history every time.
  let vendors = $state<(DocumentVendor & { id: string })[] | null>(null);
  let vendorsLoading = $state(false);
  let selectedVendor = $state<string | null>(null);
  let documents = $state<DocumentRecord[] | null>(null);
  let documentsLoading = $state(false);
  let expandedId = $state<string | null>(null);
  let error = $state('');

  let currency = $derived(
    new Intl.NumberFormat($locale === 'hr' ? 'hr-HR' : 'en-US', { style: 'currency', currency: 'EUR' }),
  );

  let lastLoadedGroupId: string | null = null;
  $effect(() => {
    const groupId = $myAccess.photoSaving !== 'none' ? ($activeGroup?.id ?? null) : null;
    if (groupId !== lastLoadedGroupId) {
      lastLoadedGroupId = groupId;
      selectedVendor = null;
      documents = null;
      if (groupId) void loadVendors(groupId);
      else vendors = null;
    }
  });

  async function loadVendors(groupId: string) {
    vendorsLoading = true;
    error = '';
    try {
      const snap = await getDocs(
        query(collection(db, 'groups', groupId, 'documentVendors'), orderBy('displayName')),
      );
      vendors = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentVendor) }));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load documents';
    } finally {
      vendorsLoading = false;
    }
  }

  async function openVendor(vendorDisplayName: string) {
    if (!$activeGroup) return;
    selectedVendor = vendorDisplayName;
    documentsLoading = true;
    documents = null;
    error = '';
    try {
      // Sorted client-side rather than via orderBy() — an equality filter
      // plus a sort on a different field needs a composite index, not worth
      // it for what's always a small per-vendor list.
      const snap = await getDocs(
        query(collection(db, 'groups', $activeGroup.id, 'documents'), where('vendor', '==', vendorDisplayName)),
      );
      documents = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, 'id'>) }))
        .sort((a, b) => b.processedAt.localeCompare(a.processedAt));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load documents';
    } finally {
      documentsLoading = false;
    }
  }

  function backToVendors() {
    selectedVendor = null;
    documents = null;
    expandedId = null;
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }
</script>

<div class="page stack">
  <h2 style="margin:0">{$t('documents.title')}</h2>

  {#if !$activeGroup}
    <p class="muted">{$t('exportImport.pickGroup')}</p>
  {:else if !$activeGroup.capabilities.photoSaving}
    <p class="muted">{$t('documents.capabilityOff')}</p>
  {:else if $myAccess.photoSaving === 'none'}
    <p class="muted">{$t('access.noAccess')}</p>
  {:else if selectedVendor}
    <div class="row">
      <button onclick={backToVendors}>← {$t('documents.backToVendors')}</button>
      <h3 style="margin:0">{selectedVendor}</h3>
    </div>
    {#if documentsLoading}
      <p class="muted">{$t('common.loading')}</p>
    {:else if documents && documents.length === 0}
      <p class="muted">{$t('documents.empty')}</p>
    {:else if documents}
      <div class="stack">
        {#each documents as doc (doc.id)}
          <div class="card stack">
            <button
              class="row"
              style="justify-content: space-between; text-align:left; background:none; border:none; padding:0"
              onclick={() => toggleExpanded(doc.id)}
            >
              <div>
                <strong>{doc.date ?? $t('documents.unknownDate')}</strong>
                {#if doc.category}<span class="muted"> · {doc.category}</span>{/if}
                <div class="muted">{doc.sourceFile}</div>
              </div>
              <strong>{doc.amount !== null ? currency.format(doc.amount) : '—'}</strong>
            </button>
            {#if expandedId === doc.id}
              <p class="muted" style="white-space: pre-wrap; margin:0">{doc.fullText || $t('documents.noText')}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else if vendorsLoading}
    <p class="muted">{$t('common.loading')}</p>
  {:else if vendors && vendors.length === 0}
    <p class="muted">{$t('documents.empty')}</p>
  {:else if vendors}
    <div class="stack">
      {#each vendors as vendor (vendor.id)}
        <button class="card row" style="justify-content: space-between; text-align:left" onclick={() => openVendor(vendor.displayName)}>
          <strong>{vendor.displayName}</strong>
          <span class="muted">{$t('documents.vendorCount', { count: vendor.count })}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if error}<p class="muted" style="color: var(--danger)">{error}</p>{/if}
</div>
