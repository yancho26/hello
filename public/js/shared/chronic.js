/* Хронични заболявания и диспансерно наблюдение.
 *
 * За всяко заболяване: кои изследвания и прегледи са нужни и колко често,
 * какви са целевите стойности и напомняния за добра практика. Честотите
 * следват европейските препоръки (ESC/ESH 2024, ESC 2023 за диабет, KDIGO
 * 2024, GOLD 2025, GINA 2024, EULAR за подагра) и практиката на
 * диспансерното наблюдение при ОПЛ. Те са минимални — лекарят може да
 * изследва и по-често.
 *
 * Целите по подразбиране могат да се променят за конкретния пациент —
 * например по-свободна цел за HbA1c при крехък възрастен човек.
 */

import { addDays, addMonths, ageInMonthsExact, daysBetween, today } from './dates.js';
import { latestEgfr, latestResult, resultSeries, round } from './labs.js';
import { ckdStage } from './clinical.js';
import { table } from './table.js';

/* ------------------------------- изисквания ------------------------------- */

/**
 * Какво трябва да се направи периодично. `codes` са кодовете от labs.js
 * (изследвания и прегледи) или инструменти от mental.js (tools), които
 * „покриват“ изискването.
 */
export const REQUIREMENTS = table({
  glycemia: { name: 'Глюкоза или HbA1c', codes: ['hba1c', 'glucose'] },
  hba1c: { name: 'HbA1c', codes: ['hba1c'] },
  lipids: { name: 'Липиден профил', codes: ['ldl', 'tchol'] },
  renal: { name: 'Креатинин / eGFR', codes: ['creat', 'egfr'] },
  k: { name: 'Калий', codes: ['k'] },
  na: { name: 'Натрий', codes: ['na'] },
  uacr: { name: 'Албумин/креатинин в урина', codes: ['uacr'] },
  tsh: { name: 'TSH', codes: ['tsh'] },
  liver: { name: 'Чернодробни ензими (АЛАТ)', codes: ['alt'] },
  fib4: { name: 'АСАТ, АЛАТ и тромбоцити (FIB-4)', codes: ['ast'] },
  cbc: { name: 'Кръвна картина', codes: ['hb', 'plt', 'wbc'] },
  ferritin: { name: 'Феритин', codes: ['ferritin'] },
  b12: { name: 'Витамин B12', codes: ['b12'] },
  urate: { name: 'Пикочна киселина', codes: ['urate'] },
  inr: { name: 'INR', codes: ['inr'] },
  lithium: { name: 'Серумен литий', codes: ['lithium'] },
  ecg: { name: 'ЕКГ', codes: ['ecg'] },
  eye: { name: 'Преглед на очни дъна', codes: ['eye'] },
  foot: { name: 'Преглед на стъпалата', codes: ['foot'] },
  spiro: { name: 'Спирометрия', codes: ['spiro'] },
  inhaler: { name: 'Инхалаторна техника', codes: ['inhaler'] },
  dxa: { name: 'Костна плътност (DXA)', codes: ['dxa'] },
  phq9: { name: 'Оценка на депресията (PHQ-9)', tools: ['phq9'] },
  gad7: { name: 'Оценка на тревожността (GAD-7)', tools: ['gad7'] },
  cognition: { name: 'Когнитивна оценка', tools: ['minicog'] },
});

/* ------------------------------- заболявания ------------------------------- */

/**
 * Полета: name, icd, group, review (месеци между диспансерните прегледи),
 * needs: [[изискване, месеци]], targets: ['bp', 'hba1c', …], ascvd — атеросклеротично ССЗ,
 * vaccineRisk — показание за ваксини срещу грип, пневмококи и др. преди 65 г.,
 * tips — напомняния за добра практика.
 */
