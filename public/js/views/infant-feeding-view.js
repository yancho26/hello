/* Раздел „Хранене“ в досието на кърмаче (от версия 4.10): колко пъти на ден и по колко,
 * захранване по месеци, примерен ден, очакван растеж до 1 година и PDF за родителя. */

import { api } from '../api.js';
import { card, h, mount, select, toast } from '../ui/components.js';
import { growthChart } from '../ui/charts.js';
import { formatAge, formatDate } from '../shared/dates.js';
import { FEEDING_TYPES, PLAN_MONTHS, SOLIDS_START, feedingFlags, infantFeedingPlan, monthDate } from '../shared/infant-feeding.js';
import { busy, downloadInfantPdf } from './pdf-export.js';

const dec = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace('.', ','));
const kg = (v) => `${dec(v, 2)} кг`;
const range = (a, b, unit) => (a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`);
const pct = (p) => (p === null || p === undefined ? '' : p < 1 ? 'под 1-ви' : p > 99 ? 'над 99-и' : `${Math.round(p)}-и`);

/** Планът по данните от досието. */
export function planFor(p, settings = p.feeding) {
  return infantFeedingPlan({
    sex: p.sex, birthDate: p.birthDate, birth: p.birth || {}, measurements: p.measurements || [],
    feeding: settings?.type || 'breast', solidsStart: settings?.solidsStart || 6, allergyRisk: !!settings?.allergyRisk,
  });
}

export function infantFeedingTab(ctx) {
  const { p, reload } = ctx;
  const host = h('div.stack');
  let settings = { type: p.feeding?.type || 'breast', solidsStart: p.feeding?.solidsStart || 6, allergyRisk: !!p.feeding?.allergyRisk };

  const typeBoxes = Object.entries(FEEDING_TYPES).map(([k, t]) => h('label.opt', null,
    h('input', { type: 'radio', name: 'feedType', value: k, checked: settings.type === k, onchange: () => { settings.type = k; render(); } }),
    h('span', null, t.label)));
  const start = select(Object.entries(SOLIDS_START).map(([k, label]) => ({ value: k, label, selected: String(settings.solidsStart) === k })), { name: 'solidsStart' });
  start.addEventListener('change', () => { settings.solidsStart = Number(start.value); render(); });
  const allergy = h('input', { type: 'checkbox', name: 'allergyRisk', checked: settings.allergyRisk, onchange: () => { settings.allergyRisk = allergy.checked; render(); } });
  const saveBtn = h('button.btn.sm.primary', {
    onclick: busy(async () => {
      try {
        await api.saveFeeding(p.id, settings);
        toast('Настройките за храненето са запазени в досието.', 'ok');
        await reload();
      } catch (err) { toast(err.message, 'error'); }
    }),
  }, 'Запази в досието');
  const pdfBtn = h('button.btn.sm', { onclick: busy(() => downloadInfantPdf(p, planFor(p, settings))) }, '📄 PDF за родителя');

  const form = card('Хранене до 1 година', { icon: '🍼', actions: [pdfBtn, saveBtn] },
    h('div.q-opts', null, typeBoxes),
    h('div.form-grid', { style: { marginTop: '10px' } },
      h('div', null, h('label.field-lbl', null, 'Захранване'), start),
      h('div', null, h('label.opt', { style: { marginTop: '22px' } }, allergy,
        h('span', null, 'тежка екзема или алергия към яйце (риск от алергия към фъстъци)')))),
    h('p.small.muted', { style: { margin: '10px 0 0' } },
      'Планът се изчислява от датата на раждане, данните при раждане и измерванията в раздел „Растеж“. '
      + (p.feeding?.updatedAt ? `Запазено на ${formatDate(p.feeding.updatedAt.slice(0, 10))}.` : 'Изборът още не е запазен в досието.')));

  const render = () => mount(host, form, ...planView(p, planFor(p, settings)));
  render();
  return host;
}

/** Картите на плана: сега, растеж, по месеци, храни, правила. */
function planView(p, plan) {
  const cur = plan.months[plan.age.currentMonth];
  const next = plan.months[Math.min(PLAN_MONTHS - 1, plan.age.currentMonth + 1)];
  const breast = plan.input.feeding === 'breast';
  const flags = feedingFlags(plan);
  const tile = (label, value, unit, sub) => h('div.tile', null, h('div.tiny.dim', null, label),
    h('div.tile-v', null, value, unit ? h('span.small.dim', null, ' ' + unit) : null), sub ? h('div.tiny.dim', null, sub) : null);
  const ageText = plan.age.corrected
    ? `${formatAge(p.birthDate)} (коригирана възраст ${dec(plan.age.months)} мес.)` : formatAge(p.birthDate);
  const g = plan.growth;
  const fw = plan.now.firstWeek;

  const milkTile = breast
    ? tile('Кърмене', 'при поискване', '', plan.age.currentMonth < 2 ? 'поне 8 пъти на 24 ч. (СЗО)' : 'обикновено поне 5–6 пъти на 24 ч.')
    : fw ? tile('Мляко на хранене', `≈${fw.perFeed}`, 'мл', `ден ${fw.day}: ${fw.daily} мл за ${fw.feeds} хранения (НЦОЗА)`)
      : tile('Мляко на хранене', range(cur.formula.perFeedMin, cur.formula.perFeedMax, ''), 'мл',
        `${cur.formula.feeds} пъти · ${range(cur.formula.dailyMin, cur.formula.dailyMax, 'мл')} на ден${cur.formula.inMeals ? ' с кашите' : ''}`);

  const now = card(plan.now.done ? 'Първата година е завършена' : `Сега: ${cur.label}`, { icon: '⏱' },
    plan.warnings.length ? h('div.stack', { style: { gap: '6px', marginBottom: '10px' } }, plan.warnings.map(w => h('div.alert-strip.warn', null, w))) : null,
    flags.length ? h('div.stack', { style: { gap: '6px', marginBottom: '10px' } }, flags.map(f => h(`div.alert-strip.${f.level === 'warn' ? 'warn' : 'info'}`, null, f.text))) : null,
    plan.notes.length ? h('div.stack', { style: { gap: '6px', marginBottom: '10px' } }, plan.notes.map(n => h('div.alert-strip.info', null, n))) : null,
    h('p.small', { style: { margin: '0 0 10px' } }, h('strong', null, 'Възраст: '), ageText, ' · ',
      h('strong', null, 'Хранене: '), FEEDING_TYPES[plan.input.feeding].label),
    h('div.tiles', null,
      fw ? tile('Хранения на ден', fw.feedsText, '', `през ${fw.every} (НЦОЗА)`) : tile('Хранения на ден', cur.feeds, '', cur.solids ?`${Array.isArray(cur.solidMeals) ? range(cur.solidMeals[0], cur.solidMeals[1], '') : ''} с храна, останалите мляко` : 'само мляко'),
      milkTile,
      cur.solids ? tile('Храна на хранене', cur.firstSolidMonth ? `${cur.portion.from}→${cur.portion.to}` : range(cur.portion.from, cur.portion.to, ''), 'г', cur.firstSolidMonth ? 'от 1–3 с.л. до цяла порция за 7–8 дни' : 'порция по НЦОЗА') : null,
      tile('Енергия', cur.energy, 'kcal/ден', 'FAO/WHO/UNU 2004'),
      g.lastWeight ? tile('Тегло', dec(g.lastWeight.value, 2), 'кг', `${formatDate(g.lastWeight.date)}${g.percentileWeight !== null ? ` · ${pct(g.percentileWeight)} перцентил` : ''}`) : null,
      tile('След месец', `≈${dec(next.growth.start.weight, 2)}`, 'кг', `по своята крива; +${cur.growth.gain} г за месеца`)),
    cur.texture ? h('p.small', { style: { margin: '10px 0 0' } }, h('strong', null, 'Консистенция: '), cur.texture) : null,
    cur.newFoods.length ? h('p.small', { style: { margin: '6px 0 0' } }, h('strong', null, 'Нови храни този месец: '), cur.newFoods.join('; ')) : null,
    dayList(fw ? fw.schedule : cur.day),
    h('div.nut-list', { style: { marginTop: '8px' } }, h('h3', null, 'Достатъчно ли яде'), h('ul', null, plan.adequacy.map(t => h('li.small', null, t)))));

  // Растеж: графика с очаквания път и таблица по месеци.
  const pts = (key) => (p.measurements || []).filter(m => m[key] > 0).map(m => ({
    ageMonths: monthsAt(p, m.date, plan), value: Number(m[key]), severity: 0,
  })).filter(x => x.ageMonths >= 0 && x.ageMonths <= 12.5);
  const track = (key) => plan.months.map(m => [m.month, m.growth.start[key]]).concat([[12, plan.growth.at12[key]]]);
  const wChart = growthChart('weight', p, pts('weight'), { fromMonths: 0, toMonths: 12, track: track('weight') });
  const lChart = growthChart('height', p, pts('height'), { fromMonths: 0, toMonths: 12, track: track('length') });
  const growth = card('Очакван растеж до 1 година', { icon: '📈' },
    h('p.small.muted', { style: { marginTop: 0 } },
      g.trackFrom === 'measurement' ? `Пунктирът е пътят по кривата на детето — по последното измерване (${formatDate(g.lastWeight.date)}). Лентата е между 3-ия и 97-ия перцентил на СЗО.`
        : g.trackFrom === 'birth' ? 'Пунктирът е пътят по кривата от теглото при раждане. Добавете измерване за по-точен път.'
          : 'Няма тегло — пунктирът е медианата на СЗО.'),
    h('div.chart-grid', null,
      wChart ? h('div.chart-card', null, h('h3', null, 'Тегло'), wChart) : null,
      lChart ? h('div.chart-card', null, h('h3', null, 'Дължина'), lChart) : null),
    h('div.table-wrap', null, h('table.infant-growth', null,
      h('thead', null, h('tr', null, ['Навършени', 'Около', 'Тегло по кривата', 'Норма (3–97 п.)', 'Наддаване за изминалия месец', 'Дължина', 'Норма'].map(t => h('th', null, t)))),
      h('tbody', null, [...plan.months.map(m => m.growth.start), plan.growth.at12].map((x, i) => h('tr' + (i === plan.age.currentMonth ? '.current' : ''), null,
        h('td', null, `${i} мес.`),
        h('td.small.dim', null, formatDate(monthDate(p.birthDate, i, plan.input.gestWeeks))),
        h('td', null, h('strong', null, kg(x.weight))),
        h('td.small', null, `${dec(x.weightP3, 1)}–${dec(x.weightP97, 1)} кг`),
        h('td.small', null, i > 0 ? `+${plan.months[i - 1].growth.gain} г` : '—'),
        h('td', null, `${dec(x.length)} см`),
        h('td.small', null, `${dec(x.lengthP3)}–${dec(x.lengthP97)} см`)))))),
    h('p.tiny.muted', { style: { margin: '8px 0 0' } }, 'Растежни стандарти на СЗО. Нормално е бебето да наддава по около 500 г до 1 кг и повече на месец след втората седмица (СЗО 2009); оценката на изоставането е по NICE NG75 в раздел „Растеж“.'));

  const months = card('План по месеци', { icon: '🗓' },
    h('div.stack', null, plan.months.map(m => monthView(m, plan, m.month === plan.age.currentMonth))));

  const foods = card('Кога се въвежда всяка храна', { icon: '🥕' },
    h('div.table-wrap', null, h('table.food-timeline', null,
      h('thead', null, h('tr', null, h('th', null, 'Храна'), ...[4, 5, 6, 7, 8, 9, 10, 11].map(m => h('th.c', null, `${m}`)))),
      h('tbody', null, plan.foods.map(f => h('tr', null, h('td.small', null, f.label, f.allergen ? h('span.tiny.dim', null, ' · алерген — не се отлага') : null),
        ...[4, 5, 6, 7, 8, 9, 10, 11].map(m => h('td.c', null, m >= f.from && m <= f.to ? h(`span.food-dot.${f.color}`, { title: `${m} навършени месеца` }) : null))))))),
    h('p.tiny.muted', { style: { margin: '8px 0 0' } }, 'Колоните са навършени месеци. Всички групи, включително алергенните, се въвеждат през първите 2–3 месеца на захранването — една нова храна на всеки 3–5 дни (ESPGHAN 2024, EAACI 2020, AAP 2019, CDC). Нищо не се дава преди началото на захранването.'),
    h('div.nut-list', { style: { marginTop: '8px' } }, h('h3', null, 'Готово ли е за захранване'), h('ul', null, plan.readiness.map(t => h('li.small', null, t)))));

  const rules = card('Правила', { icon: '✓' },
    h('ul.rules-list', null, plan.rules.map(r => h('li.small', null, r.text, h('span.tiny.dim', null, ` (${r.src})`)))));

  return [now, growth, months, foods, rules,
    h('p.tiny.muted', null, 'Източници: НЦОЗА 2013 — „Основи на здравословното хранене на деца до 3-годишна възраст“; FAO/WHO/UNU 2004 — Human energy requirements; СЗО 2009 — Infant and young child feeding; ESPGHAN 2013 (витамин D), 2015 (арсен в ориза), 2017 (захранване), 2024 (отговор на 11 дружества на ръководството на СЗО; глутен и цьолиакия) и 2025 (веганско хранене); EAACI 2020 (алергии); AAP 2022 (кърмене), 2019 (алергии), 2017 (сокове) и препоръките за напитките; AAAAI/ACAAI/CSACI 2021; NIAID 2017 (фъстъци); DGA 2025–2030 и CDC (САЩ); NICE NG75; растежни стандарти на СЗО. Количествата са ориентировъчни — бебето се храни според апетита си.')];
}

function monthsAt(p, date, plan) {
  const days = (new Date(date) - new Date(p.birthDate)) / 86400000;
  const shift = plan.age.corrected ? (40 - plan.input.gestWeeks) * 7 : 0;
  return (days - shift) / 30.4375;
}

function dayList(day) {
  if (!day) return null;
  return h('div.infant-day', null,
    h('div.small.muted', null, `Примерен ден — ${day.orientation}`),
    h('table.infant-day-table', null, h('tbody', null, day.items.map(it => h('tr', null, h('td.nowrap', null, h('strong', null, it.time)), h('td.small', null, it.what))))));
}

function monthView(m, plan, open) {
  const breast = plan.input.feeding === 'breast';
  const milk = breast ? m.breast
    : m.formula ? `${m.formula.feeds} пъти по ${range(m.formula.perFeedMin, m.formula.perFeedMax, 'мл')}; ${range(m.formula.dailyMin, m.formula.dailyMax, 'мл')} на ден${m.formula.inMeals ? ', заедно с млякото в кашите и пюретата' : ''}${m.formula.followOn ? ' (начално или преходно мляко)' : ''}`
      : '';
  return h('details.week-day.infant-month', { open },
    h('summary', null, h('strong', null, m.label), h('span.small.dim', null, ` · ${m.feeds} хранения`),
      m.solids ? h('span.cycle-chip.ph-follicular', null, m.firstSolidMonth ? 'начало на захранването' : `${Array.isArray(m.solidMeals) ? m.solidMeals[1] : ''} с храна`) : null,
      h('span.grow'), h('span.small.muted', null, `≈${m.energy} kcal · ${dec(m.growth.start.weight, 2)} → ${dec(m.growth.end.weight, 2)} кг`)),
    h('div.small', { style: { margin: '6px 0' } }, h('strong', null, breast ? 'Кърмене: ' : 'Мляко: '), milk),
    plan.input.feeding === 'mixed' ? h('div.small.muted', null, 'При смесено хранене първо се дава кърма, а адаптираното мляко допълва — количеството му зависи от кърмата и наддаването (NICE NG75).') : null,
    m.solids ? h('div.small', null, h('strong', null, 'Храна: '), `${Array.isArray(m.solidMeals) ? range(m.solidMeals[0], m.solidMeals[1], '') : ''} хранения на ден, порция ${m.firstSolidMonth ? `от 30 до ${m.portion.to}` : range(m.portion.from, m.portion.to, '')} г; ${m.texture}.`
      + (m.snacks ? ' 1–2 закуски с храни за ядене с пръсти.' : '')) : null,
    m.newFoods.length ? h('div.small', null, h('strong', null, 'Нови храни: '), m.newFoods.join('; ')) : null,
    dayList(m.day));
}
