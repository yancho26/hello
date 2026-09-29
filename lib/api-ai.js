/* Втори поглед от езиков модел (Claude на Anthropic) — по желание.
 *
 * По подразбиране е изключен и асистентът работи изцяло на компютъра на
 * практиката. Включва се само от компютъра, на който работи програмата, с
 * API ключ на практиката. Тогава, при натискане на бутона в досието, до
 * Anthropic се изпраща обобщение БЕЗ име, ЕГН, телефон, адрес и дати —
 * възраст, пол, заболявания, лекарства, изследвания, показатели и текста на
 * последните прегледи с изчистени имена и номера. Лекарят вижда точно какво
 * ще се изпрати, преди да го изпрати.
 *
 * Ключът се пази в ai.json в папката с данните — не влиза в копията и
 * износа на данните и никога не се връща към браузъра. */

import fs from 'node:fs';
import path from 'node:path';
import { HttpError, bad, notFound, str } from './validate.js';
import { daysBetween, monthsBetween, today } from '../public/js/shared/dates.js';
import { CONDITIONS, activeConditions } from '../public/js/shared/chronic.js';
import { LABS, egfrSeries, formatLab, isCheck, labName, resultSeries } from '../public/js/shared/labs.js';
import { SCHEDULE_SLOTS, activeMeds, medLabel } from '../public/js/shared/meds.js';
import { TOOLS } from '../public/js/shared/mental.js';
import { STUDY_KINDS, studyLine } from '../public/js/shared/studies.js';
import { SEVERITY } from '../public/js/shared/assistant.js';
import { findingsFor } from './api-assistant.js';

export const AI_MODEL = 'claude-opus-5-5';
const REQUEST_TIMEOUT_MS = 300_000;
const MAX_SUMMARY = 14_000;
const MIN_INTERVAL_MS = 20_000;

/* -------------------------------- настройки -------------------------------- */

function aiFile(install) { return path.join(install.dir, 'ai.json'); }

export function aiConfig(install) {
  if (install.aiConfig === undefined) {
    try {
      const d = JSON.parse(fs.readFileSync(aiFile(install), 'utf8'));
      install.aiConfig = {
        enabled: d.enabled === true,
        apiKey: typeof d.apiKey === 'string' ? d.apiKey : '',
        updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
      };
    } catch {
      install.aiConfig = { enabled: false, apiKey: '', updatedAt: '' };
    }
  }
  return install.aiConfig;
}

function saveConfig(install, cfg) {
  const file = aiFile(install);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
  install.aiConfig = cfg;
}

/* ------------------------------- библиотеката ------------------------------- */

/* Официалната библиотека на Anthropic се зарежда едва при първа употреба —
 * без нея асистентът работи както досега. В инсталацията за Windows е
 * вградена; при стартиране с Node.js се инсталира с `npm install`.
 * Тестовете подменят клиента, за да не правят заявки навън. */
let clientFactory = null;
export function setAiClientFactory(fn) { clientFactory = fn; }

let sdkPromise = null;
async function loadSdk() {
  sdkPromise ??= import('@anthropic-ai/sdk').then(m => m.default || m.Anthropic).catch(() => null);
  return sdkPromise;
}

async function makeClient(apiKey) {
  if (clientFactory) return { client: clientFactory(apiKey), Anthropic: null };
  const Anthropic = await loadSdk();
  if (!Anthropic) {
    throw new HttpError(503, 'Библиотеката за езиковия модел не е инсталирана. При стартиране с Node.js изпълнете „npm install“ в папката на програмата.');
  }
  return { client: new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 }), Anthropic };
}

