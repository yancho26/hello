/* Персонален хранителен режим за възрастни.
 *
 * Изчисления:
 *   • основен метаболизъм по Mifflin–St Jeor и енергоразход по физическа активност;
 *   • енергиен прием според целта и темпото: отслабване с дефицит 300, 500 или
 *     750 kcal (около 0,3, 0,5 и 0,75 кг седмично), поддържане, покачване с
 *     250, 400 или 600 kcal; срок до целевото тегло;
 *   • белтък в г/кг „референтно“ тегло (при затлъстяване — коригирано тегло),
 *     по-висок при отслабване, покачване, силови тренировки и след 65 г.;
 *   • разпределение на мазнини и въглехидрати по хранителния модел:
 *     средиземноморски, DASH, с по-малко въглехидрати, с повече белтък, балансиран;
 *   • фибри, наситени мазнини, свободни захари, сол, течности; порции по групи храни.
 *
 * Препоръките следват: EFSA (референтни стойности), СЗО (здравословно
 * хранене), NICE NG246 (затлъстяване, 2025), ESPEN (възрастни, недохранване),
 * ACSM/ISSN (белтък при тренировки), ESC 2024 (хипертония — сол <5 г,
 * DASH/средиземноморски тип), ESC/EASD 2023 и ADA 2026 (диабет), KDIGO 2024
 * (ХБЗ — белтък 0,8 г/кг при G3–G5, калий и фосфор по нужда), EULAR (подагра).
 *
 * Менюто е за 1 ден с по два варианта или за 7 дни, с рецепти от
 * recipes.js и списък за пазаруване. Не е предназначено за бременност,
 * кърмене, деца, хранителни разстройства и диализа.
 */

import { bmi as bmiOf } from './clinical.js';
import { table } from './table.js';
import { addDays, today } from './dates.js';
import { FOODS, FOOD_CATS, RECIPES, mainProtein, recipeTags, totals } from './recipes.js';

export { FOODS, RECIPES };

/* --------------------------------- речници --------------------------------- */

export const ACTIVITY = table({
  sedentary: { label: 'заседнал (без спорт)', factor: 1.2 },
  light: { label: 'лека активност (1–3 пъти седмично)', factor: 1.375 },
  moderate: { label: 'умерена активност (3–5 пъти седмично)', factor: 1.55 },
  active: { label: 'висока активност (6–7 пъти седмично)', factor: 1.725 },
  athlete: { label: 'много висока (тежък физически труд или спорт всеки ден)', factor: 1.9 },
});

export const GOALS = table({
  lose: 'отслабване',
  maintain: 'поддържане на теглото',
  gain: 'покачване на теглото',
});

/** Темпо: промяна на енергията спрямо разхода (kcal дневно). */
export const PACES = table({
  slow: { label: 'плавно', lose: -300, gain: 250 },
  standard: { label: 'умерено', lose: -500, gain: 400 },
  fast: { label: 'по-бързо', lose: -750, gain: 600 },
});

export const PATTERNS = table({
  mediterranean: {
    label: 'средиземноморски', fatPct: 35,
    about: 'Зеленчуци, бобови, пълнозърнести, риба, зехтин и ядки; малко червено месо. С най-силни доказателства за сърцето.',
  },
  dash: {
    label: 'DASH', fatPct: 27,
    about: 'Много зеленчуци и плодове, нискомаслени млечни, бобови и ядки, малко сол. Понижава налягането.',
  },
  lowcarb: {
    label: 'с по-малко въглехидрати', carbPct: 33,
    about: 'Въглехидрати около една трета от енергията — от зеленчуци, бобови и пълнозърнести; повече белтък и зехтин. Подходящ при диабет тип 2 и затлъстяване.',
  },
  highprotein: {
    label: 'с повече белтък', fatPct: 30, proteinBoost: 0.3,
    about: 'Белтък 1,2–1,6 г/кг: засища и пази мускулите при отслабване и тренировки.',
  },
  balanced: {
    label: 'балансиран', fatPct: 30,
    about: 'Въглехидрати 45–60%, мазнини 20–35% от енергията (EFSA).',
  },
});

/** Колко хранения дневно и какъв дял от енергията има всяко. */
export const MEAL_PLANS = table({
  3: [
    { id: 'breakfast', meal: 'breakfast', label: 'Закуска', share: 0.30, time: '7:30' },
    { id: 'lunch', meal: 'lunch', label: 'Обяд', share: 0.40, time: '12:30' },
    { id: 'dinner', meal: 'dinner', label: 'Вечеря', share: 0.30, time: '18:30' },
  ],
  4: [
    { id: 'breakfast', meal: 'breakfast', label: 'Закуска', share: 0.25, time: '7:30' },
    { id: 'lunch', meal: 'lunch', label: 'Обяд', share: 0.35, time: '12:30' },
    { id: 'snack2', meal: 'snack', label: 'Следобедна закуска', share: 0.15, time: '16:00' },
    { id: 'dinner', meal: 'dinner', label: 'Вечеря', share: 0.25, time: '19:00' },
  ],
  5: [
    { id: 'breakfast', meal: 'breakfast', label: 'Закуска', share: 0.25, time: '7:30' },
    { id: 'snack1', meal: 'snack', label: 'Междинно хранене', share: 0.10, time: '10:30' },
    { id: 'lunch', meal: 'lunch', label: 'Обяд', share: 0.35, time: '13:00' },
    { id: 'snack2', meal: 'snack', label: 'Следобедна закуска', share: 0.10, time: '16:00' },
    { id: 'dinner', meal: 'dinner', label: 'Вечеря', share: 0.20, time: '19:00' },
  ],
});
/** Разпределението с 5 хранения — за обратна съвместимост. */
export const MEAL_SLOTS = MEAL_PLANS[5];

export const PREFERENCES = table({
  vegetarian: 'вегетарианско (с яйца и млечни)',
  vegan: 'веганско (само растителни храни)',
  noFish: 'без риба и морски дарове',
  noPork: 'без свинско',
  noRedMeat: 'без червено месо',
  noNuts: 'без ядки (алергия)',
  noEgg: 'без яйца',
  noDairy: 'без мляко и млечни (алергия)',
  noSoy: 'без соя',
  glutenFree: 'без глутен (цьолиакия)',
  lactoseFree: 'без лактоза',
});

export const WEEKDAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];

/** Ограничения, които следват от алергиите в досието. */
export function allergyPreferences(allergies = []) {
  const rules = [
    [/ядк|орех|бадем|лешни|фъстъ|кашу|nut|peanut/i, 'noNuts'],
    [/риб|морск|скарид|ракообраз|миди|fish|shellfish/i, 'noFish'],
    [/яйц|egg/i, 'noEgg'],
    [/мляко|млечн|казеин|milk/i, 'noDairy'],
    [/лактоз|lactose/i, 'lactoseFree'],
    [/глутен|цьолиак|пшениц|gluten/i, 'glutenFree'],
    [/соя|соев|soy/i, 'noSoy'],
  ];
  const prefs = new Set();
  const matched = [];
  for (const a of allergies || []) {
    for (const [re, pref] of rules) {
      if (re.test(String(a))) { prefs.add(pref); matched.push(String(a)); }
    }
  }
  return { prefs: [...prefs], matched: [...new Set(matched)] };
}

/* ------------------------------- замени и имена ------------------------------- */

/* Замени при ограничения; каквото не може да се замени, изключва рецептата.
 * Редът има значение: соевото кисело мляко при „без соя“ става овесено. */
