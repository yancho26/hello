/* Тренировъчен план, синхронизиран с храненето и менструалния цикъл (версия 4.7).
 *
 * Цели за седмицата — СЗО 2020: 150–300 мин умерена или 75–150 мин интензивна аеробна
 * активност (интензивната се брои двойно), силови упражнения поне 2 дни; след 65 г. —
 * упражнения за баланс и сила поне 3 дни; при бременност — поне 150 мин умерена.
 * Интензивност по разхода на енергия (2024 Adult Compendium of Physical Activities):
 * под 3 MET — лека, 3–5,9 — умерена, от 6 — интензивна; усещане по скалата 0–10 (RPE)
 * и тест с говорене; пулс по Tanaka (208 − 0,7 × възраст), без пулс при бета-блокер.
 * Силова тренировка — ACSM (8–15 повторения, 2–4 серии, едни и същи мускули през 48 ч).
 * Натоварването расте постепенно; 4-тата седмица е по-лека.
 *
 * Менструалният цикъл: фазата почти не влияе на постиженията (McNulty 2020) и на силата
 * (Colenso-Semple 2023) — затова планът не мести тренировките по фази, освен ако това е
 * изрично избрано; дава съвети по самочувствие, температура и загрявка.
 *
 * Версия 4.14:
 *  - пулс по резерва (Karvonen), ако е известен пулсът в покой: умерено 40–59%, интензивно
 *    60–89% (ACSM 2011); при онкологично заболяване — по максималния (Scharhag-Rosenberger 2015);
 *  - крачки на ден: 6000–8000 след 60 г. и 8000–10 000 под 60 г. (Paluch 2022), 7000 — с ясна
 *    полза (Ding 2025);
 *  - по диагнозите: периферна артериална болест — ходене до умерена или силна болка в прасеца
 *    (ACC/AHA 2024); сърдечна недостатъчност (Cochrane 2024); инсулт (AHA/ASA 2014); диабетна
 *    ретинопатия и невропатия (ADA 2026); онкологично заболяване (ACSM 2019); възпалителен
 *    артрит (EULAR 2018); саркопения (ICFSR 2018); множествена склероза (Kalb 2020); Паркинсон
 *    (Cochrane 2024); поликистозни яйчници (PCOS 2023); тазово дъно при инконтиненция,
 *    бременност и след раждане (NICE NG123, NG210); GLP-1 агонист — силови поне 3 пъти
 *    (ACLM/ASN/OMA/TOS 2025);
 *  - как се прави всяко силово упражнение и упражненията за баланс и тазово дъно.
 * Общо за сървъра и интерфейса. */

import { table } from './table.js';
import { addDays } from './dates.js';

/* ------------------------------------ речници ------------------------------------ */

/* MET по 2024 Adult Compendium (кодът е в коментара); strength — силово натоварване на
 * големите мускулни групи; balance — баланс; impact — удар за костите и ставите;
 * contact — контакт или риск от падане. */
export const ACTIVITIES = table({
  gym: { label: 'фитнес с тежести и уреди', icon: '🏋', role: 'strength', met: { light: 3.5, moderate: 5.0, vigorous: 6.0 }, strength: true, impact: 'low' }, // 02054, 02052, 02050
  bodyweight: { label: 'упражнения у дома със собствено тегло', icon: '🤸', role: 'strength', met: { light: 2.8, moderate: 3.8, vigorous: 6.5 }, strength: true, impact: 'low' }, // 02024, 02022, 02057
  reformer: { label: 'реформър пилатес', icon: '🛏', role: 'mobility', met: { light: 2.8, moderate: 2.8, vigorous: 2.8 }, strength: true, balance: true, impact: 'none' }, // 02105
  matpilates: { label: 'пилатес на постелка', icon: '🧘', role: 'mobility', met: { light: 1.8, moderate: 2.8, vigorous: 2.8 }, strength: true, balance: true, impact: 'none' }, // 02103, 02105
  yoga: { label: 'йога', icon: '🕉', role: 'mobility', met: { light: 2.3, moderate: 4.0, vigorous: 4.0 }, balance: true, impact: 'none' }, // 02150, 02160
  taichi: { label: 'тай чи', icon: '☯', role: 'mobility', met: { light: 3.3, moderate: 3.3, vigorous: 3.3 }, balance: true, impact: 'none' }, // 15670
  running: { label: 'бягане', icon: '🏃', role: 'cardio', met: { light: 7.5, moderate: 8.5, vigorous: 9.3 }, impact: 'high' }, // 12020, 12030, 12050
  walking: { label: 'бързо или нордическо ходене', icon: '🚶', role: 'cardio', met: { light: 3.8, moderate: 4.8, vigorous: 5.5 }, impact: 'low' }, // 17190, 17200, 17220
  cycling: { label: 'колоездене или спининг', icon: '🚴', role: 'cardio', met: { light: 4.0, moderate: 6.8, vigorous: 9.0 }, impact: 'none' }, // 01010, 01200, 01270
  swimming: { label: 'плуване или аква аеробика', icon: '🏊', role: 'cardio', met: { light: 5.3, moderate: 5.8, vigorous: 8.0 }, impact: 'none' }, // 02120, 18240, 18290
  rowing: { label: 'гребен ергометър или кростренажор', icon: '🚣', role: 'cardio', met: { light: 5.0, moderate: 5.0, vigorous: 7.3 }, strength: false, impact: 'none' }, // 02048, 02071, 02070
  hiit: { label: 'кръгова или функционална тренировка (HIIT)', icon: '⚡', role: 'mixed', met: { light: 3.5, moderate: 5.0, vigorous: 7.5 }, strength: true, impact: 'high' }, // 02034, 02035, 02040
  dance: { label: 'аеробика, зумба или танци', icon: '💃', role: 'cardio', met: { light: 3.0, moderate: 4.8, vigorous: 6.5 }, balance: true, impact: 'high' }, // 03040, 02005, 02310
  team: { label: 'отборен спорт (футбол, волейбол, баскетбол)', icon: '⚽', role: 'sport', met: { light: 3.0, moderate: 7.0, vigorous: 9.5 }, impact: 'high', contact: true }, // 15720, 15610, 15605
  racket: { label: 'тенис, падел или бадминтон', icon: '🎾', role: 'sport', met: { light: 4.5, moderate: 5.5, vigorous: 8.0 }, impact: 'high', contact: true }, // 15685, 15030, 15690
  hiking: { label: 'планински преходи', icon: '🥾', role: 'cardio', met: { light: 3.8, moderate: 5.3, vigorous: 7.8 }, impact: 'low' }, // 17081, 17082, 17012
});

export const TRAINING_LEVELS = table({
  beginner: 'начинаещ — досега почти без тренировки',
  intermediate: 'среден — тренира от няколко месеца',
  advanced: 'напреднал — тренира редовно от години',
});

export const TRAINING_FOCUS = table({
  health: 'здраве и кондиция',
  weight: 'отслабване и поддържане на теглото',
  muscle: 'сила и мускулна маса',
  endurance: 'издръжливост (бягане, колело, плуване)',
  mobility: 'гъвкавост, стойка и гръб',
  bone: 'кости и баланс',
});

export const TRAINING_TIMES = table({
  any: { label: 'по удобство', clock: null },
  morning: { label: 'сутрин', clock: '7:00' },
  midday: { label: 'на обяд', clock: '12:30' },
  afternoon: { label: 'следобед', clock: '17:30' },
  evening: { label: 'вечер', clock: '19:30' },
});

export const SESSION_MINUTES = [20, 30, 45, 60, 75, 90];

export const INTENSITY = table({
  light: { label: 'леко', rpe: '2–3', talk: 'говорите свободно' },
  moderate: { label: 'умерено', rpe: '4–6', talk: 'можете да говорите, но не и да пеете' },
  vigorous: { label: 'интензивно', rpe: '7–8', talk: 'казвате само по няколко думи' },
});