export const CONDITIONS = table({
  htn: {
    name: 'Артериална хипертония', icd: 'I10–I15', group: 'cardio', review: 6,
    needs: [['renal', 12], ['k', 12], ['lipids', 12], ['glycemia', 12], ['uacr', 12], ['ecg', 12]],
    targets: ['bp'],
    tips: [
      'Цел по ESC 2024: систолно 120–129 mmHg, ако се понася; при 85+ г. или крехкост — възможно най-ниско поносимо.',
      'Потвърждаване с домашно или амбулаторно (Холтер) измерване при съмнение за „бяла престилка“.',
      'Намаляване на солта под 5 г дневно, движение, ограничаване на алкохола.',
    ],
  },
  dm2: {
    name: 'Захарен диабет тип 2', icd: 'E11', group: 'metabolic', review: 6, vaccineRisk: true, diabetes: true,
    needs: [['hba1c', 6], ['renal', 12], ['uacr', 12], ['lipids', 12], ['eye', 12], ['foot', 12]],
    targets: ['hba1c', 'bp', 'ldl'],
    tips: [
      'HbA1c на всеки 3 месеца, докато не е в целта, после на 6 месеца.',
      'При ХБЗ или сърдечно-съдово заболяване — SGLT2-инхибитор или GLP-1 агонист с доказана полза (ESC 2023, KDIGO 2024).',
      'Годишен преглед на очни дъна и на стъпалата; обучение за хипогликемия при сулфанилурейни и инсулин.',
    ],
  },
  dm1: {
    name: 'Захарен диабет тип 1', icd: 'E10', group: 'metabolic', review: 3, vaccineRisk: true, diabetes: true,
    needs: [['hba1c', 3], ['renal', 12], ['uacr', 12], ['lipids', 12], ['tsh', 12], ['eye', 12], ['foot', 12]],
    targets: ['hba1c', 'bp', 'ldl'],
    tips: ['Съвместно проследяване с ендокринолог. Скрининг за автоимунен тиреоидит и цьолиакия.'],
  },
  prediabetes: {
    name: 'Предиабет', icd: 'R73', group: 'metabolic', review: 12,
    needs: [['glycemia', 12], ['lipids', 12]],
    targets: [],
    tips: ['Промени в начина на живот намаляват риска от диабет с около 58% (DPP). Цел — 5–7% загуба на тегло.'],
  },
  dyslip: {
    name: 'Дислипидемия', icd: 'E78', group: 'metabolic', review: 12,
    needs: [['lipids', 12], ['liver', 12]],
    targets: ['ldl'],
    tips: ['Липиди 8 (±4) седмици след започване или промяна на лечението, после ежегодно.'],
  },
  chd: {
    name: 'Исхемична болест на сърцето', icd: 'I20–I25', group: 'cardio', review: 6, vaccineRisk: true, ascvd: true,
    needs: [['lipids', 12], ['renal', 12], ['glycemia', 12], ['ecg', 12]],
    targets: ['ldl', 'bp'],
    tips: ['Антиагрегант и статин при всички без противопоказания. LDL <1,4 mmol/L.'],
  },
  pad: {
    name: 'Периферна артериална болест', icd: 'I70.2, I73.9', group: 'cardio', review: 6, ascvd: true,
    needs: [['lipids', 12], ['renal', 12], ['glycemia', 12]],
    targets: ['ldl', 'bp'],
    tips: ['Спиране на тютюнопушенето и структурирано ходене. Статин и антиагрегант.'],
  },
  stroke: {
    name: 'Преживян инсулт / ТИА', icd: 'I63, I69, G45', group: 'neuro', review: 6, vaccineRisk: true, ascvd: true,
    needs: [['lipids', 12], ['glycemia', 12], ['renal', 12], ['ecg', 12]],
    targets: ['bp', 'ldl'],
    tips: ['Търсене на предсърдно мъждене. Вторична профилактика: антитромботично лечение, статин, контрол на налягането.'],
  },
  hf: {
    name: 'Сърдечна недостатъчност', icd: 'I50', group: 'cardio', review: 3, vaccineRisk: true,
    needs: [['renal', 6], ['k', 6], ['na', 6], ['cbc', 12], ['ecg', 12]],
    targets: ['bp'],
    tips: [
      'При намалена фракция на изтласкване — четирите групи с доказана полза: ACEi/ARB/ARNI, бета-блокер, MRA, SGLT2-инхибитор.',
      'Ежедневно тегло: наддаване >2 кг за 3 дни — сигнал за задръжка на течности.',
      'Избягване на НСПВС, недихидропиридинови калциеви антагонисти и пиоглитазон.',
    ],
  },
  af: {
    name: 'Предсърдно мъждене', icd: 'I48', group: 'cardio', review: 6,
    needs: [['renal', 12], ['cbc', 12], ['tsh', 12], ['ecg', 12]],
    targets: ['bp'],
    tips: ['Оценка на CHA2DS2-VA и HAS-BLED. При НОАК — бъбречна функция поне веднъж годишно (при CrCl <60 — по-често).'],
  },
  ckd: {
    name: 'Хронично бъбречно заболяване', icd: 'N18', group: 'renal', review: 6, vaccineRisk: true,
    needs: [['renal', 12], ['uacr', 12], ['k', 12], ['cbc', 12]],
    targets: ['bp', 'egfr', 'uacr'],
    tips: [
      'Честотата на eGFR и UACR се определя по таблицата на KDIGO (1–4 пъти годишно).',
      'ACEi/ARB при албуминурия, SGLT2-инхибитор при eGFR ≥20 (KDIGO 2024). Избягване на НСПВС.',
      'Насочване към нефролог при eGFR <30, UACR >30 mg/mmol или бърз спад на eGFR.',
    ],
  },
  copd: {
    name: 'ХОББ', icd: 'J44', group: 'resp', review: 6, vaccineRisk: true,
    needs: [['spiro', 12], ['inhaler', 12]],
    targets: [],
    tips: ['Спиране на тютюнопушенето. Ваксини: грип, пневмококи, РСВ (60+), COVID-19, Tdap. Белодробна рехабилитация.'],
  },
  asthma: {
    name: 'Бронхиална астма', icd: 'J45', group: 'resp', review: 6, vaccineRisk: true,
    needs: [['inhaler', 12], ['spiro', 12]],
    targets: [],
    tips: ['GINA 2024: не се лекува само с бързодействащ бета-агонист — предпочита се ИКС-формотерол при нужда или поддържащо.'],
  },
  hypothyroid: {
    name: 'Хипотиреоидизъм', icd: 'E03', group: 'endo', review: 12,
    needs: [['tsh', 12]],
    targets: ['tsh'],
    tips: ['TSH 6–8 седмици след промяна на дозата, после ежегодно. Левотироксин на гладно, 30–60 мин преди закуска.'],
  },
  obesity: {
    name: 'Затлъстяване', icd: 'E66', group: 'metabolic', review: 6,
    needs: [['glycemia', 12], ['lipids', 12], ['liver', 12]],
    targets: ['weight'],
    tips: ['Загуба на 5–10% от теглото намалява значимо метаболитния риск. При ИТМ ≥30 (≥27 с усложнения) — обмисляне на медикаментозно лечение.'],
  },
  gout: {
    name: 'Подагра', icd: 'M10', group: 'musculo', review: 6,
    needs: [['urate', 6], ['renal', 12]],
    targets: ['urate'],
    tips: ['Цел пикочна киселина <360 µmol/L, при тофи <300 (EULAR). Алопуринол с постепенно покачване на дозата.'],
  },
  osteoporosis: {
    name: 'Остеопороза', icd: 'M80–M81', group: 'musculo', review: 12,
    needs: [['dxa', 24]],
    targets: [],
    tips: ['Калций (от храна) и витамин D; оценка на риска от падане; повторна оценка на лечението с бифосфонат след 3–5 години.'],
  },
  depression: {
    name: 'Депресия', icd: 'F32–F33', group: 'mental', review: 3,
    needs: [['phq9', 3]],
    targets: ['phq9'],
    tips: [
      'PHQ-9 на 4–6 седмици в началото на лечението: отговор — спад ≥50%, ремисия — под 5 точки.',
      'Лечението продължава поне 6 месеца след ремисия. Винаги питайте за мисли за самонараняване.',
    ],
  },
  anxiety: {
    name: 'Тревожно разстройство', icd: 'F41', group: 'mental', review: 3,
    needs: [['gad7', 3]],
    targets: ['gad7'],
    tips: ['GAD-7 за проследяване на отговора. Психотерапия (КПТ) е първа линия наравно със SSRI/SNRI.'],
  },
  dementia: {
    name: 'Деменция', icd: 'F00–F03, G30', group: 'neuro', review: 6,
    needs: [['cognition', 12]],
    targets: [],
    tips: ['Преглед на лекарствата за антихолинергично натоварване. Подкрепа за полагащия грижи. Безопасност и шофиране.'],
  },
  masld: {
    name: 'Стеатозна чернодробна болест (MASLD)', icd: 'K76.0', group: 'gi', review: 12,
    needs: [['liver', 12], ['fib4', 12], ['glycemia', 12], ['lipids', 12]],
    targets: [],
    tips: ['FIB-4 на 1–3 години. Загуба на 7–10% от теглото подобрява стеатозата и фиброзата.'],
  },
  anemia: {
    name: 'Желязодефицитна анемия', icd: 'D50', group: 'blood', review: 3,
    needs: [['cbc', 3], ['ferritin', 3]],
    targets: [],
    tips: ['Търсене на причината (кървене от ГИТ при мъже и жени след менопауза). Желязо през ден се усвоява по-добре.'],
  },
});