const PLANT_YOGURT = { yogurt: 'soyyogurt', lfyogurt: 'soyyogurt', greekyogurt: 'soyyogurt', kefir: 'soyyogurt' };
const SUBSTITUTES = {
  glutenFree: { bread: 'gfbread', ryebread: 'gfbread', pita: 'gfbread', bulgur: 'buckwheat', couscous: 'quinoa', pasta: 'rice', oats: 'buckwheat' },
  lactoseFree: { milk: 'lfmilk', yogurt: 'lfyogurt', kefir: 'lfyogurt', greekyogurt: 'lfyogurt' },
  noDairy: { milk: 'oatmilk', lfmilk: 'oatmilk', ...PLANT_YOGURT, cottage: 'tofu', whitecheese: 'tofu' },
  vegan: { milk: 'oatmilk', lfmilk: 'oatmilk', ...PLANT_YOGURT, cottage: 'tofu', whitecheese: 'tofu' },
  noSoy: { soyyogurt: 'oatyogurt' },
};
/* Имената на ястията следват замените — по двойката „от>към“. */
const PLANT_YOGURT_NAME = [[/[Цц]едено кисело мляко/g, 'растително кисело мляко'], [/кисело мляко без лактоза/g, 'растително кисело мляко'],
  [/(?<!растително )[Кк]исело мляко/g, 'растително кисело мляко'], [/[Кк]ефир/g, 'растително кисело мляко']];
const TOFU_NAME = [[/със сирене/g, 'с тофу'], [/със извара/g, 'с тофу'], [/[Сс]ирене/g, 'тофу'], [/[Ии]звара/g, 'тофу']];
const RENAME = {
  'oats>buckwheat': [[/Овесена каша/, 'Каша от елда'], [/овесени ядки/g, 'елда'], [/Палачинки от овесени ядки/, 'Палачинки от елда']],
  'bulgur>buckwheat': [[/булгур/g, 'елда']],
  'couscous>quinoa': [[/кус-кус/g, 'киноа']],
  'pasta>rice': [[/Пълнозърнести макарони/, 'Кафяв ориз'], [/пълнозърнеста паста/g, 'кафяв ориз'], [/[Пп]аста/g, 'ориз']],
  'bread>gfbread': [[/[Пп]ълнозърнест хляб/g, 'безглутенов хляб']],
  'ryebread>gfbread': [[/[Рр]ъжен хляб/g, 'безглутенов хляб']],
  'pita>gfbread': [[/[Пп]итка/g, 'безглутенов хляб']],
  'milk>oatmilk': [[/(?<!кисело) мляко/g, ' овесена напитка']],
  'lfmilk>oatmilk': [[/(?<!кисело) мляко/g, ' овесена напитка']],
  'kefir>lfyogurt': [[/кефир/g, 'кисело мляко без лактоза']],
  'yogurt>soyyogurt': PLANT_YOGURT_NAME,
  'lfyogurt>soyyogurt': PLANT_YOGURT_NAME,
  'greekyogurt>soyyogurt': PLANT_YOGURT_NAME,
  'kefir>soyyogurt': PLANT_YOGURT_NAME,
  'cottage>tofu': TOFU_NAME,
  'whitecheese>tofu': TOFU_NAME,
};

/* ---------------------------------- енергия ---------------------------------- */

export function mifflinStJeor({ sex, age, weight, height }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'f' ? -161 : 5);
}

const round = (v, step = 1) => Math.round(v / step) * step;
const dec = (v) => String(v).replace('.', ',');
const KCAL_PER_KG = 7700;

/* --------------------------------- основен план --------------------------------- */

/**
 * @param {object} input
 *   sex, age, weight, height, waist, activity, goal, pace, targetWeight, pattern,
 *   mealsPerDay (3|4|5), days (1|7), quick, strength, preferences: [], allergies: [],
 *   conditions: Set, egfr, potassium, classes: Set, medNotes: [], variant, asOf
 */
