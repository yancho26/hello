/* Персонален хранителен режим за възрастни.
 *
 * Изчисления:
 *   • основен метаболизъм по Mifflin–St Jeor и енергоразход по физическа активност;
 *   • енергиен прием според целта (отслабване ≈0,5 кг седмично, поддържане, покачване);
 *   • белтък в г/кг „референтно“ тегло (при затлъстяване — коригирано тегло);
 *   • мазнини, въглехидрати, фибри, наситени мазнини, свободни захари, сол, течности.
 *
 * Правилата по заболявания следват: ESC 2024 (хипертония — сол <5 г,
 * DASH/средиземноморски тип), ESC/EASD 2023 и ADA 2025 (диабет), KDIGO 2024
 * (ХБЗ — белтък 0,8 г/кг при G3–G5, калий и фосфор по нужда), EULAR (подагра),
 * ESPEN (възрастни — белтък 1,0–1,2 г/кг), СЗО (свободни захари <10% от енергията).
 *
 * Примерното меню е ориентировъчно, с храни от българската кухня. Стойностите
 * на храните са закръглени средни (на 100 г готов продукт).
 * Не е предназначено за бременност, кърмене, деца, хранителни разстройства и диализа.
 */

import { bmi as bmiOf } from './clinical.js';
import { table } from './table.js';

/* ---------------------------------- храни ---------------------------------- */

/* [име, ккал, белтък, въглехидрати, мазнини, фибри, натрий мг, калий мг, флагове] на 100 г.
 * Флагове: gluten, lactose, meat, redmeat, fish, egg, nuts, highK, purine, salt, vitK, sweet, legume, soy */
const F = (name, kcal, p, c, f, fib, na, k, flags = '', unit = null) =>
  ({ name, kcal, p, c, f, fib, na, k, flags: new Set(flags.split(' ').filter(Boolean)), unit });