export const CONDITION_GROUPS = table({
  cardio: 'Сърдечно-съдови', metabolic: 'Метаболитни', renal: 'Бъбречни', resp: 'Дихателни',
  endo: 'Ендокринни', mental: 'Психично здраве', neuro: 'Неврологични', musculo: 'Опорно-двигателни',
  gi: 'Храносмилателни', blood: 'Кръв',
});

/** Основният показател за контрол на всяко заболяване — за регистъра в справките. */
export const PRIMARY_TARGET = table({
  htn: 'bp', dm2: 'hba1c', dm1: 'hba1c', dyslip: 'ldl', chd: 'ldl', pad: 'ldl', stroke: 'ldl',
  hf: 'bp', af: 'bp', ckd: 'ckd', hypothyroid: 'tsh', obesity: 'weight', gout: 'urate',
  depression: 'phq9', anxiety: 'gad7',
});

export const activeConditions = (patient) =>
  (patient.chronic || []).filter(c => c.status !== 'resolved' && CONDITIONS[c.code]);

export const hasCondition = (patient, code) => activeConditions(patient).some(c => c.code === code);

export const hasDiabetes = (patient) => activeConditions(patient).some(c => CONDITIONS[c.code].diabetes);
export const hasAscvd = (patient) => activeConditions(patient).some(c => CONDITIONS[c.code].ascvd);

