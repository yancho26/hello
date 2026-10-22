/* Движение, сън и екрани за деца от 1 до 17 години (версия 4.16).
 *
 * СЗО 2019 (деца под 5 г.): 1–2 г. — поне 180 минути движение с всякаква интензивност през
 * деня, вкл. умерено до интензивно; 3–4 г. — поне 180 минути, от тях поне 60 умерено до
 * интензивно; не повече от 1 час наведнъж в количка или столче; екран — за 1 г. не се
 * препоръчва, за 2–4 г. до 1 час (по-малко е по-добре); сън 11–14 ч (1–2 г.) и 10–13 ч (3–4 г.).
 * СЗО 2020 (5–17 г.): средно поне 60 минути дневно умерено до интензивно движение, предимно
 * аеробно; интензивни дейности и такива, които укрепват мускулите и костите — поне 3 дни
 * седмично; по-малко време седнал, особено пред екран за развлечение.
 * Сън — AASM 2016: 6–12 г. 9–12 ч, 13–18 г. 8–10 ч. */

import { table } from './table.js';

/* Дните на седмицата — както в менюто (nutrition.js внася този модул, затова не и обратно). */
const WEEKDAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];

/** Спортове и занимания — какво развиват. bone — натоварва костите (скокове, удари); strength — мускулите. */
export const CHILD_SPORTS = table({
  football: { label: 'футбол', icon: '⚽', from: 4, vigorous: true, bone: true },
  basketball: { label: 'баскетбол', icon: '🏀', from: 6, vigorous: true, bone: true },
  volleyball: { label: 'волейбол', icon: '🏐', from: 7, vigorous: false, bone: true },
  swimming: { label: 'плуване', icon: '🏊', from: 3, vigorous: true },
  dance: { label: 'танци', icon: '💃', from: 3, vigorous: false, bone: true },
  folk: { label: 'народни танци', icon: '🎶', from: 4, vigorous: false, bone: true },
  gymnastics: { label: 'гимнастика', icon: '🤸', from: 3, vigorous: true, bone: true, strength: true },
  martial: { label: 'бойни спортове', icon: '🥋', from: 4, vigorous: true, bone: true, strength: true },
  athletics: { label: 'лека атлетика', icon: '🏃', from: 5, vigorous: true, bone: true },
  tennis: { label: 'тенис', icon: '🎾', from: 5, vigorous: true, bone: true },
  cycling: { label: 'колоездене', icon: '🚲', from: 3, vigorous: false },
  climbing: { label: 'катерене', icon: '🧗', from: 4, vigorous: true, strength: true },
});

/** Спортовете, подходящи за възрастта. */
export const sportsFor = (years) => Object.keys(CHILD_SPORTS).filter(k => years >= CHILD_SPORTS[k].from);

/* Игри и движение за малките — редуват се по дни. */
const PLAY_1_2 = ['игра с топка', 'катерене на площадката', 'танци на музика', 'разходка — детето ходи част от пътя',
  'бутане и дърпане на играчки', 'игра с пясък и вода', 'пълзене през „тунели“ от възглавници'];
const PLAY_3_4 = ['гоненица и криеница', 'скачане на подскоци и по линии', 'колело или тротинетка', 'игра с топка — ритане и хвърляне',
  'танци на музика', 'катерене на площадката', 'полоса с препятствия'];
const PLAY_5 = ['игра навън — гоненица, народна топка, ластик', 'колело или тротинетка', 'игра с топка в парка',
  'разходка или поход сред природата', 'скачане на въже и дама', 'плуване или игри във вода', 'катерене на площадката'];
const STRENGTH_5_12 = 'Мускули и кости: скачане на въже, катерене, клек и лицеви опори от колене — като игра';
const STRENGTH_13 = 'Силова тренировка със собствено тегло: клек, напади, лицеви опори, планк, скокове';

