import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../src/lib/storage/suggest';
import { SYSTEM_ITEMS } from '../src/lib/storage/systemCatalog';
import { expiryAfterMove, parseExpiryInput, suggestExpiry } from '../src/lib/storage/shelfLife';
import { likelyClimate, shelfFor, suggestRowExpiry } from '../src/lib/storage/expirySuggest';
import { unitClimate } from '../src/lib/storage/layout';
import { parseImportText } from '../src/lib/storage/importParse';
import type { LearnedShelfLife, StorageCatalogEntry, StorageUnit } from '../src/lib/types';

const options = mergeCatalog(SYSTEM_ITEMS, [], 'hr');
const day = '2026-11-01';
const unit = (id: string, extra: Partial<StorageUnit>): StorageUnit =>
  ({ id, name: id, kind: 'shelving', levels: 1, rows: 1, cols: 1, categories: [], levelNames: {}, cellNames: {}, createdAt: 0, createdBy: 'a', ...extra }) as StorageUnit;

describe('expiry suggestions', () => {
  it('knows built-in food by any spelling, and leaves non-food alone', () => {
    expect(shelfFor('pileća prsa', options, []).foodType).toBe('poultry');
    expect(shelfFor('Jogurt', options, []).foodType).toBe('yogurt');
    expect(shelfFor('Riža', options, []).foodType).toBe('dry');
    const screws = shelfFor('Vijci', options, []);
    expect(screws.foodType).toBeNull();
    expect(screws.nonFood).toBe(true);
    expect(shelfFor('Domaći ajvar od susjede', options, []).nonFood).toBe(false); // unknown: ask
  });

  it('suggests by where it is kept', () => {
    const chicken = shelfFor('Chicken breast', options, []);
    expect(suggestExpiry(chicken, day, 'fridge')).toMatchObject({ date: '2026-11-03', basis: 'type' });
    expect(suggestExpiry(chicken, day, 'freezer')?.days).toBe(270);
    // Not kept at room temperature at all → its natural place, the fridge.
    expect(suggestExpiry(chicken, day, 'room')?.climate).toBe('fridge');
  });

  it("prefers what the group learned, and Gemini's word on unknown things", () => {
    const learned: LearnedShelfLife[] = [
      { id: 'chicken breast', name: 'Chicken breast', fridge: 3, source: 'user', updatedAt: 0 },
      { id: 'domaci ajvar', name: 'Domaći ajvar', foodType: 'condiment', room: 365, source: 'ai', updatedAt: 0 },
      { id: 'ukras', name: 'Ukras', foodType: null, room: null, fridge: null, freezer: null, source: 'ai', updatedAt: 0 },
    ];
    expect(suggestExpiry(shelfFor('pileća prsa', options, learned), day, 'fridge')).toMatchObject({ days: 3, basis: 'learned' });
    expect(shelfFor('Domaći ajvar', options, learned).foodType).toBe('condiment');
    expect(shelfFor('Ukras', options, learned).nonFood).toBe(true);
  });

  it('assumes the climate of where it was last put away', () => {
    const units = [unit('fr', { kind: 'chest' }), unit('bag', { movable: true, parent: { unitId: 'fr', cellId: '1.1.1' } }), unit('in', { inbox: true })];
    expect(unitClimate(units, 'bag')).toBe('freezer');
    expect(unitClimate(units, 'in')).toBeNull();
    const catalog = [{ id: 'grasak', name: 'Grašak', lastPlace: { unitId: 'bag', cellId: '1.1.1' } }] as StorageCatalogEntry[];
    expect(likelyClimate(shelfFor('Grašak', options, []), catalog, units)).toBe('freezer');
    expect(suggestRowExpiry('Grašak', day, options, [], catalog, units)?.climate).toBe('freezer');
  });
});

describe('moving between climates', () => {
  const chicken = shelfFor('Chicken breast', options, []);
  it('freezing restarts the clock, thawing shortens it', () => {
    expect(expiryAfterMove(chicken, '2026-11-03', 'fridge', 'freezer', day)).toBe('2027-07-29');
    expect(expiryAfterMove(chicken, '2027-07-29', 'freezer', 'fridge', day)).toBe('2026-11-03');
    expect(expiryAfterMove(chicken, '2026-11-02', 'freezer', 'fridge', day)).toBeNull(); // already sooner
    expect(expiryAfterMove(chicken, null, 'fridge', 'freezer', day)).toBeNull();
    expect(expiryAfterMove(chicken, '2026-11-03', 'fridge', 'fridge', day)).toBeNull();
  });
});

describe('typed expiry', () => {
  it('takes days or dates', () => {
    expect(parseExpiryInput('7', day)).toBe('2026-11-08');
    expect(parseExpiryInput('+3d', day)).toBe('2026-11-04');
    expect(parseExpiryInput('2027-01-05', day)).toBe('2027-01-05');
    expect(parseExpiryInput('5.1.2027', day)).toBe('2027-01-05');
    expect(parseExpiryInput('5.1.', day)).toBe('2027-01-05');
    expect(parseExpiryInput('soon', day)).toBeNull();
  });
  it('reads an e column', () => {
    expect(parseImportText('i, q, e\nmlijeko, 2, 7\nsir, 1, 20.11.2026')).toMatchObject([
      { name: 'mlijeko', amount: 2, expiry: '7' },
      { name: 'sir', amount: 1, expiry: '20.11.2026' },
    ]);
  });
});