export function nutritionPlan(input) {
  const { sex, age, weight, height } = input;
  const warnings = [];
  if (!(age >= 18)) throw new Error('Хранителният режим е предназначен за възрастни (от 18 г.).');
  if (!(weight > 30 && weight < 350) || !(height > 120 && height < 230)) {
    throw new Error('Нужни са актуални тегло и ръст.');
  }
  const asOf = input.asOf || today();
  const cond = input.conditions || new Set();
  const classes = input.classes || new Set();
  const fromAllergies = allergyPreferences(input.allergies);
  const prefs = new Set([...(input.preferences || []), ...fromAllergies.prefs].filter(x => PREFERENCES[x]));
  if (prefs.has('vegan')) prefs.add('vegetarian');
  const b = bmiOf(weight, height);
  const activity = ACTIVITY[input.activity] || ACTIVITY.sedentary;
  const patternId = PATTERNS[input.pattern] ? input.pattern : (cond.has('htn') ? 'dash' : 'mediterranean');
  const pattern = PATTERNS[patternId];
  const mealsPerDay = [3, 4, 5].includes(Number(input.mealsPerDay)) ? Number(input.mealsPerDay) : 5;
  const days = Number(input.days) === 7 ? 7 : 1;
  const strength = !!input.strength;

  let goal = GOALS[input.goal] ? input.goal : (b >= 25 ? 'lose' : b < 18.5 ? 'gain' : 'maintain');
  if (goal === 'lose' && b < 22) {
    warnings.push('При ИТМ под 22 отслабване не се препоръчва — планът е за поддържане на теглото.');
    goal = 'maintain';
  }
  let pace = PACES[input.pace] ? input.pace : 'standard';
  if (goal === 'lose' && pace === 'fast' && (b < 30 || age >= 65)) {
    warnings.push(age >= 65
      ? 'След 65 г. по-бързото отслабване увеличава загубата на мускули и кост — темпото е умерено.'
      : 'По-бързо темпо се предлага при ИТМ 30 и повече — темпото е умерено.');
    pace = 'standard';
  }
  if (goal === 'gain' && pace === 'fast' && b >= 18.5) {
    warnings.push('По-бързо покачване се предлага при поднормено тегло — темпото е умерено, за да се трупат мускули, а не мазнини.');
    pace = 'standard';
  }
  if (goal === 'gain' && b < 16) {
    warnings.push('ИТМ под 16: риск от синдром на повторно захранване — увеличавайте храната постепенно, с контрол на калий, фосфор и магнезий; обсъдете насочване (NICE).');
  }
  if (goal === 'lose' && age >= 70 && b < 30) {
    warnings.push('След 70 г. при ИТМ под 30 отслабването носи риск от саркопения — предпочитайте плавно темпо, повече белтък и силови упражнения.');
  }

  const notes0 = [];
  const ckd = input.egfr > 0 && input.egfr < 60;
  const ckdAdvanced = input.egfr > 0 && input.egfr < 30;
  const diabetes = cond.has('dm2') || cond.has('dm1') || cond.has('prediabetes');
  const cardio = ['htn', 'chd', 'pad', 'stroke', 'hf', 'dyslip'].some(c => cond.has(c));
  const onRaas = ['ACEI', 'ARB', 'ARNI', 'MRA', 'FINERENONE'].some(c => classes.has(c));
  const limitK = (input.egfr > 0 && input.egfr < 45 && onRaas) || input.potassium >= 5.0 || ckdAdvanced;
  const lowSalt = cond.has('htn') || cond.has('hf') || ckd;

  // Енергия.
  const bmr = mifflinStJeor({ sex, age, weight, height });
  const tdee = bmr * activity.factor;
  let target = tdee;
  if (goal === 'lose') target = tdee + PACES[pace].lose;
  if (goal === 'gain') target = tdee + PACES[pace].gain;
  // ESPEN: около 30 kcal/кг при възрастни хора — формулата често подценява нуждите им.
  if (age >= 70 && goal !== 'lose' && target < 27 * weight) {
    target = 27 * weight;
    notes0.push('След 70 г. енергията е поне 27 kcal/кг (ESPEN: около 30 kcal/кг) — формулата често подценява нуждите.');
  }
  const floor = Math.max(sex === 'f' ? 1200 : 1500, bmr * 0.95);
  if (target < floor) {
    target = floor;
    if (goal === 'lose') warnings.push('Енергийният дефицит е ограничен, за да не пада приемът под основния метаболизъм.');
  }
  target = round(target, 50);

  // Референтно тегло за белтъка: при ИТМ >25 — теглото при ИТМ 25 плюс 25% от излишъка.
  const w25 = 25 * (height / 100) ** 2;
  const refWeight = b > 25 ? w25 + 0.25 * (weight - w25) : weight;

  let proteinPerKg = 0.9;
  let proteinNote = 'EFSA: 0,83 г/кг за възрастни; тук с малък резерв.';
  if (age >= 65) { proteinPerKg = 1.1; proteinNote = 'ESPEN: 1,0–1,2 г/кг след 65 г. — срещу загуба на мускулна маса.'; }
  if (goal === 'lose') { proteinPerKg = Math.max(proteinPerKg, age >= 65 ? 1.2 : 1.1); proteinNote = 'По-висок белтък при отслабване запазва мускулите и засища.'; }
  if (goal === 'gain') { proteinPerKg = Math.max(proteinPerKg, 1.2); proteinNote = 'ESPEN: 1,2–1,5 г/кг при покачване на теглото и недохранване.'; }
  if (strength) { proteinPerKg = Math.max(proteinPerKg, goal === 'maintain' ? 1.4 : 1.6); proteinNote = 'ACSM/ISSN: 1,2–2,0 г/кг при силови тренировки; повече при енергиен дефицит.'; }
  if (pattern.proteinBoost) proteinPerKg = Math.min(1.8, proteinPerKg + pattern.proteinBoost);
  if (ckd) { proteinPerKg = 0.8; proteinNote = 'KDIGO 2024: 0,8 г/кг при ХБЗ G3–G5 без диализа; да не се превишава 1,3 г/кг.'; }
  proteinPerKg = Math.round(proteinPerKg * 10) / 10;
  const protein = round(proteinPerKg * refWeight);
  // Горна граница за менюто: при ХБЗ — 1,0 г/кг (0,9 при G4–G5), далеч под 1,3 г/кг по KDIGO; иначе до 1,5 пъти целта
  // или до 20% от енергията (при много енергия), но не над 2 г/кг (2,2 при силови тренировки).
  const proteinMax = ckd ? round(refWeight * (ckdAdvanced ? 0.9 : 1.0)) : round(Math.min(refWeight * (strength ? 2.2 : 2.0), Math.max(protein * 1.5, target * 0.2 / 4)));

  // Мазнини и въглехидрати по модела.
  let fatPct;
  let carbs;
  let fat;
  if (pattern.carbPct && !ckdAdvanced) {
    carbs = round((target * pattern.carbPct / 100) / 4);
    fat = round((target - protein * 4 - carbs * 4) / 9);
    fatPct = Math.round((fat * 9 / target) * 100);
  } else {
    fatPct = pattern.fatPct || 32;
    if (diabetes && patternId !== 'dash') fatPct = Math.max(fatPct, 35);
    fat = round((target * fatPct / 100) / 9);
    carbs = round((target - protein * 4 - fat * 9) / 4);
  }
  const fiber = Math.max(25, round((target / 1000) * 14));
  const satFatPct = (cardio || diabetes) ? 7 : 10;
  const satFat = round((target * satFatPct / 100) / 9);
  const sugarMax = round((target * 0.10) / 4);
  let fluids = Math.min(3000, Math.max(1500, round(weight * 30, 100)));

  const targets = {
    kcal: target, protein, fat, carbs, fiber, satFat, sugarMax,
    salt: 5, fluids,
    proteinPerKg, proteinMax, proteinNote, fatPct, satFatPct,
    carbPct: Math.round((carbs * 4 / target) * 100),
  };
  if (classes.has('SGLT2') && carbs < 130) {
    warnings.push(`SGLT2-инхибитор и под 130 г въглехидрати дневно (${carbs} г) — риск от кетоацидоза с нормална кръвна захар; обсъдете модела.`);
  }

  // Прогноза и целево тегло.
  const weeklyKg = Math.round(((target - tdee) * 7 / KCAL_PER_KG) * 100) / 100;
  const projection = { weeklyKg, targetWeight: null, weeks: null, eta: null, suggestions: [] };
  if (goal === 'lose') projection.suggestions = [0.95, 0.9].map(k => Math.round(weight * k));
  if (goal === 'gain') projection.suggestions = [Math.round(20 * (height / 100) ** 2)].filter(x => x > weight);
  const tw = Number(input.targetWeight);
  if (tw > 30 && tw < 350 && goal !== 'maintain') {
    const twBmi = bmiOf(tw, height);
    if ((goal === 'lose' && tw >= weight) || (goal === 'gain' && tw <= weight)) {
      warnings.push(`Целевото тегло ${dec(tw)} кг не съответства на целта „${GOALS[goal]}“.`);
    } else if (Math.abs(weeklyKg) > 0.05) {
      projection.targetWeight = tw;
      projection.weeks = Math.ceil(Math.abs(tw - weight) / Math.abs(weeklyKg));
      projection.eta = addDays(asOf, projection.weeks * 7);
      if (twBmi < 18.5) warnings.push(`Целевото тегло ${dec(tw)} кг е под нормалното (ИТМ ${dec(Math.round(twBmi * 10) / 10)}).`);
      if (goal === 'lose' && (weight - tw) / weight > 0.15) {
        projection.note = 'Целта е над 15% от теглото — поставете междинна цел от 5–10% за първите 6 месеца.';
      }
    }
  }

  // Принципи и правила.
  const prefer = [];
  const limit = [];
  const avoid = [];
  const notes = [...notes0];

  prefer.push('Зеленчуци на всяко хранене — поне 400 г зеленчуци и плодове дневно (СЗО).');
  prefer.push('Пълнозърнести храни, бобови, ядки, зехтин; риба 1–2 пъти седмично.');
  limit.push('Сол под 5 г дневно (СЗО, ESC): внимание с хляба, саламурените сирена, колбасите и готовите храни.');
  limit.push(`Свободни захари под ${sugarMax} г дневно (10% от енергията, идеално под 5%): сладкиши, подсладени напитки, сокове.`);
  limit.push('Червено месо до 350–500 г седмично; преработеното месо — възможно най-рядко; пържени храни.');
  notes.push('Алкохол: колкото по-малко, толкова по-добре — безопасно количество няма (СЗО).');
  if (patternId === 'lowcarb') prefer.push('По-малко въглехидрати: хляб, ориз и картофи в по-малки порции; повече зеленчуци, бобови, яйца, риба, извара и зехтин.');
  if (patternId === 'dash') prefer.push('DASH: 4–5 порции зеленчуци и 4–5 порции плодове дневно, 2–3 порции нискомаслени млечни, ядки и бобови 4–5 пъти седмично.');

  if (cond.has('htn')) {
    prefer.push('Хипертония: DASH/средиземноморски тип — зеленчуци, плодове, нискомаслени млечни, бобови, ядки.');
    if (!limitK) prefer.push('Храни, богати на калий (зеленчуци, бобови, плодове), понижават налягането.');
    limit.push('Хипертония: сол под 5 г; кафе — до 3–4 чаши; алкохол — възможно най-малко.');
  }
  if (diabetes) {
    prefer.push('Диабет: въглехидрати с нисък гликемичен индекс, равномерно разпределени през деня; зеленчуците — първи в чинията.');
    limit.push('Диабет: бял хляб, бял ориз, картофено пюре, сладки плодове и сокове; плодовете — по 1 порция наведнъж.');
    avoid.push('Подсладени напитки и сокове (освен за овладяване на хипогликемия).');
    if (goal === 'lose' && (classes.has('INSULIN') || classes.has('SU'))) {
      warnings.push('Инсулин или сулфанилурейно лекарство и по-малко храна: дозите може да се нуждаят от намаляване — риск от хипогликемия.');
    }
  }
  if (cardio || cond.has('dyslip') || cond.has('masld')) {
    limit.push(`Наситени мазнини под ${satFat} г дневно (${satFatPct}% от енергията): тлъсто месо, масло, сметана, пълномаслени сирена.`);
    prefer.push('Мазна риба (скумрия, пъстърва, сьомга) — омега-3; ядки и зехтин вместо масло.');
    avoid.push('Трансмазнини — маргарини, пакетирани сладкиши, пържени закуски.');
  }
  if (cond.has('hf')) {
    limit.push('Сърдечна недостатъчност: сол под 5 г; течности — по указание на лекаря (при тежка СН 1,5–2 л).');
    notes.push('Ежедневно тегло сутрин: наддаване над 2 кг за 3 дни — обадете се на лекаря.');
    fluids = Math.min(fluids, 2000);
    targets.fluids = fluids;
  }
  if (ckd) {
    limit.push(`ХБЗ: белтък около ${protein} г дневно (0,8 г/кг); повече растителен белтък.`);
    if (limitK) {
      limit.push('ХБЗ/висок калий: ограничете картофи, домати, банани, сушени плодове, бобови, ядки и спанак; картофите — нарязани и двойно сварени.');
      avoid.push('Солеви заместители с калий.');
    }
    if (ckdAdvanced) {
      limit.push('ХБЗ G4–G5: фосфор — избягвайте преработени храни с фосфатни добавки (Е338–Е452), колбаси, топено сирене, кола.');
    }
  }
  if (cond.has('gout')) {
    avoid.push('Подагра: карантия (черен дроб, бъбреци), бира и спиртни напитки, подсладени с фруктоза напитки.');
    limit.push('Подагра: червено месо, морски дарове, сардини, аншоа.');
    prefer.push('Подагра: нискомаслени млечни продукти, достатъчно течности (над 2 л, ако няма ограничение).');
    fluids = Math.max(fluids, 2000);
    targets.fluids = fluids;
  }
  if (cond.has('obesity') || goal === 'lose') {
    prefer.push('Отслабване: чинията — половината зеленчуци, четвърт белтък, четвърт пълнозърнести; бавно хранене.');
    notes.push('Реалистична цел: 5–10% от теглото за 6 месеца. Връщането на част от теглото не е провал — продължете (NICE).');
  }
  if (cond.has('osteoporosis') || age >= 65) {
    prefer.push('Калций 1000–1200 мг дневно от храната: млечни продукти, бадеми, зелени листни зеленчуци.');
    notes.push('Витамин D 800–1000 IU дневно при 65+ г. или остеопороза — по преценка на лекаря.');
  }
  if (cond.has('anemia')) {
    prefer.push('Анемия: храни, богати на желязо (месо, бобови, елда, спанак), заедно с витамин C.');
    limit.push('Анемия: чай и кафе — поне 1 час след хранене.');
  }
  if (cond.has('masld')) {
    avoid.push('Стеатоза: алкохол и подсладени напитки (фруктоза).');
    notes.push('Загуба на 7–10% от теглото подобрява мастния черен дроб.');
  }
  if (prefs.has('vegan')) notes.push('Веганско хранене: витамин B12 като добавка задължително; калций от обогатени напитки, тофу, бобови; йод и омега-3 по преценка.');
  else if (prefs.has('vegetarian')) notes.push('Вегетарианско хранене: витамин B12 — от млечни и яйца или добавка; желязо с витамин C.');
  if (classes.has('METFORMIN')) notes.push('Метформин: при продължителен прием — периодично изследване на витамин B12.');
  if (prefs.has('glutenFree')) avoid.push('Цьолиакия: пшеница, ръж, ечемик и храни с тях; овесът — само сертифициран без глутен.');
  if (prefs.has('lactoseFree')) notes.push('Без лактоза: млечни продукти без лактоза; твърдите отлежали сирена обикновено се понасят.');
  if (fromAllergies.matched.length) notes.push(`Изключено според алергиите в досието: ${fromAllergies.matched.join(', ')}.`);

  // Рецептите, които стават за човека, с оценка за подходящост.
  const ctx = { prefs, cond, diabetes, cardio, ckd, limitK, lowSalt, patternId, goal, quick: !!input.quick, proteinShare: (protein * 4) / target };
  const lowerCarb = diabetes || patternId === 'lowcarb';
  // При модела с малко въглехидрати нишестето не расте; при диабет расте умерено.
  const strictLowCarb = patternId === 'lowcarb';
  const variant = Math.max(0, Math.floor(Number(input.variant) || 0));
  const slots = MEAL_PLANS[mealsPerDay];
  const pools = {};
  for (const kind of new Set(slots.map(s => s.meal))) pools[kind] = poolFor(kind, ctx, variant);
  if (Object.values(pools).some(p => p.relaxed)) {
    notes.push('При тези ограничения за някои хранения няма ястие, което да пасва на всичко — там порциите на солените, сладките и богатите на калий храни са малки. Обсъдете менюто с диетолог.');
  }

  const meal = (slot, pick) => {
    const kcal = round(target * slot.share, 10);
    return { kcal, option: pick ? buildMeal(pick.r, kcal, prefs, { lowerCarb, strict: strictLowCarb }) : null };
  };

  // Ден с по два варианта за всяко хранене.
  const usedToday = new Set();
  const meals = slots.map((slot) => {
    const pool = pools[slot.meal];
    const kcal = round(target * slot.share, 10);
    if (!pool.length) return { ...slot, kcal, options: [] };
    const fresh = pool.filter(x => !usedToday.has(x.r.name));
    const picks = (fresh.length >= 2 ? fresh : pool).slice(0, 2);
    for (const p of picks) usedToday.add(p.r.name);
    return { ...slot, kcal, options: picks.map(p => buildMeal(p.r, kcal, prefs, { lowerCarb, strict: strictLowCarb })) };
  });

  // Седмично меню — по едно ястие за всяко хранене, с ритъм за седмицата.
  let week = null;
  if (days === 7) {
    week = planWeek(slots, pools, variant).map((picks, d) => ({
      day: d + 1, label: WEEKDAYS[d], date: addDays(asOf, d),
      meals: slots.map((slot, i) => ({ ...slot, ...meal(slot, picks[i]) })),
    }));
  }

  // Всеки ден (и всеки от двата варианта на деня) се нагласява на няколко кръга:
  // белтъкът между целта и горната граница (при ХБЗ — около целта), калият под
  // границата, енергията на всяко хранене към неговата цел.
  const fitCtx = { ...ctx, lowerCarb: strictLowCarb };
  const aim = ckd ? protein : Math.min((protein + proteinMax) / 2, refWeight * 1.8);
  const low = protein * 0.9;
  let proteinCut = false;
  const tuneDay = (options, slotKcal, kinds) => {
    let opts = options;
    for (let turn = 0; turn < 3; turn++) {
      for (let pass = 0; pass < 3; pass++) {
        const sum = opts.reduce((acc, o) => {
          if (o) { const x = proteinSplit(o); acc.rich += x.rich; acc.other += x.other; }
          return acc;
        }, { rich: 0, other: 0 });
        const total = sum.rich + sum.other;
        let r = 1;
        if (sum.rich && total > proteinMax) r = Math.max(0.35, Math.min(1, (aim - sum.other) / sum.rich));
        else if (sum.rich && total < low) r = Math.min(1.6, Math.max(1, (protein * 1.02 - sum.other) / sum.rich));
        if (Math.abs(r - 1) < 0.02) break;
        if (r < 1) proteinCut = true;
        opts = opts.map((o, i) => o && rebalance(scaleProtein(o, r), slotKcal[i]));
      }
      if (limitK) opts = opts.map(o => o && capPotassium(o));
      const before = dayTotals(opts).protein;
      const bias = before > aim ? 'low' : before < protein ? 'high' : null;
      opts = opts.map((o, i) => o && fitEnergy(o, slotKcal[i], kinds[i], fitCtx, bias));
      if (limitK) opts = opts.map(o => o && capPotassium(o));
      const after = dayTotals(opts).protein;
      if (after >= low && after <= proteinMax) break;
    }
    return opts;
  };
  for (let v = 0; v < 2; v++) {
    const opts = tuneDay(meals.map(m => m.options[v]), meals.map(m => m.kcal), meals.map(m => m.meal));
    meals.forEach((m, i) => { if (m.options[v]) m.options[v] = opts[i]; });
  }
  if (week) {
    for (const d of week) {
      const opts = tuneDay(d.meals.map(m => m.option), d.meals.map(m => m.kcal), d.meals.map(m => m.meal));
      d.meals.forEach((m, i) => { m.option = opts[i]; });
      d.totals = dayTotals(opts);
    }
  }
  if (ckd && proteinCut) notes.push('Порциите на месо, риба, яйца, млечни и бобови в менюто са намалени заради ограничението на белтъка.');

  const day = dayTotals(meals.map(m => m.options[0]));

  return {
    input: {
      sex, age, weight, height, waist: input.waist || null, activity: input.activity || 'sedentary',
      goal, pace, targetWeight: projection.targetWeight, pattern: patternId, mealsPerDay, days,
      quick: !!input.quick, strength, preferences: [...prefs], egfr: input.egfr || null,
    },
    bmi: Math.round(b * 10) / 10,
    energy: { bmr: Math.round(bmr), tdee: Math.round(tdee), target, activityFactor: activity.factor },
    refWeight: Math.round(refWeight),
    targets,
    projection,
    pattern: { id: patternId, label: pattern.label, about: pattern.about },
    portions: portionsFor(target, prefs),
    weekly: weeklyRhythm(prefs, cond),
    prefer, limit, avoid, notes,
    habits: habitsFor(goal, strength),
    flavor: FLAVOR_TIPS,
    monitoring: monitoringFor(goal),
    medNotes: input.medNotes || [],
    warnings,
    meals,
    day,
    week,
    shopping: week ? shoppingList(week) : null,
    flags: { limitK, ckd, ckdAdvanced, diabetes },
  };
}