/** Грешките на API-то като ясни съобщения на български (по класа, не по текста). */
function explain(err, Anthropic) {
  if (err instanceof HttpError) return err;
  if (Anthropic) {
    if (err instanceof Anthropic.AuthenticationError) return new HttpError(502, 'Ключът за езиковия модел е невалиден или е отменен. Проверете го в „Настройки → Асистент“.');
    if (err instanceof Anthropic.PermissionDeniedError) return new HttpError(502, 'Ключът няма достъп до модела. Проверете профила в console.anthropic.com.');
    if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'Езиковият модел е натоварен или лимитът на профила е достигнат. Опитайте след минута.');
    if (err instanceof Anthropic.BadRequestError) return new HttpError(502, `Заявката към езиковия модел е отхвърлена: ${err.message}`);
    if (err instanceof Anthropic.InternalServerError) return new HttpError(502, 'Езиковият модел временно не отговаря. Опитайте отново след малко.');
    if (err instanceof Anthropic.APIConnectionError) return new HttpError(504, 'Няма връзка с api.anthropic.com. Проверете интернета на компютъра, на който работи програмата.');
    if (err instanceof Anthropic.APIError) return new HttpError(502, `Грешка от езиковия модел (${err.status ?? '—'}).`);
  }
  console.error('[езиков модел]', err);
  return new HttpError(502, 'Езиковият модел не отговори. Подробностите са в дневника на програмата.');
}

/* ---------------------------- обобщение без имена ---------------------------- */

const ago = (d, asOf) => {
  const n = daysBetween(d, asOf);
  if (n <= 0) return 'днес';
  if (n < 45) return `преди ${n} ${n === 1 ? 'ден' : 'дни'}`;
  if (n < 730) return `преди ${Math.round(n / 30.4)} мес.`;
  return `преди ${Math.round(n / 365.25)} г.`;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Премахва имена, ЕГН, телефони, имейли, имена на лекари и дати от свободен текст. */
export function scrub(text, p) {
  let t = String(text || '');
  const names = [p.name, ...(p.contacts || []).map(c => c.name), p.gp?.name]
    .filter(Boolean).flatMap(n => String(n).split(/\s+/)).filter(w => w.length >= 3 && !/^д-р$/i.test(w));
  for (const w of [...new Set(names)]) t = t.replace(new RegExp(`${escapeRe(w)}[а-яa-z]*`, 'gi'), '[име]');
  return t
    .replace(/\d{10}/g, '[номер]')
    .replace(/(?:\+?359|0)[\s-]?\d{2,3}[\s-]?\d{3}[\s-]?\d{2,4}/g, '[телефон]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[имейл]')
    .replace(/(?:д-р|доктор|dr\.?)\s+[А-ЯA-Z][а-яa-z]+(?:\s+[А-ЯA-Z][а-яa-z]+)?/g, '[лекар]')
    .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}(?:\s*г\.)?/g, '[дата]')
    .replace(/\d{4}-\d{2}-\d{2}/g, '[дата]')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Текстът, който се изпраща до модела — същият се показва на лекаря преди изпращане. */