/** Има ли заболяване, което е показание за ваксини преди 65 г. — и откога. */
export function vaccineRiskSince(patient) {
  const list = activeConditions(patient).filter(c => CONDITIONS[c.code].vaccineRisk);
  if (!list.length) return null;
  const dates = list.map(c => c.since || (patient.createdAt || '').slice(0, 10) || today());
  return dates.sort()[0];
}

/* ------------------------------ жизнени показатели ------------------------------ */

/** Последното измерено налягане (средно от измерванията в последния ден с измерване). */
export function latestBp(patient) {
  const withBp = (patient.measurements || []).filter(m => m.systolic && m.diastolic)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!withBp.length) return null;
  const lastDate = withBp[withBp.length - 1].date;
  const same = withBp.filter(m => m.date === lastDate);
  const avg = (k) => Math.round(same.reduce((s, m) => s + m[k], 0) / same.length);
  return { date: lastDate, systolic: avg('systolic'), diastolic: avg('diastolic'), pulse: same[same.length - 1].pulse || null };
}

export function latestMeasure(patient, field) {
  const list = (patient.measurements || []).filter(m => Number.isFinite(m[field]))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return list.length ? { date: list[list.length - 1].date, value: list[list.length - 1][field] } : null;
}

/* ---------------------------------- цели ---------------------------------- */