/* ------------------------------- подбор на рецепти ------------------------------- */

/** Рецептите за едно хранене, които стават за човека, подредени по подходящост. */
function poolFor(kind, ctx, variant) {
  const collect = (c) => {
    const out = [];
    RECIPES.forEach((r, i) => {
      if (r.meal !== kind) return;
      const items = substituted(r, c.prefs).items;
      if (excluded(items, c)) return;
      const tags = recipeTags({ ...r, items: items.map(it => [it.food, it.grams]) });
      out.push({ r, tags, s: score(r, items, tags, ctx), i, protein: mainProtein(r) });
    });
    return out;
  };
  // Предпочитанията и алергиите са твърди. Ако заради сол, калий и сладко не остане
  // нито едно ястие, тези ограничения се отпускат (калият се ограничава после по порция).
  let scored = collect(ctx);
  let relaxed = false;
  for (const soft of [{ limitK: false, lowSalt: false }, { limitK: false, lowSalt: false, diabetes: false }]) {
    if (scored.length) break;
    scored = collect({ ...ctx, ...soft });
    relaxed = scored.length > 0;
  }
  let pool = scored;
  if (ctx.quick) {
    const fast = scored.filter(x => x.tags.has('quick'));
    if (fast.length >= 3) pool = fast;
  }
  // Вариантът разбърква равните по оценка, без да сваля по-подходящите надолу.
  pool.sort((a, b) => b.s - a.s || hash(a.r.name, variant) - hash(b.r.name, variant));
  pool.relaxed = relaxed;
  return pool;
}

