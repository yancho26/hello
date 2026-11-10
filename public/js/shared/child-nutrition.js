/* Хранене за деца от 1 до 17 години (версия 4.16).
 *
 * Изчисления:
 *   • енергия по EFSA 2013 — покой по уравненията на Henry 2005 (тегло и ръст) × коефициент
 *     за физическа активност (PAL) × 1,01 за растежа; PAL 1,4 до 3 г., 1,4–1,8 от 4 до 9 г.,
 *     1,6–2,0 от 10 до 17 г. За дете с референтното тегло и ръст резултатът съвпада с
 *     таблицата на EFSA (обобщен доклад за DRV, 2017, табл. 1);
 *   • ИТМ за възрастта по стандартите на СЗО (2006 до 5 г., 2007 от 5 до 19 г.). При
 *     наднормено тегло енергията и белтъкът са за коригирано тегло (теглото при медианния ИТМ
 *     плюс 25% от излишъка), при поднормено — за теглото при медианния ИТМ;
 *   • белтък — PRI на EFSA 2012 (г/кг дневно по възраст и пол); мазнини 35–40% от енергията
 *     до 3 г. и 20–35% след това; въглехидрати 45–60%; фибри и вода — AI на EFSA;
 *   • калций, желязо, калий, магнезий, витамини C, D, B12 и фолат — EFSA 2017;
 *   • натрий — безопасен и достатъчен прием по EFSA 2019: 1,1 г (1–3 г.), 1,3 г (4–6 г.),
 *     1,7 г (7–10 г.), 2,0 г (11–17 г.);
 *   • свободни захари под 5% от енергията от 2 до 18 г. и още по-малко до 2 г. (ESPGHAN 2017);
 *   • напитки до 5 г. — Healthy Eating Research 2019 (AAP, AND, AHA, AAPD).
 * Менюто е от същите рецепти като при възрастните: до 2 г. — пълномаслено мляко и без мед и
 * добавена захар, до 4 г. — без цели ядки, семки и пуканки (задавяне, AAP 2010). */

import { table } from './table.js';
import { growthAge, lmsAt, percentileFromZ, zScore } from './growth.js';

const r1 = (v) => Math.round(v * 10) / 10;
const dec = (v) => String(v).replace('.', ',');
const KCAL_PER_MJ = 238.83;

/* ---------------------------- физическа активност ---------------------------- */

/** Коефициентът за активност (PAL) по EFSA 2013 — кой е възможен зависи от възрастта. */
export const CHILD_ACTIVITY = table({
  low: { label: 'малко движение', pal: 1.4 },
  moderate: { label: 'умерено активно', pal: 1.6 },
  active: { label: 'активно', pal: 1.8 },
  very: { label: 'много активно (спорт)', pal: 2.0 },
});

/** Възможните нива за възрастта (EFSA използва PAL 1,4 до 3 г., 1,4–1,8 от 4 до 9 г., 1,6–2,0 от 10 г.). */
export function childActivityOptions(years) {
  if (years < 4) return ['low'];
  if (years < 10) return ['low', 'moderate', 'active'];
  return ['moderate', 'active', 'very'];
}

export const defaultChildActivity = (years) => (years < 4 ? 'low' : 'moderate');

/* --------------------------------- енергия --------------------------------- */

/** Енергия в покой (MJ дневно) по Henry 2005 с тегло (кг) и ръст (м) — уравненията, които ползва EFSA. */
export function henryRee(sex, years, weight, heightCm) {
  const W = weight;
  const H = heightCm / 100;
  if (sex === 'f') {
    if (years < 3) return 0.127 * W + 2.94 * H - 1.20;
    if (years < 10) return 0.0666 * W + 0.878 * H + 1.46;
    return 0.0393 * W + 1.04 * H + 1.93;
  }
  if (years < 3) return 0.118 * W + 3.59 * H - 1.55;
  if (years < 10) return 0.0632 * W + 1.31 * H + 1.28;
  return 0.0651 * W + 1.11 * H + 1.25;
}