/** Сънят по възраст (AASM 2016; до 2 г. и СЗО 2019) — часове за 24 часа, с дневния сън при малките. */
export function sleepFor(years) {
  if (years < 3) return { hours: '11–14', note: 'вкл. дневния сън; редовни часове за лягане и ставане (СЗО 2019)' };
  if (years < 6) return { hours: '10–13', note: years < 5 ? 'може с дневен сън; редовни часове за лягане и ставане (СЗО 2019)' : 'може с дневен сън (AASM 2016)' };
  if (years < 13) return { hours: '9–12', note: 'AASM 2016' };
  return { hours: '8–10', note: 'AASM 2016' };
}

/** Екраните по възраст (СЗО 2019, СЗО 2020, AAP 2016). */
export function screensFor(years) {
  if (years < 2) return 'Екрани (телевизия, телефон, таблет) — не се препоръчват (СЗО 2019).';
  if (years < 5) return 'Екрани — до 1 час дневно, по-малко е по-добре; за предпочитане заедно с възрастен (СЗО 2019).';
  return 'Екрани за развлечение — възможно най-малко (СЗО 2020); семеен план кога и колко (AAP 2016); без екрани по време на хранене и преди сън.';
}

/**
 * Седмица с движение за детето. years — възраст в години; sports — избраните спортове (до 3).
 * Връща { band, goal, days: [{ day, label, items: [{ label, minutes, kind, icon }], minutes, mvpa }], sleep, screens, tips }.
 * kind: play (всякаква интензивност), mvpa (умерено до интензивно), vigorous, strength (мускули и кости).
 */
