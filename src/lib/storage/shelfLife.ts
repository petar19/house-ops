// How long food keeps, so an expiry date can be suggested instead of typed.
// Three layers, most specific first:
//   1. what this group has learned for the product — dates someone typed or
//      confirmed, or what Gemini answered once for it (storageCatalog
//      .shelfLife / .foodType) — so the same product never needs asking twice;
//   2. the product's food type (built-in products below have one);
//   3. nothing — then the app can ask Gemini, and remembers the answer.
// Days depend on where it's kept: a unit's climate (room / fridge / freezer).
// Freezing restarts the clock: moving into a freezer gives the freezer
// number from that day, taking it out the (short) fridge one.

export type Climate = 'room' | 'fridge' | 'freezer';
export type ShelfLife = Partial<Record<Climate, number | null>>;

export interface FoodTypeInfo {
  en: string;
  hr: string;
  natural: Climate; // where it's normally kept
  days: ShelfLife; // null/absent = not kept like that
}

// Rough, cautious household numbers (unopened where it matters).
export const FOOD_TYPES = {
  poultry: { en: 'Poultry', hr: 'Perad', natural: 'fridge', days: { fridge: 2, freezer: 270 } },
  meat: { en: 'Meat', hr: 'Meso', natural: 'fridge', days: { fridge: 4, freezer: 240 } },
  mince: { en: 'Minced meat', hr: 'Mljeveno meso', natural: 'fridge', days: { fridge: 2, freezer: 120 } },
  fish: { en: 'Fish & seafood', hr: 'Riba i plodovi mora', natural: 'fridge', days: { fridge: 2, freezer: 180 } },
  deli: { en: 'Deli & sausages', hr: 'Suhomesnato', natural: 'fridge', days: { fridge: 10, freezer: 60 } },
  milk: { en: 'Milk & cream', hr: 'Mlijeko i vrhnje', natural: 'fridge', days: { fridge: 6, freezer: 90 } },
  yogurt: { en: 'Yogurt & fresh dairy', hr: 'Jogurt i svježe mliječno', natural: 'fridge', days: { fridge: 12, freezer: 60 } },
  cheese: { en: 'Cheese', hr: 'Sir', natural: 'fridge', days: { fridge: 21, freezer: 180 } },
  butter: { en: 'Butter & fats', hr: 'Maslac i masti', natural: 'fridge', days: { fridge: 60, freezer: 270 } },
  eggs: { en: 'Eggs', hr: 'Jaja', natural: 'fridge', days: { room: 21, fridge: 28 } },
  bread: { en: 'Bread', hr: 'Kruh', natural: 'room', days: { room: 3, fridge: 7, freezer: 90 } },
  pastry: { en: 'Pastry & dough', hr: 'Tijesto i peciva', natural: 'fridge', days: { room: 2, fridge: 5, freezer: 90 } },
  fruit: { en: 'Fruit', hr: 'Voće', natural: 'room', days: { room: 5, fridge: 10, freezer: 300 } },
  berries: { en: 'Berries & soft fruit', hr: 'Bobičasto i mekano voće', natural: 'fridge', days: { room: 1, fridge: 4, freezer: 300 } },
  vegetables: { en: 'Vegetables', hr: 'Povrće', natural: 'fridge', days: { room: 4, fridge: 10, freezer: 300 } },
  leafy: { en: 'Leafy greens & herbs', hr: 'Lisnato povrće i bilje', natural: 'fridge', days: { room: 1, fridge: 5, freezer: 240 } },
  roots: { en: 'Potatoes, onions & roots', hr: 'Krumpir, luk i korjenasto', natural: 'room', days: { room: 30, fridge: 30 } },
  readyMeal: { en: 'Ready meals & leftovers', hr: 'Gotova jela', natural: 'fridge', days: { fridge: 3, freezer: 90 } },
  frozen: { en: 'Bought frozen', hr: 'Kupljeno smrznuto', natural: 'freezer', days: { fridge: 2, freezer: 270 } },
  iceCream: { en: 'Ice cream', hr: 'Sladoled', natural: 'freezer', days: { freezer: 180 } },
  dry: { en: 'Dry goods', hr: 'Suha hrana', natural: 'room', days: { room: 365 } },
  snacks: { en: 'Snacks & sweets', hr: 'Grickalice i slatkiši', natural: 'room', days: { room: 180 } },
  canned: { en: 'Canned & jars', hr: 'Konzerve i staklenke', natural: 'room', days: { room: 730 } },
  condiment: { en: 'Sauces & spreads', hr: 'Umaci i namazi', natural: 'room', days: { room: 270, fridge: 180 } },
  drinks: { en: 'Drinks', hr: 'Pića', natural: 'room', days: { room: 365 } },
  juice: { en: 'Juice & plant milk', hr: 'Sok i biljno mlijeko', natural: 'room', days: { room: 180, fridge: 7 } },
} satisfies Record<string, FoodTypeInfo>;

export type FoodType = keyof typeof FOOD_TYPES;
export const FOOD_TYPE_IDS = Object.keys(FOOD_TYPES) as FoodType[];
export const isFoodType = (v: unknown): v is FoodType => typeof v === 'string' && v in FOOD_TYPES;

