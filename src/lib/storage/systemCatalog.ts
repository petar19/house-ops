import { normalizeText } from '../utils/normalize';

// Built-in storage categories and a seed list of common items, shipped with
// the app rather than kept in Firestore — same for every group, versioned
// with the code, nothing to seed or secure. A group's own items and
// categories (storageCatalog / storageCategories) layer on top of this.
//
// Item names are given in both app languages; whichever the user's locale
// is gets shown, the other still matches when searching/typing.

export interface SystemCategory {
  id: string;
  en: string;
  hr: string;
}

export interface SystemItem {
  key: string; // stable id: normalized English name
  en: string;
  hr: string;
  categories: string[];
  unit: string | null;
}

export const SYSTEM_CATEGORIES: SystemCategory[] = [
  { id: 'frozen', en: 'Frozen food', hr: 'Smrznuta hrana' },
  { id: 'dry', en: 'Dry food', hr: 'Suha hrana' },
  { id: 'canned', en: 'Canned & jars', hr: 'Konzerve i staklenke' },
  { id: 'drinks', en: 'Drinks', hr: 'Pića' },
  { id: 'spices', en: 'Spices & baking', hr: 'Začini i pečenje' },
  { id: 'cleaning', en: 'Cleaning', hr: 'Čišćenje' },
  { id: 'toiletries', en: 'Toiletries', hr: 'Higijena' },
  { id: 'medicine', en: 'Medicine', hr: 'Lijekovi' },
  { id: 'kitchenware', en: 'Kitchenware', hr: 'Kuhinjski pribor' },
  { id: 'tools', en: 'Tools', hr: 'Alati' },
  { id: 'hardware', en: 'Hardware & fasteners', hr: 'Okovi i spojni materijal' },
  { id: 'electrical', en: 'Electrical', hr: 'Elektrika' },
  { id: 'paint', en: 'Paint & DIY', hr: 'Boje i uradi sam' },
  { id: 'car', en: 'Car', hr: 'Auto' },
  { id: 'garden', en: 'Garden', hr: 'Vrt' },
  { id: 'outdoor', en: 'Sports & camping', hr: 'Sport i kampiranje' },
  { id: 'seasonal', en: 'Seasonal & decor', hr: 'Sezonsko i ukrasi' },
  { id: 'clothes', en: 'Clothes & textiles', hr: 'Odjeća i tekstil' },
];

