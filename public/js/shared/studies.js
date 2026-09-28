/* Изследвания и оценки на специалиста — видове, полета и проверка.
 *
 * Описанието е общо за сървъра (проверка на въведеното) и за браузъра
 * (диалозите за въвеждане се строят от него). Всеки запис в досието е
 * { id, date, kind, values: { поле: число | текст | да/не }, text }.
 */

import { table } from './table.js';

const num = (key, label, unit, min, max, extra = {}) => ({ key, label, unit, type: 'num', min, max, decimals: 0, ...extra });
const bool = (key, label, extra = {}) => ({ key, label, type: 'bool', ...extra });
const choice = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

export const STUDY_KINDS = table({
  /* ------------------------------ кардиология ------------------------------ */
  echo: {
    module: 'cardio', name: 'Ехокардиография', short: 'Ехо КГ',
    fields: [
      num('ef', 'Фракция на изтласкване', '%', 5, 85, { required: true, short: 'ФИ' }),
      num('lvedd', 'ЛК — теледиастолен диаметър', 'мм', 20, 100, { short: 'ТДД' }),
      num('ivs', 'Междукамерен септум', 'мм', 3, 40, { short: 'МКС' }),
      num('lavi', 'Индекс на обема на ЛП', 'мл/м²', 5, 250, { short: 'LAVI' }),
      num('ee', "E/e' (средно)", '', 1, 60, { decimals: 1, short: "E/e'" }),
      num('trv', 'Скорост на трикуспидалната регургитация', 'м/с', 0.5, 7, { decimals: 1, short: 'TR' }),
      num('tapse', 'TAPSE', 'мм', 3, 45, { short: 'TAPSE' }),
      num('spap', 'Систолно налягане в белодробната артерия', 'mmHg', 5, 160, { short: 'СНБА' }),
    ],
  },
  ecg: {
    module: 'cardio', name: 'ЕКГ', short: 'ЕКГ',
    fields: [
      choice('rhythm', 'Ритъм', [['sinus', 'синусов'], ['af', 'предсърдно мъждене'], ['flutter', 'предсърдно трептене'], ['paced', 'пейсмейкърен'], ['other', 'друг']], { required: true }),
      num('hr', 'Сърдечна честота', '/мин', 20, 250, { required: true, short: 'ЧСЧ' }),
      num('pr', 'PR интервал', 'ms', 60, 600, { short: 'PR' }),
      num('qrs', 'QRS', 'ms', 40, 250, { short: 'QRS' }),
      num('qt', 'QT интервал (измерен)', 'ms', 200, 700, { short: 'QT' }),
      bool('lbbb', 'Ляв бедрен блок'),
    ],
  },
  abpm: {
    module: 'cardio', name: 'Амбулаторно налягане (Холтер)', short: 'Холтер АН',
    fields: [
      num('sys24', '24 ч — систолно', 'mmHg', 60, 260, { required: true }),
      num('dia24', '24 ч — диастолно', 'mmHg', 30, 160, { required: true }),
      num('sysDay', 'Ден — систолно', 'mmHg', 60, 260),
      num('diaDay', 'Ден — диастолно', 'mmHg', 30, 160),
      num('sysNight', 'Нощ — систолно', 'mmHg', 50, 260),
      num('diaNight', 'Нощ — диастолно', 'mmHg', 25, 160),
      num('valid', 'Валидни измервания', '%', 0, 100, { short: 'валидни' }),
    ],
  },
  hbpm: {
    module: 'cardio', name: 'Домашно налягане (средно)', short: 'Домашно АН',
    fields: [
      num('sys', 'Систолно (средно)', 'mmHg', 60, 260, { required: true }),
      num('dia', 'Диастолно (средно)', 'mmHg', 30, 160, { required: true }),
      num('pulse', 'Пулс (средно)', '/мин', 20, 250),
      num('days', 'Брой дни на измерване', '', 1, 60),
    ],
  },
  holter: {
    module: 'cardio', name: 'ЕКГ Холтер', short: 'ЕКГ Холтер',
    fields: [
      num('hrMin', 'Минимална честота', '/мин', 15, 200, { short: 'мин.' }),
      num('hrMean', 'Средна честота', '/мин', 20, 220, { short: 'средна' }),
      num('hrMax', 'Максимална честота', '/мин', 30, 300, { short: 'макс.' }),
      num('vpb', 'Камерни екстрасистоли (брой)', '', 0, 300000, { short: 'КЕС' }),
      num('svpb', 'Надкамерни екстрасистоли (брой)', '', 0, 300000, { short: 'НКЕС' }),
      num('pauses', 'Паузи над 2,5 s (брой)', '', 0, 10000, { short: 'паузи >2,5 s', hideZero: true }),
      bool('af', 'Епизоди на предсърдно мъждене/трептене'),
      bool('nsvt', 'Неустойчива камерна тахикардия'),
    ],
  },
  nyha: {
    module: 'cardio', name: 'Функционален клас NYHA', short: 'NYHA',
    fields: [
      choice('nyha', 'Клас', [[1, 'I — без ограничение'], [2, 'II — леко ограничение'], [3, 'III — значително ограничение'], [4, 'IV — симптоми в покой']], { required: true, numeric: true }),
    ],
  },

  /* ----------------------------- ендокринология ----------------------------- */
  cgm: {
    module: 'endo', name: 'Сензор за глюкоза (CGM)', short: 'CGM',
    fields: [
      num('days', 'Период', 'дни', 1, 90, { required: true, short: 'период' }),
      num('active', 'Активен сензор', '%', 0, 100, { short: 'активен' }),
      num('tir', 'В целевия диапазон 3,9–10,0', '%', 0, 100, { required: true, decimals: 1, short: 'TIR' }),
      num('low', 'Ниска 3,0–3,8', '%', 0, 100, { decimals: 1, short: '3,0–3,8' }),
      num('veryLow', 'Много ниска <3,0', '%', 0, 100, { decimals: 1, short: '<3,0' }),
      num('high', 'Висока 10,1–13,9', '%', 0, 100, { decimals: 1, short: '10,1–13,9' }),
      num('veryHigh', 'Много висока >13,9', '%', 0, 100, { decimals: 1, short: '>13,9' }),
      num('mean', 'Средна глюкоза', 'mmol/L', 2, 30, { decimals: 1, short: 'средна' }),
      num('cv', 'Вариабилност (CV)', '%', 5, 90, { decimals: 1, short: 'CV' }),
      num('gmi', 'GMI', '%', 4, 15, { decimals: 1, short: 'GMI' }),
    ],
  },
  smbg: {
    module: 'endo', name: 'Самоконтрол с глюкомер', short: 'Самоконтрол',
    fields: [
      num('days', 'Период', 'дни', 1, 90, { short: 'период' }),
      num('fasting', 'Средна на гладно', 'mmol/L', 1.5, 35, { decimals: 1, short: 'на гладно' }),
      num('post', 'Средна 1–2 ч след хранене', 'mmol/L', 1.5, 35, { decimals: 1, short: 'след хранене' }),
      num('hypo', 'Хипогликемии под 3,9 (брой)', '', 0, 500, { short: 'хипогликемии' }),
      num('hypo2', 'от тях под 3,0 (брой)', '', 0, 500, { short: 'под 3,0', hideZero: true }),
      num('severe', 'Тежки — с чужда помощ (брой)', '', 0, 100, { short: 'тежки', hideZero: true }),
    ],
  },
  foot: {
    module: 'endo', name: 'Преглед на стъпалата (IWGDF)', short: 'Стъпала',
    fields: [
      bool('lops', 'Загубена защитна сетивност (монофиламент 10 g)'),
      bool('pad', 'Периферна артериална болест (липсващи пулсации, ГПИ <0,9)'),
      bool('deformity', 'Деформация на стъпалото'),
      bool('ulcerHistory', 'Прекарана язва на стъпалото'),
      bool('amputation', 'Ампутация (малка или голяма)'),
      bool('esrd', 'Терминална бъбречна недостатъчност'),
      bool('ulcer', 'Активна язва сега'),
    ],
  },
});