export const FOODS = table({
  oats: F('овесени ядки', 379, 13, 68, 6.5, 10, 6, 360, 'gluten'),
  buckwheat: F('елда, сварена', 92, 3.4, 20, 0.6, 2.7, 4, 88),
  bread: F('пълнозърнест хляб', 250, 10, 43, 3.5, 7, 450, 250, 'gluten salt'),
  gfbread: F('безглутенов хляб', 250, 4, 45, 6, 5, 450, 120),
  milk: F('прясно мляко 1,5%', 46, 3.4, 4.8, 1.5, 0, 45, 150, 'lactose'),
  lfmilk: F('мляко без лактоза', 46, 3.4, 4.8, 1.5, 0, 45, 150),
  yogurt: F('кисело мляко 2%', 60, 3.5, 4.7, 2, 0, 50, 170, 'lactose'),
  lfyogurt: F('кисело мляко без лактоза', 60, 3.5, 4.7, 2, 0, 50, 170),
  cottage: F('извара', 98, 11, 3.4, 4.3, 0, 360, 100, 'lactose'),
  whitecheese: F('бяло саламурено сирене', 260, 17, 1, 21, 0, 1100, 60, 'lactose salt'),
  egg: F('яйца', 143, 12.6, 0.7, 9.5, 0, 140, 138, 'egg', { name: 'бр.', grams: 55 }),
  walnuts: F('орехи', 654, 15, 14, 65, 7, 2, 440, 'nuts'),
  almonds: F('бадеми', 579, 21, 22, 50, 12, 1, 730, 'nuts highK'),
  oil: F('зехтин', 884, 0, 0, 100, 0, 2, 1, '', { name: 'с.л.', grams: 10 }),
  apple: F('ябълка', 52, 0.3, 14, 0.2, 2.4, 1, 107, '', { name: 'бр.', grams: 150 }),
  pear: F('круша', 57, 0.4, 15, 0.1, 3.1, 1, 116, '', { name: 'бр.', grams: 160 }),
  orange: F('портокал', 47, 0.9, 12, 0.1, 2.4, 0, 181, 'highK', { name: 'бр.', grams: 180 }),
  banana: F('банан', 89, 1.1, 23, 0.3, 2.6, 1, 358, 'highK sweet', { name: 'бр.', grams: 120 }),
  berries: F('ягоди / горски плодове', 32, 0.7, 7.7, 0.3, 2, 1, 153),
  tomato: F('домати', 18, 0.9, 3.9, 0.2, 1.2, 5, 237, 'highK'),
  cucumber: F('краставици', 15, 0.7, 3.6, 0.1, 0.5, 2, 147),
  pepper: F('чушки', 26, 1, 6, 0.3, 2, 4, 211),
  lettuce: F('зелена салата', 15, 1.4, 2.9, 0.2, 1.3, 28, 194, 'vitK'),
  spinach: F('спанак', 23, 2.9, 3.6, 0.4, 2.2, 79, 558, 'highK vitK'),
  broccoli: F('броколи', 34, 2.8, 7, 0.4, 2.6, 33, 316, 'vitK'),
  zucchini: F('тиквички', 17, 1.2, 3.1, 0.3, 1, 8, 261),
  carrot: F('моркови', 41, 0.9, 10, 0.2, 2.8, 69, 320),
  cabbage: F('зеле', 25, 1.3, 5.8, 0.1, 2.5, 18, 170, 'vitK'),
  greenbeans: F('зелен фасул', 31, 1.8, 7, 0.2, 2.7, 6, 211),
  cauliflower: F('карфиол', 25, 1.9, 5, 0.3, 2, 30, 299),
  potato: F('картофи, варени', 87, 1.9, 20, 0.1, 1.8, 4, 379, 'highK'),
  rice: F('кафяв ориз, сварен', 112, 2.3, 24, 0.8, 1.8, 5, 79),
  bulgur: F('булгур, сварен', 83, 3.1, 19, 0.2, 4.5, 5, 68, 'gluten'),
  pasta: F('пълнозърнести макарони, сварени', 124, 5.3, 26, 0.5, 4.5, 3, 62, 'gluten'),
  lentils: F('леща, сварена', 116, 9, 20, 0.4, 8, 2, 369, 'legume highK'),
  beans: F('боб, сварен', 127, 8.7, 23, 0.5, 6.4, 2, 405, 'legume highK'),
  chickpeas: F('нахут, сварен', 164, 8.9, 27, 2.6, 7.6, 7, 291, 'legume'),
  chicken: F('пилешко филе, печено', 165, 31, 0, 3.6, 0, 74, 256, 'meat'),
  turkey: F('пуешко филе, печено', 135, 30, 0, 1, 0, 60, 290, 'meat'),
  beef: F('постно телешко, задушено', 170, 26, 0, 7, 0, 60, 330, 'meat redmeat purine'),
  hake: F('хек, печен', 90, 19, 0, 1.3, 0, 90, 350, 'fish'),
  trout: F('пъстърва, печена', 150, 21, 0, 6.6, 0, 55, 450, 'fish highK'),
  mackerel: F('скумрия, печена', 205, 19, 0, 14, 0, 90, 340, 'fish'),
  tofu: F('тофу', 76, 8, 1.9, 4.8, 0.3, 7, 121, 'soy'),
});

/* ------------------------------ ястия (шаблони) ------------------------------ */

/* Основни порции за едно ястие; мащабират се към енергията на храненето.
 * tags: какво насърчава ястието (lowgi, fish, legume, dash, lowk, lowprotein). */