/* ------------------------------- ИТМ за възрастта ------------------------------- */

/**
 * ИТМ за възрастта по СЗО: стойност, z, перцентил и група. До 5 г. наднорменото тегло е над +2 SD,
 * а затлъстяването — над +3 SD; от 5 г. — над +1 и +2 SD. Поднормено — под −2 SD, тежко — под −3 SD.
 */
export function childBmi(sex, ageMonths, weight, height) {
  const value = weight / (height / 100) ** 2;
  const z = zScore('bmi', sex, ageMonths, value);
  const under5 = ageMonths <= 60;
  let status = 'normal';
  if (z !== null) {
    if (z < -3) status = 'severeThin';
    else if (z < -2) status = 'thin';
    else if (z > (under5 ? 3 : 2)) status = 'obese';
    else if (z > (under5 ? 2 : 1)) status = 'over';
    else if (under5 && z > 1) status = 'risk';
  }
  const lms = lmsAt('bmi', sex, ageMonths);
  return {
    value: r1(value), z: z === null ? null : Math.round(z * 100) / 100,
    percentile: z === null ? null : percentileFromZ(z),
    median: lms ? r1(lms.M) : null, status, label: BMI_STATUS[status],
  };
}

export const BMI_STATUS = table({
  severeThin: 'тежко поднормено хранене',
  thin: 'поднормено хранене',
  normal: 'в норма',
  risk: 'риск от наднормено тегло',
  over: 'наднормено тегло',
  obese: 'затлъстяване',
});

/* Поредните числа и перцентилът като текст — в growth.js (общи за растежа и за режима). */
export { ordinalBg, percentileText } from './growth.js';

/* --------------------------- референтни стойности --------------------------- */

/* Белтък — PRI в г/кг дневно (EFSA 2012); от 11 г. — за момчета и момичета поотделно. */
const PROTEIN_PRI = { 1: 1.14, 1.5: 1.03, 2: 0.97, 3: 0.90, 4: 0.86, 5: 0.85, 6: 0.89, 7: 0.91, 8: 0.92, 9: 0.92, 10: 0.91 };
const PROTEIN_PRI_TEEN = { 11: [0.91, 0.90], 12: [0.90, 0.89], 13: [0.90, 0.88], 14: [0.89, 0.87], 15: [0.88, 0.85], 16: [0.87, 0.84], 17: [0.86, 0.83] };

export function proteinPri(sex, years) {
  const y = Math.floor(years);
  if (y >= 11) return PROTEIN_PRI_TEEN[Math.min(17, y)][sex === 'f' ? 1 : 0];
  if (y === 1) return years >= 1.5 ? PROTEIN_PRI[1.5] : PROTEIN_PRI[1];
  return PROTEIN_PRI[y];
}

/** Стойностите на EFSA по възрастови групи: [до (вкл.), стойност] — възрастта е в навършени години. */
const byAge = (y, rows) => rows.find(([to]) => y <= to)[1];

/**
 * Референтните стойности за детето (EFSA 2017; натрий — EFSA 2019; вода — EFSA 2010).
 * y — навършени години.
 */