export function deidentifiedSummary(store, p, asOf = today()) {
  const lines = [];
  const age = Math.floor(monthsBetween(p.birthDate, asOf) / 12);
  const kind = store.kind === 'simp' ? 'специализирана извънболнична помощ' : 'обща медицина';
  lines.push(`Пациент: ${p.sex === 'f' ? 'жена' : p.sex === 'm' ? 'мъж' : 'пол не е посочен'}, ${age} г. Практика: ${kind}.`);

  const conds = activeConditions(p).map(c => `${CONDITIONS[c.code].name}${c.since ? ` (от ${ago(c.since, asOf).replace('преди ', '')})` : ''}`);
  if (conds.length) lines.push(`Заболявания: ${conds.join('; ')}.`);
  if ((p.conditions || []).length) lines.push(`Други заболявания: ${scrub((p.conditions || []).join('; '), p)}.`);
  lines.push(`Алергии: ${(p.allergies || []).length ? scrub(p.allergies.join(', '), p) : 'няма вписани'}.`);

  // Схемата сутрин-обед-вечер-нощ — само ако е попълнена.
  const slot = (m) => {
    if (m.prn) return ' при нужда';
    const parts = SCHEDULE_SLOTS.map(([k]) => m.schedule?.[k] || '0');
    return parts.some(x => x !== '0') ? ' ' + parts.join('-') : '';
  };
  const meds = activeMeds(p, asOf).map(m => `${medLabel(m)}${m.dose ? ' ' + m.dose : ''}${slot(m)}${m.start ? `, от ${ago(m.start, asOf).replace('преди ', '')}` : ''}`);
  lines.push(`Лекарства: ${meds.length ? meds.join('; ') : 'няма вписани'}.`);

  const ms = [...(p.measurements || [])].filter(m => m.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastOf = (k) => [...ms].reverse().find(m => Number.isFinite(m[k]));
  const vit = [];
  const bpM = ms.filter(m => m.systolic).slice(-3);
  if (bpM.length) vit.push(`АН ${bpM.map(m => `${m.systolic}/${m.diastolic} (${ago(m.date, asOf)})`).join(', ')}`);
  const pulse = lastOf('pulse');
  if (pulse) vit.push(`пулс ${pulse.pulse}/мин (${ago(pulse.date, asOf)})`);
  const w = ms.filter(m => Number.isFinite(m.weight)).slice(-3);
  if (w.length) vit.push(`тегло ${w.map(m => `${m.weight} кг (${ago(m.date, asOf)})`).join(', ')}`);
  const h = lastOf('height');
  if (h) vit.push(`ръст ${h.height} см`);
  const waist = lastOf('waist');
  if (waist) vit.push(`талия ${waist.waist} см`);
  if (vit.length) lines.push(`Показатели: ${vit.join('; ')}.`);

  const labLines = [];
  const since = `${Number(asOf.slice(0, 4)) - 2}${asOf.slice(4)}`;
  for (const code of Object.keys(LABS)) {
    const s = (code === 'egfr' ? egfrSeries(p) : resultSeries(p.results || [], code)).filter(r => r.date >= since && r.date <= asOf);
    if (!s.length) continue;
    const last = s[s.length - 1];
    const prev = s.length > 1 ? s[s.length - 2] : null;
    labLines.push(`${LABS[code].short} ${formatLab(code, last.value)} (${ago(last.date, asOf)})${prev ? `; предишно ${formatLab(code, prev.value)} (${ago(prev.date, asOf)})` : ''}`);
  }
  const checks = (p.results || []).filter(r => isCheck(r.code) && r.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
    .map(r => `${labName(r.code)} (${ago(r.date, asOf)})${r.text ? ': ' + scrub(r.text, p) : ''}`);
  if (labLines.length) lines.push(`Изследвания (последните 2 години):\n- ${labLines.join('\n- ')}`);
  if (checks.length) lines.push(`Прегледи и процедури:\n- ${checks.join('\n- ')}`);
  const studies = (p.studies || []).filter(s => s.date >= since && STUDY_KINDS[s.kind]).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
    .map(s => `${STUDY_KINDS[s.kind].name} (${ago(s.date, asOf)}): ${studyLine(s)}${s.text ? '. ' + scrub(s.text, p) : ''}`);
  if (studies.length) lines.push(`Специализирани изследвания:\n- ${studies.join('\n- ')}`);

  const scales = (p.assessments || []).filter(a => a.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6)
    .map(a => `${TOOLS[a.tool]?.short || a.tool} ${a.score} (${a.result?.label || ''}, ${ago(a.date, asOf)})`);
  if (scales.length) lines.push(`Скали: ${scales.join('; ')}.`);
  const ls = p.lifestyle || {};
  const life = [
    ls.smoking && `тютюнопушене: ${{ current: 'пуши', former: 'бивш пушач', never: 'непушач' }[ls.smoking] || ls.smoking}`,
    ls.alcohol && `алкохол: ${{ none: 'не пие', low: 'умерено', high: 'рисково' }[ls.alcohol] || ls.alcohol}`,
    ls.activity && `активност: ${{ sedentary: 'заседнал', light: 'лека', moderate: 'умерена', high: 'висока' }[ls.activity] || ls.activity}`,
  ].filter(Boolean);
  if (life.length) lines.push(`Начин на живот: ${life.join('; ')}.`);

  const visits = (p.visits || []).filter(v => v.date <= asOf && v.date >= `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`)
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  if (visits.length) {
    lines.push('Прегледи (последната година):');
    for (const v of visits) {
      const parts = [
        v.complaint && `Оплаквания: ${scrub(v.complaint, p)}`,
        v.findings && `Обективно: ${scrub(v.findings, p)}`,
        v.investigations && `Изследвания: ${scrub(v.investigations, p)}`,
        (v.diagnosis || v.icd) && `Диагноза: ${scrub([v.icd, v.diagnosis].filter(Boolean).join(' '), p)}`,
        v.treatment && `Терапия: ${scrub(v.treatment, p)}`,
      ].filter(Boolean).map(x => x.slice(0, 700).replace(/[.\s]+$/, ''));
      lines.push(`- ${ago(v.date, asOf)}, ${v.type || 'преглед'}. ${parts.join('. ')}`);
    }
  }

  const local = findingsFor(store, p, asOf);
  if (local.length) {
    lines.push('Сигнали, които правилата на програмата вече показват на лекаря:');
    for (const f of local.slice(0, 15)) lines.push(`- [${SEVERITY[f.severity].label}] ${scrub(f.title, p)}: ${scrub(f.action, p)}`);
  }
  // „от 6 мес.“ в края на изречение не бива да дава „мес..“.
  let text = lines.join('\n').replace(/\.\.(?=\s|$)/g, '.');
  if (text.length > MAX_SUMMARY) text = text.slice(0, MAX_SUMMARY) + '\n[съкратено]';
  return text;
}

/* ---------------------------------- заявка ---------------------------------- */

const SYSTEM_PROMPT = `You are a clinical decision-support assistant for a medical practice in Bulgaria. You receive a de-identified summary of one patient's record (no names, identifiers or exact dates; times are relative to today).

Your task: identify additional checks, laboratory tests, examinations or referrals that the patient's current state warrants and that are not already done. Base them on current European guidelines (ESC, ESH, KDIGO, ADA/EASD, EASL, ERS, GOLD, GINA, EULAR, ETA) and on NICE where European guidance is missing. For each suggestion say exactly what to do and when, why (citing the specific data points from the summary), how urgent it is, and which guideline supports it.

The summary ends with signals that the practice software's rules already show to the doctor. Do not repeat them unless you add something clinically important; you may confirm them briefly in the summary.

Be conservative and specific. Do not state diagnoses as facts; phrase them as possibilities to check. If important data are missing, say which. If nothing further is needed, return an empty list of suggestions. Give at most 8 suggestions, most important first.

Write every text field in Bulgarian, using the clinical terminology used by Bulgarian doctors. Keep each field concise.`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Кратка клинична оценка в 2–4 изречения.' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          action: { type: 'string' },
          why: { type: 'string' },
          urgency: { type: 'string', enum: ['urgent', 'soon', 'routine'] },
          source: { type: 'string' },
        },
        required: ['title', 'action', 'why', 'urgency', 'source'],
        additionalProperties: false,
      },
    },
    caveats: { type: 'string', description: 'Какви данни липсват или ограничения на оценката.' },
  },
  required: ['summary', 'suggestions', 'caveats'],
  additionalProperties: false,
};

