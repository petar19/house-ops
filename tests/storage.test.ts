import { describe, expect, it } from 'vitest';
import {
  allCellIds,
  cellExists,
  cellLabel,
  coveredCellIds,
  coversCell,
  levelLabel,
  orphanedItems,
  placeLabel,
  spanBetween,
  spanFits,
  containersInCell,
  fullPlaceLabel,
  orphanedContainers,
  placeableTargets,
  selfAndDescendants,
  storageLink,
  unitIcon,
  roomOf,
  ROOM_CELL,
  canMerge,
  usualPlace,
} from '../src/lib/storage/layout';
import { matchQuality, mergeCatalog, searchItems, suggest } from '../src/lib/storage/suggest';
import { SYSTEM_ITEMS } from '../src/lib/storage/systemCatalog';
import { describeEvent } from '../src/lib/storage/history';
import type { StorageCatalogEntry, StorageItem, StorageUnit } from '../src/lib/types';

// Echoes the key plus its vars, so assertions don't depend on the dictionaries.
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key;

const unit = (over: Partial<StorageUnit> = {}): StorageUnit => ({
  id: 'u1',
  name: 'Freezer',
  kind: 'chest',
  levels: 3,
  rows: 1,
  cols: 4,
  categories: ['frozen'],
  levelNames: {},
  cellNames: {},
  createdAt: 0,
  createdBy: 'a',
  ...over,
});

const item = (over: Partial<StorageItem> = {}): StorageItem => ({
  id: 'i1',
  unitId: 'u1',
  cellId: '1.1.1',
  name: 'Peas',
  nameKey: 'peas',
  qtyMode: 'count',
  amount: 1,
  unit: 'bag',
  level: null,
  expiry: null,
  note: '',
  addedAt: 0,
  addedBy: 'a',
  updatedAt: 0,
  updatedBy: 'a',
  ...over,
});

const groupEntry = (over: Partial<StorageCatalogEntry> = {}): StorageCatalogEntry => ({
  id: 'x',
  name: 'X',
  categories: [],
  unit: null,
  count: 1,
  lastUsed: 0,
  unitIds: [],
  ...over,
});

describe('storage layout', () => {
  it('enumerates every cell of a 3×(1×4) chest freezer', () => {
    const ids = allCellIds(unit());
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe('1.1.1');
    expect(ids[11]).toBe('3.1.4');
  });

  it('knows which cells a shape has', () => {
    expect(cellExists(unit(), '3.1.4')).toBe(true);
    expect(cellExists(unit(), '4.1.1')).toBe(false);
    expect(cellExists(unit(), 'garbage')).toBe(false);
  });

  it('flags items that a smaller shape would orphan', () => {
    const items = [item({ cellId: '1.1.1' }), item({ id: 'i2', cellId: '3.1.4' })];
    expect(orphanedItems({ levels: 2, rows: 1, cols: 4 }, items).map((i) => i.id)).toEqual(['i2']);
    expect(orphanedItems({ levels: 3, rows: 1, cols: 4 }, items)).toEqual([]);
  });

  it('marks the top and bottom of stacked kinds', () => {
    expect(levelLabel(unit(), 1, t)).toBe('storage.level.chest(1) (storage.top)');
    expect(levelLabel(unit(), 2, t)).toBe('storage.level.chest(2)');
    expect(levelLabel(unit({ kind: 'shelving' }), 1, t)).toBe('storage.level.shelving(1)');
  });

  it('prefers custom names and builds a breadcrumb', () => {
    const u = unit({ cols: 2, levelNames: { '1': 'Meat' }, cellNames: { '1.1.2': 'Ice cream' } });
    expect(cellLabel(u, '1.1.1', t)).toBe('storage.left');
    expect(cellLabel(u, '1.1.2', t)).toBe('Ice cream');
    expect(placeLabel(u, '1.1.2', t)).toBe('Freezer › Meat › Ice cream');
  });
});