const ageYears = (patient, asOf) => ageInMonthsExact(patient.birthDate, asOf) / 12;

/** Цел за налягането: собствена, ако е зададена, иначе по ESC 2024. */
export function bpTarget(patient, asOf = today()) {
  const own = activeConditions(patient).map(c => c.targets && c.targets.bp).find(Boolean);
  if (own) {
    const [s, d] = String(own).split('/').map(Number);
    if (s > 0 && d > 0) return { sys: s, dia: d, text: `<${s}/${d} (индивидуална)` };
  }
  if (ageYears(patient, asOf) >= 85) return { sys: 140, dia: 90, text: '<140/90 (85+ г.)' };
  return { sys: 130, dia: 80, text: '<130/80' };
}

/** Цел за HbA1c (%): собствена или по възраст (ADA/ESC — индивидуализирано). */
export function hba1cTarget(patient, asOf = today()) {
  const own = activeConditions(patient).map(c => c.targets && Number(c.targets.hba1c)).find(v => v > 0);
  if (own) return { value: own, text: `<${String(own).replace('.', ',')}% (индивидуална)` };
  const age = ageYears(patient, asOf);
  if (age >= 80) return { value: 8.0, text: '<8,0% (80+ г.)' };
  if (age >= 70) return { value: 7.5, text: '<7,5% (70+ г.)' };
  return { value: 7.0, text: '<7,0%' };
}

const status = (ok, near) => (ok ? 'ok' : near ? 'partial' : 'bad');

/**
 * Оценка на контрола по целите на активните заболявания.
 * @param {object} ctx  { ldlTarget } — целевият LDL идва от оценката на риска (adult.js)
 */
export function controlStatus(patient, ctx = {}, asOf = today()) {
  const wanted = new Set(activeConditions(patient).flatMap(c => CONDITIONS[c.code].targets));
  const out = [];
  const results = patient.results || [];

  if (wanted.has('bp')) {
    const bp = latestBp(patient);
    const t = bpTarget(patient, asOf);
    out.push({
      id: 'bp', label: 'Кръвно налягане', target: t.text,
      value: bp ? `${bp.systolic}/${bp.diastolic}` : null, date: bp ? bp.date : null,
      status: bp ? status(bp.systolic < t.sys && bp.diastolic < t.dia, bp.systolic < 140 && bp.diastolic < 90) : 'unknown',
    });
  }
  if (wanted.has('hba1c')) {
    const r = latestResult(results, 'hba1c');
    const t = hba1cTarget(patient, asOf);
    out.push({
      id: 'hba1c', label: 'HbA1c', target: t.text,
      value: r ? `${String(round(r.value, 1)).replace('.', ',')}%` : null, date: r ? r.date : null,
      status: r ? status(r.value < t.value, r.value < t.value + 1) : 'unknown',
    });
  }
  if (wanted.has('ldl') && ctx.ldlTarget) {
    const r = latestResult(results, 'ldl');
    out.push({
      id: 'ldl', label: 'LDL-холестерол', target: ctx.ldlTarget.text,
      value: r ? `${String(round(r.value, 2)).replace('.', ',')} mmol/L` : null, date: r ? r.date : null,
      status: r ? status(r.value < ctx.ldlTarget.value, r.value < ctx.ldlTarget.value * 1.3) : 'unknown',
    });
  }
  if (wanted.has('tsh')) {
    const r = latestResult(results, 'tsh');
    out.push({
      id: 'tsh', label: 'TSH', target: '0,4–4,0 mIU/L',
      value: r ? `${String(round(r.value, 2)).replace('.', ',')} mIU/L` : null, date: r ? r.date : null,
      status: r ? status(r.value >= 0.4 && r.value <= 4.0, r.value >= 0.1 && r.value <= 10) : 'unknown',
    });
  }
  if (wanted.has('urate')) {
    const r = latestResult(results, 'urate');
    out.push({
      id: 'urate', label: 'Пикочна киселина', target: '<360 µmol/L',
      value: r ? `${Math.round(r.value)} µmol/L` : null, date: r ? r.date : null,
      status: r ? status(r.value < 360, r.value < 420) : 'unknown',
    });
  }
  if (wanted.has('egfr') || wanted.has('uacr')) {
    const e = latestEgfr(patient);
    const u = latestResult(results, 'uacr');
    const stage = e ? ckdStage(e.value, u ? u.value : null) : null;
    out.push({
      id: 'ckd', label: 'Бъбречна функция', target: 'стабилна eGFR, UACR <3 mg/mmol',
      value: stage ? `eGFR ${e.value} · ${stage.label}` : null, date: e ? e.date : null,
      status: !stage ? 'unknown' : stage.risk === 'very_high' ? 'bad' : stage.risk === 'high' ? 'partial' : 'ok',
    });
  }
  if (wanted.has('weight')) {
    const series = (patient.measurements || []).filter(m => m.weight).sort((a, b) => (a.date < b.date ? -1 : 1));
    const since = activeConditions(patient).find(c => c.code === 'obesity')?.since;
    const base = series.find(m => !since || m.date >= since) || series[0];
    const last = series[series.length - 1];
    const change = base && last && base !== last ? ((last.weight - base.weight) / base.weight) * 100 : null;
    out.push({
      id: 'weight', label: 'Тегло', target: 'загуба ≥5% от изходното',
      value: last ? `${String(last.weight).replace('.', ',')} кг${change !== null ? ` (${change > 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}%)` : ''}` : null,
      date: last ? last.date : null,
      status: change === null ? 'unknown' : status(change <= -5, change < 0),
    });
  }
  for (const tool of ['phq9', 'gad7']) {
    if (!wanted.has(tool)) continue;
    const list = (patient.assessments || []).filter(a => a.tool === tool).sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = list[list.length - 1];
    const first = list[0];
    const remission = tool === 'phq9' ? 5 : 5;
    const response = last && first && first !== last && last.score <= first.score / 2;
    out.push({
      id: tool, label: tool === 'phq9' ? 'PHQ-9' : 'GAD-7', target: `ремисия <${remission} т.`,
      value: last ? `${last.score} т.` : null, date: last ? last.date : null,
      status: !last ? 'unknown' : status(last.score < remission, response),
    });
  }
  return out;
}

