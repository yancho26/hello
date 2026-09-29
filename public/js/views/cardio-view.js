/* Раздел „Кардиология“ в досието на възрастен пациент. */

import { badge, card, empty, h, table } from '../ui/components.js';
import { trendChart } from '../ui/trend-chart.js';
import { formatDate } from '../shared/dates.js';
import { formatLab } from '../shared/labs.js';
import { studyLine } from '../shared/studies.js';
import { CARDIO_VERIFIED, HF_PILLARS, NYHA_ROMAN } from '../shared/cardio.js';
import { classesOf } from '../shared/drugs.js';
import { medLabel } from '../shared/meds.js';
import { resultsDialog } from './adult-dialogs.js';
import {
  addButtons, alertsCard, consultDialog, dec, diagnosisDraft, historyCard, pctBar, therapyText,
} from './specialty-common.js';

const KINDS = ['echo', 'ecg', 'abpm', 'hbpm', 'holter', 'nyha'];
const STATUS = {
  target: ['done', 'целева доза'], low: ['due', 'под целевата'], missing: ['overdue', 'липсва'],
  unknown: ['future', 'без числова доза'], no_target: ['future', 'без целева доза'],
};
const VERDICT = {
  ok: ['done', 'правилна доза'], low: ['overdue', 'ниска доза'], high: ['overdue', 'висока доза'],
  contra: ['overdue', 'не се препоръчва'], wrong: ['overdue', 'грешен прием'], unknown: ['future', 'непроверена'],
};

export function cardioTab(ctx) {
  const s = ctx.data.specialty?.cardio;
  if (!s) return card(null, {}, empty('Модулът „Кардиология“ не е включен.', null));
  if (s.error) return card(null, {}, empty('Данните за раздела не могат да бъдат обработени — вероятно има повреден запис. Останалите раздели работят.', '⚠️'));
  return h('div.stack', null,
    addButtons(ctx, KINDS, [
      h('button.btn.sm', { onclick: () => resultsDialog(ctx, ['ldl', 'tchol', 'hdl', 'tg', 'lpa', 'ntprobnp', 'creat', 'k']) }, '＋ Резултати'),
      h('div.grow'),
      h('button.btn.sm.primary', { onclick: () => consultDialog(ctx, 'cardio', () => consultDraft(ctx, s)) }, '＋ Преглед от раздела'),
    ]),
    h('div.overview-grid', null,
      h('div.col', null, alertsCard(s.alerts, 'Няма кардиологични сигнали.'), s.hf ? hfCard(ctx, s.hf) : null, lipidCard(ctx, s.lipids)),
      h('div.col', null, s.af ? afCard(ctx, s.af) : null, pressureCard(ctx, s.pressure), ecgCard(ctx, s.ecg), echoCard(ctx, s.echo))),
    historyCard(ctx, KINDS, 'Кардиологични изследвания'),
    h('p.tiny.muted', null,
      `Източници: ESC 2021 и 2023 за сърдечна недостатъчност (целеви дози — Таблица 8), ESC 2024 за предсърдно мъждене и за хипертония, `
      + `EHRA 2021 за НОАК, ESC/EAS 2019 и 2025 за дислипидемии, AHA/ACCF/HRS 2009 за QTc, ASE/EACVI за ехокардиографията. Сверено ${CARDIO_VERIFIED}. `
      + 'Изчисленията подпомагат, но не заменят преценката на лекаря.'));
}

/* ------------------------------ сърдечна недостатъчност ------------------------------ */

