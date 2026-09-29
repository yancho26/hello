/* Внасяне на пациенти от таблица: проверка на всеки ред, съвпадение с вече
 * въведените пациенти и самото записване.
 *
 * Проверката е „на сухо“ — връща какво ще стане с всеки ред, без да променя
 * нищо. Записването минава през същата проверка, за да няма разлика между
 * прегледа и резултата. */

import { parse as parseEgn } from '../../public/js/shared/egn.js';
import { TARGETS } from '../../public/js/shared/import-columns.js';
import { parseDiagnoses } from '../../public/js/shared/icd.js';
import { CONDITIONS } from '../../public/js/shared/chronic.js';
import { computePlan } from '../../public/js/shared/schedule.js';
import { today } from '../../public/js/shared/dates.js';
import { excelSerialToISO } from './cells.js';

export const MAX_IMPORT_ROWS = 20000;

/* --------------------------------- стойности --------------------------------- */

const pad2 = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Дата от клетка: 14.03.1958, 14.3.1958 г., 1958-03-14, 14/03/1958, 14.03.58
 * или пореден ден от Excel (21258). Връща { iso, warning } или null.
 */
export function parseDateValue(value, asOf = today()) {
  const v = String(value || '').trim().replace(/\s*г\.?$/i, '');
  if (!v) return null;
  let y, m, d, warning = null;
  let mt;
  if ((mt = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T].*)?$/.exec(v))) {
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else if ((mt = /^(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{2}|\d{4})(?:\s.*)?$/.exec(v))) {
    [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
    // Американски запис (месец/ден) — само ако денят не може да е месец.
    if (m > 12 && d <= 12) [d, m] = [m, d];
    if (mt[3].length === 2) {
      const yy = Number(asOf.slice(2, 4));
      y = y <= yy ? 2000 + y : 1900 + y;
      warning = `годината е записана с две цифри — приета е ${y}`;
    }
  } else if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const iso = excelSerialToISO(Number(v));
    return iso ? { iso, warning: null } : null;
  } else {
    return null;
  }
  if (!validDate(y, m, d) || y < 1890) return null;
  return { iso: `${y}-${pad2(m)}-${pad2(d)}`, warning };
}

export function parseSex(value) {
  const v = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!v) return null;
  if (/^(м|мъж|мъжки|m|male|man|1)$/.test(v)) return 'm';
  if (/^(ж|жена|женски|f|w|female|woman|2)$/.test(v)) return 'f';
  return undefined;
}

/** Телефон: водещата нула, изгубена в числова клетка, се връща. */
export function normPhone(value) {
  let v = String(value || '').trim();
  if (!v || /^(няма|-|—|0)$/i.test(v)) return '';
  if (/^[89]\d{8}$/.test(v)) v = '0' + v;          // 888123456 → 0888123456
  else if (/^[2-7]\d{7,8}$/.test(v)) v = '0' + v;   // стационарен без нула
  else if (/^359\d{8,9}$/.test(v)) v = '+' + v;
  return v.replace(/\s{2,}/g, ' ').slice(0, 60);
}

/** Име: излишните интервали се махат, а изцяло главните букви стават нормални. */
export function tidyName(value, fixCase = true) {
  let v = String(value || '').replace(/\s+/g, ' ').trim();
  if (fixCase && v && v === v.toUpperCase() && /[А-ЯA-Z]/.test(v)) {
    v = v.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());
  }
  return v.slice(0, 120);
}

const normKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

function splitList(value) {
  return String(value || '').split(/[,;\n|]+/).map(s => s.trim())
    .filter(s => s && !/^(няма|не|-|—|0|н\/а|n\/a)$/i.test(s));
}

/* ------------------------------------ ред ------------------------------------ */

/**
 * Разчита един ред по съответствието колона → поле.
 * @returns {{ fields, chronic: string[], messages: Array<{level, text}> }}
 */