/* Упражненията в плана и как се правят (версия 4.14). Имената са същите като в текста на тренировката. */
const SQUAT_HOW = 'Стъпалата са на ширината на раменете; клякате назад и надолу, сякаш сядате на стол, гърбът е изправен, коленете следват посоката на пръстите; ставате, като бутате пода с петите.';
const RDL_HOW = 'Коленете са леко свити, гърбът — изправен; навеждате се, като бутате таза назад, тежестта се плъзга по бедрата до средата на подбедрицата; изправяте се, като стягате седалището.';
const LUNGE_HOW = 'Крачка напред или назад и сгъване на двете колене до около 90°; предното коляно е над стъпалото, тялото — изправено; връщате се, като бутате с предния крак.';
const PLANK_HOW = 'Опора на предмишниците и пръстите (по-лесно — на колене); тялото е в права линия от главата до петите, коремът е стегнат, дишате спокойно.';
const SIDE_HOW = 'Легнали настрани, опора на лакътя (по-лесно — и на коленете); повдигате таза, докато тялото е в права линия, и задържате 15–30 с на всяка страна.';
const BRIDGE_HOW = 'По гръб, коленете са свити, стъпалата на пода; повдигате таза, докато коленете, тазът и раменете са на една линия, задържате 1–2 с и спускате бавно.';
const ROW_BAND_HOW = 'Ластикът е закачен пред вас на височината на гърдите; дърпате дръжките към корема, лопатките се събират назад, после връщате бавно.';
const OHP_HOW = 'Дъмбелите са на нивото на раменете; избутвате ги нагоре, без да извивате кръста, и ги спускате бавно (седнал — с опрян гръб).';
const PUSHUP_HOW = 'Ръцете са малко по-широко от раменете, тялото — в права линия; сгъвате лактите, докато гърдите почти стигнат опората, и се избутвате. Най-лесно е на стена, после на пейка, после на колене и на пода.';
export const EXERCISES = table({
  gobletSquat: { name: 'клек с гира или лег-преса', how: `${SQUAT_HOW} Гирата е пред гърдите; на лег-преса коленете не се заключват в края.` },
  cableRow: { name: 'гребане на долен скрипец', how: 'Седнал, гърбът е изправен; дърпате дръжката към корема, лопатките се събират назад; връщате бавно, без да се навеждате напред.' },
  chestMachine: { name: 'натиск от гърди на машина седнал', how: 'Гърбът е опрян; бутате дръжките напред до почти изпънати ръце и връщате бавно; издишвате при бутането.' },
  dbChest: { name: 'натиск от гърди с дъмбели', how: 'По гръб на пейка, стъпалата на пода; спускате дъмбелите до нивото на гърдите, лактите са на около 45° от тялото, и ги избутвате нагоре.' },
  dbRdl: { name: 'римска тяга с дъмбели', how: RDL_HOW },
  plank: { name: 'планк 20–40 с', how: PLANK_HOW },
  lungeStep: { name: 'напади назад или качване на стъпало', how: `${LUNGE_HOW} Или: качвате се на стабилно стъпало с целия крак и слизате бавно.` },
  pulldown: { name: 'вертикален скрипец', how: 'Седнал, хватът е малко по-широк от раменете; дърпате лоста към горната част на гърдите, лактите — надолу и назад, без люлеене.' },
  dbPressSeated: { name: 'раменни преси с дъмбели седнал', how: OHP_HOW },
  bridge: { name: 'глутеус мост', how: BRIDGE_HOW },
  sidePlankKnees: { name: 'странична опора на колене', how: SIDE_HOW },
  deadBug: { name: '„мъртва буболечка“ (dead bug)', how: 'По гръб, ръцете са нагоре, коленете — свити над таза; бавно спускате противоположните ръка и крак, като кръстът остава прилепен към пода.' },
  dbRow: { name: 'гребане с дъмбел', how: 'Опора с ръка и коляно на пейка, гърбът е прав; дърпате дъмбела към хълбока и го спускате бавно.' },
  press: { name: 'раменни преси', how: OHP_HOW },
  armsCable: { name: 'бицепс и трицепс на скрипец', how: 'Лактите остават до тялото; сгъвате (бицепс) или изпъвате (трицепс) само в лакътя, бавно и без люлеене.' },
  barSquat: { name: 'клек с щанга или гира', how: `${SQUAT_HOW} Слизате до дълбочина без болка.` },
  rdl: { name: 'римска тяга', how: RDL_HOW },
  lunges: { name: 'напади', how: LUNGE_HOW },
  legCurl: { name: 'сгъване за задно бедро на машина', how: 'Сгъвате коленете срещу съпротивлението и връщате бавно; тазът остава опрян.' },
  calfRaise: { name: 'повдигане на пръсти', how: 'Изправен, с ръка на опора; повдигате петите възможно най-високо и ги спускате бавно.' },
  backLunge: { name: 'напади назад', how: LUNGE_HOW },
  bandRow: { name: 'гребане с ластик', how: ROW_BAND_HOW },
  singleBridge: { name: 'глутеус мост на един крак', how: `${BRIDGE_HOW} Единият крак е изпънат във въздуха, тазът остава хоризонтален.` },
  benchPushup: { name: 'лицеви опори на пейка', how: PUSHUP_HOW },
  sidePlank: { name: 'странична опора', how: SIDE_HOW },
  chairSquat: { name: 'клек до стол', how: 'Столът е зад вас; сядате бавно, докато докоснете седалката, и ставате, без да помагате с ръцете; коленете следват пръстите.' },
  wallPushup: { name: 'лицеви опори на стена, пейка или колене', how: PUSHUP_HOW },
  wallPushup2: { name: 'лицеви опори на стена или пейка', how: PUSHUP_HOW },
  jumpSquat: { name: 'клек с подскок', how: 'Клякате и подскачате нагоре; приземявате се меко, на свити колене.' },
  squat: { name: 'клек', how: SQUAT_HOW },
  trxRow: { name: 'гребане с ластик или TRX', how: `${ROW_BAND_HOW} С TRX — наклонени назад, придърпвате тялото към дръжките.` },
  climbers: { name: '„катерач“ (mountain climbers)', how: 'Опора на ръцете като за лицева опора; редувате бързо придърпване на коленете към гърдите.' },
  stepUp: { name: 'качване на стъпало', how: 'Качвате се на стабилно стъпало с целия крак, изправяте се и слизате бавно; редувате краката.' },
  pushups: { name: 'лицеви опори', how: PUSHUP_HOW },
  plankShort: { name: 'планк', how: PLANK_HOW },
  oneLeg: { name: 'стоене на един крак', how: 'До стабилна опора (плот, облегало); стоите на един крак 10–30 с, после на другия. Когато стане лесно — без ръце или със затворени очи, но пак до опората.' },
  heelToe: { name: 'ходене пета-пръсти', how: 'Ходите по права линия, като петата на предния крак опира пръстите на задния; до стена или плот за опора.' },
  tandem: { name: 'тандемна стойка', how: 'Стоите с единия крак точно пред другия, пета до пръсти, 10–30 с; после ги разменяте.' },
  pelvic: { name: 'тазово дъно', how: 'Стягате мускулите, с които задържате урината и газовете, и ги повдигате навътре, без да стягате седалището, корема и бедрата и без да задържате дъха; задържате няколко секунди и отпускате напълно. Поне 8 стягания 3 пъти на ден (NICE NG123).' },
});
const names = (...ids) => ids.map(id => EXERCISES[id].name);
const HOME_STRENGTH = ['chairSquat', 'wallPushup2', 'bridge', 'bandRow'];
const BALANCE = ['oneLeg', 'heelToe', 'tandem'];

/* Тренировъчни дни в седмицата (0 = понеделник) по брой. */
const DAY_PATTERNS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
/* Обем по седмици: расте постепенно, 4-тата е по-лека (при начинаещи — само расте). */
const WEEK_LOAD = { beginner: [0.75, 0.85, 0.95, 1], intermediate: [0.9, 1, 1.1, 0.8], advanced: [0.95, 1.05, 1.15, 0.8] };
/* Тежест на всеки вид тренировка според целта — колко сесии получава. */
const FOCUS_WEIGHT = {
  health: {},
  weight: { gym: 1.5, hiit: 1.5, running: 1.3, cycling: 1.3, swimming: 1.2, rowing: 1.2, walking: 1.2 },
  muscle: { gym: 3, bodyweight: 2.5, hiit: 1.5, reformer: 1.2 },
  endurance: { running: 2, cycling: 2, swimming: 2, rowing: 1.8, hiking: 1.5 },
  mobility: { reformer: 2, matpilates: 2, yoga: 2, taichi: 1.5 },
  bone: { gym: 2, bodyweight: 1.5, running: 1.3, hiking: 1.3, dance: 1.2, taichi: 1.2, swimming: 0.6, cycling: 0.6 },
};