function hfCard(ctx, hf) {
  const { phenotype, therapy } = hf;
  const rows = therapy.rows.map(r => {
    const [cls, label] = STATUS[r.status];
    return h('tr' + (r.status === 'missing' ? '.attention' : ''), null,
      h('td', null, h('strong', null, HF_PILLARS[r.pillar].short), h('div.tiny.dim', null, HF_PILLARS[r.pillar].label)),
      h('td', null, r.name ? h('div', null, r.name) : h('span.dim', null, '—'),
        r.daily ? h('div.tiny.dim', null, `${dec(r.daily)} мг дневно`) : null,
        r.target ? h('div.tiny.dim', null, `цел: ${r.target}`) : null),
      h('td', { style: { minWidth: '120px' } }, badge(cls, label),
        r.pct !== undefined ? h('div', { style: { marginTop: '4px' } }, pctBar(r.pct, r.pct >= 100 ? 'var(--ok)' : r.pct >= 50 ? 'var(--warn)' : 'var(--danger)'),
          h('div.tiny.dim', null, `${r.pct}%`)) : null),
      h('td.small', null, r.next,
        r.note ? h('div.tiny', { style: { color: 'var(--warn)' } }, r.note) : null,
        r.barriers.length ? h('div.tiny', { style: { color: 'var(--danger)' } }, '⚠ ' + r.barriers.join('; ')) : null));
  });
  const bnp = hf.ntprobnp.at(-1);
  const chart = hf.efSeries.length > 1 ? trendChart({
    series: [{ label: 'ФИ', points: hf.efSeries }], unit: '%', lines: [{ value: 40, label: '40%' }, { value: 50, label: '50%' }],
  }) : null;
  return card('Сърдечна недостатъчност', { icon: '🫀', tight: true },
    h('div.body', null,
      h('div.row', { style: { flexWrap: 'wrap' } },
        phenotype ? badge(phenotype.id === 'hfref' ? 'overdue' : phenotype.id === 'hfmref' ? 'due' : 'done', phenotype.label) : badge('future', 'няма въведена ФИ'),
        phenotype ? h('span.small', null, `ФИ ${phenotype.ef}% (${formatDate(phenotype.date)})`) : null,
        hf.nyha ? h('span.small', null, `NYHA ${NYHA_ROMAN[hf.nyha]} (${formatDate(hf.nyhaDate)})`) : null,
        bnp ? h('span.small', null, `NT-proBNP ${formatLab('ntprobnp', bnp.value)} (${formatDate(bnp.date)})`) : null)),
    phenotype?.id === 'hfref' || !phenotype
      ? h('div', null, table(['Група', 'Лекарство', 'Доза', 'Следваща стъпка'], rows),
        h('div.body.tiny.muted', null, `На целева доза: ${therapy.onTarget} от 4 групи. Калий и креатинин 1–2 седмици след започване и след всяко повишаване.`))
      : null,
    hf.advice.length ? h('div.body', null, h('ul.list-plain.compact', null, hf.advice.map(t => h('li.small', null, '• ' + t)))) : null,
    chart ? h('div.body', null, h('div.chart-inline', null, chart)) : null);
}

/* -------------------------------- предсърдно мъждене -------------------------------- */

function afCard(ctx, af) {
  const c = ctx.a.calculators;
  return card('Предсърдно мъждене', { icon: '💓' },
    h('div.stack', { style: { gap: '10px' } },
      c.cha2ds2va ? h('div', null, h('strong', null, `CHA2DS2-VA: ${c.cha2ds2va.score}`),
        h('div.tiny.dim', null, c.cha2ds2va.parts.join(', ') || 'без рискови фактори'), h('div.small', null, c.cha2ds2va.advice)) : null,
      c.hasbled ? h('div', null, h('strong', null, `HAS-BLED: ${c.hasbled.score}`), h('div.small', null, c.hasbled.advice)) : null,
      af.none ? h('div.alert-strip' + ((c.cha2ds2va?.score ?? 0) >= 2 ? '' : '.info'), null, 'Не приема перорален антикоагулант.') : null,
      af.items.map(it => (it.kind === 'doac'
        ? h('div', null, h('div.row', null, h('strong', null, it.check.name), badge(...VERDICT[it.check.verdict])),
          h('div.small', null, it.check.text),
          h('div.tiny.dim', null, `Очаквана доза: ${it.check.expected}. Бъбречна функция на CrCl/10 месеца при CrCl <60 (EHRA).`))
        : h('div', null, h('strong', null, medLabel(it.med)),
          h('div.small', null, it.inr ? `INR ${dec(it.inr.value)} (${formatDate(it.inr.date)}) · цел 2,0–3,0` : 'Няма въведен INR.')))),
      af.rateText ? h('div.small', null, af.rateText) : null));
}