function hash(text, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/* Ястия, в които млечното е същността — без него не се правят. */
const NO_SWAP = new Set(['Диня със сирене', 'Извара с горски плодове и канела']);

function substituted(r, prefs) {
  if (NO_SWAP.has(r.name)) return { name: r.name, items: r.items.map(([food, grams]) => ({ food, grams })), swaps: [] };
  let name = r.name;
  const swaps = [];
  const items = r.items.map(([id, g]) => {
    let food = id;
    for (const [pref, map] of Object.entries(SUBSTITUTES)) {
      if (prefs.has(pref) && map[food]) {
        for (const [from, to] of RENAME[`${food}>${map[food]}`] || []) name = name.replace(from, to);
        food = map[food];
      }
    }
    if (food !== id) swaps.push(`${shortName(food)} вместо ${shortName(id)}`);
    // Заместителят е със същата енергия, а не със същия грамаж (напр. сухи ядки → варена елда).
    const grams = food === id ? g : g * FOODS[id].kcal / FOODS[food].kcal;
    return { food, grams };
  });
  return { name: name.charAt(0).toUpperCase() + name.slice(1), items, swaps: [...new Set(swaps)] };
}

const shortName = (id) => FOODS[id].name.split(', ')[0];

function excluded(items, ctx) {
  const { prefs, cond } = ctx;
  const has = (flag) => items.some(it => FOODS[it.food].flags.has(flag));
  if (prefs.has('vegetarian') && (has('meat') || has('fish') || has('seafood'))) return true;
  if (prefs.has('vegan') && (has('egg') || has('dairy') || has('honey'))) return true;
  if (prefs.has('noFish') && (has('fish') || has('seafood'))) return true;
  if (prefs.has('noPork') && has('pork')) return true;
  if (prefs.has('noRedMeat') && has('redmeat')) return true;
  if (prefs.has('noNuts') && has('nuts')) return true;
  if (prefs.has('noEgg') && has('egg')) return true;
  if (prefs.has('noDairy') && has('dairy')) return true;
  if (prefs.has('noSoy') && has('soy')) return true;
  if (prefs.has('glutenFree') && has('gluten')) return true;
  if (prefs.has('lactoseFree') && has('lactose')) return true;
  if (ctx.limitK && items.some(it => FOODS[it.food].flags.has('highK') && it.grams >= 80)) return true;
  if (cond.has('gout') && has('purine')) return true;
  if (ctx.diabetes && has('sweet')) return true;
  if (ctx.lowSalt) {
    const saltyNa = items.filter(it => FOODS[it.food].flags.has('salt') && FOODS[it.food].cat !== 'grain')
      .reduce((s, it) => s + FOODS[it.food].na * it.grams / 100, 0);
    if (saltyNa > 400) return true;
  }
  return false;
}

function score(r, items, tags, ctx) {
  const t = totals(items);
  const carbPct = t.kcal ? (t.carbs * 4 / t.kcal) * 100 : 0;
  let s = 0;
  if (ctx.diabetes && tags.has('lowgi')) s += 2;
  if (ctx.cardio && (tags.has('fish') || tags.has('dash'))) s += 2;
  if (ctx.cond.has('htn') && tags.has('dash')) s += 1;
  if ((ctx.diabetes || ctx.cond.has('dyslip')) && (tags.has('legume') || tags.has('fiber'))) s += 1;
  if (ctx.limitK && tags.has('lowk')) s += 2;
  if (ctx.lowSalt && !tags.has('dash')) s -= 1;
  switch (ctx.patternId) {
    case 'mediterranean':
      if (tags.has('fish')) s += 2;
      if (tags.has('legume')) s += 1;
      if (items.some(it => it.food === 'oil')) s += 1;
      if (tags.has('redmeat')) s -= 2;
      break;
    case 'dash':
      if (tags.has('dash')) s += 2;
      if (tags.has('fiber')) s += 1;
      break;
    case 'lowcarb':
      if (carbPct < 35) s += 3;
      else if (carbPct > 50) s -= 2;
      break;
    case 'highprotein':
      if (tags.has('highprotein')) s += 3;
      break;
    default:
      if (tags.has('fiber')) s += 1;
  }
  if (ctx.goal === 'lose') {
    if (tags.has('highprotein')) s += 1;
    if (tags.has('fiber')) s += 1;
    if (tags.has('dense')) s -= 1;
  }
  if (ctx.goal === 'gain') {
    if (tags.has('dense')) s += 2;
    if (tags.has('highprotein')) s += 1;
  }
  if (ctx.quick && tags.has('quick')) s += 3;
  if (ctx.ckd) {
    // Колкото по-близо е делът на белтъка в ястието до дела в целта, толкова по-подходящо.
    const share = t.kcal ? (t.protein * 4) / t.kcal : 0;
    s += 2 - Math.min(6, Math.abs(share - ctx.proteinShare) * 40);
    if (tags.has('highprotein')) s -= 2;
  }
  return s;
}

/**
 * Седмица: по едно ястие за всяко хранене. Обядите и вечерите не се
 * повтарят; риба поне 2 пъти, бобови поне 3 пъти, червено месо до 2 пъти
 * седмично; основният белтък на обяда и вечерята е различен.
 */
function planWeek(slots, pools, variant) {
  const lastUsed = new Map();
  const counts = { fish: 0, legume: 0, redmeat: 0 };
  const out = [];
  for (let d = 0; d < 7; d++) {
    const picks = [];
    const proteinsToday = new Set();
    for (const slot of slots) {
      const pool = pools[slot.meal];
      if (!pool.length) { picks.push(null); continue; }
      const main = slot.meal === 'lunch' || slot.meal === 'dinner';
      let best = null;
      let bestW = -Infinity;
      for (const x of pool) {
        let w = x.s;
        const last = lastUsed.get(x.r.name);
        if (last !== undefined) w -= main ? 40 : (d - last <= 2 ? 30 : 3);
        if (main) {
          if (x.tags.has('fish') && counts.fish < 2) w += 4 - d * 0.3;
          if (x.tags.has('legume') && counts.legume < 3) w += 3;
          if (x.tags.has('redmeat') && counts.redmeat >= 2) w -= 20;
          if (proteinsToday.has(x.protein)) w -= 3;
        }
        w += hash(`${x.r.name}|${d}`, variant) * 0.9;
        if (w > bestW) { bestW = w; best = x; }
      }
      picks.push(best);
      lastUsed.set(best.r.name, d);
      if (main) {
        proteinsToday.add(best.protein);
        for (const k of Object.keys(counts)) if (best.tags.has(k)) counts[k]++;
      }
    }
    out.push(picks);
  }
  return out;
}

/* ------------------------------------ порции ------------------------------------ */

function portionText(foodId, grams, maxPieces = 3) {
  const f = FOODS[foodId];
  if (f.unit && f.unit.name === 'бр.') {
    const n = Math.min(maxPieces, Math.max(1, Math.round(grams / f.unit.grams)));
    return { grams: n * f.unit.grams, text: `${f.name} — ${n} ${f.unit.name} (≈${n * f.unit.grams} г)` };
  }
  if (f.unit && f.unit.name === 'с.л.') {
    const g = Math.max(5, round(grams, 5));
    return { grams: g, text: `${f.name} — ${g} г (≈${dec(g / f.unit.grams)} с.л.)` };
  }
  const g = grams >= 100 ? round(grams, 10) : Math.max(5, round(grams, 5));
  return { grams: g, text: `${f.name} — ${g} ${LIQUIDS.has(foodId) ? 'мл' : 'г'}` };
}
const LIQUIDS = new Set(['milk', 'lfmilk', 'oatmilk', 'kefir']);

/* Най-много грамове от една съставка в едно ястие — ястието да остане истинско ястие,
 * а не 700 г краставици. Отделно никоя съставка не расте над 2,5 пъти порцията в рецептата. */
const MAX_BY_CAT = { veg: 350, fruit: 300, grain: 350, legume: 300, protein: 250, dairy: 400, nuts: 40, fat: 25, other: 400 };
const MAX_BY_FOOD = {
  bread: 150, ryebread: 150, gfbread: 150, pita: 150, oats: 100, muesli: 100, whitecheese: 60, kashkaval: 50, mozzarella: 100,
  cottage: 250, avocado: 100, olives: 50, honey: 20, darkchoc: 30, driedfruit: 60, watermelon: 500, hummus: 120,
  tahini: 30, peanutbutter: 30, tomatosauce: 250, lettuce: 150, arugula: 80, spinach: 250,
};
const maxGrams = (food) => MAX_BY_FOOD[food] ?? MAX_BY_CAT[FOODS[food].cat] ?? 400;

/** Нова порция на съставка в границите по-горе и не под 40% от порцията в рецептата. */
function resize(it, grams, maxPieces = 3) {
  const base = it.base || it.grams;
  const cap = it.extra ? maxGrams(it.food) : Math.min(maxGrams(it.food), base * 2.5);
  const floor = it.extra ? 0 : base * 0.4;
  const p = portionText(it.food, Math.min(Math.max(grams, floor), Math.max(cap, 5)), maxPieces);
  return { ...it, grams: p.grams, text: it.extra ? `+ ${p.text}` : p.text };
}

/* Нишестени храни — при диабет и по-малко въглехидрати порциите им се намаляват. */
const STARCH = new Set(['bread', 'ryebread', 'gfbread', 'pita', 'oats', 'muesli', 'buckwheat', 'quinoa', 'rice', 'whiterice',
  'bulgur', 'couscous', 'pasta', 'potato', 'sweetpotato', 'lentils', 'beans', 'chickpeas', 'peas']);

const isPiece = (it) => FOODS[it.food].unit?.name === 'бр.';

function buildMeal(r, kcal, prefs, { lowerCarb = false, strict = false } = {}) {
  const sub = substituted(r, prefs);
  const base = sub.items.map(it => ({ ...it, base: it.grams }));
  // Плодовете остават по брой както в ястието (един плод е една порция); мащабират се останалите.
  const fruit = (it) => isPiece(it) && it.food !== 'egg';
  const starch = (it) => lowerCarb && STARCH.has(it.food);
  const fruitKcal = totals(base.filter(fruit)).kcal;
  const baseFactor = (kcal - fruitKcal) / (totals(base.filter(it => !fruit(it))).kcal || 1);
  // При модела с малко въглехидрати нишестето е 70% от обичайната порция и не расте над нея;
  // при диабет е 80% от мащаба на ястието (до 1,5 пъти порцията). Енергията се допълва
  // от зеленчуци, белтък и зехтин.
  const starchFactor = strict ? 0.7 * Math.min(1, baseFactor) : 0.8 * Math.min(1.5, baseFactor);
  const starchKcal = totals(base.filter(starch).map(it => ({ ...it, grams: it.grams * starchFactor }))).kcal;
  const rest = totals(base.filter(it => !fruit(it) && !starch(it))).kcal || 1;
  const factor = Math.min(2.2, Math.max(0.5, (kcal - fruitKcal - starchKcal) / rest));
  const items = base.map(it => (fruit(it)
    ? resize(it, it.grams, Math.max(1, Math.round(it.grams / FOODS[it.food].unit.grams)))
    : resize(it, it.grams * (starch(it) ? starchFactor : factor))));
  const t = totals(items);
  return {
    name: sub.name, items, time: r.time, flavor: r.flavor,
    method: r.method + (sub.swaps.length ? ` Замени: ${sub.swaps.join(', ')}.` : ''),
    kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber, na: t.na,
  };
}

const PROTEIN_FOODS = new Set(['chicken', 'chickenthigh', 'turkey', 'turkeymince', 'beef', 'beefmince', 'pork', 'hake', 'trout',
  'mackerel', 'salmon', 'sardines', 'tuna', 'shrimp', 'egg', 'cottage', 'whitecheese', 'kashkaval', 'mozzarella', 'tofu',
  'lentils', 'beans', 'chickpeas', 'peas', 'hummus', 'yogurt', 'lfyogurt', 'greekyogurt', 'kefir', 'milk', 'lfmilk', 'soyyogurt']);

function proteinSplit(o) {
  return o.items.reduce((acc, it) => {
    const pr = FOODS[it.food].p * it.grams / 100;
    if (PROTEIN_FOODS.has(it.food)) acc.rich += pr; else acc.other += pr;
    return acc;
  }, { rich: 0, other: 0 });
}

/* Връща енергията на ястието към целта чрез храните без много белтък. */
function rebalance(option, kcal) {
  const other = option.items.filter(it => !PROTEIN_FOODS.has(it.food) && !isPiece(it));
  const otherKcal = totals(other).kcal;
  if (!otherKcal) return option;
  const fixedKcal = option.kcal - otherKcal;
  const factor = Math.min(1.6, Math.max(0.6, (kcal - fixedKcal) / otherKcal));
  return withTotals(option, option.items.map(it => (other.includes(it) ? resize(it, it.grams * factor) : it)));
}

function scaleProtein(option, ratio) {
  return withTotals(option, option.items.map(it => (PROTEIN_FOODS.has(it.food) ? resize(it, it.grams * ratio, 4) : it)));
}

function capPotassium(option) {
  if (!option.items.some(it => FOODS[it.food].flags.has('highK') && it.grams > 75)) return option;
  const items = option.items.map(it => {
    if (!FOODS[it.food].flags.has('highK') || it.grams <= 75) return it;
    const p = portionText(it.food, 75, 1);
    return { ...it, grams: Math.min(p.grams, 75), text: p.grams > 75 ? `${FOODS[it.food].name} — 75 г` : p.text };
  });
  return withTotals(option, items);
}

/* Добавки, когато ястието не стига до енергията на храненето: [храна, най-много г, за кои хранения].
 * Минават през ограниченията като всяка друга съставка (глутен, ядки, калий и т.н.). */
const EXTRAS = [
  ['bread', 80, 'main'],
  ['oil', 15, 'savory'],
  ['walnuts', 30, 'any'],
  ['almonds', 30, 'any'],
  ['pumpkinseeds', 25, 'any'],
  ['avocado', 80, 'main'],
  ['rice', 150, 'main'],
  ['bread', 60, 'light'],
  ['apple', 150, 'light'],
  ['banana', 120, 'light'],
];
const BREADS = ['bread', 'ryebread', 'gfbread', 'pita'];
const NUTTY = new Set(['walnuts', 'almonds', 'pumpkinseeds']);
const SWEET_DISH = new Set(['honey', 'darkchoc', 'muesli', 'oats', 'driedfruit']);

/**
 * Последна стъпка: енергията на ястието се доближава до тази на храненето.
 * Мащабират се храните без много белтък (при по-малко въглехидрати нишестето не
 * расте, при ограничение на калия — и богатите на калий). Ако пак не стига,
 * към ястието се добавя хляб, зехтин, ядки или семки според ограниченията.
 */
function fitEnergy(option, kcal, meal, ctx, bias = null) {
  let o = option;
  for (let pass = 0; pass < 3; pass++) {
    const diff = kcal - o.kcal;
    if (Math.abs(diff) <= kcal * 0.04) return o;
    const flexible = (it) => !it.extra && !PROTEIN_FOODS.has(it.food) && !isPiece(it)
      && !(diff > 0 && ctx.lowerCarb && STARCH.has(it.food))
      && !(diff > 0 && ctx.limitK && FOODS[it.food].flags.has('highK'));
    const flexKcal = totals(o.items.filter(flexible)).kcal;
    if (flexKcal < 30) break;
    const f = Math.min(1.8, Math.max(0.5, (flexKcal + diff) / flexKcal));
    if (Math.abs(f - 1) < 0.03) break;
    const next = withTotals(o, o.items.map(it => (flexible(it) ? resize(it, it.grams * f) : it)));
    if (Math.abs(next.kcal - o.kcal) < 5) break;
    o = next;
  }
  const main = meal === 'lunch' || meal === 'dinner';
  // При много белтък в деня ядките и семките са последни, при малко — първи.
  const nutty = EXTRAS.filter(([f]) => NUTTY.has(f));
  const plain = EXTRAS.filter(([f]) => !NUTTY.has(f));
  const order = bias === 'low' ? [...plain, ...nutty] : bias === 'high' ? [...nutty, ...plain] : EXTRAS;
  for (const [extra, max, when] of order) {
    const short = kcal - o.kcal;
    if (short <= kcal * 0.05) break;
    if ((when === 'main' && !main) || (when === 'light' && main)) continue;
    // Зехтинът — само в солено ястие; хлябът — този от ястието, ако има.
    if (when === 'savory' && !main && o.items.some(it => SWEET_DISH.has(it.food) || FOODS[it.food].cat === 'fruit')) continue;
    const food = extra === 'bread'
      ? (o.items.find(it => BREADS.includes(it.food))?.food || (ctx.prefs.has('glutenFree') ? 'gfbread' : 'ryebread'))
      : extra;
    if (ctx.lowerCarb && (STARCH.has(food) || food === 'banana')) continue;
    if (ctx.diabetes && food === 'banana') continue;
    const f = FOODS[food];
    const piece = f.unit?.name === 'бр.';
    const want = piece ? f.unit.grams : Math.min(max, (short / f.kcal) * 100);
    if ((!piece && want < max / 3) || (piece && f.kcal * want / 100 > short * 1.3)) continue;
    const have = o.items.find(it => it.food === food);
    if (have && have.grams >= maxGrams(food)) continue;
    const trial = have
      ? o.items.map(it => (it === have ? { ...it, grams: it.grams + want } : it))
      : [...o.items, { food, grams: want, extra: true }];
    if (excluded(trial, ctx)) continue;
    o = withTotals(o, trial.map(it => {
      if (it.food !== food) return it;
      return it.extra ? resize(it, it.grams, 1) : { ...resize({ ...it, base: maxGrams(food) }, it.grams), base: it.base };
    }));
  }
  // Ястие с много повече енергия (след вдигане на белтъка) — белтъчната храна се свива до +8%.
  const over = o.kcal - kcal * 1.08;
  const richOver = o.items.filter(it => PROTEIN_FOODS.has(it.food));
  const richOverKcal = totals(richOver).kcal;
  if (over > 0 && richOverKcal > 30) {
    const f = Math.max(0.5, (richOverKcal - over) / richOverKcal);
    o = withTotals(o, o.items.map(it => (richOver.includes(it) ? resize(it, it.grams * f, 4) : it)));
  }
  // Последно, ако денят не е с много белтък: малко по-голяма порция от белтъчната храна.
  const short = kcal - o.kcal;
  const rich = o.items.filter(it => PROTEIN_FOODS.has(it.food) && !isPiece(it));
  const richKcal = totals(rich).kcal;
  if (short > kcal * 0.05 && bias !== 'low' && !ctx.ckd && richKcal > 30) {
    const f = Math.min(1.3, (richKcal + short) / richKcal);
    o = withTotals(o, o.items.map(it => (rich.includes(it) ? resize(it, it.grams * f, 4) : it)));
  }
  return o;
}

function withTotals(option, items) {
  const t = totals(items);
  return { ...option, items, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber, na: t.na };
}

function dayTotals(options) {
  const s = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, na: 0 };
  for (const o of options) {
    if (!o) continue;
    for (const k of Object.keys(s)) s[k] += o[k];
  }
  for (const k of Object.keys(s)) s[k] = Math.round(s[k]);
  return s;
}

