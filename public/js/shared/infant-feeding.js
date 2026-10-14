/* Хранене на кърмачето от раждането до 1 година: колко пъти на ден и по колко, кога и как
 * се въвеждат храните, примерен ден за всеки месец и очакваният растеж.
 *
 * Източници (всяко правило е с източника до него):
 *  - НЦОЗА 2013 — „Основи на здравословното хранене на деца до 3-годишна възраст.
 *    Ръководство за здравни специалисти“ (Петрова, Дулева, Рангелова): количествата адаптирано
 *    мляко (формулата за първата седмица, 150 мл/кг, таблица 8 по СЗО 2006), захранването
 *    (таблици 9 и 10, примерните режими по месеци).
 *  - FAO/WHO/UNU 2004 — Human energy requirements, таблица 3.2: енергия = разход
 *    (−99,4 + 88,6 × кг) + енергия за растежа по месеци.
 *  - СЗО 2009 — Infant and young child feeding, Model chapter: кърмене при поискване, поне 8 пъти
 *    на 24 ч. през първите 8 седмици и 5–6 след това; рожденото тегло се възстановява до 2 седмици;
 *    6 и повече мокри пелени.
 *  - NICE NG75 (2017): загуба над 10% от рожденото тегло или невъзстановено тегло до 3 седмици —
 *    оценка; спадът спира около 3–4 ден.
 *  - ESPGHAN 2017 (Fewtrell и съавт.): захранване не преди 4 и не след 6 месеца; алергенните храни
 *    не се отлагат; глутен между 4 и 12 месеца; без мед, сол и захар; кравето мляко не е основна
 *    напитка преди 12 месеца; храни на бучки до 8–10 месеца; чаша до 12 месеца.
 *  - ESPGHAN 2013 (Braegger и съавт.): витамин D 400 IU дневно през първата година.
 *  - AAP (HealthyChildren 2022): до около 960 мл адаптирано мляко на 24 ч.
 *  - СЗО: растежни стандарти (тегло и дължина за възраст) — чрез growth.js. */

import { addDays, ageInMonthsExact, daysBetween, today } from './dates.js';
import { growthAge, isPreterm, lmsAt, percentileFromZ, valueAtZ, zScore } from './growth.js';
import { table } from './table.js';

export const FEEDING_TYPES = table({
  breast: { label: 'кърмене', short: 'кърма' },
  formula: { label: 'адаптирано мляко', short: 'адаптирано мляко' },
  mixed: { label: 'смесено — кърма и адаптирано мляко', short: 'кърма и адаптирано мляко' },
});

/** Кога да започне захранването — в навършени месеци. ESPGHAN 2017: не преди 4, не след 6. */
export const SOLIDS_START = table({
  4: 'от 4 навършени месеца (17 седмици)',
  5: 'от 5 навършени месеца (150 дни — примерът на НЦОЗА)',
  6: 'от 6 навършени месеца (СЗО)',
});

export const PLAN_MONTHS = 12;

/* FAO/WHO/UNU 2004, таблица 3.2 — енергия за растежа (kcal/ден) по месеци 0–1 … 11–12. */
const DEPOSITION = {
  m: [211, 183, 139, 53, 45, 36, 17, 16, 14, 21, 21, 22],
  f: [178, 161, 134, 68, 57, 47, 20, 17, 15, 18, 15, 14],
};

/** Енергийна потребност (kcal/ден) по FAO/WHO/UNU 2004 за пол, навършени месеци и тегло. */
export function energyNeed(sex, months, kg) {
  const dep = DEPOSITION[sex === 'f' ? 'f' : 'm'][Math.max(0, Math.min(11, Math.floor(months)))];
  return Math.round(-99.4 + 88.6 * kg + dep);
}