export function childReferences(sex, years) {
  const y = Math.floor(years);
  const f = sex === 'f';
  const sodium = byAge(y, [[3, 1.1], [6, 1.3], [10, 1.7], [17, 2.0]]);
  const water = byAge(y, [[1, 1.1], [3, 1.3], [8, 1.6], [13, f ? 1.9 : 2.1], [17, f ? 2.0 : 2.5]]);
  return {
    fiber: byAge(y, [[3, 10], [6, 14], [10, 16], [14, 19], [17, 21]]),
    calcium: byAge(y, [[3, 450], [10, 800], [17, 1150]]),
    iron: f ? byAge(y, [[6, 7], [11, 11], [17, 13]]) : byAge(y, [[6, 7], [17, 11]]),
    sodium,
    salt: r1(sodium * 2.5),
    water,
    micro: {
      k: byAge(y, [[3, 800], [6, 1100], [10, 1800], [14, 2700], [17, 3500]]),
      mg: byAge(y, [[2, 170], [9, 230], [17, f ? 250 : 300]]),
      vc: byAge(y, [[3, 20], [6, 30], [10, 45], [14, 70], [17, f ? 90 : 100]]),
      fol: byAge(y, [[3, 120], [6, 140], [10, 200], [14, 270], [17, 330]]),
      b12: byAge(y, [[6, 1.5], [10, 2.5], [14, 3.5], [17, 4]]),
      vd: 15,
      // EPA+DHA 250 мг от 2 г.; до 2 г. — DHA 100 мг (EFSA 2010).
      n3: y < 2 ? 100 : 250,
    },
  };
}

/* -------------------------------- целите -------------------------------- */

/**
 * Енергия, белтък, мазнини, въглехидрати и всичко останало за детето.
 * input: sex, ageMonths, weight (кг), height (см), activity (ключ от CHILD_ACTIVITY), gestWeeks (при недоносеност).
 */
export function childTargets({ sex, ageMonths, weight, height, activity, gestWeeks = null }) {
  const years = ageMonths / 12;
  const options = childActivityOptions(years);
  const act = options.includes(activity) ? activity : defaultChildActivity(years);
  const pal = CHILD_ACTIVITY[act].pal;
  // ИТМ за възрастта — по коригираната възраст при недоносено дете до 2 г. (както в раздел „Растеж“).
  const bmi = childBmi(sex, growthAge(ageMonths, gestWeeks).months, weight, height);
  // Теглото за изчисленията: при наднормено — коригирано, при поднормено — при медианния ИТМ.
  const ideal = bmi.median ? bmi.median * (height / 100) ** 2 : weight;
  let used = weight;
  let basis = 'actual';
  if ((bmi.status === 'over' || bmi.status === 'obese') && ideal < weight) {
    used = ideal + 0.25 * (weight - ideal);
    basis = 'adjusted';
  } else if ((bmi.status === 'thin' || bmi.status === 'severeThin') && ideal > weight) {
    used = ideal;
    basis = 'median';
  }
  const reeMj = henryRee(sex, years, used, height);
  const ree = Math.round(reeMj * KCAL_PER_MJ);
  const tee = Math.round(reeMj * pal * 1.01 * KCAL_PER_MJ);
  const kcal = Math.round(tee / 10) * 10;
  const pri = proteinPri(sex, years);
  const protein = Math.max(1, Math.round(pri * used));
  // Горна граница за менюто — горната граница на допустимия дял на белтъка (IOM 2005): 20% от енергията
  // до 3 г. и 30% от 4 до 18 г.; тук от 4 г. — 25%.
  const proteinMax = Math.round((kcal * (years < 4 ? 0.20 : 0.25)) / 4);
  const fatPct = years < 4 ? 35 : 32;
  const fat = Math.round((kcal * fatPct / 100) / 9);
  // Въглехидратите — с белтъка, към който се нагласява менюто: около 12% от енергията.
  const carbs = Math.round((kcal - Math.max(protein, kcal * 0.12 / 4) * 4 - fat * 9) / 4);
  const ref = childReferences(sex, years);
  return {
    years, activity: act, pal, bmi, weightUsed: r1(used), weightBasis: basis,
    ree, tee, kcal, protein, proteinPerKg: pri, proteinMax, fatPct, fat, carbs,
    carbPct: Math.round((carbs * 4 / kcal) * 100),
    fiber: ref.fiber,
    // Наситени мазнини — под 10% от енергията от 2 г. (СЗО 2023); до 2 г. не се ограничават.
    satFat: years < 2 ? null : Math.round((kcal * 0.10) / 9),
    // Свободни захари: под 5% от енергията от 2 г.; до 2 г. — колкото е възможно по-малко (ESPGHAN 2017).
    sugarMax: years < 2 ? 0 : Math.round((kcal * 0.05) / 4),
    salt: ref.salt, sodium: ref.sodium,
    // Водата по EFSA е общо — с храната; от напитки — около 75%.
    water: ref.water, fluids: Math.round(ref.water * 0.75 * 10) * 100,
    iron: ref.iron, calcium: ref.calcium, micro: ref.micro,
  };
}