describe('storage autocomplete', () => {
  const opts = (group: StorageCatalogEntry[] = [], locale: 'en' | 'hr' = 'en') => mergeCatalog(SYSTEM_ITEMS, group, locale);

  it('grades matches from exact down to a one-letter typo', () => {
    expect(matchQuality('peas', 'Peas')).toBe(4);
    expect(matchQuality('chick', 'Chicken breast')).toBe(3);
    expect(matchQuality('bre', 'Chicken breast')).toBe(2);
    expect(matchQuality('chiken', 'Chicken breast')).toBe(0.5);
    expect(matchQuality('xyz', 'Chicken breast')).toBe(0);
  });

  it("only suggests the unit's categories, counting what it hid", () => {
    const { results, hiddenCount } = suggest('s', opts(), { unitCategories: ['frozen'], unitId: 'u1', showAll: false, limit: 50 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.categories.includes('frozen'))).toBe(true);
    expect(results.some((r) => r.name === 'Screws')).toBe(false);
    expect(hiddenCount).toBeGreaterThan(0);

    const all = suggest('screws', opts(), { unitCategories: ['frozen'], unitId: 'u1', showAll: true });
    expect(all.results[0].name).toBe('Screws');
  });

  it("lets a group's own entry replace the system item it matches, in either language", () => {
    const merged = opts([groupEntry({ id: 'grasak', name: 'Grašak', categories: [], count: 5, unitIds: ['u1'] })], 'en');
    const peas = merged.filter((o) => o.name === 'Peas' || o.name === 'Grašak');
    expect(peas).toHaveLength(1);
    expect(peas[0]).toMatchObject({ source: 'group', name: 'Grašak', categories: ['frozen'], altNames: ['Peas'] });
  });

  it('ranks what this group already keeps in this unit first', () => {
    const merged = opts([groupEntry({ id: 'pork chops', name: 'Pork chops', categories: ['frozen'], count: 3, unitIds: ['u1'] })]);
    const { results } = suggest('p', merged, { unitCategories: ['frozen'], unitId: 'u1', showAll: false });
    expect(results[0].name).toBe('Pork chops');
  });

  it("offers the group's usual items for this unit before anything is typed", () => {
    const merged = opts([
      groupEntry({ id: 'squid', name: 'Squid', categories: ['frozen'], count: 2, unitIds: ['u1'] }),
      groupEntry({ id: 'hammer', name: 'Hammer', categories: ['tools'], count: 9, unitIds: ['garage'] }),
    ]);
    const { results } = suggest('', merged, { unitCategories: ['frozen'], unitId: 'u1', showAll: false });
    expect(results.map((r) => r.name)).toEqual(['Squid']);
  });

  it('suggests everything for a unit with no categories', () => {
    const { results } = suggest('screw', opts(), { unitCategories: [], unitId: 'u1', showAll: false });
    expect(results.map((r) => r.name)).toContain('Screws');
  });
});

describe('storage search', () => {
  const items = [
    item({ id: 'a', name: 'Chicken thighs', nameKey: 'chicken thighs' }),
    item({ id: 'b', name: 'M6 screws', nameKey: 'm6 screws', note: 'stainless' }),
    item({ id: 'c', name: 'Grašak', nameKey: 'grasak' }),
  ];

  it('matches word prefixes, notes and typos', () => {
    expect(searchItems('chick', items).map((i) => i.id)).toEqual(['a']);
    expect(searchItems('thi chi', items).map((i) => i.id)).toEqual(['a']);
    expect(searchItems('stainless', items).map((i) => i.id)).toEqual(['b']);
    expect(searchItems('screwz', items).map((i) => i.id)).toEqual(['b']);
    expect(searchItems('grasak', items).map((i) => i.id)).toEqual(['c']);
    expect(searchItems('', items)).toEqual([]);
  });

  it("finds an item by the catalog's other-language name", () => {
    const options = mergeCatalog(SYSTEM_ITEMS, [], 'hr');
    expect(searchItems('peas', items, options).map((i) => i.id)).toEqual(['c']);
  });
});