/* НЦОЗА 2013, таблица 8 (по СЗО 2006): брой хранения и мл на хранене до 6 месеца. */
const MILK_TABLE = [
  { to: 1, feeds: 8, ml: 60 },
  { to: 2, feeds: 7, ml: 90 },
  { to: 4, feeds: 6, ml: 120 },
  { to: 6, feeds: 6, ml: 150 },
];
const ML_PER_KG = 150;         // НЦОЗА 2013 — за родените с тегло 2500 г и повече
const KCAL_PER_ML = 0.67;      // НЦОЗА 2013 — адаптираните млека дават 670–680 kcal на литър
const MAX_FORMULA = 960;       // AAP — около 32 унции на 24 ч.
const DAILY_MILK_6_12 = 500;   // НЦОЗА 2013 / Наредба № 2 — мляко на ден при захранено кърмаче

/* Порция храна на едно хранене при захранването (НЦОЗА 2013, таблица 9 и примерите) и мляко на прием. */
const PORTION = (m) => (m <= 5 ? 160 : m === 6 ? 170 : m === 7 ? 180 : m <= 10 ? 190 : 200);

/* Групите храни и кога се въвеждат — НЦОЗА 2013, таблица 10 („през N-ия месец“ = N−1 навършени).
 * Храна не се въвежда преди началото на захранването. allergen — ESPGHAN 2017: не се отлага. */
export const FOOD_GROUPS = [
  { id: 'veg', label: 'Зеленчуци (пюре — картоф, тиквичка, морков, грах, зелен фасул)', from: 4, to: 5, color: 'green' },
  { id: 'cereal', label: 'Зърнени каши без глутен, обогатени с желязо (ориз, царевица)', from: 4, to: 5, color: 'amber' },
  { id: 'water', label: 'Вода — с началото на захранването', from: 4, to: 5, color: 'sky' },
  { id: 'fruit', label: 'Плодове (пюре, после намачкани)', from: 5, to: 6, color: 'coral' },
  { id: 'yolk', label: 'Яйчен жълтък, твърдо сварен (¼, после ½ и 1)', from: 5, to: 5, color: 'amber', allergen: true },
  { id: 'meat', label: 'Месо — пилешко, пуешко, заешко, агнешко, телешко, свинско', from: 6, to: 6, color: 'rose' },
  { id: 'oil', label: 'Масло и растителни масла в пюретата', from: 6, to: 6, color: 'teal' },
  { id: 'gluten', label: 'Зърнени храни с глутен (каши, грис, макарони)', from: 6, to: 7, color: 'amber', allergen: true },
  { id: 'bread', label: 'Сухар и хляб, попара', from: 6, to: 7, color: 'amber', allergen: true },
  { id: 'fish', label: 'Риба (бяла риба, после скумрия, пъстърва)', from: 7, to: 7, color: 'sky', allergen: true },
  { id: 'cheese', label: 'Сирене и извара (изкиснато сирене)', from: 7, to: 7, color: 'brand', allergen: true },
  { id: 'yogurt', label: 'Краве кисело мляко като част от ястията', from: 7, to: 8, color: 'brand', allergen: true },
  { id: 'legumes', label: 'Бобови — лющена леща и лющен боб (пюре)', from: 7, to: 9, color: 'green' },
  { id: 'finger', label: 'Храни за ядене с пръсти — коричка хляб, сухар, меки парченца плод и зеленчук', from: 9, to: 11, color: 'coral' },
];

const TEXTURE = (m, start) => {
  if (m < start) return null;
  if (m <= 5) return 'фино смляно, гладко пюре (частици до 0,5 мм), с лъжичка';
  if (m === 6) return 'фино смляно пюре, частици 0,5–2 мм';
  if (m <= 8) return 'ситно смляно пюре (до 5 мм); меките плодове — намачкани; постепенно — на малки бучки';
  return 'смляно и накълцано, парченца 8–10 мм; храни за ядене с пръсти';
};

/* ----------------------------------- растеж ----------------------------------- */

const Z_P3 = -1.8808;
const Z_P97 = 1.8808;