const MEALS = [
  // Закуска
  { meal: 'breakfast', name: 'Овесена каша с мляко, ябълка и орехи', items: [['oats', 50], ['milk', 200], ['apple', 100], ['walnuts', 10]], tags: ['lowgi', 'fiber'] },
  { meal: 'breakfast', name: 'Кисело мляко с овесени ядки, горски плодове и бадеми', items: [['yogurt', 200], ['oats', 40], ['berries', 100], ['almonds', 10]], tags: ['lowgi', 'fiber'] },
  { meal: 'breakfast', name: 'Пълнозърнест хляб с яйца, домати и краставици', items: [['bread', 60], ['egg', 110], ['tomato', 100], ['cucumber', 100], ['oil', 5]], tags: ['lowgi'] },
  { meal: 'breakfast', name: 'Хляб с извара, краставици и чушки', items: [['bread', 60], ['cottage', 120], ['cucumber', 100], ['pepper', 80]], tags: ['lowgi', 'dash', 'lowk'] },
  { meal: 'breakfast', name: 'Елда с кисело мляко и горски плодове', items: [['buckwheat', 160], ['yogurt', 150], ['berries', 100], ['walnuts', 10]], tags: ['lowgi', 'fiber'] },
  { meal: 'breakfast', name: 'Хляб с бяло сирене и домати', items: [['bread', 60], ['whitecheese', 40], ['tomato', 150], ['cucumber', 100]], tags: [] },
  // Междинно
  { meal: 'snack', name: 'Ябълка и орехи', items: [['apple', 150], ['walnuts', 15]], tags: ['lowgi', 'lowk'] },
  { meal: 'snack', name: 'Кисело мляко с горски плодове', items: [['yogurt', 150], ['berries', 100]], tags: ['lowgi', 'dash'] },
  { meal: 'snack', name: 'Круша и бадеми', items: [['pear', 160], ['almonds', 10]], tags: ['lowgi', 'fiber'] },
  { meal: 'snack', name: 'Моркови и краставици със извара', items: [['carrot', 100], ['cucumber', 100], ['cottage', 80]], tags: ['lowgi', 'lowk'] },
  { meal: 'snack', name: 'Портокал и бадеми', items: [['orange', 180], ['almonds', 10]], tags: ['lowgi'] },
  { meal: 'snack', name: 'Банан с кисело мляко', items: [['banana', 120], ['yogurt', 100]], tags: [] },
  // Обяд
  { meal: 'lunch', name: 'Пилешко филе със зеленчуци на фурна и булгур', items: [['chicken', 120], ['zucchini', 150], ['pepper', 100], ['bulgur', 120], ['oil', 10], ['lettuce', 50]], tags: ['lowgi', 'dash', 'lowk'] },
  { meal: 'lunch', name: 'Леща с моркови и домати, салата от краставици', items: [['lentils', 250], ['carrot', 80], ['tomato', 80], ['oil', 10], ['bread', 40], ['cucumber', 100]], tags: ['lowgi', 'legume', 'fiber', 'dash'] },
  { meal: 'lunch', name: 'Хек на фурна с картофи и зелена салата', items: [['hake', 150], ['potato', 150], ['lettuce', 60], ['oil', 10]], tags: ['fish', 'dash'] },
  { meal: 'lunch', name: 'Боб чорба и салата от зеле и моркови', items: [['beans', 200], ['carrot', 50], ['cabbage', 150], ['oil', 10], ['bread', 40]], tags: ['lowgi', 'legume', 'fiber'] },
  { meal: 'lunch', name: 'Пуешко с кафяв ориз и броколи', items: [['turkey', 120], ['rice', 130], ['broccoli', 150], ['oil', 10]], tags: ['lowgi', 'dash', 'lowk'] },
  { meal: 'lunch', name: 'Нахут със зеленчуци и кафяв ориз', items: [['chickpeas', 150], ['zucchini', 100], ['pepper', 100], ['rice', 100], ['oil', 10]], tags: ['lowgi', 'legume', 'fiber'] },
  { meal: 'lunch', name: 'Тофу със зеленчуци и елда', items: [['tofu', 150], ['broccoli', 100], ['carrot', 80], ['buckwheat', 150], ['oil', 10]], tags: ['lowgi', 'lowk'] },
  { meal: 'lunch', name: 'Задушено телешко с картофи и салата', items: [['beef', 120], ['potato', 150], ['cabbage', 100], ['oil', 10]], tags: [] },
  { meal: 'lunch', name: 'Пълнозърнести макарони с тиквички и пилешко', items: [['pasta', 150], ['chicken', 90], ['zucchini', 150], ['oil', 10]], tags: ['lowk'] },
  // Вечеря
  { meal: 'dinner', name: 'Салата от домати и краставици с яйца', items: [['egg', 110], ['tomato', 150], ['cucumber', 150], ['oil', 10], ['bread', 30]], tags: ['lowgi'] },
  { meal: 'dinner', name: 'Пъстърва със зеленчуци на пара', items: [['trout', 150], ['broccoli', 150], ['carrot', 100], ['oil', 5]], tags: ['fish', 'lowgi', 'dash'] },
  { meal: 'dinner', name: 'Скумрия на фурна със зелена салата', items: [['mackerel', 120], ['lettuce', 100], ['cucumber', 100], ['oil', 5], ['bread', 30]], tags: ['fish', 'lowgi'] },
  { meal: 'dinner', name: 'Зеленчукова супа и извара', items: [['zucchini', 150], ['carrot', 80], ['potato', 80], ['oil', 5], ['cottage', 100]], tags: ['dash'] },
  { meal: 'dinner', name: 'Пилешка салата', items: [['chicken', 100], ['lettuce', 100], ['cucumber', 100], ['pepper', 80], ['oil', 10], ['bread', 30]], tags: ['lowgi', 'lowk'] },
  { meal: 'dinner', name: 'Задушен зелен фасул с кисело мляко', items: [['greenbeans', 250], ['tomato', 80], ['oil', 10], ['yogurt', 150]], tags: ['lowgi', 'fiber', 'dash'] },
  { meal: 'dinner', name: 'Карфиол на фурна с яйце', items: [['cauliflower', 250], ['egg', 55], ['oil', 10], ['bread', 30]], tags: ['lowgi', 'lowk'] },
  { meal: 'dinner', name: 'Тиквички с извара на фурна', items: [['zucchini', 250], ['cottage', 120], ['egg', 55], ['oil', 5]], tags: ['lowgi', 'lowk'] },
];

