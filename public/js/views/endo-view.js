/* Раздел „Ендокринология“ в досието на възрастен пациент. */

import { api } from '../api.js';
import { badge, card, empty, field, h, input, modal, mount, numberInput, select, table, toast } from '../ui/components.js';
import { trendChart } from '../ui/trend-chart.js';
import { formatDate, formatDateShort, relativeDays, today } from '../shared/dates.js';
import { LABS, formatLab } from '../shared/labs.js';
import { classesOf } from '../shared/drugs.js';
import {
  BETHESDA, COMPOSITION, ECHOGENICITY, ENDO_VERIFIED, EU_TIRADS, INSULIN_KIND, LOBES, euTirads, highRiskFeatures,
} from '../shared/endo.js';
import { deleteWithConfirm, resultsDialog } from './adult-dialogs.js';
import {
  addButtons, alertsCard, consultDialog, dec, diagnosisDraft, historyCard, okBadge, therapyText,
} from './specialty-common.js';

const KINDS = ['cgm', 'smbg', 'foot'];
/* „Статин“ → „статин“; „SGLT2-инхибитор“ остава. */
const lc = (t) => (/^[А-ЯA-Z][а-яa-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const ACTION_BADGE = {
  fna: ['overdue', 'биопсия'], surgery: ['overdue', 'хирург'], refer: ['due', 'решение'],
  follow: ['soon', 'проследяване'], none: ['done', 'без проследяване'], exam: ['future', 'няма преглед'],
};

export function endoTab(ctx) {
  const s = ctx.data.specialty?.endo;
  if (!s) return card(null, {}, empty('Модулът „Ендокринология“ не е включен.', null));
  if (s.error) return card(null, {}, empty('Данните за раздела не могат да бъдат обработени — вероятно има повреден запис. Останалите раздели работят.', '⚠️'));
  return h('div.stack', null,
    addButtons(ctx, KINDS, [
      h('button.btn.sm', { onclick: () => noduleDialog(ctx) }, '＋ Възел'),
      h('button.btn.sm', { onclick: () => resultsDialog(ctx, ['hba1c', 'glucose', 'tsh', 'ft4', 'ft3', 'atpo', 'trab', 'cpep']) }, '＋ Резултати'),
      h('div.grow'),
      h('button.btn.sm.primary', { onclick: () => consultDialog(ctx, 'endo', () => consultDraft(ctx, s)) }, '＋ Преглед от раздела'),
    ]),
    h('div.overview-grid', null,
      h('div.col', null, alertsCard(s.alerts, 'Няма ендокринологични сигнали.'), s.diabetes ? diabetesCard(ctx, s.diabetes) : null,
        s.diabetes?.regimen ? insulinCard(ctx, s.diabetes) : null),
      h('div.col', null, s.diabetes ? cgmCard(ctx, s.diabetes) : null, s.diabetes ? checklistCard(ctx, s.diabetes) : null,
        s.thyroid ? thyroidCard(ctx, s.thyroid) : null)),
    nodulesCard(ctx, s.nodules),
    historyCard(ctx, KINDS, 'Ендокринологични прегледи'),
    h('p.tiny.muted', null,
      'Източници: международен консенсус за времето в диапазон (Battelino 2019), ADA 2026, ESC 2023, KDIGO 2024, IWGDF 2023, '
      + `ETA 2013/2015/2018 за щитовидната жлеза, EU-TIRADS (ETA 2017) и ETA 2023 за възлите, Bethesda 2023. Сверено ${ENDO_VERIFIED}. `
      + 'Изчисленията подпомагат, но не заменят преценката на лекаря.'));
}

/* ---------------------------------- диабет ---------------------------------- */

function diabetesCard(ctx, d) {
  const g = d.glycemia;
  const chart = g.series.length > 1 ? trendChart({
    series: [{ label: 'HbA1c', points: g.series.map(x => ({ date: x.date, value: x.value })) }],
    unit: '%', decimals: 1, band: { lo: 4, hi: g.target.value }, lines: [{ value: g.target.value, label: `цел <${dec(g.target.value)}` }],
  }) : null;
  const statusBadge = { ok: ['done', 'в целта'], partial: ['due', 'близо до целта'], bad: ['overdue', 'извън целта'], unknown: ['future', 'няма данни'] }[g.status];
  return card(d.type === 'dm1' ? 'Захарен диабет тип 1' : d.type === 'dm2' ? 'Захарен диабет тип 2' : 'Въглехидратна обмяна', { icon: '🩸' },
    h('div.row', { style: { flexWrap: 'wrap' } },
      g.last ? h('span', { style: { fontSize: '20px', fontWeight: 700 } }, formatLab('hba1c', g.last.value)) : h('span.muted', null, 'Няма HbA1c'),
      g.last ? h('span.small.muted', null, formatDate(g.last.date)) : null,
      h('span.small', null, 'цел ', h('strong', null, g.target.text)),
      badge(...statusBadge),
      g.change !== null ? h('span.small.muted', null, `${g.change > 0 ? '▲' : g.change < 0 ? '▼' : '='} ${dec(Math.abs(g.change))} от ${formatDate(g.prev.date)}`) : null),
    g.age > 183 ? h('div.small', { style: { color: 'var(--warn)', marginTop: '4px' } }, 'Последният HbA1c е отпреди повече от 6 месеца.') : null,
    d.smbg ? h('div', { style: { marginTop: '10px' } }, h('strong.small', null, `Самоконтрол — ${formatDate(d.smbg.study.date)}`),
      table(['', 'Стойност', 'Цел', ''], d.smbg.items.map(i => h('tr', null, h('td.small', null, i.label), h('td.nowrap', null, i.value), h('td.small.dim', null, i.target), h('td', null, okBadge(i.ok)))))) : null,
    d.foot ? h('div.small', { style: { marginTop: '10px' } },
      h('strong', null, `Стъпала (IWGDF): категория ${d.foot.cat} — ${d.foot.label}`), `, преглед ${d.foot.every} (${formatDate(d.foot.study.date)}).`,
      d.foot.urgent ? h('div', { style: { color: 'var(--danger)', fontWeight: 600 } }, 'Активна язва — спешно към кабинет за диабетно стъпало.') : null) : null,
    chart ? h('div.chart-inline', { style: { marginTop: '10px' } }, chart) : null);
}

function cgmCard(ctx, d) {
  const c = d.cgm;
  if (!c) {
    return card('Сензор за глюкоза (CGM)', { icon: '📡' },
      h('p.small.muted', { style: { margin: 0 } }, 'Въведете отчета (AGP) от сензора: времето в отделните диапазони, средната глюкоза и CV. Цели: над 70% в 3,9–10,0, под 4% под 3,9, под 1% под 3,0.'));
  }
  const v = c.study.values;
  const seg = (pct, colour, label) => (pct > 0 ? h('div', { style: { width: pct + '%', background: colour }, title: `${label}: ${dec(pct)}%` }) : null);
  return card(`Сензор за глюкоза — ${formatDate(c.study.date)}`, { icon: '📡', tight: true },
    h('div.body', null,
      h('div.agp-bar', null,
        seg(v.veryLow, '#8b1a1a', 'под 3,0'), seg(v.low, '#e0453a', '3,0–3,8'), seg(v.tir, '#2e9e62', '3,9–10,0'),
        seg(v.high, '#f0b429', '10,1–13,9'), seg(v.veryHigh, '#e07b14', 'над 13,9')),
      h('div.tiny.dim', null, `${v.days} дни${v.active !== undefined ? ` · активен ${dec(v.active)}%` : ''}${v.mean ? ` · средна ${dec(v.mean)} mmol/L` : ''}${c.gmi ? ` · GMI ${dec(c.gmi)}%` : ''}`),
      c.older ? h('div.tiny.dim', null, 'Цели за по-възрастни (65+ г.) или с висок риск от хипогликемия.') : null),
    table(['Показател', 'Стойност', 'Цел', ''], c.items.map(i => h('tr', null,
      h('td.small', null, i.label), h('td.nowrap', null, `${dec(i.value)}%`), h('td.small.dim', null, i.target), h('td', null, okBadge(i.ok))))),
    h('div.body', null,
      h('div.small', { style: { fontWeight: 600 } }, c.focus),
      c.sufficiencyText ? h('div.tiny', { style: { color: 'var(--warn)' } }, c.sufficiencyText) : null,
      d.cgmSeries.length > 1 ? h('div.chart-inline', { style: { marginTop: '8px' } }, trendChart({
        series: [{ label: 'TIR', points: d.cgmSeries }], unit: '%', band: { lo: c.targets.tir, hi: 100 },
        lines: [{ value: c.targets.tir, label: `цел >${c.targets.tir}%` }],
      })) : null));
}

function insulinCard(ctx, d) {
  const r = d.regimen;
  return card('Инсулин', { icon: '💉', tight: true },
    table(['Инсулин', 'Вид', 'Дневно'], r.list.map(x => h('tr', null,
      h('td', null, x.name), h('td.small', null, INSULIN_KIND[x.kind]),
      h('td.nowrap', null, x.units !== null ? `${dec(x.units)} ед.` : h('span.dim', null, 'не е въведено числово'))))),
    h('div.body', null,
      h('div.tiles', null,
        tile('Обща дневна доза', r.tdd ? `${dec(r.tdd)} ед.` : '—', r.perKg ? `${dec(r.perKg)} ед./кг` : ''),
        r.basal ? tile('Базален', `${dec(r.basal)} ед.`, r.basalPct !== null ? `${r.basalPct}% от общата` : '') : null,
        r.icr ? tile('Въглехидратен коефициент', `1 ед. / ${r.icr} г`, 'правило 500') : null,
        r.isf ? tile('Корекционен фактор', `1 ед. / ${dec(r.isf)} mmol/L`, 'правило 100') : null),
      r.unknown.length ? h('div.tiny', { style: { color: 'var(--warn)', marginTop: '6px' } },
        `Без числова доза: ${r.unknown.join(', ')}. Въведете единиците във всяко поле на приема (напр. 10 – 0 – 8).`) : null,
      r.icr ? h('div.tiny.dim', { style: { marginTop: '6px' } }, 'Коефициентите са ориентировъчни начални стойности — уточняват се по самоконтрола.') : null,
      d.basal ? h('div.alert-strip' + (d.basal.kind === 'ok' ? '.info' : '.warn'), { style: { marginTop: '8px' } }, d.basal.text) : null));
}

const tile = (label, value, sub) => h('div.tile', null, h('div.tiny.dim', null, label), h('div.tile-v', { style: { fontSize: '16px' } }, value), sub ? h('div.tiny.dim', null, sub) : null);

function checklistCard(ctx, d) {
  const rows = d.checklist.map(i => h('tr' + (!i.ok && !i.optional ? '.attention' : ''), null,
    h('td', null, h('strong', null, i.label),
      i.note ? h('div.tiny.dim', null, i.note) : null,
      i.monitoring ? h('div.tiny.dim', null, i.last ? `последно ${formatDate(i.last)}` : 'няма запис', i.due ? ` · срок ${formatDateShort(i.due)}` : '') : null),
    h('td', null, i.monitoring
      ? (i.ok ? badge('done', 'навреме') : badge(i.status === 'overdue' ? 'overdue' : 'due', i.status === 'overdue' ? 'просрочено' : 'дължимо'))
      : i.ok ? badge('done', 'приема') : i.optional ? badge('future', 'обмислете') : badge('overdue', 'не приема'))));
  return card('Лечение със защита и годишен преглед', { icon: '🛡', tight: true },
    rows.length ? table(['', ''], rows) : empty('Няма показания за проверка.', null));
}

/* ------------------------------ щитовидна жлеза ------------------------------ */

function thyroidCard(ctx, t) {
  const pat = t.pattern;
  const val = (code, v) => (v === null || v === undefined ? null : h('span.nowrap', null, `${LABS[code].short} `, h('strong', null, formatLab(code, v))));
  const chart = t.tshSeries.length > 1 ? trendChart({
    series: [{ label: 'TSH', points: t.tshSeries.map(x => ({ date: x.date, value: x.value })) }], unit: 'mIU/L', decimals: 2,
    band: { lo: 0.4, hi: 4.0 },
  }) : null;
  return card('Щитовидна жлеза', { icon: '🦋' },
    t.tsh ? h('div.row', { style: { flexWrap: 'wrap' } }, val('tsh', t.tsh.value), val('ft4', t.ft4), val('ft3', t.ft3), h('span.small.muted', null, formatDate(t.tsh.date)))
      : h('p.small.muted', { style: { margin: 0 } }, 'Няма въведен TSH.'),
    pat ? h('div.alert-strip' + (pat.severity >= 2 ? '' : pat.severity === 1 ? '.warn' : '.info'), { style: { marginTop: '8px' } },
      h('div', null, h('strong', null, pat.label), h('div.small', { style: { fontWeight: 400 } }, pat.text))) : null,
    t.antibodies.length ? h('div.small', { style: { marginTop: '8px' } }, t.antibodies.map(r => h('span', { style: { marginRight: '12px' } },
      `${LABS[r.code].short} ${formatLab(r.code, r.value)}${r.value > LABS[r.code].range[1] ? ' ↑' : ''} (${formatDateShort(r.date)})`))) : null,
    t.lt4 ? h('div.small', { style: { marginTop: '8px' } },
      h('strong', null, 'Левотироксин: '),
      t.lt4.daily ? `${dec(t.lt4.daily)} µg дневно${t.lt4.perKg ? ` (${dec(t.lt4.perKg)} µg/кг)` : ''}. ` : t.lt4.med ? 'дозата не е въведена числово. ' : 'не приема. ',
      h('span.muted', null, t.lt4.startText)) : null,
    t.atd ? h('div.small', { style: { marginTop: '8px' } }, h('strong', null, `${t.atd.name}: `),
      h('ul.list-plain.compact', null, t.atd.notes.map(n => h('li', null, '• ' + n)))) : null,
    chart ? h('div.chart-inline', { style: { marginTop: '10px' } }, chart) : null);
}

/* ---------------------------------- възли ---------------------------------- */

function nodulesCard(ctx, list) {
  const { p, reload } = ctx;
  const active = list.filter(n => !n.removed);
  const removed = list.filter(n => n.removed);
  const noduleBox = (n) => {
    const nd = n.nodule;
    const [cls, lbl] = ACTION_BADGE[n.action] || ['future', ''];
    const exams = [...n.exams].reverse();
    return h('div.nodule', null,
      h('div.row', { style: { flexWrap: 'wrap' } },
        h('strong', null, LOBES[nd.lobe] + (nd.location ? `, ${nd.location}` : '')),
        n.cat ? badge(n.cat >= 5 ? 'overdue' : n.cat === 4 ? 'due' : 'done', `EU-TIRADS ${n.cat}`) : null,
        n.cat ? h('span.tiny.dim', null, `риск ${n.risk}`) : null,
        badge(cls, lbl),
        h('div.grow'),
        n.removed ? null : [
          h('button.btn.xs', { onclick: () => examDialog(ctx, nd) }, '＋ Ехография'),
          h('button.btn.xs', { onclick: () => fnaDialog(ctx, nd) }, '＋ Биопсия'),
          h('button.btn.xs', {
            title: 'Възелът е отстранен оперативно',
            onclick: async () => { try { await api.updateNodule(p.id, nd.id, { status: 'removed' }); reload(); } catch (err) { toast(err.message, 'error'); } },
          }, 'Отстранен'),
        ],
        h('button.btn.xs.danger', {
          title: 'Изтрий възела (грешно въведен)',
          onclick: () => deleteWithConfirm('Възелът и всичките му прегледи ще бъдат изтрити.', () => api.deleteNodule(p.id, nd.id), reload),
        }, '✕')),
      n.last ? h('div.small', { style: { marginTop: '4px' } },
        `${n.last.dims.join(' × ')} мм`, n.volume ? ` · обем ${dec(n.volume)} мл` : '',
        ` · ${COMPOSITION[n.last.composition]}`, n.last.echogenicity ? `, ${ECHOGENICITY[n.last.echogenicity]}` : '',
        n.features.length ? h('span', { style: { color: 'var(--danger)' } }, ` · ${n.features.join(', ')}`) : null,
        h('span.dim', null, ` (${formatDate(n.last.date)})`)) : null,
      n.growth ? h('div.small', { style: { color: n.growth.significant ? 'var(--danger)' : 'var(--ink-2)' } }, n.growth.text) : null,
      n.bethesda ? h('div.small', null, `Цитология (${formatDate(n.bethesda.date)}): `, h('strong', null, `Bethesda ${n.bethesda.label}`), h('span.dim', null, ` · риск от малигненост ${n.bethesda.rom}`)) : null,
      h('div.small', { style: { fontWeight: 600, marginTop: '4px' } }, n.text,
        n.next ? h('span', { style: { fontWeight: 400 } }, ` Следваща ехография: ${formatDate(n.next)} (${relativeDays(n.next)}).`) : null),
      exams.length > 1 || n.fna.length ? h('details', { style: { marginTop: '6px' } }, h('summary.tiny', null, `История: ${n.exams.length} ехографии, ${n.fna.length} биопсии`),
        table(['Дата', 'Вид', 'Резултат', ''], [
          ...n.exams.map(e => ({ date: e.date, row: [formatDate(e.date), 'Ехография', `${e.dims.join(' × ')} мм · EU-TIRADS ${euTirads(e)}`, 'exams', e.id] })),
          ...n.fna.map(f => ({ date: f.date, row: [formatDate(f.date), 'Биопсия', `Bethesda ${BETHESDA[f.bethesda].label}${f.note ? ' · ' + f.note : ''}`, 'fna', f.id] })),
        ].sort((x, y) => (x.date < y.date ? 1 : -1)).map(({ row }) => h('tr', null,
          h('td.small.nowrap', null, row[0]), h('td.small', null, row[1]), h('td.small', null, row[2]),
          h('td.actions.no-print', null, h('button.btn.xs.danger', {
            onclick: () => deleteWithConfirm('Записът ще бъде изтрит.', () => api.deleteNoduleEntry(p.id, nd.id, row[3], row[4]), reload),
          }, '✕')))))) : null);
  };
  return card(`Възли на щитовидната жлеза${active.length ? ` (${active.length})` : ''}`, {
    icon: '🔘', actions: h('button.btn.sm.no-print', { onclick: () => noduleDialog(ctx) }, '＋ Възел'),
  },
  active.length ? h('div.stack', { style: { gap: '10px' } }, active.map(noduleBox))
    : h('p.small.muted', { style: { margin: 0 } }, 'Няма въведени възли. При всяка ехография се въвеждат размерите и белезите — програмата определя EU-TIRADS, показанието за биопсия, растежа и срока за следващ преглед.'),
  removed.length ? h('details', { style: { marginTop: '10px' } }, h('summary.small', null, `Отстранени (${removed.length})`),
    h('div.stack', { style: { gap: '8px', marginTop: '8px' } }, removed.map(noduleBox))) : null);
}

/** Полетата на един ехографски преглед с жива оценка по EU-TIRADS. */
function examFields(preview) {
  const sel = (name, options, value = '') => select([{ value: '', label: '—' }, ...Object.entries(options).map(([v, l]) => ({ value: v, label: l, selected: v === value }))], { name, onchange: preview });
  return [
    h('div', null, field('Дата на ехографията', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
    h('div', null, h('span.field-lbl', null, 'Размери (мм)'),
      h('div.row.tight', null,
        numberInput({ name: 'd1', min: 1, max: 120, placeholder: 'най-голям', oninput: preview }),
        numberInput({ name: 'd2', min: 1, max: 120, placeholder: '×', oninput: preview }),
        numberInput({ name: 'd3', min: 1, max: 120, placeholder: '×', oninput: preview }))),
    h('div', null, field('Структура', sel('composition', COMPOSITION))),
    h('div', null, field('Ехогенност (на солидната част)', sel('echogenicity', ECHOGENICITY))),
    h('div', null, field('Форма', select([{ value: 'oval', label: 'овална' }, { value: 'taller', label: 'неовална / по-висок отколкото широк' }], { name: 'shape', onchange: preview }))),
    h('div', null, field('Ръбове', select([{ value: 'smooth', label: 'гладки' }, { value: 'irregular', label: 'неравни / микролобулирани' }], { name: 'margins', onchange: preview }))),
    h('div.full', null, h('label.check', null, h('input', { type: 'checkbox', name: 'microcalc', onchange: preview }), h('span', null, 'Микрокалцификати'))),
    h('div.full', null, field('Бележка', input({ name: 'note', maxlength: 500 }))),
  ];
}

function readExamForm(form) {
  const d = Object.fromEntries(new FormData(form));
  const n = (v) => (v ? Number(String(v).replace(',', '.')) : null);
  return {
    date: d.date, dims: [n(d.d1), n(d.d2), n(d.d3)].filter(x => x > 0),
    composition: d.composition, echogenicity: d.echogenicity, shape: d.shape, margins: d.margins,
    microcalc: d.microcalc === 'on', note: d.note,
  };
}

function previewBox() {
  const box = h('div.full.nodule-preview');
  const update = (form) => {
    const e = readExamForm(form);
    if (!e.composition) { mount(box, h('span.small.dim', null, 'Изберете структура и ехогенност — категорията се изчислява веднага.')); return; }
    const cat = euTirads(e);
    const size = Math.max(0, ...e.dims);
    const limit = EU_TIRADS[cat].fnaOver;
    const feats = highRiskFeatures(e);
    mount(box, h('div', null,
      h('strong', null, EU_TIRADS[cat].label), h('span.small.dim', null, ` · риск от малигненост ${EU_TIRADS[cat].risk}`),
      feats.length ? h('div.small', { style: { color: 'var(--danger)' } }, 'Високорискови белези: ' + feats.join(', ')) : null,
      h('div.small', null, limit === null ? 'Биопсия не е показана.' : size > limit ? `Размер ${size} мм — над ${limit} мм: показана е биопсия.` : `Биопсия при размер над ${limit} мм.`)));
  };
  return { box, update };
}

export function noduleDialog(ctx) {
  const { p, reload } = ctx;
  let form;
  const pv = previewBox();
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.addNodule(p.id, { lobe: d.lobe, location: d.location, exam: readExamForm(form) });
      toast('Възелът е добавен.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  modal({
    title: 'Нов възел на щитовидната жлеза — ' + p.name,
    wide: true,
    body: () => {
      const preview = () => pv.update(form);
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() },
        h('div', null, field('Разположение', select(Object.entries(LOBES).map(([value, label]) => ({ value, label })), { name: 'lobe' }))),
        h('div', null, field('Уточнение', input({ name: 'location', maxlength: 80, placeholder: 'напр. горна трета, възел 1' }))),
        examFields(preview), pv.box);
      preview();
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Добави'),
    ],
  });
}

function examDialog(ctx, nodule) {
  const { p, reload } = ctx;
  let form;
  const pv = previewBox();
  const submit = async (close) => {
    try {
      await api.addNoduleExam(p.id, nodule.id, readExamForm(form));
      toast('Ехографията е записана.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  modal({
    title: `Ехография — ${LOBES[nodule.lobe]}${nodule.location ? ', ' + nodule.location : ''}`,
    wide: true,
    body: () => {
      const preview = () => pv.update(form);
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() }, examFields(preview), pv.box);
      // Белезите от предишния преглед — за по-бързо въвеждане.
      const last = [...(nodule.exams || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
      if (last) {
        for (const k of ['composition', 'echogenicity', 'shape', 'margins']) if (last[k]) form.elements[k].value = last[k];
        form.elements.microcalc.checked = !!last.microcalc;
      }
      preview();
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши'),
    ],
  });
}

function fnaDialog(ctx, nodule) {
  const { p, reload } = ctx;
  let form;
  const submit = async (close) => {
    const d = Object.fromEntries(new FormData(form));
    try {
      await api.addNoduleFna(p.id, nodule.id, { date: d.date, bethesda: d.bethesda, note: d.note });
      toast('Цитологията е записана.', 'ok');
      close();
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  modal({
    title: `Тънкоиглена биопсия — ${LOBES[nodule.lobe]}${nodule.location ? ', ' + nodule.location : ''}`,
    body: () => {
      form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() },
        h('div', null, field('Дата', input({ name: 'date', type: 'date', value: today(), max: today(), required: true }))),
        h('div', null, field('Цитология (Bethesda 2023)', select(Object.entries(BETHESDA).map(([value, b]) => ({ value, label: b.label })), { name: 'bethesda' }))),
        h('div.full', null, field('Бележка', input({ name: 'note', maxlength: 500 }))));
      return form;
    },
    actions: (close) => [
      h('button.btn', { type: 'button', onclick: () => close() }, 'Отказ'),
      h('button.btn.primary', { type: 'button', onclick: () => submit(close) }, 'Запиши'),
    ],
  });
}

/* ------------------------------ заключение за ОПЛ ------------------------------ */

const ENDO_CODES = ['dm1', 'dm2', 'prediabetes', 'hypothyroid', 'obesity', 'osteoporosis', 'dyslip'];
const ENDO_CLASSES = ['METFORMIN', 'SU', 'DPP4', 'SGLT2', 'GLP1', 'INSULIN', 'PIOGLITAZONE', 'LEVOTHYROXINE', 'ANTITHYROID', 'STATIN',
  'EZETIMIBE', 'FINERENONE', 'ACEI', 'ARB', 'BISPHOSPHONATE', 'VITD', 'CALCIUM', 'CORTICOSTEROID'];

function consultDraft(ctx, s) {
  const { p } = ctx;
  const lines = [];
  const d = s.diabetes;
  if (d?.glycemia.last) lines.push(`HbA1c ${formatLab('hba1c', d.glycemia.last.value)} (${formatDate(d.glycemia.last.date)}), цел ${d.glycemia.target.text}.`);
  if (d?.cgm) {
    const v = d.cgm.study.values;
    lines.push(`Сензор (${formatDate(d.cgm.study.date)}, ${v.days} дни): TIR ${dec(v.tir)}%, под 3,9 ${dec((v.low || 0) + (v.veryLow || 0))}%, над 10,0 ${dec((v.high || 0) + (v.veryHigh || 0))}%${v.cv ? `, CV ${dec(v.cv)}%` : ''}${d.cgm.gmi ? `, GMI ${dec(d.cgm.gmi)}%` : ''}.`);
  }
  if (d?.regimen?.tdd) lines.push(`Инсулин: обща дневна доза ${dec(d.regimen.tdd)} ед.${d.regimen.perKg ? ` (${dec(d.regimen.perKg)} ед./кг)` : ''}.`);
  if (d?.foot) lines.push(`Стъпала: IWGDF ${d.foot.cat} — ${d.foot.label}; преглед ${d.foot.every}.`);
  const t = s.thyroid;
  if (t?.tsh) lines.push(`TSH ${formatLab('tsh', t.tsh.value)}${t.ft4 !== null ? `, fT4 ${formatLab('ft4', t.ft4)}` : ''}${t.ft3 !== null ? `, fT3 ${formatLab('ft3', t.ft3)}` : ''} (${formatDate(t.tsh.date)})${t.pattern ? ` — ${t.pattern.label.toLowerCase()}` : ''}.`);
  for (const n of s.nodules.filter(x => !x.removed && x.last)) {
    lines.push(`Възел ${LOBES[n.nodule.lobe]}${n.nodule.location ? `, ${n.nodule.location}` : ''}: ${n.last.dims.join(' × ')} мм, EU-TIRADS ${n.cat}${n.bethesda ? `, Bethesda ${n.bethesda.value}` : ''} (${formatDate(n.last.date)}).`);
  }
  const rec = [];
  if (d?.basal && d.basal.kind !== 'ok' && d.basal.kind !== 'info') rec.push(d.basal.text);
  for (const row of d?.checklist || []) if (!row.ok && !row.monitoring && !row.optional) rec.push(`Обмислете ${lc(row.label)} — ${row.note}.`);
  for (const row of d?.checklist || []) if (row.monitoring && !row.ok) rec.push(`${row.label} — ${row.status === 'overdue' ? 'просрочено' : 'дължимо'}.`);
  if (t?.pattern && t.pattern.severity >= 1) rec.push(`${t.pattern.label}: ${t.pattern.text}`);
  for (const n of s.nodules.filter(x => !x.removed && ['fna', 'surgery', 'refer'].includes(x.action))) rec.push(`Възел ${LOBES[n.nodule.lobe]}: ${n.text}`);
  const follow = s.nodules.filter(x => !x.removed && x.next).map(x => x.next).sort()[0];
  if (follow) rec.push(follow <= today() ? `Контролна ехография на щитовидната жлеза — дължима от ${formatDate(follow)}` : `Контролна ехография на щитовидната жлеза до ${formatDate(follow)}`);
  return {
    ...diagnosisDraft(ctx, ENDO_CODES),
    findings: lines.join('\n'),
    treatment: therapyText(p, m => !!m.drug && ENDO_CLASSES.some(c => classesOf(m.drug).has(c))),
    recommendations: rec.join('\n'),
    nextMonths: d?.glycemia.status === 'bad' ? 3 : 6,
  };
}