/* ------------------------------ списък за пазаруване ------------------------------ */

/** Всичко за седмицата, по групи, с количества за покупка. */
export function shoppingList(week) {
  const grams = new Map();
  const spices = new Set();
  for (const d of week) {
    for (const m of d.meals) {
      if (!m.option) continue;
      for (const it of m.option.items) grams.set(it.food, (grams.get(it.food) || 0) + it.grams);
      for (const s of m.option.flavor || []) spices.add(s);
    }
  }
  const groups = Object.keys(FOOD_CATS).map(cat => ({
    cat, label: FOOD_CATS[cat],
    items: [...grams.entries()].filter(([food]) => FOODS[food].cat === cat)
      .sort((a, b) => FOODS[a[0]].name.localeCompare(FOODS[b[0]].name, 'bg'))
      .map(([food, g]) => ({ food, name: FOODS[food].name, grams: Math.round(g), amount: amountText(food, g) })),
  })).filter(g => g.items.length);
  return { groups, spices: [...spices].sort((a, b) => a.localeCompare(b, 'bg')) };
}

function amountText(food, g) {
  const f = FOODS[food];
  if (f.unit?.name === 'бр.') return `${Math.ceil(g / f.unit.grams)} бр.`;
  const unit = LIQUIDS.has(food) ? ['мл', 'л'] : ['г', 'кг'];
  if (g >= 1000) return `${dec(Math.round(g / 100) / 10)} ${unit[1]}`;
  return `${Math.max(10, Math.round(g / 10) * 10)} ${unit[0]}`;
}

