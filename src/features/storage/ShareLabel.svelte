<script lang="ts">
  import qrcode from 'qrcode-generator';
  import { t } from '../../lib/i18n';
  import { storageUnits } from '../../lib/stores/storage';
  import { fullPlaceLabel, storageLink, unitIcon } from '../../lib/storage/layout';
  import type { StorageUnit } from '../../lib/types';

  // Share a unit (or one of its cells): the link itself, a printable QR
  // label, and — on Android Chrome — writing the link onto an NFC sticker.
  // All three carry the same link; the tag and label are just physical
  // copies of it. Opening it still needs sign-in and storage access.
  let { unit, groupId, cellId = null }: { unit: StorageUnit; groupId: string; cellId?: string | null } = $props();

  let link = $derived(storageLink(location.origin, import.meta.env.BASE_URL, groupId, unit.id, cellId));
  let title = $derived(cellId ? fullPlaceLabel($storageUnits, unit.id, cellId, $t) : unit.name);

  let qrSvg = $derived.by(() => {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  });

  let status = $state('');
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  // Web NFC: Chrome on Android only (iPhones can read tags, not write them from a page).
  const canWriteNfc = typeof window !== 'undefined' && 'NDEFReader' in window;
  let nfcWaiting = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      status = $t('share.copied');
    } catch {
      status = $t('share.copyFailed');
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url: link });
    } catch {
      // Dismissing the share sheet throws too — nothing to report.
    }
  }

  async function writeNfc() {
    status = '';
    nfcWaiting = true;
    try {
      // Not in TypeScript's DOM lib yet.
      const Reader = (window as unknown as { NDEFReader: new () => { write: (m: unknown) => Promise<void> } }).NDEFReader;
      await new Reader().write({ records: [{ recordType: 'url', data: link }] });
      status = $t('share.nfcWritten');
    } catch (e) {
      status = $t('share.nfcFailed', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      nfcWaiting = false;
    }
  }
</script>

<div class="stack">
  <div class="label">
    <!-- Generated locally from our own link, so it's safe to inline. -->
    <div class="qr">{@html qrSvg}</div>
    <div class="label-text">
      <strong>{unitIcon(unit)} {title}</strong>
      <span class="muted">HouseOps</span>
    </div>
  </div>

  <input readonly value={link} onfocus={(e) => e.currentTarget.select()} aria-label={$t('share.link')} />

  <div class="row">
    {#if canShare}<button class="primary" onclick={share}>{$t('share.share')}</button>{/if}
    <button onclick={copy}>{$t('share.copy')}</button>
    <button onclick={() => window.print()}>🖨 {$t('share.print')}</button>
    {#if canWriteNfc}
      <button onclick={writeNfc} disabled={nfcWaiting}>📶 {nfcWaiting ? $t('share.nfcHold') : $t('share.nfcWrite')}</button>
    {/if}
  </div>
  {#if status}<p class="muted" style="margin:0">{status}</p>{/if}

  <details>
    <summary class="muted">{$t('share.nfcHowTo')}</summary>
    <p class="muted">{canWriteNfc ? $t('share.nfcHintAndroid') : $t('share.nfcHintOther')}</p>
    <p class="muted" style="margin:0">{$t('share.nfcMetal')}</p>
  </details>
</div>

<style>
  .label {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    background: #fff;
    color: #111;
  }
  .qr {
    width: 9rem;
    flex: 0 0 auto;
  }
  .qr :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }
  .label-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 1.1em;
  }
  .label .muted {
    color: #555;
  }

  /* Printing shows only the label (QR + name), at a sticker-friendly size. */
  @media print {
    :global(body *) {
      visibility: hidden;
    }
    .label,
    .label :global(*) {
      visibility: visible;
    }
    .label {
      position: fixed;
      top: 0;
      left: 0;
      width: 9cm;
      border: 1px dashed #999;
    }
    .qr {
      width: 3.5cm;
    }
  }
</style>
