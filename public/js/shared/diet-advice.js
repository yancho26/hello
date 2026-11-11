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
  // own(тема, ключ) — дали числото по темата се казва в това обяснение (whyItems го определя).
  return { b, e, own: () => true };
}

/*
 * Кое обяснение казва числото по всяка тема, когато няколко заболявания го засягат: първото
 * по реда, което го има. Другите споменават темата без числото, за да не се повтаря.
 */
const OWNERS = {
  protein: (F) => [...(F.ckd || F.dialysis ? ['kidney'] : []), 'gn', 'adpkd', 'malnutrition', 'cancer', 'pressure', 'cirrhosis', 'osteoporosis', 'age'],
  salt: (F) => ['htn', 'hf', ...(F.ckd && !F.ckdAdvanced && !F.dialysis ? ['kidney'] : []), 'gn', 'adpkd', 'chd', 'stroke'],
  satFat: () => ['dyslip', 'chd'],
  fluids: () => ['hf', 'stones', 'constipation'],
  fiber: () => ['constipation', 'diverticula', 'hemorrhoids'],
  calcium: () => ['osteoporosis', 'menopause', 'pms', 'age'],
};

/** Какво има човекът — ключ на профил по МКБ-10 или заболяване от досието. */
const hasOf = (F) => (k) => F.keys.has(k) || F.cond.has(k);

/* Калий-съхраняващи лекарства (спиронолактон, еплеренон, финеренон): без съвет за повече калий. */
const kSparing = (F) => F.classes.has('MRA') || F.classes.has('FINERENONE');

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

/* Заболяванията на сърцето и съдовете — [bg, en], до 3. */
function heartList(F) {
  const has = hasOf(F);
  const out = [];
  if (has('chd')) out.push(['исхемичната болест на сърцето', 'coronary heart disease']);
  if (has('stroke')) out.push(['мозъчно-съдовата болест', 'the cerebrovascular disease']);
  if (has('pad')) out.push(['атеросклерозата', 'atherosclerosis']);
  if (has('hf')) out.push(['сърдечната недостатъчност', 'heart failure']);
  if (has('af')) out.push(['предсърдното мъждене', 'atrial fibrillation']);
  if (has('dyslip') || has('tg')) out.push(['повишените мазнини в кръвта', 'raised blood fats']);
  return out.slice(0, 3);
}

/* Заболяванията на сърцето и съдовете с думи — „при исхемичната болест на сърцето“. */
function heartWords(F, en) {
  return list(heartList(F).map(x => x[en ? 1 : 0]), en);
}

/**
 * Защо е избран моделът — като подчинено изречение след „защото“ (за резюмето) и като
 * самостоятелен текст (за обяснението). reason — от choosePattern или по избора на лекаря.
 */
