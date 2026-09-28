/* Приложен интерфейс за модулите на специалистите: структурирани
 * изследвания (ехокардиография, ЕКГ, Холтер, CGM, преглед на стъпалата…),
 * регистър на възлите на щитовидната жлеза и справки по модули. */

import { bad, date, entries, notFound, num, str } from './validate.js';
import { today } from '../public/js/shared/dates.js';
import { isAdultPatient } from '../public/js/shared/schedule.js';
import { STUDY_KINDS, STUDY_TEXT_MAX, validateStudy } from '../public/js/shared/studies.js';
import { BETHESDA, COMPOSITION, ECHOGENICITY, LOBES, euTirads } from '../public/js/shared/endo.js';
import { MODULES, moduleSummary, relevantTo } from '../public/js/shared/specialty.js';
import { cachedAdultSummary } from './api-adult.js';

const touch = (store, p) => {
  p.updatedAt = new Date().toISOString();
  store.persist();
};

/** Списъците на модулите — и в досиета, създадени преди тях или от по-стари версии. */
function withLists(p) {
  if (!Array.isArray(p.studies)) p.studies = [];
  if (!Array.isArray(p.nodules)) p.nodules = [];
  return p;
}

/** Досието — само на пълнолетен пациент и само при включен модул. */
function patientFor(store, id, module) {
  const p = store.patient(id) || notFound('Досието не е намерено.');
  if (!store.settings.modules?.[module]) bad(`Модулът „${MODULES[module].name}“ не е включен (Настройки → Практика).`);
  if (!isAdultPatient(p)) bad('Модулите на специалистите са за пълнолетни пациенти.');
  return withLists(p);
}

const pastDate = (value, p, field = 'Дата') => {
  const d = date(value || today(), field, { required: true });
  if (d > today()) bad(`${field}: датата не може да е в бъдещето.`);
  if (p.birthDate && d < p.birthDate) bad(`${field}: датата е преди раждането.`);
  return d;
};

const pick = (value, allowed, field, required = false) => {
  if (value === undefined || value === null || value === '') {
    if (required) bad(`Полето „${field}“ е задължително.`);
    return '';
  }
  if (typeof value !== 'string' || !allowed[value]) bad(`Непозната стойност за „${field}“.`);
  return value;
};

/** Един ехографски преглед на възел. */
function readExam(store, p, body) {
  const dims = (Array.isArray(body.dims) ? body.dims : []).slice(0, 3)
    .map((v, i) => num(v, `Размер ${i + 1}`, { min: 1, max: 120 }))
    .filter(v => v !== null);
  if (!dims.length) bad('Въведете поне най-големия размер на възела в милиметри.');
  const exam = {
    id: store.nextId('ue'),
    date: pastDate(body.date, p, 'Дата на ехографията'),
    dims,
    composition: pick(body.composition, COMPOSITION, 'Структура', true),
    echogenicity: pick(body.echogenicity, ECHOGENICITY, 'Ехогенност', !['cystic', 'spongiform'].includes(body.composition)),
    shape: body.shape === 'taller' ? 'taller' : 'oval',
    margins: body.margins === 'irregular' ? 'irregular' : 'smooth',
    microcalc: body.microcalc === true || body.microcalc === 'on',
    note: str(body.note, 'Бележка', { max: 500 }),
  };
  exam.category = euTirads(exam);
  return exam;
}

function noduleOr404(p, nid) {
  const n = (p.nodules || []).find(x => x.id === nid) || notFound('Възелът не е намерен.');
  if (!Array.isArray(n.exams)) n.exams = [];
  if (!Array.isArray(n.fna)) n.fna = [];
  return n;
}

