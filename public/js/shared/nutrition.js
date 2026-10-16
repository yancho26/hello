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
 * Менюто е за 1 ден с по два варианта, за 7 дни или за месец от 4 седмици,
 * с рецепти от recipes.js и списък за пазаруване (при месеца — за всяка седмица). Не е предназначено за бременност,
 * кърмене, деца, хранителни разстройства и диализа.
 *
 * Менструален цикъл (cycle sync, версия 4.5): по избор менюто следва фазите —
 * в лутеалната фаза малко повече енергия, в останалите дни малко по-малко (средно
 * за цикъла същата); в дните на менструацията ястия с повече желязо, в
 * предменструалните — с повече калций и по-малко сол. Само това, за което има
 * основание; силата на доказателствата е посочена в режима.
 */

import { bmi as bmiOf } from './clinical.js';
import { table } from './table.js';
import { addDays, daysBetween, today } from './dates.js';
import { FOODS, FOOD_CATS, LIQUIDS, RECIPES, YIELDS, mainProtein, mealsOf, rawOf, recipeTags, shopName, totals } from './recipes.js';
import { renderMethod } from './recipe-method.js';
import { dietProfiles } from './diet-icd.js';
import { CONTRACEPTION, cycleStats, phaseOn, phasesFrom } from './cycle.js';
import { activityFromTraining, trainingNutrition, trainingPlan } from './training.js';

export { FOODS, RECIPES };

/* --------------------------------- речници --------------------------------- */

export const ACTIVITY = table({
  sedentary: { label: 'заседнал (без спорт)', factor: 1.2 },
  light: { label: 'лека активност (1–3 пъти седмично)', factor: 1.375 },
  moderate: { label: 'умерена активност (3–5 пъти седмично)', factor: 1.55 },
  active: { label: 'висока активност (6–7 пъти седмично)', factor: 1.725 },
  athlete: { label: 'много висока (тежък физически труд или спорт всеки ден)', factor: 1.9 },
});

const ACTIVITY_ORDER = ['sedentary', 'light', 'moderate', 'active', 'athlete'];

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

/** За колко дни е менюто: 1 ден с два варианта, седмица, месец от 4 седмици. */
export const MENU_DAYS = [1, 7, 28];

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
/** Първата буква — главна. */
const upper1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dec = (v) => String(v).replace('.', ',');
const KCAL_PER_KG = 7700;
/** Колко kcal дневно разлика в приема променят теглото в крайна сметка с 1 кг (Hall 2011: 100 kJ). */
const KCAL_PER_KG_DAY = 24;

/* --------------------------------- основен план --------------------------------- */

/**
 * @param {object} input
 *   sex, age, weight, height, waist, activity, goal, pace, targetWeight, pattern,
 *   mealsPerDay (3|4|5), days (1|7|28), quick, strength, preferences: [], allergies: [],
 *   conditions: Set, egfr, potassium, classes: Set, medNotes: [], variant, asOf,
 *   diagnoses: [{code, name}] — всички диагнози по МКБ-10, pregnancyWeek, sourcedOnly,
 *   cycle: { periods, lastPeriod, length, bleed, contraception, menopause } — менструалният цикъл,
 *   cycleSync — менюто да следва фазите му, startDate — от коя дата е менюто
 */