export const STUDY_TEXT_MAX = 1000;

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Проверява и нормализира стойностите за даден вид. Връща { values } или
 * { error } — съобщение на български за лекаря.
 */
export function validateStudy(kind, raw) {
  const def = STUDY_KINDS[kind];
  if (!def) return { error: 'Непознат вид изследване.' };
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const values = {};
  for (const f of def.fields) {
    const v = src[f.key];
    const empty = v === undefined || v === null || v === '';
    if (f.type === 'bool') { values[f.key] = v === true || v === 'on' || v === 'true' || v === 1; continue; }
    if (empty) {
      if (f.required) return { error: `Полето „${f.label}“ е задължително.` };
      continue;
    }
    if (typeof v === 'object') return { error: `Полето „${f.label}“ има неправилен вид.` };
    if (f.type === 'select') {
      const opt = f.options.find(([value]) => String(value) === String(v));
      if (!opt) return { error: `Непозната стойност за „${f.label}“.` };
      values[f.key] = opt[0];
      continue;
    }
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) return { error: `„${f.label}“ трябва да е число.` };
    if (n < f.min || n > f.max) return { error: `„${f.label}“ е извън допустимите граници (${f.min}–${f.max}).` };
    values[f.key] = round(n, f.decimals ?? 0);
  }
  if (kind === 'abpm' || kind === 'hbpm') {
    const pairs = kind === 'abpm' ? [['sys24', 'dia24'], ['sysDay', 'diaDay'], ['sysNight', 'diaNight']] : [['sys', 'dia']];
    for (const [s, d] of pairs) {
      if ((values[s] === undefined) !== (values[d] === undefined)) return { error: 'Въведете и систолното, и диастолното налягане.' };
      if (values[s] !== undefined && values[s] <= values[d]) return { error: 'Систолното налягане трябва да е по-високо от диастолното.' };
    }
  }
  if (kind === 'cgm') {
    const sum = ['tir', 'low', 'veryLow', 'high', 'veryHigh'].reduce((a, k) => a + (values[k] || 0), 0);
    if (sum > 101) return { error: 'Сборът от времената в отделните диапазони надхвърля 100%.' };
  }
  if (kind === 'smbg' && values.hypo2 > (values.hypo ?? Infinity)) {
    return { error: 'Хипогликемиите под 3,0 са част от тези под 3,9 — не може да са повече от тях.' };
  }
  return { values };
}