/** Тегло и дължина при z-скор на възрастта (СЗО). */
function atZ(sex, months, zWeight, zLength) {
  const w = lmsAt('weight', sex, months);
  const l = lmsAt('height', sex, months);
  return {
    weight: w ? Math.round(valueAtZ(w, zWeight) * 100) / 100 : null,
    weightMedian: w ? Math.round(w.M * 100) / 100 : null,
    weightP3: w ? Math.round(valueAtZ(w, Z_P3) * 100) / 100 : null,
    weightP97: w ? Math.round(valueAtZ(w, Z_P97) * 100) / 100 : null,
    length: l ? Math.round(valueAtZ(l, zLength) * 10) / 10 : null,
    lengthMedian: l ? Math.round(l.M * 10) / 10 : null,
    lengthP3: l ? Math.round(valueAtZ(l, Z_P3) * 10) / 10 : null,
    lengthP97: l ? Math.round(valueAtZ(l, Z_P97) * 10) / 10 : null,
  };
}

/** Последното измерване на показател (тегло или дължина) с възрастта при него. */
function latest(measurements, key, birthDate, gestWeeks) {
  const rows = (measurements || []).filter(m => m && m[key] > 0 && m.date >= birthDate).sort((a, b) => (a.date < b.date ? -1 : 1));
  const m = rows[rows.length - 1];
  if (!m) return null;
  const age = growthAge(ageInMonthsExact(birthDate, m.date), gestWeeks);
  return { value: Number(m[key]), date: m.date, months: age.months, beforeTerm: age.beforeTerm };
}

/* ----------------------------------- план ----------------------------------- */

/**
 * План за хранене до 1 година.
 * input: { sex, birthDate, asOf, birth: { weight, height, gestWeeks }, measurements, feeding: 'breast'|'formula'|'mixed',
 *          solidsStart: 4|5|6, allergyRisk: bool }
 */
