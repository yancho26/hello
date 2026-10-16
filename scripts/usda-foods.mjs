/* Витамини, минерали и мастни киселини на храните (версия 4.15) — от USDA FoodData Central.
 *
 * Изтеглете SR Legacy (CSV, обществено достояние, CC0):
 *   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
 * и стартирайте:
 *   node scripts/usda-foods.mjs <папка с food.csv и food_nutrient.csv>
 *
 * Пише public/js/shared/food-micro.js. С --new отпечатва и редовете за новите храни
 * (F(...), желязо и калций, английските имена), които са в recipes.js и en-foods.js.
 *
 * Правила:
 *  - фолатът е от храната („Folate, food“) — без добавената фолиева киселина, защото у нас
 *    брашното и зърнените закуски по правило не се обогатяват;
 *  - nofort — витамини, които в САЩ се добавят към продукта (мляко с витамин D, зърнени закуски),
 *    а у нас обикновено не: остават 0;
 *  - мастните киселини (наситени, EPA+DHA, ALA) се мащабират по мазнините в каталога, ако те се
 *    различават от записа на USDA (например мляко 1,5% по записа за 2%);
 *  - scale — всичко се мащабира с този множител (леко кокосово мляко = разредено);
 *  - fill — нутриентите, които липсват в записа, се вземат от сроден запис (суров вместо печен и
 *    т.н.), пресметнати по енергията.
 * Липсващ нутриент в записа се приема за 0 и се отпечатва за проверка. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Каталожните храни (recipes.js) → FDC ID на SR Legacy. */
export const EXISTING = {
  oats: 173904, muesli: 173904, buckwheat: 170686, quinoa: 168917, bread: 172688, ryebread: 172684, gfbread: 174100,
  pita: 174916, rice: 168875, whiterice: 169757, bulgur: 170287, couscous: 169700, pasta: 168910, potato: 170438,
  sweetpotato: 168483, lentils: 172421, beans: 173740, chickpeas: 173757, peas: 170419, hummus: 172454, tofu: 172476,
  chicken: 171477, chickenthigh: 172388, turkey: 171496, turkeymince: 172850, beef: 170628, beefmince: 174030, pork: 168250,
  hake: 175161, trout: 173718, mackerel: [175120, { fill: [175119, 'vd', 'sug'] }], salmon: 175168, sardines: 175139, tuna: [171986, { fill: [173709, 'vd'] }], shrimp: [175180, { fill: [171971, 'vd', 'b12', 'fol', 'vc', 'sug'] }], egg: 171287,
  milk: 172205, lfmilk: 172205, oatmilk: null, yogurt: 170886, lfyogurt: 170886, soyyogurt: [175227, { nofort: ['vd', 'vc', 'b12'], fill: [172446, 'mg', 'fol'] }],
  oatyogurt: null, greekyogurt: 170903, kefir: [170904, { nofort: ['vd'] }], cottage: 172179, whitecheese: 173420,
  kashkaval: 170850, mozzarella: 170845,
  walnuts: 170187, almonds: 170567, hazelnuts: 170581, peanutbutter: 172469, pumpkinseeds: 170556, sunflower: 170562,
  tahini: 168604, flax: 169414, oil: 171413, avocado: 171705, olives: 169096,
  tomato: 170457, tomatosauce: 170460, cucumber: 168409, pepper: 170108, lettuce: 169249, arugula: 169387, spinach: 168462,
  broccoli: 170379, zucchini: 169291, eggplant: 169228, carrot: 170393, cabbage: 169975, greenbeans: 169961,
  cauliflower: 169986, mushrooms: 169251, onion: 170000, leek: 169246, beetroot: 169146, pumpkin: 168448, radish: 169276,
  apple: 171688, pear: 169118, orange: 169097, banana: 173944, peach: 169928, kiwi: 168153, berries: 167762, plum: 169949,
  grapes: 174683, watermelon: 167765, driedfruit: 168162, honey: 169640, darkchoc: 170273,
  celery: 169988, asparagus: 168389, kale: 168421, corn: 169998, tomatopaste: 170459, mango: 169910, pineapple: 169124,
  tortilla: 174081, breadcrumbs: 174928, flour: 168893, graham: 174957, tunasteak: 172006, whitefish: 171956,
  eggwhite: 172183, parmesan: 170848, sourcream: 173444, evapmilk: [170878, { nofort: ['vd'] }], butter: 173430,
  mayo: 173594, coconutmilk: [170173, { scale: 74 / 197 }], mustard: 172234, soysauce: 172473, ketchup: 168556,
  sugar: 169655, cornstarch: 169698, hoisin: 172886, cheddar: 171292, turkeysausage: 173871, phyllo: 172791,
  corntortilla: 175036, edamame: 168411, melon: 169092, plantain: 169130,
  cereal: [173884, { nofort: ['vd', 'vc', 'b12'] }], cornflakes: [174648, { nofort: ['vd', 'vc', 'b12'] }], cornbread: 175002,
};