const dec = (v) => String(v).replace('.', ',');

/** Кратък текст за списъци: „ФИ 35% · ТДД 62 мм · …“. */
export function studyLine(study) {
  const def = STUDY_KINDS[study.kind];
  if (!def) return '';
  const v = study.values || {};
  const out = [];
  if (study.kind === 'abpm') {
    if (v.sys24) out.push(`24 ч ${v.sys24}/${v.dia24}`);
    if (v.sysDay) out.push(`ден ${v.sysDay}/${v.diaDay}`);
    if (v.sysNight) out.push(`нощ ${v.sysNight}/${v.diaNight}`);
    return out.join(' · ');
  }
  if (study.kind === 'hbpm') return `${v.sys}/${v.dia}${v.days ? ` · ${v.days} дни` : ''}`;
  for (const f of def.fields) {
    const val = v[f.key];
    if (val === undefined || val === null || val === false) continue;
    if (f.hideZero && val === 0) continue;
    if (f.type === 'bool') { out.push(f.label[0].toLowerCase() + f.label.slice(1)); continue; }
    if (f.type === 'select') { out.push(f.options.find(o => o[0] === val)?.[1] || String(val)); continue; }
    out.push(`${f.short || f.label} ${dec(val)}${f.unit ? (f.unit === '%' ? '%' : ' ' + f.unit) : ''}`);
  }
  return out.join(' · ');
}

export const studiesOf = (module) => Object.entries(STUDY_KINDS).filter(([, d]) => d.module === module).map(([id]) => id);