const round = (v, step = 1) => Math.round(v / step) * step;
/** Първата буква — главна. */
const upper1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY_NAMES = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];
const weekdayIndex = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
};
const intensityOfMet = (met) => (met >= 6 ? 'vigorous' : met >= 3 ? 'moderate' : 'light');

/* ------------------------------------ безопасност ------------------------------------ */

/**
 * Ограничения и съвети по диагнозите, лекарствата, бременността и налягането.
 * Връща { exclude: Map(вид → защо), replace: Map(вид → [заместител, защо]), maxIntensity,
 *   noJumps, spineSparing, noSupine, balanceDaily, balance3, warnings, notes, rpeOnly, insulin }.
 */
export function trainingSafety({ age, bmi, sex = null, cond = new Set(), codes = [], classes = new Set(), pregnancy = false, pregnancyWeek = null,
  postpartum = false, goal = null, level = 'beginner', inactive = false, bp = null, amenorrhea = false } = {}) {
  const has = (re) => codes.some(c => re.test(c));
  const out = {
    exclude: new Map(), replace: new Map(), maxIntensity: 'vigorous', noJumps: false, spineSparing: false,
    noSupine: false, balanceDaily: false, balance3: age >= 65, warnings: [], notes: [], rpeOnly: classes.has('BB'),
    insulin: classes.has('INSULIN') || classes.has('SU'), diabetes: cond.has('dm1') || cond.has('dm2') || cond.has('prediabetes'),
    // Версия 4.14: силови дни, тазово дъно, ходене при клаудикация, предпочитани видове, цел за аеробните.
    strengthMin: 2, pelvicFloor: false, pad: false, prefer: {}, aerobicGoal: 0, hrMaxOnly: false,
  };
  const cap = (lvl) => { if (lvl === 'moderate' && out.maxIntensity === 'vigorous') out.maxIntensity = 'moderate'; };
  const cardiac = ['chd', 'hf', 'af', 'stroke', 'pad'].some(c => cond.has(c));
  const metabolic = out.diabetes || cond.has('ckd');
  if (inactive && (cardiac || metabolic)) {
    out.warnings.push('Преди началото: медицинска оценка — неактивен човек със сърдечно-съдово, метаболитно или бъбречно заболяване (ACSM 2015). Започнете с леко до умерено натоварване.');
  }
  if (cardiac) {
    cap('moderate');
    out.warnings.push('Сърдечно-съдово заболяване: умерено натоварване; интензивни интервали — само след оценка от кардиолог или в програма за сърдечна рехабилитация (ESC 2020). Спрете при болка в гърдите, необичаен задух, сърцебиене или световъртеж.');
  }
  if (cond.has('htn')) {
    out.notes.push('Хипертония: аеробни тренировки повечето дни и силови упражнения; издишване при усилие, без задържане на дъха (ESC 2020, ESC 2024).');
  }
  // Високо налягане при последното измерване — със или без поставена диагноза.
  if (bp && (bp.sys >= 160 || bp.dia >= 100)) {
    cap('moderate');
    out.warnings.push(`Последното налягане е ${bp.sys}/${bp.dia}: докато не е овладяно — без интензивни тренировки и без тежки повдигания.`);
  }
  if (out.diabetes) {
    out.notes.push('Диабет: поне 150 мин седмично в поне 3 дни, без повече от 2 последователни дни без движение; силови 2–3 пъти седмично в несъседни дни (ADA). Ставайте и се раздвижвайте на всеки 30 мин седене.');
    if (out.insulin) {
      out.warnings.push('Инсулин или сулфанилурейно лекарство: измерете кръвната захар преди тренировка — под 5,0 mmol/L приемете 15–30 г бързи въглехидрати и измерете отново; носете глюкоза. Хипогликемия е възможна и часове след тренировка, вкл. през нощта (ADA).');
    }
  }
  if (out.rpeOnly) out.notes.push('Бета-блокер: пулсът не отразява натоварването — водете се по усещането (RPE) и теста с говорене.');
  if (classes.has('VKA') || classes.has('DOAC') || has(/^Z92\.1|^Z79\.01/)) {
    out.exclude.set('team', 'антикоагулант — риск от удар и кървене при контактен спорт');
    out.notes.push('Антикоагулант: без контактни спортове и дейности с риск от падане.');
  }
  if (cond.has('osteoporosis') || has(/^M8[01]/)) {
    out.spineSparing = true;
    out.balanceDaily = true;
    if (has(/^M80/)) {
      out.replace.set('running', ['walking', 'остеопоротична фрактура — без силно натоварване с удар']);
      out.noJumps = true;
      out.exclude.set('team', 'остеопоротична фрактура — риск от падане');
    }
    out.notes.push('Остеопороза: силови упражнения поне 2 пъти седмично (8–12 повторения), баланс всеки ден 15–20 мин, упражнения за мускулите на гърба; без сгъване на гръбнака напред и завъртане до краен обхват под натоварване — „щадене на гръбнака“ (Too Fit To Fracture).');
  }
  if (has(/^M1[67]/)) {
    out.replace.set('running', ['cycling', 'артроза на коляното или тазобедрената става — по-малко удар; бягането остава, ако не засилва болката']);
    out.noJumps = true;
    out.notes.push('Артроза: упражненията са основно лечение — силови за бедрата, колело, плуване, тай чи (OARSI 2019).');
  }
  if (has(/^M5[1-4]/)) out.notes.push('Болки в гърба: пилатес, йога и ходене намаляват болката; движение вместо почивка на легло.');
  if (bmi >= 35 && level === 'beginner') {
    out.replace.set('running', ['walking', 'ИТМ от 35 — първо ходене, колело или плуване, после бягане']);
    out.noJumps = true;
  }
  if (has(/^D50/)) {
    cap('moderate');
    out.notes.push('Желязодефицитна анемия: умерено натоварване до възстановяване на хемоглобина.');
  }
  if (cond.has('copd') || has(/^J44/)) out.notes.push('ХОББ: интервали с почивки; задухът по скалата на Борг до умерен; белодробна рехабилитация при възможност (GOLD).');
  if (has(/^J45/)) out.notes.push('Астма: дълга загрявка; при астма от усилие — бронходилататор 15 мин преди тренировка по назначение (GINA); студен въздух — шал или маска.');
  if (has(/^G40/)) {
    out.notes.push('Епилепсия: плуване само с придружител; без катерене и дейности на височина.');
  }
  if (has(/^F50/) || amenorrhea) {
    cap('moderate');
    out.warnings.push('Хранително разстройство или липса на менструация: възможен недостиг на енергия — тренировките не се увеличават, без интензивни; храненето е без дефицит (Endocrine Society 2017).');
  }
  if (has(/^F3[23]|^F41/)) out.notes.push('Депресия и тревожност: редовните тренировки, особено групови, намаляват оплакванията.');
  if (cond.has('ckd')) out.notes.push('ХБЗ: редовна умерена активност, поне 150 мин седмично според възможностите (KDIGO 2024).');
  if (pregnancy) {
    out.exclude.set('team', 'бременност — контакт и риск от падане');
    out.noJumps = true;
    if (level === 'beginner') out.replace.set('running', ['walking', 'бременност — който не е бягал преди, започва с ходене']);
    if (level !== 'advanced') cap('moderate');
    if (!(pregnancyWeek > 0 && pregnancyWeek < 13)) out.noSupine = true;
    out.notes.push('Бременност: поне 150 мин умерена активност седмично (ACOG 2020, СЗО). Подходящи са ходене, стационарно колело, плуване и аква аеробика. Без контактни спортове, дейности с риск от падане, гмуркане и „горещи“ йога и пилатес.');
    out.warnings.push('Бременност: спрете и се свържете с лекар при кървене, редовни болезнени контракции, изтичане на води, задух преди усилие, световъртеж, главоболие, болка в гърдите, болка или подуване на прасеца (ACOG 2020).');
  }

  /* ------------------------- по диагнозите (версия 4.14) ------------------------- */
  // Клаудикация: ходене на интервали до умерена или силна болка в прасеца (ACC/AHA 2024).
  if (has(/^I70\.2|^I73\.9/)) {
    out.pad = true;
    out.prefer.walking = 2;
    out.notes.push('Периферна артериална болест: ходене поне 3 пъти седмично по 30–45 мин за поне 12 седмици — вървите, докато болката в прасеца стане умерена до силна, почивате, докато отмине, и продължавате; най-добре в програма под наблюдение (ACC/AHA 2024 ПАБ).');
  }
  if (cond.has('hf')) out.notes.push('Сърдечна недостатъчност: при стабилно състояние тренировките — в център, у дома или комбинирано — намаляват хоспитализациите и подобряват качеството на живот (Cochrane 2024 СН).');
  if (cond.has('stroke')) out.notes.push('След инсулт: аеробни упражнения с ниска до умерена интензивност, силови упражнения и по-малко седене — според възможностите (AHA/ASA 2014).');
  if (has(/^E1[0-4]\.3|^H36\.0/)) {
    cap('moderate');
    out.warnings.push('Диабетна ретинопатия: при пролиферативна или тежка непролиферативна — без интензивни аеробни и тежки силови упражнения заради риск от кръвоизлив в стъкловидното тяло и отлепване на ретината; преди по-интензивна програма — консултация с офталмолог (ADA 2026).');
  }
  if (has(/^E1[0-4]\.4|^G63\.2/)) {
    out.notes.push('Диабетна невропатия: подходящи обувки и оглед на стъпалата всеки ден; умереното ходене с подходящи обувки е безопасно; при рана или язва на стъпалото — само упражнения без натоварване на краката. При автономна невропатия — кардиологична оценка преди по-интензивни от обичайните тренировки (ADA 2026).');
  }
  if (has(/^C(?:[0-8]\d|9[0-7])/)) {
    out.hrMaxOnly = true;
    out.notes.push('Онкологично заболяване: избягвайте неактивността. Умерени аеробни поне 3 пъти седмично по поне 30 мин и силови поне 2 пъти седмично (поне 2 серии × 8–15 повторения) за поне 8–12 седмици — по време и след лечението, според поносимостта; под наблюдение ефектът е по-голям. При костни метастази или чупливи кости — без скокове и тежки повдигания, по преценка на онколога (ACSM 2019 онкология).');
    if (has(/^C50/)) out.notes.push('Рак на гърдата: силовите упражнения с постепенно увеличаване („започнете леко, увеличавайте бавно“) са безопасни и при лимфедем, когато са под наблюдение (ACSM 2019 онкология).');
  }
  if (has(/^M0[5-7]|^L40\.5|^M45/)) {
    out.notes.push('Възпалителен ставен ревматизъм: движението е част от лечението през цялото време на болестта — целите са същите като за всички (аеробни, силови, гъвкавост и баланс), съобразени с болестта и възможностите (EULAR 2018).');
  }
  if (has(/^M62\.5|^M62\.84/)) out.notes.push('Саркопения: силовите упражнения са основното лечение (силна препоръка), заедно с достатъчно белтък (ICFSR 2018).');
  if (has(/^G35/)) out.notes.push('Множествена склероза: поне 150 мин тренировки и/или 150 мин ежедневна активност седмично, с постепенно увеличаване според възможностите; в началото — оценка от физиотерапевт с опит при МС (Kalb 2020).');
  if (has(/^G20/)) {
    out.balance3 = true;
    Object.assign(out.prefer, { dance: 2, taichi: 1.8, swimming: 1.5 });
    out.notes.push('Болест на Паркинсон: почти всеки вид движение помага; най-голям ефект върху движенията имат танците и упражненията за походка и баланс, а аква аеробиката — върху качеството на живот (Cochrane 2024 Паркинсон).');
  }
  if (has(/^E28\.2/)) {
    if (goal === 'lose') out.aerobicGoal = 250;
    out.notes.push('Поликистозни яйчници: 150–300 мин умерена или 75–150 мин интензивна активност седмично и силови в 2 несъседни дни; за отслабване и срещу връщане на теглото — поне 250 мин умерена или 150 мин интензивна; по-малко седене (PCOS 2023).');
  }
  if (classes.has('GLP1')) {
    out.strengthMin = 3;
    out.notes.push('GLP-1 агонист: силови упражнения поне 3 пъти седмично и поне 150 мин умерени аеробни — за да се запазят мускулите и костите при отслабването (ACLM/ASN/OMA/TOS 2025).');
  }
  const incontinence = has(/^N39\.[34]|^R32/);
  if (sex === 'f' && (incontinence || pregnancy || postpartum)) {
    out.pelvicFloor = true;
    out.notes.push(incontinence
      ? 'Инконтиненция: упражнения за тазовото дъно под наблюдение на физиотерапевт поне 3 месеца — първото лечение; поне 8 стягания 3 пъти на ден (NICE NG123).'
      : 'Бременност и след раждане: упражнения за тазовото дъно — предпазват от изпускане на урина и други оплаквания; поне 8 стягания 3 пъти на ден (NICE NG210, NICE NG123).');
  }
  return out;
}

