import type { PriceUnit } from './systemCatalog';

// Turns "2 × 500 g for €3.98" into €3.98/kg, so prices of different pack
// sizes and shops can be compared on one scale per product.

type Base = { unit: PriceUnit; amount: number };

const COUNT_UNITS = new Set(['pcs', 'pack', 'bag', 'box', 'bottle', 'can', 'jar', 'roll']);

function toBase(amount: number, unit: string | null | undefined): Base | null {
  const u = (unit ?? 'pcs').toLowerCase();
  if (u === 'kg') return { unit: 'kg', amount };
  if (u === 'g') return { unit: 'kg', amount: amount / 1000 };
  if (u === 'l') return { unit: 'l', amount };
  if (u === 'ml') return { unit: 'l', amount: amount / 1000 };
  if (COUNT_UNITS.has(u)) return { unit: 'pcs', amount };
  return null;
}

export interface PriceInput {
  price: number | null;
  quantity: number | null;
  unit: string | null;
  packAmount?: number | null; // size of one package, e.g. 500 (g)
  packUnit?: string | null;
}

/**
 * Price per the product's comparison unit (€/kg, €/l or per piece), or null
 * when it can't be worked out — no price, or only a count for something
 * compared by weight with no pack size given.
 */
export function unitPrice(input: PriceInput, priceUnit: PriceUnit): number | null {
  const { price, quantity, unit, packAmount, packUnit } = input;
  if (price === null || price === undefined || !Number.isFinite(price)) return null;
  const qty = quantity && quantity > 0 ? quantity : 1;

  let total: Base | null;
  const pack = packAmount && packAmount > 0 ? toBase(packAmount, packUnit) : null;
  const counted = toBase(qty, unit);
  if (pack && (!counted || counted.unit === 'pcs')) {
    // "2 × 1 l" — the count says how many packages of that size.
    total = { unit: pack.unit, amount: pack.amount * (counted?.amount ?? 1) };
  } else {
    total = counted;
  }
  if (!total || total.amount <= 0) return null;
  if (total.unit === priceUnit) return round(price / total.amount);
  // Compared per piece but bought by weight (or the other way round, with a
  // count): only a plain count of pieces can stand in for "per piece".
  if (priceUnit === 'pcs' && counted?.unit === 'pcs') return round(price / counted.amount);
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function formatUnitPrice(value: number, priceUnit: PriceUnit, format: (n: number) => string): string {
  return priceUnit === 'pcs' ? `${format(value)}/pc` : `${format(value)}/${priceUnit}`;
}