describe('storage history wording', () => {
  const ev = { id: 'e', at: 0, by: 'a', itemId: 'i', itemName: 'Peas', unitId: 'u1', cellId: '1.1.1', place: 'Freezer › Layer 1' };

  it('describes a move by where it went', () => {
    expect(describeEvent({ ...ev, action: 'move', toPlace: 'Freezer › Layer 2' }, t)).toBe(
      'storage.history.move(Freezer › Layer 1,Freezer › Layer 2)',
    );
  });

  it('spells out changed values, translating levels and hiding note text', () => {
    const text = describeEvent(
      {
        ...ev,
        action: 'edit',
        changes: { amount: { from: 2, to: 3 }, level: { from: null, to: 'low' }, note: { from: '', to: 'secret' } },
      },
      t,
    );
    expect(text).toBe(
      'storage.history.edit(storage.field.amount 2 → 3, storage.field.level — → storage.qty.low, storage.field.note,Freezer › Layer 1)',
    );
  });
});

describe('storage spans', () => {
  it('covers a box of cells from the anchor', () => {
    expect(coveredCellIds('1.1.3', { levels: 2, rows: 1, cols: 1 })).toEqual(['1.1.3', '2.1.3']);
    expect(coveredCellIds('2.1.1', { levels: 1, rows: 2, cols: 2 })).toEqual(['2.1.1', '2.1.2', '2.2.1', '2.2.2']);
    expect(coveredCellIds('1.1.1')).toEqual(['1.1.1']);
  });

  it('builds the same box whichever corner is tapped first', () => {
    expect(spanBetween('2.2.3', '1.1.3')).toEqual({ cellId: '1.1.3', span: { levels: 2, rows: 2, cols: 1 } });
    expect(spanBetween('1.1.3', '2.2.3')).toEqual(spanBetween('2.2.3', '1.1.3'));
  });

  it('checks a span stays inside the unit', () => {
    expect(spanFits(unit(), '2.1.4', { levels: 2, rows: 1, cols: 1 })).toBe(true);
    expect(spanFits(unit(), '3.1.4', { levels: 2, rows: 1, cols: 1 })).toBe(false);
    expect(spanFits(unit(), '1.1.4', { levels: 1, rows: 1, cols: 2 })).toBe(false);
  });

  it('shows a spanning item in every cell it covers, next to small items', () => {
    const tall = item({ id: 'tall', cellId: '1.1.3', span: { levels: 2, rows: 1, cols: 1 } });
    expect(coversCell(tall, '2.1.3')).toBe(true);
    expect(coversCell(tall, '3.1.3')).toBe(false);
  });

  it('counts an item as orphaned when only its far end falls outside', () => {
    const tall = item({ id: 'tall', cellId: '2.1.1', span: { levels: 2, rows: 1, cols: 1 } });
    expect(orphanedItems({ levels: 2, rows: 1, cols: 4 }, [tall]).map((i) => i.id)).toEqual(['tall']);
    expect(orphanedItems({ levels: 3, rows: 1, cols: 4 }, [tall])).toEqual([]);
  });

  it('labels a span as ranges', () => {
    const shelf = unit({ name: 'Garage', kind: 'shelving', levels: 4, rows: 2, cols: 3 });
    expect(placeLabel(shelf, '2.1.1', t, { levels: 1, rows: 2, cols: 1 })).toBe(
      'Garage › storage.level.shelving(2) › storage.back · storage.left – storage.front · storage.left',
    );
    expect(placeLabel(unit(), '1.1.3', t, { levels: 2, rows: 1, cols: 1 })).toBe(
      'Freezer › storage.level.chest(1) (storage.top) – storage.level.chest(2) › 3',
    );
  });
});