/* Новите храни (версия 4.15): [id, име, група, FDC ID, флагове, мярка, английско име, състояние, опции]. */
export const NEW = [
  // Зърнени.
  ['oatbran', 'овесени трици', 'grain', 168872, 'gluten', null, 'oat bran'],
  ['barley', 'перлен ечемик, сварен', 'grain', 170285, 'gluten', null, 'pearl barley', 'cooked', { dry: 170284 }],
  ['millet', 'просо, сварено', 'grain', 168871, 'highgi', null, 'millet', 'cooked', { dry: 169702 }],
  ['spelt', 'спелта, сварена', 'grain', 169746, 'gluten', null, 'spelt', 'cooked', { dry: 169745, fill: [169745, 'sfa', 'ala', 'sug'] }],
  ['whitepasta', 'макарони, сварени', 'grain', 168928, 'gluten', null, 'pasta', 'cooked', { dry: 168927 }],
  ['crispbread', 'ръжени хрупкави хлебчета', 'grain', 172739, 'gluten salt', null, 'rye crispbread'],
  ['ricecakes', 'оризовки', 'grain', 168107, 'highgi', null, 'rice cakes'],
  ['popcorn', 'пуканки без мазнина и сол', 'grain', 170246, '', null, 'air-popped popcorn, unsalted'],
  // Бобови и соя.
  ['blackbeans', 'черен боб, сварен', 'legume', 173735, 'legume', null, 'black beans', 'cooked', { dry: 173734 }],
  ['whitebeans', 'бял боб, сварен', 'legume', 175203, 'legume', null, 'white beans', 'cooked', { dry: 175202 }],
  ['favabeans', 'бакла, сварена', 'legume', 173753, 'legume', null, 'fava beans', 'cooked', { dry: 175205 }],
  ['splitpeas', 'сушен грах, сварен', 'legume', 172429, 'legume', null, 'split peas', 'cooked', { dry: 172428 }],
  ['soybeans', 'соя (зърно), сварена', 'legume', 174271, 'legume soy', null, 'soybeans', 'cooked', { dry: 174270 }],
  ['tempeh', 'темпе', 'protein', 174272, 'soy', null, 'tempeh'],
  ['soymilk', 'соева напитка с калций', 'other', 172456, 'soy', null, 'soy drink with calcium', null, { nofort: ['vd', 'b12'], liquid: true }],
  // Месо и карантии.
  ['chickenliver', 'пилешки дробчета, задушени', 'protein', 171061, 'meat liver purine', null, 'chicken livers', 'simmered'],
  ['beefliver', 'телешки черен дроб, задушен', 'protein', 168626, 'meat redmeat liver purine', null, 'beef liver', 'braised'],
  ['rabbit', 'заешко, задушено', 'protein', 174346, 'meat', null, 'rabbit', 'stewed'],
  ['lamb', 'агнешко бутче (постно), печено', 'protein', 172487, 'meat redmeat', null, 'lean leg of lamb', 'roasted'],
  ['veal', 'телешко бутче, печено', 'protein', 173822, 'meat redmeat', null, 'veal leg', 'roasted'],
  ['porkchop', 'свински котлет (постен), печен', 'protein', 168240, 'meat redmeat pork', null, 'lean pork loin chop', 'broiled'],
  // Риба и морски дарове.
  ['herring', 'херинга, печена', 'protein', 175117, 'fish purine', null, 'herring', 'baked'],
  ['seabass', 'лаврак, печен', 'protein', 173694, 'fish', null, 'sea bass', 'baked'],
  ['seabream', 'ципура, печена', 'protein', 174241, 'fish', null, 'sea bream', 'baked', { fill: [175141, 'sfa', 'vd', 'sug'] }],
  ['carp', 'шаран, печен', 'protein', 174185, 'fish', null, 'carp', 'baked'],
  ['catfish', 'сом, печен', 'protein', 175166, 'fish', null, 'catfish', 'baked'],
  ['tilapia', 'тилапия, печена', 'protein', 175177, 'fish', null, 'tilapia', 'baked'],
  ['anchovy', 'хамсия, прясна', 'protein', 174182, 'fish purine', null, 'European anchovies, fresh'],
  ['cannedsalmon', 'консервирана сьомга (с костите)', 'protein', 173690, 'fish salt', null, 'canned salmon (with bones)'],
  ['squid', 'калмари, сурови', 'protein', 174223, 'seafood', null, 'squid, raw'],
  ['mussels', 'миди без черупка, сварени', 'protein', 174217, 'seafood purine', null, 'mussels, shelled', 'cooked'],
  ['octopus', 'октопод, сварен', 'protein', 174249, 'seafood', null, 'octopus', 'cooked'],
  ['quailegg', 'пъдпъдъчи яйца', 'protein', 172191, 'egg', ['piece', 9], 'quail eggs'],
  // Мляко и млечни.
  ['wholemilk', 'прясно мляко 3%', 'dairy', 172217, 'dairy lactose', null, 'whole milk 3%', null, { liquid: true }],
  ['skimmilk', 'обезмаслено мляко', 'dairy', 173432, 'dairy lactose', null, 'skim milk', null, { liquid: true }],
  ['buttermilk', 'мътеница', 'dairy', 170874, 'dairy lactose', null, 'buttermilk', null, { liquid: true }],
  ['sheepmilk', 'овче мляко', 'dairy', 170882, 'dairy lactose', null, 'sheep milk', null, { liquid: true }],
  ['goatmilk', 'козе мляко', 'dairy', 171278, 'dairy lactose', null, 'goat milk', null, { nofort: ['vd'], liquid: true }],
  ['cream', 'сметана 20%', 'dairy', 170857, 'dairy lactose', null, 'light cream 20%', null, { liquid: true }],
  ['wholeyogurt', 'кисело мляко 3,6%', 'dairy', 171284, 'dairy lactose', null, 'yogurt 3.6%'],
  ['skyr', 'цедено кисело мляко 0% (скир)', 'dairy', 170894, 'dairy lactose', null, 'nonfat strained yogurt (skyr)'],
  ['skimcottage', 'извара без мазнина', 'dairy', 172181, 'dairy lactose', null, 'fat-free cottage cheese'],
  ['ricotta', 'рикота', 'dairy', 171248, 'dairy lactose', null, 'ricotta (part-skim)'],
  ['creamcheese', 'крема сирене (леко)', 'dairy', 169079, 'dairy lactose', null, 'light cream cheese'],
  ['goatcheese', 'козе сирене (меко)', 'dairy', 173435, 'dairy lactose', null, 'soft goat cheese'],
  ['emmental', 'ементал', 'dairy', 171251, 'dairy', null, 'Emmental (Swiss cheese)'],
  ['whey', 'суроватъчен протеин (изолат)', 'dairy', 173177, 'dairy', null, 'whey protein isolate'],
  // Ядки и семена.
  ['cashews', 'кашу', 'nuts', 170162, 'nuts', null, 'cashews'],
  ['pistachios', 'шам-фъстък без сол', 'nuts', 170184, 'nuts', null, 'pistachios, unsalted'],
  ['peanuts', 'фъстъци, печени без сол', 'nuts', 173806, 'nuts', null, 'peanuts, dry-roasted, unsalted'],
  ['brazilnuts', 'бразилски орехи', 'nuts', 170569, 'nuts', null, 'Brazil nuts'],
  ['almondbutter', 'бадемово масло без сол', 'nuts', 168588, 'nuts', null, 'almond butter, unsalted'],
  ['chia', 'семена от чиа', 'nuts', 170554, 'seeds', null, 'chia seeds'],
  ['sesame', 'сусам', 'nuts', 170150, 'seeds', null, 'sesame seeds'],
  ['hemp', 'конопено семе, белено', 'nuts', 170148, 'seeds', null, 'hemp seeds, hulled'],
  // Мазнини.
  ['sunoil', 'слънчогледово олио', 'fat', 171025, 'oil', 'spoon', 'sunflower oil'],
  ['canola', 'рапично олио', 'fat', 172336, 'oil', 'spoon', 'rapeseed (canola) oil'],
  ['flaxoil', 'ленено масло', 'fat', 167702, 'oil', 'spoon', 'flaxseed oil'],
  // Зеленчуци.
  ['greenpepper', 'зелени чушки', 'veg', 170427, '', null, 'green peppers'],
  ['hotpepper', 'люта чушка', 'veg', 170497, '', null, 'hot chili pepper'],
  ['roastedpepper', 'печени червени чушки (буркан)', 'veg', 168546, 'salt', null, 'roasted red peppers (jar)'],
  ['cannedtomato', 'белени домати, консерва без сол', 'veg', 170138, '', null, 'canned peeled tomatoes, no salt added'],
  ['tomatojuice', 'доматен сок без сол', 'veg', 170545, '', null, 'tomato juice, no salt added', null, { liquid: true }],
  ['redcabbage', 'червено зеле', 'veg', 169977, '', null, 'red cabbage'],
  ['brussels', 'брюкселско зеле', 'veg', 170383, '', null, 'Brussels sprouts'],
  ['kohlrabi', 'алабаш', 'veg', 168424, '', null, 'kohlrabi'],
  ['sauerkraut', 'кисело зеле', 'veg', 169279, 'salt', null, 'sauerkraut'],
  ['pickles', 'кисели краставички', 'veg', 168558, 'salt', null, 'pickled cucumbers'],
  ['romaine', 'маруля', 'veg', 169247, '', null, 'romaine lettuce'],
  ['iceberg', 'айсберг', 'veg', 169248, '', null, 'iceberg lettuce'],
  ['chard', 'манголд', 'veg', 169991, '', null, 'Swiss chard'],
  ['sorrel', 'киселец', 'veg', 170076, '', null, 'sorrel'],
  ['nettle', 'коприва, бланширана', 'veg', 169819, '', null, 'stinging nettles', 'blanched'],
  ['sprouts', 'кълнове от люцерна', 'veg', 168384, '', null, 'alfalfa sprouts'],
  ['okra', 'бамя', 'veg', 169260, '', null, 'okra'],
  ['artichoke', 'артишок, сварен', 'veg', 168386, '', null, 'artichoke', 'cooked'],
  ['celeriac', 'целина (корен)', 'veg', 170400, '', null, 'celeriac'],
  ['parsnip', 'пащърнак', 'veg', 170417, '', null, 'parsnip'],
  ['turnip', 'ряпа', 'veg', 170465, '', null, 'turnip'],
  ['oystermush', 'гъби кладница', 'veg', 168580, '', null, 'oyster mushrooms'],
  ['scallions', 'пресен лук', 'veg', 170005, '', null, 'spring onions'],
  ['garlic', 'чесън', 'veg', 169230, '', null, 'garlic'],
  ['parsley', 'магданоз', 'veg', 170416, '', null, 'parsley'],
  ['dill', 'копър', 'veg', 172233, '', null, 'dill'],
  // Плодове.
  ['cherries', 'череши', 'fruit', 171719, '', null, 'sweet cherries'],
  ['sourcherries', 'вишни', 'fruit', 173954, '', null, 'sour cherries'],
  ['apricot', 'кайсии', 'fruit', 171697, '', ['piece', 35], 'apricots'],
  ['nectarine', 'нектарина', 'fruit', 169914, '', ['piece', 140], 'nectarine'],
  ['fig', 'смокини, пресни', 'fruit', 173021, '', ['piece', 50], 'fresh figs'],
  ['tangerine', 'мандарина', 'fruit', 169105, '', ['piece', 75], 'tangerine'],
  ['persimmon', 'райска ябълка', 'fruit', 169941, '', ['piece', 170], 'persimmon'],
  ['quince', 'дюля', 'fruit', 168163, '', null, 'quince'],
  ['pomegranate', 'нар (зърна)', 'fruit', 169134, '', null, 'pomegranate seeds'],
  ['grapefruit', 'грейпфрут', 'fruit', 174673, 'grapefruit', null, 'grapefruit'],
  ['blueberries', 'боровинки', 'fruit', 171711, '', null, 'blueberries'],
  ['raspberries', 'малини', 'fruit', 167755, '', null, 'raspberries'],
  ['blackberries', 'къпини', 'fruit', 173946, '', null, 'blackberries'],
  ['lemonjuice', 'лимонов сок', 'fruit', 167747, '', null, 'lemon juice', null, { liquid: true }],
  ['applesauce', 'ябълково пюре без захар', 'fruit', 171695, '', null, 'unsweetened applesauce'],
  ['raisins', 'стафиди', 'fruit', 168165, 'sweet', null, 'raisins'],
  ['dates', 'фурми', 'fruit', 171726, 'sweet', null, 'dates'],
  ['driedapricots', 'сушени кайсии', 'fruit', 173941, 'sweet', null, 'dried apricots'],
  // Други.
  ['cocoa', 'какао на прах', 'other', 169593, '', null, 'cocoa powder, unsweetened'],
  ['jam', 'конфитюр', 'other', 169641, 'sweet highgi', null, 'jam'],
];