/* ------------------------------------ съдържание ------------------------------------ */

const sets = (level, week) => {
  if (level === 'beginner') return { n: week < 2 ? 2 : 3, reps: '12–15', rpe: 'последните 2–3 повторения са трудни' };
  if (level === 'intermediate') return { n: week === 3 ? 2 : 3, reps: '8–12', rpe: 'RPE 7 — остават 2–3 повторения в резерв' };
  return { n: week === 3 ? 3 : 4, reps: '6–10', rpe: 'RPE 7–8 — остават 1–2 повторения в резерв' };
};

/** Ходене при клаудикация — на интервали до умерена или силна болка (ACC/AHA 2024). */
const padWalk = (mins) => `${mins} мин ходене на интервали: вървите, докато болката в прасеца стане умерена до силна, спирате, докато отмине, и продължавате; целта е 30–45 мин ходене общо.`;

/** Подробности за тренировката: блокове с упражнения. */
export function sessionContent(s, safety = {}) {
  const { activity, intensity, minutes, level, week, variant } = s;
  const warm = Math.min(10, Math.max(5, round(minutes * 0.15)));
  const cool = Math.min(10, Math.max(3, round(minutes * 0.1)));
  const main = Math.max(5, minutes - warm - cool);
  const blocks = [];
  const add = (name, text, moves = null) => blocks.push(moves ? { name, text, moves } : { name, text });
  // При ограничение до умерено натоварване напредналите вдигат като средните — без тежки повдигания.
  const st = sets(safety.maxIntensity && safety.maxIntensity !== 'vigorous' && level === 'advanced' ? 'intermediate' : level, week);
  const spine = safety.spineSparing ? ' Без коремни преси и сгъване на гръбнака напред под натоварване.' : '';
  const supine = safety.noSupine ? ' Без продължително лежане по гръб — вариантите са настрани, седнал или изправен.' : '';
  switch (activity) {
    case 'gym': {
      const lists = {
        A: ['gobletSquat', 'cableRow', safety.noSupine ? 'chestMachine' : 'dbChest', 'dbRdl', 'plank'],
        B: ['lungeStep', 'pulldown', 'dbPressSeated', 'bridge', safety.noSupine ? 'sidePlankKnees' : 'deadBug'],
        upper: ['dbChest', 'dbRow', 'press', 'pulldown', 'armsCable'],
        lower: ['barSquat', 'rdl', 'lunges', 'legCurl', 'calfRaise'],
      };
      const ids = lists[variant || 'A'];
      add('Загрявка', `${warm} мин колело или кростренажор и 1 лека серия от първите упражнения.`);
      add('Основна част', `${st.n} серии × ${st.reps} повторения, почивка 1–2 мин: ${names(...ids).join('; ')}. Тежест: ${st.rpe}.${spine}`, ids);
      add('Разпускане', `${cool} мин разтягане на бедрата, гърдите и гърба.`);
      break;
    }
    case 'bodyweight': {
      const ids = variant === 'B'
        ? ['backLunge', 'bandRow', 'singleBridge', 'benchPushup', 'sidePlank']
        : ['chairSquat', 'wallPushup', 'bridge', 'bandRow', 'plank'];
      add('Загрявка', `${warm} мин раздвижване на ставите и ходене на място.`);
      add('Основна част', `${st.n} обиколки × ${st.reps} повторения: ${names(...ids).join('; ')}. ${upper1(st.rpe)}.${spine}${supine}`, ids);
      add('Разпускане', `${cool} мин разтягане.`);
      break;
    }
    case 'reformer':
      add('Загрявка', `${warm} мин дишане и серия за краката (footwork) — 4 позиции по 10 повторения.`);
      add('Основна част', `${main} мин: ${safety.noSupine ? 'упражнения седнал, на колене и настрани — гребане и ръце, странични напади (side splits), „слон“ (elephant), колене към гърдите на колене (knee stretches)' : 'мост (bridging), крака в ремъците (кръгове и „жаба“), гребане и ръце седнал, издърпване на ремъците по корем на кутията (long box), колене към гърдите на колене (knee stretches), странични напади (side splits), „слон“ (elephant)'}. Пружини: ${level === 'beginner' ? 'по-лека съпротива, бавно темпо и контрол' : level === 'intermediate' ? 'средна съпротива, повече повторения' : 'по-тежки пружини или по-малко пружини за стабилност, по-сложни варианти'}.${safety.spineSparing ? ' Без „hundred“, „roll up“, „teaser“ и „rolling like a ball“ — сгъване на гръбнака; завъртания бавно и не до края.' : ''}`);
      add('Разпускане', `${cool} мин странично разтягане „русалка“ (mermaid) и разтягане на задните бедра.`);
      break;
    case 'matpilates':
      add('Загрявка', `${warm} мин дишане, котка-крава, раздвижване на таза.`);
      add('Основна част', `${main} мин: ${safety.noSupine ? 'странична серия за краката, „плуване“ на колене, котка-крава, лицева опора на колене, баланс на колене (bird dog)' : 'мост (pelvic curl), серия за краката по гръб, странична серия за краката, „плуване“ (swimming) и „лебед“ по корем, баланс на колене (bird dog), странична опора'}.${safety.spineSparing ? ' Без „hundred“, „roll up“, „teaser“, „rolling like a ball“ и наклони напред до края.' : ''}`);
      add('Разпускане', `${cool} мин разтягане „русалка“ и задни бедра.`);
      break;
    case 'yoga':
      add('Загрявка', `${warm} мин дишане и поздрав към слънцето в лек вариант.`);
      add('Основна част', `${main} мин: стоящи пози (воин I и II, триъгълник), баланс („дърво“), ${safety.noSupine ? 'пози на колене и седнал' : 'мост, сфинкс, поза на детето'}.${safety.spineSparing ? ' Без дълбоки наклони напред и завъртания до краен обхват.' : ''}${safety.noSupine ? ' Без „гореща“ йога.' : ''}`);
      add('Разпускане', `${cool} мин отпускане и дишане.`);
      break;
    case 'taichi':
      add('Тай чи', `${minutes} мин — бавни движения с пренасяне на тежестта; подобрява баланса и намалява риска от падане.`);
      break;
    case 'running': {
      add('Загрявка', `${warm} мин бързо ходене и леко раздвижване на глезените и бедрата.`);
      if (level === 'beginner') {
        const [run, walk] = [[1, 2], [2, 2], [3, 1.5], [4, 1]][week];
        const reps = Math.max(3, Math.floor(main / (run + walk)));
        add('Основна част', `${reps} × (${run} мин леко бягане + ${String(walk).replace('.', ',')} мин ходене). Бягането е бавно — можете да говорите.`);
      } else if (s.long) {
        add('Основна част', `${main} мин дълго леко бягане, RPE 4–5. Вода, а при над 60 мин — и въглехидрати.`);
      } else if (intensity === 'vigorous') {
        add('Основна част', level === 'advanced'
          ? `${[5, 6, 7, 5][week]} × 3 мин бързо (RPE 7–8) с 2 мин леко бягане между тях; останалото — леко бягане.`
          : `${[5, 6, 7, 5][week]} × 2 мин бързо (RPE 7–8) с 2 мин леко бягане между тях; останалото — леко бягане.`);
      } else {
        add('Основна част', `${main} мин леко бягане, RPE 4–5${level === 'advanced' && week === 2 ? '; последните 10 мин — темпо RPE 6–7' : ''}.`);
      }
      add('Разпускане', `${cool} мин ходене и разтягане на прасците и бедрата.`);
      break;
    }
    case 'walking':
      add('Загрявка', `${warm} мин ходене в спокойно темпо.`);
      if (safety.pad) add('Основна част', padWalk(main));
      else add('Основна част', intensity === 'vigorous' || (level !== 'beginner' && week > 0)
        ? `${main} мин: редувайте 3 мин много бързо и 2 мин нормално ходене; с щеки (нордическо ходене) се натоварват и ръцете.`
        : `${main} мин бързо ходене — леко се задъхвате, но можете да говорите.`);
      add('Разпускане', `${cool} мин бавно ходене и разтягане.`);
      break;
    case 'cycling':
      add('Загрявка', `${warm} мин леко въртене.`);
      add('Основна част', intensity === 'vigorous'
        ? `${[4, 5, 6, 4][week]} × 3 мин силно (RPE 7–8) с 3 мин леко въртене; или клас по спининг.`
        : s.long ? `${main} мин равномерно, RPE 4–5 — разговорно темпо.` : `${main} мин равномерно, RPE 4–6, каданс 80–90 оборота в минута.`);
      add('Разпускане', `${cool} мин леко въртене и разтягане.`);
      break;
    case 'swimming':
      add('Загрявка', `${warm} мин леко плуване по избор.`);
      add('Основна част', level === 'beginner'
        ? `${main} мин: отсечки по 25–50 м с почивка 30–60 с; или аква аеробика.`
        : intensity === 'vigorous'
          ? `${level === 'advanced' ? '10 × 100' : '8 × 50'} м по-бързо (RPE 7–8) с почивка 20–30 с; останалото — леко.`
          : `${main} мин равномерно плуване, смяна на стила на всеки 100–200 м.`);
      add('Разпускане', `${cool} мин леко плуване.`);
      break;
    case 'rowing':
      add('Загрявка', `${warm} мин леко.`);
      add('Основна част', intensity === 'vigorous'
        ? `${[5, 6, 7, 5][week]} × 2 мин силно (RPE 7–8) с 2 мин леко; гребане с крака, после гръб, после ръце.`
        : `${main} мин равномерно, RPE 4–6.`);
      add('Разпускане', `${cool} мин леко и разтягане.`);
      break;
    case 'hiit': {
      const jumps = !safety.noJumps && level !== 'beginner';
      add('Загрявка', `${warm} мин раздвижване и леки клякания.`);
      add('Основна част', `Кръг от 6 упражнения — ${intensity === 'vigorous' ? '40 с работа / 20 с почивка' : '30 с работа / 30 с почивка'}, ${level === 'beginner' ? 2 : 3} обиколки: ${jumps ? 'клек с подскок' : 'клек'}; гребане с ластик или TRX; ${jumps ? '„катерач“ (mountain climbers)' : 'качване на стъпало'}; напади; лицеви опори; ${safety.noSupine ? 'странична опора' : 'планк'}.${jumps ? '' : ' Без подскоци.'}${spine}`,
        [jumps ? 'jumpSquat' : 'squat', 'trxRow', jumps ? 'climbers' : 'stepUp', 'lunges', 'pushups', safety.noSupine ? 'sidePlank' : 'plankShort']);
      add('Разпускане', `${cool} мин ходене и разтягане.`);
      break;
    }
    case 'dance':
      add('Клас', `${minutes} мин аеробика, зумба или танци${safety.noJumps ? ' — вариант без подскоци' : ''}; ${INTENSITY[intensity].label} темпо.`);
      break;
    case 'team':
      add('Загрявка', '10–15 мин с упражнения за коленете и глезените — приземяване на свити колене, напади, странични стъпки (като FIFA 11+); намаляват травмите на кръстните връзки при жени с около половина.');
      add('Игра или тренировка', `${Math.max(10, minutes - 15)} мин.`);
      break;
    case 'racket':
      add('Загрявка', '10 мин раздвижване на раменете, китките и глезените, странични стъпки.');
      add('Игра или тренировка', `${Math.max(10, minutes - 10)} мин.`);
      break;
    case 'hiking':
      add('Преход', `${minutes} мин по пресечен терен в разговорно темпо; щеки при спускане, вода и храна за повече от час.`);
      break;
    default:
      add('Тренировка', `${minutes} мин.`);
  }
  return blocks;
}