function patternReason(F, id, reason, v) {
  const has = hasOf(F);
  const htn = has('htn');
  const sugar = has('dm1') || has('dm2') ? ['диабет', 'diabetes'] : has('pcos') ? ['поликистозни яйчници', 'polycystic ovaries'] : ['предиабет', 'prediabetes'];
  // Числата (белтък, сол и др.) са в обяснението на заболяването, затова тук е само изборът.
  const R = {
    muscle: has('cirrhosis')
      ? ['при цироза по-голямата опасност е загубата на мускули, а не излишното тегло',
        'in cirrhosis the bigger danger is losing muscle, not excess weight']
      : has('cancer')
        ? ['по време на онкологично лечение загубата на мускули е по-опасна от излишното тегло',
          'during cancer treatment, losing muscle is more dangerous than excess weight']
        : has('pressure') && !has('malnutrition')
          ? ['при рана от притискане храненето трябва преди всичко да дава достатъчно белтък',
            'with a pressure ulcer, your diet must above all provide enough protein']
          : ['при недохранване и загуба на мускули ограниченията вредят, а белтъкът и енергията помагат',
            'with undernutrition and muscle loss, restrictions do harm while protein and energy help'],
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
      'при поликистозни яйчници § намалява инсулиновата резистентност, която стои зад нередовния цикъл и много от оплакванията',
      'with polycystic ovary syndrome § reduces insulin resistance, which lies behind an irregular cycle and many of the symptoms'],
    liver: [
      '§ намалява мазнините в черния дроб дори при малко отслабване',
      '§ reduces fat in the liver even with modest weight loss'],
    htn: [
      `при високо кръвно налягане § има най-силните доказателства: с много зеленчуци, плодове, нискомаслени млечни продукти и бобови и с малко сол понижава горното налягане с около 11 mmHg при хора с хипертония${has('gout') && has('stones') ? '. § понижава и пикочната киселина, и риска от нови камъни в бъбреците' : has('gout') ? '. § понижава и пикочната киселина' : has('stones') ? '. § намалява и риска от нови камъни в бъбреците' : ''}`,
      `§ has the strongest evidence in high blood pressure: with plenty of vegetables, fruit, low-fat dairy and pulses and little salt, § lowers systolic pressure by about 11 mmHg in people with hypertension${has('gout') && has('stones') ? '. § also lowers uric acid and the risk of new kidney stones' : has('gout') ? '. § also lowers uric acid' : has('stones') ? '. § also lowers the risk of new kidney stones' : ''}`],
    gout: [
      '§ е с по-малко месо и с повече нискомаслени млечни продукти, зеленчуци и плодове, а това понижава пикочната киселина',
      '§ has less meat and more low-fat dairy, vegetables and fruit, which lowers uric acid'],
    stones: [
      'с малко сол, много зеленчуци и плодове и нормално количество млечни продукти § намалява риска от нови камъни',
      'with little salt, plenty of vegetables and fruit and a normal amount of dairy § lowers the risk of new stones'],
    mood: [
      'при депресия § подобрява настроението като допълнение към лечението',
      'in depression § improves mood alongside your treatment'],
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

/*
 * Причината за модела накратко — за писмото („… заради бъбреците и налягането“). Подробно е
 * в обяснението под писмото, затова тук не се повтаря. Без причина по заболяване — null.
 */
function patternShort(F) {
  const has = hasOf(F);
  const reason = chosenReason(F);
  const because = (xs) => [`заради ${list(xs.map(x => x[0]), false)}`, `because of ${list(xs.map(x => x[1]), true)}`];
  const htn = has('htn') ? [['налягането', 'blood pressure']] : [];
  const dm = has('dm2') || has('dm1') ? [['диабета', 'diabetes']] : [];
  switch (reason) {
    case 'muscle':
      return because([has('cirrhosis') ? ['цирозата', 'your cirrhosis'] : has('cancer') ? ['онкологичното лечение', 'your cancer treatment']
        : has('pressure') && !has('malnutrition') ? ['раната от притискане', 'your pressure ulcer'] : ['загубата на тегло и мускули', 'your weight and muscle loss']]);
    case 'kidney': return because([['бъбреците', 'your kidneys'], ...dm, ...htn]);
    case 'ibs': return because([['раздразненото черво', 'your irritable bowel']]);
    case 'pregnancy': return F.pregnancy ? because([['бременността', 'your pregnancy']]) : [', докато кърмите', ', while you are breastfeeding'];
    case 'heart': return because([...heartList(F), ...htn].slice(0, 3));
    case 'diabetes': return because([has('dm2') || has('dm1') ? ['диабета', 'your diabetes'] : ['предиабета', 'your prediabetes'], ...htn]);
    case 'pcos': return because([['поликистозните яйчници', 'polycystic ovary syndrome']]);
    case 'liver': return because([['мастния черен дроб', 'your fatty liver']]);
    case 'htn': return because([['налягането', 'your blood pressure'], ...(has('gout') ? [['подаграта', 'gout']] : []), ...(has('stones') ? [['камъните в бъбреците', 'kidney stones']] : [])]);
    case 'gout': return because([['подаграта', 'your gout'], ...(has('stones') ? [['камъните в бъбреците', 'kidney stones']] : [])]);
    case 'stones': return because([['камъните в бъбреците', 'your kidney stones']]);
    case 'mood': return ['за настроението', 'for your mood'];
    case 'weight': return F.goal === 'lose' ? ['за отслабването', 'to help you lose weight'] : because([['теглото', 'your weight']]);
    case 'bones': return because([['костите', 'your bones']]);
    case 'lowcarb': return has('dm2') || has('prediabetes') ? ['за кръвната захар', 'for your blood sugar'] : null;
    default: return null;
  }
}

/* ------------------------------ обясненията ------------------------------ */

/*
 * Защо режимът се променя при всяко заболяване — по ключа на профила (diet-icd.js).
 * why(v, F) връща [bg, en]; v.b и v.e са числата на човека на двата езика.
 */
const WHY = {
  // Числата (сол, белтък, мазнини, течности, фибри, калций) са само в едно обяснение — v.own(тема, ключ).
  htn: { src: 'ESC 2024', why: (v, F) => both(
    [`Солта задържа вода в тялото и вдига кръвното налягане. Затова солта в менюто е до ${v.b.salt} г на ден.`,
      `Salt makes the body hold on to water and raises blood pressure. That is why the salt in your menu is kept to ${v.e.salt} g a day.`],
    // Кои храни — в правилото за калия. Не при калий-съхраняващи лекарства (спиронолактон и др.).
    when(!F.limitK && !kSparing(F), 'Храните, богати на калий, също понижават налягането.', 'Potassium-rich foods also lower blood pressure.'),
    when(F.goal === 'lose', 'Всеки свален килограм понижава налягането с около 1 mmHg.', 'Every kilogram you lose lowers blood pressure by about 1 mmHg.')) },
  dm2: { src: 'ADA 2026', why: (v, F) => both(
    [`При диабет тип 2 на кръвната захар влияят най-много количеството и видът на въглехидратите. В менюто те са около ${v.b.carbs} г на ден, разпределени равномерно през деня, и идват предимно от пълнозърнести храни, бобови и зеленчуци.`,
      `In type 2 diabetes, the amount and type of carbohydrate affect blood sugar the most. Your menu has about ${v.e.carbs} g a day, spread evenly through the day, mostly from whole grains, pulses and vegetables.`],
    when(F.goal === 'lose', 'Свалянето на 5–10% от теглото подобрява кръвната захар, а при около 15% диабетът може да премине в ремисия.',
      'Losing 5–10% of your weight improves blood sugar, and at around 15% diabetes can go into remission.'),
    when(F.age >= 75, 'На Вашата възраст по-опасна е ниската кръвна захар, затова храненията са редовни и без пропуски.',
      'At your age, low blood sugar is the greater danger, so meals are regular and none are skipped.')) },
  dm1: { src: 'ADA 2026', why: () => [
    'При диабет тип 1 дозата инсулин се съобразява с въглехидратите в храната, затова за всяко ястие в менюто те са дадени в грамове. Не е нужно да ги ограничавате.',
    'In type 1 diabetes, your insulin dose is matched to the carbohydrate you eat, so every dish in the menu shows its carbohydrate in grams. You do not need to cut carbohydrates.'] },
  prediabetes: { src: 'ADA 2026', why: () => [
    'Предиабетът често се връща към нормата с промяна в храненето и движението. Свалянето на 5–7% от теглото и 150 минути движение седмично намаляват риска от диабет с около 58%.',
    'Prediabetes often returns to normal with changes in diet and activity. Losing 5–7% of your weight and 150 minutes of activity a week lower the risk of diabetes by about 58%.'] },
  // След изречението с показателя от досието — „Те се покачват…“, за да не започват две изречения еднакво.
  tg: { src: 'ESC/EAS 2019', why: (v, F) => [
    `${F.ind?.tg ? 'Те' : 'Триглицеридите'} се покачват най-вече от захар, бял хляб, сладки напитки и алкохол. Затова менюто е с малко от тях и с мазна риба, чиито омега-3 мазнини ги понижават.`,
    `${F.ind?.tg ? 'They' : 'Triglycerides'} rise mainly with sugar, white bread, sweet drinks and alcohol. Your menu has little of these and includes oily fish, whose omega-3 fats lower them.`] },
  dyslip: { src: 'ESC/EAS 2025', why: (v) => [
    `Наситените мазнини вдигат „лошия“ холестерол LDL, затова в менюто те са под ${v.b.satFat} г на ден, а мазнините идват предимно от зехтин, ядки и риба.`,
    `Saturated fat raises “bad” LDL cholesterol, so your menu keeps it under ${v.e.satFat} g a day, with fats coming mostly from olive oil, nuts and fish.`] },
  chd: { src: 'ESC 2021', why: (v) => {
    const parts = [];
    if (v.own('satFat', 'chd')) parts.push([`наситените мазнини са под ${v.b.satFat} г`, `saturated fat under ${v.e.satFat} g`]);
    if (v.own('salt', 'chd')) parts.push([`солта е до ${v.b.salt} г`, `salt up to ${v.e.salt} g`]);
    return parts.length
      ? [`При исхемична болест на сърцето наситените мазнини и солта натоварват съдовете, като вдигат холестерола и налягането. Затова в менюто ${list(parts.map(p => p[0]), false)} на ден.`,
        `In coronary heart disease, saturated fat and salt strain your blood vessels by raising cholesterol and blood pressure. That is why your menu has ${list(parts.map(p => p[1]), true)} a day.`]
      : ['При исхемична болест на сърцето ограничението на наситените мазнини и солта е още по-важно, защото пази съдовете на сърцето от нови стеснения.',
        'In coronary heart disease, limiting saturated fat and salt matters even more, because it protects the heart’s blood vessels from further narrowing.'];
  } },
  pad: { src: 'ESC 2024', why: () => [
    'При атеросклероза храненето е като при болест на сърцето, с повече зеленчуци, бобови, риба и зехтин и по-малко наситени мазнини и сол, защото намалява риска от инфаркт и инсулт. За краката най-много помагат редовното ходене и спирането на тютюнопушенето.',
    'With atherosclerosis, the diet is the same as for heart disease, with more vegetables, pulses, fish and olive oil and less saturated fat and salt, because it lowers the risk of heart attack and stroke. For the legs, regular walking and stopping smoking help the most.'] },
  stroke: { src: 'ESO 2021, AHA/ASA 2021', why: (v, F) => both(
    v.own('salt', 'stroke')
      ? [`След мозъчно-съдова болест храненето цели да няма нов инсулт, като понижава налягането и холестерола. Затова менюто е с до ${v.b.salt} г сол на ден и с малко наситени мазнини.`,
        `After cerebrovascular disease, the aim of your diet is to prevent another stroke by lowering blood pressure and cholesterol. That is why your menu has up to ${v.e.salt} g of salt a day and little saturated fat.`]
      : ['След мозъчно-съдова болест храненето цели да няма нов инсулт, като понижава налягането и холестерола. Затова менюто е с малко сол и наситени мазнини.',
        'After cerebrovascular disease, the aim of your diet is to prevent another stroke by lowering blood pressure and cholesterol. That is why your menu is low in salt and saturated fat.'],
    when(F.age >= 65, 'Ако се задавяте или преглъщате трудно, кажете ми, за да съобразим храната.', 'If you choke or find swallowing difficult, tell me so that we can adapt your food.')) },
  // Ежедневното претегляне — в „Контрол на теглото“.
  hf: { src: 'ESC 2021', why: (v) => (v.own('salt', 'hf')
    ? [`При сърдечна недостатъчност излишната сол и течности натоварват сърцето и водят до отоци и задух. Затова солта в менюто е до ${v.b.salt} г, а течностите са около ${v.b.fluids} л на ден.`,
      `In heart failure, extra salt and fluid strain the heart and cause swelling and breathlessness. That is why your menu has up to ${v.e.salt} g of salt and about ${v.e.fluids} l of fluid a day.`]
    : [`При сърдечна недостатъчност излишната сол и течности натоварват сърцето и водят до отоци и задух. Затова и солта, и течностите са ограничени: течностите са около ${v.b.fluids} л на ден.`,
      `In heart failure, extra salt and fluid strain the heart and cause swelling and breathlessness. That is why both salt and fluid are limited: fluids are about ${v.e.fluids} l a day.`]) },
  af: { src: 'ESC 2024', why: (v, F) => both(
    ['При предсърдно мъждене пристъпите намаляват, когато теглото е нормално, налягането е под контрол и алкохолът е малко. Затова алкохолът е ограничен до 3 питиета седмично или по-малко.',
      'In atrial fibrillation, episodes become less frequent when your weight is healthy, your blood pressure is controlled and you drink little alcohol. That is why alcohol is limited to 3 drinks a week or fewer.'],
    when(F.goal === 'lose', 'Отслабването с 10% намалява пристъпите най-много.', 'Losing 10% of your weight reduces episodes the most.')) },
  obesity: { src: 'NICE NG246', why: (v, F) => (F.goal === 'lose'
    // След 65 г. — как се отслабва, е в обяснението за възрастта.
    ? ['Режимът е за плавно отслабване с умерен енергиен дефицит, без забранени храни. Дори 5–10% по-малко тегло подобрява налягането, кръвната захар, мазнините в кръвта и ставите.',
      'This plan is for gradual weight loss with a moderate energy deficit and no forbidden foods. Even 5–10% less weight improves blood pressure, blood sugar, blood fats and joints.']
    : ['Сега целта е теглото да не се покачва. Порциите и видът на храната в менюто са подбрани така, че да поддържат сегашното тегло.',
      'For now the aim is to keep your weight from rising. Portions and foods in the menu are chosen to keep your current weight.']) },
  gout: { src: 'EULAR 2016, ACR 2020', why: (v, F) => both(
    [`${F.ind?.urate ? 'Тя' : 'Пикочната киселина'} се покачва от карантия, бира и спиртни напитки, подсладени напитки с фруктоза и много месо и морски дарове. Затова те са ограничени, а нискомаслените млечни продукти и водата помагат тя да се отделя.`,
      `${F.ind?.urate ? 'It' : 'Uric acid'} rises with offal, beer and spirits, drinks sweetened with fructose, and large amounts of meat and seafood. These are limited, while low-fat dairy and water help your body get rid of it.`],
    when(F.goal === 'lose', 'Отслабването също намалява пристъпите.', 'Losing weight also reduces attacks.')) },
  osteoporosis: { src: 'ESCEO/IOF 2019', why: (v) => both(
    [`За здравите кости са нужни калций, витамин D и белтък. Менюто е подбрано с повече храни с калций${v.b.caMenu ? ` и дава около ${v.b.caMenu} мг на ден` : ''} при препоръка 1000–1200 мг${v.own('protein', 'osteoporosis') ? `, а белтъкът е ${v.b.ppk} г/кг` : ''}.`,
      `Healthy bones need calcium, vitamin D and protein. Your menu favors calcium-rich foods${v.e.caMenu ? ` and provides about ${v.e.caMenu} mg a day` : ''} against a target of 1000–1200 mg${v.own('protein', 'osteoporosis') ? `, and protein is ${v.e.ppk} g/kg` : ''}.`],
    ['Силовите упражнения и ходенето укрепват костите повече, отколкото самото хранене.', 'Strength exercises and walking strengthen bones more than diet alone.']) },
  hypothyroid: { src: 'ATA 2014', why: () => [
    'При хипотиреоидизъм, когато хормонът е заместен с таблетка, специална диета не е нужна. Важно е как взимате таблетката: сутрин на гладно, само с вода, 30–60 минути преди закуска. Калций, желязо и соевите продукти пречат на усвояването ѝ, затова ги приемайте по-късно през деня.',
    'With hypothyroidism, once the hormone is replaced with a tablet no special diet is needed. What matters is how you take the tablet: in the morning on an empty stomach, with water only, 30–60 minutes before breakfast. Calcium, iron and soy products reduce its absorption, so take them later in the day.'] },
  masld: { src: 'EASL–EASD–EASO 2024', why: () => [
    'Мастният черен дроб се подобрява най-сигурно с отслабване: 7–10% по-малко тегло намалява мазнините и възпалението в него. Средиземноморското хранене помага и без голямо отслабване.',
    'Fatty liver improves most reliably with weight loss: 7–10% less weight reduces the fat and inflammation in it. A Mediterranean diet helps even without much weight loss.'] },
  anemia: { src: 'BSG 2021', why: () => [
    'При желязодефицитна анемия менюто е подбрано с повече ястия, богати на желязо, а това от месото се усвоява най-добре. Храната помага, но обикновено не стига: нужна е и добавка с желязо по назначение.',
    'For iron deficiency anemia, your menu favors iron-rich dishes, and iron from meat is absorbed best. Food helps but is usually not enough on its own: an iron supplement as prescribed is also needed.'] },
  copd: { src: 'GOLD 2026', why: (v, F) => both(
    ['При ХОББ дишането изразходва повече енергия, а задухът затруднява храненето.',
      'In COPD, breathing uses more energy and breathlessness makes eating harder.'],
    when(F.bmi < 21, 'При Вашето тегло е важно да не отслабвате. Ако теглото пада, ще добавим хранителни добавки за пиене.',
      'At your weight it is important not to lose weight. If it drops, we will add oral nutritional supplements.')) },
  dementia: { src: 'ESPEN 2015', why: () => [
    'При деменция по-голям риск е недохранването, отколкото наднорменото тегло. Затова е важно храненето да е редовно и достатъчно.',
    'In dementia, undernutrition is a greater risk than excess weight. That is why regular, sufficient meals matter.'] },
  depression: { src: 'SMILES 2017', why: () => [
    'Редовните хранения поддържат енергията и настроението през деня. Храната помага, но не заменя лекарствата и разговорите със специалист.',
    'Regular meals keep your energy and mood steady through the day. Food helps but does not replace medication or talking therapy.'] },
  stones: { src: 'EAU 2024', why: (v) => [
    `Камъните се образуват, когато урината е концентрирана. Затова най-важното е да пиете много${v.own('fluids', 'stones') ? `: около ${v.b.fluids} л течности на ден` : ''}, за да отделяте поне 2–2,5 л урина. Солта и много животински белтък увеличават калция в урината, а калцият от храната, обратно, предпазва, защото свързва оксалатите в червата.`,
    `Stones form when urine is concentrated. The most important thing is to drink plenty${v.own('fluids', 'stones') ? `: about ${v.e.fluids} l of fluid a day` : ''}, so that you pass at least 2–2.5 l of urine. Salt and a lot of animal protein increase calcium in the urine, while calcium from food does the opposite and protects you, because it binds oxalate in the gut.`] },
  hyperk: { src: 'KDIGO 2024', why: (v, F) => [
    `Калият в кръвта Ви е повишен${potassiumOf(F)[0]}, а той идва най-много от плодовете, зеленчуците, бобовите и ядките. Затова порциите на най-богатите на калий храни в менюто са по-малки.`,
    `Your blood potassium is high${potassiumOf(F)[1]}, and most of it comes from fruit, vegetables, pulses and nuts. That is why the portions of the foods richest in potassium are smaller in your menu.`] },
  hypok: { src: 'ESC 2024', why: (v, F) => [
    `Калият в кръвта Ви е нисък${potassiumOf(F)[0]}. Храните, богати на калий, помагат да се възстанови, ако бъбреците Ви са здрави, но често е нужна и таблетка по назначение.`,
    `Your blood potassium is low${potassiumOf(F)[1]}. Potassium-rich foods help restore it if your kidneys are healthy, but a tablet as prescribed is often needed as well.`] },
  hypona: { src: 'ESE 2014', why: () => [
    'Натрият в кръвта Ви е нисък. Колко вода и сол да приемате зависи от причината и ще го определим след изследванията. Дотогава не пийте повече вода от обичайното.',
    'Your blood sodium is low. How much water and salt you should have depends on the cause, and we will decide this after your tests. Until then, do not drink more water than usual.'] },
  celiac: { src: 'ESsCD 2019, ACG 2023', why: () => [
    'При цьолиакия дори малко глутен уврежда червата. Затова менюто е изцяло без глутен: без пшеница, ръж и ечемик, с безглутенов хляб, ориз, елда и киноа. Безглутеновото хранене е за цял живот.',
    'In celiac disease, even a little gluten damages the gut. Your menu is completely gluten-free: no wheat, rye or barley, with gluten-free bread, rice, buckwheat and quinoa. A gluten-free diet is for life.'] },
  lactose: { src: 'EFSA 2010', why: () => [
    'При непоносимост към лактоза менюто е с млечни продукти без лактоза. Не е нужно да спирате млечните напълно: киселото мляко и отлежалите сирена обикновено се понасят и са важен източник на калций.',
    'For lactose intolerance, your menu uses lactose-free dairy. You do not need to give up dairy completely: yogurt and aged cheeses are usually tolerated and are an important source of calcium.'] },
  gerd: { src: 'ACG 2022', why: (v, F) => both(
    ['Рефлуксът се засилва от големи порции, мазни храни и хранене малко преди лягане. Затова храненията в менюто са по-малки, а последното е 2–3 часа преди сън.',
      'Reflux gets worse with large portions, fatty food and eating shortly before bed. That is why the meals in your menu are smaller and the last one is 2–3 hours before sleep.'],
    when(F.bmi >= 25, 'При наднормено тегло отслабването е най-ефективната мярка срещу рефлукса.', 'With excess weight, losing weight is the most effective measure against reflux.')) },
  ulcer: { src: 'Maastricht VI 2022', why: () => [
    'При гастрит и язва храненето не лекува, но може да облекчи оплакванията. Специална диета не е нужна: избягвайте само това, което Ви причинява болка или парене. Лечението на Helicobacter pylori, ако е открит, е по-важно от диетата.',
    'In gastritis and ulcers, food does not cure but can ease symptoms. No special diet is needed: avoid only what gives you pain or burning. Treating Helicobacter pylori, if found, matters more than diet.'] },
  ibs: { src: 'NICE CG61, ACG 2021', why: () => [
    'При раздразнено черво помагат редовните хранения и по-малко храни, които ферментират в червата: бобови, лук, зеле и много плодове наведнъж. Затова те са по-редки в менюто.',
    'In irritable bowel syndrome, regular meals and fewer foods that ferment in the gut help: pulses, onions, cabbage and a lot of fruit at once. That is why these appear less often in your menu.'] },
  diverticula: { src: 'AGA 2021', why: (v) => [
    `При дивертикулоза фибрите правят изхождането меко и редовно и намаляват риска от възпаление. Затова менюто е с ${v.own('fiber', 'diverticula') ? `поне ${v.b.fiber} г фибри на ден` : 'повече фибри'}. Ядките, семената и пуканките не са забранени.`,
    `In diverticular disease, fiber keeps your bowel movements soft and regular and lowers the risk of inflammation. That is why your menu has ${v.own('fiber', 'diverticula') ? `at least ${v.e.fiber} g of fiber a day` : 'more fiber'}. Nuts, seeds and popcorn are not forbidden.`] },
  constipation: { src: 'NICE CKS', why: (v) => {
    const parts = [[`поне ${v.b.fiber} г фибри`, `at least ${v.e.fiber} g of fiber`]];
    if (v.own('fluids', 'constipation')) parts.push([`около ${v.b.fluids} л течности`, `about ${v.e.fluids} l of fluid`]);
    return [`При запек фибрите задържат вода в червата и правят изпражненията по-меки и обемни. Затова менюто е с ${list(parts.map(p => p[0]), false)} на ден. Движението всеки ден също помага на червата.`,
      `In constipation, fiber holds water in the bowel and makes stools softer and bulkier. That is why your menu has ${list(parts.map(p => p[1]), true)} a day. Moving every day also helps your bowels.`];
  } },
  ibd: { src: 'ESPEN 2023', why: () => [
    'При болест на Крон и улцерозен колит в ремисия специална диета не е нужна: разнообразното хранене пази от недохранване. При обостряне или стеснение на червата храната трябва да е с малко фибри, по указание на гастроентеролога и диетолога.',
    'In Crohn’s disease and ulcerative colitis in remission, no special diet is needed: varied eating protects against undernutrition. During a flare or with a narrowed bowel, food should be low in fiber, as advised by your gastroenterologist and dietitian.'] },
  // Леката закуска вечер и „не стойте гладни“ — в правилата; алкохолът — в „Избягвайте“.
  cirrhosis: { src: 'ESPEN 2019, EASL 2019', why: (v, F) => both(
    [`При цироза черният дроб не пази запас от енергия за нощта и тялото започва да разгражда мускулите. Затова белтъкът е повече${v.own('protein', 'cirrhosis') ? `, около ${v.b.protein} г на ден` : ''}, а преди сън има лека закуска.`,
      `In cirrhosis, the liver does not store enough energy for the night, so the body starts breaking down muscle. That is why protein is higher${v.own('protein', 'cirrhosis') ? `, about ${v.e.protein} g a day` : ''}, and there is a light snack before bed.`],
    when(F.bmi >= 25 && F.goal === 'maintain', 'Отслабване при цироза е безопасно само по указание на хепатолога.',
      'With cirrhosis, weight loss is safe only on your liver specialist’s advice.')) },
  gallstones: { src: 'EASL 2016', why: () => [
    'Жлъчните камъни се провокират от обилни и много мазни хранения и от бързото отслабване. Затова отслабването, ако е нужно, е плавно.',
    'Gallstone attacks are triggered by large, very fatty meals and by rapid weight loss. That is why any weight loss is gradual.'] },
  pancreatitis: { src: 'ESPEN 2020', why: () => [
    'При хроничен панкреатит големите хранения натоварват панкреаса, а алкохолът и тютюнът го увреждат още.',
    'In chronic pancreatitis, large meals strain the pancreas, and alcohol and tobacco damage it further.'] },
  dysphagia: { src: 'ESPEN 2022, IDDSI', why: () => [
    'При затруднено преглъщане консистенцията на храната и течностите ще определим след оценка от логопед. Дотогава това меню е ориентир само за количествата, а не за вида на храната.',
    'With difficulty swallowing, we will set the texture of food and drinks after an assessment by a speech therapist. Until then this menu is a guide to quantities only, not to the type of food.'] },
  bariatric: { src: 'ASMBS 2019', why: () => [
    'След бариатрична операция стомахът побира малко, затова храненията са малки и чести, с белтък на всяко от тях, поне 60 г на ден. Това меню е ориентир: храненията и добавките следват схемата на екипа, който Ви е оперирал.',
    'After bariatric surgery your stomach holds little, so meals are small and frequent, with protein at each one, at least 60 g a day. This menu is a guide: meals and supplements follow the schedule of your surgical team.'] },
  pcos: { src: 'PCOS 2023', why: (v, F) => both(
    ['При поликистозни яйчници инсулинът често е повишен и нарушава цикъла, затова въглехидратите в менюто идват от храни, които вдигат кръвната захар бавно.',
      'With polycystic ovary syndrome, insulin is often raised and disturbs your cycle, so the carbohydrates in your menu come from foods that raise blood sugar slowly.'],
    when(F.goal === 'lose', 'Свалянето на 5–10% от теглото подобрява цикъла и хормоните най-много.', 'Losing 5–10% of your weight improves your cycle and hormones the most.')) },
  hyperthyroid: { src: 'ETA 2018', why: () => [
    'Докато щитовидната жлеза е свръхактивна, тялото изразходва повече енергия и теглото може да пада, затова следете теглото и, ако спада, яжте повече. Йодът от добавките и водораслите може да засили болестта.',
    'While your thyroid is overactive, your body uses more energy and your weight may drop, so keep an eye on your weight and eat more if it falls. Iodine from supplements and seaweed can make the condition worse.'] },
  hashimoto: { src: 'ETA', why: () => [
    'При автоимунен тиреоидит специална диета не е нужна. Безглутеново хранене има смисъл само при доказана цьолиакия.',
    'Autoimmune thyroiditis needs no special diet. A gluten-free diet only makes sense if celiac disease has been confirmed.'] },
  vitd: { src: 'ESCEO', why: () => [
    'Витамин D идва основно от кожата при слънце, а от храната се получава малко. Затова недостигът се лекува с добавка по назначение, а менюто я допълва.',
    'Vitamin D comes mainly from the skin in sunlight, and food provides little. A deficiency is therefore treated with a supplement as prescribed, and the menu supports it.'] },
  // При веганско хранене добавката е в бележката за веганското хранене.
  b12: { src: 'NICE NG239 2024', why: (v, F) => both(
    ['Витамин B12 има само в храните от животински произход.', 'Vitamin B12 is found only in foods of animal origin.'],
    when(F.age >= 50 || F.classes.has('METFORMIN') || F.classes.has('PPI'), 'С възрастта и при прием на метформин или лекарства за стомашна киселина той се усвоява по-трудно.',
      'It is absorbed less well with age and when taking metformin or stomach acid medicines.'),
    ['При недостиг обикновено е нужна добавка по назначение, а менюто я допълва.', 'A deficiency usually needs a supplement as prescribed, and the menu supports it.']) },
  folate: { src: 'NICE CKS', why: () => [
    'При недостиг на фолат менюто е с повече храни, богати на него, но обикновено е нужна и добавка с фолиева киселина по назначение.',
    'With a folate deficiency, your menu includes more foods rich in it, but a folic acid supplement as prescribed is usually needed too.'] },
  hemochromatosis: { src: 'EASL 2022', why: () => [
    'При хемохроматоза тялото усвоява твърде много желязо. Основното лечение са кръвопусканията, а храненето помага, като не добавя още желязо.',
    'In hemochromatosis, the body absorbs too much iron. The main treatment is venesection, and diet helps by not adding more iron.'] },
  malnutrition: { src: 'ESPEN 2022, GLIM', why: (v, F) => both(
    [`При недохранване тялото взима енергия от мускулите си. Затова режимът не е за отслабване${v.own('protein', 'malnutrition') ? `, а белтъкът е ${v.b.ppk} г/кг, около ${v.b.protein} г на ден, разпределен във всяко хранене` : ''}.`,
      `With undernutrition, your body takes energy from its own muscle. That is why this plan is not for weight loss${v.own('protein', 'malnutrition') ? `, and protein is ${v.e.ppk} g/kg, about ${v.e.protein} g a day, spread across every meal` : ''}.`],
    when(F.age >= 65, 'Силовите упражнения помагат белтъкът да се превръща в мускули.', 'Strength exercises help protein build muscle.')) },
  // Добре сготвената храна при ниски левкоцити — в бележките.
  cancer: { src: 'ESPEN 2021', why: (v) => [
    `Лечението се понася по-добре, когато теглото и мускулите се запазват. Затова режимът е за поддържане на теглото${v.own('protein', 'cancer') ? `, а белтъкът е ${v.b.ppk} г/кг на ден` : ''}.`,
    `Treatment is easier to tolerate when your weight and muscle are kept up. That is why this plan maintains your weight${v.own('protein', 'cancer') ? `, and protein is ${v.e.ppk} g/kg a day` : ''}.`] },
  iem: { src: '', why: () => [
    'Вродените нарушения на обмяната изискват специализиран режим от метаболитен център. Това меню не е подходящо за Вас и е само ориентир.',
    'Inherited metabolic disorders need a specialized diet from a metabolic center. This menu is not suitable for you and is only a guide.'] },
  eating: { src: 'NICE NG69', why: () => [
    'При хранително разстройство храненето се планира заедно с екипа, който Ви лекува. Този режим не е за отслабване и е само ориентир.',
    'With an eating disorder, your meals are planned together with your treatment team. This plan is not for weight loss and is only a guide.'] },
  alcohol: { src: 'NICE CG100', why: () => [
    'Спирането на алкохола е най-важната стъпка за черния дроб, сърцето и нервите. Алкохолът изчерпва витамините от група B, особено B1, затова той се приема по назначение. Редовните хранения помагат на тялото да се възстанови.',
    'Stopping alcohol is the most important step for your liver, heart and nerves. Alcohol depletes B vitamins, especially B1 (thiamine), so it is taken as prescribed. Regular meals help your body recover.'] },
  psa: { src: 'NPF 2018, EULAR 2021', why: (v, F) => both(
    ['При псориатичен артрит нормалното тегло намалява болката в ставите и подобрява ефекта от лечението.',
      'In psoriatic arthritis, a healthy weight reduces joint pain and improves the effect of treatment.'],
    when(F.goal === 'lose', 'Затова режимът е за отслабване.', 'That is why this plan is for weight loss.'),
    // При псориазис същото изречение е в неговото обяснение — не се казва два пъти.
    when(!hasOf(F)('psoriasis'), 'Храненето допълва, но не заменя лечението.', 'Diet supports but does not replace treatment.')) },
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
  // При недохранване „режимът не е за отслабване“ е казано в неговото обяснение — тук не се повтаря.
  pressure: { src: 'ESPEN 2022', why: (v, F) => (hasOf(F)('malnutrition') ? [
    'Докато раната зараства, тялото изразходва повече енергия и белтък, затова е важно да изяждате всички хранения.',
    'While the wound heals, your body uses more energy and protein, so it is important to eat all your meals.'] : [
    `Докато раната зараства, тялото изразходва повече енергия и белтък. Затова режимът не е за отслабване${v.own('protein', 'pressure') ? `, а белтъкът е около ${v.b.protein} г на ден` : ''}.`,
    `While the wound heals, your body uses more energy and protein. That is why this plan is not for weight loss${v.own('protein', 'pressure') ? `, and protein is about ${v.e.protein} g a day` : ''}.`]) },
  parkinson: { src: 'ESPEN 2018', why: () => [
    'При болест на Паркинсон запекът е чест, затова менюто е с повече фибри и течности. Леводопата действа по-добре, ако я взимате поне 30 минути преди хранене, защото белтъкът в храната пречи на усвояването ѝ.',
    'Constipation is common in Parkinson’s disease, so your menu has more fiber and fluid. Levodopa works better if you take it at least 30 minutes before a meal, because protein in food reduces its absorption.'] },
  ms: { src: 'ESPEN 2018', why: () => [
    'При множествена склероза няма диета, която да променя хода на болестта. Балансираното хранене и нормалното тегло помагат за енергията и подвижността.',
    'No diet changes the course of multiple sclerosis. A balanced diet and a healthy weight help your energy and mobility.'] },
  osa: { src: 'ATS 2018', why: () => [
    'При сънна апнея наднорменото тегло стеснява дихателните пътища по време на сън. Отслабването намалява спиранията на дишането и е част от лечението. Алкохолът вечер ги засилва.',
    'In sleep apnea, excess weight narrows the airway during sleep. Losing weight reduces pauses in breathing and is part of the treatment. Alcohol in the evening makes them worse.'] },
  gn: { src: 'KDIGO 2021', why: (v) => {
    const parts = [];
    if (v.own('salt', 'gn')) parts.push([`до ${v.b.salt} г сол`, `up to ${v.e.salt} g of salt`]);
    if (v.own('protein', 'gn')) parts.push([`белтък около ${v.b.protein} г`, `about ${v.e.protein} g of protein`]);
    return [`При гломерулна болест солта и излишният белтък увеличават загубата на белтък с урината и отоците. Затова ${parts.length ? `менюто е с ${list(parts.map(p => p[0]), false)} на ден` : 'и двете са ограничени'}.`,
      `In glomerular disease, salt and excess protein increase protein loss in the urine and swelling. That is why ${parts.length ? `your menu has ${list(parts.map(p => p[1]), true)} a day` : 'both are limited'}.`];
  } },
  adpkd: { src: 'KDIGO 2025', why: (v) => {
    const parts = [];
    if (v.own('salt', 'adpkd')) parts.push([`Солта е до ${v.b.salt} г`, `Salt is up to ${v.e.salt} g`]);
    if (v.own('protein', 'adpkd')) parts.push([parts.length ? `белтъкът около ${v.b.ppk} г/кг` : `Белтъкът е около ${v.b.ppk} г/кг`, parts.length ? `protein about ${v.e.ppk} g/kg` : `Protein is about ${v.e.ppk} g/kg`]);
    return [`При поликистоза на бъбреците много вода потиска хормона, който стимулира растежа на кистите. Затова пийте 2–3 л на ден, ако бъбречната функция го позволява.${parts.length ? ` ${parts.map(p => p[0]).join(', а ')}.` : ''}`,
      `In polycystic kidney disease, plenty of water suppresses the hormone that drives cyst growth. Drink 2–3 l a day if your kidney function allows it.${parts.length ? ` ${parts.map(p => p[1]).join(' and ')}.` : ''}`];
  } },
  hemorrhoids: { src: 'ASCRS 2018', why: (v) => [
    `При хемороиди най-важно е изхождането да е меко и редовно, без напъване. Затова менюто е с ${v.own('fiber', 'hemorrhoids') ? `поне ${v.b.fiber} г фибри` : 'повече фибри'} и повече течности.`,
    `With hemorrhoids, what matters most is soft, regular bowel movements without straining. That is why your menu has ${v.own('fiber', 'hemorrhoids') ? `at least ${v.e.fiber} g of fiber` : 'more fiber'} and more fluid.`] },
  fissure: { src: 'ASCRS 2017', why: () => [
    'При анална фисура фибрите и течностите омекотяват изпражненията и позволяват на раната да зарасне. Топлите седящи вани облекчават болката.',
    'With an anal fissure, fiber and fluid soften the stool and let the tear heal. Warm sitz baths ease the pain.'] },
  gastroparesis: { src: 'ACG 2022', why: (v, F) => both(
    ['При гастропареза стомахът се изпразва бавно, а мазната храна и грубите фибри го забавят още. Затова менюто е с малки и чести хранения.',
      'In gastroparesis, the stomach empties slowly, and fatty food and coarse fiber slow it down even more. That is why your menu has small, frequent meals.'],
    when(F.diabetes, 'Добрият контрол на кръвната захар също помага.', 'Good blood sugar control also helps.')) },
  transplant: { src: 'КХП', why: () => [
    'Лекарствата срещу отхвърляне отслабват защитата срещу инфекции, затова храната трябва да е добре сготвена. Грейпфрутът и помелото повишават нивото на такролимус и циклоспорин в кръвта, затова ги няма в менюто.',
    'Anti-rejection medicines weaken your defenses against infection, so food should be well cooked. Grapefruit and pomelo raise blood levels of tacrolimus and ciclosporin, so they are left out of your menu.'] },
  bph: { src: 'EAU', why: () => [
    'При уголемена простата пикочният мехур се изпразва по-трудно, а кафето и алкохолът го дразнят. През деня пийте нормално, за да не се сгъстява урината.',
    'With an enlarged prostate, the bladder empties less easily, and coffee and alcohol irritate it. Drink normally during the day so that your urine does not become concentrated.'] },
  incontinence: { src: 'EAU', why: () => [
    'При изпускане на урина наднорменото тегло натоварва тазовото дъно, затова отслабването помага, а кофеинът засилва позивите при свръхактивен пикочен мехур.',
    'With urinary incontinence, excess weight puts pressure on the pelvic floor, so losing weight helps, while caffeine increases urgency in an overactive bladder.'] },
  // Че по време на бременност не се отслабва — в писмото.
  gdm: { src: 'ADA 2026, NICE NG3', why: () => [
    'При гестационен диабет въглехидратите не се спират: поне 175 г на ден са нужни за Вас и бебето. В менюто те са разпределени в 3 основни и 2–3 малки хранения, за да не се покачва рязко кръвната захар.',
    'With gestational diabetes, carbohydrates are not cut out: at least 175 g a day are needed for you and your baby. In your menu they are spread over 3 main meals and 2–3 snacks so that blood sugar does not spike.'] },
  pregnancy: { src: 'EFSA 2013, СЗО', why: (v, F) => both(
    [`По време на бременност енергията е с около ${v.b.energyAdd} kcal повече на ден${F.trimester ? ` за ${F.trimester}. тримесечие` : ''}. Някои храни са изключени заради бебето: черен дроб заради многото витамин A, прясна риба тон заради живака, сурово месо и яйца заради инфекциите.`,
      `During pregnancy your energy is about ${v.e.energyAdd} kcal a day higher${F.trimester ? ` for trimester ${F.trimester}` : ''}. Some foods are left out for the baby’s sake: liver because of its high vitamin A, fresh tuna because of mercury, raw meat and eggs because of infections.`]) },
  // Колко течности — в правилото за течностите.
  lactation: { src: 'EFSA 2013', why: (v, F) => both(
    ['При кърмене тялото изразходва около 500 kcal повече на ден за млякото, затова енергията и течностите са повишени.',
      'Breastfeeding uses about 500 kcal more a day to make milk, so your energy and fluids are higher.'],
    when(F.goal === 'maintain' && F.bmi >= 25, 'След първите 2 месеца плавното отслабване до 0,5 кг седмично е безопасно и можем да го планираме.',
      'After the first 2 months, gradual weight loss of up to 0.5 kg a week is safe, and we can plan it.')) },
  amenorrhea: { src: 'Endocrine Society 2017', why: () => [
    'При липса на менструация и нормално или ниско тегло причината често е недостиг на енергия от малко храна и много натоварване. Затова режимът не е с дефицит: тялото трябва да получава достатъчно, за да се възстанови цикълът. Причината ще изясним и с изследвания.',
    'When periods stop at a normal or low weight, the cause is often too little energy from eating little and training a lot. That is why this plan has no deficit: your body needs enough energy for your cycle to return. We will also look into the cause with tests.'] },
  // Витамин C и чаят след храненето — в правилата за желязото.
  heavy: { src: 'NICE NG88, EFSA 2015', why: (v, F) => (hasOf(F)('anemia')
    ? ['При обилна менструация се губи повече желязо, а това често е причината за анемията. Затова е важно да се лекува и самото кървене.',
      'Heavy periods mean losing more iron, and this is often the cause of anemia. That is why the bleeding itself also needs treatment.']
    : ['При обилна менструация се губи повече желязо, затова менюто е подбрано с ястия, богати на желязо, всеки ден.',
      'Heavy periods mean losing more iron, so your menu includes iron-rich dishes every day.']) },
  pms: { src: 'ACOG 2023', why: (v) => [
    `При предменструален синдром калцият от храната${v.own('calcium', 'pms') ? ', около 1000–1200 мг на ден,' : ''} намалява оплакванията. Затова менюто е с повече млечни продукти и други храни с калций.`,
    `In premenstrual syndrome, calcium from food${v.own('calcium', 'pms') ? ', about 1000–1200 mg a day,' : ''} reduces symptoms. That is why your menu has more dairy and other calcium-rich foods.`] },
  dysmenorrhea: { src: 'Cochrane 2016', why: () => [
    'При болезнена менструация храненето има малка роля, а добавките имат само слаби доказателства. Основното лечение са обезболяващите.',
    'Diet plays a small part in painful periods, and supplements have only weak evidence. Pain relief medicines are the main treatment.'] },
  menopause: { src: 'EFSA 2015', why: (v, F) => both(
    [`След менопаузата костите губят калций по-бързо, а рискът за сърцето се покачва. Затова менюто е с ${v.own('calcium', 'menopause') ? `калций около ${v.b.calcium} мг на ден` : 'повече калций'} и с храни, които пазят сърцето.`,
      `After the menopause, bones lose calcium faster and the risk to the heart rises. That is why your menu provides ${v.own('calcium', 'menopause') ? `about ${v.e.calcium} mg of calcium a day` : 'more calcium'} with heart-friendly foods.`],
    // При остеопороза упражненията за костите са в нейното обяснение.
    when(!hasOf(F)('osteoporosis'), 'Силовите упражнения пазят и костите, и мускулите.', 'Strength exercises protect both bones and muscles.')) },
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
    'При мигрена пропуснатото хранене, обезводняването и рязката промяна в количеството кафе са чести провокатори. Ако подозирате определена храна, водете дневник, вместо да спирате много храни наведнъж.',
    'In migraine, skipped meals, dehydration and sudden changes in coffee intake are common triggers. If you suspect a particular food, keep a diary instead of cutting out many foods at once.'] },
  anxiety: { src: '', why: () => [
    'Кофеинът засилва сърцебиенето и безпокойството, а алкохолът влошава съня и тревожността на следващия ден.',
    'Caffeine increases palpitations and restlessness, and alcohol worsens sleep and next-day anxiety.'] },
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

