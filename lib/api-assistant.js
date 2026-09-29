/* Асистентът на практиката: подсказките за всяко досие, списъкът с
 * пациентите, на които трябва да се обърне внимание, и решенията на
 * лекаря по всяка подсказка. Работи и в практиката на ОПЛ, и в СИМП. */

import { bad, date, notFound, str } from './validate.js';
import { addDays, ageInMonthsExact, isValidISO, today } from '../public/js/shared/dates.js';
import { isAdultPatient, summarize } from '../public/js/shared/schedule.js';
import { analyseMeasurements, growthConcerns } from '../public/js/shared/growth.js';
import { developmentSummary } from '../public/js/shared/development.js';
import {
  CATEGORIES, FEEDBACK, applyFeedback, assistantFindings, feedbackUntil, patientScore,
} from '../public/js/shared/assistant.js';
import { cachedAdultSummary } from './api-adult.js';
import { specialtyView } from './api-specialty.js';

const MAX_FEEDBACK = 400;

/* Подсказките се преизчисляват само при промяна в досието, датата или
 * включените модули — списъкът на цялата практика се отваря бързо. */
const cache = new WeakMap();
const sizes = (p) => ['results', 'measurements', 'visits', 'meds', 'chronic', 'studies', 'assessments', 'nodules']
  .map(k => (p[k] || []).length).join(',');

/** Всички подсказки за едно досие (преди решенията на лекаря). */
export function findingsFor(store, p, asOf = today()) {
  const mods = store.settings.modules || {};
  const key = `${p.updatedAt || p.createdAt}|${sizes(p)}|${asOf}|${store.kind}|${mods.cardio ? 1 : 0}${mods.endo ? 1 : 0}`;
  const hit = cache.get(p);
  if (hit && hit.key === key) return hit.value;

  const adult = isAdultPatient(p, asOf);
  const ctx = { asOf, modules: store.kind === 'simp' ? mods : {} };
  if (adult) {
    ctx.adult = cachedAdultSummary(store, p, { asOf });
    if (store.kind === 'simp') ctx.specialty = specialtyView(store, p, ctx.adult, asOf);
  } else if (p.birthDate) {
    const growth = analyseMeasurements(p, p.measurements || []);
    const dev = store.kind === 'gp' ? developmentSummary(p, p.development || [], ageInMonthsExact(p.birthDate, asOf)) : null;
    ctx.child = {
      growth: growthConcerns(p, growth).filter(c => c.severity >= 2),
      development: dev ? dev.concerns.filter(c => c.severity >= 2) : [],
    };
  }
  // Календарът за имунизации и профилактика е само в практиката на ОПЛ.
  if (store.kind === 'gp') {
    const s = summarize(p, store.schedule, { asOf });
    ctx.planOverdue = s.plan.filter(e => e.status === 'overdue' && e.item.mandatory);
  }
  const value = assistantFindings(p, ctx);
  cache.set(p, { key, value });
  return value;
}

function feedbackOf(p) {
  return p.assistant && typeof p.assistant === 'object' && !Array.isArray(p.assistant) ? p.assistant : {};
}

/** Подсказките за досието, разделени на активни и вече решени. */
export function patientAssistant(store, p, asOf = today()) {
  return applyFeedback(findingsFor(store, p, asOf), feedbackOf(p), asOf);
}

/** Броят на активните подсказки за раздела в досието (без да спира отварянето му). */
export function assistantCounts(store, p, asOf = today()) {
  const res = safely(p, () => patientAssistant(store, p, asOf));
  if (!res) return { active: 0, severity: 0, handled: 0, top: [] };
  return {
    active: res.active.length,
    severity: res.active.length ? Math.max(...res.active.map(f => f.severity)) : 0,
    handled: res.handled.length,
    // Най-важните — за обзора на досието.
    top: res.active.slice(0, 3).map(f => ({ key: f.key, title: f.title, severity: f.severity, category: f.category, action: f.action })),
  };
}

/* Един повреден запис не бива да спира списъка за цялата практика. */
function safely(p, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(`[асистент] досие ${p.id}:`, err.message);
    return null;
  }
}