// [en, hr, unit?] per category. An item listed under several categories is
// merged into one entry carrying all of them.
const RAW: Record<string, [string, string, string?][]> = {
  frozen: [
    ['Peas', 'Grašak', 'bag'], ['Spinach', 'Špinat', 'bag'], ['Mixed vegetables', 'Miješano povrće', 'bag'],
    ['French fries', 'Pomfrit', 'bag'], ['Chicken breast', 'Pileća prsa', 'kg'], ['Chicken thighs', 'Pileći zabatci', 'kg'],
    ['Minced meat', 'Mljeveno meso', 'kg'], ['Pork chops', 'Svinjski kotleti', 'kg'], ['Beef', 'Junetina', 'kg'],
    ['Sausages', 'Kobasice', 'pack'], ['Fish fillets', 'Riblji fileti', 'pack'], ['Fish sticks', 'Riblji štapići', 'pack'],
    ['Squid', 'Lignje', 'kg'], ['Shrimp', 'Kozice', 'pack'], ['Pizza', 'Pizza', 'pcs'], ['Ice cream', 'Sladoled', 'pcs'],
    ['Bread', 'Kruh', 'pcs'], ['Burek', 'Burek', 'pcs'], ['Berries', 'Bobičasto voće', 'bag'], ['Ice', 'Led', 'bag'],
    ['Soup', 'Juha', 'box'], ['Sarma', 'Sarma', 'box'], ['Dumplings', 'Knedle', 'pack'], ['Puff pastry', 'Lisnato tijesto', 'pack'],
  ],
  dry: [
    ['Pasta', 'Tjestenina', 'pack'], ['Rice', 'Riža', 'kg'], ['Flour', 'Brašno', 'kg'], ['Sugar', 'Šećer', 'kg'],
    ['Cereal', 'Žitarice', 'box'], ['Oats', 'Zobene pahuljice', 'pack'], ['Lentils', 'Leća', 'pack'], ['Beans', 'Grah', 'pack'],
    ['Polenta', 'Palenta', 'pack'], ['Biscuits', 'Keksi', 'pack'], ['Chips', 'Čips', 'pack'], ['Coffee', 'Kava', 'pack'],
    ['Tea', 'Čaj', 'box'], ['Nuts', 'Orašasti plodovi', 'pack'], ['Breadcrumbs', 'Krušne mrvice', 'pack'], ['Chocolate', 'Čokolada', 'pcs'],
  ],
  canned: [
    ['Tuna', 'Tuna', 'can'], ['Sardines', 'Srdele', 'can'], ['Canned tomatoes', 'Rajčica u konzervi', 'can'],
    ['Tomato passata', 'Pasirana rajčica', 'bottle'], ['Corn', 'Kukuruz', 'can'], ['Chickpeas', 'Slanutak', 'can'],
    ['Pickles', 'Kiseli krastavci', 'jar'], ['Ajvar', 'Ajvar', 'jar'], ['Jam', 'Džem', 'jar'], ['Honey', 'Med', 'jar'],
    ['Pâté', 'Pašteta', 'pcs'], ['Olives', 'Masline', 'jar'], ['Peanut butter', 'Kikiriki maslac', 'jar'],
  ],
  drinks: [
    ['Water', 'Voda', 'bottle'], ['Mineral water', 'Mineralna voda', 'bottle'], ['Juice', 'Sok', 'l'],
    ['Beer', 'Pivo', 'bottle'], ['Wine', 'Vino', 'bottle'], ['Soda', 'Gazirani sok', 'bottle'], ['Milk', 'Mlijeko', 'l'],
    ['Long-life milk', 'Trajno mlijeko', 'l'], ['Spirits', 'Žestoko piće', 'bottle'], ['Syrup', 'Sirup', 'bottle'],
  ],
  spices: [
    ['Salt', 'Sol', 'pack'], ['Pepper', 'Papar', 'pcs'], ['Paprika', 'Paprika (mljevena)', 'pcs'], ['Oregano', 'Origano', 'pcs'],
    ['Vegeta', 'Vegeta', 'pack'], ['Bay leaves', 'Lovorov list', 'pack'], ['Cinnamon', 'Cimet', 'pcs'], ['Baking powder', 'Prašak za pecivo', 'pack'],
    ['Yeast', 'Kvasac', 'pack'], ['Vanilla sugar', 'Vanilin šećer', 'pack'], ['Cocoa', 'Kakao', 'pack'], ['Olive oil', 'Maslinovo ulje', 'bottle'],
    ['Sunflower oil', 'Suncokretovo ulje', 'bottle'], ['Vinegar', 'Ocat', 'bottle'],
  ],
  cleaning: [
    ['Dish soap', 'Deterdžent za suđe', 'bottle'], ['Dishwasher tablets', 'Tablete za perilicu suđa', 'pack'],
    ['Laundry detergent', 'Deterdžent za rublje', 'pack'], ['Fabric softener', 'Omekšivač', 'bottle'], ['Bleach', 'Varikina', 'bottle'],
    ['All-purpose cleaner', 'Univerzalno sredstvo za čišćenje', 'bottle'], ['Sponges', 'Spužve', 'pack'], ['Trash bags', 'Vrećice za smeće', 'roll'],
    ['Paper towels', 'Papirnati ručnici', 'roll'], ['Aluminium foil', 'Aluminijska folija', 'roll'], ['Cling film', 'Prozirna folija', 'roll'],
    ['Freezer bags', 'Vrećice za zamrzavanje', 'pack'], ['Mop', 'Mop', 'pcs'], ['Rubber gloves', 'Gumene rukavice', 'pack'],
  ],
  toiletries: [
    ['Toilet paper', 'Toaletni papir', 'roll'], ['Shampoo', 'Šampon', 'bottle'], ['Shower gel', 'Gel za tuširanje', 'bottle'],
    ['Soap', 'Sapun', 'pcs'], ['Toothpaste', 'Pasta za zube', 'pcs'], ['Toothbrush', 'Četkica za zube', 'pcs'],
    ['Deodorant', 'Dezodorans', 'pcs'], ['Razors', 'Brijači', 'pack'], ['Tissues', 'Papirnate maramice', 'pack'],
    ['Cotton pads', 'Vatirani jastučići', 'pack'], ['Diapers', 'Pelene', 'pack'], ['Wet wipes', 'Vlažne maramice', 'pack'],
  ],
  medicine: [
    ['Painkillers', 'Lijekovi protiv bolova', 'pack'], ['Ibuprofen', 'Ibuprofen', 'pack'], ['Paracetamol', 'Paracetamol', 'pack'],
    ['Plasters', 'Flasteri', 'pack'], ['Bandage', 'Zavoj', 'pcs'], ['Disinfectant', 'Dezinficijens', 'bottle'],
    ['Thermometer', 'Toplomjer', 'pcs'], ['Vitamins', 'Vitamini', 'pack'], ['Allergy tablets', 'Tablete za alergiju', 'pack'],
    ['First aid kit', 'Kutija prve pomoći', 'pcs'],
  ],
  kitchenware: [
    ['Baking tray', 'Pleh', 'pcs'], ['Pots', 'Lonci', 'pcs'], ['Pans', 'Tave', 'pcs'], ['Food containers', 'Posude za hranu', 'pcs'],
    ['Mixer', 'Mikser', 'pcs'], ['Blender', 'Blender', 'pcs'], ['Glass jars', 'Staklenke', 'pcs'], ['Baking paper', 'Papir za pečenje', 'roll'],
    ['Party cups', 'Čaše za zabave', 'pack'], ['Paper plates', 'Papirnati tanjuri', 'pack'], ['Napkins', 'Salvete', 'pack'],
  ],
  tools: [
    ['Hammer', 'Čekić', 'pcs'], ['Screwdriver set', 'Set odvijača', 'pcs'], ['Drill', 'Bušilica', 'pcs'], ['Drill bits', 'Svrdla', 'pcs'],
    ['Cordless screwdriver', 'Akumulatorski odvijač', 'pcs'], ['Angle grinder', 'Kutna brusilica', 'pcs'], ['Saw', 'Pila', 'pcs'],
    ['Pliers', 'Kliješta', 'pcs'], ['Wrench set', 'Set ključeva', 'pcs'], ['Spirit level', 'Libela', 'pcs'], ['Tape measure', 'Metar', 'pcs'],
    ['Utility knife', 'Skalpel', 'pcs'], ['Clamps', 'Stege', 'pcs'], ['Ladder', 'Ljestve', 'pcs'], ['Toolbox', 'Kutija za alat', 'pcs'],
    ['Allen keys', 'Imbus ključevi', 'pcs'], ['Glue gun', 'Pištolj za vruće ljepilo', 'pcs'],
  ],
  hardware: [
    ['Screws', 'Vijci', 'box'], ['Wood screws', 'Vijci za drvo', 'box'], ['Nails', 'Čavli', 'box'], ['Wall plugs', 'Tiple', 'box'],
    ['Bolts', 'Vijci s maticom', 'box'], ['Hex nuts', 'Matice', 'box'], ['Washers', 'Podloške', 'box'], ['Hooks', 'Kuke', 'pcs'],
    ['Cable ties', 'Vezice', 'pack'], ['Hinges', 'Šarke', 'pcs'], ['Brackets', 'Nosači', 'pcs'], ['Chain', 'Lanac', 'm'],
    ['Rope', 'Uže', 'm'], ['Wire', 'Žica', 'm'],
  ],
  electrical: [
    ['Batteries AA', 'Baterije AA', 'pcs'], ['Batteries AAA', 'Baterije AAA', 'pcs'], ['Light bulbs', 'Žarulje', 'pcs'],
    ['Extension cord', 'Produžni kabel', 'pcs'], ['Power strip', 'Razdjelnik', 'pcs'], ['USB cables', 'USB kabeli', 'pcs'],
    ['Chargers', 'Punjači', 'pcs'], ['Flashlight', 'Svjetiljka', 'pcs'], ['Electrical tape', 'Izolir traka', 'roll'],
    ['HDMI cable', 'HDMI kabel', 'pcs'], ['Fuses', 'Osigurači', 'pcs'], ['LED strip', 'LED traka', 'pcs'],
  ],
  paint: [
    ['Wall paint', 'Zidna boja', 'l'], ['Primer', 'Temeljna boja', 'l'], ['Paint brushes', 'Kistovi', 'pcs'], ['Paint roller', 'Valjak', 'pcs'],
    ['Masking tape', 'Papirnata traka', 'roll'], ['Duct tape', 'Ljepljiva traka', 'roll'], ['Sandpaper', 'Brusni papir', 'pcs'],
    ['Silicone', 'Silikon', 'pcs'], ['Wood glue', 'Ljepilo za drvo', 'bottle'], ['Super glue', 'Sekundo ljepilo', 'pcs'],
    ['WD-40', 'WD-40', 'pcs'], ['Putty', 'Kit', 'pcs'], ['Drop cloth', 'Zaštitna folija', 'pcs'],
  ],
  car: [
    ['Motor oil', 'Motorno ulje', 'l'], ['Windshield washer fluid', 'Tekućina za brisače', 'l'], ['Antifreeze', 'Antifriz', 'l'],
    ['Snow chains', 'Lanci za snijeg', 'pcs'], ['Ice scraper', 'Strugač za led', 'pcs'], ['Jumper cables', 'Kabeli za paljenje', 'pcs'],
    ['Tyre pump', 'Pumpa za gume', 'pcs'], ['Winter tyres', 'Zimske gume', 'pcs'], ['Summer tyres', 'Ljetne gume', 'pcs'],
    ['Car wash shampoo', 'Šampon za auto', 'bottle'], ['Wiper blades', 'Metlice brisača', 'pcs'],
  ],
  garden: [
    ['Garden hose', 'Vrtno crijevo', 'pcs'], ['Pruning shears', 'Škare za orezivanje', 'pcs'], ['Shovel', 'Lopata', 'pcs'],
    ['Rake', 'Grablje', 'pcs'], ['Gloves', 'Rukavice', 'pcs'], ['Fertilizer', 'Gnojivo', 'kg'], ['Potting soil', 'Zemlja za cvijeće', 'bag'],
    ['Seeds', 'Sjemenke', 'pack'], ['Flower pots', 'Teglice', 'pcs'], ['Watering can', 'Kantica za zalijevanje', 'pcs'],
    ['Lawn mower', 'Kosilica', 'pcs'], ['Charcoal', 'Ugljen', 'bag'], ['Grill', 'Roštilj', 'pcs'],
  ],
  outdoor: [
    ['Tent', 'Šator', 'pcs'], ['Sleeping bag', 'Vreća za spavanje', 'pcs'], ['Camping chairs', 'Stolice za kampiranje', 'pcs'],
    ['Cooler box', 'Hladnjak (prijenosni)', 'pcs'], ['Bicycle pump', 'Pumpa za bicikl', 'pcs'], ['Helmet', 'Kaciga', 'pcs'],
    ['Skis', 'Skije', 'pcs'], ['Ski boots', 'Pancerice', 'pcs'], ['Ball', 'Lopta', 'pcs'], ['Beach umbrella', 'Suncobran', 'pcs'],
    ['Air mattress', 'Madrac na napuhavanje', 'pcs'], ['Backpack', 'Ruksak', 'pcs'],
  ],
  seasonal: [
    ['Christmas lights', 'Božićne lampice', 'pcs'], ['Christmas ornaments', 'Božićni ukrasi', 'box'], ['Christmas tree', 'Božićno drvce', 'pcs'],
    ['Easter decorations', 'Uskrsni ukrasi', 'box'], ['Candles', 'Svijeće', 'pcs'], ['Gift wrap', 'Ukrasni papir', 'roll'],
    ['Picture frames', 'Okviri za slike', 'pcs'], ['Vases', 'Vaze', 'pcs'], ['Halloween costumes', 'Kostimi', 'pcs'],
  ],
  clothes: [
    ['Winter jackets', 'Zimske jakne', 'pcs'], ['Winter boots', 'Zimske čizme', 'pcs'], ['Bed sheets', 'Posteljina', 'pcs'],
    ['Towels', 'Ručnici', 'pcs'], ['Blankets', 'Deke', 'pcs'], ['Pillows', 'Jastuci', 'pcs'], ['Raincoat', 'Kabanica', 'pcs'],
    ['Kids clothes', 'Dječja odjeća', 'box'], ['Shoes', 'Cipele', 'pcs'], ['Swimwear', 'Kupaći kostimi', 'pcs'],
  ],
};

function build(): SystemItem[] {
  const byKey = new Map<string, SystemItem>();
  for (const [category, entries] of Object.entries(RAW)) {
    for (const [en, hr, unit] of entries) {
      const key = normalizeText(en);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.categories.includes(category)) existing.categories.push(category);
      } else {
        byKey.set(key, { key, en, hr, categories: [category], unit: unit ?? null });
      }
    }
  }
  return [...byKey.values()];
}

export const SYSTEM_ITEMS: SystemItem[] = build();

/** Units offered in the unit field's dropdown (free text is fine too). */
export const COMMON_UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'pack', 'bag', 'box', 'bottle', 'can', 'jar', 'roll'];