export function readRow(row, mapping, header, options, doctors) {
  const messages = [];
  const err = (text) => messages.push({ level: 'error', text });
  const warn = (text) => messages.push({ level: 'warning', text });
  const get = (t) => mapping.map((m, i) => (m === t ? String(row[i] ?? '').trim() : '')).filter(Boolean);
  const one = (t) => get(t)[0] || '';

  const fields = {};
  // Име — цялото или от части.
  let name = one('fullName');
  if (!name) name = ['firstName', 'middleName', 'lastName'].map(one).filter(Boolean).join(' ');
  fields.name = tidyName(name, options.fixCase !== false);
  if (!fields.name) err('няма име');

  // ЕГН — Excel изтрива водещата нула на родените след 2000 г.
  const rawEgn = one('egn').replace(/[\s-]/g, '');
  let fromEgn = null;
  if (rawEgn) {
    let digits = rawEgn.replace(/\.0+$/, '');
    if (/^\d{9}$/.test(digits) && parseEgn('0' + digits)?.valid) digits = '0' + digits;
    if (!/^\d{10}$/.test(digits)) {
      warn(`„${rawEgn}“ не е ЕГН от 10 цифри — не е внесено`);
    } else {
      const parsed = parseEgn(digits);
      fields.egn = digits;
      if (!parsed) warn('ЕГН не съдържа валидна дата — може да е ЛНЧ');
      else if (!parsed.valid) warn('контролната цифра на ЕГН не съвпада');
      if (parsed) fromEgn = parsed;
    }
  }

  // Дата на раждане: от колоната, иначе от ЕГН.
  const rawDate = one('birthDate');
  const asOf = options.today || today();
  if (rawDate) {
    const d = parseDateValue(rawDate, asOf);
    if (!d) warn(`неразбираема дата на раждане „${rawDate}“`);
    else {
      fields.birthDate = d.iso;
      if (d.warning) warn(d.warning);
    }
  }
  if (fromEgn) {
    if (!fields.birthDate) fields.birthDate = fromEgn.birthDate;
    else if (fields.birthDate !== fromEgn.birthDate && fromEgn.valid) {
      warn(`датата на раждане се различава от ЕГН — приета е тази от ЕГН (${fromEgn.birthDate.split('-').reverse().join('.')})`);
      fields.birthDate = fromEgn.birthDate;
    }
  }
  if (!fields.birthDate) err('няма дата на раждане или валидно ЕГН');
  else if (fields.birthDate > asOf) err('датата на раждане е в бъдещето');

  const sexRaw = one('sex');
  const sex = parseSex(sexRaw);
  if (sex === undefined) warn(`непознат пол „${sexRaw}“`);
  fields.sex = sex || (fromEgn ? fromEgn.sex : '');

  fields.phone = get('phone').map(normPhone).filter(Boolean).join(', ').slice(0, 60);
  const city = one('city');
  const address = get('address').join(', ');
  fields.address = (city && address && !normKey(address).includes(normKey(city)) ? `${city}, ${address}` : address || city).slice(0, 200);
  fields.allergies = [...new Set(get('allergies').flatMap(splitList))].slice(0, 30);

  const diag = parseDiagnoses(get('diagnoses').join('; '));
  const chronic = diag.conditions.filter(c => CONDITIONS[c]);
  fields.conditions = diag.other.slice(0, 30);

  const notes = get('notes');
  if (options.extraToNotes) {
    mapping.forEach((m, i) => {
      const v = String(row[i] ?? '').trim();
      if (!m && v && header[i]) notes.push(`${header[i]}: ${v}`);
    });
  }
  const reg = one('regDate');
  if (reg) {
    const d = parseDateValue(reg, asOf);
    if (d) fields.practiceSince = d.iso;
  }
  fields.notes = notes.join('\n').slice(0, 4000);

  const cName = one('contactName'), cPhone = normPhone(one('contactPhone'));
  fields.contacts = cName || cPhone ? [{ name: tidyName(cName, options.fixCase !== false), relation: '', phone: cPhone }] : [];

  // Лекар: по име от колоната, иначе избраният за всички.
  const docText = normKey(one('doctor').replace(/^д-?р\.?\s*/i, ''));
  const byName = docText ? doctors.find(d => {
    const n = normKey(d.name.replace(/^д-?р\.?\s*/i, ''));
    return n && (n.includes(docText) || docText.includes(n));
  }) : null;
  if (docText && !byName) warn(`лекарят „${one('doctor')}“ не е намерен сред потребителите`);
  fields.doctorId = byName ? byName.id : options.doctorId || '';

  return { fields, chronic, messages };
}