/* ----------------------------- храни и рецепти ----------------------------- */

/* До 4 г. — без цели ядки, семки и пуканки (задавяне — най-често до 3 г., AAP 2010). Пастите от ядки остават. */
const CHOKING = ['walnuts', 'almonds', 'hazelnuts', 'cashews', 'pistachios', 'peanuts', 'brazilnuts', 'pumpkinseeds', 'sunflower', 'popcorn'];
/* До 2 г. — без мед и добавена захар (ESPGHAN 2017: колкото е възможно по-малко свободни захари). */
const ADDED_SUGAR = ['honey', 'sugar', 'jam', 'darkchoc'];

/**
 * Кои храни не влизат в менюто на детето и кои се дават по-рядко.
 * Прясната риба тон (много живак) — за всички деца; черен дроб (витамин A) и колбаси — по-рядко.
 */
export function childFoodRules(years) {
  const exclude = new Set(['tunasteak']);
  const penalize = new Set(['chickenliver', 'beefliver', 'turkeysausage', 'ketchup', 'hoisin', 'graham']);
  if (years < 4) for (const f of CHOKING) exclude.add(f);
  if (years < 2) for (const f of ADDED_SUGAR) exclude.add(f);
  return { exclude, penalize, wholeMilk: years < 2 };
}

/**
 * Млякото за деня до 5 г. (HER 2019): до 2 г. — 2 чаши пълномаслено (470–710 мл; при кърмене — 1 чаша),
 * от 2 до 5 г. — около 400 мл с понижена масленост (горна граница 470–590 мл). В менюто е отделно
 * „хранене“ — енергията му се изважда от ястията. Без млечни — заместителят се избира с лекар.
 */
export function childMilk(years, prefs, breastfed = false) {
  if (years >= 6 || prefs.has('noDairy') || prefs.has('vegan')) return null;
  const lactoseFree = prefs.has('lactoseFree');
  if (years < 2) {
    const ml = breastfed ? 240 : 480;
    return { food: lactoseFree ? 'lfmilk' : 'wholemilk', ml, name: breastfed ? 'Чаша мляко вечер' : 'Мляко сутрин и вечер (по 240 мл)' };
  }
  return { food: lactoseFree ? 'lfmilk' : 'milk', ml: 400, name: 'Мляко сутрин и вечер (по 200 мл)' };
}

/* ----------------------------- диагнози при деца ----------------------------- */

/* Профилите по МКБ-10, чийто текст е подходящ и за деца; при другите се пазят само
 * ограниченията (без глутен, без лактоза, изключени храни) и нуждата от диетолог. */
/* Текстовете за деца по диагнозите — от версия 4.17 тук, защото текстовете за възрастни в
 * diet-advice.js са написани към възрастния човек. */