/* --------------------------------------- LDL --------------------------------------- */

function lipidCard(ctx, l) {
  const path = l.path;
  const rows = path ? path.steps.map((st, i) => h('tr' + (i === path.recommended ? '.selected' : ''), null,
    h('td.small', null, st.label),
    h('td.nowrap', null, `≈${dec(st.projected)} mmol/L`),
    h('td', null, st.reaches ? badge('done', 'в целта') : badge('future', 'над целта')))) : [];
  return card('LDL-холестерол и липиди', { icon: '🧈', tight: true },
    h('div.body', null,
      l.ldl ? h('div.row', { style: { flexWrap: 'wrap' } },
        h('span', { style: { fontSize: '20px', fontWeight: 700 } }, formatLab('ldl', l.ldl.value)),
        h('span.small.muted', null, formatDate(l.ldl.date)),
        l.target ? h('span.small', null, 'цел ', h('strong', null, l.target.text)) : null,
        path ? (path.atTarget ? badge('done', 'в целта') : badge('overdue', `нужни още −${path.needPct}%`)) : null)
        : h('p.small.muted', { style: { margin: 0 } }, 'Няма въведен LDL-холестерол.'),
      h('div.small', { style: { marginTop: '6px' } }, 'Сега: ', h('strong', null, path ? path.currentLabel : '—')),
      l.stale ? h('div.small', { style: { color: 'var(--warn)' } }, 'Последният LDL е отпреди повече от година.') : null,
      !l.target && l.ldl ? h('div.small.muted', null, 'Сърдечно-съдовият риск не е изчислен — целта е неизвестна (вижте „Обзор“).') : null),
    path && !path.atTarget ? h('div', null,
      h('div.path-table', null, table(['Следващ етап', 'Очакван LDL', ''], rows)),
      h('div.body.tiny.muted', null, `Изчислено от приблизителния изходен LDL ≈${dec(path.baseline)} mmol/L и средните понижения по ESC/EAS 2025 (статин с умерена интензивност ~30%, висока ~50%, + езетимиб ~60%, + PCSK9 ~75–80%). `
        + 'Индивидуалният отговор варира — LDL се изследва 4–6 седмици след всяка промяна.')) : null,
    h('div.body', null, h('div.small' + (l.lpa.level === 'high' || l.lpa.level === 'very_high' ? '.warn-text' : ''), null, l.lpa.text,
      l.lpaDate ? h('span.dim', null, ` (${formatDate(l.lpaDate)})`) : null)));
}

/* ------------------------------------ налягане ------------------------------------ */

function pressureCard(ctx, pr) {
  const office = ctx.a.vitals.bp;
  const abpm = pr.abpm;
  const home = pr.home;
  return card('Налягане извън кабинета', { icon: '🩺' },
    h('div.stack', { style: { gap: '10px' } },
      office ? h('div.small', null, `В кабинета: ${office.systolic}/${office.diastolic} mmHg (${formatDate(office.date)})`) : null,
      abpm && abpm.parts ? h('div', null,
        h('div.row', null, h('strong', null, `Холтер на налягането — ${formatDate(abpm.study.date)}`), abpm.high ? badge('overdue', 'над праговете') : badge('done', 'под праговете')),
        table(['Период', 'Средно', 'Праг', ''], abpm.parts.map(x => h('tr', null,
          h('td', null, x.label), h('td.mono', null, x.value), h('td.small.dim', null, x.limit),
          h('td', null, x.high ? badge('overdue', 'високо') : badge('done', 'добре'))))),
        abpm.dip ? h('div.small', null, `Нощен спад ${dec(abpm.dip.pct)}% — ${abpm.dip.label}.`) : null,
        abpm.nocturnal ? h('div.small', { style: { color: 'var(--warn)' } }, 'Изолирана нощна хипертония.') : null,
        abpm.phenotype ? h('div.small', { style: { fontWeight: 600 } }, abpm.phenotype) : null) : null,
      home && home.summary ? h('div', null, h('strong', null, `Домашно измерване — ${formatDate(home.study.date)}`),
        h('div.small', null, home.summary), home.warn ? h('div.tiny', { style: { color: 'var(--warn)' } }, home.warn) : null,
        home.phenotype ? h('div.small', { style: { fontWeight: 600 } }, home.phenotype) : null) : null,
      !abpm && !home ? h('p.small.muted', { style: { margin: 0 } }, 'Няма амбулаторно (Холтер) или домашно измерване. Праговете: 24 ч ≥130/80, ден ≥135/85, нощ ≥120/70, у дома ≥135/85 (ESC 2024).') : null));
}