/* ------------------------------------ план ------------------------------------ */

/**
 * Какво ще стане с всеки ред. Не променя нищо.
 * @param {object} p  { rows, header, mapping, firstRow, options }
 */
export function planImport(store, { rows, header = [], mapping, firstRow = 1, options = {} }) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Няма редове за внасяне.');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Наведнъж могат да се внесат до ${MAX_IMPORT_ROWS} реда.`);
  if (!Array.isArray(mapping) || !mapping.some(Boolean)) throw new Error('Не е избрана нито една колона.');
  for (const m of mapping) if (m && !TARGETS[m]) throw new Error(`Непознато поле „${m}“.`);
  const hasName = mapping.some(m => ['fullName', 'firstName', 'lastName'].includes(m));
  if (!hasName) throw new Error('Изберете колоната с името на пациента.');
  if (!mapping.includes('egn') && !mapping.includes('birthDate')) {
    throw new Error('Изберете колоната с ЕГН или с датата на раждане.');
  }

  const byEgn = new Map();
  const byNameDob = new Map();
  for (const p of store.patients) {
    if (p.egn) byEgn.set(p.egn, p);
    byNameDob.set(normKey(p.name) + '|' + p.birthDate, p);
  }
  const seenEgn = new Map();
  const seenNameDob = new Map();
  const doctors = store.doctors.filter(d => d.active !== false);

  const results = rows.map((row, i) => {
    const line = firstRow + i;
    if (!row || row.every(v => String(v ?? '').trim() === '')) return { line, action: 'empty' };
    const { fields, chronic, messages } = readRow(row, mapping, header, options, doctors);
    const result = { line, fields, chronic, messages };
    if (messages.some(m => m.level === 'error')) return { ...result, action: 'error' };

    const key = normKey(fields.name) + '|' + fields.birthDate;
    const twin = (fields.egn && seenEgn.get(fields.egn)) || seenNameDob.get(key);
    if (twin) {
      messages.push({ level: 'warning', text: `повтаря ред ${twin}` });
      return { ...result, action: 'duplicate' };
    }
    if (fields.egn) seenEgn.set(fields.egn, line);
    seenNameDob.set(key, line);

    const existing = (fields.egn && byEgn.get(fields.egn)) || byNameDob.get(key);
    if (existing) {
      if (existing.birthDate !== fields.birthDate) {
        messages.push({ level: 'warning', text: `в програмата е с дата на раждане ${existing.birthDate.split('-').reverse().join('.')}` });
      }
      if (existing.archived) messages.push({ level: 'warning', text: 'пациентът е в архива' });
      if (options.existing === 'skip') return { ...result, action: 'exists', matchId: existing.id, matchName: existing.name };
      const changes = mergeChanges(existing, fields, chronic);
      return { ...result, action: changes.length ? 'update' : 'same', matchId: existing.id, matchName: existing.name, changes };
    }
    return { ...result, action: 'create' };
  });

  const count = (a) => results.filter(r => r.action === a).length;
  return {
    results,
    summary: {
      rows: results.filter(r => r.action !== 'empty').length,
      create: count('create'),
      update: count('update'),
      same: count('same') + count('exists'),
      duplicate: count('duplicate'),
      error: count('error'),
      warnings: results.filter(r => r.messages && r.messages.some(m => m.level === 'warning')).length,
      chronic: results.filter(r => (r.action === 'create' || r.action === 'update') && r.chronic.length).length,
      children: results.filter(r => r.action === 'create' && isChild(r.fields.birthDate)).length,
    },
  };
}

const isChild = (birthDate) => {
  const t = today();
  return birthDate > `${Number(t.slice(0, 4)) - 18}${t.slice(4)}`;
};

