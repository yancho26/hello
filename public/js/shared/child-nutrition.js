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

/** „72-ри“: българско поредно число, с неразделящо тире (U+2011) — да не се пренася. */
export function ordinalBg(n) {
  const v = Math.round(n);
  const t = v % 100;
  const d = v % 10;
  const end = t >= 11 && t <= 19 ? 'и' : d === 1 ? 'ви' : d === 2 ? 'ри' : d === 3 || d === 4 ? 'ти' : d === 7 || d === 8 ? 'ми' : 'и';
  return `${v}‑${end}`;
}

/** Перцентилът като текст: „под 1‑ви“, „над 99‑и“, „72‑ри“. */
export function percentileText(p) {
  if (p === null || p === undefined) return '';
  if (p < 1) return 'под 1‑ви';
  if (p > 99) return 'над 99‑и';
  return ordinalBg(p);
}

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
const CHILD_TEXT_CODES = /^K90\.0|^E73|^T78\.[01]|^Z91\.0|^L20|^E55|^K5[01]|^E7[04]|^F50|^D50/;

/** Специфичните съвети за деца — вместо тези за възрастни. */
const CHILD_DX_TEXT = [
  { re: /^K59\.0/, prefer: ['Запек: балансирано хранене с достатъчно фибри (плодове, зеленчуци, пълнозърнести, бобови) и течности; самото хранене обикновено не стига — лечението е по указание на лекаря (NICE CG99).'] },
  { re: /^E10/, notes: ['Диабет тип 1: хранене като за връстниците, с броене на въглехидратите според инсулина (ISPAD 2022); подсладените напитки — само при хипогликемия.'] },
  { re: /^K21/, prefer: ['Рефлукс: по-малки порции; последното хранене 2–3 часа преди сън; мазни храни и газирани напитки — според оплакванията.'] },
];

/**
 * Текстовете по диагнозите за дете: от профила по МКБ-10 — само при кодовете, чийто текст е
 * подходящ и за деца, плюс съветите за деца. Ограниченията и изключените храни от профилите
 * се прилагат отделно, както при възрастните. profileFor — от diet-icd.js.
 */
