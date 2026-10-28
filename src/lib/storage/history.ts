import type { Translate } from '../i18n';
import type { StorageEvent } from '../types';

function showValue(field: string, value: unknown, t: Translate): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'level') return t(`storage.qty.${value}`);
  if (field === 'qtyMode') return t(`storage.mode.${value}`);
  return String(value);
}

/** One line describing a history entry, e.g. "Moved from A › B to C › D". */
export function describeEvent(ev: StorageEvent, t: Translate): string {
  if (ev.action === 'move') return t('storage.history.move', { from: ev.place, to: ev.toPlace ?? '' });
  if (ev.action === 'edit') {
    const fields = Object.entries(ev.changes ?? {})
      .map(([field, { from, to }]) =>
        // A note can be long — just say it changed.
        field === 'note'
          ? t(`storage.field.${field}`)
          : `${t(`storage.field.${field}`)} ${showValue(field, from, t)} → ${showValue(field, to, t)}`,
      )
      .join(', ');
    return t('storage.history.edit', { fields, place: ev.place });
  }
  return t(`storage.history.${ev.action}`, { place: ev.place });
}