const CHILD_DX_TEXT = [
  { re: /^K59\.0/, prefer: ['Запек: балансирано хранене с достатъчно фибри (плодове, зеленчуци, пълнозърнести, бобови) и течности; самото хранене обикновено не стига — лечението е по указание на лекаря (NICE CG99).'] },
  { re: /^E10/, notes: ['Диабет тип 1: хранене като за връстниците, с броене на въглехидратите според инсулина (ISPAD 2022); подсладените напитки — само при хипогликемия.'] },
  { re: /^K21/, prefer: ['Рефлукс: по-малки порции; последното хранене 2–3 часа преди сън; мазни храни и газирани напитки — според оплакванията.'] },
  { re: /^K90\.0/, notes: ['Цьолиакия: строго безглутеново хранене за цял живот — също и следи от глутен (общи тигани, панировка, сосове).'] },
  { re: /^E73/, notes: ['Непоносимост към лактоза: до 12 г лактоза наведнъж (чаша мляко) обикновено се понася; киселото мляко и отлежалите сирена — също.'] },
  { re: /^T78\.[01]|^Z91\.0/, clinician: ['Хранителна алергия: впишете конкретния алерген в „Алергии“ (ядки, риба, мляко, яйца, соя, глутен) — тогава менюто го изключва.'] },
  { re: /^L20/, notes: ['Атопичен дерматит: без елиминационни диети само по резултат от алергологично изследване; храна се избягва само при доказана алергия (AAD 2014).',
    'Рибено масло, витамин D и други добавки нямат достатъчно доказателства; пробиотици за лечение не се препоръчват (AAD 2014).'] },
  { re: /^E55/, prefer: ['Витамин D: мазна риба, яйца, обогатени млечни; добавката — по назначение.'] },
  { re: /^K5[01]/, notes: ['Болест на Крон/колит: в ремисия — разнообразно хранене; при активност или стеснения — с малко фибри и по указание на диетолог.'] },
  { re: /^E7[04]/, warnings: ['Вродено нарушение на обмяната (фенилкетонурия, непоносимост към фруктоза и др.): нужен е специализиран режим — това меню не е приложимо.'] },
  { re: /^F50/, clinician: ['Хранително разстройство: режимът се изготвя от специализиран екип; не давайте на пациента цифри за калории.'] },
];

/**
 * Текстовете по диагнозите за дете. Ограниченията и изключените храни от профилите по МКБ-10
 * се прилагат отделно, както при възрастните.
 */
export function childDiagnoses(codes) {
  const out = { prefer: [], limit: [], avoid: [], notes: [], warnings: [], clinician: [] };
  const add = (k, s) => { if (!out[k].includes(s)) out[k].push(s); };
  for (const c of codes) {
    for (const t of CHILD_DX_TEXT.filter(x => x.re.test(c))) for (const k of Object.keys(out)) for (const s of t[k] || []) add(k, s);
  }
  return out;
}

/* ------------------------------- съветите ------------------------------- */

/** Напитките за деня до 5 г. — Healthy Eating Research 2019. */
export function childDrinks(years) {
  if (years >= 6) return null;
  if (years < 2) {
    return [
      { what: 'Вода', amount: '240–950 мл (1–4 чаши)' },
      { what: 'Мляко — пълномаслено', amount: '470–710 мл (2–3 чаши)' },
      { what: 'Плодов сок 100%', amount: 'до 120 мл — само ако не яде достатъчно плодове' },
    ];
  }
  if (years < 4) {
    return [
      { what: 'Вода', amount: '240–950 мл (1–4 чаши)' },
      { what: 'Мляко — с понижена масленост', amount: 'до 470 мл (2 чаши)' },
      { what: 'Плодов сок 100%', amount: 'до 120 мл — само ако не яде достатъчно плодове' },
    ];
  }
  return [
    { what: 'Вода', amount: '360–1180 мл (1,5–5 чаши)' },
    { what: 'Мляко — с понижена масленост', amount: 'до 590 мл (2,5 чаши)' },
    { what: 'Плодов сок 100%', amount: 'до 120–180 мл — само ако не яде достатъчно плодове' },
  ];
}

/**
 * Правилата и съветите за детето — от версия 4.17 написани към родителя, като двойки [bg, en].
 * t — childTargets; prefs — ограниченията (Set); breastfed — кърменето продължава.
 * clinician — числата за ИТМ и насочването: за лекаря, не и в отчета за родителя.
 */