/* -------------------------------- съвети на диетолог -------------------------------- */

/** Порции по групи храни за деня — по енергията (СЗО, EFSA, ESC). */
function portionsFor(kcal, prefs) {
  const lvl = kcal < 1700 ? 0 : kcal < 2300 ? 1 : 2;
  const pick = (a) => a[lvl];
  const vegan = prefs.has('vegan') || prefs.has('noDairy');
  return [
    { group: 'Зеленчуци', count: pick(['3', '4', '5']), unit: '1 порция = 80 г или купичка салата' },
    { group: 'Плодове', count: pick(['2', '2', '3']), unit: '1 порция = 1 среден плод или 150 г плодове' },
    { group: 'Пълнозърнести и картофи', count: pick(['4', '6', '8']), unit: '1 порция = филия хляб 30 г, 3 с.л. сварен ориз или елда, 30 г овесени ядки' },
    { group: prefs.has('vegetarian') ? 'Бобови, яйца, тофу' : 'Месо, риба, яйца, бобови', count: pick(['2', '2–3', '3']), unit: '1 порция = 100 г месо или риба, 2 яйца, 150 г сварени бобови' },
    { group: vegan ? 'Обогатени растителни напитки' : 'Мляко и млечни', count: pick(['2', '2–3', '3']), unit: vegan ? '1 порция = 200 мл напитка с калций' : '1 порция = 200 мл кисело мляко или мляко, 30 г сирене' },
    { group: 'Ядки и семена', count: '1', unit: '1 порция = 30 г, без сол' },
    { group: 'Зехтин и растителни мазнини', count: pick(['2', '3', '4']), unit: '1 порция = 1 с.л.' },
  ];
}

