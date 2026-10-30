import { normalizeText } from '../utils/normalize';

// Built-in storage categories and a seed list of common items, shipped with
// the app rather than kept in Firestore — same for every group, versioned
// with the code, nothing to seed or secure. A group's own items and
// categories (storageCatalog / storageCategories) layer on top of this.
//
// Item names are given in both app languages; whichever the user's locale
// is gets shown, the other still matches when searching/typing — as do the
// aliases: other ways people and receipts write the same product
// ("piletina prsa", "pileći file" → Chicken breast), so imports land on one
// product and its price history stays together.

export interface SystemCategory {
  id: string;
  en: string;
  hr: string;
}

// What prices are compared per: €/kg, €/l or € per piece.
export type PriceUnit = 'kg' | 'l' | 'pcs';

export interface SystemItem {
  key: string; // stable id: normalized English name
  en: string;
  hr: string;
  aliases: string[];
  categories: string[];
  unit: string | null; // usual unit when storing it (bag, bottle, pcs…)
  priceUnit: PriceUnit;
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
  { id: 'fridge', en: 'Fridge & dairy', hr: 'Hladnjak i mliječno' },
  { id: 'produce', en: 'Fruit & vegetables', hr: 'Voće i povrće' },
  { id: 'pet', en: 'Pets', hr: 'Kućni ljubimci' },
  { id: 'baby', en: 'Baby', hr: 'Bebe' },
  { id: 'office', en: 'Office & paper', hr: 'Ured i papir' },
];

// Food is compared per kg and drinks per litre unless an item says otherwise;
// everything else per piece.
const CATEGORY_PRICE_UNIT: Record<string, PriceUnit> = {
  frozen: 'kg', dry: 'kg', canned: 'kg', spices: 'kg', fridge: 'kg', produce: 'kg', drinks: 'l',
};