export const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Закуска', share: 0.25 },
  { id: 'snack1', meal: 'snack', label: 'Междинно хранене', share: 0.10 },
  { id: 'lunch', label: 'Обяд', share: 0.35 },
  { id: 'snack2', meal: 'snack', label: 'Следобедна закуска', share: 0.10 },
  { id: 'dinner', label: 'Вечеря', share: 0.20 },
];

export const ACTIVITY = table({
  sedentary: { label: 'заседнал (без спорт)', factor: 1.2 },
  light: { label: 'лека активност (1–3 пъти седмично)', factor: 1.375 },
  moderate: { label: 'умерена активност (3–5 пъти седмично)', factor: 1.55 },
  active: { label: 'висока активност (6–7 пъти седмично)', factor: 1.725 },
});

export const GOALS = table({
  lose: 'отслабване',
  maintain: 'поддържане на теглото',
  gain: 'покачване на теглото',
});

export const PREFERENCES = table({
  vegetarian: 'вегетарианско (с яйца и млечни)',
  noFish: 'без риба',
  glutenFree: 'без глутен (цьолиакия)',
  lactoseFree: 'без лактоза',
});

/* Замени при ограничения. */
const SUBSTITUTES = {
  glutenFree: { bread: 'gfbread', bulgur: 'buckwheat', pasta: 'rice', oats: 'buckwheat' },
  lactoseFree: { milk: 'lfmilk', yogurt: 'lfyogurt' },
};

/* --------------------------------- енергия --------------------------------- */

export function mifflinStJeor({ sex, age, weight, height }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'f' ? -161 : 5);
}

const round = (v, step = 1) => Math.round(v / step) * step;

/* ------------------------------- основен план ------------------------------- */

/**
 * @param {object} input  { sex, age, weight, height, waist, activity, goal, preferences: [],
 *                          conditions: Set, egfr, potassium, classes: Set (групи на лекарствата),
 *                          medNotes: [], variant }
 */