export function infantFeedingPlan(input) {
  const sex = input.sex === 'f' ? 'f' : 'm';
  const asOf = input.asOf || today();
  const birth = input.birth || {};
  const gestWeeks = Number(birth.gestWeeks) || null;
  const feeding = FEEDING_TYPES[input.feeding] ? input.feeding : 'breast';
  const solidsStart = [4, 5, 6].includes(Number(input.solidsStart)) ? Number(input.solidsStart) : 6;
  const preterm = isPreterm(gestWeeks);
  const ageDays = Math.max(0, daysBetween(input.birthDate, asOf));
  const chrono = ageInMonthsExact(input.birthDate, asOf);
  const age = growthAge(chrono, gestWeeks);
  const months = age.months; // за недоносено — коригираната възраст
  const birthWeight = Number(birth.weight) > 0 ? Number(birth.weight) : null;
  const warnings = [];
  const notes = [];

  if (preterm) {
    warnings.push(`Родено на ${gestWeeks} гестационна седмица: планът и растежът са по коригираната възраст. Количествата и обогатяването на храната при недоносено дете се определят индивидуално от неонатолога или педиатъра.`);
  }
  if (birthWeight && birthWeight < 2.5) {
    warnings.push('Тегло при раждане под 2500 г: изчислението 150 мл/кг на ден е за родените с нормално тегло (НЦОЗА 2013) — количествата се определят индивидуално.');
  }
  if (chrono >= PLAN_MONTHS) notes.push('Детето е навършило 1 година — планът е за първата година. След нея храненето преминава към общата семейна храна (НЦОЗА 2013).');

  // Растеж: „своята“ крива — по последното тегло и дължина, иначе по теглото при раждане, иначе медианата.
  const lastW = latest(input.measurements, 'weight', input.birthDate, gestWeeks);
  const lastL = latest(input.measurements, 'height', input.birthDate, gestWeeks);
  let zW = lastW && !lastW.beforeTerm ? zScore('weight', sex, lastW.months, lastW.value) : null;
  let zL = lastL && !lastL.beforeTerm ? zScore('height', sex, lastL.months, lastL.value) : null;
  let trackFrom = lastW && zW !== null ? 'measurement' : null;
  if (zW === null && birthWeight && !preterm) { zW = zScore('weight', sex, 0, birthWeight); trackFrom = 'birth'; }
  if (zL === null && Number(birth.height) > 0 && !preterm) zL = zScore('height', sex, 0, Number(birth.height));
  // Крайните стойности не се проектират напред — растежът към кривата е въпрос на оценка.
  const clampZ = (z) => (z === null ? 0 : Math.max(-3, Math.min(3, z)));
  const trackZW = clampZ(zW);
  const trackZL = clampZ(zL);
  if (!trackFrom) notes.push('Няма измерено тегло — очакваното тегло е по медианата на СЗО. Добавете измерване в раздел „Растеж“, за да се изчисли по кривата на детето.');

  const growthAt = (m) => atZ(sex, m, trackZW, trackZL);
  const currentWeight = lastW && daysBetween(lastW.date, asOf) <= 21 ? lastW.value : growthAt(Math.max(0, months)).weight;

  // Ранните дни: спадът на теглото и възстановяването му.
  const early = [];
  if (birthWeight && lastW && ageDays <= 28) {
    const loss = (birthWeight - lastW.value) / birthWeight;
    const daysAtLast = daysBetween(input.birthDate, lastW.date);
    if (loss > 0.10) early.push({ level: 'warn', text: `Загуба ${Math.round(loss * 100)}% от теглото при раждане — над 10%: клинична оценка и наблюдение на храненето (NICE NG75).` });
    if (lastW.value < birthWeight && daysAtLast > 14) {
      early.push({ level: daysAtLast > 21 ? 'warn' : 'info', text: `На ${daysAtLast} дни теглото е под рожденото. Повечето бебета го възстановяват до 2 седмици (СЗО 2009) и почти всички до 3 седмици (NICE NG75) — ${daysAtLast > 21 ? 'нужна е оценка' : 'следете теглото и храненето'}.` });
    }
  }

  const plan = [];
  const firstMonth = Math.max(0, Math.min(PLAN_MONTHS - 1, Math.floor(months)));
  for (let m = 0; m < PLAN_MONTHS; m++) plan.push(monthPlan(m, { sex, feeding, solidsStart, growthAt, birthWeight }));

  const now = currentStage({ months, ageDays, feeding, solidsStart, birthWeight, weight: currentWeight, sex, preterm, chrono });
  const zNowW = lastW && !lastW.beforeTerm ? zScore('weight', sex, lastW.months, lastW.value) : null;
  const zNowL = lastL && !lastL.beforeTerm ? zScore('height', sex, lastL.months, lastL.value) : null;

  return {
    input: { sex, birthDate: input.birthDate, asOf, feeding, solidsStart, allergyRisk: !!input.allergyRisk, gestWeeks, birthWeight },
    age: { days: ageDays, chronological: Math.round(chrono * 100) / 100, months: Math.round(months * 100) / 100, corrected: age.corrected, currentMonth: firstMonth },
    now,
    growth: {
      trackFrom,
      zWeight: zNowW === null ? null : Math.round(zNowW * 100) / 100,
      zLength: zNowL === null ? null : Math.round(zNowL * 100) / 100,
      percentileWeight: zNowW === null ? null : percentileFromZ(zNowW),
      percentileLength: zNowL === null ? null : percentileFromZ(zNowL),
      lastWeight: lastW, lastLength: lastL,
      at12: growthAt(12),
      atBirth: growthAt(0),
      early,
    },
    months: plan,
    foods: FOOD_GROUPS.map(g => ({ ...g, from: Math.max(g.from, solidsStart), to: Math.max(g.to, solidsStart) })),
    rules: rules(feeding, !!input.allergyRisk),
    readiness: READINESS,
    adequacy: adequacy(feeding, firstMonth),
    warnings,
    notes,
  };
}

/** Какво да яде детето сега. */
function currentStage({ months, ageDays, feeding, solidsStart, birthWeight, weight, sex, preterm, chrono }) {
  const m = Math.max(0, Math.min(11, Math.floor(months)));
  const kcal = weight ? energyNeed(sex, m, weight) : null;
  const out = { month: m, weight, kcal };
  // Първата седмица на адаптирано мляко: НЦОЗА 2013 — 70 (под 3200 г) или 80 мл × денят от живота.
  if (feeding !== 'breast' && ageDays < 7 && !preterm) {
    const n = ageDays + 1;
    const coef = birthWeight && birthWeight < 3.2 ? 70 : 80;
    const daily = coef * n;
    const perFeed = Math.round(daily / 7 / 5) * 5;
    const milk = `${feeding === 'mixed' ? 'Кърмене или адаптирано мляко' : 'Адаптирано мляко'} около ${perFeed} мл`;
    out.firstWeek = {
      day: n, coef, daily, feeds: 7, feedsText: '6–7', perFeed, every: '3–3,5 ч.',
      schedule: {
        orientation: 'първата седмица: 6–7 хранения през 3–3,5 часа (НЦОЗА 2013)',
        items: ['6:00', '9:30', '13:00', '16:30', '20:00', '23:30', '3:00'].map(time => ({ time, what: milk })),
      },
    };
  }
  if (chrono >= PLAN_MONTHS) out.done = true;
  return out;
}