/* --------------------------------------- ЕКГ --------------------------------------- */

function ecgCard(ctx, e) {
  if (!e) return card('ЕКГ', { icon: '📈' }, h('p.small.muted', { style: { margin: 0 } }, 'Няма въведено ЕКГ. При въведен QT се изчислява коригираният QT.'));
  const v = e.study.values;
  return card(`ЕКГ — ${formatDate(e.study.date)}`, { icon: '📈' },
    h('div.stack', { style: { gap: '6px' } },
      h('div', null, h('strong', null, e.rhythm), `, ${v.hr}/мин`, v.pr ? `, PR ${v.pr} ms` : '', v.qrs ? `, QRS ${v.qrs} ms` : '', v.lbbb ? ', ЛББ' : ''),
      e.qtc ? h('div.row', { style: { flexWrap: 'wrap' } },
        h('span', null, `QT ${v.qt} ms → QTc `, h('strong', null, `${e.qtc.fridericia} ms`), h('span.small.dim', null, ` (Fridericia) · ${e.qtc.bazett} ms (Bazett)`)),
        badge(e.assess.severity >= 3 ? 'overdue' : e.assess.severity === 2 ? 'due' : 'done', e.assess.label.replace(/^QTc \d+ ms — /, ''))) : null,
      e.qtMeds.length ? h('div.small', null, 'Удължават QT: ', e.qtMeds.map(medLabel).join(', ')) : null,
      e.warnings.map(w => h('div.small', { style: { color: 'var(--warn)' } }, '⚠ ' + w)),
      e.study.text ? h('div.small.muted', null, e.study.text) : null));
}

/* -------------------------------- ехокардиография -------------------------------- */

function echoCard(ctx, e) {
  if (!e) return card('Ехокардиография', { icon: '🔊' }, h('p.small.muted', { style: { margin: 0 } }, 'Няма въведена ехокардиография. Фракцията на изтласкване определя вида на сърдечната недостатъчност и лечението.'));
  return card(`Ехокардиография — ${formatDate(e.study.date)}`, { icon: '🔊' },
    h('div.small', null, studyLine(e.study)),
    e.flags.length ? h('ul.list-plain.compact', { style: { marginTop: '6px' } }, e.flags.map(f => h('li.small', { style: { color: 'var(--warn)' } }, '• ' + f)))
      : h('div.small', { style: { color: 'var(--ok)', marginTop: '6px' } }, 'Въведените стойности са в референтните граници.'),
    e.study.text ? h('div.small.muted', { style: { marginTop: '6px' } }, e.study.text) : null);
}

/* ------------------------------ заключение за ОПЛ ------------------------------ */

const CARDIO_CODES = ['hf', 'af', 'chd', 'htn', 'dyslip', 'pad', 'stroke'];
const CARDIO_CLASSES = ['ACEI', 'ARB', 'ARNI', 'BB', 'CCB_DHP', 'CCB_NDHP', 'THIAZIDE', 'LOOP', 'MRA', 'FINERENONE', 'NITRATE', 'STATIN',
  'EZETIMIBE', 'PCSK9', 'PCSK9_SIRNA', 'BEMPEDOIC', 'FIBRATE', 'ASPIRIN', 'P2Y12', 'VKA', 'DOAC', 'DIGOXIN', 'AMIODARONE', 'ANTIARRHYTHMIC', 'SGLT2', 'CENTRAL', 'ALPHA'];

