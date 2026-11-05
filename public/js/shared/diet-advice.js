/* Обясненията и правилата в хранителния режим (версия 4.17).
 *
 * Режимът казва на човека защо е избран този тип хранене и какво променя всяко от
 * заболяванията му, с неговите числа (сол, белтък, течности, фибри) и според възрастта.
 * Текстовете са написани от лекаря към пациента, на „Вие“, като изречения, а не като
 * бележки. Всеки текст е двойка [bg, en]: режимът пази българския, а английският е в
 * plan.advice.en, така „PDF на английски“ не зависи от речника.
 * Общо за сървъра и интерфейса. */

import { EN_DX } from './i18n/en-dx.js';

/* --------------------------------- общи --------------------------------- */

const comma = (v) => String(v).replace('.', ',');
const fmt = (v, en) => (v === null || v === undefined || v === '' ? '' : en ? String(v) : comma(v));
/** Изброяване: „а, б и в“ / “a, b and c”. */
function list(items, en) {
  const xs = items.filter(Boolean);
  if (xs.length < 2) return xs[0] || '';
  return `${xs.slice(0, -1).join(', ')}${en ? ' and ' : ' и '}${xs[xs.length - 1]}`;
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Името в изречение — с малка буква, освен съкращенията („ХОББ“, „CKD“) и собствените имена („Crohn’s“). */
const lower1 = (s) => {
  if (!s || s.length < 2) return s;
  const second = s.charAt(1);
  if (second !== second.toLowerCase() || /^[A-Z][a-z]*['’]s\b/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
};

/** Двойка от две изречения или части — празните се пропускат. */
const both = (...pairs) => [pairs.map(p => p?.[0]).filter(Boolean).join(' '), pairs.map(p => p?.[1]).filter(Boolean).join(' ')];
const when = (cond, bg, en) => (cond ? [bg, en] : null);

/** Числата на човека във формата на всеки език. */
function numbers(F) {
  const raw = {
    salt: F.salt, protein: F.protein, ppk: F.ppk === null || F.ppk === undefined ? null : Number(F.ppk).toFixed(1), fiber: F.fiber, fluids: F.fluidsL, satFat: F.satFat,
    sugar: F.sugarMax, tsp: Math.max(1, Math.round((F.sugarMax || 0) / 4)), carbs: Math.round((F.carbs || 0) / 10) * 10, carbPct: F.carbPct,
    kcal: F.kcal, calcium: F.calcium, iron: F.iron, caMenu: F.caMenu ? Math.round(F.caMenu / 10) * 10 : null,
    weight: F.weight, height: F.height, age: Math.floor(F.age), weeklyKg: F.weeklyKg ? Math.max(0.1, Math.round(Math.abs(F.weeklyKg) * 10) / 10) : 0,
    target: F.targetWeight, weeks: F.weeks, energyAdd: F.energyAdd, egfr: F.egfrMeasured ? Math.round(F.egfrMeasured) : null,
  };
  const b = {};
  const e = {};
  for (const [k, v] of Object.entries(raw)) { b[k] = fmt(v, false); e[k] = fmt(v, true); }
  return { b, e };
}

/** Какво има човекът — ключ на профил по МКБ-10 или заболяване от досието. */
const hasOf = (F) => (k) => F.keys.has(k) || F.cond.has(k);

/* Заболяванията от досието без код — имената им за обясненията. */
const COND_TITLE = {
  htn: ['Артериална хипертония', 'Hypertension'], dm1: ['Захарен диабет тип 1', 'Type 1 diabetes'],
  dm2: ['Захарен диабет тип 2', 'Type 2 diabetes'], prediabetes: ['Предиабет', 'Prediabetes'],
  dyslip: ['Дислипидемия', 'Dyslipidemia'], chd: ['Исхемична болест на сърцето', 'Coronary heart disease'],
  pad: ['Атеросклероза', 'Atherosclerosis'], stroke: ['Мозъчно-съдова болест', 'Cerebrovascular disease'],
  hf: ['Сърдечна недостатъчност', 'Heart failure'], af: ['Предсърдно мъждене', 'Atrial fibrillation'],
  obesity: ['Затлъстяване', 'Obesity'], gout: ['Подагра', 'Gout'], osteoporosis: ['Остеопороза', 'Osteoporosis'],
  hypothyroid: ['Хипотиреоидизъм', 'Hypothyroidism'], masld: ['Мастен черен дроб', 'Fatty liver disease'],
  anemia: ['Желязодефицитна анемия', 'Iron deficiency anemia'], copd: ['ХОББ', 'COPD'],
  dementia: ['Деменция', 'Dementia'], depression: ['Депресия', 'Depression'], ckd: ['Хронично бъбречно заболяване', 'Chronic kidney disease'],
};

/* Заглавието на втория ключ на един код — „Бременност, 24. седмица“ при гестационен диабет. */
const SECOND_TITLE = {
  pregnancy: (F) => (F.pregnancyWeek ? [`Бременност, ${F.pregnancyWeek}. седмица`, `Pregnancy, week ${F.pregnancyWeek}`] : ['Бременност', 'Pregnancy']),
  htn: () => COND_TITLE.htn,
};

/* Профилите по МКБ-10, които се обясняват заедно (един текст за бъбреците). */
const KIDNEY = new Set(['dialysis', 'ckd45', 'ckd3', 'ckd12', 'ckd']);

/* ------------------------------ хранителен модел ------------------------------ */

/* Подлогът в обяснението („Средиземноморското хранене …“) и местоимението в резюмето („… защото той …“). */
const PATTERN_SUBJECT = {
  mediterranean: [['Средиземноморското хранене', 'той'], ['The Mediterranean diet', 'it']],
  dash: [['Моделът DASH', 'той'], ['The DASH plan', 'it']],
  lowcarb: [['Храненето с по-малко въглехидрати', 'то'], ['A lower-carbohydrate diet', 'it']],
  highprotein: [['Храненето с повече белтък', 'то'], ['A higher-protein diet', 'it']],
  balanced: [['Балансираното хранене', 'то'], ['A balanced diet', 'it']],
};

/** Моделът с думи: „средиземноморски тип хранене“. */
export const PATTERN_PHRASE = {
  mediterranean: ['средиземноморски тип хранене', 'a Mediterranean-style diet'],
  dash: ['хранене по модела DASH', 'the DASH eating plan'],
  lowcarb: ['хранене с по-малко въглехидрати', 'a lower-carbohydrate diet'],
  highprotein: ['хранене с повече белтък', 'a higher-protein diet'],
  balanced: ['балансирано хранене', 'a balanced diet'],
};

/**
 * Моделът по заболяванията, когато лекарят не е избрал друг. Редът е по приоритет:
 * загуба на мускули → бъбреци → раздразнено черво → бременност → сърце и съдове → диабет →
 * черен дроб → налягане → подагра и камъни → настроение → тегло → кости.
 */
export function choosePattern(F) {
  const has = hasOf(F);
  const kidney = F.ckd || F.dialysis;
  if (['malnutrition', 'cancer', 'pressure', 'cirrhosis'].some(has) && !kidney) return { id: 'highprotein', reason: 'muscle' };
  if (kidney) return { id: 'mediterranean', reason: 'kidney' };
  if (has('ibs')) return { id: 'balanced', reason: 'ibs' };
  if (F.pregnancy || F.lactation) return { id: 'mediterranean', reason: 'pregnancy' };
  if (['chd', 'pad', 'stroke', 'hf', 'af', 'dyslip', 'tg'].some(has)) return { id: 'mediterranean', reason: 'heart' };
  if (has('pcos') && !has('dm2') && !has('dm1') && !F.keys.has('prediabetes')) return { id: 'mediterranean', reason: 'pcos' };
  if (['dm2', 'dm1', 'prediabetes'].some(has)) return { id: 'mediterranean', reason: 'diabetes' };
  if (has('masld')) return { id: 'mediterranean', reason: 'liver' };
  if (has('htn') && !F.limitK) return { id: 'dash', reason: 'htn' };
  if ((has('gout') || has('stones')) && !F.limitK) return { id: 'dash', reason: has('gout') ? 'gout' : 'stones' };
  if (has('depression')) return { id: 'mediterranean', reason: 'mood' };
  if (has('obesity') || F.goal === 'lose') return { id: 'mediterranean', reason: 'weight' };
  if (has('osteoporosis') || F.menopause) return { id: 'mediterranean', reason: 'bones' };
  return { id: 'mediterranean', reason: 'default' };
}

/* Заболяванията на сърцето и съдовете с думи — „при исхемичната болест на сърцето“. */
function heartWords(F, en) {
  const has = hasOf(F);
  const out = [];
  if (has('chd')) out.push(en ? 'coronary heart disease' : 'исхемичната болест на сърцето');
  if (has('stroke')) out.push(en ? 'the cerebrovascular disease' : 'мозъчно-съдовата болест');
  if (has('pad')) out.push(en ? 'atherosclerosis' : 'атеросклерозата');
  if (has('hf')) out.push(en ? 'heart failure' : 'сърдечната недостатъчност');
  if (has('af')) out.push(en ? 'atrial fibrillation' : 'предсърдното мъждене');
  if (has('dyslip') || has('tg')) out.push(en ? 'raised blood fats' : 'повишените мазнини в кръвта');
  return list(out.slice(0, 3), en);
}

/**
 * Защо е избран моделът — като подчинено изречение след „защото“ (за резюмето) и като
 * самостоятелен текст (за обяснението). reason — от choosePattern или по избора на лекаря.
 */
function patternReason(F, id, reason, v) {
  const has = hasOf(F);
  const htn = has('htn');
  const sugar = has('dm1') || has('dm2') ? ['диабет', 'diabetes'] : has('pcos') ? ['поликистозни яйчници', 'polycystic ovaries'] : ['предиабет', 'prediabetes'];
  const R = {
    muscle: has('cirrhosis')
      ? [`при цироза тялото разгражда мускулите по-бързо и има нужда от повече белтък: ${v.b.ppk} г/кг, разпределени във всяко хранене`,
        `in cirrhosis the body breaks down muscle faster and needs more protein: ${v.e.ppk} g/kg, spread across every meal`]
      : has('cancer')
        ? [`по време на онкологично лечение тялото има нужда от повече белтък, за да пази мускулите: ${v.b.ppk} г/кг на ден`,
          `during cancer treatment your body needs more protein to protect muscle: ${v.e.ppk} g/kg a day`]
        : has('pressure') && !has('malnutrition')
          ? [`раната зараства по-бързо, когато тялото получава повече белтък: ${v.b.ppk} г/кг на ден`,
            `a wound heals faster when the body gets more protein: ${v.e.ppk} g/kg a day`]
          : [`при загуба на тегло и мускули тялото има нужда от повече енергия и белтък: ${v.b.ppk} г/кг, разпределени във всяко хранене`,
            `when you lose weight and muscle your body needs more energy and protein: ${v.e.ppk} g/kg, spread across every meal`],
    kidney: [
      `§ е с повече зеленчуци, бобови и пълнозърнести храни и с по-малко месо, а това натоварва по-малко бъбреците${has('dm2') || has('dm1') ? ' и подобрява кръвната захар' : ''}${htn ? '. С малко сол § понижава и налягането' : ''}${F.limitK ? '. Моделът DASH, който иначе понижава налягането, не е избран, защото е богат на калий, а при Вашите бъбреци калият трябва да се ограничава' : ''}`,
      `§ has more vegetables, pulses and whole grains and less meat, which puts less strain on the kidneys${has('dm2') || has('dm1') ? ' and improves blood sugar' : ''}${htn ? '. With little salt § also lowers blood pressure' : ''}${F.limitK ? '. The DASH plan, which otherwise lowers blood pressure, was not chosen because § is rich in potassium, and with your kidneys potassium has to be limited' : ''}`],
    ibs: [
      '§ дава всички хранителни вещества, но с по-малко бобови, лук и зеле, които при раздразнено черво засилват подуването и болката',
      '§ provides every nutrient you need with fewer pulses, onions and cabbage, which make bloating and pain worse in irritable bowel syndrome'],
    pregnancy: [
      F.pregnancy ? '§ дава риба, бобови, зеленчуци и пълнозърнести храни, от които имате нужда Вие и бебето' : '§ дава риба, бобови, зеленчуци и пълнозърнести храни, от които имате нужда, докато кърмите',
      F.pregnancy ? '§ provides the fish, pulses, vegetables and whole grains that you and your baby need' : '§ provides the fish, pulses, vegetables and whole grains you need while breastfeeding'],
    heart: [
      `при ${heartWords(F, false)} § пази сърцето и съдовете: при хора с висок сърдечно-съдов риск намалява инфарктите и инсултите с около 30% (проучването PREDIMED)${htn ? '. С малко сол § понижава и налягането' : ''}`,
      `with ${heartWords(F, true)} § protects the heart and blood vessels: in people at high cardiovascular risk it cut heart attacks and strokes by about 30% (the PREDIMED trial)${htn ? '. With little salt § also lowers blood pressure' : ''}`],
    diabetes: [
      `при ${sugar[0]} § подобрява кръвната захар и пази сърцето и съдовете, които при ${sugar[0] === 'диабет' ? 'диабет' : 'това състояние'} са най-застрашени. Бързите въглехидрати в менюто са намалени, а мазнините идват от зехтин и ядки${htn ? '. Солта е малко заради налягането' : ''}`,
      `with ${sugar[1]} § improves blood sugar and protects the heart and blood vessels, which are most at risk${htn ? '. Salt is kept low because of your blood pressure' : ''}. Fast-acting carbohydrates in the menu are reduced and fats come from olive oil and nuts`],
    pcos: [
      'при поликистозни яйчници § намалява инсулиновата резистентност с храни с нисък гликемичен индекс, а това помага на цикъла и хормоните',
      'with polycystic ovary syndrome § reduces insulin resistance through low-glycemic foods, which helps your cycle and hormones'],
    liver: [
      '§ намалява мазнините в черния дроб дори при малко отслабване',
      '§ reduces fat in the liver even with modest weight loss'],
    htn: [
      `при високо кръвно налягане § има най-силните доказателства: с много зеленчуци, плодове, нискомаслени млечни продукти и бобови и с малко сол понижава горното налягане с около 11 mmHg при хора с хипертония${has('gout') ? '. § понижава и пикочната киселина' : ''}${has('stones') ? `. ${has('gout') ? 'Намалява' : '§ намалява'} и риска от нови камъни в бъбреците` : ''}`,
      `§ has the strongest evidence in high blood pressure: with plenty of vegetables, fruit, low-fat dairy and pulses and little salt, § lowers systolic pressure by about 11 mmHg in people with hypertension${has('gout') ? '. § also lowers uric acid' : ''}${has('stones') ? '. § also lowers the risk of new kidney stones' : ''}`],
    gout: [
      '§ е с по-малко месо и с повече нискомаслени млечни продукти, зеленчуци и плодове, а това понижава пикочната киселина',
      '§ has less meat and more low-fat dairy, vegetables and fruit, which lowers uric acid'],
    stones: [
      'с малко сол, много зеленчуци и плодове и нормално количество млечни продукти § намалява риска от нови камъни',
      'with little salt, plenty of vegetables and fruit and a normal amount of dairy § lowers the risk of new stones'],
    mood: [
      'освен за сърцето § помага и на настроението, като допълнение към лечението',
      'besides protecting the heart, § helps mood alongside your treatment'],
    weight: [
      '§ засища добре и се спазва лесно дълго време, а при отслабване това е най-важното',
      '§ is filling and easy to keep to for a long time, which matters most when losing weight'],
    bones: [
      '§ е с риба, млечни продукти, зеленчуци и ядки, които дават калций, витамин D и белтък за костите',
      '§ includes fish, dairy, vegetables and nuts, which provide calcium, vitamin D and protein for your bones'],
    default: [
      '§ е с най-силните доказателства за здраве в дългосрочен план: пази сърцето, съдовете и мозъка',
      '§ has the strongest evidence for long-term health: § protects the heart, blood vessels and brain'],
    // По избора на лекаря — общото за модела.
    dash: [
      '§ е с много зеленчуци, плодове, нискомаслени млечни продукти и бобови и с малко сол',
      '§ is rich in vegetables, fruit, low-fat dairy and pulses and low in salt'],
    lowcarb: [
      `въглехидратите са около една трета от енергията и идват от зеленчуци, бобови и пълнозърнести храни, затова кръвната захар се покачва по-малко след хранене${has('dm2') || has('prediabetes') ? '. При диабет намаляването на въглехидратите има най-силен ефект върху кръвната захар' : ''}`,
      `carbohydrates make up about a third of your energy and come from vegetables, pulses and whole grains, so blood sugar rises less after meals${has('dm2') || has('prediabetes') ? '. In diabetes, eating fewer carbohydrates has the strongest effect on blood sugar' : ''}`],
    highprotein: [
      'повече белтък засища по-дълго и пази мускулите при отслабване и тренировки',
      'more protein keeps you full for longer and protects muscle during weight loss and training'],
    balanced: [
      '§ дава всички хранителни вещества в границите, препоръчани от EFSA, без да изключва групи храни',
      '§ provides every nutrient within the ranges recommended by EFSA without cutting out any food group'],
  };
  return R[reason] || R[id] || R.default;
}

const PATTERN_SRC = {
  muscle: 'ESPEN 2022', kidney: 'KDIGO 2024', ibs: 'NICE CG61', pregnancy: 'EFSA 2013', heart: 'ESC 2021, PREDIMED 2018',
  diabetes: 'ADA 2026, ESC/EASD 2023', pcos: 'PCOS 2023', liver: 'EASL–EASD–EASO 2024', htn: 'ESC 2024, DASH 1997', gout: 'EULAR 2016',
  stones: 'EAU 2024', mood: 'SMILES 2017', weight: 'NICE NG246', bones: 'ESCEO/IOF 2019', default: 'СЗО, PREDIMED 2018',
  dash: 'ESC 2024', lowcarb: 'ADA 2026', highprotein: 'ESPEN', balanced: 'EFSA',
};

/* Причината за модела, избран от лекаря: по заболяванията, ако моделът им пасва, иначе общата за модела. */
function chosenReason(F) {
  const has = hasOf(F);
  if (F.pattern === F.patternAutoId) return F.patternReason;
  if (F.pattern === 'dash' && has('htn')) return 'htn';
  if (F.pattern === 'highprotein' && ['malnutrition', 'cancer', 'pressure', 'cirrhosis'].some(has) && !F.ckd && !F.dialysis) return 'muscle';
  if (F.pattern === 'balanced' && has('ibs')) return 'ibs';
  if (F.pattern === 'mediterranean') return ['chd', 'pad', 'stroke', 'hf', 'af', 'dyslip', 'tg'].some(has) ? 'heart' : ['dm2', 'dm1', 'prediabetes'].some(has) ? 'diabetes' : 'default';
  return F.pattern;
}

/** Обяснението за модела: { title, text, src } на двата езика. */
function patternWhy(F, v) {
  const [bgP, enP] = PATTERN_PHRASE[F.pattern];
  const reason = chosenReason(F);
  const [bgR, enR] = patternReason(F, F.pattern, reason, v);
  const [[bgS, bgPron], [enS, enPron]] = PATTERN_SUBJECT[F.pattern];
  // В обяснението подлогът е моделът („Средиземноморското хранене е …“), в резюмето — местоимение.
  // Първото споменаване е моделът с име (и в средата на изречението — „… моделът DASH има …“), после местоимение.
  const card = (r, subj, pron) => cap((r.startsWith('§') ? r.replace(/^§/, subj) : r.replace('§', lower1(subj))).replace(/\. §/g, `. ${cap(pron)}`).replace(/§/g, pron));
  const clause = (r, pron) => r.replace(/^§/, pron).replace(/\. §/g, `. ${cap(pron)}`).replace(/§/g, pron);
  return {
    key: 'pattern', kind: 'pattern', codes: [], src: PATTERN_SRC[reason] || PATTERN_SRC[F.pattern] || '',
    title: [`Защо ${bgP}`, `Why ${enP}`],
    text: [`${card(bgR, bgS, bgPron)}.`, `${card(enR, enS, enPron)}.`],
    clause: [clause(bgR, bgPron), clause(enR, enPron)],
  };
}

/* ------------------------------ обясненията ------------------------------ */

/*
 * Защо режимът се променя при всяко заболяване — по ключа на профила (diet-icd.js).
 * why(v, F) връща [bg, en]; v.b и v.e са числата на човека на двата езика.
 */
const WHY = {
  htn: { src: 'ESC 2024', why: (v, F) => both(
    [`Солта задържа вода в тялото и вдига кръвното налягане. Затова менюто е с до ${v.b.salt} г сол на ден, около една чаена лъжичка, като се брои и солта в хляба и сиренето.`,
      `Salt makes the body hold on to water and raises blood pressure. That is why your menu has no more than ${v.e.salt} g of salt a day, about one teaspoon, including the salt in bread and cheese.`],
    when(!F.limitK, 'Зеленчуците, плодовете, бобовите и киселото мляко в него дават калий, който също понижава налягането.',
      'The vegetables, fruit, pulses and yogurt in it provide potassium, which also lowers blood pressure.'),
    when(F.goal === 'lose', 'Всеки свален килограм понижава налягането с около 1 mmHg.', 'Every kilogram you lose lowers blood pressure by about 1 mmHg.')) },
  dm2: { src: 'ADA 2026', why: (v, F) => both(
    [`При диабет тип 2 на кръвната захар влияят най-много количеството и видът на въглехидратите. В менюто те са около ${v.b.carbs} г на ден, разпределени равномерно, и идват предимно от пълнозърнести храни, бобови и зеленчуци, а не от бял хляб и сладко.`,
      `In type 2 diabetes, the amount and type of carbohydrate affect blood sugar the most. Your menu has about ${v.e.carbs} g a day, spread evenly, mostly from whole grains, pulses and vegetables rather than white bread and sweets.`],
    when(F.goal === 'lose', 'Свалянето на 5–10% от теглото подобрява кръвната захар, а при около 15% диабетът може да премине в ремисия.',
      'Losing 5–10% of your weight improves blood sugar, and at around 15% diabetes can go into remission.'),
    when(F.age >= 75, 'На Вашата възраст по-важно от строгите ограничения е да се храните редовно и да няма ниска кръвна захар.',
      'At your age, eating regularly and avoiding low blood sugar matter more than strict restrictions.')) },
  dm1: { src: 'ADA 2026', why: () => [
    'При диабет тип 1 дозата инсулин се съобразява с въглехидратите в храната. Затова за всяко ястие в менюто въглехидратите са дадени в грамове. Не е нужно да ги ограничавате, а да ги броите и да ги разпределяте предвидимо през деня.',
    'In type 1 diabetes, your insulin dose is matched to the carbohydrate you eat. That is why every dish in the menu shows its carbohydrate in grams. You do not need to cut carbohydrates, but to count them and spread them predictably through the day.'] },
  prediabetes: { src: 'ADA 2026', why: () => [
    'Предиабетът често се връща към нормата с промяна в храненето и движението. Свалянето на 5–7% от теглото и 150 минути движение седмично намаляват риска от диабет с около 58%.',
    'Prediabetes often returns to normal with changes in diet and activity. Losing 5–7% of your weight and 150 minutes of activity a week lower the risk of diabetes by about 58%.'] },
  tg: { src: 'ESC/EAS 2019', why: () => [
    'Триглицеридите се покачват най-вече от захар, бял хляб, сладки напитки и алкохол. Затова менюто е с малко от тях и с мазна риба, чиито омега-3 мазнини ги понижават.',
    'Triglycerides rise mainly with sugar, white bread, sweet drinks and alcohol. Your menu has little of these and includes oily fish, whose omega-3 fats lower them.'] },
  dyslip: { src: 'ESC/EAS 2025', why: (v) => [
    `Наситените мазнини в маслото, тлъстото месо и пълномаслените сирена вдигат „лошия“ холестерол LDL. Затова в менюто те са под ${v.b.satFat} г на ден, а мазнините идват от зехтин, ядки и риба. Фибрите от овесените ядки и бобовите също го понижават.`,
    `The saturated fat in butter, fatty meat and full-fat cheese raises “bad” LDL cholesterol. Your menu keeps it under ${v.e.satFat} g a day, with fats from olive oil, nuts and fish. The fiber in oats and pulses also lowers it.`] },
  chd: { src: 'ESC 2021', why: (v) => [
    `При исхемична болест на сърцето храненето със зеленчуци, бобови, риба, зехтин и ядки намалява риска от нов инфаркт. Затова менюто е такова, с наситени мазнини под ${v.b.satFat} г и сол до ${v.b.salt} г на ден.`,
    `In coronary heart disease, eating vegetables, pulses, fish, olive oil and nuts lowers the risk of another heart attack. Your menu is built this way, with saturated fat under ${v.e.satFat} g and salt up to ${v.e.salt} g a day.`] },
  pad: { src: 'ESC 2024', why: () => [
    'При атеросклероза храненето е като при болест на сърцето, с повече зеленчуци, бобови, риба и зехтин и по-малко наситени мазнини и сол, защото намалява риска от инфаркт и инсулт. За краката най-много помагат редовното ходене и спирането на тютюнопушенето.',
    'With atherosclerosis, the diet is the same as for heart disease, with more vegetables, pulses, fish and olive oil and less saturated fat and salt, because it lowers the risk of heart attack and stroke. For the legs, regular walking and stopping smoking help the most.'] },
  stroke: { src: 'ESO 2021, AHA/ASA 2021', why: (v, F) => both(
    [`След мозъчно-съдова болест храненето цели да няма нов инсулт: по-ниско налягане и холестерол. Затова менюто е с до ${v.b.salt} г сол, със зеленчуци, риба и зехтин и с малко наситени мазнини.`,
      `After cerebrovascular disease, the aim of your diet is to prevent another stroke by lowering blood pressure and cholesterol. Your menu has up to ${v.e.salt} g of salt, vegetables, fish and olive oil, and little saturated fat.`],
    when(F.age >= 65, 'Ако се задавяте или преглъщате трудно, кажете ми, за да съобразим храната.', 'If you choke or find swallowing difficult, tell me so that we can adapt your food.')) },
  hf: { src: 'ESC 2021', why: (v) => [
    `При сърдечна недостатъчност излишната сол и течности натоварват сърцето и водят до отоци и задух. Затова менюто е с до ${v.b.salt} г сол, а течностите са около ${v.b.fluids} л на ден. Ежедневното претегляне сутрин показва навреме задържането на вода.`,
    `In heart failure, extra salt and fluid strain the heart and cause swelling and breathlessness. That is why your menu has up to ${v.e.salt} g of salt and about ${v.e.fluids} l of fluid a day. Weighing yourself every morning shows early when your body is holding water.`] },
  af: { src: 'ESC 2024', why: (v, F) => both(
    ['При предсърдно мъждене пристъпите намаляват, когато теглото е нормално, налягането е под контрол и алкохолът е малко. Затова алкохолът е ограничен до 3 питиета седмично или по-малко.',
      'In atrial fibrillation, episodes become less frequent when your weight is healthy, your blood pressure is controlled and you drink little alcohol. That is why alcohol is limited to 3 drinks a week or fewer.'],
    when(F.goal === 'lose', 'Отслабването с 10% намалява пристъпите най-много.', 'Losing 10% of your weight reduces episodes the most.')) },
  obesity: { src: 'NICE NG246', why: (v, F) => (F.goal === 'lose'
    ? both(['Режимът е за плавно отслабване с умерен енергиен дефицит, без забранени храни. Дори 5–10% по-малко тегло подобрява налягането, кръвната захар, мазнините в кръвта и ставите.',
      'This plan is for gradual weight loss with a moderate energy deficit and no forbidden foods. Even 5–10% less weight improves blood pressure, blood sugar, blood fats and joints.'],
    when(F.age >= 65, 'На Вашата възраст отслабването е бавно и винаги заедно с повече белтък и силови упражнения, за да губите мазнини, а не мускули.',
      'At your age, weight loss is slow and always combined with more protein and strength exercises, so that you lose fat rather than muscle.'))
    : ['Сега целта е теглото да не се покачва. Порциите и видът на храната в менюто са подбрани така, че да поддържат сегашното тегло.',
      'For now the aim is to keep your weight from rising. Portions and foods in the menu are chosen to keep your current weight.']) },
  gout: { src: 'EULAR 2016, ACR 2020', why: (v, F) => both(
    ['Пикочната киселина се покачва от карантия, бира и спиртни напитки, подсладени напитки с фруктоза и много месо и морски дарове. Затова те са ограничени, а нискомаслените млечни продукти и водата помагат тя да се отделя.',
      'Uric acid rises with offal, beer and spirits, drinks sweetened with fructose, and large amounts of meat and seafood. These are limited, while low-fat dairy and water help your body get rid of it.'],
    when(F.goal === 'lose', 'Отслабването също намалява пристъпите.', 'Losing weight also reduces attacks.')) },
  osteoporosis: { src: 'ESCEO/IOF 2019', why: (v) => both(
    [`За здравите кости са нужни калций, витамин D и белтък. Менюто е подбрано с повече храни с калций${v.b.caMenu ? ` и дава около ${v.b.caMenu} мг на ден` : ''} при препоръка 1000–1200 мг, а белтъкът е ${v.b.ppk} г/кг.`,
      `Healthy bones need calcium, vitamin D and protein. Your menu favors calcium-rich foods${v.e.caMenu ? ` and provides about ${v.e.caMenu} mg a day` : ''} against a target of 1000–1200 mg, and protein is ${v.e.ppk} g/kg.`],
    ['Силовите упражнения и ходенето укрепват костите повече, отколкото самото хранене.', 'Strength exercises and walking strengthen bones more than diet alone.']) },
  hypothyroid: { src: 'ATA 2014', why: () => [
    'При хипотиреоидизъм, когато хормонът е заместен с таблетка, специална диета не е нужна. Важно е как взимате таблетката: сутрин на гладно, само с вода, 30–60 минути преди закуска. Калций, желязо и соевите продукти пречат на усвояването ѝ, затова ги приемайте по-късно през деня.',
    'With hypothyroidism, once the hormone is replaced with a tablet no special diet is needed. What matters is how you take the tablet: in the morning on an empty stomach, with water only, 30–60 minutes before breakfast. Calcium, iron and soy products reduce its absorption, so take them later in the day.'] },
  masld: { src: 'EASL–EASD–EASO 2024', why: () => [
    'Мастният черен дроб се подобрява най-сигурно с отслабване: 7–10% по-малко тегло намалява мазнините и възпалението в него. Средиземноморското хранене помага и без голямо отслабване. Алкохолът и подсладените напитки го натоварват, затова ги няма в менюто.',
    'Fatty liver improves most reliably with weight loss: 7–10% less weight reduces the fat and inflammation in it. A Mediterranean diet helps even without much weight loss. Alcohol and sweetened drinks strain the liver, so they are left out.'] },
  anemia: { src: 'BSG 2021', why: () => [
    'При желязодефицитна анемия менюто е подбрано с повече ястия, богати на желязо. Желязото от месото се усвоява най-добре, а това от бобовите и зеленчуците по-добре заедно с витамин C. Храната помага, но обикновено не стига: нужна е и добавка с желязо по назначение.',
    'For iron deficiency anemia, your menu favors iron-rich dishes. Iron from meat is absorbed best, and iron from pulses and vegetables is absorbed better with vitamin C. Food helps but is usually not enough on its own: an iron supplement as prescribed is also needed.'] },
  copd: { src: 'GOLD 2026', why: (v, F) => both(
    ['При ХОББ дишането изразходва повече енергия, а задухът затруднява храненето. По-малките и по-чести хранения се понасят по-лесно.',
      'In COPD, breathing uses more energy and breathlessness makes eating harder. Smaller, more frequent meals are easier to manage.'],
    when(F.bmi < 21, 'При Вашето тегло е важно да не отслабвате. Ако теглото пада, ще добавим хранителни добавки за пиене.',
      'At your weight it is important not to lose weight. If it drops, we will add oral nutritional supplements.')) },
  dementia: { src: 'ESPEN 2015', why: () => [
    'При деменция по-голям риск е недохранването, отколкото наднорменото тегло. Затова е важно храненето да е редовно и достатъчно, с напомняне и помощ при нужда. Теглото се следи всеки месец: неволната загуба е сигнал да се добави храна.',
    'In dementia, undernutrition is a greater risk than excess weight. Regular, sufficient meals matter, with reminders and help when needed. Weight is checked every month: unintended weight loss is a signal to add more food.'] },
  depression: { src: 'SMILES 2017', why: () => [
    'Храненето от средиземноморски тип подобрява настроението като допълнение към лечението, а редовните хранения поддържат енергията през деня. Храната не заменя лекарствата и разговорите със специалист.',
    'A Mediterranean-style diet improves mood alongside treatment, and regular meals keep your energy up through the day. Food does not replace medication or talking therapy.'] },
  stones: { src: 'EAU 2024', why: (v) => [
    `Камъните се образуват, когато урината е концентрирана. Затова най-важното е да пиете много: около ${v.b.fluids} л течности на ден, за да отделяте поне 2–2,5 л урина. Солта и много животински белтък увеличават калция в урината и са ограничени, а млечните продукти не бива да се спират, защото калцият в тях свързва оксалатите в червата.`,
    `Stones form when urine is concentrated. The most important thing is to drink plenty: about ${v.e.fluids} l of fluid a day, so that you pass at least 2–2.5 l of urine. Salt and a lot of animal protein increase calcium in the urine and are limited, while dairy should not be stopped, because its calcium binds oxalate in the gut.`] },
  hyperk: { src: 'KDIGO 2024', why: () => [
    'Калият в кръвта Ви е повишен, а той идва най-много от картофи, домати, банани, сушени плодове, ядки и бобови. Затова порциите им в менюто са по-малки. Картофите губят част от калия, ако ги нарежете и сварите в две води.',
    'Your blood potassium is high, and most of it comes from potatoes, tomatoes, bananas, dried fruit, nuts and pulses. That is why their portions in the menu are smaller. Potatoes lose some potassium if you cut them up and boil them in two changes of water.'] },
  hypok: { src: 'ESC 2024', why: () => [
    'Калият в кръвта Ви е нисък. Храните, богати на калий, като зеленчуци, бобови, плодове, картофи и кисело мляко, помагат да се възстанови, ако бъбреците Ви са здрави. Често е нужна и таблетка по назначение.',
    'Your blood potassium is low. Potassium-rich foods such as vegetables, pulses, fruit, potatoes and yogurt help restore it if your kidneys are healthy. A tablet as prescribed is often needed as well.'] },
  hypona: { src: 'ESE 2014', why: () => [
    'Натрият в кръвта Ви е нисък. Колко вода и сол да приемате зависи от причината и ще го определим след изследванията. Дотогава не пийте повече вода от обичайното.',
    'Your blood sodium is low. How much water and salt you should have depends on the cause, and we will decide this after your tests. Until then, do not drink more water than usual.'] },
  celiac: { src: 'ESsCD 2019, ACG 2023', why: () => [
    'При цьолиакия дори малко глутен уврежда червата. Затова менюто е изцяло без глутен: без пшеница, ръж и ечемик, с безглутенов хляб, ориз, елда и киноа. Безглутеновото хранене е за цял живот и включва внимание към следите от глутен в общите тигани, панировките и сосовете.',
    'In celiac disease, even a little gluten damages the gut. Your menu is completely gluten-free: no wheat, rye or barley, with gluten-free bread, rice, buckwheat and quinoa. A gluten-free diet is for life and includes care about traces of gluten in shared pans, breadcrumbs and sauces.'] },
  lactose: { src: 'EFSA 2010', why: () => [
    'При непоносимост към лактоза менюто е с млечни продукти без лактоза. Не е нужно да спирате млечните напълно: киселото мляко и отлежалите сирена обикновено се понасят и са важен източник на калций.',
    'For lactose intolerance, your menu uses lactose-free dairy. You do not need to give up dairy completely: yogurt and aged cheeses are usually tolerated and are an important source of calcium.'] },
  gerd: { src: 'ACG 2022', why: (v, F) => both(
    ['Рефлуксът се засилва от големи порции, мазни храни и хранене малко преди лягане. Затова храненията в менюто са по-малки, а последното е 2–3 часа преди сън.',
      'Reflux gets worse with large portions, fatty food and eating shortly before bed. That is why the meals in your menu are smaller and the last one is 2–3 hours before sleep.'],
    when(F.bmi >= 25, 'При наднормено тегло отслабването е най-ефективната мярка срещу рефлукса.', 'With excess weight, losing weight is the most effective measure against reflux.')) },
  ulcer: { src: 'Maastricht VI 2022', why: () => [
    'При гастрит и язва храненето не лекува, но може да облекчи оплакванията. Специална диета не е нужна: избягвайте само това, което Ви причинява болка или парене, най-често алкохол, силно лютиво и много кафе. Лечението на Helicobacter pylori, ако е открит, е по-важно от диетата.',
    'In gastritis and ulcers, food does not cure but can ease symptoms. No special diet is needed: avoid only what gives you pain or burning, most often alcohol, very spicy food and a lot of coffee. Treating Helicobacter pylori, if found, matters more than diet.'] },
  ibs: { src: 'NICE CG61, ACG 2021', why: () => [
    'При раздразнено черво помагат редовните хранения и по-малко храни, които ферментират в червата: бобови, лук, зеле и много плодове наведнъж. Затова те са по-редки в менюто. Овесените ядки и лененото семе облекчават подуването.',
    'In irritable bowel syndrome, regular meals and fewer foods that ferment in the gut help: pulses, onions, cabbage and a lot of fruit at once. That is why these appear less often in your menu. Oats and linseed ease bloating.'] },
  diverticula: { src: 'AGA 2021', why: (v) => [
    `При дивертикулоза фибрите правят изхождането меко и редовно и намаляват риска от възпаление. Затова менюто е с поне ${v.b.fiber} г фибри на ден. Ядките, семената и пуканките не са забранени.`,
    `In diverticular disease, fiber keeps your bowel movements soft and regular and lowers the risk of inflammation. Your menu has at least ${v.e.fiber} g of fiber a day. Nuts, seeds and popcorn are not forbidden.`] },
  constipation: { src: 'NICE CKS', why: (v) => [
    `При запек менюто е с поне ${v.b.fiber} г фибри и около ${v.b.fluids} л течности на ден: пълнозърнести храни, бобови, сини сливи и ленено семе. Увеличавайте фибрите постепенно и се движете всеки ден.`,
    `For constipation, your menu has at least ${v.e.fiber} g of fiber and about ${v.e.fluids} l of fluid a day: whole grains, pulses, prunes and linseed. Increase fiber gradually and stay active every day.`] },
  ibd: { src: 'ESPEN 2023', why: () => [
    'При болест на Крон и улцерозен колит в ремисия специална диета не е нужна: разнообразното хранене пази от недохранване. При обостряне или стеснение на червата храната трябва да е с малко фибри, по указание на гастроентеролога и диетолога.',
    'In Crohn’s disease and ulcerative colitis in remission, no special diet is needed: varied eating protects against undernutrition. During a flare or with a narrowed bowel, food should be low in fiber, as advised by your gastroenterologist and dietitian.'] },
  cirrhosis: { src: 'ESPEN 2019, EASL 2019', why: (v) => [
    `При цироза черният дроб не пази запас от енергия за нощта и тялото започва да разгражда мускулите. Затова белтъкът е повече, около ${v.b.protein} г на ден, а преди сън има лека закуска. Не стойте гладни повече от 6 часа през деня. Алкохолът е напълно забранен.`,
    `In cirrhosis, the liver does not store enough energy for the night, so the body starts breaking down muscle. That is why protein is higher, about ${v.e.protein} g a day, and there is a light snack before bed. Do not go more than 6 hours without food during the day. Alcohol is completely off limits.`] },
  gallstones: { src: 'EASL 2016', why: () => [
    'Жлъчните камъни се провокират от обилни и много мазни хранения и от бързото отслабване. Затова храненията са редовни и умерени, а отслабването, ако е нужно, е плавно.',
    'Gallstone attacks are triggered by large, very fatty meals and by rapid weight loss. That is why your meals are regular and moderate, and any weight loss is gradual.'] },
  pancreatitis: { src: 'ESPEN 2020', why: () => [
    'При хроничен панкреатит по-малките хранения, 5–6 на ден, натоварват по-малко панкреаса. Ензимите, ако са Ви назначени, се пият с всяко хранене. Алкохолът и тютюнът увреждат панкреаса още, затова е важно да ги спрете напълно.',
    'In chronic pancreatitis, smaller meals, 5–6 a day, put less strain on the pancreas. If you have been prescribed enzymes, take them with every meal. Alcohol and tobacco damage the pancreas further, so it is important to stop both completely.'] },
  dysphagia: { src: 'ESPEN 2022, IDDSI', why: () => [
    'При затруднено преглъщане консистенцията на храната и течностите се определя след оценка на преглъщането. Менюто тук не е пригодено за това и е ориентир само за количествата.',
    'With difficulty swallowing, the texture of food and drinks is set after a swallowing assessment. This menu is not adapted for that and is only a guide to quantities.'] },
  bariatric: { src: 'ASMBS 2019', why: () => [
    'След бариатрична операция стомахът побира малко, затова храненията са малки и чести, с белтък на всяко от тях, поне 60 г на ден. Витамините и минералите се приемат по схема цял живот.',
    'After bariatric surgery your stomach holds little, so meals are small and frequent, with protein at each one, at least 60 g a day. Vitamins and minerals are taken on a schedule for life.'] },
  pcos: { src: 'PCOS 2023', why: (v, F) => both(
    ['При поликистозни яйчници инсулинът често е повишен. Храните с нисък гликемичен индекс помагат на цикъла и хормоните.',
      'With polycystic ovary syndrome, insulin is often raised. Foods with a low glycemic index help your cycle and hormones.'],
    when(F.goal === 'lose', 'Свалянето на 5–10% от теглото ги подобрява най-много.', 'Losing 5–10% of your weight improves them the most.')) },
  hyperthyroid: { src: 'ETA 2018', why: () => [
    'Докато щитовидната жлеза е свръхактивна, тялото изразходва повече енергия и теглото може да пада. Следете теглото и, ако спада, яжте повече. Не приемайте добавки с йод и водорасли.',
    'While your thyroid is overactive, your body uses more energy and your weight may drop. Keep an eye on your weight and eat more if it falls. Do not take iodine or seaweed supplements.'] },
  hashimoto: { src: 'ETA', why: () => [
    'При автоимунен тиреоидит специална диета не е нужна. Безглутеново хранене има смисъл само при доказана цьолиакия.',
    'Autoimmune thyroiditis needs no special diet. A gluten-free diet only makes sense if celiac disease has been confirmed.'] },
  vitd: { src: 'ESCEO', why: () => [
    'Витамин D идва основно от кожата при слънце; от храната се получава малко: мазна риба, яйца и обогатени продукти. Затова недостигът се лекува с добавка по назначение, а менюто я допълва.',
    'Vitamin D comes mainly from the skin in sunlight; food provides little: oily fish, eggs and fortified products. A deficiency is therefore treated with a supplement as prescribed, and the menu supports it.'] },
  b12: { src: 'NICE NG239 2024', why: (v, F) => both(
    ['Витамин B12 има само в храните от животински произход: месо, риба, яйца и млечни продукти.',
      'Vitamin B12 is found only in foods of animal origin: meat, fish, eggs and dairy.'],
    when(F.prefs.has('vegan'), 'При веганско хранене добавката е задължителна.', 'On a vegan diet a supplement is essential.'),
    when(F.age >= 50 || F.classes.has('METFORMIN') || F.classes.has('PPI'), 'С възрастта и при прием на метформин или лекарства за стомашна киселина той се усвоява по-трудно.',
      'It is absorbed less well with age and when taking metformin or stomach acid medicines.')) },
  folate: { src: 'NICE CKS', why: () => [
    'Фолатът се съдържа в листни зеленчуци, бобови, броколи и пълнозърнести храни, и менюто е с повече от тях. При недостиг обаче е нужна и добавка с фолиева киселина по назначение.',
    'Folate is found in leafy greens, pulses, broccoli and whole grains, and your menu includes more of them. With a deficiency, a folic acid supplement as prescribed is also needed.'] },
  hemochromatosis: { src: 'EASL 2022', why: () => [
    'При хемохроматоза тялото усвоява твърде много желязо. Основното лечение са кръвопусканията; храненето помага, като се избягват добавки с желязо и витамин C, суровите морски дарове и много алкохол. Червеното месо е умерено.',
    'In hemochromatosis, the body absorbs too much iron. The main treatment is venesection; diet helps by avoiding iron and vitamin C supplements, raw seafood and heavy drinking. Red meat is kept moderate.'] },
  malnutrition: { src: 'ESPEN 2022, GLIM', why: (v, F) => both(
    [`При недохранване и загуба на мускулна маса тялото има нужда от повече енергия и белтък. Затова режимът не е за отслабване, а белтъкът е ${v.b.ppk} г/кг, около ${v.b.protein} г на ден, разпределен във всяко хранене.`,
      `With undernutrition and muscle loss, your body needs more energy and protein. That is why this plan is not for weight loss, and protein is ${v.e.ppk} g/kg, about ${v.e.protein} g a day, spread across every meal.`],
    when(F.age >= 65, 'Силовите упражнения помагат белтъкът да се превръща в мускули.', 'Strength exercises help protein build muscle.')) },
  cancer: { src: 'ESPEN 2021', why: (v) => [
    `По време на онкологично лечение е важно да не отслабвате, защото загубата на тегло и мускули влошава поносимостта на лечението. Затова режимът е за поддържане на теглото, с белтък ${v.b.ppk} г/кг. Ако левкоцитите Ви са ниски, яжте само добре сготвени храни.`,
    `During cancer treatment it is important not to lose weight, because losing weight and muscle makes treatment harder to tolerate. That is why this plan maintains your weight, with protein at ${v.e.ppk} g/kg. If your white cell count is low, eat only well-cooked food.`] },
  iem: { src: '', why: () => [
    'Вродените нарушения на обмяната изискват специализиран режим от метаболитен център. Това меню не е подходящо за Вас и е само ориентир.',
    'Inherited metabolic disorders need a specialized diet from a metabolic center. This menu is not suitable for you and is only a guide.'] },
  eating: { src: 'NICE NG69', why: () => [
    'При хранително разстройство храненето се планира заедно с екипа, който Ви лекува. Този режим е само ориентир.',
    'With an eating disorder, your meals are planned together with your treatment team. This plan is only a guide.'] },
  alcohol: { src: 'NICE CG100', why: () => [
    'Спирането на алкохола е най-важната стъпка за черния дроб, сърцето и нервите. Алкохолът изчерпва витамините от група B, особено B1, затова той се приема по назначение. Редовните хранения помагат на тялото да се възстанови.',
    'Stopping alcohol is the most important step for your liver, heart and nerves. Alcohol depletes B vitamins, especially B1 (thiamine), so it is taken as prescribed. Regular meals help your body recover.'] },
  psa: { src: 'NPF 2018, EULAR 2021', why: (v, F) => both(
    ['При псориатичен артрит нормалното тегло намалява болката в ставите и подобрява ефекта от лечението.',
      'In psoriatic arthritis, a healthy weight reduces joint pain and improves the effect of treatment.'],
    when(F.goal === 'lose', 'Затова режимът е за отслабване.', 'That is why this plan is for weight loss.'),
    ['Храненето допълва, но не заменя лечението.', 'Diet supports but does not replace treatment.']) },
  psoriasis: { src: 'NPF 2018', why: () => [
    'При псориазис наднорменото тегло засилва възпалението, а отслабването намалява кожните промени. Безглутеново хранене помага само при доказана чувствителност към глутен. Храненето допълва, но не заменя лечението.',
    'In psoriasis, excess weight increases inflammation, and weight loss reduces skin lesions. A gluten-free diet helps only with confirmed gluten sensitivity. Diet supports but does not replace treatment.'] },
  rheum: { src: 'EULAR 2021', why: () => [
    'При възпалителен ставен ревматизъм няма храна, която да лекува болестта. Здравословното хранене и нормалното тегло обаче намаляват натоварването на ставите и сърдечно-съдовия риск, който при тези болести е повишен.',
    'No food cures inflammatory rheumatic disease. A healthy diet and a healthy weight do, however, reduce strain on the joints and the cardiovascular risk, which is raised in these conditions.'] },
  oa: { src: 'ACR/AF 2019, EULAR 2021', why: () => [
    'При артроза на коляното или тазобедрената става всеки свален килограм намалява натоварването на ставата с около 4 кг при всяка крачка. Затова отслабването, заедно с упражненията, е силна препоръка. Добавки като глюкозамин едва ли променят хода на болестта.',
    'With osteoarthritis of the knee or hip, every kilogram you lose takes about 4 kg off the joint with every step. That is why weight loss, together with exercise, is strongly recommended. Supplements such as glucosamine are unlikely to change the course of the disease.'] },
  atopic: { src: 'AAD 2014', why: () => [
    'При атопичен дерматит храни се изключват само при доказана алергия, след изследване. Ненужните забрани обедняват храненето, без да подобряват кожата.',
    'In atopic dermatitis, foods are cut out only when an allergy has been confirmed by testing. Unnecessary restrictions make your diet poorer without helping your skin.'] },
  hs: { src: 'North American HS 2019', why: () => [
    'При супуративен хидраденит наднорменото тегло и тютюнопушенето засилват болестта, затова отслабването и спирането на цигарите помагат. Спирането на млечните продукти няма достатъчно доказателства.',
    'In hidradenitis suppurativa, excess weight and smoking make the disease worse, so losing weight and stopping smoking help. There is not enough evidence for cutting out dairy.'] },
  pressure: { src: 'ESPEN 2022', why: (v) => [
    `Раната от притискане зараства по-бързо, когато тялото получава достатъчно енергия и белтък. Затова режимът не е за отслабване, а белтъкът е около ${v.b.protein} г на ден.`,
    `A pressure ulcer heals faster when your body gets enough energy and protein. That is why this plan is not for weight loss, and protein is about ${v.e.protein} g a day.`] },
  parkinson: { src: 'ESPEN 2018', why: () => [
    'При болест на Паркинсон запекът е чест, затова менюто е с повече фибри и течности. Леводопата действа по-добре, ако я взимате поне 30 минути преди хранене, защото белтъкът в храната пречи на усвояването ѝ.',
    'Constipation is common in Parkinson’s disease, so your menu has more fiber and fluid. Levodopa works better if you take it at least 30 minutes before a meal, because protein in food reduces its absorption.'] },
  ms: { src: 'ESPEN 2018', why: () => [
    'При множествена склероза няма диета, която да променя хода на болестта. Балансираното хранене и нормалното тегло помагат за енергията и подвижността.',
    'No diet changes the course of multiple sclerosis. A balanced diet and a healthy weight help your energy and mobility.'] },
  osa: { src: 'ATS 2018', why: () => [
    'При сънна апнея наднорменото тегло стеснява дихателните пътища по време на сън. Отслабването намалява спиранията на дишането и е част от лечението. Алкохолът вечер ги засилва.',
    'In sleep apnea, excess weight narrows the airway during sleep. Losing weight reduces pauses in breathing and is part of the treatment. Alcohol in the evening makes them worse.'] },
  gn: { src: 'KDIGO 2021', why: (v) => [
    `При гломерулна болест солта и излишният белтък увеличават загубата на белтък с урината и отоците. Затова менюто е с до ${v.b.salt} г сол и белтък около ${v.b.protein} г на ден.`,
    `In glomerular disease, salt and excess protein increase protein loss in the urine and swelling. That is why your menu has up to ${v.e.salt} g of salt and about ${v.e.protein} g of protein a day.`] },
  adpkd: { src: 'KDIGO 2025', why: (v) => [
    `При поликистоза на бъбреците много вода потиска хормона, който стимулира растежа на кистите. Затова пийте 2–3 л на ден, ако бъбречната функция го позволява. Солта е до ${v.b.salt} г, а белтъкът около ${v.b.ppk} г/кг.`,
    `In polycystic kidney disease, plenty of water suppresses the hormone that drives cyst growth. Drink 2–3 l a day if your kidney function allows it. Salt is up to ${v.e.salt} g and protein about ${v.e.ppk} g/kg.`] },
  hemorrhoids: { src: 'ASCRS 2018', why: (v) => [
    `При хемороиди най-важно е изхождането да е меко и редовно, без напъване. Затова менюто е с поне ${v.b.fiber} г фибри и повече течности.`,
    `With hemorrhoids, what matters most is soft, regular bowel movements without straining. That is why your menu has at least ${v.e.fiber} g of fiber and more fluid.`] },
  fissure: { src: 'ASCRS 2017', why: () => [
    'При анална фисура фибрите и течностите омекотяват изпражненията и позволяват на раната да зарасне. Топлите седящи вани облекчават болката.',
    'With an anal fissure, fiber and fluid soften the stool and let the tear heal. Warm sitz baths ease the pain.'] },
  gastroparesis: { src: 'ACG 2022', why: (v, F) => both(
    ['При гастропареза стомахът се изпразва бавно. Храната на малки частици, пасирана или добре сготвена, с по-малко мазнини и груби фибри, се понася по-добре, затова храненията са малки и чести.',
      'In gastroparesis, the stomach empties slowly. Food in small particles, puréed or well cooked, with less fat and coarse fiber, is better tolerated, so meals are small and frequent.'],
    when(F.diabetes, 'Добрият контрол на кръвната захар също помага.', 'Good blood sugar control also helps.')) },
  transplant: { src: 'КХП', why: () => [
    'Грейпфрутът и помелото повишават нивото на такролимус и циклоспорин в кръвта, затова ги няма в менюто. Храната трябва да е добре сготвена, защото лекарствата срещу отхвърляне отслабват защитата срещу инфекции.',
    'Grapefruit and pomelo raise blood levels of tacrolimus and ciclosporin, so they are left out of your menu. Food should be well cooked, because anti-rejection medicines weaken your defenses against infection.'] },
  bph: { src: 'EAU', why: () => [
    'При уголемена простата по-малко течности вечер намаляват ставането през нощта, а кафето и алкохолът дразнят пикочния мехур. През деня пийте нормално.',
    'With an enlarged prostate, drinking less in the evening means fewer trips to the toilet at night, and coffee and alcohol irritate the bladder. Drink normally during the day.'] },
  incontinence: { src: 'EAU', why: () => [
    'При изпускане на урина наднорменото тегло натоварва тазовото дъно, затова отслабването помага. По-малко кофеин намалява позивите при свръхактивен пикочен мехур.',
    'With urinary incontinence, excess weight puts pressure on the pelvic floor, so losing weight helps. Less caffeine reduces urgency in an overactive bladder.'] },
  gdm: { src: 'ADA 2026, NICE NG3', why: () => [
    'При гестационен диабет въглехидратите не се спират: поне 175 г на ден са нужни за Вас и бебето. Те са разпределени в 3 основни и 2–3 малки хранения, за да не се покачва рязко кръвната захар. Отслабване по време на бременност не се планира.',
    'With gestational diabetes, carbohydrates are not cut out: at least 175 g a day are needed for you and your baby. They are spread over 3 main meals and 2–3 snacks so that blood sugar does not spike. Weight loss is not planned during pregnancy.'] },
  pregnancy: { src: 'EFSA 2013, СЗО', why: (v, F) => both(
    [`По време на бременност енергията е с около ${v.b.energyAdd} kcal повече на ден${F.trimester ? ` за ${F.trimester}. тримесечие` : ''}. Някои храни са изключени заради бебето: черен дроб заради многото витамин A, прясна риба тон заради живака, сурово месо и яйца заради инфекциите. Фолиевата киселина и йодираната сол са важни особено в началото.`,
      `During pregnancy your energy is about ${v.e.energyAdd} kcal a day higher${F.trimester ? ` for trimester ${F.trimester}` : ''}. Some foods are left out for the baby’s sake: liver because of its high vitamin A, fresh tuna because of mercury, raw meat and eggs because of infections. Folic acid and iodized salt matter most in early pregnancy.`]) },
  lactation: { src: 'EFSA 2013', why: () => [
    'При кърмене тялото изразходва около 500 kcal повече на ден за млякото, затова енергията е повишена, а течностите са поне 2,5 л. Плавното отслабване до 0,5 кг седмично е безопасно след първите 2 месеца.',
    'Breastfeeding uses about 500 kcal more a day to make milk, so your energy is higher and fluids are at least 2.5 l. Gradual weight loss of up to 0.5 kg a week is safe after the first 2 months.'] },
  amenorrhea: { src: 'Endocrine Society 2017', why: () => [
    'При липса на менструация и нормално или ниско тегло причината често е недостиг на енергия от малко храна и много натоварване. Затова режимът не е с дефицит: тялото трябва да получава достатъчно, за да се възстанови цикълът.',
    'When periods stop at a normal or low weight, the cause is often too little energy from eating little and training a lot. That is why this plan has no deficit: your body needs enough energy for your cycle to return.'] },
  heavy: { src: 'NICE NG88, EFSA 2015', why: () => [
    'При обилна менструация се губи повече желязо, затова менюто е подбрано с ястия, богати на желязо, всеки ден. Желязото от растенията се усвоява по-добре с витамин C, а чаят и кафето пийте поне час след храненето.',
    'Heavy periods mean losing more iron, so your menu includes iron-rich dishes every day. Iron from plants is absorbed better with vitamin C; have tea and coffee at least an hour after meals.'] },
  pms: { src: 'ACOG 2023', why: () => [
    'При предменструален синдром калцият от храната, около 1000–1200 мг на ден, намалява оплакванията. Затова менюто е с повече млечни продукти и други храни с калций.',
    'In premenstrual syndrome, calcium from food, about 1000–1200 mg a day, reduces symptoms. That is why your menu has more dairy and other calcium-rich foods.'] },
  dysmenorrhea: { src: 'Cochrane 2016', why: () => [
    'При болезнена менструация храненето има малка роля, а добавките имат само слаби доказателства. Основното лечение са обезболяващите.',
    'Diet plays a small part in painful periods, and supplements have only weak evidence. Pain relief medicines are the main treatment.'] },
  menopause: { src: 'EFSA 2015', why: (v) => [
    `След менопаузата костите губят калций по-бързо, а рискът за сърцето се покачва. Затова менюто е с калций около ${v.b.calcium} мг на ден и с храни, които пазят сърцето. Силовите упражнения пазят и костите, и мускулите.`,
    `After the menopause, bones lose calcium faster and the risk to the heart rises. That is why your menu provides about ${v.e.calcium} mg of calcium a day with heart-friendly foods. Strength exercises protect both bones and muscles.`] },
  allergy: { src: 'EAACI 2014', why: () => [
    'Менюто изключва храните, към които имате алергия. Ако реагирате и на други храни, кажете ми, за да ги добавим.',
    'The menu leaves out the foods you are allergic to. If you react to other foods too, tell me so that we can add them.'] },
  anticoag: { src: 'EHRA 2021', why: () => [
    'Ако приемате варфарин или аценокумарол (Синтром), витамин K от зелените листни зеленчуци влияе на действието им. Не спирайте зеленчуците, а ги яжте в сходно количество всяка седмица. При апиксабан, ривароксабан и дабигатран това не е нужно.',
    'If you take warfarin or acenocoumarol, vitamin K in leafy greens affects how they work. Do not stop eating greens, but keep the amount similar every week. This is not needed with apixaban, rivaroxaban or dabigatran.'] },
  asthma: { src: 'GINA 2026', why: (v, F) => both(
    ['При астма специална диета няма. Повече плодове и зеленчуци са полезни, а храни се избягват само при доказана алергия.',
      'There is no special diet for asthma. More fruit and vegetables help, and foods are avoided only if an allergy has been confirmed.'],
    when(F.bmi >= 25, 'При наднормено тегло отслабването подобрява контрола на астмата.', 'With excess weight, losing weight improves asthma control.')) },
  epilepsy: { src: 'ILAE', why: () => [
    'При епилепсия редовните хранения и достатъчният сън са важни, защото гладът и недоспиването могат да провокират пристъп, както и алкохолът. Кетогенна диета се прилага само при определени форми и под контрола на специализиран екип.',
    'In epilepsy, regular meals and enough sleep matter, because hunger and lack of sleep can trigger a seizure, as can alcohol. A ketogenic diet is used only for certain forms and under a specialist team.'] },
  migraine: { src: 'NICE CKS', why: () => [
    'При мигрена пропуснатото хранене, обезводняването и рязката промяна в количеството кафе са чести провокатори. Затова храненията са редовни. Ако подозирате определена храна, водете дневник, вместо да спирате много храни наведнъж.',
    'In migraine, skipped meals, dehydration and sudden changes in coffee intake are common triggers. That is why your meals are regular. If you suspect a particular food, keep a diary instead of cutting out many foods at once.'] },
  anxiety: { src: '', why: () => [
    'Кофеинът засилва сърцебиенето и безпокойството, а алкохолът влошава съня и тревожността на следващия ден. Затова е добре кафето да е сутрин и в малко количество, а алкохолът да е рядко.',
    'Caffeine increases palpitations and restlessness, and alcohol worsens sleep and next-day anxiety. It is best to keep coffee to a small amount in the morning and alcohol to rare occasions.'] },
  uti: { src: 'EAU 2024', why: (v, F) => (F.sex === 'f' && F.age < 55
    ? ['При чести инфекции на пикочните пътища повече вода намалява повторенията, особено ако обикновено пиете малко. Продуктите с червена боровинка може да помогнат, но доказателствата са слаби.',
      'With frequent urinary tract infections, drinking more water reduces recurrences, especially if you usually drink little. Cranberry products may help, but the evidence is weak.']
    : ['При инфекции на пикочните пътища пийте достатъчно през целия ден. Продуктите с червена боровинка може да помогнат, но доказателствата са слаби.',
      'With urinary tract infections, drink enough throughout the day. Cranberry products may help, but the evidence is weak.']) },
  varicose: { src: 'NICE CG168', why: () => [
    'При разширени вени специална диета няма. Нормалното тегло, движението и редовното изхождане без напъване намаляват натоварването на вените на краката.',
    'There is no special diet for varicose veins. A healthy weight, activity and regular bowel movements without straining take pressure off the leg veins.'] },
  endometriosis: { src: 'ESHRE 2022', why: () => [
    'При ендометриоза няма диета с доказан ефект. Балансираното хранене е достатъчно, а строгите забрани без доказана непоносимост не се препоръчват.',
    'There is no diet with proven benefit in endometriosis. A balanced diet is enough, and strict restrictions without a confirmed intolerance are not recommended.'] },
};

/* Бъбреците — един текст според стадия (по eGFR, а без него — по кода). */
function kidneyWhy(F, v) {
  if (F.dialysis) {
    return { src: 'KDOQI 2020', text: [
      `При хемодиализа белтъкът се губи с процедурата, затова менюто е с повече белтък, около ${v.b.protein} г на ден. Калият, фосфорът, солта и течностите между диализите обаче се ограничават, защото бъбреците не ги изхвърлят. Количеството течности Ви определя нефрологът.`,
      `During hemodialysis protein is lost with each session, so your menu has more protein, about ${v.e.protein} g a day. Potassium, phosphorus, salt and fluid between sessions are limited, because your kidneys cannot remove them. Your nephrologist sets how much fluid you can have.`] };
  }
  if (F.ckdAdvanced) {
    return { src: 'KDIGO 2024', text: both(
      [`При Вашата бъбречна функция${v.b.egfr ? ` (eGFR около ${v.b.egfr})` : ''} бъбреците изхвърлят по-трудно продуктите от белтъка, калия и фосфора. Затова белтъкът е около ${v.b.protein} г на ден (${v.b.ppk} г/кг), повече от растителни храни, а менюто е с по-малко калий и фосфор.`,
        `With your kidney function${v.e.egfr ? ` (eGFR about ${v.e.egfr})` : ''}, your kidneys have difficulty clearing the waste from protein, potassium and phosphorus. That is why protein is about ${v.e.protein} g a day (${v.e.ppk} g/kg), more of it from plant foods, and your menu is lower in potassium and phosphorus.`],
      when(F.age >= 75, 'На Вашата възраст белтъкът не бива да пада под тази граница, за да не губите мускули.',
        'At your age, protein should not fall below this level, so that you do not lose muscle.')) };
  }
  if (F.ckd) {
    return { src: 'KDIGO 2024', text: both(
      [`При хронично бъбречно заболяване${v.b.egfr ? ` с eGFR около ${v.b.egfr}` : ''} умереното количество белтък и малкото сол забавят влошаването на бъбречната функция. Затова белтъкът е около ${v.b.protein} г на ден (${v.b.ppk} г/кг), а солта до ${v.b.salt} г. Повече растителни храни и по-малко месо и преработени храни също пазят бъбреците.`,
        `In chronic kidney disease${v.e.egfr ? ` with an eGFR of about ${v.e.egfr}` : ''}, moderate protein and little salt slow the decline in kidney function. That is why protein is about ${v.e.protein} g a day (${v.e.ppk} g/kg) and salt is up to ${v.e.salt} g. More plant foods and less meat and processed food also protect your kidneys.`],
      when(F.age >= 75 && F.ppk > 0.8, 'На Вашата възраст белтъкът е малко повече от обичайното при ХБЗ, за да не губите мускули.',
        'At your age, protein is a little higher than usual in kidney disease so that you do not lose muscle.')) };
  }
  return { src: 'KDIGO 2024', text: [
    'Бъбречната Ви функция още е добра и целта е да се запази: малко сол, без излишък на белтък, не повече от 1,3 г/кг, и добре контролирани налягане и кръвна захар.',
    'Your kidney function is still good, and the aim is to keep it that way: little salt, no excess protein (no more than 1.3 g/kg), and well-controlled blood pressure and blood sugar.'] };
}

/** Вашата възраст — какво променя тя в режима (зависимост по възраст, версия 4.17). */
function ageWhy(F, v) {
  const parts = [];
  const a = F.age;
  if (a >= 75) {
    parts.push([`На ${v.b.age} години мускулите и костите се губят по-лесно, а апетитът и жаждата отслабват. Затова белтъкът е ${v.b.ppk} г/кг на ден, енергията е поне 27 kcal на килограм и строги диети не се препоръчват.`,
      `At ${v.e.age}, muscle and bone are lost more easily and appetite and thirst decline. That is why protein is ${v.e.ppk} g/kg a day, energy is at least 27 kcal per kilogram, and strict diets are not recommended.`]);
    if (F.ageNoLose) parts.push(['Отслабване не е предвидено, защото при Вашето тегло то би отнело повече мускули, отколкото мазнини.', 'Weight loss is not planned, because at your weight it would take away more muscle than fat.']);
  } else if (a >= 65 && (F.ckd || F.dialysis)) {
    parts.push(['След 65 години мускулите се губят по-лесно. Белтъкът остава в границата за бъбреците, но е важно да е разпределен във всяко хранене, а енергията да е достатъчна, за да не отслабвате неволно. Нужни са и калций и витамин D.',
      'After 65, muscle is lost more easily. Protein stays within the limit for your kidneys, but it is important to spread it across every meal and to eat enough energy so that you do not lose weight unintentionally. You also need calcium and vitamin D.']);
  } else if (a >= 65) {
    parts.push([`След 65 години тялото има нужда от повече белтък, за да запази мускулите: ${v.b.ppk} г/кг на ден, разпределени във всяко хранене. Нужни са и калций, витамин D и редовни течности, защото жаждата отслабва.`,
      `After 65 your body needs more protein to keep its muscle: ${v.e.ppk} g/kg a day, spread across every meal. You also need calcium, vitamin D and regular drinks, because thirst becomes weaker.`]);
    if (F.goal === 'lose') parts.push(['Отслабването е плавно и заедно със силови упражнения, за да губите мазнини, а не мускули.', 'Weight loss is gradual and combined with strength exercises, so that you lose fat rather than muscle.']);
  }
  if (a >= 65 && !F.fluidsRestricted) parts.push([`Пийте около ${v.b.fluids} л на ден по часовник, без да чакате жажда.`, `Drink about ${v.e.fluids} l a day by the clock, without waiting to feel thirsty.`]);
  if (a >= 50 && F.classes.has('PPI') && !F.keys.has('b12')) {
    parts.push(['С възрастта и при продължителен прием на лекарства за стомашна киселина витамин B12 се усвоява по-трудно; изследвайте го при умора, изтръпване или анемия.',
      'With age, and when taking stomach acid medicines for a long time, vitamin B12 is absorbed less well; have it checked if you feel tired or have tingling or anemia.']);
  }
  if (F.sex === 'f' && a < 46 && !F.pregnancy && !F.menopause) {
    parts.push(['Като жена в детеродна възраст имате нужда от повече желязо, 16 мг на ден. Ако планирате бременност, започнете фолиева киселина 400 мкг на ден поне месец преди забременяването.',
      'As a woman of childbearing age you need more iron, 16 mg a day. If you are planning a pregnancy, start folic acid 400 µg a day at least a month before conceiving.']);
  }
  if (a < 25) parts.push(['До около 25 години костите още трупат калций, затова той е 1000 мг на ден.', 'Until about 25, your bones are still building calcium, so you need 1000 mg a day.']);
  if (!parts.length) return null;
  return {
    key: 'age', kind: 'age', codes: [], src: a >= 65 ? 'ESPEN 2022, EFSA' : 'EFSA 2015, NICE',
    title: [`Възраст: ${v.b.age} г.`, `Age: ${v.e.age}`], text: both(...parts),
  };
}

/**
 * Всички обяснения за възрастен: моделът, после всяко заболяване (по реда в списъка),
 * заболяванията от досието без код и накрая възрастта.
 * Връща [{ key, kind, codes, title: [bg, en], text: [bg, en], src }].
 */
export function whyItems(F) {
  const v = numbers(F);
  const out = [patternWhy(F, v)];
  const groups = new Map();
  const secondary = new Map();
  for (const d of F.dx) {
    (d.keys || []).forEach((key, i) => {
      const k = KIDNEY.has(key) ? 'kidney' : key;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
      // Вторият ключ на един код (бременността при гестационния диабет) е със свое заглавие.
      if (i > 0 && !secondary.has(k)) secondary.set(k, true);
    });
  }
  for (const [k, ds] of groups) {
    const names = [...new Set(ds.map(d => d.name).filter(Boolean))];
    let title = [names.join('; ') || COND_TITLE[k]?.[0] || '', ds.map(d => EN_DX[d.code] || dxEn(d.code) || d.name).filter((x, i, a) => a.indexOf(x) === i).join('; ')];
    if (secondary.has(k) && SECOND_TITLE[k]) title = SECOND_TITLE[k](F);
    if (k === 'kidney') {
      const w = kidneyWhy(F, v);
      out.push({ key: 'kidney', kind: 'dx', codes: ds.map(d => d.code), title, text: w.text, src: w.src });
      continue;
    }
    const W = WHY[k];
    if (!W) continue;
    out.push({ key: k, kind: 'dx', codes: ds.map(d => d.code), title, text: W.why(v, F), src: W.src });
  }
  // Заболяванията от досието без код по МКБ-10 (хроничните заболявания).
  for (const c of F.condOnly || []) {
    const k = c === 'ckd' ? 'kidney' : c;
    if (groups.has(k) || !COND_TITLE[c]) continue;
    if (k === 'kidney') {
      const w = kidneyWhy(F, v);
      out.push({ key: 'kidney', kind: 'cond', codes: [], title: COND_TITLE.ckd, text: w.text, src: w.src });
    } else if (WHY[k]) {
      out.push({ key: k, kind: 'cond', codes: [], title: COND_TITLE[c], text: WHY[k].why(v, F), src: WHY[k].src });
    }
    groups.set(k, []);
  }
  const age = ageWhy(F, v);
  if (age) out.push(age);
  return out;
}

/* Английското име на кода по най-дългото съвпадение („E11.9“ → „E11“). */
function dxEn(code) {
  const c = String(code || '').toUpperCase();
  for (let n = c.length; n >= 3; n--) if (EN_DX[c.slice(0, n)]) return EN_DX[c.slice(0, n)];
  return `ICD-10 ${c}`;
}

/* ---------------------------------- правила ---------------------------------- */

/* Причините с думи: „заради налягането и бъбреците“. */
const REASON = {
  htn: ['налягането', 'your blood pressure'], hf: ['сърцето', 'your heart'], kidney: ['бъбреците', 'your kidneys'],
  stones: ['камъните в бъбреците', 'kidney stones'], cirrhosis: ['черния дроб', 'your liver'],
  gout: ['подаграта', 'gout'], constipation: ['запека', 'constipation'], adpkd: ['поликистозата', 'polycystic kidney disease'],
  lactation: ['кърменето', 'breastfeeding'], uti: ['инфекциите на пикочните пътища', 'urinary tract infections'],
  sglt2: ['лекарството за диабет, което изхвърля захар с урината', 'your diabetes medicine that removes sugar in the urine'],
};
const because = (keys, en) => (keys.length ? (en ? ` This matters especially because of ${list(keys.map(k => REASON[k][1]), true)}.` : ` За Вас това е особено важно заради ${list(keys.map(k => REASON[k][0]), false)}.`) : '');

/**
 * Правилата за възрастен — по теми, без повторения: всяко правило се казва веднъж и с
 * причините на човека. Връща { prefer, limit, avoid, notes, warnings, clinician } — масиви от [bg, en].
 */
export function adultRules(F) {
  const has = hasOf(F);
  const v = numbers(F);
  const R = { prefer: [], limit: [], avoid: [], notes: [], warnings: [], clinician: [] };
  const add = (k, p) => { if (p && p[0] && !R[k].some(x => x[0] === p[0])) R[k].push(p); };
  const veg = F.prefs.has('vegetarian');
  const vegan = F.prefs.has('vegan');
  const noNuts = F.prefs.has('noNuts');
  const noFish = veg || F.prefs.has('noFish');
  const gf = F.prefs.has('glutenFree');
  const kidney = F.ckd || F.dialysis || ['gn', 'adpkd', 'ckd12', 'ckd3', 'ckd45', 'ckd'].some(k => F.keys.has(k)) || F.cond.has('ckd');
  const diabetes = has('dm2') || has('prediabetes');
  const t1 = has('dm1');
  const cardio = ['htn', 'chd', 'pad', 'stroke', 'hf', 'dyslip', 'tg', 'af'].some(has);
  const insulin = t1 || F.classes.has('INSULIN') || F.classes.has('SU');

  // Зеленчуци и основата на чинията.
  add('prefer', F.goal === 'lose'
    ? ['Зеленчуци на всяко хранене. Заедно с плодовете поне 400 г на ден.', 'Vegetables at every meal. Together with fruit, at least 400 g a day.']
    : ['Зеленчуци на всяко хранене: половината от чинията на обяд и на вечеря. Заедно с плодовете поне 400 г на ден.',
      'Vegetables at every meal: half of your plate at lunch and dinner. Together with fruit, at least 400 g a day.']);
  const grains = gf ? ['безглутенови пълнозърнести храни (елда, киноа, кафяв ориз)', 'gluten-free whole grains (buckwheat, quinoa, brown rice)']
    : ['пълнозърнест хляб, овесени ядки или елда', 'wholegrain bread, oats or buckwheat'];
  const extras = [];
  if (!has('ibs') && !F.limitK) extras.push(['бобови', 'pulses']);
  if (!noNuts && !F.limitK) extras.push(['шепа ядки (30 г)', 'a handful of nuts (30 g)']);
  add('prefer', [`Всеки ден ${list([grains[0], ...extras.map(e => e[0])], false)}. Гответе със зехтин вместо с масло.`,
    `Every day, ${list([grains[1], ...extras.map(e => e[1])], true)}. Cook with olive oil instead of butter.`]);

  // Сол — едно правило с всички причини.
  const salty = [];
  if (has('htn')) salty.push('htn');
  if (has('hf')) salty.push('hf');
  if (kidney) salty.push('kidney');
  if (has('stones') && !kidney) salty.push('stones');
  if (has('cirrhosis')) salty.push('cirrhosis');
  add('limit', [`Сол до ${v.b.salt} г на ден, колкото една чаена лъжичка, като се брои и солта в хляба, сиренето и колбасите. Не досолявайте на масата.${because(salty, false)}`,
    `Salt up to ${v.e.salt} g a day, about one teaspoon, including the salt in bread, cheese and cured meats. Do not add salt at the table.${because(salty, true)}`]);

  // Захар.
  add('limit', diabetes || t1 || has('tg') || has('masld')
    ? [`Захар и сладко: до ${v.b.sugar} г на ден, около ${v.b.tsp} чаени лъжички, заедно със захарта в кафето, сладкишите, меда и сока. Сладкото яжте рядко и само след основно хранене, не между храненията.`,
      `Sugar and sweets: up to ${v.e.sugar} g a day, about ${v.e.tsp} teaspoons, including sugar in coffee, cakes, honey and juice. Have sweets rarely and only after a main meal, not between meals.`]
    : [`Захар и сладко: до ${v.b.sugar} г на ден, около ${v.b.tsp} чаени лъжички, заедно със захарта в кафето, сладкишите, меда и сока. Колкото по-малко, толкова по-добре.`,
      `Sugar and sweets: up to ${v.e.sugar} g a day, about ${v.e.tsp} teaspoons, including sugar in coffee, cakes, honey and juice. The less, the better.`]);

  // Преработено месо (червеното месо е в седмичния ритъм).
  if (!veg) add('limit', ['Колбаси, шунка, пушено месо и готови храни: колкото може по-рядко, защото са солени и с много наситени мазнини.',
    'Sausages, ham, smoked meat and ready meals: as rarely as you can, because they are salty and high in saturated fat.']);

  // Наситени мазнини при сърце, съдове, мазнини в кръвта, черен дроб и диабет.
  if (cardio || has('masld') || diabetes) {
    add('limit', [`Наситени мазнини под ${v.b.satFat} г на ден: по-малко тлъсто месо, масло, сметана и пълномаслени сирена.`,
      `Saturated fat under ${v.e.satFat} g a day: less fatty meat, butter, cream and full-fat cheese.`]);
  }

  // Алкохол — едно правило: напълно, частично или общо.
  const noAlcohol = [];
  if (F.pregnancy) noAlcohol.push(['бременността', 'the pregnancy']);
  if (has('cirrhosis')) noAlcohol.push(['черния дроб', 'your liver']);
  else if (has('masld')) noAlcohol.push(['мастния черен дроб', 'your fatty liver']);
  if (has('pancreatitis')) noAlcohol.push(['панкреаса', 'your pancreas']);
  if (has('alcohol')) noAlcohol.push(['лечението на зависимостта', 'your recovery']);
  if (has('tg')) noAlcohol.push(['триглицеридите', 'your triglycerides']);
  if (noAlcohol.length) {
    add('avoid', [`Алкохол: най-добре е да не пиете изобщо, заради ${list(noAlcohol.map(x => x[0]), false)}.`,
      `Alcohol: it is best not to drink at all, because of ${list(noAlcohol.map(x => x[1]), true)}.`]);
  } else if (has('gout')) {
    add('avoid', ['Бира и спиртни напитки: вдигат пикочната киселина и провокират пристъпи.', 'Beer and spirits: they raise uric acid and trigger attacks.']);
  } else if (has('af')) {
    add('limit', ['Алкохол: не повече от 3 питиета седмично, защото провокира пристъпите на мъждене.', 'Alcohol: no more than 3 drinks a week, because it triggers episodes of fibrillation.']);
  } else if (F.lactation) {
    add('limit', ['Алкохол: докато кърмите, най-безопасно е да не пиете.', 'Alcohol: while you are breastfeeding, it is safest not to drink.']);
  } else {
    add('notes', [`Алкохол: колкото по-малко, толкова по-добре, защото безопасно количество няма.${has('htn') ? ' Той вдига и налягането.' : ''}${insulin ? ' Може да свали кръвната захар, особено ако не сте яли.' : ''}${has('osa') ? ' Вечер засилва спиранията на дишането.' : ''}`,
      `Alcohol: the less, the better, because there is no safe amount.${has('htn') ? ' It also raises blood pressure.' : ''}${insulin ? ' It can lower your blood sugar, especially if you have not eaten.' : ''}${has('osa') ? ' In the evening it makes breathing pauses worse.' : ''}`]);
  }

  // Течности — колко и защо.
  if (F.dialysis) {
    add('limit', ['Течности: количеството между диализите определя нефрологът. Броят се и супите, млякото и плодовете с много вода.',
      'Fluids: your nephrologist sets the amount between sessions. Soups, milk and watery fruit count too.']);
  } else if (has('hf')) {
    add('limit', [`Течности: около ${v.b.fluids} л на ден общо, ако кардиологът не е определил друго.`, `Fluids: about ${v.e.fluids} l a day in total, unless your cardiologist has set a different amount.`]);
  } else if (!has('hypona')) {
    const wet = [];
    if (has('stones')) wet.push('stones');
    if (has('gout')) wet.push('gout');
    if (has('constipation')) wet.push('constipation');
    if (has('adpkd')) wet.push('adpkd');
    if (F.lactation) wet.push('lactation');
    if (has('uti')) wet.push('uti');
    if (F.classes.has('SGLT2')) wet.push('sglt2');
    add('prefer', [`Течности: около ${v.b.fluids} л на ден, предимно вода. Неподсладените чай и кафе също се броят.${because(wet, false)}`,
      `Fluids: about ${v.e.fluids} l a day, mostly water. Unsweetened tea and coffee count too.${because(wet, true)}`]);
  }

  // Белтък.
  if (F.ckd) {
    add('limit', [`Белтък: около ${v.b.protein} г на ден. Повече от него да идва от бобови, ядки и пълнозърнести храни, а месото и рибата да са по-малки порции.`,
      `Protein: about ${v.e.protein} g a day. Get more of it from pulses, nuts and whole grains, with smaller portions of meat and fish.`]);
  } else if (F.dialysis || F.age >= 65 || ['malnutrition', 'cancer', 'pressure', 'cirrhosis', 'bariatric'].some(has) || F.glp1) {
    const rich = veg ? (vegan ? ['тофу, бобови, ядки', 'tofu, pulses, nuts'] : ['яйца, извара, кисело мляко, бобови', 'eggs, cottage cheese, yogurt, pulses'])
      : ['яйца, извара, кисело мляко, риба, месо или бобови', 'eggs, cottage cheese, yogurt, fish, meat or pulses'];
    add('prefer', [`Белтък на всяко хранене, по 25–30 г (${rich[0]}), общо около ${v.b.protein} г на ден.`,
      `Protein at every meal, 25–30 g each time (${rich[1]}), about ${v.e.protein} g a day in total.`]);
  }

  // Фибри при черво, хемороиди и фисура.
  if (['diverticula', 'constipation', 'hemorrhoids', 'fissure'].some(has)) {
    add('prefer', [`Фибри поне ${v.b.fiber} г на ден: пълнозърнести храни, бобови, зеленчуци, плодове, сини сливи и ленено семе. Увеличавайте ги постепенно и пийте повече вода.`,
      `At least ${v.e.fiber} g of fiber a day: whole grains, pulses, vegetables, fruit, prunes and linseed. Increase it gradually and drink more water.`]);
  }

  // Калий и фосфор при бъбреци и висок калий.
  if (F.limitK) {
    add('limit', ['Калий: малки порции картофи, домати, банани, сушени плодове, бобови, ядки и спанак. Картофите нарежете и сварете в две води, като изхвърлите първата.',
      'Potassium: small portions of potatoes, tomatoes, bananas, dried fruit, pulses, nuts and spinach. Cut potatoes up and boil them in two changes of water, throwing the first away.']);
    add('avoid', ['Солеви заместители с калий, продавани като сол с намален натрий.', 'Potassium-based salt substitutes, sold as reduced-sodium salt.']);
  } else if (has('htn') && !kidney) {
    add('prefer', ['Храни с калий всеки ден: зеленчуци, плодове, бобови и кисело мляко. Калият помага налягането да спадне.',
      'Potassium-rich foods every day: vegetables, fruit, pulses and yogurt. Potassium helps lower blood pressure.']);
  }
  if (F.ckdAdvanced || F.dialysis) {
    add('limit', ['Фосфор: колбаси, топено сирене, кола и готови храни с фосфатни добавки (Е338–Е452).', 'Phosphorus: cured meats, processed cheese, cola and ready meals with phosphate additives (E338–E452).']);
  }

  // Диабет тип 2 и предиабет.
  if (diabetes) {
    add('prefer', has('gdm')
      ? ['Въглехидратите, поне 175 г на ден, разпределете в 3 основни и 2–3 малки хранения. Започвайте храненето със зеленчуците и белтъка, а хляба оставете за накрая: така захарта се вдига по-бавно.',
        'Spread your carbohydrates, at least 175 g a day, over 3 main meals and 2–3 snacks. Start your meal with vegetables and protein and leave the bread until last: this way blood sugar rises more slowly.']
      : ['Въглехидратите разпределете в 3–5 хранения през деня, без големи порции наведнъж. Започвайте храненето със зеленчуците и белтъка, а хляба оставете за накрая: така захарта се вдига по-бавно.',
        'Spread your carbohydrates over 3–5 meals a day, with no large portions at once. Start your meal with vegetables and protein and leave the bread until last: this way blood sugar rises more slowly.']);
    add('limit', ['Бял хляб, бял ориз, картофено пюре и сладки плодове като грозде и банан. Плодовете яжте по една порция наведнъж.',
      'White bread, white rice, mashed potatoes and sweet fruit such as grapes and bananas. Eat fruit one portion at a time.']);
  }
  if (t1) {
    add('prefer', ['Броете въглехидратите във всяко хранене: в менюто те са дадени в грамове за всяко ястие. По тях съобразявате дозата инсулин.',
      'Count the carbohydrates in every meal: the menu gives them in grams for each dish. Match your insulin dose to them.']);
  }
  if (diabetes || t1) {
    add('avoid', insulin
      ? ['Подсладени напитки и сокове: вдигат кръвната захар най-бързо. Изключение е ниската кръвна захар, когато са нужни точно те.',
        'Sweetened drinks and juices: they raise blood sugar fastest. The exception is low blood sugar, when they are exactly what you need.']
      : ['Подсладени напитки и сокове: вдигат кръвната захар най-бързо.', 'Sweetened drinks and juices: they raise blood sugar fastest.']);
  }
  if (insulin) {
    add('notes', ['Ако кръвната захар падне под 4 ммол/л, вземете 15 г бързи въглехидрати, например половин чаша сок или 3–4 таблетки глюкоза, и измерете отново след 15 минути.',
      'If your blood sugar drops below 4 mmol/l, take 15 g of fast-acting carbohydrate, such as half a glass of juice or 3–4 glucose tablets, and check again after 15 minutes.']);
    if (F.goal === 'lose') add('notes', ['Тъй като ще ядете по-малко, през първите седмици измервайте кръвната захар по-често.', 'Because you will be eating less, check your blood sugar more often during the first weeks.']);
  }

  // GLP-1 агонист.
  if (F.glp1) {
    add('prefer', ['По-малки и по-чести хранения: малка закуска и после на всеки 3–4 часа. Яжте бавно и спрете при първото засищане. На всяко хранене има белтък, зеленчуци и пълнозърнести храни.',
      'Smaller, more frequent meals: a small breakfast and then every 3–4 hours. Eat slowly and stop as soon as you feel full. Have protein, vegetables and whole grains at every meal.']);
    add('limit', ['Големи и мазни хранения: засилват гаденето. Алкохолът засилва и гаденето, и киселините.', 'Large and fatty meals: they make nausea worse. Alcohol worsens both nausea and heartburn.']);
    add('notes', ['Пийте достатъчно течности, защото гаденето и диарията могат да Ви обезводнят. Срещу запек помагат водата и фибрите. В дните след започване или увеличаване на дозата яжте по-леко.',
      'Drink enough fluid, because nausea and diarrhea can dehydrate you. Water and fiber help against constipation. In the days after starting or increasing the dose, eat lighter meals.']);
    add('notes', ['Само белтъкът не пази мускулите: нужни са и силови упражнения поне 3 пъти седмично.', 'Protein alone does not protect muscle: you also need strength exercises at least 3 times a week.']);
    if (F.mealsPerDay === 3) add('notes', ['Ако Ви се гади или се засищате бързо, разделете храната на 4 или 5 по-малки хранения.', 'If you feel sick or get full quickly, split your food into 4 or 5 smaller meals.']);
  }

  // Отслабване.
  if (F.goal === 'lose') {
    add('prefer', ['Чинията: половината зеленчуци, една четвърт белтък (месо, риба, яйца или бобови) и една четвърт пълнозърнести храни. Хранете се бавно, поне 15–20 минути.',
      'Your plate: half vegetables, a quarter protein (meat, fish, eggs or pulses) and a quarter whole grains. Eat slowly, for at least 15–20 minutes.']);
    add('notes', ['Реалистичната цел е 5–10% от теглото за 6 месеца. Ако част от килограмите се върнат, това не е провал: продължете.',
      'A realistic goal is 5–10% of your weight in 6 months. If some of the weight comes back, that is not failure: keep going.']);
  }

  // Подагра.
  if (has('gout')) {
    add('avoid', diabetes || t1 ? ['Карантия: черен дроб и бъбреци.', 'Offal: liver and kidneys.']
      : ['Карантия (черен дроб, бъбреци) и подсладени напитки с фруктоза.', 'Offal (liver, kidneys) and drinks sweetened with fructose.']);
    add('limit', ['Червено месо, морски дарове, сардини и аншоа: малки порции и по-рядко.', 'Red meat, seafood, sardines and anchovies: small portions and less often.']);
    if (!F.prefs.has('noDairy') && !vegan) {
      add('prefer', has('stones')
        ? ['Нискомаслени млечни продукти всеки ден: понижават пикочната киселина, а калцият в тях, 1000–1200 мг на ден, предпазва от камъни.', 'Low-fat dairy every day: it lowers uric acid, and its calcium, 1000–1200 mg a day, protects against stones.']
        : ['Нискомаслени млечни продукти всеки ден: помагат на пикочната киселина да спадне.', 'Low-fat dairy every day: it helps lower uric acid.']);
    }
  }

  // Кости: остеопороза, менопауза и след 65 г.
  if (has('osteoporosis') || F.age >= 65 || F.menopause) {
    const ca = vegan || F.prefs.has('noDairy') ? ['растителни напитки с калций, тофу, бадеми и зелени листни зеленчуци', 'calcium-fortified plant drinks, tofu, almonds and leafy greens']
      : ['2–3 порции млечни (чаша кисело мляко, 30 г сирене), сардини с костите, бадеми и зелени листни зеленчуци', '2–3 portions of dairy (a glass of yogurt, 30 g of cheese), sardines with bones, almonds and leafy greens'];
    add('prefer', [`Калций около 1000–1200 мг на ден от храната: ${ca[0]}.`, `About 1000–1200 mg of calcium a day from food: ${ca[1]}.`]);
    add('notes', ['Витамин D: обичайната доза е 800–1000 IU на ден като добавка, по назначение.', 'Vitamin D: the usual dose is 800–1000 IU a day as a supplement, as prescribed.']);
  }

  // Желязо.
  if (has('anemia') || has('heavy')) {
    add('prefer', [`Храни с желязо всеки ден: ${veg ? 'бобови, елда, яйца, тиквени семки и тъмнозелени листни зеленчуци' : 'постно червено месо, бобови, елда, яйца и тиквени семки'}. Яжте ги с нещо, богато на витамин C: чушка, домат, цитрус или киви.`,
      `Iron-rich foods every day: ${veg ? 'pulses, buckwheat, eggs, pumpkin seeds and dark leafy greens' : 'lean red meat, pulses, buckwheat, eggs and pumpkin seeds'}. Eat them with something rich in vitamin C: pepper, tomato, citrus or kiwi.`]);
    add('limit', ['Чай и кафе: поне час след храненето, защото пречат на усвояването на желязото.', 'Tea and coffee: at least an hour after meals, because they reduce iron absorption.']);
  }

  // Черен дроб.
  if (has('masld')) add('avoid', ['Подсладени напитки и сокове: фруктозата в тях натрупва мазнини в черния дроб.', 'Sweetened drinks and juices: the fructose in them builds up fat in the liver.']);

  // Хранителни ограничения.
  if (vegan) add('notes', ['Веганско хранене: витамин B12 като добавка е задължителен. Калций взимайте от обогатени растителни напитки, тофу и бобови. Йодът и омега-3 мазнините се обсъждат.',
    'Vegan diet: a vitamin B12 supplement is essential. Get calcium from fortified plant drinks, tofu and pulses. Iodine and omega-3 fats should be discussed.']);
  else if (veg) add('notes', ['Вегетарианско хранене: витамин B12 идва от млечните продукти и яйцата, а желязото от бобовите и зеленчуците се усвоява по-добре с витамин C.',
    'Vegetarian diet: vitamin B12 comes from dairy and eggs, and iron from pulses and vegetables is absorbed better with vitamin C.']);
  if (F.classes.has('METFORMIN')) add('notes', ['Метформин: при дългогодишен прием изследвайте периодично витамин B12.', 'Metformin: if you take it for years, have your vitamin B12 checked from time to time.']);
  if (gf) add('avoid', ['Пшеница, ръж, ечемик и всичко с тях. Овес само ако е сертифициран без глутен.', 'Wheat, rye, barley and anything made with them. Oats only if certified gluten-free.']);
  if (F.prefs.has('lactoseFree')) add('notes', ['Млечни продукти без лактоза. Твърдите отлежали сирена обикновено се понасят.', 'Lactose-free dairy. Hard aged cheeses are usually tolerated.']);

  // Специфичното за всяко заболяване.
  for (const k of F.keys) {
    const S = SPECIFIC[k];
    if (!S) continue;
    for (const kind of ['prefer', 'limit', 'avoid', 'notes', 'warnings', 'clinician']) {
      const xs = typeof S[kind] === 'function' ? S[kind](v, F) : S[kind];
      for (const p of xs || []) add(kind, p);
    }
  }
  return R;
}

/*
 * Правилата, които са само на едно заболяване. Солта, алкохолът, течностите, белтъкът,
 * фибрите и калият са в общите правила по-горе, с причините, затова тук ги няма.
 */
const SPECIFIC = {
  tg: { prefer: [['Мазна риба (скумрия, сьомга, пъстърва, сардини) 2 пъти седмично: омега-3 мазнините понижават триглицеридите.', 'Oily fish (mackerel, salmon, trout, sardines) twice a week: omega-3 fats lower triglycerides.']] },
  dyslip: { prefer: [['Овесени ядки, бобови и ядки по-често: фибрите и растителните мазнини понижават холестерола.', 'Oats, pulses and nuts more often: their fiber and plant fats lower cholesterol.']] },
  hf: { notes: [['Претегляйте се всяка сутрин. Ако наддадете с повече от 2 кг за 3 дни, обадете ми се или на кардиолога си.', 'Weigh yourself every morning. If you gain more than 2 kg in 3 days, call me or your cardiologist.']] },
  copd: { prefer: [['По-малки и по-чести хранения, ако задухът Ви пречи да се храните.', 'Smaller, more frequent meals if breathlessness makes eating difficult.']] },
  dementia: { notes: [['Напомняне и помощ при храненето, ако е нужно. Теглото се мери всеки месец; при неволна загуба добавете храна.', 'Reminders and help with meals if needed. Weight is checked monthly; with unintended loss, add more food.']] },
  stones: {
    prefer: (v, F) => (F.cond.has('gout') || F.keys.has('gout') ? [] : [['Млечни продукти не спирайте: калцият от храната, 1000–1200 мг на ден, предпазва от камъни.', 'Do not stop dairy: calcium from food, 1000–1200 mg a day, protects against stones.']]),
    limit: (v, F) => [['Спанак, цвекло, ядки и какао (много оксалати): умерено.', 'Spinach, beetroot, nuts and cocoa (high in oxalate): in moderation.'],
      ...(F.cond.has('gout') || F.keys.has('gout') ? [] : [['Животински белтък: умерено, месото и рибата в малки порции.', 'Animal protein: in moderation, with small portions of meat and fish.']])],
    avoid: [['Добавки с витамин C в големи дози.', 'High-dose vitamin C supplements.']],
  },
  hypok: { prefer: [['Храни с калий всеки ден: зеленчуци, бобови, плодове, картофи и кисело мляко.', 'Potassium-rich foods every day: vegetables, pulses, fruit, potatoes and yogurt.']] },
  hypona: { warnings: [['Колко течности и сол да приемате ще определим според изследванията. Дотогава не пийте повече вода от обичайното.', 'We will decide how much fluid and salt you need based on your tests. Until then, do not drink more water than usual.']] },
  celiac: { notes: [['Глутенът е и в следите: общи тигани, панировки, сосове и бира. Купувайте продукти със знак „без глутен“.', 'Gluten also hides in traces: shared pans, breadcrumbs, sauces and beer. Buy products labeled gluten-free.']] },
  gerd: {
    prefer: [['По-малки порции. Последното хранене 2–3 часа преди лягане.', 'Smaller portions. Your last meal 2–3 hours before going to bed.']],
    limit: [['Мазни и пържени храни, шоколад, кафе, газирани напитки и алкохол, ако засилват киселините.', 'Fatty and fried food, chocolate, coffee, fizzy drinks and alcohol, if they make heartburn worse.']],
  },
  ulcer: { limit: [['Алкохол, силно лютиво и много кафе, ако засилват болката. Противовъзпалителни обезболяващи само по назначение.', 'Alcohol, very spicy food and a lot of coffee, if they make the pain worse. Anti-inflammatory painkillers only as prescribed.']] },
  ibs: {
    prefer: [['Редовни хранения, без да пропускате. Овесени ядки и ленено семе при подуване.', 'Regular meals, without skipping. Oats and linseed for bloating.']],
    limit: [['Пресни плодове до 3 порции на ден. Бобови, лук и зеле в малки порции. Чай и кафе до 3 чаши, газирани напитки рядко.', 'Fresh fruit up to 3 portions a day. Pulses, onions and cabbage in small portions. Tea and coffee up to 3 cups, fizzy drinks rarely.']],
    notes: [['Ако оплакванията продължават, диета с малко ферментиращи храни (FODMAP) се прави само с диетолог и за кратко.', 'If symptoms continue, a low-FODMAP diet is done only with a dietitian and for a short time.']],
  },
  ibd: { notes: [['При обостряне или стеснение на червата храната е с малко фибри, по указание на диетолог.', 'During a flare or with a narrowed bowel, food is low in fiber, as advised by a dietitian.']] },
  cirrhosis: { prefer: [['Лека закуска преди сън, например кисело мляко или филия с извара. Не стойте гладни повече от 6 часа през деня.', 'A light snack before bed, such as yogurt or a slice of bread with cottage cheese. Do not go more than 6 hours without food during the day.']] },
  gallstones: {
    prefer: [['Редовни хранения. Ако отслабвате, плавно.', 'Regular meals. If you are losing weight, do it gradually.']],
    limit: [['Обилни и много мазни хранения.', 'Large and very fatty meals.']],
  },
  pancreatitis: {
    prefer: [['5–6 по-малки хранения на ден. Ензимите, ако са назначени, с всяко хранене.', '5–6 smaller meals a day. Enzymes, if prescribed, with every meal.']],
    avoid: [['Тютюнопушене.', 'Smoking.']],
  },
  dysphagia: {
    warnings: [['Менюто не е съобразено с преглъщането. Консистенцията на храната и течностите ще определим след оценка от логопед.', 'The menu is not adapted for swallowing difficulties. We will set the texture of food and drinks after an assessment by a speech therapist.']],
    clinician: [['Дисфагия: консистенцията на храната и течностите се определя след оценка на преглъщането (логопед, IDDSI); менюто не е пригодено.', 'Dysphagia: food and fluid texture is set after a swallowing assessment (speech therapist, IDDSI); the menu is not adapted.']],
  },
  bariatric: { warnings: [['Режимът е ориентир. След бариатрична операция храненията и добавките следват схемата на екипа, който Ви е оперирал.', 'This plan is a guide. After bariatric surgery, meals and supplements follow the schedule of your surgical team.']] },
  pcos: { prefer: [['Храни с нисък гликемичен индекс: бобови, пълнозърнести, зеленчуци и плодове с кората.', 'Foods with a low glycemic index: pulses, whole grains, vegetables and fruit with the skin on.']] },
  hyperthyroid: { avoid: [['Добавки с йод и водорасли.', 'Iodine and seaweed supplements.']] },
  vitd: { prefer: [['Мазна риба, яйца и обогатени млечни продукти. Добавката с витамин D по назначение.', 'Oily fish, eggs and fortified dairy. Vitamin D supplement as prescribed.']] },
  b12: { prefer: [['Месо, риба, яйца и млечни продукти. При веганско хранене добавката е задължителна.', 'Meat, fish, eggs and dairy. On a vegan diet a supplement is essential.']] },
  folate: { prefer: [['Листни зеленчуци, бобови, броколи и пълнозърнести храни всеки ден.', 'Leafy greens, pulses, broccoli and whole grains every day.']] },
  hemochromatosis: {
    avoid: [['Добавки с желязо и с витамин C. Сурови миди и стриди.', 'Iron and vitamin C supplements. Raw mussels and oysters.']],
    limit: [['Алкохол и червено месо: умерено.', 'Alcohol and red meat: in moderation.']],
  },
  malnutrition: { prefer: [['5–6 хранения на ден с енергийно богати храни: зехтин, ядки, пълномаслено кисело мляко, сирене. Добавки за пиене по назначение.', '5–6 meals a day with energy-dense foods: olive oil, nuts, full-fat yogurt, cheese. Oral nutritional supplements as prescribed.']] },
  cancer: { notes: [['Ако левкоцитите Ви са ниски, яжте само добре сготвени храни и измити плодове.', 'If your white cell count is low, eat only well-cooked food and washed fruit.']] },
  iem: {
    warnings: [['Това меню не е подходящо при вродено нарушение на обмяната. Нужен е специализиран режим от метаболитен център.', 'This menu is not suitable for an inherited metabolic disorder. A specialized diet from a metabolic center is needed.']],
    clinician: [['Вродено нарушение на обмяната (фенилкетонурия, непоносимост към фруктоза и др.): нужен е специализиран режим — менюто не е приложимо.', 'Inherited metabolic disorder (phenylketonuria, fructose intolerance etc.): a specialized diet is needed and this menu does not apply.']],
  },
  eating: {
    warnings: [['Режимът е само ориентир и се обсъжда с екипа, който Ви лекува.', 'This plan is only a guide and is discussed with your treatment team.']],
    clinician: [['Хранително разстройство (NICE NG69): режимът се изготвя от специализиран екип; не давайте на пациента отчета с калориите.', 'Eating disorder (NICE NG69): the plan is made by a specialist team; do not give the patient the report with calorie figures.']],
  },
  alcohol: { notes: [['Витамин B1 (тиамин) по назначение. Редовни хранения, без да пропускате.', 'Vitamin B1 (thiamine) as prescribed. Regular meals, without skipping.']] },
  psa: { notes: [['Ако приемате метотрексат или започвате ново лекарство, обсъдете алкохола с лекаря, който Ви го е назначил.', 'If you take methotrexate or are starting a new medicine, discuss alcohol with the doctor who prescribed it.']] },
  rheum: { notes: [['Ако приемате метотрексат или започвате ново лекарство, обсъдете алкохола с лекаря, който Ви го е назначил.', 'If you take methotrexate or are starting a new medicine, discuss alcohol with the doctor who prescribed it.']] },
  pressure: { prefer: [['Белтък и енергия на всяко хранене. При слаб апетит добавки за пиене по назначение.', 'Protein and energy at every meal. With a poor appetite, oral nutritional supplements as prescribed.']] },
  parkinson: {
    prefer: [['Ферментирало мляко и повече вода и фибри срещу запека.', 'Fermented milk and more water and fiber against constipation.']],
    notes: [['Ако ефектът на леводопата се колебае, повече от белтъка може да се премести вечер, с помощта на диетолог.', 'If the effect of levodopa fluctuates, more of your protein can be moved to the evening, with a dietitian’s help.']],
  },
  osa: { limit: [['Алкохол вечер: засилва спиранията на дишането.', 'Alcohol in the evening: it makes breathing pauses worse.']] },
  adpkd: { limit: [['Кафе: до 400 мг кофеин на ден, около 4 чаши.', 'Coffee: up to 400 mg of caffeine a day, about 4 cups.']] },
  gastroparesis: { prefer: [['Малки и чести хранения, пасирани или добре сготвени, с по-малко мазнини и груби фибри.', 'Small, frequent meals, puréed or well cooked, with less fat and coarse fiber.']] },
  transplant: {
    avoid: [['Грейпфрут и помело и сокът им: повишават нивото на такролимус и циклоспорин.', 'Grapefruit, pomelo and their juice: they raise levels of tacrolimus and ciclosporin.']],
    notes: [['Добре сготвени храни и чисти продукти. Калий, фосфор и белтък по резултатите от изследванията.', 'Well-cooked food and clean produce. Potassium, phosphorus and protein according to your test results.']],
  },
  bph: { limit: [['Течности вечер, ако ставате често нощем. Кафе и алкохол: умерено.', 'Drinks in the evening, if you get up often at night. Coffee and alcohol: in moderation.']] },
  incontinence: { limit: [['Кафе и други напитки с кофеин: по-малко, ако имате чести позиви.', 'Coffee and other caffeinated drinks: less, if you have frequent urges.']] },
  pregnancy: {
    prefer: [['Фолиева киселина 400 мкг на ден, поне до 12. седмица, йодирана сол и риба с малко живак 2 пъти седмично.', 'Folic acid 400 µg a day, at least until week 12, iodized salt, and fish low in mercury twice a week.']],
    avoid: [['Сурово или недопечено месо, риба и яйца, непастьоризирани млечни продукти, черен дроб, риба меч, акула и много риба тон.', 'Raw or undercooked meat, fish and eggs, unpasteurized dairy, liver, swordfish, shark and a lot of tuna.']],
    limit: [['Кафе: до 200 мг кофеин на ден, около 2 чаши.', 'Coffee: up to 200 mg of caffeine a day, about 2 cups.']],
    notes: (v, F) => [[`Препоръчителното наддаване за цялата бременност зависи от теглото преди нея: при ИТМ под 18,5 е 12,5–18 кг, при 18,5–24,9 е 11,5–16 кг, при 25–29,9 е 7–11,5 кг, а от 30 нагоре 5–9 кг.`,
      'Recommended weight gain for the whole pregnancy depends on your weight before it: with a BMI under 18.5 it is 12.5–18 kg, with 18.5–24.9 it is 11.5–16 kg, with 25–29.9 it is 7–11.5 kg, and from 30 upwards 5–9 kg.']],
  },
  lactation: { notes: [['Около 500 kcal повече на ден и течности 2,5–3 л. Йод и витамин D по препоръка.', 'About 500 kcal more a day and 2.5–3 l of fluids. Iodine and vitamin D as advised.']] },
  amenorrhea: {
    warnings: [['Липсата на менструация трябва да се изясни. Ако се дължи на недостиг на енергия, режимът не бива да е с дефицит.', 'Missing periods need to be investigated. If the cause is too little energy, the plan must not have a deficit.']],
    clinician: [['Липса на менструация: изключете бременност. При ниско тегло, много тренировки или ограничено хранене причината може да е функционална хипоталамична аменорея — режимът не трябва да е с дефицит (Endocrine Society 2017).', 'Absent periods: rule out pregnancy. With low weight, heavy training or restricted eating, functional hypothalamic amenorrhea is possible and the plan should have no deficit (Endocrine Society 2017).']],
  },
  heavy: { notes: [['Кръвна картина при обилно кървене. Добавка с желязо само при доказан недостиг.', 'A blood count with heavy bleeding. An iron supplement only with a confirmed deficiency.']] },
  pms: { prefer: [['Калций 1000–1200 мг на ден от млечни продукти, сирене, сардини, тофу и бадеми.', 'Calcium 1000–1200 mg a day from dairy, cheese, sardines, tofu and almonds.']] },
  allergy: {
    clinician: [['Хранителна алергия: впишете конкретния алерген в „Алергии“ (ядки, риба, мляко, яйца, соя, глутен) — тогава менюто го изключва.', 'Food allergy: record the specific allergen under “Allergies” (nuts, fish, milk, eggs, soy, gluten) so that the menu excludes it.']],
  },
  asthma: { prefer: [['Повече плодове и зеленчуци. Храни се избягват само при доказана алергия.', 'More fruit and vegetables. Foods are avoided only if an allergy is confirmed.']] },
  migraine: { prefer: [['Редовни хранения, без да пропускате, и достатъчно вода. Кафето в сходно количество всеки ден.', 'Regular meals, without skipping, and enough water. Coffee at a similar amount every day.']] },
  anxiety: { limit: [['Кафе и енергийни напитки: малко и само сутрин.', 'Coffee and energy drinks: a little, and only in the morning.']] },
};

/** Защо няма отслабване — по заболяването (вместо целта „отслабване“). */
export const NO_LOSE = {
  cirrhosis: ['При цироза отслабването не е безопасно без указание на хепатолога, затова режимът е за поддържане на теглото.', 'With cirrhosis, weight loss is not safe without your liver specialist’s advice, so this plan maintains your weight.'],
  malnutrition: ['При недохранване и загуба на мускули отслабването вреди, затова режимът е за поддържане или покачване на теглото.', 'With undernutrition and muscle loss, weight loss is harmful, so this plan maintains or increases your weight.'],
  cancer: ['По време на онкологичното лечение режимът е за поддържане на теглото. Отслабване само със съгласието на онколога.', 'During cancer treatment this plan maintains your weight. Weight loss only with your oncologist’s agreement.'],
  eating: ['Режимът не е за отслабване.', 'This plan is not for weight loss.'],
  pressure: ['Режимът е за поддържане на теглото, за да зарасне раната.', 'This plan maintains your weight so that the wound can heal.'],
  lactation: ['Режимът е за поддържане на теглото. След първите 2 месеца плавното отслабване до 0,5 кг седмично е безопасно.', 'This plan maintains your weight. After the first 2 months, gradual weight loss of up to 0.5 kg a week is safe.'],
  pregnancy: ['По време на бременност не се отслабва: режимът е за наддаване в препоръчаните граници.', 'There is no weight loss during pregnancy: the plan is for weight gain within the recommended range.'],
  gdm: ['По време на бременност не се отслабва: режимът е за наддаване в препоръчаните граници.', 'There is no weight loss during pregnancy: the plan is for weight gain within the recommended range.'],
};

/* ------------------------------ ритъм, навици ------------------------------ */

/** Седмичният ритъм — [bg, en]. */
export function weeklyPairs(F) {
  const has = hasOf(F);
  const veg = F.prefs.has('vegetarian');
  const out = [];
  if (!veg && !F.prefs.has('noFish')) out.push(['Риба 2 пъти седмично, едната мазна: скумрия, сьомга или пъстърва.', 'Fish twice a week, one of them oily: mackerel, salmon or trout.']);
  out.push(has('ibs') ? ['Бобови в малки порции, ако не Ви подуват.', 'Pulses in small portions, if they do not bloat you.']
    : F.limitK ? ['Бобови: малки порции и по-рядко заради калия.', 'Pulses: small portions and less often, because of potassium.']
      : ['Бобови поне 3 пъти седмично: леща, боб, нахут или грах.', 'Pulses at least 3 times a week: lentils, beans, chickpeas or peas.']);
  if (!veg && !F.prefs.has('noRedMeat')) {
    out.push(has('gout') ? ['Червено месо до веднъж седмично заради подаграта; колбаси по изключение.', 'Red meat up to once a week because of gout; cured meats only as an exception.']
      : ['Червено месо до 2 пъти седмично, постно; колбаси по изключение.', 'Red meat up to twice a week, lean; cured meats only as an exception.']);
  }
  if (!F.prefs.has('noEgg') && !F.prefs.has('vegan')) out.push(['Яйца: до едно на ден е безопасно и при повечето сърдечни заболявания.', 'Eggs: up to one a day is safe, even with most heart conditions.']);
  out.push(has('dm2') || has('dm1') || has('prediabetes')
    ? ['Сладкиш рядко, в малка порция и след основно хранене.', 'Cake or sweets rarely, in a small portion and after a main meal.']
    : ['Сладкиш веднъж седмично, в малка порция.', 'Cake or sweets once a week, in a small portion.']);
  return out;
}

/** Навиците — [bg, en] по целта. */
export function habitPairs(F) {
  const out = [];
  if (F.goal === 'lose') {
    out.push(['Планирайте менюто и пазаруването за седмицата: така купувате по-малко излишни неща.', 'Plan your menu and shopping for the week: you will buy fewer things you do not need.']);
    out.push(['Хранете се бавно и без екран и спрете при приятна ситост. Първо зеленчуците, после белтъкът.', 'Eat slowly, away from screens, and stop when pleasantly full. Vegetables first, then protein.']);
    out.push(['Вода, чай или кафе без захар вместо подсладени напитки и сокове.', 'Water, tea or coffee without sugar instead of sweetened drinks and juices.']);
    out.push(['Спете 7–9 часа: недоспиването увеличава апетита.', 'Sleep 7–9 hours: lack of sleep increases appetite.']);
  }
  if (F.goal === 'gain') {
    out.push(['Хранете се на всеки 3 часа и добавяйте към ястията зехтин, ядки, авокадо или пълномаслено кисело мляко.', 'Eat every 3 hours and add olive oil, nuts, avocado or full-fat yogurt to your dishes.']);
    out.push(['Пийте след храненето, не преди него, за да не се засищате с течности.', 'Drink after meals, not before, so that you do not fill up on fluid.']);
    out.push(['Смути и кисело мляко с ядки са лесни закуски с много енергия.', 'Smoothies and yogurt with nuts are easy, energy-rich snacks.']);
    out.push(['При слаб апетит хранителните добавки за пиене (поне 400 kcal и 30 г белтък на ден) се дават по назначение.', 'With a poor appetite, oral nutritional supplements (at least 400 kcal and 30 g of protein a day) are given as prescribed.']);
  }
  if (F.goal === 'maintain') {
    out.push(['Претегляйте се веднъж седмично. Ако теглото се покачи с 2 кг, намалете порциите хляб, ориз и мазнини.', 'Weigh yourself once a week. If you gain 2 kg, cut down on bread, rice and fats.']);
    out.push(['Гответе вкъщи повечето дни: така ядете по-малко сол, захар и мазнини.', 'Cook at home most days: you will eat less salt, sugar and fat.']);
  }
  out.push(F.strength
    ? ['Разпределете белтъка в 3–4 хранения по 25–40 г и се хранете до 2 часа след тренировка.', 'Spread your protein over 3–4 meals of 25–40 g and eat within 2 hours after training.']
    : F.age >= 65
      ? ['Движение всеки ден: разходки, общо поне 150 минути седмично, и упражнения за сила и равновесие 2–3 пъти седмично.', 'Move every day: walks adding up to at least 150 minutes a week, and strength and balance exercises 2–3 times a week.']
      : ['Движение: поне 150 минути седмично умерена активност и силови упражнения 2 пъти седмично.', 'Activity: at least 150 minutes a week of moderate activity and strength exercises twice a week.']);
  return out;
}

/** Вкус без много сол — [bg, en]. */
export const FLAVOR_PAIRS = [
  ['Лимон, оцет и чесън правят вкуса по-ярък и заместват голяма част от солта.', 'Lemon, vinegar and garlic brighten the taste and replace much of the salt.'],
  ['Билки: чубрица, джоджен, копър, магданоз, риган, босилек, мащерка и розмарин, пресни или сушени.', 'Herbs: savory, mint, dill, parsley, oregano, basil, thyme and rosemary, fresh or dried.'],
  ['Подправки: червен и черен пипер, кимион, куркума, джинджифил, канела и индийско орехче.', 'Spices: paprika and black pepper, cumin, turmeric, ginger, cinnamon and nutmeg.'],
  ['Печете зеленчуците на фурна или на скара вместо да ги варите: стават по-сладки.', 'Roast or grill vegetables instead of boiling them: they become sweeter.'],
  ['Сосове без сметана: кисело мляко с чесън и копър, тахан с лимон, доматен сос с босилек.', 'Sauces without cream: yogurt with garlic and dill, tahini with lemon, tomato sauce with basil.'],
  ['Препечените ядки и семки добавят хрупкавост и вкус на салатите и кашите.', 'Toasted nuts and seeds add crunch and flavor to salads and porridge.'],
];

/** Контролът на теглото — [bg, en] по целта. */
export function monitoringPairs(F) {
  if (F.goal === 'lose') {
    return [
      ['Претегляйте се веднъж седмично, сутрин, на гладно. Обиколката на талията мерете веднъж месечно.', 'Weigh yourself once a week, in the morning, before eating. Measure your waist once a month.'],
      ['След 4 седмици ще преценим резултата. Ако теглото спада с по-малко от 0,25 кг седмично 3 седмици подред, ще намалим енергията със 150–200 kcal или ще добавим движение; ако спада с повече от 1 кг седмично, ще я увеличим с 200 kcal.',
        'We will review your progress after 4 weeks. If you lose less than 0.25 kg a week for 3 weeks in a row, we will cut energy by 150–200 kcal or add activity; if you lose more than 1 kg a week, we will add 200 kcal.'],
      ['Когато стигнете целта, енергията се увеличава постепенно, със 100–200 kcal на седмица, до поддържане.', 'When you reach your goal, energy is increased gradually, by 100–200 kcal a week, up to maintenance.'],
    ];
  }
  if (F.goal === 'gain') {
    return [
      ['Претегляйте се веднъж седмично, при едни и същи условия.', 'Weigh yourself once a week, under the same conditions.'],
      ['Ако 3 седмици няма покачване, ще добавим 200–300 kcal; ако наддавате с повече от 1 кг седмично, ще намалим с 200 kcal.', 'If there is no gain for 3 weeks, we will add 200–300 kcal; if you gain more than 1 kg a week, we will take off 200 kcal.'],
    ];
  }
  return [['Претегляйте се веднъж седмично. Колебания до 1 кг нагоре или надолу са нормални.', 'Weigh yourself once a week. Changes of up to 1 kg either way are normal.']];
}

/* ---------------------------------- резюме ---------------------------------- */

/* Най-важното за човека — по реда на значимост, до 3 неща. */
function priorities(F) {
  const has = hasOf(F);
  const P = [];
  const add = (cond, bg, en) => { if (cond && !P.some(p => p[0] === bg)) P.push([bg, en]); };
  const salty = has('htn') || has('hf') || F.ckd || F.dialysis || ['gn', 'adpkd', 'ckd12', 'stones', 'cirrhosis'].some(has);
  add(has('celiac'), 'строго без глутен', 'strictly no gluten');
  // След 75 г. най-важното е да се храните достатъчно (ESPEN 2022, ADA 2026 за възрастните хора).
  add(F.age >= 75 && !F.ckd && !F.dialysis, 'достатъчно храна и белтък на всяко хранене', 'enough food and protein at every meal');
  add(F.age >= 75 && (F.ckd || F.dialysis), 'достатъчно храна, без да отслабвате', 'enough food so that you do not lose weight');
  add(F.dialysis, 'течностите и калият по указанията на нефролога', 'fluids and potassium as your nephrologist advises');
  add(F.ckd, 'умерено количество белтък', 'moderate protein');
  add(has('gdm'), 'въглехидратите, разпределени в 5–6 хранения', 'carbohydrates spread over 5–6 meals');
  add(has('dm1'), 'броенето на въглехидратите', 'counting carbohydrates');
  add((has('dm2') || has('prediabetes')) && F.age < 75, 'по-малко бързи въглехидрати', 'fewer fast-acting carbohydrates');
  add((has('dm2') || has('prediabetes')) && F.age >= 75, 'редовни хранения без ниска кръвна захар', 'regular meals without low blood sugar');
  add(salty, 'малко сол', 'little salt');
  add(has('hf'), 'течностите под контрол', 'fluids kept under control');
  add(has('stones'), 'много течности', 'plenty of fluids');
  add(has('gout'), 'без бира и карантия', 'no beer or offal');
  add(has('masld') || has('cirrhosis') || has('pancreatitis') || has('alcohol'), 'без алкохол', 'no alcohol');
  add(['malnutrition', 'cancer', 'pressure', 'cirrhosis'].some(has), 'белтък и енергия на всяко хранене', 'protein and energy at every meal');
  add(has('anemia') || has('heavy'), 'храни с желязо всеки ден', 'iron-rich foods every day');
  add(has('osteoporosis'), 'калций всеки ден', 'calcium every day');
  add(['chd', 'pad', 'stroke', 'dyslip', 'tg'].some(has), 'по-малко наситени мазнини', 'less saturated fat');
  add(has('ibs'), 'редовни хранения с по-малко бобови и лук', 'regular meals with fewer pulses and onions');
  add(['constipation', 'diverticula', 'hemorrhoids', 'fissure'].some(has), 'повече фибри и вода', 'more fiber and water');
  add(F.glp1, 'малки порции с белтък', 'small portions with protein');
  add(F.age >= 65 && !F.ckd && !F.dialysis, 'белтък на всяко хранене', 'protein at every meal');
  add(F.pregnancy, 'фолиевата киселина и безопасните храни', 'folic acid and safe foods');
  add(F.goal === 'lose', 'по-малки порции и повече зеленчуци', 'smaller portions and more vegetables');
  add(!P.some(p => /зеленчуци/.test(p[0])), 'повече зеленчуци', 'more vegetables');
  add(true, 'по-малко сол и захар', 'less salt and sugar');
  return P.slice(0, 3);
}

/**
 * Резюмето — писмото на лекаря към човека: на какво се основава режимът, целта, защо е
 * избран моделът, дневните числа, най-важното и кога ще прегледаме резултата.
 * Връща [bg абзаци, en абзаци].
 */
export function summaryFor(F) {
  const v = numbers(F);
  const why = patternWhy(F, v);
  // В изреченето — само заболяванията (бременността, кърменето и лечението с антикоагулант си имат обяснение),
  // без запетаи вътре в името („ХБЗ, стадий 3“ → „ХБЗ стадий 3“).
  const ill = F.dx.filter(d => !/^Z3[3-9]|^Z92|^Z79|^Z0[0-2]/.test(d.code));
  const names = [...new Set(ill.map(d => String(d.name || '').replace(/, /g, ' ')).filter(Boolean))];
  const namesEn = [...new Set(ill.map(d => (EN_DX[d.code] || dxEn(d.code)).replace(/, /g, ' ')).filter(Boolean))];
  const cut = (xs, en) => (xs.length > 5
    ? `${xs.slice(0, 5).map(lower1).join(', ')}${en ? ` and ${xs.length - 5} more` : ` и още ${xs.length - 5}`}`
    : list(xs.map(lower1), en));
  const bg = [];
  const en = [];
  bg.push(`Съставих този режим специално за Вас според теглото (${v.b.weight} кг), ръста (${v.b.height} см), възрастта (${v.b.age} г.), движението${names.length ? ` и заболяванията Ви: ${cut(names, false)}` : ' и навиците Ви'}.`);
  en.push(`I have put this plan together for you based on your weight (${v.e.weight} kg), height (${v.e.height} cm), age (${v.e.age}), activity${namesEn.length ? ` and your conditions: ${cut(namesEn, true)}` : ' and habits'}.`);
  if (F.pregnancy) {
    bg.push('Целта е наддаване в препоръчаните за бременността граници.');
    en.push('The aim is weight gain within the range recommended for pregnancy.');
  } else if (F.goal === 'lose') {
    bg.push(`Целта е да отслабвате плавно, с около ${v.b.weeklyKg} кг седмично${F.targetWeight && F.weeks ? `, до ${v.b.target} кг за около ${v.b.weeks} седмици` : ''}.`);
    en.push(`The aim is gradual weight loss of about ${v.e.weeklyKg} kg a week${F.targetWeight && F.weeks ? `, down to ${v.e.target} kg in about ${v.e.weeks} weeks` : ''}.`);
  } else if (F.goal === 'gain') {
    bg.push(`Целта е постепенно да наддадете, с около ${v.b.weeklyKg} кг седмично${F.targetWeight && F.weeks ? `, до ${v.b.target} кг` : ''}.`);
    en.push(`The aim is to gain weight gradually, about ${v.e.weeklyKg} kg a week${F.targetWeight && F.weeks ? `, up to ${v.e.target} kg` : ''}.`);
  } else {
    bg.push('Целта е да запазите сегашното си тегло.');
    en.push('The aim is to keep your current weight.');
  }
  bg.push(`Препоръчвам Ви ${PATTERN_PHRASE[F.pattern][0]}, защото ${why.clause[0]}.`);
  en.push(`I recommend ${PATTERN_PHRASE[F.pattern][1]} because ${why.clause[1]}.`);
  bg.push(`Всеки ден Ви трябват около ${v.b.kcal} kcal и ${v.b.protein} г белтък${F.fluidsRestricted ? '' : `, около ${v.b.fluids} л течности`} и не повече от ${v.b.salt} г сол.`);
  en.push(`Each day you need about ${v.e.kcal} kcal and ${v.e.protein} g of protein${F.fluidsRestricted ? '' : `, about ${v.e.fluids} l of fluid`} and no more than ${v.e.salt} g of salt.`);
  const P = priorities(F);
  bg.push(`Най-важното за Вас: ${P.map(p => p[0]).join('; ')}.`);
  en.push(`What matters most for you: ${P.map(p => p[1]).join('; ')}.`);
  if (F.goal === 'maintain' || F.pregnancy) {
    bg.push('Претегляйте се веднъж седмично. Ако теглото се промени с повече от 2 кг, ще коригираме режима.');
    en.push('Weigh yourself once a week. If your weight changes by more than 2 kg, we will adjust the plan.');
  } else {
    bg.push('Претегляйте се веднъж седмично, сутрин на гладно. След 4 седмици ще преценим заедно резултата и при нужда ще променим режима.');
    en.push('Weigh yourself once a week, in the morning before eating. After 4 weeks we will review the results together and change the plan if needed.');
  }
  return [[bg.slice(0, 3).join(' '), bg.slice(3).join(' ')], [en.slice(0, 3).join(' '), en.slice(3).join(' ')]];
}

/* ------------------------------------ дете ------------------------------------ */

/* Детските диагнози с обяснение за родителя. */
const CHILD_WHY = {
  celiac: ['При цьолиакия менюто на детето е изцяло без глутен: без пшеница, ръж и ечемик. Безглутеновото хранене е за цял живот, а растежът показва дали е спазено.',
    'With celiac disease your child’s menu is completely gluten-free: no wheat, rye or barley. A gluten-free diet is for life, and growth shows whether it is working.'],
  dm1: ['При диабет тип 1 детето се храни като връстниците си, а инсулинът се съобразява с въглехидратите. Затова за всяко ястие те са дадени в грамове.',
    'With type 1 diabetes your child eats like other children, and insulin is matched to the carbohydrates. That is why each dish shows its carbohydrate in grams.'],
  constipation: ['При запек менюто е с достатъчно фибри и течности. Самото хранене обикновено не стига: лечението е по указанията на лекаря.',
    'For constipation the menu has enough fiber and fluid. Food alone is usually not enough: treatment follows the doctor’s advice.'],
  gerd: ['При рефлукс помагат по-малките порции и последното хранене 2–3 часа преди сън.', 'For reflux, smaller portions and a last meal 2–3 hours before sleep help.'],
  anemia: ['При анемия менюто е с повече храни, богати на желязо, заедно с витамин C. Млякото е не повече от препоръчаното за възрастта, защото в много количество пречи на желязото.',
    'For anemia the menu has more iron-rich foods together with vitamin C. Milk is kept to the amount recommended for the age, because large amounts interfere with iron.'],
  lactose: ['При непоносимост към лактоза млечните продукти са без лактоза, за да получава детето достатъчно калций.', 'For lactose intolerance dairy is lactose-free, so that your child still gets enough calcium.'],
  allergy: ['Менюто изключва храните, към които детето е алергично. Други храни не се спират без доказана алергия.', 'The menu leaves out the foods your child is allergic to. Other foods are not stopped without a confirmed allergy.'],
  atopic: ['При атопичен дерматит храни се спират само при доказана алергия, защото ненужните забрани вредят на растежа.', 'In atopic dermatitis, foods are stopped only with a confirmed allergy, because unnecessary restrictions harm growth.'],
};

/** Обясненията за дете — за родителя. F.child: { years, status, label, weightUsed }. */
export function childWhyItems(F) {
  const out = [];
  const st = F.child.status;
  const w = fmt(F.child.weightUsed, false);
  const we = fmt(F.child.weightUsed, true);
  if (st === 'over' || st === 'obese') {
    out.push({ key: 'childWeight', kind: 'age', codes: [], src: 'СЗО, AAP 2023', title: ['Тегло за възрастта', 'Weight for age'],
      text: [`Теглото на детето е над нормата за възрастта. При деца не се правят ограничителни диети: енергията е изчислена за коригирано тегло (${w} кг), така че детето да расте в ръст, а теглото да се покачва по-бавно. Най-добре помагат промените за цялото семейство в храненето, движението, съня и екраните.`,
        `Your child’s weight is above the normal range for their age. Children are not put on restrictive diets: energy is calculated for an adjusted weight (${we} kg), so that your child keeps growing in height while weight rises more slowly. Changes for the whole family in eating, activity, sleep and screen time help most.`] });
  } else if (st === 'thin' || st === 'severeThin') {
    out.push({ key: 'childWeight', kind: 'age', codes: [], src: 'СЗО', title: ['Тегло за възрастта', 'Weight for age'],
      text: [`Теглото на детето е под нормата за възрастта. Енергията е изчислена за теглото, което отговаря на ръста му (${w} кг), за да може да наддаде. Ще следим растежа отблизо.`,
        `Your child’s weight is below the normal range for their age. Energy is calculated for the weight that matches their height (${we} kg), so that they can catch up. We will follow their growth closely.`] });
  }
  const seen = new Set();
  for (const d of F.dx) {
    const k = (d.keys || []).find(x => CHILD_WHY[x]);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, kind: 'dx', codes: F.dx.filter(x => (x.keys || []).includes(k)).map(x => x.code), src: WHY[k]?.src || '',
      title: [d.name, EN_DX[d.code] || dxEn(d.code)], text: CHILD_WHY[k] });
  }
  return out;
}

/** Бележки за лекаря, когато избраният модел не пасва на заболяванията — [bg, en]. */
export function patternConflicts(F) {
  const out = [];
  const name = (id) => PATTERN_PHRASE[id];
  if (F.pattern === 'dash' && F.limitK) {
    out.push(['DASH е богат на калий, а при този човек калият се ограничава: порциите на богатите на калий храни са намалени. Обмислете средиземноморски модел.',
      'DASH is rich in potassium, which has to be limited here: portions of potassium-rich foods have been reduced. Consider the Mediterranean pattern.']);
  }
  if (F.pattern === 'highprotein' && (F.ckd || F.dialysis)) {
    out.push(['При ХБЗ белтъкът е по KDIGO, независимо от модела „с повече белтък“.', 'With CKD, protein follows KDIGO regardless of the higher-protein pattern.']);
  }
  if (F.pattern === 'lowcarb' && F.pregnancy) {
    out.push(['При бременност въглехидратите са поне 175 г на ден, затова моделът с по-малко въглехидрати е коригиран.', 'In pregnancy carbohydrates are at least 175 g a day, so the lower-carbohydrate pattern has been adjusted.']);
  }
  if (F.pattern === 'lowcarb' && F.age >= 75) {
    out.push(['След 75 г. модел с по-малко въглехидрати рядко е полезен и затруднява храненето; обмислете средиземноморски.', 'After 75, a lower-carbohydrate pattern is rarely helpful and makes eating harder; consider the Mediterranean pattern.']);
  }
  if (F.pattern !== F.patternAutoId && !out.length) {
    out.push([`По заболяванията програмата би избрала ${name(F.patternAutoId)[0]}; режимът е с избрания от Вас модел.`,
      `Based on the conditions, the program would choose ${name(F.patternAutoId)[1]}; the plan uses the pattern you selected.`]);
  }
  return out;
}

/** Резюмето за родителя — [bg абзаци, en абзаци]. */
export function childSummaryFor(F) {
  const names = [...new Set(F.dx.map(d => d.name).filter(Boolean))];
  const namesEn = [...new Set(F.dx.map(d => EN_DX[d.code] || dxEn(d.code)))];
  const kg = fmt(F.weight, false);
  const kge = fmt(F.weight, true);
  const bg = [`Съставих този режим за детето според възрастта, теглото (${kg} кг), ръста (${F.height} см) и движението му${names.length ? `, както и заболяванията: ${list(names.map(lower1), false)}` : ''}.`,
    'Целта не е определено тегло, а детето да расте по своята крива. Затова няма диети, а балансирано хранене като за връстниците, с повече зеленчуци и по-малко сладко и солено.',
    `Всеки ден детето има нужда от около ${F.kcal} kcal. Ще следим ръста и теглото на профилактичните прегледи.`];
  const en = [`I have put this plan together for your child based on their age, weight (${kge} kg), height (${F.height} cm) and activity${namesEn.length ? `, as well as their conditions: ${list(namesEn.map(lower1), true)}` : ''}.`,
    'The aim is not a particular weight but for your child to grow along their own curve. That is why there are no diets, just balanced eating like other children their age, with more vegetables and fewer sweet and salty foods.',
    `Each day your child needs about ${F.kcal} kcal. We will check height and weight at routine check-ups.`];
  return [[bg.slice(0, 2).join(' '), bg[2]], [en.slice(0, 2).join(' '), en[2]]];
}