const clip = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Проверява и изчиства отговора на модела, преди да се запише или покаже. */
export function sanitizeReview(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.suggestions)) {
    throw new HttpError(502, 'Отговорът на езиковия модел е в неочакван вид.');
  }
  const urgencyMap = { urgent: 3, soon: 2, routine: 1 };
  return {
    summary: clip(data.summary, 1200),
    caveats: clip(data.caveats, 800),
    suggestions: data.suggestions.slice(0, 10).filter(s => s && typeof s === 'object').map(s => ({
      title: clip(s.title, 200),
      action: clip(s.action, 600),
      why: clip(s.why, 700),
      severity: urgencyMap[s.urgency] || 1,
      source: clip(s.source, 200),
    })).filter(s => s.title),
  };
}

const lastCall = new Map();
let running = 0;

function requireAi(ctx) {
  const cfg = aiConfig(ctx.install || ctx.store);
  if (!cfg.enabled || !cfg.apiKey) {
    bad('Езиковият модел не е включен. Включва се от „Настройки → Асистент“ на компютъра, на който работи програмата.');
  }
  return cfg;
}

function localOnly(ctx, what) {
  if (!ctx.isLocal()) throw new HttpError(403, `${what} се задава от компютъра, на който работи програмата.`);
}

export const aiRoutes = {

  'GET /api/ai': async (ctx) => {
    const cfg = aiConfig(ctx.install || ctx.store);
    return {
      enabled: cfg.enabled && !!cfg.apiKey,
      hasKey: !!cfg.apiKey,
      keyHint: cfg.apiKey ? '…' + cfg.apiKey.slice(-4) : '',
      model: AI_MODEL,
      library: clientFactory ? true : !!(await loadSdk()),
      canChange: ctx.isLocal(),
      updatedAt: cfg.updatedAt,
    };
  },

  'PUT /api/ai': (ctx) => {
    const { body, doctor } = ctx;
    localOnly(ctx, 'Езиковият модел');
    const install = ctx.install || ctx.store;
    const cfg = { ...aiConfig(install) };
    if (body.apiKey !== undefined) {
      const key = str(body.apiKey, 'API ключ', { max: 300 }).replace(/\s/g, '');
      if (key && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) bad('Ключът започва със „sk-ant-“ — копирайте го целия от console.anthropic.com.');
      cfg.apiKey = key;
    }
    if (body.enabled !== undefined) cfg.enabled = body.enabled === true;
    if (cfg.enabled && !cfg.apiKey) bad('Въведете API ключ, за да включите езиковия модел.');
    cfg.updatedAt = new Date().toISOString();
    saveConfig(install, cfg);
    // В журнала — само решението, никога ключът.
    ctx.store.audit(doctor, 'ai_settings', { enabled: cfg.enabled, key: cfg.apiKey ? 'зададен' : 'няма' });
    return { enabled: cfg.enabled, hasKey: !!cfg.apiKey, keyHint: cfg.apiKey ? '…' + cfg.apiKey.slice(-4) : '' };
  },

  'POST /api/ai/test': async (ctx) => {
    localOnly(ctx, 'Проверката на езиковия модел');
    const cfg = requireAi(ctx);
    const { client, Anthropic } = await makeClient(cfg.apiKey);
    try {
      const response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Отговори само с думата: готово' }],
      });
      return { ok: true, model: response.model };
    } catch (err) {
      throw explain(err, Anthropic);
    }
  },

  'POST /api/patients/:id/assistant/ai/preview': (ctx) => {
    const { store, params } = ctx;
    const p = store.patient(params.id) || notFound('Досието не е намерено.');
    const text = deidentifiedSummary(store, p);
    return { text, chars: text.length, model: AI_MODEL };
  },

  'POST /api/patients/:id/assistant/ai': async (ctx) => {
    const { store, params, doctor } = ctx;
    const cfg = requireAi(ctx);
    const p = store.patient(params.id) || notFound('Досието не е намерено.');
    const prev = lastCall.get(p.id) || 0;
    if (Date.now() - prev < MIN_INTERVAL_MS) throw new HttpError(429, 'Анализът на това досие току-що е поискан. Изчакайте няколко секунди.');
    if (running >= 2) throw new HttpError(429, 'Езиковият модел анализира други досиета. Опитайте след малко.');
    lastCall.set(p.id, Date.now());
    const text = deidentifiedSummary(store, p);
    const { client, Anthropic } = await makeClient(cfg.apiKey);
    running++;
    let response;
    try {
      // Поточно получаване: по-дълъг анализ не се прекъсва от изтичане на времето за заявка.
      response = await client.beta.messages.stream({
        model: AI_MODEL,
        max_tokens: 16000,
        // При отказ от предпазните филтри заявката се изпълнява от препоръчания резервен модел.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      }).finalMessage();
    } catch (err) {
      throw explain(err, Anthropic);
    } finally {
      running--;
    }
    if (!response || typeof response !== 'object') {
      throw new HttpError(502, 'Езиковият модел не върна отговор. Опитайте отново.');
    }
    if (response.stop_reason === 'refusal') {
      throw new HttpError(502, 'Езиковият модел отказа да анализира това досие. Подсказките на асистента остават достъпни.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new HttpError(502, 'Отговорът на езиковия модел е непълен. Опитайте отново.');
    }
    // При смяна на модела по време на отговора частичният текст преди смяната не е част от JSON.
    const blocks = response.content || [];
    const cut = blocks.map(b => b.type).lastIndexOf('fallback');
    const raw = blocks.slice(cut + 1).filter(b => b.type === 'text').map(b => b.text).join('');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new HttpError(502, 'Отговорът на езиковия модел не може да бъде разчетен. Опитайте отново.');
    }
    const review = {
      ...sanitizeReview(data),
      at: new Date().toISOString(),
      by: doctor ? doctor.id : '',
      model: String(response.model || AI_MODEL).slice(0, 60),
    };
    p.aiReview = review;
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'ai_review', {
      patientId: p.id, name: p.name, model: review.model, suggestions: review.suggestions.length,
      inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null,
    });
    return { review };
  },
};