/** Колко мляко и храна — за един месец (m навършени месеца). */
function monthPlan(m, { sex, feeding, solidsStart, growthAt }) {
  const start = growthAt(m);
  const end = growthAt(m + 1);
  const mid = (start.weight + end.weight) / 2;
  const solids = m >= solidsStart;
  const firstSolidMonth = m === solidsStart;
  // Хранения на ден: до захранването — по таблица 8; със захранването — 6 до 6 месеца и 5 след това.
  const row = MILK_TABLE.find(r => m < r.to) || MILK_TABLE[MILK_TABLE.length - 1];
  const feeds = !solids ? row.feeds : m < 6 ? 6 : 5;
  const solidMeals = !solids ? 0 : firstSolidMonth ? [1, 2] : m < 6 ? [2, 2] : [3, 3];
  const milkFeeds = feeds - (Array.isArray(solidMeals) ? solidMeals[0] : 0);
  const snacks = m >= 9 ? [1, 2] : null;

  // Адаптирано мляко до захранването: между енергийната потребност (FAO/WHO/UNU 2004 при 0,67 kcal/мл)
  // и 150 мл/кг (НЦОЗА 2013), до 960 мл (AAP); разделено на храненията. След захранването — по порциите.
  const energy = energyNeed(sex, m, mid);
  let formula = null;
  if (feeding !== 'breast') {
    if (!solids) {
      const r10 = (v) => Math.round(v / 10) * 10;
      const byEnergy = energy / KCAL_PER_ML;
      const byWeight = ML_PER_KG * mid;
      const lo = r10(Math.min(MAX_FORMULA, Math.min(byEnergy, byWeight)));
      const hi = r10(Math.min(MAX_FORMULA, Math.max(byEnergy, byWeight)));
      formula = {
        dailyMin: lo, dailyMax: hi, feeds,
        perFeedMin: r10(lo / feeds), perFeedMax: r10(hi / feeds),
        table: { feeds: row.feeds, ml: row.ml, daily: row.feeds * row.ml },
      };
    } else {
      const per = PORTION(m);
      const feedsMilk = firstSolidMonth ? milkFeeds : m < 6 ? 4 : 2;
      // След 6 месеца: 2 млечни хранения, а останалото мляко е в кашите и пюретата — общо около 500 мл.
      const daily = m >= 6 && !firstSolidMonth ? DAILY_MILK_6_12 : Math.min(MAX_FORMULA, per * feedsMilk);
      formula = { dailyMin: daily, dailyMax: daily, perFeedMin: per, perFeedMax: per, feeds: feedsMilk, followOn: m >= 6, inMeals: m >= 6 && !firstSolidMonth };
    }
  }
  return {
    month: m,
    label: monthLabel(m),
    feeds, milkFeeds, solidMeals, snacks, solids, firstSolidMonth,
    breast: feeding !== 'formula' ? breastText(m, solids) : null,
    formula,
    portion: solids ? (firstSolidMonth ? { from: 30, to: PORTION(m) } : { from: PORTION(m), to: PORTION(m) + 10 }) : null,
    texture: TEXTURE(m, solidsStart),
    newFoods: FOOD_GROUPS.filter(g => Math.max(g.from, solidsStart) === m).map(g => g.label),
    day: sampleDay(m, { feeding, solidsStart }),
    energy,
    growth: { start, end, gain: Math.round((end.weight - start.weight) * 1000), lengthGain: Math.round((end.length - start.length) * 10) / 10 },
  };
}

function monthLabel(m) {
  return m === 0 ? 'Първият месец (0–1)' : `${m + 1}-ият месец (${m}–${m + 1} навършени)`;
}