export function nutritionPlan(input) {
  const { sex, age, weight, height } = input;
  const warnings = [];
  if (!(age >= 18)) throw new Error('Хранителният режим е предназначен за възрастни (от 18 г.).');
  if (!(weight > 30 && weight < 350) || !(height > 120 && height < 230)) {
    throw new Error('Нужни са актуални тегло и ръст.');
  }
  const cond = input.conditions || new Set();
  const classes = input.classes || new Set();
  const prefs = new Set(input.preferences || []);
  const b = bmiOf(weight, height);
  const activity = ACTIVITY[input.activity] || ACTIVITY.sedentary;
  let goal = input.goal || (b >= 25 ? 'lose' : b < 18.5 ? 'gain' : 'maintain');
  if (goal === 'lose' && b < 22) {
    warnings.push('При ИТМ под 22 отслабване не се препоръчва — планът е за поддържане на теглото.');
    goal = 'maintain';
  }

  const ckd = input.egfr > 0 && input.egfr < 60;
  const ckdAdvanced = input.egfr > 0 && input.egfr < 30;
  const diabetes = cond.has('dm2') || cond.has('dm1') || cond.has('prediabetes');
  const cardio = ['htn', 'chd', 'pad', 'stroke', 'hf', 'dyslip'].some(c => cond.has(c));
  const onRaas = ['ACEI', 'ARB', 'ARNI', 'MRA'].some(c => classes.has(c));
  const limitK = (input.egfr > 0 && input.egfr < 45 && onRaas) || input.potassium >= 5.0 || ckdAdvanced;

  // Енергия.
  const bmr = mifflinStJeor({ sex, age, weight, height });
  const tdee = bmr * activity.factor;
  let target = tdee;
  if (goal === 'lose') target = tdee - 500;
  if (goal === 'gain') target = tdee + 300;
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
  let proteinNote = 'Обичайна нужда за възрастни.';
  if (age >= 65) { proteinPerKg = 1.1; proteinNote = 'ESPEN: 1,0–1,2 г/кг при 65+ г. — срещу загуба на мускулна маса.'; }
  if (goal === 'lose') { proteinPerKg = Math.max(proteinPerKg, 1.1); proteinNote = 'По-висок белтък при отслабване запазва мускулната маса.'; }
  if (ckd) { proteinPerKg = 0.8; proteinNote = 'KDIGO 2024: 0,8 г/кг при ХБЗ G3–G5 без диализа; да не се превишава 1,3 г/кг.'; }
  const protein = round(proteinPerKg * refWeight);

  const fatPct = diabetes ? 35 : 32;
  const fat = round((target * fatPct / 100) / 9);
  const carbs = round((target - protein * 4 - fat * 9) / 4);
  const fiber = Math.max(25, round((target / 1000) * 14));
  const satFatPct = (cardio || diabetes) ? 7 : 10;
  const satFat = round((target * satFatPct / 100) / 9);
  const sugarMax = round((target * 0.10) / 4);
  let fluids = Math.min(3000, Math.max(1500, round(weight * 30, 100)));

  const targets = {
    kcal: target, protein, fat, carbs, fiber, satFat, sugarMax,
    salt: 5, fluids,
    proteinPerKg, proteinNote, fatPct, satFatPct,
    carbPct: Math.round((carbs * 4 / target) * 100),
  };

  // Принципи и правила.
  const prefer = [];
  const limit = [];
  const avoid = [];
  const notes = [];

  prefer.push('Зеленчуци на всяко хранене — поне 400 г зеленчуци и плодове дневно.');
  prefer.push('Пълнозърнести храни, бобови, ядки, зехтин; риба 1–2 пъти седмично.');
  limit.push('Сол под 5 г дневно (СЗО, ESC): внимание с хляба, саламурените сирена, колбасите и готовите храни.');
  limit.push(`Свободни захари под ${sugarMax} г дневно (10% от енергията, идеално под 5%): сладкиши, подсладени напитки, сокове.`);
  limit.push('Преработено и червено месо; пържени храни.');
  notes.push('Алкохол: колкото по-малко, толкова по-добре — безопасно количество няма (СЗО).');

  if (cond.has('htn')) {
    prefer.push('Хипертония: DASH/средиземноморски тип — зеленчуци, плодове, нискомаслени млечни, бобови, ядки.');
    if (!limitK) prefer.push('Храни, богати на калий (зеленчуци, бобови, плодове), понижават налягането.');
    limit.push('Хипертония: сол под 5 г; кафе — до 3–4 чаши; алкохол — възможно най-малко.');
  }
  if (diabetes) {
    prefer.push('Диабет: въглехидрати с нисък гликемичен индекс, равномерно разпределени през деня; зеленчуците — първи в чинията.');
    limit.push('Диабет: бял хляб, бял ориз, картофено пюре, сладки плодове и сокове; плодовете — по 1 порция наведнъж.');
    avoid.push('Подсладени напитки и сокове (освен за овладяване на хипогликемия).');
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
    notes.push('Реалистична цел: 5–10% от теглото за 6 месеца (около 0,5 кг седмично).');
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
  if (prefs.has('vegetarian')) notes.push('Вегетарианско хранене: витамин B12 — от млечни и яйца или добавка; желязо с витамин C.');
  if (classes.has('METFORMIN')) notes.push('Метформин: при продължителен прием — периодично изследване на витамин B12.');
  if (prefs.has('glutenFree')) avoid.push('Цьолиакия: пшеница, ръж, ечемик и храни с тях; овесът — само сертифициран без глутен.');
  if (prefs.has('lactoseFree')) notes.push('Без лактоза: млечни продукти без лактоза; твърдите отлежали сирена обикновено се понасят.');

  // Меню.
  const excluded = (tpl) => {
    const foods = tpl.items.map(([id]) => FOODS[id]);
    const flags = new Set(foods.flatMap(f => [...f.flags]));
    if (prefs.has('vegetarian') && (flags.has('meat') || flags.has('fish'))) return true;
    if (prefs.has('noFish') && flags.has('fish')) return true;
    if (prefs.has('lactoseFree') && tpl.items.some(([id]) => (id === 'cottage' || id === 'whitecheese'))) return true;
    if (limitK && tpl.items.some(([id, g]) => FOODS[id].flags.has('highK') && g >= 80)) return true;
    if (cond.has('gout') && flags.has('purine')) return true;
    if ((cond.has('htn') || cond.has('hf') || ckd) && flags.has('salt') && tpl.items.some(([id]) => id === 'whitecheese')) return true;
    if (diabetes && flags.has('sweet')) return true;
    return false;
  };
  const score = (tpl) => {
    let s = 0;
    if (diabetes && tpl.tags.includes('lowgi')) s += 2;
    if (cardio && (tpl.tags.includes('fish') || tpl.tags.includes('dash'))) s += 2;
    if (cond.has('htn') && tpl.tags.includes('dash')) s += 1;
    if ((diabetes || cond.has('dyslip')) && (tpl.tags.includes('legume') || tpl.tags.includes('fiber'))) s += 1;
    if (limitK && tpl.tags.includes('lowk')) s += 2;
    return s;
  };

  const variant = Number(input.variant) || 0;
  const usedTemplates = new Set();
  const meals = MEAL_SLOTS.map((slot) => {
    const kind = slot.meal || slot.id;
    const pool = MEALS.filter(t => t.meal === kind && !excluded(t))
      .map((t, i) => ({ t, s: score(t), i }))
      .sort((a, b) => b.s - a.s || a.i - b.i);
    if (!pool.length) return { ...slot, kcal: round(target * slot.share, 10), options: [] };
    // Вариантите разместват избора; едно и също ястие не се повтаря в деня.
    const rotated = [...pool.slice(variant % pool.length), ...pool.slice(0, variant % pool.length)];
    const fresh = rotated.filter(x => !usedTemplates.has(x.t.name));
    const picks = (fresh.length >= 2 ? fresh : rotated).slice(0, 2);
    for (const p of picks) usedTemplates.add(p.t.name);
    const kcal = round(target * slot.share, 10);
    return { ...slot, kcal, options: picks.map(p => buildMeal(p.t, kcal, prefs, { lowerCarb: diabetes })) };
  });

  // Белтъкът в менюто се приближава до целта: при ХБЗ — строго (до ~5% над нея),
  // иначе само ако е много над нужното (над 40%). Енергията се възстановява с
  // храни без много белтък.
  {
    const split = (o) => o.items.reduce((acc, it) => {
      const pr = FOODS[it.food].p * it.grams / 100;
      if (PROTEIN_FOODS.has(it.food)) acc.rich += pr; else acc.other += pr;
      return acc;
    }, { rich: 0, other: 0 });
    const sum = meals.reduce((acc, m) => {
      const o = m.options[0];
      if (o) { const x = split(o); acc.rich += x.rich; acc.other += x.other; }
      return acc;
    }, { rich: 0, other: 0 });
    const [limit, aim] = ckd ? [1.1, 1.0] : [1.4, 1.25];
    if (sum.rich + sum.other > protein * limit && sum.rich > 0) {
      const ratio = Math.max(0.35, Math.min(1, (protein * aim - sum.other) / sum.rich));
      for (const m of meals) m.options = m.options.map(o => rebalance(scaleProtein(o, ratio), m.kcal));
      if (ckd) notes.push('Порциите на месо, риба, яйца, млечни и бобови в менюто са намалени заради ограничението на белтъка.');
    }
  }

  const day = meals.reduce((s, m) => {
    const o = m.options[0];
    if (!o) return s;
    s.kcal += o.kcal; s.protein += o.protein; s.carbs += o.carbs; s.fat += o.fat; s.fiber += o.fiber; s.na += o.na;
    return s;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, na: 0 });
  for (const k of Object.keys(day)) day[k] = Math.round(day[k]);

  return {
    input: {
      sex, age, weight, height, waist: input.waist || null, activity: input.activity || 'sedentary',
      goal, preferences: [...prefs], egfr: input.egfr || null,
    },
    bmi: Math.round(b * 10) / 10,
    energy: { bmr: Math.round(bmr), tdee: Math.round(tdee), target, activityFactor: activity.factor },
    refWeight: Math.round(refWeight),
    targets,
    prefer, limit, avoid, notes,
    medNotes: input.medNotes || [],
    warnings,
    meals,
    day,
    flags: { limitK, ckd, ckdAdvanced, diabetes },
  };
}

function portionText(foodId, grams, maxPieces = 3) {
  const f = FOODS[foodId];
  if (f.unit && f.unit.name === 'бр.') {
    const n = Math.min(maxPieces, Math.max(1, Math.round(grams / f.unit.grams)));
    return { grams: n * f.unit.grams, text: `${f.name} — ${n} ${f.unit.name} (≈${n * f.unit.grams} г)` };
  }
  if (f.unit && f.unit.name === 'с.л.') {
    const g = Math.max(5, round(grams, 5));
    return { grams: g, text: `${f.name} — ${g} г (≈${String(g / f.unit.grams).replace('.', ',')} с.л.)` };
  }
  const g = grams >= 100 ? round(grams, 10) : Math.max(5, round(grams, 5));
  const liquid = foodId === 'milk' || foodId === 'lfmilk';
  return { grams: g, text: `${f.name} — ${g} ${liquid ? 'мл' : 'г'}` };
}

function totals(items) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, na: 0 };
  for (const it of items) {
    const f = FOODS[it.food];
    const k = it.grams / 100;
    t.kcal += f.kcal * k; t.protein += f.p * k; t.carbs += f.c * k; t.fat += f.f * k; t.fiber += f.fib * k; t.na += f.na * k;
  }
  for (const k of Object.keys(t)) t[k] = Math.round(t[k]);
  return t;
}

