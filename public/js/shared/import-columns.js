/* Разпознаване на колоните в изтеглен списък с пациенти.
 *
 * Програмите на общопрактикуващите лекари, порталът на НЗОК и таблиците,
 * водени на ръка, наричат колоните различно — „ЕГН“, „ЕГН/ЛНЧ“,
 * „Идентификатор“; „Име“ или отделни „Име“, „Презиме“, „Фамилия“. Тук е
 * речникът на тези имена и разпознаването по съдържание, когато заглавен
 * ред липсва. Общо за сървъра и браузъра. */

import { parse as parseEgn } from './egn.js';
import { table } from './table.js';

/** Полетата, към които може да се насочи колона. `multi` — може няколко колони. */
export const TARGETS = table({
  fullName: { label: 'Име (цялото)' },
  firstName: { label: 'Собствено име' },
  middleName: { label: 'Презиме' },
  lastName: { label: 'Фамилия' },
  egn: { label: 'ЕГН / ЛНЧ' },
  birthDate: { label: 'Дата на раждане' },
  sex: { label: 'Пол' },
  phone: { label: 'Телефон', multi: true },
  address: { label: 'Адрес', multi: true },
  city: { label: 'Населено място' },
  allergies: { label: 'Алергии', multi: true },
  diagnoses: { label: 'Диагнози / МКБ', multi: true },
  notes: { label: 'Бележки', multi: true },
  doctor: { label: 'Личен лекар' },
  regDate: { label: 'Дата на регистрация' },
  contactName: { label: 'Родител / близък' },
  contactPhone: { label: 'Телефон на родител / близък' },
});

export const TARGET_ORDER = Object.keys(TARGETS);