function weeklyRhythm(prefs, cond) {
  const out = [];
  if (!prefs.has('vegetarian') && !prefs.has('noFish')) out.push('Риба 2 пъти седмично, едното — мазна (скумрия, сьомга, пъстърва).');
  out.push('Бобови поне 3 пъти седмично: леща, боб, нахут, грах.');
  if (!prefs.has('vegetarian') && !prefs.has('noRedMeat')) out.push(`Червено месо до 2 пъти седмично${cond.has('gout') ? ', при подагра — по-рядко' : ''}; колбаси — по изключение.`);
  out.push('Яйца — до едно дневно са безопасни и при повечето сърдечни заболявания.');
  out.push('Сладкиш — веднъж седмично и в малка порция.');
  return out;
}

function habitsFor(goal, strength) {
  const out = [];
  if (goal === 'lose') {
    out.push('Планирайте менюто и пазаруването за седмицата — така се избягват импулсивни покупки.');
    out.push('Хранете се бавно, без екран; спрете при приятна ситост. Първо зеленчуците, после белтъкът.');
    out.push('Вода, чай или кафе без захар вместо подсладени напитки и сокове.');
    out.push('Сън 7–9 часа; недоспиването увеличава апетита.');
  }
  if (goal === 'gain') {
    out.push('Хранете се на всеки 3 часа; добавяйте зехтин, ядки, авокадо, пълномаслено кисело мляко към ястията.');
    out.push('Пийте след храненето, не преди — за да не се засищате с течности.');
    out.push('Смути и кисело мляко с ядки са лесни калорични закуски.');
    out.push('При лош апетит или ИТМ под 18,5 — хранителни добавки за пиене по преценка на лекаря: поне 400 kcal и 30 г белтък дневно (ESPEN).');
  }
  if (goal === 'maintain') {
    out.push('Следете теглото веднъж седмично; при покачване с 2 кг намалете порциите от хляб, ориз и мазнини.');
    out.push('Гответе вкъщи повечето дни — по-малко сол, захар и мазнини.');
  }
  out.push(strength
    ? 'Белтъкът — разпределен в 3–4 хранения по 25–40 г; хранене с белтък до 2 часа след тренировка.'
    : 'Движение: поне 150 минути седмично умерена активност и силови упражнения 2 пъти седмично (СЗО).');
  return out;
}

const FLAVOR_TIPS = [
  'Лимон, оцет и чесън правят вкуса по-ярък и заместват голяма част от солта.',
  'Билки: чубрица, джоджен, копър, магданоз, риган, босилек, мащерка, розмарин — пресни или сушени.',
  'Подправки: червен и черен пипер, кимион, куркума, джинджифил, канела, мускатово орехче.',
  'Печене и скара вместо варене — зеленчуците се карамелизират и стават по-сладки.',
  'Сосове без сметана: кисело мляко с чесън и копър, тахан с лимон, доматен сос с босилек.',
  'Препечени ядки и семки хрупкат и добавят вкус на салати и каши.',
];

function monitoringFor(goal) {
  if (goal === 'lose') {
    return [
      'Претегляне веднъж седмично, сутрин, на гладно; обиколка на талията веднъж месечно.',
      'Преоценка след 4 седмици: при спад под 0,25 кг седмично за 3 седмици — с 150–200 kcal по-малко или повече движение; при спад над 1 кг седмично — с 200 kcal повече.',
      'След достигане на целта — постепенно към енергията за поддържане, с 100–200 kcal на седмица.',
    ];
  }
  if (goal === 'gain') {
    return [
      'Претегляне веднъж седмично при едни и същи условия.',
      'Ако за 3 седмици няма покачване — с 200–300 kcal повече; при покачване над 1 кг седмично — с 200 kcal по-малко.',
    ];
  }
  return ['Претегляне веднъж седмично; колебанията до ±1 кг са нормални.'];
}
