import { normalizeText } from '../utils/normalize';
import { unitClimate } from './layout';
import { isFoodType, naturalClimate, suggestExpiry, type Climate, type ShelfLifeSource } from './shelfLife';
import { resolveProduct, type CatalogOption } from './suggest';
import type { LearnedShelfLife, StorageCatalogEntry, StorageUnit } from '../types';

export interface ProductShelf extends ShelfLifeSource {
  productKey: string;
  name: string;
  known: boolean; // a product the app knows (built-in or the group's)
  nonFood: boolean; // a known product that isn't food — never asked about
}

/** Everything known about how long a named thing keeps: its product, learned numbers, food type. */
export function shelfFor(name: string, options: CatalogOption[], learned: LearnedShelfLife[]): ProductShelf {
  const product = resolveProduct(name, options);
  const productKey = product?.productKey ?? normalizeText(name);
  const l = learned.find((x) => x.id === productKey);
  const foodType = isFoodType(l?.foodType) ? l.foodType : (product?.foodType ?? null);
  const shelfLife = l ? { room: l.room ?? null, fridge: l.fridge ?? null, freezer: l.freezer ?? null } : null;
  // Gemini said "not food" (no numbers, no type) — don't ask again either.
  const answeredNotFood = !!l && !foodType && !l.room && !l.fridge && !l.freezer;
  return {
    productKey,
    name: product?.name ?? name.trim(),
    foodType,
    shelfLife,
    known: !!product,
    nonFood: answeredNotFood || (!!product?.builtIn && !foodType),
  };
}

/** Where it'll probably be kept: where it was last put away, else where its kind of food lives. */
export function likelyClimate(p: ProductShelf, catalog: StorageCatalogEntry[], units: StorageUnit[]): Climate {
  const entry = catalog.find((e) => e.id === p.productKey || normalizeText(e.name) === normalizeText(p.name));
  const last = entry?.lastPlace ? unitClimate(units, entry.lastPlace.unitId) : null;
  return last ?? naturalClimate(p);
}

export interface RowExpiry {
  date: string;
  climate: Climate;
  basis: 'learned' | 'type';
}

/** A suggested expiry for something bought on `day`, or null if nothing's known. */
export function suggestRowExpiry(
  name: string,
  day: string,
  options: CatalogOption[],
  learned: LearnedShelfLife[],
  catalog: StorageCatalogEntry[],
  units: StorageUnit[],
): RowExpiry | null {
  if (!name.trim()) return null;
  const p = shelfFor(name, options, learned);
  const climate = likelyClimate(p, catalog, units);
  const s = suggestExpiry(p, day, climate);
  return s ? { date: s.date, climate: s.climate, basis: s.basis } : null;
}