function breastText(m, solids) {
  if (m < 2) return 'Кърмене при поискване, денем и нощем — поне 8 пъти на 24 часа (СЗО 2009).';
  if (!solids) return 'Кърмене при поискване — обикновено поне 5–6 пъти на 24 часа (СЗО 2009).';
  return 'Кърменето продължава при поискване заедно със захранването, по възможност до 1 година и след нея (НЦОЗА 2013, СЗО).';
}

/** Примерен ден: часове и какво — по примерните режими на НЦОЗА 2013. */
function sampleDay(m, { feeding, solidsStart }) {
  const milk = feeding === 'breast' ? 'Кърмене' : feeding === 'mixed' ? 'Кърмене или адаптирано мляко' : m >= 6 ? 'Преходно мляко' : 'Адаптирано мляко';
  const p = PORTION(m);
  const ml = feeding === 'breast' ? '' : ` ${p} мл`;
  if (m < solidsStart) {
    const row = MILK_TABLE.find(r => m < r.to) || MILK_TABLE[MILK_TABLE.length - 1];
    const times = { 8: ['6:00', '9:00', '12:00', '15:00', '18:00', '21:00', '24:00', '3:00'], 7: ['6:00', '9:00', '12:00', '15:00', '18:00', '21:00', '24:00'], 6: ['6:00', '9:00', '12:00', '15:00', '18:00', '21:00'] }[row.feeds];
    return { orientation: feeding === 'formula' ? 'ориентировъчни часове' : 'кърмене при поискване — часовете са само ориентир', items: times.map(t => ({ time: t, what: milk })) };
  }
  if (m === solidsStart && m <= 5) {
    return {
      orientation: 'първият месец на захранването: новата храна замества едно млечно хранене за 7–8 дни (НЦОЗА 2013)',
      items: [
        { time: '6:00', what: milk + ml },
        { time: '9:00', what: `${milk}; в края на месеца — зърнена каша без глутен, обогатена с желязо` },
        { time: '12:00', what: `Зеленчуково пюре — от 1–3 супени лъжици до около ${p} г за 7–8 дни, допълнено с мляко` },
        { time: '15:00', what: milk + ml },
        { time: '18:00', what: milk + ml },
        { time: '21:00', what: milk + ml },
      ],
    };
  }
  if (m === solidsStart) {
    return {
      orientation: 'първият месец на захранването: новата храна замества едно млечно хранене за 7–8 дни, следващата група — след 10–15 дни (НЦОЗА 2013)',
      items: [
        { time: '6:30', what: milk + ml },
        { time: '10:00', what: `${milk}; от втората половина на месеца — плодово пюре` },
        { time: '13:30', what: `Зеленчуково пюре — от 1–3 супени лъжици до около ${p} г, с ¼ твърдо сварен жълтък през ден` },
        { time: '17:00', what: `${milk}; после — зърнена каша без глутен, обогатена с желязо, около ${p} г` },
        { time: '21:00', what: milk + ml },
      ],
    };
  }
  if (m < 6) {
    return {
      orientation: 'шест хранения (НЦОЗА 2013, пример 2)',
      items: [
        { time: '6:00', what: milk + ml },
        { time: '9:00', what: milk + ml },
        { time: '12:00', what: `Млечно-зеленчуково пюре около ${p - 10} г + ¼ жълтък през ден` },
        { time: '15:00', what: milk + ml },
        { time: '18:00', what: `Млечно-зърнена каша, обогатена с желязо, около ${p} г` },
        { time: '21:00', what: milk + ml },
      ],
    };
  }
  if (m <= 7) {
    return {
      orientation: `пет хранения (НЦОЗА 2013, ${m === 6 ? 'примери 3 и 4' : 'пример 5'})`,
      items: [
        { time: '6:30', what: milk + ml },
        { time: '10:00', what: m === 6 ? `Плодово пюре около ${p - 65} г + мляко` : `Попара със сирене и масло около 130 г + намачкан плод 50 г` },
        { time: '13:30', what: m === 6 ? `Зеленчуково-месно пюре или зеленчуково пюре + ¼ жълтък, около ${p} г` : `Млечно-зеленчуково пюре около ${p - 10} г + ½ жълтък, или зеленчуково-рибно пюре` },
        { time: '17:00', what: `Млечно-зърнена каша${m === 6 ? ' без глутен' : ''}, около ${p} г` },
        { time: m === 6 ? '21:00' : '20:30', what: milk + ml },
      ],
    };
  }
  if (m === 8) {
    return {
      orientation: 'пет хранения (НЦОЗА 2013, пример 6)',
      items: [
        { time: '6:30', what: milk + ml },
        { time: '10:00', what: `Млечно-плодова каша около ${p} г, или попара със сирене и масло` },
        { time: '13:30', what: `Зеленчуково-рибно или зеленчуково-месно пюре около ${p} г` },
        { time: '17:00', what: `Млечно-зърнена каша около ${p} г` },
        { time: '20:30', what: milk + ml },
      ],
    };
  }
  return {
    orientation: `пет хранения и 1–2 закуски с храни за ядене с пръсти (НЦОЗА 2013, примери ${m === 9 ? '7' : '8'})`,
    items: [
      { time: m >= 10 ? '7:00' : '6:30', what: milk + ml },
      { time: '10:00', what: `Млечно-плодова каша около ${p} г, или попара със сирене и масло` },
      { time: m >= 10 ? '13:00' : '13:30', what: m >= 10 ? 'Зеленчукова супа или супа с боб 50 г + зеленчуково-месно или рибно пюре 100 г + хляб' : `Зеленчуково-месно или рибно пюре около ${p} г (месото — по-едро смляно)` },
      { time: '15:30', what: 'Закуска за ядене с пръсти: коричка хляб, сухар, парченца мек плод или зеленчук' },
      { time: '17:00', what: `Млечно-зърнена каша около ${m >= 10 ? 160 : p} г${m >= 10 ? ' + настърган плод 30–40 г' : ''}` },
      { time: '20:30', what: milk + ml },
    ],
  };
}