function consultDraft(ctx, s) {
  const { a, p } = ctx;
  const lines = [];
  const bp = a.vitals.bp;
  if (bp) lines.push(`АН ${bp.systolic}/${bp.diastolic} mmHg${bp.pulse ? `, пулс ${bp.pulse}/мин` : ''} (${formatDate(bp.date)}).`);
  if (s.ecg) lines.push(`ЕКГ (${formatDate(s.ecg.study.date)}): ${s.ecg.rhythm}, ${s.ecg.study.values.hr}/мин${s.ecg.qtc ? `, QTc ${s.ecg.qtc.fridericia} ms` : ''}.`);
  if (s.echo) lines.push(`Ехокардиография (${formatDate(s.echo.study.date)}): ${studyLine(s.echo.study)}.`);
  if (s.hf?.phenotype) lines.push(`${s.hf.phenotype.label}${s.hf.nyha ? `, NYHA ${NYHA_ROMAN[s.hf.nyha]}` : ''}.`);
  const bnp = s.hf?.ntprobnp.at(-1);
  if (bnp) lines.push(`NT-proBNP ${formatLab('ntprobnp', bnp.value)} (${formatDate(bnp.date)}).`);
  if (s.pressure.abpm?.parts) lines.push(`Холтер АН (${formatDate(s.pressure.abpm.study.date)}): ${studyLine(s.pressure.abpm.study)}${s.pressure.abpm.dip ? `; нощен спад ${dec(s.pressure.abpm.dip.pct)}%` : ''}.`);
  if (s.lipids.ldl) lines.push(`LDL ${formatLab('ldl', s.lipids.ldl.value)} (${formatDate(s.lipids.ldl.date)})${s.lipids.target ? `, цел ${s.lipids.target.text}` : ''}.`);
  if (a.cv.label) lines.push(`Сърдечно-съдов риск: ${a.cv.label}${a.cv.score !== undefined && a.cv.score !== null ? ` (${dec(a.cv.score)}%)` : ''}.`);
  if (a.calculators.cha2ds2va) lines.push(`CHA2DS2-VA ${a.calculators.cha2ds2va.score}, HAS-BLED ${a.calculators.hasbled?.score ?? '—'}.`);
  const rec = [];
  for (const r of s.hf?.therapy.rows || []) if (r.status === 'missing' || r.status === 'low') rec.push(`${HF_PILLARS[r.pillar].short}: ${r.next}`);
  for (const it of s.af?.items || []) if (it.kind === 'doac' && it.check.verdict !== 'ok') rec.push(`${it.check.name}: ${it.check.text}`);
  const path = s.lipids.path;
  if (path && !path.atTarget && path.recommended >= 0) rec.push(`LDL: ${path.steps.slice(0, path.recommended + 1).map(x => x.label).join(', ')}; контрол на LDL след 4–6 седмици.`);
  for (const t of s.hf?.advice || []) rec.push(t);
  if (s.ecg?.assess && s.ecg.assess.severity >= 2) {
    rec.push(`${s.ecg.assess.label}${s.ecg.qtMeds.length ? ` — преценете ${s.ecg.qtMeds.map(medLabel).join(', ')}` : ''}; контрол на калия и магнезия.`);
  }
  if (s.pressure.abpm?.high) rec.push('Налягане над целта при амбулаторното измерване — корекция на лечението.');
  const hfAny = !!s.hf;
  return {
    ...diagnosisDraft(ctx, CARDIO_CODES),
    findings: lines.join('\n'),
    treatment: therapyText(p, m => !!m.drug && CARDIO_CLASSES.some(c => classesOf(m.drug).has(c))),
    recommendations: rec.join('\n'),
    nextMonths: hfAny && s.hf.phenotype?.id === 'hfref' ? 3 : 6,
  };
}