const NUT = {
  1008: 'kcal', 1003: 'p', 1005: 'c', 1004: 'f', 1079: 'fib', 1093: 'na', 1092: 'k', 1089: 'fe', 1087: 'ca',
  1258: 'sfa', 2000: 'sug', 1090: 'mg', 1162: 'vc', 1114: 'vd', 1178: 'b12', 1187: 'folf', 1190: 'fol', 1186: 'fola',
  1177: 'folt', 1278: 'epa', 1272: 'dha', 1404: 'ala', 1270: 'ala18',
};
/* Колоните на MICRO: наситени мастни киселини г, захари г, магнезий мг, витамин C мг, витамин D мкг,
 * B12 мкг, фолат мкг, EPA+DHA мг, ALA г. */
export const MICRO_KEYS = ['sfa', 'sug', 'mg', 'vc', 'vd', 'b12', 'fol', 'n3', 'ala'];

function parse(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function load(dir) {
  const rows = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).slice(1).map(parse);
  const db = {};
  for (const [id, , desc] of rows('food.csv')) db[id] = { id: +id, d: desc };
  for (const r of rows('food_nutrient.csv')) { const k = NUT[r[2]]; if (k && db[r[1]]) db[r[1]][k] = +r[3]; }
  return db;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/** Микронутриентите на 100 г по записа и правилата; missing — кои липсват в записа. */
function micro(rec0, { nofort = [], scale = 1, fat = null, fill = null } = {}, db = {}) {
  const missing = [];
  const rec = { ...rec0 };
  if (fill) {
    const [fdc, ...keys] = fill;
    const src = db[fdc];
    for (const k of keys) {
      const kk = k === 'fol' ? 'folf' : k === 'ala' ? 'ala' : k;
      if (rec[kk] === undefined && src[kk] !== undefined) rec[kk] = src[kk] * rec.kcal / src.kcal;
    }
  }
  const v = (k) => { if (rec[k] === undefined) { missing.push(k); return 0; } return rec[k]; };
  const fol = rec.folf !== undefined ? rec.folf : rec.fola ? Math.max(0, (rec.folt ?? 0) - rec.fola) : v('fol');
  const ala = rec.ala !== undefined ? rec.ala : v('ala18');
  // Мастните киселини — по мазнините в каталога.
  const fr = fat !== null && rec.f > 0.5 && Math.abs(fat / rec.f - 1) > 0.1 ? fat / rec.f : 1;
  const out = {
    sfa: v('sfa') * fr, sug: v('sug'), mg: v('mg'), vc: v('vc'), vd: v('vd'), b12: v('b12'), fol,
    n3: ((rec.epa ?? 0) + (rec.dha ?? 0)) * 1000 * fr, ala: ala * fr,
  };
  for (const k of nofort) out[k] = 0;
  for (const k of Object.keys(out)) out[k] *= scale;
  return {
    values: [r2(out.sfa) >= 1 ? r1(out.sfa) : r2(out.sfa), r1(out.sug), Math.round(out.mg), r1(out.vc), r1(out.vd), r2(out.b12),
      Math.round(out.fol), Math.round(out.n3), r2(out.ala)],
    missing,
  };
}

async function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Пътят до SR Legacy CSV липсва.'); process.exit(1); }
  const db = load(dir);
  const { FOODS } = await import(path.join(ROOT, 'public/js/shared/recipes.js'));
  const lines = [];
  const report = [];
  const add = (id, fdc, opts, fat) => {
    if (!fdc) { lines.push(`  ${id}: null,`); return; }
    const rec = db[fdc];
    if (!rec) throw new Error(`FDC ${fdc} (${id}) липсва`);
    const { values, missing } = micro(rec, { ...opts, fat }, db);
    if (missing.length) report.push(`${id} (${fdc}): липсват ${missing.join(', ')}`);
    lines.push(`  ${id}: [${fdc}, ${values.join(', ')}],`);
  };
  for (const [id, ref] of Object.entries(EXISTING)) {
    const [fdc, opts] = Array.isArray(ref) ? ref : [ref, {}];
    add(id, fdc, opts, FOODS[id] ? FOODS[id].f : null);
  }
  for (const [id, , , fdc, , , , , opts = {}] of NEW) add(id, fdc, opts, null);
  const out = `/* Витамини, минерали и мастни киселини на 100 г (версия 4.15) — USDA FoodData Central, SR Legacy
 * (2018, обществено достояние). Първото число е FDC ID на записа: https://fdc.nal.usda.gov/food-details/<FDC ID>/nutrients
 * Генерирано от scripts/usda-foods.mjs — не се редактира на ръка.
 * Колони: FDC ID, наситени мастни киселини г, захари г, магнезий мг, витамин C мг, витамин D мкг, B12 мкг,
 * фолат мкг (от храната, без добавена фолиева киселина), EPA+DHA мг, алфа-линоленова киселина (ALA) г.
 * null — няма подходящ запис (растителните напитки и кисели млека са различни по производител). */

export const MICRO_KEYS = ${JSON.stringify(MICRO_KEYS).replace(/"/g, "'").replace(/,/g, ', ')};

export const MICRO = {
${lines.join('\n')}
};
`;
  fs.writeFileSync(path.join(ROOT, 'public/js/shared/food-micro.js'), out);
  console.log(`food-micro.js: ${lines.length} храни`);
  for (const r of report) console.log('  ' + r);

  if (process.argv.includes('--new')) {
    const R = (v) => (v >= 100 ? Math.round(v) : r1(v));
    console.log('\n// recipes.js — FOODS');
    for (const [id, name, cat, fdc, flags, unit] of NEW) {
      const x = db[fdc];
      const fl = new Set(flags.split(' ').filter(Boolean));
      if ((x.k ?? 0) >= 350) fl.add('highK');
      const u = unit === 'spoon' ? ', SPOON' : unit ? `, PIECE(${unit[1]})` : '';
      const fib = x.fib ?? 0;
      console.log(`  ${id}: F('${name}', '${cat}', ${Math.round(x.kcal)}, ${R(x.p)}, ${R(x.c)}, ${R(x.f)}, ${r1(fib)}, ${Math.round(x.na ?? 0)}, ${Math.round(x.k ?? 0)}, '${[...fl].join(' ')}'${u}),${' '.repeat(Math.max(1, 4))}// ${fdc}${x.fib === undefined ? ' (фибри: няма данни)' : ''}`);
    }
    console.log('\n// recipes.js — MINERALS');
    console.log('  ' + NEW.map(([id, , , fdc]) => `${id}: [${r1(db[fdc].fe ?? 0)}, ${Math.round(db[fdc].ca ?? 0)}]`).join(', '));
    console.log('\n// recipes.js — YIELDS');
    for (const [id, , , fdc, , , , , opts = {}] of NEW) {
      if (opts.dry) console.log(`  ${id}: { dry: ${r2(db[opts.dry].kcal / db[fdc].kcal)} },   // ${opts.dry} / ${fdc}`);
    }
    console.log('\n// LIQUIDS: ' + NEW.filter(n => n[8]?.liquid).map(n => `'${n[0]}'`).join(', '));
    console.log('\n// en-foods.js');
    console.log('  ' + NEW.map(([id, , , , , , en, st]) => `${id}: [${JSON.stringify(en)}${st ? `, ${JSON.stringify(st)}` : ''}]`).join(', '));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