export function childDiagnoses(codes, profileFor) {
  const out = { prefer: [], limit: [], avoid: [], notes: [], warnings: [] };
  const add = (k, s) => { if (!out[k].includes(s)) out[k].push(s); };
  for (const c of codes) {
    const pr = CHILD_TEXT_CODES.test(c) ? profileFor(c) : null;
    for (const k of Object.keys(out)) for (const s of pr?.[k] || []) add(k, s);
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
 * Правилата и съветите за детето. t — childTargets; prefs — ограниченията (Set);
 * breastfed — кърменето продължава (до 2 г. и след това, докато майката и детето желаят).
 */
export function childGuidance(t, { sex, prefs, breastfed = false }) {
  const y = t.years;
  const prefer = [];
  const limit = [];
  const avoid = [];
  const notes = [];
  const warnings = [];
  const dairyFree = prefs.has('noDairy') || prefs.has('vegan');

  prefer.push('Зеленчуци и плодове на всяко хранене; цели плодове вместо сок (ESPGHAN 2017).');
  prefer.push('Пълнозърнести храни, бобови, яйца; риба 1–2 пъти седмично — видове с малко живак (скумрия, сьомга, пъстърва, хек).');
  if (y < 4) prefer.push('До 3 г. мазнините са 35–40% от енергията (EFSA): зехтин, олио или масло в ястията, пълномаслени млечни до 2 г.');
  if (!dairyFree) {
    prefer.push(y < 2
      ? `Мляко — пълномаслено, ${breastfed ? 'заедно с кърмата — според това колко суче' : 'около 470–710 мл дневно'}; кисело мляко и сирене — за калция (${t.calcium} мг дневно, EFSA).`
      : y < 6
        ? `Мляко с понижена масленост — до ${y < 4 ? '470' : '590'} мл дневно (HER 2019); кисело мляко и сирене — за калция (${t.calcium} мг дневно, EFSA).`
        : `Млечни продукти всеки ден — мляко, кисело мляко, сирене — за калция: ${t.calcium} мг дневно (EFSA).`);
  }
  prefer.push(y < 6
    ? 'Вода — основната напитка; млякото и водата са напитките за всеки ден (HER 2019).'
    : `Вода — основната напитка: около ${dec(r1(t.fluids / 1000))} л от напитки дневно, повече при спорт и в жега (EFSA).`);
  if (breastfed && y < 3) prefer.push('Кърменето продължава до 2 г. и след това, докато майката и детето желаят (СЗО, AAP 2022).');

  limit.push(`Сол до ${dec(t.salt)} г дневно (EFSA 2019: натрий ${dec(t.sodium)} г) — без досоляване; внимание с хляба, сиренето, колбасите, чипса и готовите храни.`);
  limit.push(y < 2
    ? 'Захар: до 2 г. — колкото е възможно по-малко свободни захари (ESPGHAN 2017); в менюто няма мед и добавена захар.'
    : `Свободни захари под ${t.sugarMax} г дневно (5% от енергията, ESPGHAN 2017): сладкиши, бонбони, подсладени напитки и млечни продукти, сокове. Сладкото — с основно хранене, не между храненията.`);
  if (y < 6) limit.push(`Плодов сок 100% — до ${y < 4 ? '120' : '120–180'} мл дневно и само ако детето не яде достатъчно плодове (HER 2019).`);
  limit.push('Колбаси, кренвирши, наденици, чипс и пакетирани закуски — рядко.');

  avoid.push('Подсладени и газирани напитки, напитки с подсладители, енергийни напитки, кафе и чай с кофеин (HER 2019, ESPGHAN 2017).');
  if (y < 6 && !dairyFree) avoid.push('Растителни напитки (овесена, оризова, бадемова) вместо мляко, ароматизирано мляко и „мляко за малки деца“ — освен по медицинска причина (HER 2019).');
  if (y < 4) avoid.push('Задавяне (най-голям риск до 3 г., AAP 2010): цели ядки и семки, пуканки, твърди бонбони — не се дават; гроздето и чери доматите — на четвъртинки; морковите и ябълките — настъргани или сварени; кренвиршите — на тънки ивици. Ядките — смлени или като паста.');
  avoid.push('Сурово или недопечено месо, риба и яйца; непастьоризирано мляко; риба меч, акула и прясна риба тон (много живак).');

  if (dairyFree && y < 6) warnings.push('Без мляко и млечни при малко дете: заместителят (обогатен с калций и витамин D) се избира с лекар или диетолог (HER 2019); проследявайте растежа.');
  if (prefs.has('vegan')) warnings.push('Веганско хранене при дете: само с диетолог — витамин B12 като добавка задължително; внимание с желязото, калция, йода, витамин D и омега-3; проследяване на растежа.');
  else if (prefs.has('vegetarian')) notes.push('Вегетарианско хранене: желязо от бобови, яйца и пълнозърнести — заедно с витамин C; B12 — от млечни продукти и яйца.');

  // Тегло за възрастта.
  const b = t.bmi;
  if (b.status === 'severeThin' || b.status === 'thin') {
    warnings.push(`ИТМ за възрастта под ${b.status === 'severeThin' ? '−3' : '−2'} SD (${b.label} по СЗО): изяснете причината и проследявайте растежа отблизо${b.status === 'severeThin' ? '; насочете към специалист' : ''}. Енергията е изчислена за теглото при медианния ИТМ — то е над сегашното.`);
  }
  if (b.status === 'over' || b.status === 'obese') {
    warnings.push(`${b.status === 'obese' ? 'Затлъстяване' : 'Наднормено тегло'} по СЗО (ИТМ за възрастта над ${b.status === 'obese' ? (t.years < 5 ? '+3' : '+2') : (t.years < 5 ? '+2' : '+1')} SD): без ограничителни диети — промени за цялото семейство в храненето, движението, съня и екраните. Енергията е изчислена за коригирано тегло (${dec(t.weightUsed)} кг), затова е малко под разхода при сегашното тегло.`);
    if (b.status === 'obese') warnings.push('AAP 2023: при затлъстяване — интензивна семейна програма за хранене и начин на живот, поне 26 часа за 3–12 месеца; от 12 г. — и лекарства по преценка на специалист.');
  }
  if (b.status === 'risk') notes.push('ИТМ за възрастта между +1 и +2 SD — риск от наднормено тегло (СЗО): следете кривата на всеки преглед.');

  const habits = [
    'Родителят решава какво, кога и къде се яде; детето — дали и колко да изяде. Без „изяж всичко“ — децата сами усещат глада и ситостта.',
    '3 основни хранения и 1–2 закуски в сходни часове; без похапване между тях.',
    'Семейни хранения на масата, без екрани; храната не е награда или наказание.',
    'Нова храна се предлага многократно и без натиск — често са нужни 8–15 опита; детето вижда, че възрастните я ядат.',
    y < 3 ? 'Детето се храни само с лъжица и с пръсти — бъркотията е част от ученето.' : 'Детето помага при пазаруването и готвенето — така опитва по-смело нови храни.',
  ];
  const monitoring = [
    'Ръст и тегло — на профилактичните прегледи; ИТМ за възрастта се следи по кривите на СЗО (раздел „Растеж“).',
    'Целта не е определено тегло, а детето да расте по своята крива.',
  ];
  if (b.status === 'over' || b.status === 'obese') monitoring.push('При наднормено тегло: ИТМ за възрастта да намалява бавно — теглото да расте по-бавно от ръста; проверка на 3 месеца.');
  const weekly = [
    !prefs.has('vegetarian') && !prefs.has('noFish') ? 'Риба 1–2 пъти седмично, едното — мазна (скумрия, сьомга, пъстърва).' : null,
    'Бобови поне 2–3 пъти седмично: леща, боб, нахут, грах.',
    !prefs.has('vegetarian') && !prefs.has('noRedMeat') ? 'Червено месо до 2 пъти седмично — постно, за желязото; колбаси — по изключение.' : null,
    !prefs.has('noEgg') && !prefs.has('vegan') ? 'Яйца — няколко пъти седмично, добре сварени.' : null,
    y < 2 ? 'Сладкиш — не се предлага.' : 'Сладкиш — рядко, в малка порция, след основно хранене.',
  ].filter(Boolean);
  return { prefer, limit, avoid, notes, warnings, habits, monitoring, weekly, drinks: childDrinks(y) };
}

/** Кратко описание на енергията — за бележките и PDF. */
export function childEnergyNote(t) {
  const basis = t.weightBasis === 'adjusted' ? `, с коригирано тегло ${dec(t.weightUsed)} кг`
    : t.weightBasis === 'median' ? `, с теглото при медианния ИТМ ${dec(t.weightUsed)} кг` : '';
  return `Енергия по EFSA 2013: покой по Henry 2005 (${t.ree} kcal${basis}) × PAL ${dec(t.pal)} × 1,01 за растежа.`;
}