export function childGuidance(t, { prefs, breastfed = false }) {
  const y = t.years;
  const prefer = [];
  const limit = [];
  const avoid = [];
  const notes = [];
  const warnings = [];
  const clinician = [];
  const dairyFree = prefs.has('noDairy') || prefs.has('vegan');
  const c = (v) => [dec(v), String(v)];
  const [caB, caE] = c(t.calcium);

  prefer.push(['Предлагайте зеленчуци и плодове на всяко хранене. Целите плодове са по-добри от сока.', 'Offer vegetables and fruit at every meal. Whole fruit is better than juice.']);
  prefer.push(['Всеки ден пълнозърнести храни, а често и бобови и яйца.', 'Whole grains every day, and pulses and eggs often.']);
  if (y < 4) prefer.push(['До 3 години детето има нужда от повече мазнини, 35–40% от енергията: слагайте зехтин, олио или масло в ястията.', 'Until age 3 your child needs more fat, 35–40% of energy: add olive oil, vegetable oil or butter to dishes.']);
  if (!dairyFree) {
    prefer.push(y < 2
      ? (breastfed
        ? [`Пълномаслено мляко, кисело мляко и сирене за калция (${caB} мг на ден), заедно с кърмата, колкото детето суче.`, `Full-fat milk, yogurt and cheese for calcium (${caE} mg a day), alongside breastfeeding as much as your child wants.`]
        : [`Пълномаслено мляко, около 470–710 мл на ден, и кисело мляко и сирене за калция (${caB} мг на ден).`, `Full-fat milk, about 470–710 ml a day, plus yogurt and cheese for calcium (${caE} mg a day).`])
      : y < 6
        ? [`Мляко с понижена масленост до ${y < 4 ? '470' : '590'} мл на ден и кисело мляко и сирене за калция (${caB} мг на ден).`, `Reduced-fat milk up to ${y < 4 ? '470' : '590'} ml a day, plus yogurt and cheese for calcium (${caE} mg a day).`]
        : [`Млечни продукти всеки ден (мляко, кисело мляко, сирене) за калция: ${caB} мг на ден.`, `Dairy every day (milk, yogurt, cheese) for calcium: ${caE} mg a day.`]);
  }
  const [flB, flE] = c(r1(t.fluids / 1000));
  prefer.push(y < 6
    ? ['Водата е основната напитка; за всеки ден са само водата и млякото.', 'Water is the main drink; water and milk are the only everyday drinks.']
    : [`Водата е основната напитка: около ${flB} л на ден, повече при спорт и в жега.`, `Water is the main drink: about ${flE} l a day, more with sport and in hot weather.`]);
  if (breastfed && y < 3) prefer.push(['Кърменето може да продължи до 2 години и след това, докато Вие и детето желаете.', 'Breastfeeding can continue to age 2 and beyond, for as long as you and your child wish.']);

  const [saB, saE] = c(t.salt);
  limit.push([`Сол до ${saB} г на ден. Не досолявайте храната на детето и внимавайте с хляба, сиренето, колбасите, чипса и готовите храни.`,
    `Salt up to ${saE} g a day. Do not add salt to your child’s food, and watch out for bread, cheese, cured meats, crisps and ready meals.`]);
  limit.push(y < 2
    ? ['До 2 години е най-добре да няма добавена захар; в менюто няма мед и захар.', 'Until age 2 it is best to have no added sugar; the menu has no honey or sugar.']
    : [`Захар: до ${t.sugarMax} г на ден. Сладкото давайте след основно хранене, не между храненията; броят се и подсладените млечни продукти и сокът.`,
      `Sugar: up to ${t.sugarMax} g a day. Give sweets after a main meal, not between meals; sweetened dairy and juice count too.`]);
  if (y < 6) limit.push([`Плодов сок 100%: до ${y < 4 ? '120' : '120–180'} мл на ден и само ако детето не яде достатъчно плодове.`, `100% fruit juice: up to ${y < 4 ? '120' : '120–180'} ml a day, and only if your child does not eat enough fruit.`]);
  limit.push(['Колбаси, кренвирши, чипс и пакетирани закуски: рядко.', 'Sausages, hot dogs, crisps and packaged snacks: rarely.']);

  avoid.push(['Подсладени и газирани напитки, напитки с подсладители, енергийни напитки, кафе и чай с кофеин.', 'Sweetened and fizzy drinks, drinks with sweeteners, energy drinks, coffee and caffeinated tea.']);
  if (y < 6 && !dairyFree) avoid.push(['Растителни напитки вместо мляко, ароматизирано мляко и „мляко за малки деца“, освен ако лекарят не ги е препоръчал.', 'Plant drinks instead of milk, flavored milk and toddler milks, unless a doctor has recommended them.']);
  if (y < 4) {
    avoid.push(['До 4 години пазете детето от задавяне: не давайте цели ядки и семки, пуканки и твърди бонбони. Гроздето и чери доматите режете на четвъртинки, морковите и ябълките настъргайте или сварете, а кренвиршите режете на тънки ивици. Ядките давайте смлени или като паста.',
      'Until age 4, protect your child from choking: no whole nuts or seeds, popcorn or hard sweets. Cut grapes and cherry tomatoes into quarters, grate or cook carrots and apples, and cut hot dogs into thin strips. Give nuts ground or as a paste.']);
  }
  avoid.push(['Сурово или недопечено месо, риба и яйца, непастьоризирано мляко, риба меч, акула и прясна риба тон.', 'Raw or undercooked meat, fish and eggs, unpasteurized milk, swordfish, shark and fresh tuna.']);

  if (dairyFree && y < 6) {
    warnings.push(['Без мляко малкото дете има нужда от заместител, обогатен с калций и витамин D. Изберете го заедно с мен или с диетолог; растежът ще се следи по-често.',
      'Without milk, a young child needs a substitute fortified with calcium and vitamin D. Choose it with me or a dietitian; growth will be checked more often.']);
  }
  if (prefs.has('vegan')) {
    warnings.push(['Веганско хранене при дете се прави само с педиатричен диетолог. Витамин B12 като добавка е задължителен, а желязото, калцият, йодът, витамин D, омега-3 и растежът трябва да се следят.',
      'A vegan diet for a child should only be followed with a pediatric dietitian. A vitamin B12 supplement is essential, and iron, calcium, iodine, vitamin D, omega-3 and growth all need monitoring.']);
  } else if (prefs.has('vegetarian')) {
    notes.push(['При вегетарианско хранене желязото идва от бобови, яйца и пълнозърнести храни, по-добре заедно с витамин C, а витамин B12 от млечните продукти и яйцата.',
      'On a vegetarian diet, iron comes from pulses, eggs and whole grains, ideally with vitamin C, and vitamin B12 from dairy and eggs.']);
  }

  // Тегло за възрастта — числата са за лекаря; обяснението за родителя е в „Защо този режим“.
  const b = t.bmi;
  if (b.status === 'severeThin' || b.status === 'thin') {
    clinician.push(`ИТМ за възрастта под ${b.status === 'severeThin' ? '−3' : '−2'} SD (${b.label} по СЗО): изяснете причината и проследявайте растежа отблизо${b.status === 'severeThin' ? '; насочете към специалист' : ''}. Енергията е изчислена за теглото при медианния ИТМ — то е над сегашното.`);
  }
  if (b.status === 'over' || b.status === 'obese') {
    clinician.push(`${b.status === 'obese' ? 'Затлъстяване' : 'Наднормено тегло'} по СЗО (ИТМ за възрастта над ${b.status === 'obese' ? (t.years < 5 ? '+3' : '+2') : (t.years < 5 ? '+2' : '+1')} SD): без ограничителни диети — промени за цялото семейство в храненето, движението, съня и екраните. Енергията е изчислена за коригирано тегло (${dec(t.weightUsed)} кг), затова е малко под разхода при сегашното тегло.`);
    if (b.status === 'obese') clinician.push('AAP 2023: при затлъстяване — интензивна семейна програма за хранене и начин на живот, поне 26 часа за 3–12 месеца; от 12 г. — и лекарства по преценка на специалист.');
  }
  if (b.status === 'risk') notes.push(['ИТМ за възрастта е между +1 и +2 SD, тоест има риск от наднормено тегло. Ще следим кривата на всеки преглед.', 'BMI-for-age is between +1 and +2 SD, which means a risk of overweight. We will follow the curve at every check-up.']);

  const habits = [
    ['Вие решавате какво, кога и къде се яде, а детето решава дали и колко да изяде. Не го карайте да „изяде всичко“: децата сами усещат глада и ситостта.',
      'You decide what, when and where food is eaten, and your child decides whether and how much to eat. Do not make them clear the plate: children sense hunger and fullness themselves.'],
    ['Три основни хранения и 1–2 закуски в сходни часове, без похапване между тях.', 'Three main meals and 1–2 snacks at similar times, without grazing in between.'],
    ['Хранете се заедно на масата, без екрани. Храната не е награда или наказание.', 'Eat together at the table, without screens. Food is not a reward or a punishment.'],
    ['Предлагайте новата храна многократно и без натиск: често са нужни 8–15 опита, а детето се учи, като вижда, че Вие я ядете.', 'Offer a new food many times without pressure: it often takes 8–15 tries, and children learn by seeing you eat it.'],
    y < 3 ? ['Оставете детето да се храни само с лъжица и с пръсти: бъркотията е част от ученето.', 'Let your child feed themselves with a spoon and fingers: the mess is part of learning.']
      : ['Включете детето в пазаруването и готвенето: така опитва по-смело нови храни.', 'Involve your child in shopping and cooking: they will try new foods more readily.'],
  ];
  // Че целта е растеж по кривата, а не тегло, и че ще следим на прегледите — в писмото до родителя.
  const monitoring = [
    ['ИТМ за възрастта се проследява по кривите на СЗО при всяко измерване.', 'BMI-for-age is followed on the WHO curves at every measurement.'],
  ];
  if (b.status === 'over' || b.status === 'obese') monitoring.push(['При наднормено тегло целта е теглото да расте по-бавно от ръста. Ще проверим след 3 месеца.', 'With excess weight, the aim is for weight to rise more slowly than height. We will check again in 3 months.']);
  const weekly = [
    !prefs.has('vegetarian') && !prefs.has('noFish') ? ['Риба 1–2 пъти седмично, едната мазна: скумрия, сьомга или пъстърва.', 'Fish once or twice a week, one of them oily: mackerel, salmon or trout.'] : null,
    ['Бобови поне 2–3 пъти седмично: леща, боб, нахут или грах.', 'Pulses at least 2–3 times a week: lentils, beans, chickpeas or peas.'],
    !prefs.has('vegetarian') && !prefs.has('noRedMeat') ? ['Червено месо до 2 пъти седмично, постно, заради желязото; колбаси по изключение.', 'Red meat up to twice a week, lean, for iron; cured meats only as an exception.'] : null,
    !prefs.has('noEgg') && !prefs.has('vegan') ? ['Яйца няколко пъти седмично, добре сварени.', 'Eggs several times a week, well cooked.'] : null,
    y < 2 ? ['Сладкиш не се предлага.', 'No cakes or sweets.'] : ['Сладкиш рядко, в малка порция и след основно хранене.', 'Cake or sweets rarely, in a small portion and after a main meal.'],
  ].filter(Boolean);
  return { prefer, limit, avoid, notes, warnings, clinician, habits, monitoring, weekly, drinks: childDrinks(y) };
}

/** Кратко описание на енергията — за бележките и PDF. */
export function childEnergyNote(t) {
  const basis = t.weightBasis === 'adjusted' ? `, с коригирано тегло ${dec(t.weightUsed)} кг`
    : t.weightBasis === 'median' ? `, с теглото при медианния ИТМ ${dec(t.weightUsed)} кг` : '';
  return `Енергия по EFSA 2013: покой по Henry 2005 (${t.ree} kcal${basis}) × PAL ${dec(t.pal)} × 1,01 за растежа.`;
}