/* ----------------------------------- правила ----------------------------------- */

const READINESS = [
  'седи добре с опора и държи главичката си',
  'сам взема предмети и ги слага в устата',
  'изчезва рефлексът да изтласква храната с езика',
  'проявява интерес към храната на възрастните',
  'интервалите между храненията се скъсяват',
];

/** Признаците за достатъчно хранене — според възрастта (m — завършени месеци). */
function adequacy(feeding, m) {
  return [
    ...(m < 6 ? ['Поне 6 добре намокрени пелени на ден със светла урина — достатъчно мляко и течности (СЗО 2009, НЦОЗА 2013).'] : []),
    ...(m < 1 ? ['Спадът на теглото след раждането спира около 3–4 ден; рожденото тегло се възстановява до 2 седмици (СЗО 2009), почти винаги до 3 седмици (NICE NG75).'] : []),
    ...(m < 4 ? ['От 2 седмици нататък кърмените бебета наддават около 500 г до 1 кг и повече на месец — всички тези стойности са нормални (СЗО 2009).']
      : ['С възрастта наддаването на месец намалява — важното е детето да расте по своята крива (растежни стандарти на СЗО).']),
    ...(feeding !== 'formula' && m < 6 ? ['Признаци, че кърмата не стига: под 8 кърмения на 24 ч. през първите 8 седмици (под 5–6 след това), тъмна урина под 6 пъти на ден, слабо наддаване (СЗО 2009).'] : []),
    ...(m >= 6 ? ['След захранването млякото остава около 500 мл на ден — в отделни хранения и в кашите (НЦОЗА 2013).'] : []),
    ...(feeding !== 'breast' ? ['Количествата адаптирано мляко са ориентировъчни — бебето спира, когато се засити; не насилвайте да довърши шишето (НЦОЗА 2013, AAP).'] : []),
  ];
}