/** Малки букви, без препинателни знаци, латинските двойници на кирилицата — кирилица. */
export function normHeader(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[._:;,()[\]{}"'„“”№#*/\\|+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Речник: точни имена (след normHeader). */
const EXACT = {
  fullName: ['име', 'имена', 'три имена', 'трите имена', 'име презиме фамилия', 'име и фамилия', 'име фамилия',
    'пациент', 'име на пациент', 'име на пациента', 'пациент име', 'имена на пациента', 'имена на пациент',
    'зол', 'име на зол', 'имена на зол', 'лице', 'name', 'full name', 'patient', 'patient name'],
  firstName: ['собствено име', 'първо име', 'first name', 'given name'],
  middleName: ['презиме', 'бащино име', 'второ име', 'middle name'],
  lastName: ['фамилия', 'фамилно име', 'фамилно', 'last name', 'surname', 'family name'],
  egn: ['егн', 'егн лнч', 'лнч', 'егн лнк', 'егн на пациента', 'егн на зол', 'егн зол', 'идентификатор',
    'личен номер', 'егн пациент', 'egn', 'pin', 'personal number'],
  birthDate: ['дата на раждане', 'роден', 'родена', 'роден а', 'роден на', 'рождена дата', 'дата раждане',
    'дата на раждане на пациента', 'рожд дата', 'др', 'birth date', 'date of birth', 'dob', 'birthdate'],
  sex: ['пол', 'sex', 'gender'],
  phone: ['телефон', 'тел', 'телефони', 'gsm', 'мобилен', 'мобилен телефон', 'телефон за връзка', 'тел за връзка',
    'телефонен номер', 'phone', 'mobile', 'telephone'],
  address: ['адрес', 'постоянен адрес', 'настоящ адрес', 'адрес по местоживеене', 'адрес за кореспонденция',
    'улица', 'ул', 'address'],
  city: ['населено място', 'град', 'село', 'нас място', 'град село', 'община', 'city', 'town'],
  allergies: ['алергии', 'алергия', 'алергична анамнеза', 'allergies', 'allergy'],
  diagnoses: ['диагнози', 'диагноза', 'мкб', 'мкб код', 'мкб 10', 'код по мкб', 'код мкб', 'мкб кодове',
    'заболявания', 'хронични заболявания', 'диспансерно наблюдение', 'диспансеризация', 'диспансерни диагнози',
    'основна диагноза', 'придружаващи заболявания', 'diagnosis', 'diagnoses', 'icd', 'icd10', 'icd 10'],
  notes: ['бележки', 'бележка', 'забележка', 'забележки', 'коментар', 'коментари', 'notes', 'note', 'comment', 'comments'],
  doctor: ['лекар', 'опл', 'личен лекар', 'общопрактикуващ лекар', 'лекар опл', 'doctor', 'gp', 'physician'],
  regDate: ['дата на регистрация', 'регистриран', 'регистриран а', 'регистрация', 'дата на записване', 'записан',
    'регистриран от', 'в листата от', 'дата на избор', 'избран на', 'дата на избор на опл'],
  contactName: ['родител', 'майка', 'баща', 'настойник', 'лице за контакт', 'име на родител', 'родител настойник',
    'близък', 'контакт'],
  contactPhone: ['телефон на родител', 'тел на родител', 'телефон на майката', 'телефон на бащата',
    'телефон на близък', 'телефон за контакт с родител'],
};

/* Съдържа се в името — проверява се, ако точно съвпадение няма. Подредено от по-конкретното. */
const CONTAINS = [
  [/(родител|майка|майк|баща|близ|контакт).*тел|тел.*(родител|майк|баща|близ)/, 'contactPhone'],
  [/егн|лнч|идентиф/, 'egn'],
  [/раждан|рожд|роден/, 'birthDate'],
  [/фамил/, 'lastName'],
  [/презиме|бащино/, 'middleName'],
  [/собствено|първо име/, 'firstName'],
  [/телефон|(?:^|\s)тел(?:$|\s)|gsm|мобил/, 'phone'],
  [/мкб|диагн|диспансер|заболяван/, 'diagnoses'],
  [/алерг/, 'allergies'],
  [/регистр|записан|избран/, 'regDate'],
  [/населено|град|село/, 'city'],
  [/адрес|улица/, 'address'],
  [/бележ|забележ|коментар/, 'notes'],
  [/(?:^|\s)пол(?:$|\s)/, 'sex'],
  [/лекар|(?:^|\s)опл(?:$|\s)/, 'doctor'],
  [/родител|настойник/, 'contactName'],
  [/име|пациент/, 'fullName'],
];

/** Към кое поле води заглавието на колоната — или null. */
export function targetForHeader(header) {
  const h = normHeader(header);
  if (!h || /^\d+$/.test(h)) return null;
  for (const [target, names] of Object.entries(EXACT)) if (names.includes(h)) return target;
  if (h.length > 60) return null;
  for (const [re, target] of CONTAINS) if (re.test(h)) return target;
  return null;
}

/* ------------------------------ по съдържание ------------------------------ */

const DATE_RE = /^(\d{1,2}[./-]\d{1,2}[./-](\d{2}|\d{4})(\s*г\.?)?|\d{4}-\d{2}-\d{2}([ T].*)?)$/;
const PHONE_RE = /^(\+?359|0)?[\s-]?[2-9][\d\s-]{6,12}$/;
// Не \b: в JavaScript той не разпознава кирилицата като букви.
const ICD_RE = /(?:^|[^A-Za-zА-Яа-я0-9])[A-ZА-Я]\s?\d{2}(?:\.\d{1,2})?(?![0-9])/;
const SEX_VALUES = new Set(['м', 'ж', 'мъж', 'жена', 'мъжки', 'женски', 'm', 'f', 'male', 'female']);

/** Какво най-вероятно съдържа колоната по стойностите ѝ. */
export function targetForValues(values) {
  const vals = values.map(v => String(v || '').trim()).filter(Boolean).slice(0, 60);
  if (vals.length < 2) return null;
  const share = (fn) => vals.filter(fn).length / vals.length;
  const digits = (v) => v.replace(/\D/g, '');
  if (share(v => /^\d{9,10}$/.test(digits(v)) && digits(v).length === v.replace(/\s/g, '').length
    && parseEgn(digits(v).padStart(10, '0'))?.valid) >= 0.6) return 'egn';
  if (share(v => DATE_RE.test(v)) >= 0.7) return 'birthDate';
  if (share(v => SEX_VALUES.has(v.toLowerCase())) >= 0.8) return 'sex';
  if (share(v => ICD_RE.test(v.toUpperCase())) >= 0.5) return 'diagnoses';
  if (share(v => PHONE_RE.test(v) && digits(v).length >= 8 && digits(v).length <= 12) >= 0.6) return 'phone';
  if (share(v => /^[А-ЯA-Z][а-яa-zА-ЯA-Z-]+(\s+[А-ЯA-Z][а-яa-zА-ЯA-Z-]+){1,3}$/.test(v)) >= 0.7) return 'fullName';
  return null;
}

/* ------------------------------ заглавен ред ------------------------------ */

/** Номерът (от 0) на заглавния ред в първите 25 реда, или -1, ако няма такъв. */
export function detectHeaderRow(rows) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i] || [];
    const targets = row.map(targetForHeader).filter(Boolean);
    const distinct = new Set(targets).size;
    // Заглавен ред има поне две познати колони и почти няма числа в клетките.
    const numeric = row.filter(v => /^\d{5,}$/.test(String(v).replace(/\s/g, ''))).length;
    const score = distinct * 2 - numeric * 3;
    if (distinct >= 2 && score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

/**
 * Предложение за съответствие колона → поле.
 * @returns {Array<string|null>} за всяка колона — полето или null (не се внася)
 */
export function guessMapping(rows, headerRow) {
  const width = Math.max(0, ...rows.slice(0, 200).map(r => r.length));
  const header = headerRow >= 0 ? rows[headerRow] || [] : [];
  const data = rows.slice(headerRow + 1, headerRow + 201);
  const mapping = [];
  for (let c = 0; c < width; c++) {
    const values = data.map(r => r[c]);
    let t = headerRow >= 0 ? targetForHeader(header[c]) : null;
    const byValues = targetForValues(values);
    // Колона „Име“ до „Презиме“ и „Фамилия“ е собственото име.
    if (!t && headerRow < 0) t = byValues;
    else if (!t && byValues === 'egn') t = 'egn';
    mapping.push(t);
  }
  const has = (t) => mapping.includes(t);
  if (has('fullName') && (has('lastName') || has('middleName')) && !has('firstName')) {
    mapping[mapping.indexOf('fullName')] = 'firstName';
  }
  // Полетата, които не са `multi`, се оставят само на първата колона.
  const seen = new Set();
  return mapping.map(t => {
    if (!t) return null;
    if (!TARGETS[t].multi && seen.has(t)) return null;
    seen.add(t);
    return t;
  });
}

/** Номер на колона като в Excel: 0 → A, 27 → AB. */
export function columnLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