export function nutritionPlan(input) {
  const { sex, age, weight, height } = input;
  const warnings = [];
  if (!(age >= 18)) throw new Error('Хранителният режим е предназначен за възрастни (от 18 г.).');
  if (!(weight > 30 && weight < 350) || !(height > 120 && height < 230)) {
    throw new Error('Нужни са актуални тегло и ръст.');
  }
  const asOf = input.asOf || today();
  // Менюто може да започва от друга дата (до 2 месеца напред) — заради фазите на цикъла.
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '') && input.startDate >= asOf && input.startDate <= addDays(asOf, 62)
    ? input.startDate : asOf;
  // Диагнозите по МКБ-10 добавят заболявания, ограничения и правила (diet-icd.js).
  const dx = dietProfiles(input.diagnoses, { pregnancyWeek: input.pregnancyWeek });
  const cond = new Set([...(input.conditions || []), ...dx.cond]);
  const classes = input.classes || new Set();
  const fromAllergies = allergyPreferences(input.allergies);
  const prefs = new Set([...(input.preferences || []), ...fromAllergies.prefs, ...dx.prefs].filter(x => PREFERENCES[x]));
  if (prefs.has('vegan')) prefs.add('vegetarian');
  // Храните, които човекът не яде, и смените на отделни ястия (версия 4.14).
  const dislikes = new Set((input.dislikes || []).filter(f => FOODS[f]));
  const swaps = cleanSwaps(input.swaps);
  const b = bmiOf(weight, height);
  let activityId = ACTIVITY[input.activity] ? input.activity : 'sedentary';
  const patternId = PATTERNS[input.pattern] ? input.pattern : (cond.has('htn') ? 'dash' : 'mediterranean');
  const pattern = PATTERNS[patternId];
  const mealsPerDay = [3, 4, 5].includes(Number(input.mealsPerDay)) ? Number(input.mealsPerDay) : 5;
  // Меню за 1 ден (с два варианта), за седмица или за месец от 4 седмици.
  const days = MENU_DAYS.includes(Number(input.days)) ? Number(input.days) : 1;
  let strength = !!input.strength;

  let goal = GOALS[input.goal] ? input.goal : (b >= 25 && !dx.noLose ? 'lose' : b < 18.5 ? 'gain' : 'maintain');
  if (goal === 'lose' && dx.noLose) {
    warnings.push(dx.noLose);
    goal = 'maintain';
  }
  // Менструален цикъл: липсата на менструация при нормално тегло може да е от недостиг на енергия.
  const cycleIn = sex === 'f' ? cycleStats(input.cycle || {}, { age, asOf }) : null;
  const amenorrhea = dx.amenorrhea || !!cycleIn?.flags.some(f => f.code === 'amenorrhea');
  if (goal === 'lose' && amenorrhea && b < 25) {
    warnings.push('Липса на менструация при ИТМ под 25: възможен недостиг на енергия (функционална хипоталамична аменорея) — режимът е за поддържане, без дефицит. Endocrine Society 2017 препоръчва енергийният недостиг да се коригира. Изключете бременност.');
    goal = 'maintain';
  }

  // Тренировъчен план (версия 4.7) — за 4 седмици, със същите дати като менюто и с фазите на цикъла.
  const cycleOk = sex === 'f' && !!input.cycleSync && !!cycleIn?.natural && !!cycleIn.lastStart && !cycleIn.late
    && !cycleIn.menopause && !dx.pregnancy && !dx.lactation && !dx.menopause;
  const training = input.training ? trainingPlan({
    ...input.training, start, sex, age, weight, bmi: b, cond, classes,
    codes: dx.considered.map(c => c.code), pregnancy: dx.pregnancy, pregnancyWeek: Number(input.pregnancyWeek) || null,
    postpartum: dx.lactation, goal,
    inactive: activityId === 'sedentary', bp: input.bp || null, amenorrhea,
    phases: cycleOk ? phasesFrom(cycleIn, start, 28) : [],
  }) : null;
  let trainingNote = null;
  if (training) {
    // Енергията се смята по активността на плана, ако тя е по-висока от въведената.
    const planned = activityFromTraining(training);
    if (ACTIVITY_ORDER.indexOf(planned) > ACTIVITY_ORDER.indexOf(activityId)) {
      activityId = planned;
      trainingNote = `Физическата активност в изчислението на енергията е по тренировъчния план: ${ACTIVITY[planned].label}.`;
    }
    if (training.strengthFocus && !strength) strength = true;
  }
  const activity = ACTIVITY[activityId];
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

  const notes0 = trainingNote ? [trainingNote] : [];
  // eGFR: резултатът от изследването; ако го няма — стадият по кода N18.x.
  const egfr = input.egfr > 0 ? input.egfr : dx.egfr;
  if (!(input.egfr > 0) && dx.egfr && !dx.dialysis) notes0.push(`Няма резултат за eGFR — режимът приема около ${dx.egfr} mL/min по кода на ХБЗ; въведете резултата за по-точно изчисление.`);
  const dialysis = dx.dialysis;
  const ckd = !dialysis && egfr > 0 && egfr < 60;
  const ckdAdvanced = !dialysis && egfr > 0 && egfr < 30;
  const diabetes = cond.has('dm2') || cond.has('dm1') || cond.has('prediabetes');
  const cardio = ['htn', 'chd', 'pad', 'stroke', 'hf', 'dyslip'].some(c => cond.has(c));
  const onRaas = ['ACEI', 'ARB', 'ARNI', 'MRA', 'FINERENONE'].some(c => classes.has(c));
  const limitK = (egfr > 0 && egfr < 45 && onRaas) || input.potassium >= 5.0 || ckdAdvanced || dx.limitK;
  const lowSalt = cond.has('htn') || cond.has('hf') || ckd || dialysis || dx.lowSalt;

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
  // Корекция по проследяването на теглото (версия 4.14) — например −150 kcal при бавен спад.
  const kcalAdjust = Math.max(-600, Math.min(600, Math.round((Number(input.kcalAdjust) || 0) / 10) * 10));
  if (kcalAdjust) {
    target += kcalAdjust;
    notes0.push(`Енергията е коригирана с ${kcalAdjust > 0 ? '+' : '−'}${Math.abs(kcalAdjust)} kcal дневно по проследяването на теглото.`);
  }
  const floor = Math.max(sex === 'f' ? 1200 : 1500, bmr * 0.95);
  if (target < floor) {
    target = floor;
    if (goal === 'lose') warnings.push('Енергийният дефицит е ограничен, за да не пада приемът под основния метаболизъм.');
  }
  target = round(target, 50);
  // Бременност и кърмене: допълнителна енергия (EFSA).
  if (dx.energyAdd) target = round(target + dx.energyAdd, 50);

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
  // GLP-1 агонист при отслабване: 1,2–1,6 г/кг — мускулите се губят заедно с мазнините (ACLM/ASN/OMA/TOS 2025).
  const glp1 = classes.has('GLP1');
  if (glp1 && goal === 'lose' && proteinPerKg < 1.2) {
    proteinPerKg = 1.2;
    proteinNote = 'ACLM/ASN/OMA/TOS 2025: 1,2–1,6 г/кг при отслабване с GLP-1 агонист — заедно със силови упражнения.';
  }
  if (ckd) { proteinPerKg = 0.8; proteinNote = 'KDIGO 2024: 0,8 г/кг при ХБЗ G3–G5 без диализа; да не се превишава 1,3 г/кг.'; }
  if (dialysis) { proteinPerKg = 1.1; proteinNote = 'KDOQI 2020: 1,0–1,2 г/кг при хемодиализа.'; }
  if (dx.proteinMin && !ckd && !dialysis && proteinPerKg < dx.proteinMin) {
    proteinPerKg = dx.proteinMin;
    proteinNote = `По диагнозите: поне ${dec(dx.proteinMin)} г/кг (ESPEN).`;
  }
  if (dx.proteinMin && ckd) warnings.push('Диагнозите изискват повече белтък, а ХБЗ — по-малко: режимът спазва 0,8 г/кг по KDIGO; обсъдете с нефролог.');
  proteinPerKg = Math.round(proteinPerKg * 10) / 10;
  const protein = round(proteinPerKg * refWeight);
  // Горна граница за менюто: при ХБЗ — 1,0 г/кг (0,9 при G4–G5), далеч под 1,3 г/кг по KDIGO; иначе до 1,5 пъти целта
  // или до 20% от енергията (при много енергия), но не над 2 г/кг (2,2 при силови тренировки).
  const proteinMax = ckd ? round(refWeight * (ckdAdvanced ? 0.9 : 1.0)) : dialysis ? round(refWeight * 1.3) : round(Math.min(refWeight * (strength ? 2.2 : 2.0), Math.max(protein * 1.5, target * 0.2 / 4)));

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
  if (dx.pregnancy && carbs < 175) {
    carbs = 175;
    fat = round((target - protein * 4 - carbs * 4) / 9);
    fatPct = Math.round((fat * 9 / target) * 100);
    warnings.push('Бременност: въглехидратите са поне 175 г дневно (ADA) — разпределението е коригирано.');
  }
  const fiber = Math.max(25, round((target / 1000) * 14), dx.fiberMin);
  const satFatPct = (cardio || diabetes) ? 7 : 10;
  const satFat = round((target * satFatPct / 100) / 9);
  const sugarMax = round((target * 0.10) / 4);
  let fluids = Math.max(Math.min(3000, Math.max(1500, round(weight * 30, 100))), dx.fluidsMin);
  if (dialysis) fluids = Math.min(fluids, 1500);

  // Желязо и калций (EFSA 2015): желязо 16 мг за жени преди менопаузата, 11 мг за мъже и след
  // менопаузата; калций 1000 мг до 24 г., 950 мг след това.
  const menopause = sex === 'f' && (!!input.cycle?.menopause || dx.menopause || age >= 55
    || (age >= 50 && !cycleIn?.lastStart));
  const iron = sex === 'f' && !menopause ? 16 : 11;
  const calcium = age < 25 ? 1000 : 950;
  const targets = {
    kcal: target, protein, fat, carbs, fiber, satFat, sugarMax,
    salt: 5, fluids, iron, calcium,
    proteinPerKg, proteinMax, proteinNote, fatPct, satFatPct,
    carbPct: Math.round((carbs * 4 / target) * 100),
  };
  if (classes.has('SGLT2') && carbs < 130) {
    warnings.push(`SGLT2-инхибитор и под 130 г въглехидрати дневно (${carbs} г) — риск от кетоацидоза с нормална кръвна захар; обсъдете модела.`);
  }

  // Прогноза и целево тегло (версия 4.14): разходът намалява с теглото — всеки 24 kcal (100 kJ)
  // дневно разлика в приема променят теглото в крайна сметка с около 1 кг (Hall 2011). Началната
  // скорост е по 7700 kcal/кг, после се забавя: w(t) = w0 + Δ/24 × (1 − e^(−t × 24/7700)).
  // Енергията за бременност и кърмене не се брои — тя отива за бебето и за млякото.
  const gap = target - (dx.energyAdd || 0) - tdee;
  const weeklyKg = Math.round((gap * 7 / KCAL_PER_KG) * 100) / 100;
  const eventual = gap / KCAL_PER_KG_DAY;
  const tau = KCAL_PER_KG / KCAL_PER_KG_DAY;
  const weightAt = (days) => weight + eventual * (1 - Math.exp(-days / tau));
  const projection = { weeklyKg, targetWeight: null, weeks: null, eta: null, suggestions: [], curve: null, plateau: null, from: asOf };
  if (goal === 'lose') projection.suggestions = [0.95, 0.9].map(k => Math.round(weight * k));
  if (goal === 'gain') projection.suggestions = [Math.round(20 * (height / 100) ** 2)].filter(x => x > weight);
  const tw = Number(input.targetWeight);
  if (tw > 30 && tw < 350 && goal !== 'maintain') {
    const twBmi = bmiOf(tw, height);
    if ((goal === 'lose' && tw >= weight) || (goal === 'gain' && tw <= weight)) {
      warnings.push(`Целевото тегло ${dec(tw)} кг не съответства на целта „${GOALS[goal]}“.`);
    } else if (Math.abs(weeklyKg) > 0.05) {
      projection.targetWeight = tw;
      const share = (tw - weight) / eventual;
      const weeks = share > 0 && share < 1 ? Math.ceil(-tau * Math.log(1 - share) / 7) : Infinity;
      if (weeks <= 104) {
        projection.weeks = weeks;
        projection.eta = addDays(asOf, weeks * 7);
      } else {
        // Целта не се достига за 2 години при този прием — теглото се установява по-рано.
        projection.plateau = Math.round((weight + eventual) * 10) / 10;
        notes0.push(share >= 1
          ? `С ${target} kcal дневно теглото постепенно се установява около ${dec(projection.plateau)} кг и не стига до целта ${dec(tw)} кг. Преоценявайте енергията по правилата за контрол на теглото.`
          : `С ${target} kcal дневно до целта ${dec(tw)} кг са нужни над 2 години — отслабването се забавя с времето. Поставете междинна цел и преоценявайте енергията по правилата за контрол на теглото.`);
      }
      if (twBmi < 18.5) warnings.push(`Целевото тегло ${dec(tw)} кг е под нормалното (ИТМ ${dec(Math.round(twBmi * 10) / 10)}).`);
      if (goal === 'lose' && (weight - tw) / weight > 0.15) {
        projection.note = 'Целта е над 15% от теглото — поставете междинна цел от 5–10% за първите 6 месеца.';
      }
    }
  }
  // Очакваното тегло по седмици — до целта (най-много 2 години) или за 6 месеца.
  if (goal !== 'maintain' && Math.abs(weeklyKg) > 0.05) {
    const span = Math.min(104, Math.max(8, projection.weeks || 26));
    projection.curve = Array.from({ length: span + 1 }, (_, k) => ({ week: k, weight: Math.round(weightAt(k * 7) * 10) / 10 }));
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
  if (glp1) {
    prefer.push('GLP-1 агонист: по-малки и по-чести хранения — малка закуска, после на всеки 3–4 часа; бавно и до приятно засищане. На всяко хранене — белтък; зеленчуци, плодове, пълнозърнести, бобови, ядки и семена (ACLM/ASN/OMA/TOS 2025).');
    limit.push('GLP-1 агонист: големи и мазни хранения — засилват гаденето и повръщането; алкохол — засилва гаденето и рефлукса. Рафинирани въглехидрати, подсладени напитки, червено и преработено месо и пакетирани закуски — по-рядко.');
    notes.push('GLP-1 агонист: достатъчно течности — гаденето, повръщането и диарията могат да обезводнят и да увредят бъбреците; срещу запек — течности и фибри от храната. В първите дни след започване или увеличаване на дозата — без много мазни и много богати на фибри храни; при гадене — джинджифилов или ментов чай.');
    notes.push('GLP-1 агонист: само белтъкът не пази мускулите — нужни са и силови упражнения поне 3 пъти седмично. Витамин D, калций и B12 — проследяване и добавка при нужда.');
    if (mealsPerDay === 3) notes.push('GLP-1 агонист: при гадене или бързо засищане — 4 или 5 по-малки хранения вместо 3.');
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
  // Правилата от диагнозите по МКБ-10.
  prefer.push(...dx.prefer);
  limit.push(...dx.limit);
  avoid.push(...dx.avoid);
  notes.push(...dx.notes);
  warnings.push(...dx.warnings);
  if (dx.dietitian) {
    const who = dx.considered.filter(c => c.dietitian).map(c => c.label);
    warnings.push(`При тези диагнози (${[...new Set(who)].join(', ')}) режимът е ориентировъчен — обсъдете го с диетолог.`);
  }

  // Рецептите, които стават за човека, с оценка за подходящост.
  const ctx = {
    prefs, cond, diabetes, cardio, ckd, limitK, lowSalt, patternId, goal, quick: !!input.quick,
    sourcedOnly: !!input.sourcedOnly, proteinShare: (protein * 4) / target,
    exclude: dx.exclude, penalize: dx.penalize, dislikes,
  };
  const lowerCarb = diabetes || patternId === 'lowcarb';
  // При модела с малко въглехидрати нишестето не расте; при диабет расте умерено.
  const strictLowCarb = patternId === 'lowcarb';
  const variant = Math.max(0, Math.floor(Number(input.variant) || 0));
  const slots = MEAL_PLANS[mealsPerDay];
  const pools = {};
  for (const kind of new Set(slots.map(s => s.meal))) pools[kind] = poolFor(kind, ctx, variant);
  if (Object.values(pools).some(p => p.unsourced)) {
    notes.push('За някои хранения няма рецепта с публикуван източник при тези ограничения — там са включени и традиционните рецепти на програмата.');
  }
  if (Object.values(pools).some(p => p.relaxed)) {
    notes.push('При тези ограничения за някои хранения няма ястие, което да пасва на всичко — там порциите на солените, сладките и богатите на калий храни са малки. Обсъдете менюто с диетолог.');
  }
  if (Object.values(pools).some(p => p.disliked)) {
    notes.push('За някои хранения няма подходящо ястие без храните, които човекът не яде — там те остават; заменете ги с подобна храна.');
  }

  // Менструален цикъл: фазите за дните на менюто — енергия и акцент (желязо, калций) за всеки ден.
  const sync = sex === 'f' ? cycleSyncFor(input, { start, days, stats: cycleIn, dx, target, floor, strength }) : null;
  // Тренировките: в деня с по-голям разход — повече енергия, в почивния — по-малко; средно
  // за седмицата същата (разходът вече е в коефициента за активност).
  const trainAdd = (d) => {
    const td = training?.days[d];
    if (!td) return 0;
    const wk = training.days.slice(Math.floor(d / 7) * 7, Math.floor(d / 7) * 7 + 7);
    const mean = wk.reduce((acc, x) => acc + x.kcal, 0) / wk.length;
    return Math.min(350, Math.max(-250, round(td.kcal - mean, 10)));
  };
  const dayKcal = (d) => Math.max(round(floor, 10), target + (sync?.applied ? sync.days[d]?.kcalAdd || 0 : 0) + trainAdd(d));
  const dayTraining = (d) => {
    const td = training?.days[d];
    if (!td) return null;
    return {
      sessions: td.sessions.map(x => ({ activity: x.activity, icon: x.icon, label: x.label, minutes: x.minutes, intensity: x.intensity, time: x.time, extra: !!x.extra })),
      addOns: td.addOns.map(a => a.kind), kcal: td.kcal, kcalAdd: trainAdd(d), tips: trainingNutrition(td),
    };
  };
  const dayFocus = (d) => [...dx.focus, ...(sync?.applied ? sync.days[d]?.focus || [] : [])];
  if (sync?.applied) {
    prefer.push(...sync.prefer);
    if (sync.irregular) warnings.push('Цикълът е нередовен — фазите в менюто са ориентировъчни.');
  }

  const meal = (slot, pick, kcalDay) => {
    const kcal = round(kcalDay * slot.share, 10);
    return { kcal, option: pick ? buildMeal(pick.r, kcal, prefs, { lowerCarb, strict: strictLowCarb }) : null };
  };

  // Ден с по два варианта за всяко хранене (при цикъла — по фазата на първия ден).
  const usedToday = new Set();
  const focus0 = dayFocus(0);
  const meals = slots.map((slot, si) => {
    const pool = pools[slot.meal];
    const kcal = round(dayKcal(0) * slot.share, 10);
    if (!pool.length) return { ...slot, kcal, options: [] };
    const ordered = focus0.length ? [...pool].sort((a, b2) => (b2.s + focusBonus(b2, focus0)) - (a.s + focusBonus(a, focus0))) : pool;
    const fresh = ordered.filter(x => !usedToday.has(x.r.name));
    const picks = (fresh.length >= 2 ? fresh : ordered).slice(0, 2);
    for (const p of picks) usedToday.add(p.r.name);
    // „Друго ястие“ (версия 4.14): n-тото следващо подходящо, което още не е в деня.
    picks.forEach((p, v) => {
      const n = swaps[`0.${si}.${v}`];
      const alt = n ? ordered.filter(x => !usedToday.has(x.r.name)) : [];
      if (!alt.length) return;
      picks[v] = alt[(n - 1) % alt.length];
      usedToday.add(picks[v].r.name);
    });
    return { ...slot, kcal, options: picks.map(p => buildMeal(p.r, kcal, prefs, { lowerCarb, strict: strictLowCarb })) };
  });

  // Седмично меню — по едно ястие за всяко хранене, с ритъм за седмицата.
  let week = null;
  if (days > 1) {
    const plannedDays = planDays(slots, pools, variant, days, dayFocus);
    swapPicks(plannedDays, slots, pools, swaps, dayFocus);
    week = plannedDays.map((picks, d) => {
      const date = addDays(start, d);
      return {
        day: d + 1, label: weekdayOf(date), date, kcal: dayKcal(d),
        cycle: sync?.applied ? sync.days[d] : null,
        training: dayTraining(d),
        meals: slots.map((slot, i) => ({ ...slot, ...meal(slot, picks[i], dayKcal(d)) })),
      };
    });
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

  // Приготвянето с окончателните грамове на всяка порция.
  const options = [...meals.flatMap(m => m.options), ...(week || []).flatMap(d => d.meals.map(m => m.option))].filter(Boolean);
  for (const o of options) o.method = renderMethod(o.template, o.items, { swaps: o.swaps });
  for (const o of options) delete o.template;

  const day = dayTotals(meals.map(m => m.options[0]));

  // Желязо и калций в менюто спрямо препоръката.
  const avgOf = (k) => (week ? week.reduce((acc, d) => acc + d.totals[k], 0) / week.length : day[k]);
  if (avgOf('fe') < iron * 0.75) {
    notes.push(`Желязо в менюто: около ${Math.round(avgOf('fe'))} мг дневно при препоръка ${iron} мг (EFSA). Добавяйте бобови, тиквени семки, постно червено месо, яйца и спанак — с витамин C; добавка с желязо — само при доказан недостиг.`);
  }
  if (avgOf('ca') < calcium * 0.75) {
    notes.push(`Калций в менюто: около ${round(avgOf('ca'), 10)} мг дневно при препоръка ${calcium} мг (EFSA). Добавяйте млечни продукти, сирене, сардини, тофу или растителни напитки с калций.`);
  }

  return {
    input: {
      sex, age, weight, height, waist: input.waist || null, activity: input.activity || 'sedentary',
      goal, pace, targetWeight: projection.targetWeight, pattern: patternId, mealsPerDay, days,
      quick: !!input.quick, sourcedOnly: !!input.sourcedOnly, strength, preferences: [...prefs], egfr: input.egfr || null,
      dislikes: [...dislikes], swaps, kcalAdjust,
      diagnoses: dx.considered.map(c => ({ code: c.code, name: c.name })), pregnancyWeek: Number(input.pregnancyWeek) || null,
      startDate: start, cycleSync: !!input.cycleSync, training: training ? training.input : null,
      cycle: sync?.stats ? { lastPeriod: sync.stats.lastStart, length: sync.stats.length, bleed: sync.stats.bleed, contraception: sync.stats.contraception } : null,
    },
    bmi: Math.round(b * 10) / 10,
    energy: { bmr: Math.round(bmr), tdee: Math.round(tdee), target, activityFactor: activity.factor, activity: activityId },
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
    shopping: week && days === 7 ? shoppingList(week) : null,
    // Месечното меню: пазаруване за всяка седмица поотделно.
    shoppingWeeks: week && days > 7 ? weekChunks(week).map((chunk, i) => ({
      week: i + 1, from: chunk[0].date, to: chunk[chunk.length - 1].date, ...shoppingList(chunk),
    })) : null,
    diagnoses: dx.considered,
    cycle: sync,
    training,
    trainingToday: days === 1 ? dayTraining(0) : null,
    flags: { limitK, ckd, ckdAdvanced, diabetes, dialysis, pregnancy: dx.pregnancy, cycleSync: !!sync?.applied, training: !!training, glp1 },
  };
}

/* ------------------------------ цикъл и хранене ------------------------------ */

/** Добавка в лутеалната и предменструалната фаза (kcal дневно). */
export const CYCLE_KCAL = 100;

/** Ден от седмицата за дата — „Сряда“. */
function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Колко повече се предпочита ястието за акцента на деня: желязо и калций — по
 * плътността им (мг на 1000 kcal; средното за рецептите е около 9 мг желязо и 340 мг калций),
 * по-малко сол — ястията без солени храни. */
function focusBonus(x, focus) {
  let w = 0;
  if (focus.includes('iron')) w += clampTo((x.fe - 8) / 2, -1, 3);
  if (focus.includes('calcium')) w += clampTo((x.ca - 350) / 150, -1, 3);
  if (focus.includes('lessSalt') && !x.tags.has('dash')) w -= 1;
  return w;
}

/* Какво се променя във всяка фаза — и колко силни са доказателствата. */
const PHASE_SYNC = {
  menstrual: {
    focus: ['iron'],
    prefer: 'Менструация: ястия с повече желязо — постно червено месо, бобови, тиквени семки, яйца, спанак — заедно с витамин C (чушки, цитруси, киви); чай и кафе — поне 1 час след хранене.',
    evidence: 'Желязото се губи с менструацията, но нуждата се покрива за целия цикъл: 16 мг дневно (EFSA 2015). Акцентът в тези дни е практичен — важно е общото количество.',
  },
  follicular: {
    focus: [],
    prefer: null,
    evidence: 'Фоликуларна фаза и овулация: обичайното меню. Няма доказателства, че определени храни в тези дни имат ефект.',
  },
  luteal: {
    focus: [],
    prefer: null,
    evidence: `Лутеална фаза: +${CYCLE_KCAL} kcal дневно, а в останалите дни по-малко — средно за цикъла енергията е същата. Основният метаболизъм в тази фаза е малко по-висок (малък ефект, Benton 2020), а апетитът и приемът на храна са по-големи — средно с около 168 kcal дневно (Tucker 2024). Доказателствата са от наблюдения, а разликите между жените са големи.`,
  },
  premenstrual: {
    focus: ['calcium', 'lessSalt'],
    prefer: 'Предменструални дни: ястия с повече калций (кисело мляко, сирене, сардини, тофу) и по-малко сол; редовни хранения, по-малко кофеин и алкохол.',
    evidence: 'Калцият намалява оплакванията при ПМС — ACOG 2023 препоръчва 1000–1200 мг дневно (условна препоръка при доказателства с ниско качество). За солта, кофеина и захарта доказателствата са слаби.',
  },
};

/**
 * Менюто по фазите на цикъла: за всеки ден — фаза, промяна на енергията и акцент.
 * Връща null, ако не е поискано; { applied: false, reason } — ако не може да се приложи.
 */
function cycleSyncFor(input, { start, days, stats, dx, target, floor, strength }) {
  if (!input.cycleSync || !stats) return null;
  const summary = {
    lastStart: stats.lastStart, length: stats.length, lengthSource: stats.lengthSource, bleed: stats.bleed,
    contraception: stats.contraception, regular: stats.regular, variation: stats.variation,
    nextStart: stats.nextStart, ovulation: stats.ovulation, pending: stats.pending, today: stats.today,
    flags: stats.flags,
  };
  const no = (reason) => ({ applied: false, reason, stats: summary });
  if (dx.pregnancy) return no('Бременност — менюто не следва фазите на цикъла.');
  if (dx.lactation) return no('Кърмене — цикълът често липсва или е нередовен; менюто не следва фазите.');
  if (dx.menopause || stats.menopause) return no('Менопауза — менюто не следва фази на цикъла.');
  if (!stats.lastStart) return no('Няма дата на последната менструация — въведете я, за да се изчислят фазите.');
  if (!stats.natural) {
    const what = CONTRACEPTION[stats.contraception].label;
    return no(`${upper1(what)}: овулацията е потисната и няма лутеална фаза — менюто е еднакво за всички дни.`);
  }
  if (stats.late) return no(stats.flags.find(f => f.code === 'late' || f.code === 'amenorrhea')?.text || 'Менструацията закъснява.');
  const phases = phasesFrom(stats, start, days);
  if (!phases.length) return no('Фазите не могат да се изчислят от тези дати.');

  // Енергия: в лутеалната и предменструалната фаза +100 kcal; в останалите дни толкова
  // по-малко, че средно за цикъла енергията да е същата — без да пада под долната граница.
  const one = Array.from({ length: stats.length }, (_, i) => phaseOn(addDays(stats.lastStart, i), stats).phase);
  const upDays = one.filter(ph => ph === 'luteal' || ph === 'premenstrual').length;
  let down = round(CYCLE_KCAL * upDays / Math.max(1, stats.length - upDays), 10);
  if (target - down < floor) down = Math.max(0, round(target - floor, 10));

  const dayList = phases.map(ph => {
    const up = ph.phase === 'luteal' || ph.phase === 'premenstrual';
    const rule = PHASE_SYNC[ph.phase === 'ovulation' ? 'follicular' : ph.phase];
    return { ...ph, kcalAdd: up ? CYCLE_KCAL : -down, focus: rule.focus };
  });
  const seen = new Set(dayList.map(d => (d.phase === 'ovulation' ? 'follicular' : d.phase)));
  const order = ['menstrual', 'follicular', 'luteal', 'premenstrual'];
  const evidence = order.map(k => PHASE_SYNC[k].evidence);
  if (strength) evidence.push('Силови тренировки: в лутеалната фаза белтъкът да е в горната част на препоръката (ISSN 2023).');
  const notes = [];
  if (stats.lengthSource === 'default') notes.push('Дължината на цикъла не е известна — приета е 28 дни. Въведете поне две менструации за точност.');
  if (stats.pending) notes.push(`Менструацията се очакваше на ${stats.nextStart.split('-').reverse().join('.')} — ако е започнала, въведете датата.`);
  return {
    applied: true,
    stats: summary,
    kcalUp: CYCLE_KCAL,
    kcalDown: down,
    irregular: stats.regular === false,
    days: dayList,
    prefer: order.filter(k => seen.has(k) && PHASE_SYNC[k].prefer).map(k => PHASE_SYNC[k].prefer),
    evidence,
    notes,
    notIncluded: 'Не са включени „храни за хормоните“ по фази и семенният цикъл (seed cycling): изследванията са малки и с противоречиви резултати. Няма надеждни проучвания, че менюто по фази помага за теглото — затова енергията средно за цикъла е същата.',
  };
}

/* ------------------------------- подбор на рецепти ------------------------------- */

/** Рецептите за едно хранене, които стават за човека, подредени по подходящост. */
function poolFor(kind, ctx, variant) {
  const collect = (c) => {
    const out = [];
    RECIPES.forEach((r, i) => {
      if (!mealsOf(r).includes(kind)) return;
      if (c.sourcedOnly && !r.source) return;
      const items = substituted(r, c.prefs).items;
      if (excluded(items, c)) return;
      const tags = recipeTags({ ...r, items: items.map(it => [it.food, it.grams]) });
      const t = totals(items);
      out.push({
        r, tags, s: score(r, items, tags, ctx), i, protein: mainProtein(r),
        fe: t.kcal ? (t.fe / t.kcal) * 1000 : 0, ca: t.kcal ? (t.ca / t.kcal) * 1000 : 0,
      });
    });
    return out;
  };
  // Предпочитанията и алергиите са твърди. Ако заради сол, калий и сладко не остане
  // нито едно ястие, тези ограничения се отпускат (калият се ограничава после по порция).
  let scored = collect(ctx);
  let relaxed = false;
  let unsourced = false;
  let disliked = false;
  // „Само рецепти с източник“: ако за това хранене няма такава, се връщат всички.
  if (!scored.length && ctx.sourcedOnly) {
    scored = collect({ ...ctx, sourcedOnly: false });
    unsourced = scored.length > 0;
  }
  // Храните, които човекът не яде, отстъпват първи — преди здравните ограничения.
  if (!scored.length && ctx.dislikes?.size) {
    scored = collect({ ...ctx, dislikes: null });
    disliked = scored.length > 0;
  }
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
  pool.unsourced = unsourced;
  pool.disliked = disliked;
  return pool;
}

/** Смените на ястия от формата: { 'ден.хранене.вариант': колко пъти } — само валидните. */
export function cleanSwaps(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const key of Object.keys(value).sort().slice(0, 200)) {
    const n = Math.floor(Number(value[key]));
    if (/^\d{1,2}\.\d\.[01]$/.test(key) && Number(key.split('.')[0]) < 28 && n >= 1 && n <= 100) out[key] = n;
  }
  return out;
}

/**
 * „Друго ястие“ в седмичното и месечното меню: на мястото на избраното — n-тото следващо
 * подходящо, което не е в същата седмица (ако няма такова — просто друго). Останалите дни не се променят.
 */
function swapPicks(days, slots, pools, swaps, focusOf) {
  for (const [key, n] of Object.entries(swaps)) {
    const [d, s] = key.split('.').map(Number);
    const picks = days[d];
    if (!picks?.[s]) continue;
    const focus = focusOf(d);
    const weight = (x) => x.s + (focus.length ? focusBonus(x, focus) : 0);
    const ordered = [...pools[slots[s].meal]].sort((a, b) => weight(b) - weight(a));
    const from = d - (d % 7);
    const inWeek = new Set(days.slice(from, from + 7).flatMap(p => p.filter(Boolean).map(x => x.r.name)));
    let alt = ordered.filter(x => !inWeek.has(x.r.name));
    if (!alt.length) alt = ordered.filter(x => x.r.name !== picks[s].r.name);
    if (alt.length) picks[s] = alt[(n - 1) % alt.length];
  }
}

function hash(text, seed) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/* Ястия, в които млечното е същността — без него не се правят. */
const NO_SWAP = new Set(['Диня със сирене', 'Извара с горски плодове и канела']);

function substituted(r, prefs) {
  if (NO_SWAP.has(r.name)) return { name: r.name, items: r.items.map(([food, grams]) => ({ food, grams, orig: food })), swaps: [] };
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
    if (food !== id && !swaps.some(([a, b]) => a === id && b === food)) swaps.push([id, food]);
    // Заместителят е със същата енергия, а не със същия грамаж (напр. сухи ядки → варена елда).
    const grams = food === id ? g : g * FOODS[id].kcal / FOODS[food].kcal;
    return { food, grams, orig: id };
  });
  return { name: name.charAt(0).toUpperCase() + name.slice(1), items, swaps };
}