/* Как се преименува ястието при замяна на съставка. */
const RENAME = {
  oats: [['Овесена каша', 'Каша от елда'], ['овесени ядки', 'елда']],
  bulgur: [['булгур', 'елда']],
  pasta: [['Пълнозърнести макарони', 'Кафяв ориз']],
  bread: [['Пълнозърнест хляб', 'Безглутенов хляб']],
};

/* Нишестени храни — при диабет порциите им се намаляват в полза на зеленчуци, белтък и зехтин. */
const STARCH = new Set(['bread', 'gfbread', 'oats', 'buckwheat', 'rice', 'bulgur', 'pasta', 'potato', 'lentils', 'beans', 'chickpeas']);

function buildMeal(tpl, kcal, prefs, { lowerCarb = false } = {}) {
  let name = tpl.name;
  let items = tpl.items.map(([id, g]) => {
    let food = id;
    for (const [pref, map] of Object.entries(SUBSTITUTES)) {
      if (prefs.has(pref) && map[food]) {
        for (const [from, to] of RENAME[food] || []) name = name.replace(from, to);
        food = map[food];
      }
    }
    // Заместителят е със същата енергия, а не със същия грамаж (напр. сухи ядки → варена елда).
    const grams = food === id ? g : g * FOODS[id].kcal / FOODS[food].kcal;
    return { food, grams };
  });
  // Плодовете остават по брой както в ястието (един плод е една порция); мащабират се останалите.
  const fruit = (it) => FOODS[it.food].unit?.name === 'бр.' && it.food !== 'egg';
  const starch = (it) => lowerCarb && STARCH.has(it.food);
  const fruitKcal = totals(items.filter(fruit)).kcal;
  const baseFactor = (kcal - fruitKcal) / (totals(items.filter(it => !fruit(it))).kcal || 1);
  // При диабет нишестето е 70% от обичайната порция и не расте над нея; енергията
  // се допълва от зеленчуци, белтък и зехтин.
  const starchFactor = 0.7 * Math.min(1, baseFactor);
  const starchKcal = totals(items.filter(starch).map(it => ({ ...it, grams: it.grams * starchFactor }))).kcal;
  const rest = totals(items.filter(it => !fruit(it) && !starch(it))).kcal || 1;
  const factor = Math.min(1.8, Math.max(0.5, (kcal - fruitKcal - starchKcal) / rest));
  items = items.map(it => {
    const p = fruit(it)
      ? portionText(it.food, it.grams, Math.max(1, Math.round(it.grams / FOODS[it.food].unit.grams)))
      : portionText(it.food, it.grams * (starch(it) ? starchFactor : factor));
    return { food: it.food, grams: p.grams, text: p.text };
  });
  return { name, items, ...totals(items) };
}