/** Какво би се допълнило в съществуващо досие (без да се презаписва). */
function mergeChanges(p, f, chronic) {
  const out = [];
  if (!p.egn && f.egn) out.push('ЕГН');
  if (!p.sex && f.sex) out.push('пол');
  if (!p.phone && f.phone) out.push('телефон');
  if (!p.address && f.address) out.push('адрес');
  if (!p.doctorId && f.doctorId) out.push('личен лекар');
  if (f.allergies.some(a => !(p.allergies || []).includes(a))) out.push('алергии');
  const active = new Set((p.chronic || []).filter(c => c.status !== 'resolved').map(c => c.code));
  const newChronic = chronic.filter(c => !active.has(c));
  if (newChronic.length) out.push('заболявания: ' + newChronic.map(c => CONDITIONS[c].name).join(', '));
  if (f.conditions.some(c => !(p.conditions || []).includes(c))) out.push('други диагнози');
  if (!(p.contacts || []).length && f.contacts.length) out.push('контакт');
  return out;
}

/* --------------------------------- записване --------------------------------- */

/**
 * Записва плана. `baseline: 'assume'` — досегашната профилактика и имунизации
 * се приемат за направени до днес и напомнянията започват от следващия срок.
 */
export function applyImport(store, plan, { options = {}, doctor = null, source = '' } = {}) {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  let created = 0, updated = 0;
  const chronicEntry = (code) => ({
    id: store.nextId('c'), code, since: '', note: 'внесено от списък', targets: {}, status: 'active', addedAt: now,
  });

  for (const r of plan.results) {
    if (r.action === 'create') {
      const f = r.fields;
      const p = {
        id: store.nextId('p'),
        name: f.name, egn: f.egn || '', birthDate: f.birthDate, sex: f.sex || '',
        phone: f.phone, address: f.address, doctorId: f.doctorId, notes: f.notes,
        allergies: f.allergies, conditions: f.conditions, contacts: f.contacts,
        records: {}, optIn: [], measurements: [], visits: [], reminders: [], development: [],
        chronic: r.chronic.map(chronicEntry), meds: [], results: [], assessments: [], nutritionPlans: [], studies: [], nodules: [], referrals: [], protocols: [], followups: [], lifestyle: {},
        createdAt: now, createdBy: doctor ? doctor.id : null,
        importedAt: now, importSource: String(source).slice(0, 120),
      };
      if (f.practiceSince) p.practiceSince = f.practiceSince;
      if (options.baseline !== 'missed') assumeDoneUntil(store, p, day);
      store.patients.push(p);
      created++;
    } else if (r.action === 'update') {
      const p = store.patient(r.matchId);
      if (!p) continue;
      const f = r.fields;
      if (!p.egn && f.egn && !store.patients.some(o => o.egn === f.egn)) p.egn = f.egn;
      if (!p.sex && f.sex) p.sex = f.sex;
      if (!p.phone && f.phone) p.phone = f.phone;
      if (!p.address && f.address) p.address = f.address;
      if (!p.doctorId && f.doctorId) p.doctorId = f.doctorId;
      p.allergies = [...new Set([...(p.allergies || []), ...f.allergies])];
      p.conditions = [...new Set([...(p.conditions || []), ...f.conditions])];
      if (!(p.contacts || []).length && f.contacts.length) p.contacts = f.contacts;
      const active = new Set((p.chronic || []).filter(c => c.status !== 'resolved').map(c => c.code));
      p.chronic = [...(p.chronic || []), ...r.chronic.filter(c => !active.has(c)).map(chronicEntry)];
      if (f.notes && !(p.notes || '').includes(f.notes)) p.notes = [p.notes, f.notes].filter(Boolean).join('\n').slice(0, 4000);
      if (f.practiceSince && !p.practiceSince) p.practiceSince = f.practiceSince;
      p.updatedAt = now;
      updated++;
    }
  }
  return { created, updated };
}

/**
 * Досегашното се приема за направено: всяка дейност от календара със срок до
 * днес се отбелязва като изпълнена на своя срок (с отметка „внесено“), а
 * проследяването на хроничните заболявания започва от днес.
 */
function assumeDoneUntil(store, p, day) {
  p.importBaseline = day;
  for (const e of computePlan(p, store.schedule, { asOf: day, horizonDays: 0 })) {
    if (!['overdue', 'due', 'deferral_ended'].includes(e.status) || e.due > day) continue;
    p.records[e.id] = {
      status: 'done', date: e.due, imported: true,
      note: 'Прието за направено при внасянето на списъка.',
      doctorId: '', recordedAt: new Date().toISOString(),
    };
  }
}