function excluded(items, ctx) {
  const { prefs, cond } = ctx;
  const has = (flag) => items.some(it => FOODS[it.food].flags.has(flag));
  if (ctx.exclude?.size && items.some(it => ctx.exclude.has(it.food))) return true;
  if (ctx.dislikes?.size && items.some(it => ctx.dislikes.has(it.food) || ctx.dislikes.has(it.orig))) return true;
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
  // Рецептите с публикуван и проверен източник (NHLBI) се предпочитат.
  if (r.source) s += 2;
  // По диагнозите някои храни се дават по-рядко (оксалати при камъни, бобови при раздразнено черво).
  if (ctx.penalize?.size && items.some(it => ctx.penalize.has(it.food))) s -= 2;
  if (ctx.ckd) {
    // Колкото по-близо е делът на белтъка в ястието до дела в целта, толкова по-подходящо.
    const share = t.kcal ? (t.protein * 4) / t.kcal : 0;
    s += 2 - Math.min(6, Math.abs(share - ctx.proteinShare) * 40);
    if (tags.has('highprotein')) s -= 2;
  }
  return s;
}

/** Дните на менюто по седмици (за месечното меню и пазаруването). */
export function weekChunks(days) {
  const out = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
  return out;
}

/**
 * Меню за n дни (7 или 28): по едно ястие за всяко хранене. В рамките на седмицата
 * обядите и вечерите не се повтарят; ястие от предишна седмица се връща рядко,
 * само ако няма друго подходящо. Всяка седмица: риба поне 2 пъти, бобови поне
 * 3 пъти, червено месо до 2 пъти; основният белтък на обяда и вечерята е различен.
 */