export function childActivityPlan({ years, sports = [] }) {
  const chosen = [...new Set(sports)].filter(k => CHILD_SPORTS[k] && years >= CHILD_SPORTS[k].from).slice(0, 3);
  const days = [];
  const pick = (list, d, shift = 0) => list[(d + shift) % list.length];
  if (years < 3) {
    for (let d = 0; d < 7; d++) {
      const items = [
        { label: `Игра навън: ${pick(PLAY_1_2, d)}`, minutes: 60, kind: 'play' },
        { label: `Активна игра вкъщи: ${pick(PLAY_1_2, d, 3)}`, minutes: 30, kind: 'play' },
        { label: 'Движение през деня — пълзене, ходене, игра на пода', minutes: 90, kind: 'play' },
      ];
      days.push(dayOf(d, items));
    }
    return {
      band: '1–2', chosen,
      goal: { minutes: 180, mvpa: null, strengthDays: null, text: 'Поне 180 минути движение с всякаква интензивност, разпределени през деня; повече е по-добре (СЗО 2019).' },
      restraint: 'Не повече от 1 час наведнъж в количка, столче за хранене или седнало (СЗО 2019).',
      days, sleep: sleepFor(years), screens: screensFor(years), tips: tipsFor(years),
    };
  }
  if (years < 5) {
    for (let d = 0; d < 7; d++) {
      const sport = chosen.length && (d === 2 || d === 5) ? chosen[(d === 2 ? 0 : 1) % chosen.length] : null;
      const items = [
        sport ? { label: `${capital(CHILD_SPORTS[sport].label)} — занимание`, minutes: 45, kind: 'mvpa', icon: CHILD_SPORTS[sport].icon }
          : { label: `Енергична игра: ${pick(PLAY_3_4, d)}`, minutes: 60, kind: 'mvpa' },
        { label: `Игра навън: ${pick(PLAY_3_4, d, 3)}`, minutes: 60, kind: 'play' },
        { label: 'Свободна игра и движение през деня', minutes: sport ? 75 : 60, kind: 'play' },
      ];
      days.push(dayOf(d, items));
    }
    return {
      band: '3–4', chosen,
      goal: { minutes: 180, mvpa: 60, strengthDays: null, text: 'Поне 180 минути движение дневно, от тях поне 60 минути енергично (умерено до интензивно); повече е по-добре (СЗО 2019).' },
      restraint: 'Не повече от 1 час наведнъж в количка или седнало (СЗО 2019).',
      days, sleep: sleepFor(years), screens: screensFor(years), tips: tipsFor(years),
    };
  }
  // 5–17 г.: тренировките по избраните спортове — във вторник, четвъртък, събота, после понеделник и сряда.
  const teen = years >= 13;
  const session = years < 9 ? 45 : 60;
  const slots = [1, 3, 5, 0, 2];
  const sessions = new Map();
  const perSport = chosen.length === 1 ? 3 : 2;
  let i = 0;
  for (const k of chosen) for (let n = 0; n < perSport && i < slots.length; n++, i++) sessions.set(slots[i], k);
  // Мускули и кости — 3 дни седмично (СЗО 2020): понеделник, сряда, петък, ако спортът в деня не ги натоварва.
  for (let d = 0; d < 7; d++) {
    const items = [];
    const sport = sessions.get(d);
    if (sport) {
      const s = CHILD_SPORTS[sport];
      items.push({ label: `${capital(s.label)} — тренировка`, minutes: session, kind: s.vigorous ? 'vigorous' : 'mvpa', icon: s.icon, bone: !!s.bone, strength: !!s.strength });
    }
    if (d < 5) items.push({ label: 'Пеша или с колело до училище и обратно', minutes: 20, kind: 'mvpa' });
    const mvpa = items.reduce((n, x) => n + (x.kind === 'play' ? 0 : x.minutes), 0);
    if (mvpa < 60) {
      // Играта в деня не повтаря спорта („Плуване — тренировка“ и „плуване или игри във вода“).
      const word = sport ? CHILD_SPORTS[sport].label.split(' ')[0] : null;
      const fill = PLAY_5.map((_, k) => PLAY_5[(d + k) % PLAY_5.length]).find(x => !word || !x.includes(word));
      items.push({ label: capital(fill), minutes: Math.max(30, Math.ceil((60 - mvpa) / 5) * 5), kind: d === 5 || d === 6 ? 'vigorous' : 'mvpa' });
    }
    const loaded = sport && (CHILD_SPORTS[sport].bone || CHILD_SPORTS[sport].strength);
    if ([0, 2, 4].includes(d) && !loaded) items.push({ label: teen ? STRENGTH_13 : STRENGTH_5_12, minutes: teen ? 25 : 15, kind: 'strength' });
    days.push(dayOf(d, items));
  }
  return {
    band: teen ? '13–17' : '5–12', chosen,
    goal: { minutes: 60, mvpa: 60, strengthDays: 3, text: 'Средно поне 60 минути дневно умерено до интензивно движение, предимно аеробно; интензивни игри и спорт, и укрепване на мускулите и костите — поне 3 дни седмично (СЗО 2020).' },
    restraint: 'По-малко време седнал (СЗО 2020): движение в почивките, активни игри вместо екран; домашните — с кратки паузи за движение.',
    days, sleep: sleepFor(years), screens: screensFor(years), tips: tipsFor(years),
  };
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function dayOf(d, items) {
  return {
    day: d + 1, label: WEEKDAYS[d], items,
    minutes: items.reduce((n, x) => n + x.minutes, 0),
    mvpa: items.reduce((n, x) => n + (x.kind === 'play' ? 0 : x.minutes), 0),
  };
}

function tipsFor(years) {
  const out = ['Всяко движение се брои и се натрупва през деня; малко е по-добре от нищо, повече — по-добре (СЗО 2020).'];
  if (years < 5) out.push('Движението е игра — навън всеки ден, при всяко време, с подходящи дрехи.');
  else out.push('Ако детето сега се движи малко — започнете с по-малко и увеличавайте постепенно (СЗО 2020).');
  if (years >= 13) out.push('Силовите упражнения са подходящи и за юноши — с правилна техника, надзор и постепенно натоварване (AAP 2020).');
  out.push('Вода преди, по време и след игра и спорт; спортните напитки при обичайно движение не са нужни, а енергийните не са за деца (AAP 2011).');
  return out;
}