// [en, hr, unit?, aliases?, priceUnit?] per category — aliases comma-
// separated. An item listed under several categories is merged into one
// entry carrying all of them (and all their aliases).
type Raw = [string, string, string?, string?, PriceUnit?];
const RAW: Record<string, Raw[]> = {
  frozen: [
    ['Chicken nuggets', 'Pileći medaljoni', 'pack', 'nuggets, pileći nuggetsi'], ['Burgers', 'Pljeskavice', 'pack', 'hamburger, burger'],
    ['Cevapi', 'Ćevapi', 'pack', 'cevapcici, ćevapčići'], ['Croissants', 'Kroasani', 'pack', 'kroasan, croissant'],
    ['Hake', 'Oslić', 'pack', 'oslic file, file oslića'], ['Salmon', 'Losos', 'kg', 'file lososa, salmon fillet'],
    ['Broccoli', 'Brokula', 'bag'], ['Frozen fruit', 'Smrznuto voće', 'bag', 'voćni mix'],
    ['Peas', 'Grašak', 'bag'], ['Spinach', 'Špinat', 'bag'], ['Mixed vegetables', 'Miješano povrće', 'bag'],
    ['French fries', 'Pomfrit', 'bag'], ['Chicken breast', 'Pileća prsa', 'kg'], ['Chicken thighs', 'Pileći zabatci', 'kg'],
    ['Minced meat', 'Mljeveno meso', 'kg'], ['Pork chops', 'Svinjski kotleti', 'kg'], ['Beef', 'Junetina', 'kg'],
    ['Sausages', 'Kobasice', 'pack'], ['Fish fillets', 'Riblji fileti', 'pack'], ['Fish sticks', 'Riblji štapići', 'pack'],
    ['Squid', 'Lignje', 'kg'], ['Shrimp', 'Kozice', 'pack'], ['Pizza', 'Pizza', 'pcs'], ['Ice cream', 'Sladoled', 'pcs'],
    ['Bread', 'Kruh', 'pcs'], ['Burek', 'Burek', 'pcs'], ['Berries', 'Bobičasto voće', 'bag'], ['Ice', 'Led', 'bag'],
    ['Soup', 'Juha', 'box'], ['Sarma', 'Sarma', 'box'], ['Dumplings', 'Knedle', 'pack'], ['Puff pastry', 'Lisnato tijesto', 'pack'],
  ],
  dry: [
    ['Bread', 'Kruh', 'pcs', 'polubijeli kruh, crni kruh, bijeli kruh', 'pcs'], ['Toast bread', 'Tost kruh', 'pack', 'kruh za tost, toast', 'pcs'],
    ['Crackers', 'Krekeri', 'pack', 'slani krekeri'], ['Rice cakes', 'Rižini krekeri', 'pack', 'rižine galete'],
    ['Pretzels', 'Perece', 'pack', 'slani štapići, štapići'], ['Popcorn', 'Kokice', 'pack'], ['Muesli', 'Musli', 'pack', 'granola'],
    ['Corn flakes', 'Kukuruzne pahuljice', 'box', 'cornflakes'], ['Couscous', 'Kus-kus', 'pack', 'kuskus'],
    ['Bulgur', 'Bulgur', 'pack'], ['Quinoa', 'Kvinoja', 'pack', 'quinoa'], ['Semolina', 'Griz', 'pack', 'pšenična krupica'],
    ['Spaghetti', 'Špageti', 'pack', 'spagete, spaghetti'], ['Penne', 'Pene', 'pack', 'penne'], ['Lasagne sheets', 'Lazanje', 'pack', 'listovi za lazanje'],
    ['Noodles', 'Rezanci', 'pack', 'mlinci, juhini rezanci'], ['Instant soup', 'Instant juha', 'pack', 'juha iz vrećice, vrećica juhe'],
    ['Powdered sugar', 'Šećer u prahu', 'pack'], ['Brown sugar', 'Smeđi šećer', 'pack'], ['Cornstarch', 'Gustin', 'pack', 'kukuruzni škrob'],
    ['Dried fruit', 'Suho voće', 'pack', 'suhe šljive, suhe marelice'], ['Raisins', 'Grožđice', 'pack'],
    ['Almonds', 'Bademi', 'pack'], ['Walnuts', 'Orasi', 'pack', 'jezgra oraha'], ['Hazelnuts', 'Lješnjaci', 'pack'],
    ['Peanuts', 'Kikiriki', 'pack'], ['Sunflower seeds', 'Suncokretove sjemenke', 'pack', 'koštice'], ['Chia seeds', 'Chia sjemenke', 'pack'],
    ['Candy', 'Bomboni', 'pack', 'bombončići'], ['Gummy candy', 'Gumeni bomboni', 'pack', 'gumeni medvjedići, haribo'],
    ['Wafers', 'Napolitanke', 'pack', 'oblatne'], ['Chocolate spread', 'Čokoladni namaz', 'jar', 'nutella, linolada, eurokrem'],
    ['Protein bars', 'Proteinske pločice', 'pcs', 'protein bar', 'pcs'], ['Coffee beans', 'Kava u zrnu', 'pack'],
    ['Ground coffee', 'Mljevena kava', 'pack', 'franck, kava mljevena'], ['Instant coffee', 'Instant kava', 'jar', 'nescafe'],
    ['Pasta', 'Tjestenina', 'pack'], ['Rice', 'Riža', 'kg'], ['Flour', 'Brašno', 'kg'], ['Sugar', 'Šećer', 'kg'],
    ['Cereal', 'Žitarice', 'box'], ['Oats', 'Zobene pahuljice', 'pack'], ['Lentils', 'Leća', 'pack'], ['Beans', 'Grah', 'pack'],
    ['Polenta', 'Palenta', 'pack'], ['Biscuits', 'Keksi', 'pack'], ['Chips', 'Čips', 'pack'], ['Coffee', 'Kava', 'pack'],
    ['Tea', 'Čaj', 'box'], ['Nuts', 'Orašasti plodovi', 'pack'], ['Breadcrumbs', 'Krušne mrvice', 'pack'], ['Chocolate', 'Čokolada', 'pcs'],
  ],
  canned: [
    ['Canned beans', 'Grah u konzervi', 'can', 'kuhani grah'], ['Canned mushrooms', 'Gljive u konzervi', 'can', 'šampinjoni u konzervi'],
    ['Tomato paste', 'Koncentrat rajčice', 'pcs', 'rajčica koncentrat'], ['Coconut milk', 'Kokosovo mlijeko', 'can'],
    ['Canned fruit', 'Kompot', 'jar', 'voćni kompot'], ['Luncheon meat', 'Mesni doručak', 'can', 'corned beef, doručak'],
    ['Mackerel', 'Skuša', 'can', 'skuša u ulju'], ['Ready soup', 'Gotova juha', 'can'], ['Pickled peppers', 'Kisele paprike', 'jar', 'ukiseljene paprike, feferoni'],
    ['Sauerkraut', 'Kiseli kupus', 'jar', 'kiselo zelje'], ['Capers', 'Kapari', 'jar'], ['Pesto', 'Pesto', 'jar', 'pesto genovese'],
    ['Tuna', 'Tuna', 'can'], ['Sardines', 'Srdele', 'can'], ['Canned tomatoes', 'Rajčica u konzervi', 'can'],
    ['Tomato passata', 'Pasirana rajčica', 'bottle'], ['Corn', 'Kukuruz', 'can'], ['Chickpeas', 'Slanutak', 'can'],
    ['Pickles', 'Kiseli krastavci', 'jar'], ['Ajvar', 'Ajvar', 'jar'], ['Jam', 'Džem', 'jar'], ['Honey', 'Med', 'jar'],
    ['Pâté', 'Pašteta', 'pcs'], ['Olives', 'Masline', 'jar'], ['Peanut butter', 'Kikiriki maslac', 'jar'],
  ],
  drinks: [
    ['Orange juice', 'Sok od naranče', 'l', 'narančin sok'], ['Apple juice', 'Sok od jabuke', 'l', 'jabučni sok'],
    ['Iced tea', 'Ledeni čaj', 'bottle', 'ice tea'], ['Energy drink', 'Energetsko piće', 'can', 'red bull, energetski napitak'],
    ['Cola', 'Cola', 'bottle', 'coca cola, coca-cola, pepsi'], ['Sparkling wine', 'Pjenušac', 'bottle', 'prosecco, šampanjac'],
    ['Red wine', 'Crno vino', 'bottle'], ['White wine', 'Bijelo vino', 'bottle', 'graševina, malvazija'],
    ['Rakija', 'Rakija', 'bottle', 'šljivovica, travarica, loza'], ['Plant milk', 'Biljno mlijeko', 'l', 'zobeno mlijeko, sojino mlijeko, bademovo mlijeko'],
    ['Tonic', 'Tonic', 'bottle', 'tonic water'], ['Sparkling water', 'Gazirana voda', 'bottle', 'kisela voda'],
    ['Water', 'Voda', 'bottle'], ['Mineral water', 'Mineralna voda', 'bottle'], ['Juice', 'Sok', 'l'],
    ['Beer', 'Pivo', 'bottle'], ['Wine', 'Vino', 'bottle'], ['Soda', 'Gazirani sok', 'bottle'], ['Milk', 'Mlijeko', 'l'],
    ['Long-life milk', 'Trajno mlijeko', 'l'], ['Spirits', 'Žestoko piće', 'bottle'], ['Syrup', 'Sirup', 'bottle'],
  ],
  spices: [
    ['Basil', 'Bosiljak', 'pcs'], ['Rosemary', 'Ružmarin', 'pcs'], ['Thyme', 'Timijan', 'pcs', 'majčina dušica'],
    ['Chili', 'Ljuta paprika', 'pcs', 'chili, čili'], ['Curry', 'Curry', 'pcs', 'kari'], ['Turmeric', 'Kurkuma', 'pcs'],
    ['Garlic powder', 'Češnjak u prahu', 'pcs'], ['Nutmeg', 'Muškatni oraščić', 'pcs'], ['Cloves', 'Klinčići', 'pcs'],
    ['Baking soda', 'Soda bikarbona', 'pack', 'sodabikarbona'], ['Gelatin', 'Želatina', 'pack'], ['Soy sauce', 'Soja umak', 'bottle', 'soja sos', 'l'],
    ['Balsamic vinegar', 'Balzamični ocat', 'bottle', 'aceto balsamico', 'l'], ['Cooking chocolate', 'Čokolada za kuhanje', 'pcs'],
    ['Salt', 'Sol', 'pack'], ['Pepper', 'Papar', 'pcs'], ['Paprika', 'Paprika (mljevena)', 'pcs'], ['Oregano', 'Origano', 'pcs'],
    ['Vegeta', 'Vegeta', 'pack'], ['Bay leaves', 'Lovorov list', 'pack'], ['Cinnamon', 'Cimet', 'pcs'], ['Baking powder', 'Prašak za pecivo', 'pack'],
    ['Yeast', 'Kvasac', 'pack'], ['Vanilla sugar', 'Vanilin šećer', 'pack'], ['Cocoa', 'Kakao', 'pack'], ['Olive oil', 'Maslinovo ulje', 'bottle'],
    ['Sunflower oil', 'Suncokretovo ulje', 'bottle'], ['Vinegar', 'Ocat', 'bottle'],
  ],
  cleaning: [
    ['Glass cleaner', 'Sredstvo za staklo', 'bottle', 'čistač stakla'], ['Toilet cleaner', 'WC sredstvo', 'bottle', 'domestos, wc gel'],
    ['Descaler', 'Sredstvo protiv kamenca', 'bottle', 'odstranjivač kamenca'], ['Dishwasher salt', 'Sol za perilicu suđa', 'pack'],
    ['Rinse aid', 'Sjajilo za perilicu suđa', 'bottle', 'sjajilo'], ['Floor cleaner', 'Sredstvo za podove', 'bottle'],
    ['Stain remover', 'Odstranjivač mrlja', 'bottle', 'vanish'], ['Air freshener', 'Osvježivač zraka', 'pcs'],
    ['Cleaning cloths', 'Krpe za čišćenje', 'pack', 'mikrofiber krpe, krpe'], ['Laundry capsules', 'Kapsule za pranje rublja', 'pack', 'kapsule za rublje'],
    ['Dish soap', 'Deterdžent za suđe', 'bottle'], ['Dishwasher tablets', 'Tablete za perilicu suđa', 'pack'],
    ['Laundry detergent', 'Deterdžent za rublje', 'pack'], ['Fabric softener', 'Omekšivač', 'bottle'], ['Bleach', 'Varikina', 'bottle'],
    ['All-purpose cleaner', 'Univerzalno sredstvo za čišćenje', 'bottle'], ['Sponges', 'Spužve', 'pack'], ['Trash bags', 'Vrećice za smeće', 'roll'],
    ['Paper towels', 'Papirnati ručnici', 'roll'], ['Aluminium foil', 'Aluminijska folija', 'roll'], ['Cling film', 'Prozirna folija', 'roll'],
    ['Freezer bags', 'Vrećice za zamrzavanje', 'pack'], ['Mop', 'Mop', 'pcs'], ['Rubber gloves', 'Gumene rukavice', 'pack'],
  ],
  toiletries: [
    ['Conditioner', 'Regenerator', 'bottle', 'balzam za kosu'], ['Hand soap', 'Tekući sapun', 'bottle', 'sapun za ruke'],
    ['Body lotion', 'Losion za tijelo', 'bottle', 'krema za tijelo'], ['Sunscreen', 'Krema za sunčanje', 'bottle', 'zaštita od sunca, spf'],
    ['Lip balm', 'Balzam za usne', 'pcs', 'labelo'], ['Dental floss', 'Zubni konac', 'pcs'], ['Mouthwash', 'Vodica za usta', 'bottle'],
    ['Cotton buds', 'Štapići za uši', 'pack', 'vatirani štapići'], ['Sanitary pads', 'Ulošci', 'pack', 'higijenski ulošci'],
    ['Tampons', 'Tamponi', 'pack'], ['Shaving foam', 'Pjena za brijanje', 'pcs', 'gel za brijanje'],
    ['Toilet paper', 'Toaletni papir', 'roll'], ['Shampoo', 'Šampon', 'bottle'], ['Shower gel', 'Gel za tuširanje', 'bottle'],
    ['Soap', 'Sapun', 'pcs'], ['Toothpaste', 'Pasta za zube', 'pcs'], ['Toothbrush', 'Četkica za zube', 'pcs'],
    ['Deodorant', 'Dezodorans', 'pcs'], ['Razors', 'Brijači', 'pack'], ['Tissues', 'Papirnate maramice', 'pack'],
    ['Cotton pads', 'Vatirani jastučići', 'pack'], ['Diapers', 'Pelene', 'pack'], ['Wet wipes', 'Vlažne maramice', 'pack'],
  ],
  medicine: [
    ['Cough syrup', 'Sirup za kašalj', 'bottle'], ['Nasal spray', 'Sprej za nos', 'pcs', 'kapi za nos'],
    ['Eye drops', 'Kapi za oči', 'pcs'], ['Antacid', 'Tablete za želudac', 'pack', 'rennie, protiv žgaravice'],
    ['Probiotics', 'Probiotik', 'pack', 'probiotici'], ['Ointment', 'Mast', 'pcs', 'krema za opekline, mast za rane'],
    ['Painkillers', 'Lijekovi protiv bolova', 'pack'], ['Ibuprofen', 'Ibuprofen', 'pack'], ['Paracetamol', 'Paracetamol', 'pack'],
    ['Plasters', 'Flasteri', 'pack'], ['Bandage', 'Zavoj', 'pcs'], ['Disinfectant', 'Dezinficijens', 'bottle'],
    ['Thermometer', 'Toplomjer', 'pcs'], ['Vitamins', 'Vitamini', 'pack'], ['Allergy tablets', 'Tablete za alergiju', 'pack'],
    ['First aid kit', 'Kutija prve pomoći', 'pcs'],
  ],
  kitchenware: [
    ['Cutting board', 'Daska za rezanje', 'pcs'], ['Knives', 'Noževi', 'pcs'], ['Grater', 'Ribež', 'pcs'],
    ['Coffee filters', 'Filteri za kavu', 'pack'], ['Toothpicks', 'Čačkalice', 'pack'], ['Skewers', 'Štapići za ražnjiće', 'pack'],
    ['Thermos', 'Termosica', 'pcs', 'termos'], ['Muffin cases', 'Kalupi za muffine', 'pack', 'papirnati kalupi'],
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
    ['Batteries 9V', 'Baterije 9V', 'pcs'], ['Button cells', 'Gumbaste baterije', 'pcs', 'cr2032, baterija za sat'],
    ['Power bank', 'Prijenosna baterija', 'pcs', 'powerbank'], ['Headphones', 'Slušalice', 'pcs'],
    ['Remote control', 'Daljinski upravljač', 'pcs', 'daljinski'], ['Smoke detector', 'Detektor dima', 'pcs'],
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
    ['Warning triangle', 'Sigurnosni trokut', 'pcs'], ['Reflective vest', 'Reflektirajući prsluk', 'pcs', 'prsluk'],
    ['Car battery', 'Akumulator', 'pcs'],
    ['Motor oil', 'Motorno ulje', 'l'], ['Windshield washer fluid', 'Tekućina za brisače', 'l'], ['Antifreeze', 'Antifriz', 'l'],
    ['Snow chains', 'Lanci za snijeg', 'pcs'], ['Ice scraper', 'Strugač za led', 'pcs'], ['Jumper cables', 'Kabeli za paljenje', 'pcs'],
    ['Tyre pump', 'Pumpa za gume', 'pcs'], ['Winter tyres', 'Zimske gume', 'pcs'], ['Summer tyres', 'Ljetne gume', 'pcs'],
    ['Car wash shampoo', 'Šampon za auto', 'bottle'], ['Wiper blades', 'Metlice brisača', 'pcs'],
  ],
  garden: [
    ['Mosquito repellent', 'Sredstvo protiv komaraca', 'pcs', 'autan, sprej protiv komaraca'], ['Bird food', 'Hrana za ptice', 'bag'],
    ['Weed killer', 'Herbicid', 'bottle', 'sredstvo protiv korova'],
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
  fridge: [
    ['Milk', 'Mlijeko', 'l', 'svježe mlijeko, kravlje mlijeko', 'l'], ['Butter', 'Maslac', 'pcs', 'puter'], ['Cheese', 'Sir', 'kg', 'tvrdi sir, polutvrdi sir'],
    ['Gouda', 'Gauda', 'kg', 'gouda sir'], ['Feta', 'Feta sir', 'pcs', 'feta, bijeli sir'], ['Mozzarella', 'Mozzarella', 'pcs', 'mocarela'],
    ['Parmesan', 'Parmezan', 'pcs', 'grana padano'], ['Cream cheese', 'Krem sir', 'pcs', 'philadelphia, sirni namaz'],
    ['Cottage cheese', 'Svježi sir', 'pcs', 'kravlji sir, zrnati sir'], ['Sour cream', 'Kiselo vrhnje', 'pcs', 'vrhnje'],
    ['Cooking cream', 'Vrhnje za kuhanje', 'pcs', 'slatko vrhnje za kuhanje', 'l'], ['Whipping cream', 'Slatko vrhnje', 'pcs', 'vrhnje za šlag, šlag', 'l'],
    ['Yogurt', 'Jogurt', 'pcs', 'jogurt čaša, tekući jogurt'], ['Kefir', 'Kefir', 'pcs', '', 'l'], ['Eggs', 'Jaja', 'pcs', 'jaje', 'pcs'],
    ['Ham', 'Šunka', 'pack', 'šunka narezak, šunka u ovitku'], ['Prosciutto', 'Pršut', 'pack', 'dalmatinski pršut, istarski pršut'],
    ['Salami', 'Salama', 'pack', 'zimska salama, narezak'], ['Bacon', 'Slanina', 'pack', 'panceta, špek'],
    ['Hot dogs', 'Hrenovke', 'pack', 'viršle, hrenovka'], ['Chicken breast', 'Pileća prsa', 'kg', 'piletina prsa, pileći file, pileća prsa file, file piletine'],
    ['Chicken wings', 'Pileća krilca', 'kg', 'krilca'], ['Whole chicken', 'Cijelo pile', 'kg', 'piletina, pile'], ['Turkey', 'Puretina', 'kg', 'pureći file, pureća prsa'],
    ['Pork', 'Svinjetina', 'kg', 'svinjski vrat, svinjsko meso'], ['Fish', 'Riba', 'kg', 'svježa riba'], ['Margarine', 'Margarin', 'pcs', 'biljni namaz'],
    ['Pudding', 'Puding', 'pcs'], ['Hummus', 'Humus', 'pcs'], ['Tofu', 'Tofu', 'pcs'], ['Mayonnaise', 'Majoneza', 'jar'],
    ['Ketchup', 'Kečap', 'bottle', 'ketchup'], ['Mustard', 'Senf', 'jar', 'gorušica'], ['Fresh pasta', 'Svježa tjestenina', 'pack', 'tortellini, njoki'],
    ['Smoked meat', 'Suho meso', 'kg', 'dimljeno meso, buđola'],
  ],
  produce: [
    ['Potatoes', 'Krumpir', 'kg', 'krompir, mladi krumpir'], ['Onions', 'Luk', 'kg', 'crveni luk, kapula'], ['Garlic', 'Češnjak', 'pcs', 'bijeli luk'],
    ['Carrots', 'Mrkva', 'kg', 'mrkve'], ['Tomatoes', 'Rajčica', 'kg', 'paradajz, pomidor, rajčice'], ['Cucumbers', 'Krastavci', 'kg', 'krastavac'],
    ['Bell peppers', 'Paprika babura', 'kg', 'babura, svježa paprika'], ['Lettuce', 'Zelena salata', 'pcs', 'salata, ledena salata', 'pcs'],
    ['Cabbage', 'Kupus', 'kg', 'zelje'], ['Zucchini', 'Tikvice', 'kg', 'tikvica'], ['Eggplant', 'Patlidžan', 'kg', 'melancane'],
    ['Cauliflower', 'Cvjetača', 'pcs', 'karfiol'], ['Mushrooms', 'Gljive', 'pack', 'šampinjoni'], ['Leek', 'Poriluk', 'pcs'],
    ['Celery', 'Celer', 'pcs'], ['Parsley', 'Peršin', 'pcs', 'petrusin'], ['Lemons', 'Limun', 'kg', 'limuni'],
    ['Apples', 'Jabuke', 'kg', 'jabuka'], ['Bananas', 'Banane', 'kg', 'banana'], ['Oranges', 'Naranče', 'kg', 'naranča'],
    ['Mandarins', 'Mandarine', 'kg', 'mandarina'], ['Pears', 'Kruške', 'kg', 'kruška'], ['Grapes', 'Grožđe', 'kg'],
    ['Strawberries', 'Jagode', 'pack', 'jagoda'], ['Kiwi', 'Kivi', 'kg'], ['Avocado', 'Avokado', 'pcs', '', 'pcs'],
    ['Watermelon', 'Lubenica', 'kg'], ['Peaches', 'Breskve', 'kg', 'breskva'], ['Plums', 'Šljive', 'kg', 'šljiva'],
    ['Cherries', 'Trešnje', 'kg', 'višnje'], ['Pumpkin', 'Bundeva', 'kg'], ['Radishes', 'Rotkvice', 'pcs'],
    ['Beetroot', 'Cikla', 'kg', 'crvena repa'], ['Sweet potatoes', 'Batat', 'kg', 'slatki krumpir'], ['Ginger', 'Đumbir', 'kg'],
    ['Spring onions', 'Mladi luk', 'pcs'], ['Swiss chard', 'Blitva', 'kg'], ['Spinach', 'Špinat', 'bag'], ['Broccoli', 'Brokula', 'pcs'],
  ],
  pet: [
    ['Dry dog food', 'Suha hrana za pse', 'bag', 'granule za pse, hrana za pse'], ['Wet dog food', 'Mokra hrana za pse', 'can', 'konzerva za pse'],
    ['Dry cat food', 'Suha hrana za mačke', 'bag', 'granule za mačke, hrana za mačke'], ['Wet cat food', 'Mokra hrana za mačke', 'pack', 'vrećice za mačke'],
    ['Cat litter', 'Pijesak za mačke', 'bag', 'posip za mačke'], ['Pet treats', 'Poslastice za ljubimce', 'pack', 'grickalice za pse'],
    ['Poop bags', 'Vrećice za izmet', 'roll', 'vrećice za pse'], ['Flea treatment', 'Sredstvo protiv buha', 'pcs', 'ampule protiv buha, ogrlica protiv buha'],
    ['Fish food', 'Hrana za ribice', 'pcs'], ['Bird seed', 'Hrana za ptičice', 'bag', 'sjemenke za ptice'],
  ],
  baby: [
    ['Diapers', 'Pelene', 'pack', 'pampers'], ['Wet wipes', 'Vlažne maramice', 'pack', 'vlažne maramice za bebe'],
    ['Baby formula', 'Adaptirano mlijeko', 'pcs', 'formula, mliječna formula'], ['Baby food', 'Dječja kašica', 'jar', 'kašica, voćna kašica'],
    ['Baby cereal', 'Dječja žitna kaša', 'pack', 'žitna kašica'], ['Baby shampoo', 'Dječji šampon', 'bottle'],
    ['Diaper cream', 'Krema za pelene', 'pcs', 'sudocrem'], ['Pacifier', 'Duda', 'pcs', 'duda varalica'], ['Baby bottles', 'Bočice za bebe', 'pcs', 'bočica'],
  ],
  office: [
    ['Printer paper', 'Papir za printer', 'pack', 'a4 papir, uredski papir'], ['Printer ink', 'Tinta za printer', 'pcs', 'toner, uložak'],
    ['Pens', 'Kemijske olovke', 'pcs', 'kemijska, kemijske'], ['Pencils', 'Olovke', 'pcs', 'drvene olovke'], ['Notebooks', 'Bilježnice', 'pcs', 'teka, bilježnica'],
    ['Envelopes', 'Kuverte', 'pack', 'omotnice'], ['Clear tape', 'Selotejp', 'roll', 'prozirna traka'], ['Scissors', 'Škare', 'pcs'],
    ['Glue stick', 'Ljepilo u stiku', 'pcs', 'stick ljepilo'], ['Stapler', 'Klamerica', 'pcs', 'klamerice'],
  ],
};

// Extra spellings for the original entries above (kept apart so those
// tuples stay readable).
const EXTRA_ALIASES: Record<string, string> = {
  'Peas': 'graškić',
  'Mixed vegetables': 'mješavina povrća, povrće mix',
  'French fries': 'pomfri, krumpirići',
  'Chicken thighs': 'zabatak, pileći batak, batak',
  'Minced meat': 'mljeveno, mljevena junetina, mješano mljeveno meso',
  'Pork chops': 'kotlet, svinjski kotlet',
  'Beef': 'govedina, juneće meso',
  'Sausages': 'kobasica, češnjovke, kranjske',
  'Fish fillets': 'riblji file',
  'Squid': 'lignja',
  'Shrimp': 'škampi, kozica',
  'Pasta': 'makaroni',
  'Rice': 'riža dugog zrna',
  'Flour': 'glatko brašno, oštro brašno, brašno t-550',
  'Sugar': 'kristal šećer, bijeli šećer',
  'Cereal': 'pahuljice, žitne pahuljice',
  'Oats': 'zob, zobene',
  'Chips': 'čipsi, čips krumpir',
  'Biscuits': 'keks, petit beurre',
  'Chocolate': 'milka',
  'Tuna': 'tunjevina, tuna u ulju',
  'Sardines': 'srdela, sardine',
  'Canned tomatoes': 'pelati, sjeckana rajčica',
  'Tomato passata': 'passata',
  'Corn': 'kukuruz šećerac',
  'Pickles': 'kornišoni',
  'Pâté': 'jetrena pašteta, pašteta od tune',
  'Water': 'prirodna voda, negazirana voda',
  'Mineral water': 'jamnica',
  'Beer': 'ožujsko, karlovačko, pivo limenka',
  'Juice': 'voćni sok',
  'Long-life milk': 'dugotrajno mlijeko',
  'Salt': 'kuhinjska sol, morska sol',
  'Vegeta': 'dodatak jelima',
  'Olive oil': 'ekstra djevičansko maslinovo ulje',
  'Sunflower oil': 'ulje, jestivo ulje',
  'Dish soap': 'fairy, sredstvo za pranje posuđa',
  'Dishwasher tablets': 'tablete za suđe, finish tablete',
  'Laundry detergent': 'prašak za rublje, deterdžent, ariel, persil',
  'Fabric softener': 'omekšivač rublja',
  'Bleach': 'izbjeljivač',
  'All-purpose cleaner': 'univerzalno sredstvo, ajax',
  'Trash bags': 'vreće za smeće, vrećice za otpad',
  'Paper towels': 'kuhinjski ručnici',
  'Toilet paper': 'wc papir',
  'Shampoo': 'šampon za kosu',
  'Shower gel': 'kupka',
  'Toothpaste': 'zubna pasta',
  'Razors': 'žileti, britvice',
  'Tissues': 'maramice',
  'Painkillers': 'analgetik, tablete protiv bolova',
  'Plasters': 'flaster, hansaplast',
  'Vitamins': 'vitamin c, multivitamin',
  'Batteries AA': 'aa baterije, baterija aa',
  'Batteries AAA': 'aaa baterije, baterija aaa',
  'Light bulbs': 'žarulja, led žarulja',
  'Screws': 'vijak',
  'Nails': 'čavao',
  'Wall plugs': 'tipla',
  'Duct tape': 'izolirka',
};

// Per-item comparison unit where the category default doesn't fit (milk
// per litre, a pizza per piece even in Frozen…).
const PRICE_UNIT_OVERRIDES: Record<string, PriceUnit> = {
  'Milk': 'l',
  'Long-life milk': 'l',
  'Juice': 'l',
  'Olive oil': 'l',
  'Sunflower oil': 'l',
  'Vinegar': 'l',
  'Syrup': 'l',
  'Pizza': 'pcs',
  'Ice cream': 'pcs',
  'Bread': 'pcs',
  'Burek': 'pcs',
  'Puff pastry': 'pcs',
  'Pâté': 'pcs',
  'Chocolate': 'pcs',
  'Pepper': 'pcs',
  'Paprika': 'pcs',
  'Oregano': 'pcs',
  'Cinnamon': 'pcs',
  'Baking powder': 'pcs',
  'Yeast': 'pcs',
  'Vanilla sugar': 'pcs',
  'Bay leaves': 'pcs',
  'Tea': 'pcs',
  'Soup': 'pcs',
};

const splitAliases = (text: string | undefined) =>
  (text ?? '').split(',').map((a) => a.trim()).filter(Boolean);

function build(): SystemItem[] {
  const byKey = new Map<string, SystemItem>();
  for (const [category, entries] of Object.entries(RAW)) {
    for (const [en, hr, unit, aliases, priceUnit] of entries) {
      const key = normalizeText(en);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.categories.includes(category)) existing.categories.push(category);
        for (const a of splitAliases(aliases)) if (!existing.aliases.includes(a)) existing.aliases.push(a);
        if (priceUnit) existing.priceUnit = priceUnit;
      } else {
        byKey.set(key, {
          key,
          en,
          hr,
          aliases: [...splitAliases(aliases), ...splitAliases(EXTRA_ALIASES[en])],
          categories: [category],
          unit: unit ?? null,
          priceUnit: priceUnit ?? PRICE_UNIT_OVERRIDES[en] ?? CATEGORY_PRICE_UNIT[category] ?? 'pcs',
        });
      }
    }
  }
  return [...byKey.values()];
}

export const SYSTEM_ITEMS: SystemItem[] = build();

/** Units offered in the unit field's dropdown (free text is fine too). */
export const COMMON_UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'pack', 'bag', 'box', 'bottle', 'can', 'jar', 'roll'];