function planDays(slots, pools, variant, n, focusOf = () => []) {
  const lastUsed = new Map();
  let counts = { fish: 0, legume: 0, redmeat: 0 };
  const out = [];
  for (let d = 0; d < n; d++) {
    const dw = d % 7;
    const weekStart = d - dw;
    if (dw === 0) counts = { fish: 0, legume: 0, redmeat: 0 };
    const picks = [];
    const proteinsToday = new Set();
    const focus = focusOf(d);
    for (const slot of slots) {
      const pool = pools[slot.meal];
      if (!pool.length) { picks.push(null); continue; }
      const main = slot.meal === 'lunch' || slot.meal === 'dinner';
      let best = null;
      let bestW = -Infinity;
      for (const x of pool) {
        let w = x.s;
        const last = lastUsed.get(x.r.name);
        if (last !== undefined) {
          if (!main) w -= d - last <= 2 ? 30 : 3;
          else w -= last >= weekStart ? 40 : d - last < 14 ? 16 : 10;
        }
        if (main) {
          if (x.tags.has('fish') && counts.fish < 2) w += 4 - dw * 0.3;
          if (x.tags.has('legume') && counts.legume < 3) w += 3;
          if (x.tags.has('redmeat') && counts.redmeat >= 2) w -= 20;
          if (proteinsToday.has(x.protein)) w -= 3;
        }
        if (focus.length) w += focusBonus(x, focus);
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
  // На брой — когато е поне половин плод или яйце; по-малкото се мери в грамове.
  if (f.unit && f.unit.name === 'бр.' && grams >= f.unit.grams * 0.5) {
    const n = Math.min(maxPieces, Math.max(1, Math.round(grams / f.unit.grams)));
    return { grams: n * f.unit.grams, text: `${f.name} — ${n} ${f.unit.name} (≈${n * f.unit.grams} г)` };
  }
  if (f.unit && f.unit.name === 'с.л.') {
    const g = Math.max(5, round(grams, 5));
    return { grams: g, text: `${f.name} — ${g} г (≈${dec(g / f.unit.grams)} с.л.)` };
  }
  const g = grams >= 100 ? round(grams, 10) : Math.max(5, round(grams, 5));
  const raw = rawOf(foodId, g);
  const note = raw ? ` (${raw.grams} г ${raw.kind === 'dry' ? 'сухо' : 'сурово'} тегло)` : '';
  return { grams: g, text: `${f.name} — ${g} ${LIQUIDS.has(foodId) ? 'мл' : 'г'}${note}` };
}

/* Най-много грамове от една съставка в едно ястие — ястието да остане истинско ястие,
 * а не 700 г краставици. Отделно никоя съставка не расте над 2,5 пъти порцията в рецептата. */
const MAX_BY_CAT = { veg: 350, fruit: 300, grain: 350, legume: 300, protein: 250, dairy: 400, nuts: 40, fat: 25, other: 400 };
const MAX_BY_FOOD = {
  bread: 150, ryebread: 150, gfbread: 150, pita: 150, oats: 100, muesli: 100, whitecheese: 60, kashkaval: 50, mozzarella: 100,
  cottage: 250, avocado: 100, olives: 50, honey: 20, darkchoc: 30, driedfruit: 60, watermelon: 500, hummus: 120,
  tahini: 30, peanutbutter: 30, tomatosauce: 250, lettuce: 150, arugula: 80, spinach: 250,
  cheddar: 50, turkeysausage: 100, phyllo: 120, corntortilla: 150, tortilla: 150,
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
  'bulgur', 'couscous', 'pasta', 'potato', 'sweetpotato', 'lentils', 'beans', 'chickpeas', 'peas', 'tortilla', 'corntortilla', 'phyllo']);

/* На брой се води съставка от поне половин плод или яйце; по-малкото се мащабира в грамове. */
const isPiece = (it) => FOODS[it.food].unit?.name === 'бр.' && it.grams >= FOODS[it.food].unit.grams * 0.5;

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
  const clamp = (v) => Math.min(2.2, Math.max(0.5, v));
  let factor = clamp((kcal - fruitKcal - starchKcal) / rest);
  // Месото, рибата, яйцата, млечните и тофуто растат най-много 1,3 пъти: голямото хранене
  // идва от гарнитурата и зеленчуците, а не от 250 г риба.
  const rich = (it) => !fruit(it) && !starch(it) && PROTEIN_FOODS.has(it.food) && !LEGUMES.has(it.food);
  const richKcal = totals(base.filter(rich)).kcal;
  let richFactor = factor;
  if (factor > 1.3 && rest - richKcal > 30) {
    richFactor = 1.3;
    factor = clamp((kcal - fruitKcal - starchKcal - richKcal * 1.3) / (rest - richKcal));
  }
  const items = base.map(it => (fruit(it)
    ? resize(it, it.grams, Math.max(1, Math.round(it.grams / FOODS[it.food].unit.grams)))
    : resize(it, it.grams * (starch(it) ? starchFactor : rich(it) ? richFactor : factor))));
  const t = totals(items);
  return {
    key: r.name, name: sub.name, items, time: r.time, flavor: r.flavor, source: r.source || null,
    // Приготвянето се попълва накрая — с окончателните грамове на порцията (renderMethod).
    template: r.method, swaps: sub.swaps, method: '',
    kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber, na: t.na, fe: t.fe, ca: t.ca,
  };
}

const PROTEIN_FOODS = new Set(['chicken', 'chickenthigh', 'turkey', 'turkeymince', 'beef', 'beefmince', 'pork', 'hake', 'trout',
  'mackerel', 'salmon', 'sardines', 'tuna', 'shrimp', 'egg', 'cottage', 'whitecheese', 'kashkaval', 'mozzarella', 'tofu',
  'lentils', 'beans', 'chickpeas', 'peas', 'hummus', 'yogurt', 'lfyogurt', 'greekyogurt', 'kefir', 'milk', 'lfmilk', 'soyyogurt',
  'whitefish', 'tunasteak', 'eggwhite', 'parmesan', 'evapmilk', 'cheddar', 'turkeysausage', 'edamame']);

const LEGUMES = new Set(['lentils', 'beans', 'chickpeas', 'peas', 'hummus', 'edamame']);

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
/* Когато в деня има малко белтък — първо белтъчна добавка според ограниченията. */
const PROTEIN_EXTRAS = [
  ['chickpeas', 100, 'main'],
  ['tofu', 100, 'main'],
  ['greekyogurt', 150, 'light'],
  ['soyyogurt', 150, 'light'],
];
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
  const order = bias === 'low' ? [...plain, ...nutty] : bias === 'high' ? [...PROTEIN_EXTRAS, ...nutty, ...plain] : EXTRAS;
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
  // При малко въглехидрати и много ограничения енергията пак може да не стига —
  // тогава малко хляб е по-добре от 300 kcal по-малко.
  if (ctx.lowerCarb && kcal - o.kcal > kcal * 0.08) {
    const food = o.items.find(it => BREADS.includes(it.food))?.food || (ctx.prefs.has('glutenFree') ? 'gfbread' : 'ryebread');
    const have = o.items.find(it => it.food === food);
    const want = Math.min(60, ((kcal - o.kcal) / FOODS[food].kcal) * 100);
    const trial = have ? o.items.map(it => (it === have ? { ...it, grams: it.grams + want } : it)) : [...o.items, { food, grams: want, extra: true }];
    if (want >= 20 && !excluded(trial, ctx)) {
      o = withTotals(o, trial.map(it => (it.food !== food ? it : it.extra ? resize(it, it.grams, 1) : { ...resize({ ...it, base: maxGrams(food) }, it.grams), base: it.base })));
    }
  }
  return o;
}