// Built-in products by key (normalized English name). Anything not listed
// falls back to its storage category below — only for categories that keep
// alike (a fridge or produce item could be anything, so those are asked).
const BY_KEY: Record<string, FoodType> = {};
const assign = (type: FoodType, keys: string) => keys.split('|').forEach((k) => (BY_KEY[k.trim()] = type));
assign('poultry', 'chicken breast|chicken thighs|chicken wings|whole chicken|turkey');
assign('meat', 'pork chops|beef|pork');
assign('mince', 'minced meat|cevapi|burgers');
assign('fish', 'hake|salmon|fish fillets|squid|shrimp|fish');
assign('deli', 'ham|prosciutto|salami|bacon|hot dogs|smoked meat|sausages|tofu');
assign('milk', 'milk|cooking cream|whipping cream|sour cream|kefir');
assign('yogurt', 'yogurt|cottage cheese|cream cheese|pudding|hummus|fresh pasta');
assign('cheese', 'cheese|gouda|feta|mozzarella|parmesan');
assign('butter', 'butter|margarine');
assign('eggs', 'eggs');
assign('bread', 'bread|toast bread|burek|croissants');
assign('pastry', 'puff pastry|dumplings');
assign('fruit', 'lemons|apples|bananas|oranges|mandarins|pears|grapes|kiwi|avocado|watermelon|peaches|plums|pumpkin');
assign('berries', 'strawberries|cherries|berries');
assign('vegetables', 'broccoli|tomatoes|cucumbers|bell peppers|cabbage|zucchini|eggplant|cauliflower|mushrooms|leek|celery|radishes|ginger|spring onions');
assign('leafy', 'spinach|lettuce|parsley|swiss chard|basil');
assign('roots', 'potatoes|onions|garlic|carrots|beetroot|sweet potatoes');
assign('readyMeal', 'soup|sarma');
assign('frozen', 'chicken nuggets|frozen fruit|peas|mixed vegetables|french fries|fish sticks|pizza');
assign('iceCream', 'ice cream');
assign('snacks', 'crackers|rice cakes|pretzels|popcorn|candy|gummy candy|wafers|protein bars|biscuits|chips|chocolate|dried fruit|raisins|nuts|almonds|walnuts|hazelnuts|peanuts');
assign('condiment', 'mayonnaise|ketchup|mustard|pesto|ajvar|jam|honey|pate|chocolate spread|peanut butter|soy sauce');
assign('juice', 'orange juice|apple juice|juice|plant milk|long life milk');
assign('drinks', 'iced tea|energy drink|cola|sparkling wine|red wine|white wine|rakija|tonic|sparkling water|water|mineral water|beer|wine|soda|spirits|syrup');

const BY_CATEGORY: Record<string, FoodType> = {
  dry: 'dry',
  spices: 'dry',
  canned: 'canned',
  drinks: 'drinks',
  frozen: 'frozen',
};

// Non-food things in these categories (ice, baby shampoo…) get no date.
const NOT_FOOD = new Set(['ice']);

/** The built-in food type of a product, if it's food. */
export function builtInFoodType(key: string, categories: string[]): FoodType | null {
  if (NOT_FOOD.has(key)) return null;
  if (BY_KEY[key]) return BY_KEY[key];
  for (const c of categories) if (BY_CATEGORY[c]) return BY_CATEGORY[c];
  return null;
}

export interface ShelfLifeSource {
  // From the product (group catalog entry / built-in), see CatalogOption.
  foodType: FoodType | null;
  shelfLife?: ShelfLife | null; // learned for this product
}

export interface ExpiryGuess {
  days: number;
  climate: Climate;
  // learned: this group's own number for the product; type: from its food type.
  basis: 'learned' | 'type';
}

/** How many days a product keeps in a climate, or null if unknown / not kept there. */
export function shelfDays(p: ShelfLifeSource, climate: Climate): ExpiryGuess | null {
  const learned = p.shelfLife?.[climate];
  if (typeof learned === 'number' && learned > 0) return { days: learned, climate, basis: 'learned' };
  const typed = p.foodType ? (FOOD_TYPES[p.foodType].days as ShelfLife)[climate] : null;
  if (typeof typed === 'number' && typed > 0) return { days: typed, climate, basis: 'type' };
  return null;
}

/** Where a product is normally kept: its food type's place, else the room. */
export function naturalClimate(p: ShelfLifeSource): Climate {
  return p.foodType ? FOOD_TYPES[p.foodType].natural : 'room';
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** A suggested expiry date for something bought `today` and kept in `climate` (falls back to its natural place). */
export function suggestExpiry(p: ShelfLifeSource, today: string, climate?: Climate | null): (ExpiryGuess & { date: string }) | null {
  const guess = (climate && shelfDays(p, climate)) || shelfDays(p, naturalClimate(p));
  return guess ? { ...guess, date: addDays(today, guess.days) } : null;
}

/**
 * The expiry after moving between climates: into a freezer it keeps for the
 * freezer time from today (never shorter than it was); out of a freezer
 * (thawing) only the fridge/room time is left (never longer than it was).
 * Null = leave the date alone.
 */
export function expiryAfterMove(
  p: ShelfLifeSource,
  current: string | null,
  from: Climate,
  to: Climate,
  today: string,
): string | null {
  if (from === to || !current) return null;
  if (to === 'freezer') {
    const g = shelfDays(p, 'freezer');
    const next = g ? addDays(today, g.days) : null;
    return next && next > current ? next : null;
  }
  if (from === 'freezer') {
    const g = shelfDays(p, to);
    const next = g ? addDays(today, g.days) : null;
    return next && next < current ? next : null;
  }
  return null;
}

/** "7", "7d", "+7" (days from today) or a date in yyyy-mm-dd / d.m.yyyy / d.m. → ISO date. */
export function parseExpiryInput(text: string, today: string): string | null {
  const s = text.trim();
  if (!s) return null;
  const days = s.match(/^\+?(\d{1,4})\s*d?$/i);
  if (days) return addDays(today, Number(days[1]));
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?\.?$/);
  if (dmy) {
    const year = dmy[3] ?? today.slice(0, 4);
    let date = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    if (!dmy[3] && date < today) date = `${Number(year) + 1}${date.slice(4)}`; // "3.1." in December
    return date;
  }
  return null;
}