function rules(feeding, allergyRisk) {
  return [
    { text: 'Витамин D 400 IU дневно от първите дни и през цялата първа година, независимо от начина на хранене.', src: 'ESPGHAN 2013' },
    { text: 'До захранването не е нужна вода — нито при кърмене, нито при адаптирано мляко. След захранването — вода всеки ден.', src: 'НЦОЗА 2013, СЗО' },
    ...(feeding !== 'breast' ? [{ text: 'Адаптираното мляко се приготвя точно по указанието на опаковката. Кравето, козето и овчето мляко не са заместител до 1 година.', src: 'НЦОЗА 2013' }] : []),
    { text: 'Захранването започва не по-рано от 4 навършени месеца (17 седмици) и не по-късно от 6 месеца, на фона на продължаващото кърмене или мляко.', src: 'ESPGHAN 2017, НЦОЗА 2013' },
    { text: 'Нова храна — на всеки 10–15 дни, като първата храна от група се дава сутрин или на обяд и се следи за реакции. Започва се с 1–3 супени лъжици и за 7–8 дни храната замества цяло хранене.', src: 'НЦОЗА 2013' },
    { text: 'Първата каша — обогатена с желязо. Всеки ден храни, богати на желязо: месо, обогатени каши.', src: 'НЦОЗА 2013, ESPGHAN 2017' },
    { text: 'Алергенните храни (яйце, храни с глутен, риба) не се отлагат — могат да се въведат още с началото на захранването, след 4 навършени месеца.', src: 'ESPGHAN 2017' },
    ...(allergyRisk ? [{ text: 'Тежка екзема или алергия към яйце: фъстъците (например гладко фъстъчено масло, разредено) се въвеждат между 4 и 11 месеца след оценка от специалист.', src: 'ESPGHAN 2017' }] : []),
    { text: 'Глутенът се въвежда между 4 и 12 месеца, в малки количества през първите седмици.', src: 'ESPGHAN 2017' },
    { text: 'Без добавена сол и захар, без сокове и подсладени напитки.', src: 'ESPGHAN 2017' },
    { text: 'Без мед до 12 месеца — риск от детски ботулизъм.', src: 'ESPGHAN 2017' },
    { text: 'Кравето мляко не е основна напитка преди 12 месеца; малко в ястията е допустимо. Оризовите напитки не са за кърмачета.', src: 'ESPGHAN 2017' },
    { text: 'Чай от резене не се препоръчва под 4 години (естрагол, няма достатъчно данни за безопасност).', src: 'ESPGHAN 2017, EMA' },
    { text: 'Пюретата не се задържат дълго: до 8–10 месеца детето яде храна на бучки; до 12 месеца пие главно от чаша.', src: 'ESPGHAN 2017' },
    { text: 'Следвайте сигналите за глад и ситост; храната не е утеха или награда.', src: 'ESPGHAN 2017' },
  ];
}

/* ----------------------------------- проверка ----------------------------------- */

/** Сигналите за момента: първата седмица, ранния спад, възрастта за захранване. */
export function feedingFlags(plan) {
  const out = [...plan.growth.early];
  if (plan.now.done) return out;
  const m = plan.age.months;
  if (m >= plan.input.solidsStart && m < plan.input.solidsStart + 0.5) out.push({ level: 'info', text: 'Времето за захранване е започнало — обсъдете с родителя първата храна и признаците за готовност.' });
  if (m >= 6.5 && m < 7.5) out.push({ level: 'info', text: 'Ако захранването още не е започнало, да не се отлага — след 6 месеца рискът от недостиг на желязо расте (ESPGHAN 2017, НЦОЗА 2013).' });
  return out;
}

/** Датата, на която детето навършва m месеца (по хронологичната възраст). */
export function monthDate(birthDate, m, gestWeeks = null) {
  const shift = isPreterm(Number(gestWeeks)) ? Math.round((40 - Number(gestWeeks)) * 7) : 0;
  return addDays(birthDate, Math.round(m * 30.4375) + shift);
}

/** Настройките за храненето в досието: { type, solidsStart, allergyRisk, updatedAt }. */
export function cleanFeeding(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return {
    type: FEEDING_TYPES[v.type] ? v.type : 'breast',
    solidsStart: [4, 5, 6].includes(Number(v.solidsStart)) ? Number(v.solidsStart) : 6,
    allergyRisk: v.allergyRisk === true,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt.slice(0, 40) : null,
  };
}