describe('storage containers', () => {
  const shelves = unit({ id: 'shelves', name: 'Garage', kind: 'shelving', levels: 3, rows: 1, cols: 3 });
  const toolbox = unit({ id: 'toolbox', name: 'Red toolbox', kind: 'custom', levels: 2, rows: 1, cols: 1, movable: true,
    levelNames: { '1': 'Top tray' }, parent: { unitId: 'shelves', cellId: '2.1.1' } });
  const tin = unit({ id: 'tin', name: 'Screw tin', kind: 'custom', levels: 1, rows: 1, cols: 1, movable: true,
    parent: { unitId: 'toolbox', cellId: '1.1.1' } });
  const freezer = unit({ id: 'freezer', name: 'Freezer' });
  const units = [shelves, toolbox, tin, freezer];

  it('labels a place through every container it is inside', () => {
    expect(fullPlaceLabel(units, 'tin', '1.1.1', t)).toBe(
      'Garage › storage.level.shelving(2) › storage.left › Red toolbox › Top tray › Screw tin › storage.level.custom(1)',
    );
  });

  it("stops at a parent that doesn't exist instead of failing", () => {
    const lost = unit({ id: 'lost', name: 'Lost box', kind: 'custom', levels: 1, rows: 1, cols: 1, parent: { unitId: 'gone', cellId: '1.1.1' } });
    expect(fullPlaceLabel([lost], 'lost', '1.1.1', t)).toBe('1.1.1 › Lost box › storage.level.custom(1)');
  });

  it("never offers a container's own insides as somewhere to put it", () => {
    expect([...selfAndDescendants(units, 'toolbox')].sort()).toEqual(['tin', 'toolbox']);
    expect(placeableTargets(units, toolbox).map((u) => u.id).sort()).toEqual(['freezer', 'shelves']);
    expect(placeableTargets(units, tin).map((u) => u.id).sort()).toEqual(['freezer', 'shelves', 'toolbox']);
  });

  it('survives a parent loop in bad data', () => {
    const a = unit({ id: 'a', name: 'A', parent: { unitId: 'b', cellId: '1.1.1' } });
    const b = unit({ id: 'b', name: 'B', parent: { unitId: 'a', cellId: '1.1.1' } });
    expect(fullPlaceLabel([a, b], 'a', '1.1.1', t).split(' › ').length).toBeLessThan(40);
    expect(selfAndDescendants([a, b], 'a')).toEqual(new Set(['a', 'b']));
  });

  it('finds containers in a cell, including ones spanning into it', () => {
    const wide = unit({ id: 'wide', name: 'Wide crate', movable: true, parent: { unitId: 'shelves', cellId: '1.1.1', span: { levels: 1, rows: 1, cols: 2 } } });
    expect(containersInCell([...units, wide], 'shelves', '1.1.2').map((u) => u.id)).toEqual(['wide']);
    expect(containersInCell(units, 'shelves', '2.1.1').map((u) => u.id)).toEqual(['toolbox']);
  });

  it('blocks shrinking a unit out from under a container', () => {
    expect(orphanedContainers({ levels: 1, rows: 1, cols: 3 }, units, 'shelves').map((u) => u.id)).toEqual(['toolbox']);
    expect(orphanedContainers({ levels: 3, rows: 1, cols: 3 }, units, 'shelves')).toEqual([]);
  });

  it('uses a chosen icon over the kind default', () => {
    expect(unitIcon({ kind: 'custom', icon: null })).toBe('📦');
    expect(unitIcon({ kind: 'custom', icon: '🟥' })).toBe('🟥');
  });

  it('builds share links that carry the group and optional cell', () => {
    expect(storageLink('https://x.github.io', '/house-ops/', 'g1', 'freezer')).toBe(
      'https://x.github.io/house-ops/#/storage/freezer?group=g1',
    );
    expect(storageLink('https://x.github.io', '/house-ops/', 'g1', 'freezer', '2.1.3')).toBe(
      'https://x.github.io/house-ops/#/storage/freezer?group=g1&cell=2.1.3',
    );
  });
});