// Декларира се преди употреба в nutritionPlan чрез hoisting на функциите по-долу.
const PROTEIN_FOODS = new Set(['chicken', 'turkey', 'beef', 'hake', 'trout', 'mackerel', 'egg', 'cottage', 'whitecheese', 'tofu', 'lentils', 'beans', 'chickpeas', 'yogurt', 'lfyogurt', 'milk', 'lfmilk']);

/* Връща енергията на ястието към целта чрез храните без много белтък. */
function rebalance(option, kcal) {
  const other = option.items.filter(it => !PROTEIN_FOODS.has(it.food) && !(FOODS[it.food].unit?.name === 'бр.'));
  const otherKcal = totals(other).kcal;
  if (!otherKcal) return option;
  const fixedKcal = option.kcal - otherKcal;
  const factor = Math.min(1.6, Math.max(0.8, (kcal - fixedKcal) / otherKcal));
  const items = option.items.map(it => {
    if (!other.includes(it)) return it;
    const p = portionText(it.food, it.grams * factor);
    return { food: it.food, grams: p.grams, text: p.text };
  });
  return { ...option, items, ...totals(items) };
}

function scaleProtein(option, ratio) {
  const items = option.items.map(it => {
    if (!PROTEIN_FOODS.has(it.food)) return it;
    const p = portionText(it.food, it.grams * ratio);
    return { food: it.food, grams: p.grams, text: p.text };
  });
  return { ...option, items, ...totals(items) };
}