export const specialtyRoutes = {

  /* ---- структурирани изследвания ---- */

  'POST /api/patients/:id/studies': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const kind = str(body.kind, 'Вид', { required: true, max: 20 });
    const def = STUDY_KINDS[kind] || bad('Непознат вид изследване.');
    const p = patientFor(store, params.id, def.module);
    const res = validateStudy(kind, body.values);
    if (res.error) bad(res.error);
    const study = {
      id: store.nextId('st'), kind, date: pastDate(body.date, p), values: res.values,
      text: str(body.text, 'Заключение', { max: STUDY_TEXT_MAX }),
      doctorId: doctor ? doctor.id : '', recordedAt: new Date().toISOString(),
    };
    p.studies.push(study);
    touch(store, p);
    store.audit(doctor, 'study_add', { patientId: p.id, name: p.name, kind: def.name, date: study.date });
    return { study };
  },

  'DELETE /api/patients/:id/studies/:sid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = withLists(store.patient(params.id) || notFound('Досието не е намерено.'));
    const s = (p.studies || []).find(x => x.id === params.sid) || notFound('Записът не е намерен.');
    p.studies = p.studies.filter(x => x !== s);
    touch(store, p);
    store.audit(doctor, 'study_delete', { patientId: p.id, name: p.name, kind: STUDY_KINDS[s.kind]?.name || s.kind, date: s.date });
  },

  /* ---- възли на щитовидната жлеза ---- */

  'POST /api/patients/:id/nodules': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientFor(store, params.id, 'endo');
    if (p.nodules.filter(n => n.status !== 'removed').length >= 20) bad('Твърде много възли в досието.');
    const exam = entries([body.exam])[0] ? readExam(store, p, body.exam) : null;
    const n = {
      id: store.nextId('nd'),
      lobe: pick(body.lobe, LOBES, 'Разположение', true),
      location: str(body.location, 'Уточнение', { max: 80 }),
      status: 'active',
      exams: exam ? [exam] : [], fna: [],
      createdAt: new Date().toISOString(),
    };
    p.nodules.push(n);
    touch(store, p);
    store.audit(doctor, 'nodule_add', { patientId: p.id, name: p.name, lobe: LOBES[n.lobe] });
    return { nodule: n };
  },

  'PATCH /api/patients/:id/nodules/:nid': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientFor(store, params.id, 'endo');
    const n = noduleOr404(p, params.nid);
    const next = {};
    if (body.lobe !== undefined) next.lobe = pick(body.lobe, LOBES, 'Разположение', true);
    if (body.location !== undefined) next.location = str(body.location, 'Уточнение', { max: 80 });
    if (body.status !== undefined) {
      if (!['active', 'removed'].includes(body.status)) bad('Непознат статус.');
      next.status = body.status;
    }
    Object.assign(n, next);
    touch(store, p);
    store.audit(doctor, 'nodule_update', { patientId: p.id, name: p.name, lobe: LOBES[n.lobe], status: n.status });
    return { nodule: n };
  },

  'DELETE /api/patients/:id/nodules/:nid': (ctx) => {
    const { store, params, doctor } = ctx;
    const p = withLists(store.patient(params.id) || notFound('Досието не е намерено.'));
    const n = noduleOr404(p, params.nid);
    p.nodules = p.nodules.filter(x => x !== n);
    touch(store, p);
    store.audit(doctor, 'nodule_delete', { patientId: p.id, name: p.name, lobe: LOBES[n.lobe] });
  },

  'POST /api/patients/:id/nodules/:nid/exams': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientFor(store, params.id, 'endo');
    const n = noduleOr404(p, params.nid);
    if (n.exams.length >= 60) bad('Твърде много прегледи за един възел.');
    const exam = readExam(store, p, body);
    n.exams.push(exam);
    touch(store, p);
    store.audit(doctor, 'nodule_exam', { patientId: p.id, name: p.name, lobe: LOBES[n.lobe], date: exam.date, category: exam.category });
    return { exam };
  },

  'POST /api/patients/:id/nodules/:nid/fna': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = patientFor(store, params.id, 'endo');
    const n = noduleOr404(p, params.nid);
    if (n.fna.length >= 30) bad('Твърде много биопсии за един възел.');
    const bethesda = num(body.bethesda, 'Категория по Bethesda', { min: 1, max: 6, required: true });
    if (!Number.isInteger(bethesda) || !BETHESDA[bethesda]) bad('Непозната категория по Bethesda.');
    const f = {
      id: store.nextId('fn'), date: pastDate(body.date, p, 'Дата на биопсията'), bethesda,
      note: str(body.note, 'Бележка', { max: 500 }),
    };
    n.fna.push(f);
    touch(store, p);
    store.audit(doctor, 'nodule_fna', { patientId: p.id, name: p.name, lobe: LOBES[n.lobe], date: f.date, bethesda });
    return { fna: f };
  },

  'DELETE /api/patients/:id/nodules/:nid/:list/:eid': (ctx) => {
    const { store, params, doctor } = ctx;
    if (!['exams', 'fna'].includes(params.list)) notFound('Няма такъв адрес.');
    const p = store.patient(params.id) || notFound('Досието не е намерено.');
    const n = noduleOr404(p, params.nid);
    const item = n[params.list].find(x => x.id === params.eid) || notFound('Записът не е намерен.');
    n[params.list] = n[params.list].filter(x => x !== item);
    touch(store, p);
    store.audit(doctor, params.list === 'fna' ? 'nodule_fna_delete' : 'nodule_exam_delete', { patientId: p.id, name: p.name, lobe: LOBES[n.lobe], date: item.date });
  },

  /* ---- справка по модул ---- */

  'GET /api/specialty/:module': (ctx) => {
    const { store, params, query } = ctx;
    const def = MODULES[params.module] || notFound('Непознат модул.');
    if (!store.settings.modules?.[params.module]) bad(`Модулът „${def.name}“ не е включен.`);
    const asOf = today();
    const groups = new Map(Object.keys(def.alerts).map(id => [id, { id, label: def.alerts[id], patients: [] }]));
    let considered = 0;
    let broken = 0;
    for (const p of store.patients) {
      if (p.archived || !isAdultPatient(p, asOf)) continue;
      if (query.doctor && p.doctorId !== query.doctor) continue;
      try {
        if (!relevantTo(params.module, p)) continue;
        considered++;
        const a = cachedAdultSummary(store, p, { asOf });
        const seen = new Set();
        for (const al of moduleSummary(params.module, p, a, asOf).alerts) {
          const g = groups.get(al.id);
          if (!g || seen.has(al.id + ':' + al.text)) continue;
          seen.add(al.id + ':' + al.text);
          g.patients.push({ id: p.id, name: p.name, birthDate: p.birthDate, severity: al.severity, text: al.text });
        }
      } catch (err) {
        broken++;
        console.error(`[модул ${params.module}] досие ${p.id}:`, err.message);
      }
    }
    return {
      module: params.module, asOf, considered, broken,
      groups: [...groups.values()].filter(g => g.patients.length)
        .map(g => ({ ...g, patients: g.patients.sort((x, y) => y.severity - x.severity || x.name.localeCompare(y.name, 'bg')) })),
    };
  },
};

/** Обобщенията на включените модули за едно досие (за изгледа на пациента). */
export function specialtyView(store, p, a, asOf = today()) {
  const out = {};
  for (const id of Object.keys(MODULES)) {
    if (!store.settings.modules?.[id]) continue;
    // Грешка в един модул не бива да скрие цялото досие.
    try {
      out[id] = moduleSummary(id, p, a, asOf);
    } catch (err) {
      console.error(`[модул ${id}] досие ${p.id}:`, err);
      out[id] = { error: true, alerts: [] };
    }
  }
  return out;
}