/* ------------------------------- проследяване ------------------------------- */

const GRACE_DAYS = 30;

/** Датата на последното изпълнение на изискване (резултат, преглед или скала). */
export function lastDone(patient, reqId) {
  const req = REQUIREMENTS[reqId];
  if (!req) return null;
  let last = null;
  for (const code of req.codes || []) {
    const r = latestResult(patient.results, code);
    if (r && (!last || r.date > last)) last = r.date;
  }
  for (const tool of req.tools || []) {
    for (const a of patient.assessments || []) {
      if (a.tool === tool && (!last || a.date > last)) last = a.date;
    }
  }
  // Структурираните изследвания на специалиста (ЕКГ, ехокардиография, преглед на стъпалата).
  for (const s of patient.studies || []) {
    if ((req.codes || []).includes(s.kind) && (!last || s.date > last)) last = s.date;
  }
  return last;
}

/**
 * Какво предстои по диспансерното наблюдение: изследвания, прегледи и
 * контролни посещения. `extra` добавя изисквания от лекарствата
 * (виж meds.js) във вид [{ req, months, reason }].
 */
export function monitoringTasks(patient, { asOf = today(), horizonDays = 30, extra = [] } = {}) {
  const conditions = activeConditions(patient);
  const registered = (patient.createdAt || '').slice(0, 10) || asOf;
  /* Проследяването започва от по-късната от: поставянето на диагнозата,
   * регистрацията и въвеждането на заболяването в програмата. Диабет от 2015 г.,
   * въведен днес, прави HbA1c дължим сега — не „просрочен с 9 години“. */
  const latest = (...dates) => dates.filter(Boolean).sort().pop();
  const added = (x) => (x.addedAt || '').slice(0, 10);
  const wanted = new Map(); // req → { months, reasons, start }

  const add = (req, months, reason, start) => {
    const cur = wanted.get(req);
    if (!cur) wanted.set(req, { months, reasons: [reason], start });
    else {
      cur.months = Math.min(cur.months, months);
      if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
      if (start < cur.start) cur.start = start;
    }
  };

  for (const c of conditions) {
    const def = CONDITIONS[c.code];
    const start = latest(c.since, registered, added(c));
    for (const [req, months] of def.needs) add(req, months, def.name, start);
  }

  // ХБЗ: честота на eGFR и UACR по таблицата на KDIGO.
  if (conditions.some(c => c.code === 'ckd')) {
    const e = latestEgfr(patient);
    const u = latestResult(patient.results, 'uacr');
    const stage = e ? ckdStage(e.value, u ? u.value : null) : null;
    if (stage && stage.perYear) {
      const months = Math.max(3, Math.round(12 / stage.perYear));
      const ckdStart = latest(registered, added(conditions.find(c => c.code === 'ckd')));
      add('renal', months, `ХБЗ ${stage.label}`, ckdStart);
      add('uacr', months, `ХБЗ ${stage.label}`, ckdStart);
    }
  }

  for (const x of extra) add(x.req, x.months, x.reason, latest(x.start, registered, x.added));

  // При внасяне от друга програма досегашното проследяване може да се приеме за
  // направено към датата на внасяне — тогава срокът тече от нея.
  const baseline = patient.importBaseline || null;
  const assumedFor = (start) => (baseline && baseline >= start ? baseline : null);

  const tasks = [];
  for (const [req, w] of wanted) {
    const last = lastDone(patient, req);
    const assumed = last ? null : assumedFor(w.start);
    const due = last ? addMonths(last, w.months) : assumed ? addMonths(assumed, w.months) : w.start;
    const graceEnd = addDays(due, GRACE_DAYS);
    const status = due > asOf
      ? (daysBetween(asOf, due) <= horizonDays ? 'soon' : 'future')
      : asOf <= graceEnd ? 'due' : 'overdue';
    tasks.push({
      id: 'mon:' + req, req, name: REQUIREMENTS[req].name, reasons: w.reasons, months: w.months,
      last, assumed, due, status, group: 'monitoring',
      overdueDays: due <= asOf ? daysBetween(due, asOf) : 0,
    });
  }

  // Контролен (диспансерен) преглед — по най-честата схема от заболяванията.
  if (conditions.length) {
    const months = Math.min(...conditions.map(c => CONDITIONS[c.code].review));
    const visits = (patient.visits || []).filter(v => /диспансер|контрол/i.test(v.type || ''))
      .map(v => v.date).sort();
    const last = visits[visits.length - 1] || null;
    const start = latest(...conditions.map(c => c.since), registered,
      conditions.map(added).filter(Boolean).sort()[0]);
    const assumed = last ? null : assumedFor(start);
    const due = last ? addMonths(last, months) : assumed ? addMonths(assumed, months) : start;
    const status = due > asOf
      ? (daysBetween(asOf, due) <= horizonDays ? 'soon' : 'future')
      : asOf <= addDays(due, GRACE_DAYS) ? 'due' : 'overdue';
    tasks.push({
      id: 'mon:review', req: 'review', name: 'Диспансерен преглед', months, last, assumed, due, status,
      reasons: conditions.map(c => CONDITIONS[c.code].name), group: 'monitoring',
      overdueDays: due <= asOf ? daysBetween(due, asOf) : 0,
    });
  }

  const order = { overdue: 0, due: 1, soon: 2, future: 3 };
  return tasks.sort((a, b) => order[a.status] - order[b.status] || (a.due < b.due ? -1 : 1));
}

/** Кратък преглед на тенденцията при числово изследване (за подсказки). */
export function trend(results, code) {
  const s = resultSeries(results, code);
  if (s.length < 2) return null;
  const a = s[s.length - 2], b = s[s.length - 1];
  return { from: a.value, to: b.value, change: b.value - a.value, pct: a.value ? ((b.value - a.value) / a.value) * 100 : null };
}