/* --------------------------------- съставяне на плана --------------------------------- */

/** Кои активности стават и как се заместват според безопасността. */
function allowedActivities(list, safety) {
  const out = [];
  const removed = [];
  for (const id of list) {
    if (!ACTIVITIES[id]) continue;
    if (safety.exclude.has(id)) { removed.push({ activity: id, reason: safety.exclude.get(id) }); continue; }
    if (safety.replace.has(id)) {
      const [to, why] = safety.replace.get(id);
      removed.push({ activity: id, replacedBy: to, reason: why });
      if (!out.includes(to)) out.push(to);
      continue;
    }
    if (!out.includes(id)) out.push(id);
  }
  return { list: out, removed };
}

/** Колко сесии на седмица получава всяка активност (най-голям остатък по тежестта). */
function allocate(acts, n, focus, week, prefer = {}) {
  const w = acts.map(a => (FOCUS_WEIGHT[focus]?.[a] ?? 1) * (prefer[a] ?? 1));
  const total = w.reduce((s, x) => s + x, 0);
  const raw = w.map(x => (x / total) * n);
  const cnt = raw.map(Math.floor);
  let left = n - cnt.reduce((s, x) => s + x, 0);
  // Остатъкът — по най-големите остатъци, като седмиците се редуват (за разнообразие).
  const order = acts.map((_, i) => i).sort((a, b) => (raw[b] - cnt[b]) - (raw[a] - cnt[a]) || ((a + week) % acts.length) - ((b + week) % acts.length));
  for (const i of order) { if (left <= 0) break; cnt[i]++; left--; }
  return acts.flatMap((a, i) => Array(cnt[i]).fill(a));
}