/* ------------------------- показателите на човека (версия 4.18) ------------------------- */

const dateBg = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} г.`;
const dateEn = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
/* Число с най-много един знак след запетаята; fix — винаги с един („7,0“). */
const one = (v, en, fix = false) => fmt(fix ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v * 10) / 10, en);

/* Кой показател от досието върви с кое обяснение. Всеки се казва веднъж — в първото от тях. */
const IND_FOR = {
  htn: 'bp', dm2: 'hba1c', dm1: 'hba1c', prediabetes: 'hba1c', dyslip: 'ldl', chd: 'ldl', pad: 'ldl', stroke: 'ldl',
  tg: 'tg', gout: 'urate', anemia: 'iron', heavy: 'iron', vitd: 'vitd', b12: 'b12',
};

/**
 * Изречението за показателя на човека в началото на обяснението: стойността, датата и целта му —
 * „Последният Ви гликиран хемоглобин е 7,8% (12.09.2026 г.) при цел под 7,0%.“ Връща [bg, en] или null.
 */
function indicatorLine(F, key, ind) {
  const I = F.ind;
  if (!I) return null;
  if (ind === 'bp' && I.bp) {
    const { sys, dia, date, target: t, ok } = I.bp;
    return ok
      ? [`Последното Ви измерено налягане е ${sys}/${dia} (${dateBg(date)}) и е в целта под ${t.sys}/${t.dia}.`, `Your last blood pressure reading was ${sys}/${dia} (${dateEn(date)}), within the target of under ${t.sys}/${t.dia}.`]
      : [`Последното Ви измерено налягане е ${sys}/${dia} (${dateBg(date)}) при цел под ${t.sys}/${t.dia}.`, `Your last blood pressure reading was ${sys}/${dia} (${dateEn(date)}); the target is under ${t.sys}/${t.dia}.`];
  }
  if (ind === 'hba1c' && I.hba1c) {
    const { value, date, prev, target, ok } = I.hba1c;
    const diff = prev ? value - prev.value : 0;
    const trend = Math.abs(diff) >= 0.3
      ? [`, ${diff < 0 ? 'по-нисък' : 'по-висок'} от предишните ${one(prev.value, false)}%`, `, ${diff < 0 ? 'down' : 'up'} from ${one(prev.value, true)}%`] : ['', ''];
    const head = [`Последният Ви гликиран хемоглобин е ${one(value, false)}% (${dateBg(date)})${trend[0]}`, `Your last HbA1c was ${one(value, true)}% (${dateEn(date)})${trend[1]}`];
    if (key === 'prediabetes') return [`${head[0]}; между 5,7 и 6,4% е предиабет.`, `${head[1]}; 5.7–6.4% is the prediabetes range.`];
    // Вметнатото „по-нисък от предишните …“ се затваря със запетая.
    const c = trend[0] ? ',' : '';
    return ok
      ? [`${head[0]}${c} и е в целта под ${one(target, false, true)}%.`, `${head[1]}, within the target of under ${one(target, true, true)}%.`]
      : [`${head[0]}${c} при цел под ${one(target, false, true)}%.`, `${head[1]}; the target is under ${one(target, true, true)}%.`];
  }
  if (ind === 'ldl' && I.ldl) {
    const { value, date, target, ok } = I.ldl;
    const head = [`LDL холестеролът Ви е ${one(value, false)} mmol/L (${dateBg(date)})`, `Your LDL cholesterol is ${one(value, true)} mmol/L (${dateEn(date)})`];
    if (!target) return [`${head[0]}.`, `${head[1]}.`];
    return ok
      ? [`${head[0]} и е в целта под ${one(target, false)}.`, `${head[1]}, within the target of under ${one(target, true)}.`]
      : [`${head[0]} при цел под ${one(target, false)}.`, `${head[1]}; the target is under ${one(target, true)}.`];
  }
  if (ind === 'tg' && I.tg) {
    const { value, date, ok } = I.tg;
    return ok
      ? [`Триглицеридите Ви са ${one(value, false)} mmol/L (${dateBg(date)}) и са в нормата.`, `Your triglycerides are ${one(value, true)} mmol/L (${dateEn(date)}), within the normal range.`]
      : [`Триглицеридите Ви са ${one(value, false)} mmol/L (${dateBg(date)}); нормата е под 1,7.`, `Your triglycerides are ${one(value, true)} mmol/L (${dateEn(date)}); normal is under 1.7.`];
  }
  if (ind === 'urate' && I.urate) {
    const { value, date, ok } = I.urate;
    return ok
      ? [`Пикочната Ви киселина е ${Math.round(value)} µmol/L (${dateBg(date)}) и е в целта под 360.`, `Your uric acid is ${Math.round(value)} µmol/L (${dateEn(date)}), within the target of under 360.`]
      : [`Пикочната Ви киселина е ${Math.round(value)} µmol/L (${dateBg(date)}) при цел под 360.`, `Your uric acid is ${Math.round(value)} µmol/L (${dateEn(date)}); the target is under 360.`];
  }
  if (ind === 'iron' && (I.hb || I.ferritin)) {
    const { hb, ferritin } = I;
    if (hb && ferritin) return [`Последният Ви хемоглобин е ${Math.round(hb.value)} g/L (${dateBg(hb.date)}), а феритинът ${Math.round(ferritin.value)} µg/L.`, `Your last hemoglobin was ${Math.round(hb.value)} g/L (${dateEn(hb.date)}), and ferritin ${Math.round(ferritin.value)} µg/L.`];
    if (hb) return [`Последният Ви хемоглобин е ${Math.round(hb.value)} g/L (${dateBg(hb.date)}).`, `Your last hemoglobin was ${Math.round(hb.value)} g/L (${dateEn(hb.date)}).`];
    return [`Последният Ви феритин е ${Math.round(ferritin.value)} µg/L (${dateBg(ferritin.date)}).`, `Your last ferritin was ${Math.round(ferritin.value)} µg/L (${dateEn(ferritin.date)}).`];
  }
  if (ind === 'vitd' && I.vitd) {
    const { value, date, low } = I.vitd;
    return low
      ? [`Последното Ви ниво на витамин D е ${Math.round(value)} nmol/L (${dateBg(date)}); достатъчно е над 50.`, `Your last vitamin D level was ${Math.round(value)} nmol/L (${dateEn(date)}); a sufficient level is above 50.`]
      : [`Последното Ви ниво на витамин D е ${Math.round(value)} nmol/L (${dateBg(date)}) и е достатъчно.`, `Your last vitamin D level was ${Math.round(value)} nmol/L (${dateEn(date)}), which is sufficient.`];
  }
  if (ind === 'b12' && I.b12) {
    const { value, date, low } = I.b12;
    return low
      ? [`Последният Ви витамин B12 е ${Math.round(value)} pmol/L (${dateBg(date)}); нормата е над 150.`, `Your last vitamin B12 was ${Math.round(value)} pmol/L (${dateEn(date)}); normal is above 150.`]
      : [`Последният Ви витамин B12 е ${Math.round(value)} pmol/L (${dateBg(date)}) и е в нормата.`, `Your last vitamin B12 was ${Math.round(value)} pmol/L (${dateEn(date)}), within the normal range.`];
  }
  return null;
}

/* Калият от досието в скоби — за обясненията при висок и нисък калий. */
const potassiumOf = (F) => (F.ind?.k ? [` (${one(F.ind.k.value, false)} mmol/L на ${dateBg(F.ind.k.date)})`, ` (${one(F.ind.k.value, true)} mmol/L on ${dateEn(F.ind.k.date)})`] : ['', '']);

/* Бъбреците — един текст според стадия (по eGFR, а без него — по кода). */
function kidneyWhy(F, v) {
  // Колко течности между диализите — в правилото за течностите.
  if (F.dialysis) {
    return { src: 'KDOQI 2020', text: [
      `При хемодиализа белтъкът се губи с процедурата, затова менюто е с повече белтък, около ${v.b.protein} г на ден. Калият, фосфорът, солта и течностите между диализите обаче се ограничават, защото бъбреците не ги изхвърлят.`,
      `During hemodialysis protein is lost with each session, so your menu has more protein, about ${v.e.protein} g a day. Potassium, phosphorus, salt and fluid between sessions are limited, because your kidneys cannot remove them.`] };
  }
  if (F.ckdAdvanced) {
    return { src: 'KDIGO 2024', text: both(
      [`При Вашата бъбречна функция${v.b.egfr ? ` (eGFR около ${v.b.egfr})` : ''} бъбреците изхвърлят по-трудно продуктите от белтъка, калия и фосфора. Затова белтъкът е около ${v.b.protein} г на ден (${v.b.ppk} г/кг), повече от растителни храни, а менюто е с по-малко калий и фосфор.`,
        `With your kidney function${v.e.egfr ? ` (eGFR about ${v.e.egfr})` : ''}, your kidneys have difficulty clearing the waste from protein, potassium and phosphorus. That is why protein is about ${v.e.protein} g a day (${v.e.ppk} g/kg), more of it from plant foods, and your menu is lower in potassium and phosphorus.`],
      when(F.age >= 75, 'На Вашата възраст белтъкът не бива да пада под тази граница, за да не губите мускули.',
        'At your age, protein should not fall below this level, so that you do not lose muscle.')) };
  }
  // Откъде да е белтъкът — в правилото за белтъка.
  if (F.ckd) {
    const salt = v.own('salt', 'kidney');
    return { src: 'KDIGO 2024', text: both(
      [`При хронично бъбречно заболяване${v.b.egfr ? ` с eGFR около ${v.b.egfr}` : ''} умереното количество белтък и малкото сол забавят влошаването на бъбречната функция. Затова белтъкът е около ${v.b.protein} г на ден (${v.b.ppk} г/кг)${salt ? `, а солта до ${v.b.salt} г` : ''}.`,
        `In chronic kidney disease${v.e.egfr ? ` with an eGFR of about ${v.e.egfr}` : ''}, moderate protein and little salt slow the decline in kidney function. That is why protein is about ${v.e.protein} g a day (${v.e.ppk} g/kg)${salt ? ` and salt is up to ${v.e.salt} g` : ''}.`],
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
  // Белтъкът, калцият и течностите с числа — само ако не са в обяснението на някое заболяване.
  const protein = v.own('protein', 'age');
  const calcium = v.own('calcium', 'age');
  if (a >= 75) {
    parts.push([`На ${v.b.age} години мускулите и костите се губят по-лесно, а апетитът и жаждата отслабват. Затова ${protein ? `белтъкът е ${v.b.ppk} г/кг на ден, ` : ''}енергията е поне 27 kcal на килограм и строги диети не се препоръчват.`,
      `At ${v.e.age}, muscle and bone are lost more easily and appetite and thirst decline. That is why ${protein ? `protein is ${v.e.ppk} g/kg a day, ` : ''}energy is at least 27 kcal per kilogram, and strict diets are not recommended.`]);
    if (F.ageNoLose) parts.push(['Отслабване не е предвидено, защото при Вашето тегло то би отнело повече мускули, отколкото мазнини.', 'Weight loss is not planned, because at your weight it would take away more muscle than fat.']);
    else if (F.goal === 'lose') parts.push(['Отслабването е бавно и заедно с повече белтък и силови упражнения, за да губите мазнини, а не мускули.', 'Weight loss is slow and combined with more protein and strength exercises, so that you lose fat rather than muscle.']);
  } else if (a >= 65 && (F.ckd || F.dialysis)) {
    parts.push([`След 65 години мускулите се губят по-лесно. Белтъкът остава в границата за бъбреците, но е важно да е разпределен във всяко хранене, а енергията да е достатъчна, за да не отслабвате неволно.${calcium ? ' Нужни са и калций и витамин D.' : ''}`,
      `After 65, muscle is lost more easily. Protein stays within the limit for your kidneys, but it is important to spread it across every meal and to eat enough energy so that you do not lose weight unintentionally.${calcium ? ' You also need calcium and vitamin D.' : ''}`]);
  } else if (a >= 65) {
    parts.push(protein
      ? [`След 65 години тялото има нужда от повече белтък, за да запази мускулите: ${v.b.ppk} г/кг на ден, разпределени във всяко хранене.${calcium ? ' Нужни са и калций и витамин D за костите.' : ''}`,
        `After 65 your body needs more protein to keep its muscle: ${v.e.ppk} g/kg a day, spread across every meal.${calcium ? ' You also need calcium and vitamin D for your bones.' : ''}`]
      : [`След 65 години мускулите и костите се губят по-лесно.${calcium ? ' Нужни са калций и витамин D за костите.' : ''}`,
        `After 65, muscle and bone are lost more easily.${calcium ? ' You need calcium and vitamin D for your bones.' : ''}`]);
    if (F.goal === 'lose') parts.push(['Отслабването е плавно и заедно със силови упражнения, за да губите мазнини, а не мускули.', 'Weight loss is gradual and combined with strength exercises, so that you lose fat rather than muscle.']);
  }
  // Колко литра — в правилото за течностите (то винаги го има, когато течностите не са ограничени).
  if (a >= 65 && !F.fluidsRestricted) {
    parts.push(a >= 75
      ? ['Пийте по часовник, без да чакате жажда.', 'Drink by the clock, without waiting to feel thirsty.']
      : ['Жаждата с възрастта отслабва, затова пийте по часовник, без да чакате да ожаднеете.', 'Thirst weakens with age, so drink by the clock, without waiting until you feel thirsty.']);
  }
  if (a >= 50 && F.classes.has('PPI') && !F.keys.has('b12')) {
    parts.push(['С възрастта и при продължителен прием на лекарства за стомашна киселина витамин B12 се усвоява по-трудно; изследвайте го при умора, изтръпване или анемия.',
      'With age, and when taking stomach acid medicines for a long time, vitamin B12 is absorbed less well; have it checked if you feel tired or have tingling or anemia.']);
  }
  if (F.sex === 'f' && a < 46 && !F.pregnancy && !F.menopause) {
    parts.push(['Като жена в детеродна възраст имате нужда от повече желязо, 16 мг на ден. Ако планирате бременност, започнете фолиева киселина 400 мкг на ден поне месец преди забременяването.',
      'As a woman of childbearing age you need more iron, 16 mg a day. If you are planning a pregnancy, start folic acid 400 µg a day at least a month before conceiving.']);
  }
  if (a < 25) parts.push(calcium ? ['До около 25 години костите още трупат калций, затова той е 1000 мг на ден.', 'Until about 25, your bones are still building calcium, so you need 1000 mg a day.']
    : ['До около 25 години костите още трупат калций.', 'Until about 25, your bones are still building calcium.']);
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
  // Кои обяснения ще има — за да се каже всяко число само в едно от тях.
  const present = new Set([...groups.keys(), 'age']);
  for (const c of F.condOnly || []) if (COND_TITLE[c]) present.add(c === 'ckd' ? 'kidney' : c);
  const owner = {};
  for (const [topic, order] of Object.entries(OWNERS)) owner[topic] = order(F).find(k => present.has(k)) || null;
  v.own = (topic, key) => owner[topic] === key;
  // Показателят на човека (налягане, HbA1c, LDL…) — в началото на първото обяснение, към което се отнася.
  const usedInd = new Set();
  const withFact = (k, text) => {
    const ind = IND_FOR[k];
    if (!ind || usedInd.has(ind)) return text;
    const line = indicatorLine(F, k, ind);
    if (!line) return text;
    usedInd.add(ind);
    return [`${line[0]} ${text[0]}`, `${line[1]} ${text[1]}`];
  };
  const out = [patternWhy(F, v)];
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
    out.push({ key: k, kind: 'dx', codes: ds.map(d => d.code), title, text: withFact(k, W.why(v, F)), src: W.src });
  }
  // Заболяванията от досието без код по МКБ-10 (хроничните заболявания).
  for (const c of F.condOnly || []) {
    const k = c === 'ckd' ? 'kidney' : c;
    if (groups.has(k) || !COND_TITLE[c]) continue;
    if (k === 'kidney') {
      const w = kidneyWhy(F, v);
      out.push({ key: 'kidney', kind: 'cond', codes: [], title: COND_TITLE.ckd, text: w.text, src: w.src });
    } else if (WHY[k]) {
      out.push({ key: k, kind: 'cond', codes: [], title: COND_TITLE[c], text: withFact(k, WHY[k].why(v, F)), src: WHY[k].src });
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

  // Сол — едно правило с всички причини. Камъните в бъбреците са причина при течностите, ако
  // има правило за тях, за да не се повтаря „особено важно заради камъните“ два пъти.
  const fluidRule = !F.dialysis && !has('hf') && !has('hypona');
  const salty = [];
  if (has('htn')) salty.push('htn');
  if (has('hf')) salty.push('hf');
  if (kidney) salty.push('kidney');
  if (has('stones') && !kidney && !fluidRule) salty.push('stones');
  if (has('cirrhosis')) salty.push('cirrhosis');
  add('limit', [`Сол до ${v.b.salt} г на ден, колкото една чаена лъжичка, като се брои и солта в хляба, сиренето и колбасите. Не досолявайте на масата.${because(salty, false)}`,
    `Salt up to ${v.e.salt} g a day, about one teaspoon, including the salt in bread, cheese and cured meats. Do not add salt at the table.${because(salty, true)}`]);

  // Захар.
  // Кога да е сладкото при диабет — в седмичния ритъм.
  add('limit', diabetes || t1
    ? [`Захар и сладко: до ${v.b.sugar} г на ден, около ${v.b.tsp} чаени лъжички, заедно със захарта в кафето, сладкишите, меда и сока.`,
      `Sugar and sweets: up to ${v.e.sugar} g a day, about ${v.e.tsp} teaspoons, including sugar in coffee, cakes, honey and juice.`]
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

  // Алкохол — едно правило: напълно, частично или общо. При бременност, цироза, панкреатит и
  // зависимост — изобщо не; при мастен черен дроб и високи триглицериди — най-добре не.
  const noAlcohol = [];
  if (F.pregnancy) noAlcohol.push(['бременността', 'the pregnancy']);
  if (has('cirrhosis')) noAlcohol.push(['черния дроб', 'your liver']);
  else if (has('masld')) noAlcohol.push(['мастния черен дроб', 'your fatty liver']);
  if (has('pancreatitis')) noAlcohol.push(['панкреаса', 'your pancreas']);
  if (has('alcohol')) noAlcohol.push(['лечението на зависимостта', 'your recovery']);
  if (has('tg')) noAlcohol.push(['триглицеридите', 'your triglycerides']);
  const strict = F.pregnancy || ['cirrhosis', 'pancreatitis', 'alcohol'].some(has);
  if (noAlcohol.length) {
    add('avoid', strict
      ? [`Алкохол: изобщо не пийте, заради ${list(noAlcohol.map(x => x[0]), false)}.`, `Alcohol: do not drink at all, because of ${list(noAlcohol.map(x => x[1]), true)}.`]
      : [`Алкохол: най-добре е да не пиете изобщо, заради ${list(noAlcohol.map(x => x[0]), false)}.`, `Alcohol: it is best not to drink at all, because of ${list(noAlcohol.map(x => x[1]), true)}.`]);
  } else if (has('gout')) {
    add('avoid', ['Бира и спиртни напитки: провокират пристъпите.', 'Beer and spirits: they trigger attacks.']);
  } else if (has('af')) {
    add('limit', ['Алкохол: не повече от 3 питиета седмично, защото провокира пристъпите на мъждене.', 'Alcohol: no more than 3 drinks a week, because it triggers episodes of fibrillation.']);
  } else if (F.lactation) {
    add('limit', ['Алкохол: докато кърмите, най-безопасно е да не пиете.', 'Alcohol: while you are breastfeeding, it is safest not to drink.']);
  } else {
    // Сънната апнея и алкохолът вечер — в обяснението за апнеята.
    add('notes', [`Алкохол: колкото по-малко, толкова по-добре, защото безопасно количество няма.${has('htn') ? ' Той вдига и налягането.' : ''}${insulin ? ' Може да свали кръвната захар, особено ако не сте яли.' : ''}`,
      `Alcohol: the less, the better, because there is no safe amount.${has('htn') ? ' It also raises blood pressure.' : ''}${insulin ? ' It can lower your blood sugar, especially if you have not eaten.' : ''}`]);
  }

  // Течности — колко и защо.
  if (F.dialysis) {
    add('limit', ['Течности: количеството между диализите определя нефрологът. Броят се и супите, млякото и плодовете с много вода.',
      'Fluids: your nephrologist sets the amount between sessions. Soups, milk and watery fruit count too.']);
  } else if (has('hf')) {
    add('limit', [`Течности: около ${v.b.fluids} л на ден общо, ако кардиологът не е определил друго.`, `Fluids: about ${v.e.fluids} l a day in total, unless your cardiologist has set a different amount.`]);
  } else if (fluidRule) {
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
    add('limit', [`Белтък: около ${v.b.protein} г на ден, повече от него от бобови, ядки и пълнозърнести храни, отколкото от месо и риба.`,
      `Protein: about ${v.e.protein} g a day, more of it from pulses, nuts and whole grains than from meat and fish.`]);
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
  } else if (has('htn') && !kidney && !kSparing(F)) {
    // Защо — в обяснението за хипертонията. При спиронолактон и др. — бележката към лекарството.
    add('prefer', ['Храни с калий всеки ден: зеленчуци, плодове, бобови и кисело мляко.', 'Potassium-rich foods every day: vegetables, fruit, pulses and yogurt.']);
  }
  if (F.ckdAdvanced || F.dialysis) {
    add('limit', ['Фосфор: колбаси, топено сирене, кола и готови храни с фосфатни добавки (Е338–Е452).', 'Phosphorus: cured meats, processed cheese, cola and ready meals with phosphate additives (E338–E452).']);
  }

  // Диабет тип 2 и предиабет.
  if (diabetes) {
    // Колко въглехидрати и как са разпределени в менюто — в обяснението за диабета.
    add('prefer', ['Без големи порции въглехидрати наведнъж. Започвайте храненето със зеленчуците и белтъка, а хляба оставете за накрая: така захарта се вдига по-бавно.',
      'No large portions of carbohydrate at once. Start your meal with vegetables and protein and leave the bread until last: this way blood sugar rises more slowly.']);
    add('limit', ['Бял хляб, бял ориз, картофено пюре и сладки плодове като грозде и банан. Плодовете яжте по една порция наведнъж.',
      'White bread, white rice, mashed potatoes and sweet fruit such as grapes and bananas. Eat fruit one portion at a time.']);
  }
  if (t1) {
    add('prefer', ['Броете въглехидратите във всяко хранене и ги разпределяйте предвидимо през деня.',
      'Count the carbohydrates in every meal and spread them predictably through the day.']);
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
    // Червеното месо е в седмичния ритъм, а защо — в обяснението за подаграта.
    add('limit', ['Морски дарове, сардини и аншоа: малки порции и по-рядко.', 'Seafood, sardines and anchovies: small portions and less often.']);
    if (!F.prefs.has('noDairy') && !vegan) {
      add('prefer', has('stones')
        ? ['Нискомаслени млечни продукти всеки ден, 2–3 порции: така калцият е около 1000–1200 мг на ден.', 'Low-fat dairy every day, 2–3 portions: this gives about 1000–1200 mg of calcium a day.']
        : ['Нискомаслени млечни продукти всеки ден.', 'Low-fat dairy every day.']);
    }
  }

  // Кости: остеопороза, менопауза и след 65 г.; калцият и при предменструален синдром.
  const bones = has('osteoporosis') || F.age >= 65 || F.menopause;
  if (bones || has('pms')) {
    const ca = vegan || F.prefs.has('noDairy') ? ['растителни напитки с калций, тофу, бадеми и зелени листни зеленчуци', 'calcium-fortified plant drinks, tofu, almonds and leafy greens']
      : ['2–3 порции млечни (чаша кисело мляко, 30 г сирене), сардини с костите, бадеми и зелени листни зеленчуци', '2–3 portions of dairy (a glass of yogurt, 30 g of cheese), sardines with bones, almonds and leafy greens'];
    // При подагра с камъни млечните продукти и калцият вече са в правилото за подаграта.
    // 1000–1200 мг при остеопороза (ESCEO/IOF) и предменструален синдром (ACOG), иначе по EFSA.
    const mg = has('osteoporosis') || has('pms') ? ['1000–1200', '1000–1200'] : [v.b.calcium, v.e.calcium];
    if (!(has('gout') && has('stones'))) add('prefer', [`Калций около ${mg[0]} мг на ден от храната: ${ca[0]}.`, `About ${mg[1]} mg of calcium a day from food: ${ca[1]}.`]);
  }
  if (bones) add('notes', ['Витамин D: обичайната доза е 800–1000 IU на ден като добавка, по назначение.', 'Vitamin D: the usual dose is 800–1000 IU a day as a supplement, as prescribed.']);

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

  // Показателите от досието (версия 4.18): кои липсват или са стари — за лекаря.
  if (F.ind) {
    const miss = [];
    if (has('htn') && !F.ind.bp) miss.push(['налягане', 'blood pressure']);
    if ((has('dm2') || has('dm1')) && !F.ind.hba1c) miss.push(['HbA1c', 'HbA1c']);
    if (['dyslip', 'chd', 'pad', 'stroke'].some(has) && !F.ind.ldl) miss.push(['LDL', 'LDL']);
    if (has('gout') && !F.ind.urate) miss.push(['пикочна киселина', 'uric acid']);
    if (miss.length) {
      add('clinician', [`В досието няма скорошни резултати за: ${list(miss.map(m => m[0]), false)}. Обяснението към пациента не ги споменава.`,
        `The record has no recent results for: ${list(miss.map(m => m[1]), true)}. The explanation for the patient does not mention them.`]);
    }
  }

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
  // Мазната риба при високи триглицериди — в седмичния ритъм.
  dyslip: { prefer: [['Овесени ядки, бобови и ядки по-често: фибрите и растителните мазнини понижават холестерола.', 'Oats, pulses and nuts more often: their fiber and plant fats lower cholesterol.']] },
  copd: { prefer: [['По-малки и по-чести хранения, ако задухът Ви пречи да се храните.', 'Smaller, more frequent meals if breathlessness makes eating difficult.']] },
  // Колко често се мери теглото — в „Контрол на теглото“.
  dementia: { notes: [['Напомняне и помощ при храненето, ако е нужно. При неволна загуба на тегло добавете храна.', 'Reminders and help with meals if needed. With unintended weight loss, add more food.']] },
  stones: {
    // Калцият е в общото правило за костите (след 65 г. и при менопауза) или при подаграта.
    prefer: (v, F) => (F.cond.has('gout') || F.keys.has('gout') || F.keys.has('osteoporosis') || F.age >= 65 || F.menopause ? []
      : [['Млечни продукти не спирайте: 2–3 порции на ден, около 1000–1200 мг калций.', 'Do not stop dairy: 2–3 portions a day, about 1000–1200 mg of calcium.']]),
    limit: (v, F) => [['Спанак, цвекло, ядки и какао (много оксалати): умерено.', 'Spinach, beetroot, nuts and cocoa (high in oxalate): in moderation.'],
      ...(F.cond.has('gout') || F.keys.has('gout') ? [] : [['Животински белтък: умерено, месото и рибата в малки порции.', 'Animal protein: in moderation, with small portions of meat and fish.']])],
    avoid: [['Добавки с витамин C в големи дози.', 'High-dose vitamin C supplements.']],
  },
  hypok: { prefer: [['Храни с калий всеки ден: зеленчуци, бобови, плодове, картофи и кисело мляко.', 'Potassium-rich foods every day: vegetables, pulses, fruit, potatoes and yogurt.']] },
  // За пациента — в обяснението; за лекаря — тук.
  hypona: { clinician: [['Хипонатриемия: течностите и солта — според причината (ESE 2014); в режима няма препоръка за количество течности.', 'Hyponatremia: fluid and salt depend on the cause (ESE 2014); the plan gives no fluid target.']] },
  celiac: { notes: [['Глутенът е и в следите: общи тигани, панировки, сосове и бира. Купувайте продукти със знак „без глутен“.', 'Gluten also hides in traces: shared pans, breadcrumbs, sauces and beer. Buy products labeled gluten-free.']] },
  // По-малките порции и последното хранене преди сън — в обяснението и в менюто.
  gerd: { limit: [['Мазни и пържени храни, шоколад, кафе, газирани напитки и алкохол, ако засилват киселините.', 'Fatty and fried food, chocolate, coffee, fizzy drinks and alcohol, if they make heartburn worse.']] },
  ulcer: { limit: [['Алкохол, силно лютиво и много кафе, ако засилват болката. Противовъзпалителни обезболяващи само по назначение.', 'Alcohol, very spicy food and a lot of coffee, if they make the pain worse. Anti-inflammatory painkillers only as prescribed.']] },
  ibs: {
    prefer: [['Редовни хранения, без да пропускате. Овесени ядки и ленено семе при подуване.', 'Regular meals, without skipping. Oats and linseed for bloating.']],
    limit: [['Пресни плодове до 3 порции на ден. Бобови, лук и зеле в малки порции. Чай и кафе до 3 чаши, газирани напитки рядко.', 'Fresh fruit up to 3 portions a day. Pulses, onions and cabbage in small portions. Tea and coffee up to 3 cups, fizzy drinks rarely.']],
    notes: [['Ако оплакванията продължават, диета с малко ферментиращи храни (FODMAP) се прави само с диетолог и за кратко.', 'If symptoms continue, a low-FODMAP diet is done only with a dietitian and for a short time.']],
  },
  cirrhosis: { prefer: [['Лека закуска преди сън, например кисело мляко или филия с извара. Не стойте гладни повече от 6 часа през деня.', 'A light snack before bed, such as yogurt or a slice of bread with cottage cheese. Do not go more than 6 hours without food during the day.']] },
  gallstones: { limit: [['Обилни и много мазни хранения.', 'Large and very fatty meals.']] },
  pancreatitis: {
    prefer: [['5–6 по-малки хранения на ден. Ензимите, ако са Ви назначени, пийте с всяко хранене.', '5–6 smaller meals a day. If you have been prescribed enzymes, take them with every meal.']],
    avoid: [['Тютюнопушене.', 'Smoking.']],
  },
  dysphagia: {
    clinician: [['Дисфагия: консистенцията на храната и течностите се определя след оценка на преглъщането (логопед, IDDSI); менюто не е пригодено.', 'Dysphagia: food and fluid texture is set after a swallowing assessment (speech therapist, IDDSI); the menu is not adapted.']],
  },
  pcos: { prefer: [['Храни с нисък гликемичен индекс: бобови, пълнозърнести, зеленчуци и плодове с кората.', 'Foods with a low glycemic index: pulses, whole grains, vegetables and fruit with the skin on.']] },
  hyperthyroid: { avoid: [['Добавки с йод и водорасли.', 'Iodine and seaweed supplements.']] },
  vitd: { prefer: [['Мазна риба, яйца и обогатени млечни продукти по-често.', 'Oily fish, eggs and fortified dairy more often.']] },
  b12: { prefer: (v, F) => (F.prefs.has('vegan') ? [] : F.prefs.has('vegetarian')
    ? [['Яйца и млечни продукти всеки ден.', 'Eggs and dairy every day.']]
    : [['Всеки ден месо, риба, яйца или млечни продукти.', 'Meat, fish, eggs or dairy every day.']]) },
  folate: { prefer: [['Листни зеленчуци, бобови, броколи и пълнозърнести храни всеки ден.', 'Leafy greens, pulses, broccoli and whole grains every day.']] },
  hemochromatosis: {
    avoid: [['Добавки с желязо и с витамин C. Сурови миди и стриди.', 'Iron and vitamin C supplements. Raw mussels and oysters.']],
    limit: [['Алкохол и червено месо: умерено.', 'Alcohol and red meat: in moderation.']],
  },
  // При цел „покачване“ същото е в навиците.
  malnutrition: { prefer: (v, F) => (F.goal === 'gain' ? [] : [['5–6 хранения на ден с енергийно богати храни: зехтин, ядки, пълномаслено кисело мляко, сирене. Добавки за пиене по назначение.', '5–6 meals a day with energy-dense foods: olive oil, nuts, full-fat yogurt, cheese. Oral nutritional supplements as prescribed.']]) },
  cancer: { notes: [['Ако левкоцитите Ви са ниски, яжте само добре сготвени храни и измити плодове.', 'If your white cell count is low, eat only well-cooked food and washed fruit.']] },
  iem: {
    clinician: [['Вродено нарушение на обмяната (фенилкетонурия, непоносимост към фруктоза и др.): нужен е специализиран режим — менюто не е приложимо.', 'Inherited metabolic disorder (phenylketonuria, fructose intolerance etc.): a specialized diet is needed and this menu does not apply.']],
  },
  eating: {
    clinician: [['Хранително разстройство (NICE NG69): режимът се изготвя от специализиран екип; не давайте на пациента отчета с калориите.', 'Eating disorder (NICE NG69): the plan is made by a specialist team; do not give the patient the report with calorie figures.']],
  },
  psa: { notes: [['Ако приемате метотрексат или започвате ново лекарство, обсъдете алкохола с лекаря, който Ви го е назначил.', 'If you take methotrexate or are starting a new medicine, discuss alcohol with the doctor who prescribed it.']] },
  rheum: { notes: [['Ако приемате метотрексат или започвате ново лекарство, обсъдете алкохола с лекаря, който Ви го е назначил.', 'If you take methotrexate or are starting a new medicine, discuss alcohol with the doctor who prescribed it.']] },
  // Белтъкът на всяко хранене — в общото правило за белтъка.
  pressure: { prefer: (v, F) => (F.goal === 'gain' ? [] : [['При слаб апетит добавки за пиене по назначение.', 'With a poor appetite, oral nutritional supplements as prescribed.']]) },
  parkinson: {
    prefer: [['Кисело мляко или кефир всеки ден: и те помагат срещу запека.', 'Yogurt or kefir every day: they also help against constipation.']],
    notes: [['Ако ефектът на леводопата се колебае, повече от белтъка може да се премести вечер, с помощта на диетолог.', 'If the effect of levodopa fluctuates, more of your protein can be moved to the evening, with a dietitian’s help.']],
  },
  adpkd: { limit: [['Кафе: до 400 мг кофеин на ден, около 4 чаши.', 'Coffee: up to 400 mg of caffeine a day, about 4 cups.']] },
  gastroparesis: { prefer: [['Пасирани или добре сготвени ястия на малки хапки, с малко мазнини и без груби фибри като кожички на плодове и сурови зеленчуци.', 'Puréed or well-cooked dishes in small bites, low in fat and without coarse fiber such as fruit skins and raw vegetables.']] },
  transplant: {
    avoid: [['Грейпфрут, помело и сокът им.', 'Grapefruit, pomelo and their juice.']],
    notes: [['Калий, фосфор и белтък по резултатите от изследванията.', 'Potassium, phosphorus and protein according to your test results.']],
  },
  bph: { limit: [['Течности вечер, ако ставате често нощем. Кафе и алкохол: умерено.', 'Drinks in the evening, if you get up often at night. Coffee and alcohol: in moderation.']] },
  incontinence: { limit: [['Кафе и други напитки с кофеин: по-малко, ако имате чести позиви.', 'Coffee and other caffeinated drinks: less, if you have frequent urges.']] },
  pregnancy: {
    // Рибата с малко живак — в седмичния ритъм.
    prefer: [['Фолиева киселина 400 мкг на ден, поне до 12. седмица, и йодирана сол.', 'Folic acid 400 µg a day, at least until week 12, and iodized salt.']],
    avoid: [['Сурово или недопечено месо, риба и яйца, непастьоризирани млечни продукти, черен дроб, риба меч, акула и много риба тон.', 'Raw or undercooked meat, fish and eggs, unpasteurized dairy, liver, swordfish, shark and a lot of tuna.']],
    limit: [['Кафе: до 200 мг кофеин на ден, около 2 чаши.', 'Coffee: up to 200 mg of caffeine a day, about 2 cups.']],
    notes: (v, F) => [[`Препоръчителното наддаване за цялата бременност зависи от теглото преди нея: при ИТМ под 18,5 е 12,5–18 кг, при 18,5–24,9 е 11,5–16 кг, при 25–29,9 е 7–11,5 кг, а от 30 нагоре 5–9 кг.`,
      'Recommended weight gain for the whole pregnancy depends on your weight before it: with a BMI under 18.5 it is 12.5–18 kg, with 18.5–24.9 it is 11.5–16 kg, with 25–29.9 it is 7–11.5 kg, and from 30 upwards 5–9 kg.']],
  },
  lactation: { notes: [['Йод и витамин D като добавки, по препоръка.', 'Iodine and vitamin D as supplements, as advised.']] },
  amenorrhea: {
    clinician: [['Липса на менструация: изключете бременност. При ниско тегло, много тренировки или ограничено хранене причината може да е функционална хипоталамична аменорея — режимът не трябва да е с дефицит (Endocrine Society 2017).', 'Absent periods: rule out pregnancy. With low weight, heavy training or restricted eating, functional hypothalamic amenorrhea is possible and the plan should have no deficit (Endocrine Society 2017).']],
  },
  heavy: { notes: (v, F) => (F.keys.has('anemia') || F.cond.has('anemia') ? []
    : [['Ако кървенето е обилно, изследвайте кръвната картина. Добавка с желязо само при доказан недостиг.', 'If bleeding is heavy, have a blood count. An iron supplement only with a confirmed deficiency.']]) },
  allergy: {
    clinician: [['Хранителна алергия: впишете конкретния алерген в „Алергии“ (ядки, риба, мляко, яйца, соя, глутен) — тогава менюто го изключва.', 'Food allergy: record the specific allergen under “Allergies” (nuts, fish, milk, eggs, soy, gluten) so that the menu excludes it.']],
  },
  migraine: { prefer: [['Редовни хранения, без да пропускате, и достатъчно вода. Кафето в сходно количество всеки ден.', 'Regular meals, without skipping, and enough water. Coffee at a similar amount every day.']] },
  anxiety: { limit: [['Кафе и енергийни напитки: малко и само сутрин.', 'Coffee and energy drinks: a little, and only in the morning.']] },
};

/*
 * Целта „отслабване“ е сменена заради заболяването — бележка за лекаря. На пациента това е
 * казано в обяснението на заболяването и в писмото („Целта е …“).
 */
export const NO_LOSE = {
  cirrhosis: ['Цироза: целта „отслабване“ е сменена на поддържане — отслабване само по указание на хепатолога (EASL 2019).', 'Cirrhosis: the goal “lose weight” was changed to maintenance; weight loss only on a liver specialist’s advice (EASL 2019).'],
  malnutrition: ['Недохранване: целта „отслабване“ не се прилага — режимът е за поддържане или покачване (ESPEN 2022).', 'Undernutrition: the goal “lose weight” does not apply; the plan maintains or increases weight (ESPEN 2022).'],
  cancer: ['Онкологично лечение: целта „отслабване“ е сменена на поддържане — отслабване само със съгласието на онколога (ESPEN 2021).', 'Cancer treatment: the goal “lose weight” was changed to maintenance; weight loss only with the oncologist’s agreement (ESPEN 2021).'],
  eating: ['Хранително разстройство: целта „отслабване“ не се прилага (NICE NG69).', 'Eating disorder: the goal “lose weight” does not apply (NICE NG69).'],
  pressure: ['Рана от притискане: целта „отслабване“ е сменена на поддържане, докато раната зарасне (ESPEN 2022).', 'Pressure ulcer: the goal “lose weight” was changed to maintenance until the wound heals (ESPEN 2022).'],
  lactation: ['Кърмене: целта „отслабване“ е сменена на поддържане; плавно отслабване до 0,5 кг седмично е допустимо след първите 2 месеца.', 'Breastfeeding: the goal “lose weight” was changed to maintenance; gradual weight loss of up to 0.5 kg a week is acceptable after the first 2 months.'],
  pregnancy: ['Бременност: целта „отслабване“ не се прилага — енергията е по тримесечие (EFSA 2013).', 'Pregnancy: the goal “lose weight” does not apply; energy follows the trimester (EFSA 2013).'],
  gdm: ['Бременност: целта „отслабване“ не се прилага — енергията е по тримесечие (EFSA 2013).', 'Pregnancy: the goal “lose weight” does not apply; energy follows the trimester (EFSA 2013).'],
};

/* ------------------------------ ритъм, навици ------------------------------ */

/** Седмичният ритъм — [bg, en]. */
export function weeklyPairs(F) {
  const has = hasOf(F);
  const veg = F.prefs.has('vegetarian');
  const out = [];
  if (!veg && !F.prefs.has('noFish')) {
    out.push(F.pregnancy ? ['Риба с малко живак 2 пъти седмично: сьомга, пъстърва, скумрия или сардини.', 'Fish low in mercury twice a week: salmon, trout, mackerel or sardines.']
      : has('tg') ? ['Мазна риба 2 пъти седмично: скумрия, сьомга, пъстърва или сардини.', 'Oily fish twice a week: mackerel, salmon, trout or sardines.']
        : ['Риба 2 пъти седмично, едната мазна: скумрия, сьомга или пъстърва.', 'Fish twice a week, one of them oily: mackerel, salmon or trout.']);
  }
  out.push(has('ibs') ? ['Бобови в малки порции, ако не Ви подуват.', 'Pulses in small portions, if they do not bloat you.']
    : F.limitK ? ['Бобови: малки порции и по-рядко заради калия.', 'Pulses: small portions and less often, because of potassium.']
      : ['Бобови поне 3 пъти седмично: леща, боб, нахут или грах.', 'Pulses at least 3 times a week: lentils, beans, chickpeas or peas.']);
  if (!veg && !F.prefs.has('noRedMeat')) {
    out.push(has('gout') ? ['Червено месо до веднъж седмично заради подаграта; колбаси по изключение.', 'Red meat up to once a week because of gout; cured meats only as an exception.']
      : ['Червено месо до 2 пъти седмично, постно; колбаси по изключение.', 'Red meat up to twice a week, lean; cured meats only as an exception.']);
  }
  if (!F.prefs.has('noEgg') && !F.prefs.has('vegan')) out.push(['Яйца: до едно на ден е безопасно и при повечето сърдечни заболявания.', 'Eggs: up to one a day is safe, even with most heart conditions.']);
  out.push(has('dm2') || has('dm1') || has('prediabetes')
    ? ['Сладкиш рядко, в малка порция и само след основно хранене, не между храненията.', 'Cake or sweets rarely, in a small portion and only after a main meal, not between meals.']
    : ['Сладкиш веднъж седмично, в малка порция.', 'Cake or sweets once a week, in a small portion.']);
  return out;
}

/** Навиците — [bg, en] по целта. */
export function habitPairs(F) {
  const out = [];
  const has = hasOf(F);
  if (F.goal === 'lose') {
    out.push(['Планирайте менюто и пазаруването за седмицата: така купувате по-малко излишни неща.', 'Plan your menu and shopping for the week: you will buy fewer things you do not need.']);
    out.push(['Хранете се без екран и спрете при приятна ситост.', 'Eat away from screens and stop when pleasantly full.']);
    // При диабет и мастен черен дроб подсладените напитки са в „Избягвайте“ с причината.
    if (!['dm2', 'dm1', 'prediabetes', 'masld'].some(has)) out.push(['Вода, чай или кафе без захар вместо подсладени напитки и сокове.', 'Water, tea or coffee without sugar instead of sweetened drinks and juices.']);
    out.push(['Спете 7–9 часа: недоспиването увеличава апетита.', 'Sleep 7–9 hours: lack of sleep increases appetite.']);
  }
  if (F.goal === 'gain') {
    out.push(['Хранете се на всеки 3 часа и добавяйте към ястията зехтин, ядки, авокадо или пълномаслено кисело мляко.', 'Eat every 3 hours and add olive oil, nuts, avocado or full-fat yogurt to your dishes.']);
    out.push(['Пийте след храненето, не преди него, за да не се засищате с течности.', 'Drink after meals, not before, so that you do not fill up on fluid.']);
    out.push(['Смути и кисело мляко с ядки са лесни закуски с много енергия.', 'Smoothies and yogurt with nuts are easy, energy-rich snacks.']);
    out.push(['При слаб апетит хранителните добавки за пиене (поне 400 kcal и 30 г белтък на ден) се дават по назначение.', 'With a poor appetite, oral nutritional supplements (at least 400 kcal and 30 g of protein a day) are given as prescribed.']);
  }
  if (F.goal === 'maintain') {
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
  // При сърдечна недостатъчност — всяка сутрин, защото бързото наддаване е задържана вода.
  const hf = hasOf(F)('hf') ? ['Претегляйте се всяка сутрин, след тоалетна и преди закуска. Ако наддадете с повече от 2 кг за 3 дни, обадете ми се или на кардиолога си.',
    'Weigh yourself every morning, after using the toilet and before breakfast. If you gain more than 2 kg in 3 days, call me or your cardiologist.'] : null;
  // По време на бременност теглото расте — колко, е в бележката за наддаването.
  if (F.pregnancy) return [hf || ['Претегляйте се веднъж седмично и записвайте теглото.', 'Weigh yourself once a week and write it down.']];
  if (F.goal === 'lose') {
    return [
      hf ? [`${hf[0]} Обиколката на талията мерете веднъж месечно.`, `${hf[1]} Measure your waist once a month.`]
        : ['Претегляйте се веднъж седмично, сутрин, на гладно. Обиколката на талията мерете веднъж месечно.', 'Weigh yourself once a week, in the morning, before eating. Measure your waist once a month.'],
      ['Ако за 3 поредни седмици теглото спада с по-малко от 0,25 кг седмично, ще намалим енергията със 150–200 kcal или ще добавим движение; ако спада с повече от 1 кг седмично, ще я увеличим с 200 kcal.',
        'If you lose less than 0.25 kg a week for 3 weeks in a row, we will cut energy by 150–200 kcal or add activity; if you lose more than 1 kg a week, we will add 200 kcal.'],
      ['Когато стигнете целта, енергията се увеличава постепенно, със 100–200 kcal на седмица, до поддържане.', 'When you reach your goal, energy is increased gradually, by 100–200 kcal a week, up to maintenance.'],
    ];
  }
  if (F.goal === 'gain') {
    return [
      hf || ['Претегляйте се веднъж седмично, при едни и същи условия.', 'Weigh yourself once a week, under the same conditions.'],
      ['Ако 3 седмици няма покачване, ще добавим 200–300 kcal; ако наддавате с повече от 1 кг седмично, ще намалим с 200 kcal.', 'If there is no gain for 3 weeks, we will add 200–300 kcal; if you gain more than 1 kg a week, we will take off 200 kcal.'],
    ];
  }
  return [hf || ['Претегляйте се веднъж седмично. Колебания до 1 кг нагоре или надолу са нормални.', 'Weigh yourself once a week. Changes of up to 1 kg either way are normal.']];
}

/* ------------------------- дневник и контролен преглед (версия 4.18) ------------------------- */

/* Целта за налягането, измерено у дома: 140/90 в кабинета отговаря на 135/85 у дома (ESC 2024); по-ниските са еднакви. */
const homeBp = (t) => (t && t.sys === 140 && t.dia === 90 ? { sys: 135, dia: 85 } : t);

/** Колко седмици има в дневника — колкото до контролния преглед при отслабване и покачване. */
export const DIARY_WEEKS = 4;

/**
 * Дневникът на пациента: какво да записва всеки ден според заболяванията, лекарствата и целта.
 * Редовете са от три вида: value — число (тегло, минути), two — две числа на ден (сутрин и вечер),
 * check — отметка „спазих го“, mark — отметка „имаше оплакване“. Под таблицата са полетата за
 * седмицата (тегло, талия). Връща { intro: [bg, en], rows: [{ key, kind, label, hint }], fields }.
 */
export function diaryFor(F) {
  const has = hasOf(F);
  const v = numbers(F);
  const rows = [];
  const row = (key, kind, bg, en, hintBg = '', hintEn = '') => rows.push({ key, kind, label: [bg, en], hint: [hintBg, hintEn] });
  const hf = has('hf');
  const hypoRisk = has('dm1') || F.classes.has('INSULIN') || F.classes.has('SU');

  // Тегло всеки ден — само при сърдечна недостатъчност; иначе е веднъж седмично, под таблицата.
  if (hf) row('weight', 'value', 'Тегло, кг', 'Weight, kg', 'всяка сутрин преди закуска', 'every morning before breakfast');
  if (has('htn') || hf || F.ckd || ['ckd12', 'gn', 'adpkd'].some(has)) {
    const t = homeBp(F.ind?.targets?.bp);
    row('bp', 'two', `Кръвно налягане${t ? ` (цел под ${t.sys}/${t.dia})` : ''}`, `Blood pressure${t ? ` (target below ${t.sys}/${t.dia})` : ''}`,
      'сутрин и вечер, след 5 минути покой', 'morning and evening, after 5 minutes of rest');
  }
  // Самоконтрол на кръвната захар — при инсулин, сулфонилурейни и гестационен диабет (NICE NG28, ADA 2026).
  if (hypoRisk || has('gdm')) {
    row('glucose', 'two', 'Кръвна захар, mmol/L', 'Blood glucose, mmol/L', has('gdm') ? 'на гладно и 1 час след хранене' : 'на гладно и преди сън', has('gdm') ? 'fasting and 1 hour after a meal' : 'fasting and at bedtime');
  }
  if (hf) row('fluids', 'value', 'Течности общо, мл', 'Total fluids, ml', `около ${v.b.fluids} л на ден`, `about ${v.e.fluids} l a day`);
  else if (F.dialysis) row('fluids', 'value', 'Течности общо, мл', 'Total fluids, ml', 'колкото е определил нефрологът', 'as much as your nephrologist has set');
  else if (has('stones')) row('fluids', 'value', 'Вода и чай, чаши', 'Water and tea, glasses', `поне ${v.b.fluids} л на ден`, `at least ${v.e.fluids} l a day`);
  else if (!has('hypona') && (F.age >= 65 || ['gout', 'constipation', 'hemorrhoids', 'fissure', 'diverticula', 'uti'].some(has))) {
    row('fluids', 'value', 'Вода и чай, чаши', 'Water and tea, glasses', `около ${v.b.fluids} л на ден`, `about ${v.e.fluids} l a day`);
  }
  if (F.goal === 'gain' || has('malnutrition')) row('meals', 'check', 'Всички хранения, без пропуснато', 'All meals, none skipped');
  else row('meals', 'check', 'Хранене по менюто', 'Meals as in the menu');
  if (F.lowSalt) row('salt', 'check', 'Без досоляване и солени храни', 'No added salt or salty foods');
  if (F.goal !== 'gain' && !F.limitK && !F.dialysis) row('veg', 'check', 'Зеленчуци на обяд и на вечеря', 'Vegetables at lunch and dinner');
  if (F.goal === 'lose' || ['dm2', 'prediabetes', 'masld', 'tg'].some(has)) row('sugar', 'check', 'Без сладко и подсладени напитки', 'No sweets or sweetened drinks');
  if (F.pregnancy || ['masld', 'cirrhosis', 'pancreatitis', 'alcohol', 'gout', 'tg'].some(has)) row('alcohol', 'check', 'Без алкохол', 'No alcohol');
  row('activity', 'value', has('pad') ? 'Ходене, минути' : 'Движение, минути', has('pad') ? 'Walking, minutes' : 'Activity, minutes');

  // Оплакванията — до два реда, по реда на значимост; отбелязват се дните, в които ги е имало.
  const S = [
    [hf, 'breath', 'Задух или отоци по краката', 'Breathlessness or swollen legs'],
    [hypoRisk, 'hypo', 'Ниска кръвна захар', 'Low blood sugar'],
    [has('gout'), 'joint', 'Болка в ставите', 'Joint pain'],
    [has('ibs') || has('ibd'), 'gut', 'Болка, подуване или диария', 'Pain, bloating or diarrhea'],
    [['constipation', 'hemorrhoids', 'fissure'].some(has), 'stool', 'Дни без изхождане', 'Days without a bowel movement'],
    [has('gerd') || has('ulcer'), 'heartburn', 'Киселини или болка в стомаха', 'Heartburn or stomach pain'],
    [F.glp1, 'nausea', 'Гадене', 'Nausea'],
    [has('gallstones') || has('pancreatitis'), 'pain', 'Болка след хранене', 'Pain after eating'],
    [has('migraine'), 'headache', 'Главоболие', 'Headache'],
  ].filter(s => s[0]).slice(0, 2);
  for (const [, key, bg, en] of S) row(key, 'mark', bg, en, 'отбележете, ако е имало', 'tick if it happened');

  // Под таблицата: теглото веднъж седмично и талията в началото и в края (при отслабване).
  const fields = [];
  if (!hf) fields.push({ key: 'weight', label: ['Тегло, кг', 'Weight, kg'], weeks: 'all' });
  if (F.goal === 'lose' && !F.pregnancy) fields.push({ key: 'waist', label: ['Талия, см', 'Waist, cm'], weeks: 'ends' });
  return {
    intro: ['Попълвайте дневника всеки ден и го донесете на следващия преглед. Така заедно ще видим какво помага и какво да променим.',
      'Fill in the diary every day and bring it to your next visit. That way we will see together what helps and what to change.'],
    rows, fields,
  };
}

/**
 * Контролният преглед: след колко седмици и какво да се провери. При отслабване, покачване,
 * бременност, недохранване и лечение с GLP-1 — след 4 седмици, иначе след 12. Изследванията се
 * предлагат само при досие (F.ind): които липсват или дотогава ще са по-стари от срока си.
 * Връща { weeks, keys } — ключове от FOLLOW_CHECKS.
 */
export const FOLLOW_CHECKS = {
  weight: ['тегло', 'weight'], waist: ['талия', 'waist'], bp: ['налягане', 'blood pressure'], diary: ['дневника', 'the diary'],
  hba1c: ['HbA1c', 'HbA1c'], lipids: ['липиден профил', 'lipid profile'], urate: ['пикочна киселина', 'uric acid'],
  kidney: ['калий и креатинин', 'potassium and creatinine'], cbc: ['кръвна картина и феритин', 'blood count and ferritin'],
};

export function followUpFor(F) {
  const has = hasOf(F);
  const weeks = F.goal !== 'maintain' || F.pregnancy || F.glp1 || has('malnutrition') ? 4 : 12;
  const keys = ['weight'];
  if (F.goal === 'lose' && !F.pregnancy) keys.push('waist');
  if (has('htn') || has('hf') || F.ckd) keys.push('bp');
  keys.push('diary');
  if (F.ind) {
    // Резултатът е „за повторение“, ако липсва или към прегледа ще е по-стар от months месеца.
    const due = (r, months) => !r || monthsBetween(r.date, F.asOf) + weeks / 4.35 > months;
    const dm = ['dm2', 'dm1', 'prediabetes'].some(has);
    // HbA1c — на 3 месеца извън целта и на 6 месеца в нея (ADA 2026); при предиабет — веднъж годишно.
    if (dm && due(F.ind.hba1c, has('prediabetes') && !has('dm2') && !has('dm1') ? 12 : F.ind.hba1c?.ok ? 6 : 3)) keys.push('hba1c');
    // Липиди — 2–3 месеца след промяна, когато LDL е над целта (ESC/EAS 2019), иначе веднъж годишно.
    if (['dyslip', 'chd', 'pad', 'stroke', 'tg'].some(has) && due(F.ind.ldl, F.ind.ldl?.ok === false ? 3 : 12)) keys.push('lipids');
    if (has('gout') && due(F.ind.urate, F.ind.urate?.ok ? 12 : 6)) keys.push('urate');
    // Калий и креатинин — при ХБЗ и при лекарства, които задържат калий.
    if ((F.ckd || kSparing(F)) && (due(F.ind.k, F.ckdAdvanced ? 3 : 6) || due(F.ind.egfr, F.ckdAdvanced ? 3 : 6))) keys.push('kidney');
    if ((has('anemia') || has('heavy')) && (due(F.ind.hb, 3) || F.ind.hb?.low)) keys.push('cbc');
  }
  return { weeks, keys };
}

/** Цели месеци (с десети) между две дати ISO. */
function monthsBetween(from, to) {
  if (!from || !to) return 0;
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (30.44 * 86400000);
}

/* ---------------------------------- резюме ---------------------------------- */

/* Най-важното за човека — по реда на значимост, до 3 неща. */
function priorities(F) {
  const has = hasOf(F);
  const P = [];
  // topic — една тема веднъж: „белтък на всяко хранене“ не се казва три пъти по различен начин.
  const add = (cond, bg, en, topic = bg) => { if (cond && !P.some(p => p[0] === bg || p[2] === topic)) P.push([bg, en, topic]); };
  const salty = has('htn') || has('hf') || F.ckd || F.dialysis || ['gn', 'adpkd', 'ckd12', 'stones', 'cirrhosis'].some(has);
  add(has('celiac'), 'строго без глутен', 'strictly no gluten');
  // След 75 г. най-важното е да се храните достатъчно (ESPEN 2022, ADA 2026 за възрастните хора).
  add(F.age >= 75 && !F.ckd && !F.dialysis, 'достатъчно храна и белтък на всяко хранене', 'enough food and protein at every meal', 'protein');
  add(F.age >= 75 && (F.ckd || F.dialysis), 'достатъчно храна, за да не губите мускули', 'enough food so that you do not lose muscle');
  add(F.dialysis, 'течностите и калият по указанията на нефролога', 'fluids and potassium as your nephrologist advises', 'fluids');
  add(F.ckd, 'умерено количество белтък', 'moderate protein', 'protein');
  add(has('gdm'), 'въглехидратите, разпределени в 5–6 хранения', 'carbohydrates spread over 5–6 meals', 'carbs');
  add(has('dm1'), 'броенето на въглехидратите', 'counting carbohydrates', 'carbs');
  add((has('dm2') || has('prediabetes')) && F.age < 75, 'по-малко бързи въглехидрати', 'fewer fast-acting carbohydrates', 'carbs');
  add((has('dm2') || has('prediabetes')) && F.age >= 75, 'редовни хранения без ниска кръвна захар', 'regular meals without low blood sugar', 'carbs');
  add(salty, 'малко сол', 'little salt', 'salt');
  add(has('hf'), 'течностите под контрол', 'fluids kept under control', 'fluids');
  add(has('stones'), 'много течности', 'plenty of fluids', 'fluids');
  add(has('gout'), 'без бира и карантия', 'no beer or offal');
  add(has('masld') || has('cirrhosis') || has('pancreatitis') || has('alcohol'), 'без алкохол', 'no alcohol');
  add(['malnutrition', 'cancer', 'pressure', 'cirrhosis'].some(has), 'белтък и енергия на всяко хранене', 'protein and energy at every meal', 'protein');
  add(has('anemia') || has('heavy'), 'храни с желязо всеки ден', 'iron-rich foods every day');
  add(has('osteoporosis'), 'калций всеки ден', 'calcium every day');
  add(['chd', 'pad', 'stroke', 'dyslip', 'tg'].some(has), 'по-малко наситени мазнини', 'less saturated fat');
  add(has('ibs'), 'редовни хранения с по-малко бобови и лук', 'regular meals with fewer pulses and onions');
  add(['constipation', 'diverticula', 'hemorrhoids', 'fissure'].some(has), 'повече фибри и вода', 'more fiber and water');
  add(F.glp1, 'малки порции с белтък', 'small portions with protein', 'protein');
  add(F.age >= 65 && !F.ckd && !F.dialysis, 'белтък на всяко хранене', 'protein at every meal', 'protein');
  add(F.pregnancy, 'фолиевата киселина и безопасните храни', 'folic acid and safe foods');
  add(F.goal === 'lose', 'по-малки порции и повече зеленчуци', 'smaller portions and more vegetables', 'veg');
  // При покачване на тегло — по-често и по-хранително, а не „повече зеленчуци и по-малко сол“.
  add(F.goal === 'gain', 'по-чести хранения с енергийно богати храни', 'more frequent meals with energy-dense foods');
  add(F.goal !== 'gain', 'повече зеленчуци', 'more vegetables', 'veg');
  add(F.goal !== 'gain', P.some(p => p[2] === 'salt') ? 'по-малко захар' : 'по-малко сол и захар', P.some(p => p[2] === 'salt') ? 'less sugar' : 'less salt and sugar');
  return P.slice(0, 3);
}

/**
 * Резюмето — писмото на лекаря към човека: на какво се основава режимът, целта, защо е
 * избран моделът, дневните числа, най-важното и кога ще прегледаме резултата.
 * Връща [bg абзаци, en абзаци].
 */
export function summaryFor(F) {
  const v = numbers(F);
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
  // Ако режимът цитира изследвания от досието, писмото го казва.
  const labs = F.ind && ['hba1c', 'ldl', 'tg', 'urate', 'hb', 'ferritin', 'vitd', 'b12', 'k', 'egfr'].some(k => F.ind[k]);
  bg.push(`Съставих този режим специално за Вас според теглото (${v.b.weight} кг), ръста (${v.b.height} см), възрастта (${v.b.age} г.), движението${labs ? ', последните Ви изследвания' : ''}${names.length ? ` и заболяванията Ви: ${cut(names, false)}` : ' и навиците Ви'}.`);
  en.push(`I have put this plan together for you based on your weight (${v.e.weight} kg), height (${v.e.height} cm), age (${v.e.age}), activity${labs ? ', your latest test results' : ''}${namesEn.length ? ` and your conditions: ${cut(namesEn, true)}` : ' and habits'}.`);
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
  // Промяната в теглото по измерванията в досието — към изречението за целта.
  const w = F.ind?.weight;
  if (w && Math.abs(w.change) >= 1 && !F.pregnancy) {
    const kg = [one(Math.abs(w.change), false), one(Math.abs(w.change), true)];
    const i = bg.length - 1;
    if (w.change < 0 && F.goal === 'lose') {
      bg[i] += ` От ${dateBg(w.from)} досега сте свалили ${kg[0]} кг.`;
      en[i] += ` Since ${dateEn(w.from)} you have lost ${kg[1]} kg.`;
    } else if (w.change < 0) {
      bg[i] += ` От ${dateBg(w.from)} досега теглото Ви е спаднало с ${kg[0]} кг.`;
      en[i] += ` Since ${dateEn(w.from)} your weight has gone down by ${kg[1]} kg.`;
    } else {
      bg[i] += ` От ${dateBg(w.from)} досега теглото Ви се е покачило с ${kg[0]} кг.`;
      en[i] += ` Since ${dateEn(w.from)} your weight has gone up by ${kg[1]} kg.`;
    }
  }
  // Моделът — с причината накратко; подробностите са в обясненията под писмото.
  const short = patternShort(F);
  const fit = names.length > 1 ? ['с всяко от заболяванията Ви', 'to each of your conditions'] : ['със заболяването Ви', 'to your condition'];
  const tail = names.length
    ? [`По-долу обяснявам защо${short ? '' : ' избрах точно него'} и как съобразих храненето ${fit[0]}.`, `Below I explain why${short ? '' : ' I chose it'}, and how I have adapted your diet ${fit[1]}.`]
    : [`По-долу обяснявам защо${short ? '' : ' избрах точно него'}.`, `Below I explain why${short ? '' : ' I chose it'}.`];
  const join = (s) => (s.startsWith(',') ? s : ` ${s}`);
  bg.push(`Препоръчвам Ви ${PATTERN_PHRASE[F.pattern][0]}${short ? join(short[0]) : ''}. ${tail[0]}`);
  en.push(`I recommend ${PATTERN_PHRASE[F.pattern][1]}${short ? join(short[1]) : ''}. ${tail[1]}`);
  bg.push(`Всеки ден Ви трябват около ${v.b.kcal} kcal и ${v.b.protein} г белтък${F.fluidsRestricted ? '' : `, около ${v.b.fluids} л течности`} и не повече от ${v.b.salt} г сол.`);
  en.push(`Each day you need about ${v.e.kcal} kcal and ${v.e.protein} g of protein${F.fluidsRestricted ? '' : `, about ${v.e.fluids} l of fluid`} and no more than ${v.e.salt} g of salt.`);
  const P = priorities(F);
  bg.push(`Най-важното за Вас: ${P.map(p => p[0]).join('; ')}.`);
  en.push(`What matters most for you: ${P.map(p => p[1]).join('; ')}.`);
  // Колко често да се претегля — в „Контрол на теглото“; тук е само кога ще прегледаме режима.
  if (F.pregnancy) {
    bg.push('Ще следим наддаването на всеки преглед и при нужда ще променим режима.');
    en.push('We will check your weight gain at every visit and change the plan if needed.');
  } else if (F.goal === 'maintain') {
    bg.push('Ако теглото се промени с повече от 2 кг, ще коригираме режима.');
    en.push('If your weight changes by more than 2 kg, we will adjust the plan.');
  } else {
    bg.push('След 4 седмици ще преценим заедно резултата и при нужда ще променим режима.');
    en.push('After 4 weeks we will review the results together and change the plan if needed.');
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
  const bg = [`Съставих този режим за детето според възрастта, теглото (${kg} кг), ръста (${fmt(F.height, false)} см) и движението му${names.length ? `, както и заболяванията: ${list(names.map(lower1), false)}` : ''}.`,
    'Целта не е определено тегло, а детето да расте по своята крива. Затова няма диети, а балансирано хранене като за връстниците, с повече зеленчуци и по-малко сладко и солено.',
    `Всеки ден детето има нужда от около ${F.kcal} kcal. Ще следим ръста и теглото на профилактичните прегледи.`];
  const en = [`I have put this plan together for your child based on their age, weight (${kge} kg), height (${fmt(F.height, true)} cm) and activity${namesEn.length ? `, as well as their conditions: ${list(namesEn.map(lower1), true)}` : ''}.`,
    'The aim is not a particular weight but for your child to grow along their own curve. That is why there are no diets, just balanced eating like other children their age, with more vegetables and fewer sweet and salty foods.',
    `Each day your child needs about ${F.kcal} kcal. We will check height and weight at routine check-ups.`];
  return [[bg.slice(0, 2).join(' '), bg[2]], [en.slice(0, 2).join(' '), en[2]]];
}