function withTotals(option, items) {
  const t = totals(items);
  return { ...option, items, kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber, na: t.na, fe: t.fe, ca: t.ca };
}

function dayTotals(options) {
  const s = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, na: 0, fe: 0, ca: 0 };
  for (const o of options) {
    if (!o) continue;
    for (const k of Object.keys(s)) s[k] += o[k] || 0;
  }
  for (const k of Object.keys(s)) s[k] = k === 'fe' ? Math.round(s[k] * 10) / 10 : Math.round(s[k]);
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
      .map(([food, g]) => ({ food, name: shopName(food), grams: Math.round(g), amount: amountText(food, g) })),
  })).filter(g => g.items.length);
  return { groups, spices: [...spices].sort((a, b) => a.localeCompare(b, 'bg')) };
}

function amountText(food, g) {
  const f = FOODS[food];
  if (f.unit?.name === 'бр.') return `${Math.ceil(g / f.unit.grams)} бр.`;
  const unit = LIQUIDS.has(food) ? ['мл', 'л'] : ['г', 'кг'];
  // Сварените и печените храни се купуват сухи или сурови.
  const y = YIELDS[food];
  const buy = y ? g / (y.dry || y.raw) : g;
  const note = y ? ` (${y.dry ? 'сухо' : 'сурово'} тегло)` : '';
  if (buy >= 1000) return `${dec(Math.round(buy / 100) / 10)} ${unit[1]}${note}`;
  return `${Math.max(10, Math.round(buy / 10) * 10)} ${unit[0]}${note}`;
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

/* ------------------------------ напредък по режима ------------------------------ */

const r1 = (v) => Math.round(v * 10) / 10;

/** Очакваното тегло след толкова дни по прогнозата на режима (по седмиците; за стари режими — по права линия). */
export function expectedWeight(plan, days) {
  const pr = plan.projection || {};
  const w0 = plan.input.weight;
  const curve = pr.curve;
  if (!curve?.length) return r1(w0 + (pr.weeklyKg || 0) * days / 7);
  const wk = days / 7;
  const last = curve[curve.length - 1];
  if (wk >= last.week) return last.weight;
  const i = Math.floor(wk);
  const a = curve[i];
  const b = curve[i + 1] || a;
  return r1(a.weight + (b.weight - a.weight) * (wk - i));
}

/**
 * Напредък по запазен режим (версия 4.14): теглото след режима спрямо прогнозата и какво да
 * се промени — по правилата за контрол на теглото в самия режим.
 * saved: { date, plan }; weights: [{ date, weight }] — измерванията (по-старите от режима се пропускат).
 * Връща { from, to, start, last, weeks, change, rate, expected, status, text, kcal, kcalNew, targetWeight, points }.
 * status: none (няма измерване), early (под 3 седмици), ok, slow, fast, done, up, down.
 */
export function planProgress(saved, weights = [], asOf = today()) {
  const plan = saved?.plan;
  if (!plan?.input?.weight || !saved.date) return null;
  const from = saved.date;
  const goal = plan.input.goal;
  const w0 = plan.input.weight;
  const tw = plan.projection?.targetWeight || null;
  const kcal = plan.targets.kcal;
  // Едно измерване за ден — последното.
  const byDate = new Map();
  for (const m of weights || []) if (m && m.weight > 0 && m.date > from && m.date <= asOf) byDate.set(m.date, Number(m.weight));
  const points = [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, weight]) => ({ date, weight }));
  const base = { from, start: w0, goal, kcal, targetWeight: tw, points, kcalNew: null };
  if (!points.length) {
    return { ...base, status: 'none', text: 'Няма измерване на теглото след режима — претегляйте се веднъж седмично, сутрин, на гладно.' };
  }
  const last = points[points.length - 1];
  const days = daysBetween(from, last.date);
  const weeks = days / 7;
  const change = r1(last.weight - w0);
  // Скорост — наклонът по всички измервания заедно с началното (кг седмично).
  const xy = [[0, w0], ...points.map(p => [daysBetween(from, p.date) / 7, p.weight])];
  const mx = xy.reduce((s, [x]) => s + x, 0) / xy.length;
  const my = xy.reduce((s, [, y]) => s + y, 0) / xy.length;
  const sxx = xy.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const rate = sxx ? Math.round((xy.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx) * 100) / 100 : 0;
  const expected = r1(expectedWeight(plan, days) - w0);
  const floor = Math.max(plan.input.sex === 'f' ? 1200 : 1500, Math.round((plan.energy?.bmr || 0) * 0.95));
  const out = { ...base, to: last.date, last: last.weight, weeks: r1(weeks), change, rate, expected };
  const kg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dec(Math.abs(v))} кг`;
  // kcalNew — енергията по правилата; adjust — колко да се добави към корекцията в новия режим.
  const result = (status, text, kcalNew = null) => ({
    ...out, status, text, kcalNew, adjust: kcalNew ? (plan.input.kcalAdjust || 0) + kcalNew - kcal : 0,
  });
  if (goal === 'lose' && tw && last.weight <= tw) {
    return result('done', 'Целевото тегло е достигнато — постепенно към енергията за поддържане: с 100–200 kcal повече всяка седмица.');
  }
  if (goal === 'gain' && tw && last.weight >= tw) {
    return result('done', 'Целевото тегло е достигнато — постепенно към енергията за поддържане.');
  }
  if (weeks < 3) {
    return result('early', `${kg(change)} за ${Math.round(days)} дни (очаквано ${kg(expected)}). Оценката е след поне 3 седмици — колебанията до ±1 кг са нормални.`);
  }
  if (goal === 'lose') {
    if (rate > -0.25) {
      const next = Math.max(round(floor, 50), round(kcal - 175, 50));
      return next < kcal
        ? result('slow', `Спадът е под 0,25 кг седмично — с 150–200 kcal по-малко (около ${next} kcal дневно) или повече движение.`, next)
        : result('slow', 'Спадът е под 0,25 кг седмично, а енергията е на долната граница — повече движение вместо по-малко храна.');
    }
    if (rate < -1) return result('fast', `Спадът е над 1 кг седмично — с 200 kcal повече (около ${round(kcal + 200, 50)} kcal дневно).`, round(kcal + 200, 50));
    return result('ok', `Теглото намалява по плана: ${kg(change)} за ${Math.round(weeks)} седмици (очаквано ${kg(expected)}) — продължете.`);
  }
  if (goal === 'gain') {
    if (rate < 0.1) return result('slow', `Няма покачване — с 200–300 kcal повече (около ${round(kcal + 250, 50)} kcal дневно).`, round(kcal + 250, 50));
    if (rate > 1) return result('fast', `Покачването е над 1 кг седмично — с 200 kcal по-малко (около ${round(kcal - 200, 50)} kcal дневно).`, round(kcal - 200, 50));
    return result('ok', `Теглото се покачва по плана: ${kg(change)} за ${Math.round(weeks)} седмици (очаквано ${kg(expected)}) — продължете.`);
  }
  if (change >= 2) return result('up', `Теглото е ${kg(change)} — намалете порциите от хляб, ориз и мазнини.`);
  if (change <= -2) return result('down', `Теглото е ${kg(change)} — ако загубата не е желана, добавете порция пълнозърнести храни или ядки.`);
  return result('ok', `Теглото е стабилно (${kg(change)}) — колебанията до ±1 кг са нормални.`);
}