describe('storage rooms', () => {
  const living = unit({ id: 'living', name: 'Living room', kind: 'room', levels: 1, rows: 1, cols: 1 });
  const cabinet = unit({ id: 'cabinet', name: 'TV cabinet', kind: 'drawers', levels: 3, rows: 1, cols: 1,
    parent: { unitId: 'living', cellId: ROOM_CELL } });
  const box = unit({ id: 'box', name: 'Cable box', kind: 'custom', levels: 1, rows: 1, cols: 1, movable: true,
    parent: { unitId: 'cabinet', cellId: '2.1.1' } });
  const loose = unit({ id: 'loose', name: 'Garage shelves', kind: 'shelving' });
  const units = [living, cabinet, box, loose];

  it('puts the room name at the front of every path without a cell label of its own', () => {
    expect(placeLabel(living, ROOM_CELL, t)).toBe('Living room');
    expect(fullPlaceLabel(units, 'cabinet', '2.1.1', t)).toBe('Living room › TV cabinet › storage.level.drawers(2)');
    expect(fullPlaceLabel(units, 'box', '1.1.1', t)).toBe(
      'Living room › TV cabinet › storage.level.drawers(2) › Cable box › storage.level.custom(1)',
    );
  });

  it('finds the room a unit is in, however deep', () => {
    expect(roomOf(units, 'box')?.id).toBe('living');
    expect(roomOf(units, 'cabinet')?.id).toBe('living');
    expect(roomOf(units, 'living')?.id).toBe('living');
    expect(roomOf(units, 'loose')).toBeNull();
  });

  it('gives a room the door icon by default', () => {
    expect(unitIcon(living)).toBe('🚪');
  });
});

describe('putting imported things away', () => {
  const freezer = unit({ id: 'freezer', name: 'Freezer' });
  const inbox = unit({ id: 'inbox', name: 'Unsorted', kind: 'custom', levels: 1, rows: 1, cols: 1, inbox: true });
  const units = [freezer, inbox];
  const peas = item({ id: 'p', unitId: 'inbox', cellId: '1.1.1', name: 'Peas', nameKey: 'peas' });

  it('suggests where a thing was last put away', () => {
    const catalog = [{ id: 'peas', lastPlace: { unitId: 'freezer', cellId: '2.1.3' } }];
    expect(usualPlace(catalog, units, peas)).toEqual({ unitId: 'freezer', cellId: '2.1.3' });
  });

  it("doesn't suggest a gone, inbox, too-small or same spot", () => {
    expect(usualPlace([{ id: 'peas', lastPlace: { unitId: 'deleted', cellId: '1.1.1' } }], units, peas)).toBeNull();
    expect(usualPlace([{ id: 'peas', lastPlace: { unitId: 'inbox', cellId: '1.1.1' } }], units, peas)).toBeNull();
    expect(usualPlace([{ id: 'peas', lastPlace: { unitId: 'freezer', cellId: '9.1.1' } }], units, peas)).toBeNull();
    expect(usualPlace([{ id: 'peas' }], units, peas)).toBeNull();
    const tall = { ...peas, span: { levels: 2, rows: 1, cols: 1 } };
    expect(usualPlace([{ id: 'peas', lastPlace: { unitId: 'freezer', cellId: '3.1.1' } }], units, tall)).toBeNull();
  });

  it('merges only the same stock counted the same way', () => {
    const a = item({ id: 'a', nameKey: 'peas', amount: 2, unit: 'bag' });
    expect(canMerge(a, item({ id: 'b', nameKey: 'peas', amount: 1, unit: 'bag' }))).toBe(true);
    expect(canMerge(a, item({ id: 'b', nameKey: 'peas', amount: 1, unit: 'kg' }))).toBe(false);
    expect(canMerge(a, item({ id: 'b', nameKey: 'peas', qtyMode: 'level', amount: null, level: 'some' }))).toBe(false);
    expect(canMerge(a, item({ id: 'b', nameKey: 'peas', amount: 1, unit: 'bag', span: { levels: 2, rows: 1, cols: 1 } }))).toBe(false);
    expect(canMerge(a, item({ id: 'b', nameKey: 'corn', amount: 1, unit: 'bag' }))).toBe(false);
  });
});