const isStrength = (a) => ACTIVITIES[a].strength && ACTIVITIES[a].role !== 'mobility';

/* Нареждане на сесиите в седмицата: силовите — в дните с най-голям интервал помежду им
 * (едни и същи мускули — през поне 48 ч, ACSM), като седмиците се свързват. */
function arrange(sessions, weekdays) {
  const strength = sessions.filter(isStrength);
  const other = sessions.filter(a => !isStrength(a));
  const n = sessions.length;
  const k = strength.length;
  let best = [];
  let bestGap = -1;
  const pick = (from, chosen) => {
    if (chosen.length === k) {
      const days = chosen.map(i => weekdays[i]);
      let gap = k > 1 ? Infinity : 7;
      for (let i = 0; i < k; i++) gap = Math.min(gap, ((days[(i + 1) % k] - days[i] + 7) % 7) || 7);
      if (gap > bestGap) { bestGap = gap; best = [...chosen]; }
      return;
    }
    for (let i = from; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  if (k) pick(0, []);
  const out = Array(n).fill(null);
  best.forEach((pos, i) => { out[pos] = strength[i]; });
  let j = 0;
  for (let i = 0; i < n; i++) if (!out[i]) out[i] = other[j++];
  return out;
}

/**
 * Тренировъчен план за 4 седмици.
 * @param {object} input
 *   activities: [], level, daysPerWeek (2–7), minutes, time, focus, cyclePeriodize,
 *   start, sex, age, weight, bmi, cond: Set, codes: [], classes: Set, pregnancy, pregnancyWeek,
 *   inactive, bp: { sys, dia }, amenorrhea, phases: [{ date, phase, ... }] — фазите на цикъла
 */
export function trainingPlan(input) {
  const level = TRAINING_LEVELS[input.level] ? input.level : 'beginner';
  const focus = TRAINING_FOCUS[input.focus] ? input.focus : 'health';
  const days = Math.min(7, Math.max(2, Math.round(Number(input.daysPerWeek) || 3)));
  const minutes = SESSION_MINUTES.includes(Number(input.minutes)) ? Number(input.minutes) : 45;
  const time = TRAINING_TIMES[input.time] ? input.time : 'any';
  const safety = trainingSafety({ ...input, level });
  const chosen = (input.activities || []).filter(a => ACTIVITIES[a]);
  const { list, removed } = allowedActivities(chosen.length ? chosen : ['walking', 'bodyweight'], safety);
  const acts = list.length ? list : ['walking'];
  // При клаудикация ходенето е част от лечението — влиза в плана, дори да не е избрано.
  if (safety.pad && !acts.includes('walking')) acts.push('walking');
  const age = Number(input.age) || 40;
  const hrMax = round(208 - 0.7 * age);
  // С известен пулс в покой — по резерва (Karvonen, ACSM 2011); иначе — процент от максималния.
  const rest = Math.round(Number(input.restingHr) || 0);
  const byReserve = rest >= 40 && rest <= 100 && !safety.hrMaxOnly;
  const zone = (lo, hi) => (byReserve ? [round(rest + lo[0] * (hrMax - rest)), round(rest + hi[0] * (hrMax - rest))] : [round(hrMax * lo[1]), round(hrMax * hi[1])]);
  const hr = safety.rpeOnly ? null : {
    max: hrMax,
    rest: byReserve ? rest : null,
    method: byReserve ? 'reserve' : 'max',
    moderate: zone([0.40, 0.64], [0.59, 0.76]),
    vigorous: zone([0.60, 0.77], [0.89, 0.95]),
  };
  const aerobicGoal = focus === 'weight' ? 300 : Math.max(150, safety.aerobicGoal);
  const weight = Number(input.weight) || 70;
  const phaseOf = new Map((input.phases || []).map(p => [p.date, p]));
  const pattern = DAY_PATTERNS[days];
  const out = [];
  const weeks = [];

  for (let w = 0; w < 4; w++) {
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(input.start, w * 7 + i));
    const trainDates = weekDates.filter(d => pattern.includes(weekdayIndex(d)));
    const sessionsActs = arrange(allocate(acts, trainDates.length, focus, w, safety.prefer), trainDates.map(weekdayIndex));
    // Интензивност: начинаещите — умерено (без интензивни първите 2 седмици); средните — 1
    // интензивна аеробна сесия седмично от 2-рата седмица; напредналите — 2.
    const vigorousSlots = level === 'beginner' ? (w >= 2 ? 1 : 0) : level === 'intermediate' ? (w >= 1 && w < 3 ? 1 : 0) : (w < 3 ? 2 : 1);
    let vigorousLeft = safety.maxIntensity === 'vigorous' ? vigorousSlots : 0;
    let strengthVariant = 0;
    const plan = new Map();
    sessionsActs.forEach((a, i) => {
      const act = ACTIVITIES[a];
      const isLast = i === sessionsActs.length - 1;
      const long = isLast && (focus === 'endurance' || a === 'hiking') && ['running', 'cycling', 'walking', 'hiking', 'swimming'].includes(a) && level !== 'beginner';
      let intensity = act.role === 'mobility' ? 'moderate' : 'moderate';
      if (!long && vigorousLeft > 0 && ['cardio', 'mixed'].includes(act.role) && a !== 'hiking' && a !== 'walking') { intensity = 'vigorous'; vigorousLeft--; }
      const load = WEEK_LOAD[level][w];
      let mins = round(minutes * load * (long ? 1.5 : 1), 5);
      if (a === 'hiking') mins = Math.max(mins, 90);
      mins = Math.min(a === 'hiking' ? 240 : 150, Math.max(15, mins));
      const variant = act.role === 'strength' || a === 'bodyweight'
        ? (level === 'advanced' && focus === 'muscle' ? ['upper', 'lower'][strengthVariant++ % 2] : ['A', 'B'][strengthVariant++ % 2])
        : null;
      plan.set(trainDates[i], { activity: a, intensity, minutes: mins, long, variant });
    });

    // По желание: по-интензивните тренировки — във фоликуларната фаза (размяна в седмицата).
    if (input.cyclePeriodize && phaseOf.size) {
      const isFoll = (d) => ['follicular', 'ovulation'].includes(phaseOf.get(d)?.phase);
      for (const [d, s] of plan) {
        if (s.intensity !== 'vigorous' || isFoll(d)) continue;
        const swap = [...plan.entries()].find(([d2, s2]) => isFoll(d2) && s2.intensity === 'moderate' && ACTIVITIES[s2.activity].role === ACTIVITIES[s.activity].role);
        if (swap) {
          const [d2, s2] = swap;
          plan.set(d2, { ...s, minutes: s.minutes });
          plan.set(d, { ...s2 });
        }
      }
    }

    const strengthDays = [...plan.values()].filter(s => ACTIVITIES[s.activity].strength).length;
    let addStrength = Math.max(0, safety.strengthMin - strengthDays);
    let balanceLeft = safety.balanceDaily ? 7 : safety.balance3 ? 3 : 0;
    let aerobic = 0;
    let strengthCount = 0;
    let totalMin = 0;
    let kcal = 0;
    const weekDays = [];
    for (const date of weekDates) {
      const s = plan.get(date);
      const sessions = [];
      if (s) {
        const act = ACTIVITIES[s.activity];
        const met = act.met[s.intensity];
        const counted = intensityOfMet(met);
        const session = {
          ...s, label: act.label, icon: act.icon, met, counted, level, week: w,
          kcal: round((met - 1) * weight * s.minutes / 60, 5),
          time: TRAINING_TIMES[time].clock,
        };
        session.blocks = sessionContent(session, safety);
        sessions.push(session);
      }
      // Силови упражнения, ако избраните тренировки не стигат до 2 дни седмично (СЗО).
      const addOns = [];
      if (addStrength > 0 && s && !ACTIVITIES[s.activity].strength) {
        addOns.push({ kind: 'strength', minutes: 15, text: 'Сила 15 мин след тренировката: клек до стол, лицеви опори на стена или пейка, глутеус мост, гребане с ластик — по 2 серии × 12–15.', moves: HOME_STRENGTH });
        addStrength--;
      }
      if (balanceLeft > 0 && (s || safety.balanceDaily)) {
        addOns.push({ kind: 'balance', minutes: 10, text: 'Баланс 10 мин: стоене на един крак, ходене пета-пръсти, тандемна стойка — до опора.', moves: BALANCE });
        balanceLeft--;
      }
      if (safety.pelvicFloor) addOns.push({ kind: 'pelvic', minutes: 5, text: 'Тазово дъно: поне 8 стягания, 3 пъти през деня.', moves: ['pelvic'] });
      weekDays.push({ date, label: DAY_NAMES[weekdayIndex(date)], week: w, sessions, addOns, phase: phaseOf.get(date) || null });
    }
    // Ако и след това силовите са под 2 — в почивни дни.
    for (const d of weekDays) {
      if (addStrength <= 0) break;
      if (!d.sessions.length) {
        d.addOns.unshift({ kind: 'strength', minutes: 15, text: 'Сила 15 мин у дома: клек до стол, лицеви опори на стена или пейка, глутеус мост, гребане с ластик — по 2 серии × 12–15.', moves: HOME_STRENGTH });
        addStrength--;
      }
    }
    const walkSession = (mins, text) => {
      const met = ACTIVITIES.walking.met.moderate;
      return {
        activity: 'walking', intensity: 'moderate', minutes: mins, extra: true, label: 'бързо ходене', icon: '🚶', met, counted: 'moderate',
        level, week: w, kcal: round((met - 1) * weight * mins / 60, 5), time: null,
        blocks: [safety.pad ? { name: 'Ходене при клаудикация', text: padWalk(mins) } : { name: 'Ежедневно движение', text }],
      };
    };
    // Клаудикация: ходене поне 3 пъти седмично (ACC/AHA 2024) — в почивните дни, ако не стига.
    if (safety.pad) {
      let walks = weekDays.flatMap(d => d.sessions).filter(x => x.activity === 'walking').length;
      for (const d of weekDays) {
        if (walks >= 3) break;
        if (d.sessions.length) continue;
        d.sessions.push(walkSession(40));
        walks++;
      }
    }
    // Аеробна активност под 150 мин (под 300 при отслабване) — ходене в почивните дни.
    const aerobicOf = (list) => list.reduce((acc, x) => acc + (x.counted === 'vigorous' ? 2 : x.counted === 'moderate' ? 1 : 0) * x.minutes * (ACTIVITIES[x.activity].role === 'mobility' ? 0 : 1), 0);
    let gap = aerobicGoal - aerobicOf(weekDays.flatMap(d => d.sessions));
    for (const d of weekDays) {
      if (gap <= 0) break;
      if (d.sessions.length) continue;
      const mins = Math.min(45, Math.max(20, round(gap / Math.max(1, weekDays.filter(x => !x.sessions.length).length), 5)));
      d.sessions.push(walkSession(mins, `${mins} мин бързо ходене — може и на части по 10 мин.`));
      gap -= mins;
    }
    // Ако почивните дни не стигат — ходене и след тренировките без аеробна част (пилатес, йога, сила).
    for (const d of weekDays) {
      if (gap <= 0) break;
      if (!d.sessions.length || d.sessions.some(x => ['cardio', 'sport', 'mixed'].includes(ACTIVITIES[x.activity].role))) continue;
      const mins = Math.min(30, Math.max(15, round(gap, 5)));
      d.sessions.push(walkSession(mins, `${mins} мин бързо ходене в същия ден — може и на части по 10 мин.`));
      gap -= mins;
    }
    for (const d of weekDays) {
      for (const x of d.sessions) {
        totalMin += x.minutes;
        kcal += x.kcal;
        if (ACTIVITIES[x.activity].strength) strengthCount++;
      }
      strengthCount += d.addOns.filter(a => a.kind === 'strength').length;
      // Упражненията за тазовото дъно почти не изразходват енергия.
      d.kcal = d.sessions.reduce((acc, x) => acc + x.kcal, 0)
        + d.addOns.filter(a => a.kind !== 'pelvic').reduce((acc, a) => acc + round((a.kind === 'strength' ? 2.8 : 1.3) * weight * a.minutes / 60, 5), 0);
      d.cycle = d.phase ? cycleAdvice(d.phase, d.sessions) : null;
      delete d.phase;
      out.push(d);
    }
    aerobic = aerobicOf(weekDays.flatMap(d => d.sessions));
    weeks.push({ week: w + 1, from: weekDates[0], to: weekDates[6], aerobic, strength: strengthCount, minutes: totalMin, kcal });
  }

  const notes = [...safety.notes];
  if (removed.length) {
    for (const r of removed) {
      notes.unshift(r.replacedBy
        ? `${upper1(ACTIVITIES[r.activity].label)} е заменено с „${ACTIVITIES[r.replacedBy].label}“: ${r.reason}.`
        : `${upper1(ACTIVITIES[r.activity].label)} не е включено: ${r.reason}.`);
    }
  }
  if (!chosen.length) notes.unshift('Не са избрани тренировки — планът е с ходене и упражнения у дома.');
  if (['running'].some(a => acts.includes(a))) notes.push('Бягане: седмичният обем расте постепенно — при начинаещи увеличение с над 30% за 2 седмици е свързано с повече травми (Nielsen 2014).');
  if (safety.maxIntensity !== 'vigorous') notes.push('Интензивните тренировки са заменени с умерени заради здравословното състояние.');
  if (weeks.some(w => w.aerobic < aerobicGoal)) {
    notes.push(`С избраните дни и продължителност аеробната активност в някои седмици е под ${aerobicGoal} мин — удължете тренировките или добавете бързо ходене всеки ден.`);
  }
  if (hr?.method === 'reserve') {
    notes.push(`Пулсът е изчислен по резерва (Karvonen) с пулс в покой ${rest}/мин: умерено — 40–59%, интензивно — 60–89% от резерва (ACSM 2011).`);
  } else if (hr && safety.hrMaxOnly && rest >= 40) {
    notes.push('Онкологично заболяване: пулсът е по процент от максималния — изчислението по резерва надценява натоварването (Scharhag-Rosenberger 2015).');
  }

  // Упражненията от плана — по реда на първата им поява, с описание как се правят.
  const moves = [];
  for (const d of out) {
    for (const m of [...d.sessions.flatMap(s => s.blocks.flatMap(b => b.moves || [])), ...d.addOns.flatMap(a => a.moves || [])]) {
      if (!moves.includes(m)) moves.push(m);
    }
  }

  return {
    input: {
      activities: chosen, level, daysPerWeek: days, minutes, time, focus, cyclePeriodize: !!input.cyclePeriodize,
      restingHr: rest >= 40 && rest <= 100 ? rest : null,
    },
    targets: {
      aerobic: aerobicGoal, aerobicMax: 300, strengthDays: safety.strengthMin,
      balanceDays: safety.balanceDaily ? 7 : safety.balance3 ? 3 : 0,
      pelvicFloor: safety.pelvicFloor,
    },
    hr,
    rpeOnly: safety.rpeOnly,
    steps: stepsFor(age),
    days: out,
    weeks,
    removed,
    warnings: safety.warnings,
    notes,
    exercises: moves.map(id => ({ id, name: EXERCISES[id].name, how: EXERCISES[id].how })),
    timeAdvice: timeAdvice({ time, safety, focus, acts }),
    cycle: phaseOf.size ? CYCLE_TRAINING : null,
    // Повече белтък (като при силови тренировки): при цел „сила и мускули“ или поне 3 тренировки
    // с тежести, собствено тегло или кръгови в някоя седмица.
    strengthFocus: focus === 'muscle' || [0, 1, 2, 3].some(w => out.filter(d => d.week === w)
      .flatMap(d => d.sessions).filter(x => ['gym', 'bodyweight', 'hiit'].includes(x.activity)).length >= 3),
    sessionsPerWeek: days,
  };
}

/** Крачки на ден по възрастта (Paluch 2022, Ding 2025). */
export function stepsFor(age) {
  return age >= 60
    ? { from: 6000, to: 8000, text: 'Крачки: след 60 г. ползата за дълголетието расте до около 6000–8000 на ден (Paluch 2022); 7000 на ден вече са свързани с по-малко сърдечно-съдови заболявания, деменция и падания (Ding 2025). Ако сега са по-малко — увеличавайте постепенно.' }
    : { from: 7000, to: 10000, text: 'Крачки: под 60 г. ползата за дълголетието расте до около 8000–10 000 на ден (Paluch 2022); 7000 на ден вече са свързани с по-малко сърдечно-съдови заболявания, диабет тип 2, деменция и депресия (Ding 2025). Ако сега са по-малко — увеличавайте постепенно.' };
}

/* ------------------------------------ кога и как ------------------------------------ */

/** Кога е най-добре да се тренира — по целта, лекарствата и съня. */
function timeAdvice({ time, safety, focus, acts }) {
  const out = ['Най-доброто време е това, в което можете да тренирате редовно — постоянството има по-голямо значение от часа.'];
  if (focus === 'muscle' || acts.some(a => ['gym', 'bodyweight'].includes(a))) {
    out.push('Сила и мускули: силата е малко по-голяма следобед и вечер, но резултатът за месеци е еднакъв сутрин и вечер (Grgic 2019).');
  }
  out.push('Сън: тренировка вечер не вреди на съня; само интензивна тренировка, завършила по-малко от час преди лягане, може да го затрудни (Stutz 2019).');
  if (safety.diabetes) {
    out.push('Диабет и предиабет: кратко ходене след хранене (10–15 мин) понижава скока на кръвната захар; полезно е и 2–5 мин движение на всеки 20–30 мин седене (Buffey 2022).');
    if (safety.insulin) out.push('Инсулин или сулфанилурейно лекарство: по-добре сутрин или следобед, отколкото късно вечер — по-малък риск от нощна хипогликемия.');
  }
  out.push('Хранене: тренирайте 1–3 ч след основно хранене; ако е по-рано — лека закуска с въглехидрати 30–60 мин преди. След тренировка — хранене с белтък (20–40 г) до 2 ч (ISSN 2017).');
  out.push('Горещо време: навън — рано сутрин или вечер; повече течности.');
  if (time !== 'any') out.push(`Избрано време: ${TRAINING_TIMES[time].label} — менюто подрежда храненията около тренировката.`);
  return out;
}

/* Цикъл и тренировки: какво казват доказателствата. */
const CYCLE_TRAINING = [
  'Фазата на цикъла почти не влияе на постиженията — малък спад е възможен само в първите дни на менструацията (McNulty 2020), а силата и мускулният растеж не зависят от фазата (Colenso-Semple 2023). Планът следва самочувствието, не календара.',
  'Менструация: движението намалява менструалната болка (Cochrane 2019). При силна болка или умора — по-лек вариант: ходене, йога, пилатес.',
  'Около овулацията: добра загрявка с упражнения за коленете преди скокове и отборни спортове; такава загрявка намалява травмите на кръстните връзки при жени с около половина (Petushek 2019).',
  'Лутеална фаза: телесната температура е по-висока — повече течности, внимание в жега; усилието може да се усеща по-голямо, затова се водете по RPE.',
];

/** Съвет за деня от цикъла. */
function cycleAdvice(ph, sessions) {
  const hard = sessions.some(s => s.intensity === 'vigorous');
  let text = '';
  if (ph.phase === 'menstrual') {
    text = ph.day <= 2
      ? `Ден ${ph.day} на менструацията: тренирайте по самочувствие${hard ? '; при болка или умора — същото време, но умерено или ходене, йога, пилатес' : ''}. Движението облекчава болката.`
      : 'Менструация: по самочувствие; движението облекчава болката.';
  } else if (ph.phase === 'ovulation') {
    text = 'Около овулацията: загрявка с упражнения за коленете преди скокове и спортове с рязка смяна на посоката.';
  } else if (ph.phase === 'luteal' || ph.phase === 'premenstrual') {
    text = 'Лутеална фаза: повече течности; при жега — по-рано сутрин или вечер; водете се по усещането (RPE).';
  } else {
    text = 'Фоликуларна фаза: обичайната тренировка.';
  }
  return { day: ph.day, phase: ph.phase, label: ph.label, icon: ph.icon, text };
}

/* ------------------------------------ храненето ------------------------------------ */

/** Съвети за храненето около тренировките в деня. */
export function trainingNutrition(day) {
  const main = day.sessions.filter(s => !s.extra);
  if (!main.length) return [];
  const tips = [];
  const s = main[0];
  const strength = main.some(x => ['gym', 'bodyweight', 'hiit'].includes(x.activity));
  const long = main.some(x => x.minutes >= 75 && ['cardio', 'mixed', 'sport'].includes(ACTIVITIES[x.activity].role) && x.counted !== 'light');
  if (s.time === '7:00') tips.push('Сутрешна тренировка: при нужда банан или кисело мляко преди; закуската — след тренировката.');
  else if (s.time === '12:30') tips.push('Тренировка на обяд: закуска сутрин и междинно хранене; обядът — след тренировката.');
  else if (s.time === '17:30') tips.push('Следобедна тренировка: следобедната закуска 1 ч преди; вечерята — след тренировката.');
  else if (s.time === '19:30') tips.push('Вечерна тренировка: следобедна закуска около 17:30; вечерята — лека и след тренировката.');
  if (strength) tips.push('След силовата тренировка — хранене с 20–40 г белтък до 2 ч (ISSN 2017).');
  if (long) tips.push('Над 60–75 мин усилие: вода по време и 30–60 г въглехидрати на час (ISSN 2017).');
  return tips;
}

/** Нивото на физическа активност, което отговаря на плана (за енергията в менюто). */
export function activityFromTraining(tp) {
  const per = tp.sessionsPerWeek;
  const vig = tp.days.filter(d => d.sessions.some(s => s.counted === 'vigorous')).length / 4;
  if (per >= 6) return vig >= 3 ? 'athlete' : 'active';
  if (per >= 4) return 'moderate';
  return 'light';
}