export const assistantRoutes = {

  /* ---- списъкът на практиката ---- */

  'GET /api/assistant': (ctx) => {
    const { store, query } = ctx;
    // Дата за проверка „към“ — само в разумни граници, иначе днес.
    const t = today();
    const asOf = query.asOf && isValidISO(query.asOf) && query.asOf >= addDays(t, -5 * 366) && query.asOf <= addDays(t, 366) ? query.asOf : t;
    const minSev = [1, 2, 3].includes(Number(query.severity)) ? Number(query.severity) : 1;
    const category = query.category && CATEGORIES[query.category] ? query.category : '';
    const rows = [];
    const totals = { patients: 0, findings: 0, bySeverity: { 1: 0, 2: 0, 3: 0 }, byCategory: {} };
    let broken = 0;
    for (const p of store.patients) {
      if (p.archived) continue;
      if (query.doctor && p.doctorId !== query.doctor) continue;
      const res = safely(p, () => patientAssistant(store, p, asOf));
      if (!res) { broken++; continue; }
      const list = res.active.filter(f => f.severity >= minSev && (!category || f.category === category));
      if (!list.length) continue;
      totals.patients++;
      for (const f of list) {
        totals.findings++;
        totals.bySeverity[f.severity]++;
        totals.byCategory[f.category] = (totals.byCategory[f.category] || 0) + 1;
      }
      rows.push({
        id: p.id, name: p.name, birthDate: p.birthDate, sex: p.sex, phone: p.phone || '', doctorId: p.doctorId || '',
        score: patientScore(list),
        severity: Math.max(...list.map(f => f.severity)),
        count: list.length,
        findings: list.slice(0, 4).map(f => ({ key: f.key, title: f.title, severity: f.severity, category: f.category, action: f.action })),
      });
    }
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'bg'));
    return { asOf, totals, broken, patients: rows };
  },

  /* ---- подсказките за едно досие ---- */

  'GET /api/patients/:id/assistant': (ctx) => {
    const { store, params } = ctx;
    const p = store.patient(params.id) || notFound('Досието не е намерено.');
    const res = patientAssistant(store, p);
    return { ...res, review: p.aiReview || null };
  },

  /* ---- решението на лекаря по подсказка ---- */

  'POST /api/patients/:id/assistant/feedback': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id) || notFound('Досието не е намерено.');
    const key = str(body.key, 'Подсказка', { required: true, max: 240 });
    const status = str(body.status, 'Решение', { required: true, max: 20 });
    const fb = { ...feedbackOf(p) };
    if (status === 'reset') {
      delete fb[key];
    } else {
      if (!FEEDBACK[status]) bad('Непознато решение.');
      const asOf = today();
      let until = date(body.until, 'До дата');
      if (until && until <= asOf) bad('Датата трябва да е в бъдещето.');
      if (until && until > addDays(asOf, 3 * 366)) bad('Датата е твърде далеч (до 3 години).');
      until = feedbackUntil(status, asOf, until);
      fb[key] = {
        status, until,
        reason: str(body.reason, 'Причина', { max: 300 }),
        by: doctor ? doctor.id : '', at: new Date().toISOString(),
      };
      // Приетата подсказка става напомняне в досието (там, където практиката води напомняния).
      if (status === 'accepted' && body.remind === true) {
        const current = findingsFor(store, p, asOf).find(f => f.key === key);
        const text = str(body.text, 'Напомняне', { max: 300 }) || (current ? current.title : '');
        if (text) {
          if (!Array.isArray(p.reminders)) p.reminders = [];
          p.reminders.push({
            id: store.nextId('r'), date: until || addDays(asOf, 14), text: `Асистент: ${text}`.slice(0, 300),
            done: false, doneDate: '', doctorId: doctor ? doctor.id : '', createdAt: new Date().toISOString(),
          });
        }
      }
    }
    // Старите решения не трупат файла безкрайно.
    const keys = Object.keys(fb);
    if (keys.length > MAX_FEEDBACK) {
      keys.sort((a, b) => (fb[a].at || '').localeCompare(fb[b].at || ''));
      for (const k of keys.slice(0, keys.length - MAX_FEEDBACK)) delete fb[k];
    }
    p.assistant = fb;
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'assistant_feedback', { patientId: p.id, name: p.name, key, status });
    return patientAssistant(store, p);
  },
};
