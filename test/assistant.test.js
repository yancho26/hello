/* Версия 4.1: асистентът — клинични правила, четене на текста на
 * прегледите с отрицание, решенията на лекаря, списъкът на практиката и
 * вторият поглед от езиков модел (с подменен клиент, без мрежа). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, normalizeData } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { scrub, sanitizeReview, setAiClientFactory } from '../lib/api-ai.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';
import {
  applyFeedback, assistantFindings, feedbackUntil, negated, patientScore, readText,
} from '../public/js/shared/assistant.js';

const T = today();
const born = (years) => addMonths(T, -12 * years);
const adult = (extra = {}) => ({
  id: 'p1', name: 'Иван Петров Иванов', birthDate: born(60), sex: 'm',
  chronic: [], meds: [], results: [], measurements: [], assessments: [], visits: [], studies: [], ...extra,
});
const keys = (list) => list.map(f => f.key.split(':')[0]);
const find = (p, ctx = {}) => assistantFindings(p, { asOf: T, ...ctx });

/* ------------------------------- текст ------------------------------- */

test('четене на текста: тревожни оплаквания и отрицание', () => {
  const ids = (t) => readText(t).map(x => x.flag.id);
  assert.deepEqual(ids('От месец кръв в изпражненията.'), ['rectal_bleeding']);
  assert.deepEqual(ids('Без кръв в изпражненията.'), []);
  assert.deepEqual(ids('Не съобщава за задух.'), []);
  assert.deepEqual(ids('Отрича болка в гърдите, но има задух при усилие.'), ['dyspnea'], 'отрицанието стига до „но“');
  assert.deepEqual(ids('Без болка в корема. Задух при изкачване.'), ['dyspnea'], 'отрицанието не минава през точка');
  assert.deepEqual(ids('Бучка в лявата гърда от 2 седмици.'), ['breast_lump']);
  assert.deepEqual(ids('Внезапно главоболие, най-силното в живота.'), ['headache_red']);
  assert.deepEqual(ids('Отслабнал 6 кг за 3 месеца, нощно изпотяване.').sort(), ['night_sweats', 'weight_loss_text']);
  assert.equal(negated('без задух', 4), true);
  assert.equal(negated('задух', 0), false);
});

test('оплакване в скорошен преглед става подсказка; направеното изследване я спира', () => {
  const visit = { id: 'v1', date: addDays(T, -5), complaint: 'Кръв в изпражненията от месец.' };
  const p = adult({ visits: [visit] });
  const f = find(p).find(x => x.rule === 'text_rectal_bleeding');
  assert.ok(f, 'има подсказка');
  assert.equal(f.severity, 3);
  assert.equal(f.category, 'symptom');
  assert.match(f.action, /FIT/);
  // FIT след прегледа — подсказката отпада.
  p.results.push({ id: 'r1', date: addDays(T, -1), code: 'fit', value: null, text: 'отрицателен' });
  assert.ok(!find(p).some(x => x.rule === 'text_rectal_bleeding'));
  // Прегледът отпреди повече от 60 дни не се чете.
  assert.ok(!find(adult({ visits: [{ ...visit, date: addDays(T, -90) }] })).some(x => x.rule === 'text_rectal_bleeding'));
  // Възрастово ограничение: паметта — от 60 г.
  const young = adult({ birthDate: born(40), visits: [{ id: 'v2', date: T, complaint: 'Забравя имена.' }] });
  assert.ok(!find(young).some(x => x.rule === 'text_memory'));
});

/* ------------------------------ правила ------------------------------ */

test('калий: висок при инхибитор на РААС, по-висок праг за спешност', () => {
  const p = adult({
    meds: [{ id: 'm1', drug: 'ramipril', start: addMonths(T, -12) }],
    results: [{ id: 'r1', date: addDays(T, -2), code: 'k', value: 5.7 }],
  });
  const k = find(p).find(f => f.rule === 'k_high');
  assert.equal(k.severity, 2);
  assert.match(k.action, /Рамиприл|рамиприл|ramipril/i);
  p.results[0].value = 6.2;
  assert.equal(find(p).find(f => f.rule === 'k_high').severity, 3);
  // Стар резултат — по-ниска спешност.
  p.results[0].date = addDays(T, -100);
  assert.ok(find(p).find(f => f.rule === 'k_high').severity <= 2);
});

test('бъбречна функция: бърз спад на eGFR по KDIGO', () => {
  const p = adult({
    results: [
      { id: 'a', date: addMonths(T, -14), code: 'egfr', value: 72 },
      { id: 'b', date: addDays(T, -10), code: 'egfr', value: 54 },
    ],
  });
  assert.ok(find(p).some(f => f.rule === 'egfr_decline'));
});

test('анемия: първо феритин; при недоимък на желязо у мъж — оценка на храносмилателната система', () => {
  const p = adult({ results: [{ id: 'a', date: addDays(T, -3), code: 'hb', value: 112 }] });
  const first = find(p).find(x => x.rule === 'anemia');
  assert.ok(first);
  assert.match(first.action, /Феритин/);
  p.results.push({ id: 'b', date: addDays(T, -3), code: 'ferritin', value: 9 });
  const ida = find(p).find(x => x.rule === 'anemia');
  assert.match(ida.title, /нисък феритин/);
  assert.match(ida.action, /колоноскопия/);
  assert.match(ida.source, /BSG 2021/);
});

test('скрининг: аневризма на коремната аорта при пушач, предсърдно мъждене над 75 г.', () => {
  const smoker = adult({ birthDate: born(67), lifestyle: { smoking: 'former' } });
  assert.ok(find(smoker).some(f => f.rule === 'aaa_screen'));
  assert.ok(!find(adult({ birthDate: born(67), sex: 'f', lifestyle: { smoking: 'former' } })).some(f => f.rule === 'aaa_screen'));
  const old = adult({ birthDate: born(78) });
  assert.ok(find(old).some(f => f.rule === 'af_screen'));
  old.results.push({ id: 'e', date: addMonths(T, -3), code: 'ecg', value: null, text: 'синусов ритъм' });
  assert.ok(!find(old).some(f => f.rule === 'af_screen'), 'скорошно ЕКГ');
});

test('загуба на тегло 5% за 6 месеца', () => {
  const p = adult({
    measurements: [
      { id: 'a', date: addMonths(T, -5), weight: 82 },
      { id: 'b', date: addDays(T, -3), weight: 76 },
    ],
  });
  assert.ok(find(p).some(f => f.rule === 'weight_loss'));
});

test('подсказките са подредени по спешност, без повторения', () => {
  const p = adult({
    visits: [{ id: 'v', date: addDays(T, -2), complaint: 'Кръв в изпражненията. Задух.' }],
    results: [{ id: 'r', date: addDays(T, -2), code: 'k', value: 5.6 }],
  });
  const list = find(p);
  assert.deepEqual(list.map(f => f.severity), [...list.map(f => f.severity)].sort((a, b) => b - a));
  assert.equal(new Set(list.map(f => f.key)).size, list.length);
  assert.ok(patientScore(list) >= 300);
  assert.equal(patientScore([]), 0);
  for (const f of list) assert.ok(!/\.\.(\s|$)/.test(f.action), 'без двойна точка');
});

test('децата: без правилата за възрастни, със сигналите за растеж', () => {
  const kid = adult({ birthDate: born(5), results: [{ id: 'r', date: T, code: 'k', value: 6.5 }] });
  const list = find(kid, { child: { growth: [{ id: 'g', title: 'Тегло под 2-ри персентил', severity: 2 }], development: [] } });
  assert.ok(!list.some(f => f.rule === 'k_high'));
  assert.ok(list.some(f => f.rule === 'growth'));
});

/* --------------------------- решенията на лекаря --------------------------- */

test('решения: отложено до дата, отхвърлено за година, направено до нови данни', () => {
  const findings = [{ key: 'k_high:2026-01-01', severity: 2 }, { key: 'aaa_screen:once', severity: 1 }];
  const fb = { 'k_high:2026-01-01': { status: 'snoozed', until: addDays(T, 10) } };
  let res = applyFeedback(findings, fb, T);
  assert.equal(res.active.length, 1);
  assert.equal(res.handled[0].feedback.status, 'snoozed');
  res = applyFeedback(findings, fb, addDays(T, 11));
  assert.equal(res.active.length, 2, 'след срока се връща');
  assert.equal(feedbackUntil('dismissed', T, ''), addMonths(T, 12));
  assert.equal(feedbackUntil('snoozed', T, ''), addMonths(T, 1));
  assert.equal(feedbackUntil('done', T, ''), '');
  assert.equal(feedbackUntil('snoozed', T, addDays(T, 3)), addDays(T, 3));
  // Нов резултат дава нов ключ — решението за стария не го скрива.
  const done = { 'k_high:2026-01-01': { status: 'done', until: '' } };
  assert.equal(applyFeedback([{ key: 'k_high:2026-03-01', severity: 2 }], done, T).active.length, 1);
});

test('проверката при зареждане поправя решенията и втория поглед', () => {
  const d = {
    patients: [{
      id: 'p', name: 'X', birthDate: born(50),
      assistant: { a: { status: 'done' }, b: 'junk', c: { nope: 1 } },
      aiReview: { summary: 'x' },
    }, { id: 'q', name: 'Y', birthDate: born(50), assistant: ['junk'] }],
  };
  normalizeData(d);
  assert.deepEqual(Object.keys(d.patients[0].assistant), ['a']);
  assert.equal(d.patients[0].aiReview, undefined);
  assert.equal(d.patients[1].assistant, undefined);
});

/* ---------------------------- езиков модел: логика ---------------------------- */

test('обезличаване: имена, ЕГН, телефони, имейли, лекари и дати', () => {
  const p = { name: 'Иван Петров Иванов', contacts: [{ name: 'Мария Иванова' }], gp: { name: 'д-р Стоян Колев' } };
  const out = scrub('Иван съобщава, че Мария Иванова звъня на 0888 123 456 и на ivan@abv.bg; ЕГН 6001011234; д-р Георгиев го видя на 12.03.2026 г. и 2026-03-15. Колев знае.', p);
  for (const bad of ['Иван', 'Мария', '0888', 'abv', '6001011234', 'Георгиев', '12.03', '2026-03-15', 'Колев']) {
    assert.ok(!out.includes(bad), `остана „${bad}“ в: ${out}`);
  }
  assert.match(out, /\[име\]/);
  assert.match(out, /\[телефон\]/);
  assert.match(out, /\[дата\]/);
});

test('отговорът на модела се проверява и изчиства', () => {
  const r = sanitizeReview({
    summary: 'Кратко.', caveats: '',
    suggestions: [{ title: 'ТТГ', action: 'Изследване', why: 'умора', urgency: 'urgent', source: 'ETA' }, { title: '' }, null, { title: 'X', urgency: 'странно' }],
  });
  assert.equal(r.suggestions.length, 2);
  assert.equal(r.suggestions[0].severity, 3);
  assert.equal(r.suggestions[1].severity, 1);
  assert.throws(() => sanitizeReview({ summary: 'x' }), /неочакван/);
});

/* ------------------------------------ API ------------------------------------ */

async function withApp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-asst-'));
  const spaces = new Workspaces(new Store(dir));
  const server = createAppServer({ workspaces: spaces, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (method, url, body, headers = {}) => {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + url, {
      method, body: body && JSON.stringify(body),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      if (attrs.some(a => /max-age=0/i.test(a))) jar.delete(pair.slice(0, i).trim()); else jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    await fn({ call, spaces, dir });
  } finally {
    setAiClientFactory(null);
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    for (const s of spaces.all()) await s.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function setupGp(call) {
  const res = await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'Практика', doctorName: 'д-р Тест Тестов' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const created = await call('POST', '/api/patients', { name: 'Иван Петров Иванов', birthDate: born(62), sex: 'm', egn: '', phone: '0888123456' });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const id = created.data.patient.id;
  await call('POST', `/api/patients/${id}/meds`, { drug: 'ramipril', start: addMonths(T, -6) });
  await call('POST', `/api/patients/${id}/results`, { date: addDays(T, -1), items: [{ code: 'k', value: 6.1 }] });
  await call('POST', `/api/patients/${id}/visits`, { date: T, complaint: 'Иван казва: кръв в изпражненията. Без болка в гърдите.' });
  return id;
}

test('API: списък на практиката, подсказки в досието и решенията на лекаря', async () => {
  await withApp(async ({ call, spaces }) => {
    const id = await setupGp(call);

    const list = await call('GET', '/api/assistant');
    assert.equal(list.status, 200);
    assert.equal(list.data.patients[0].id, id);
    assert.equal(list.data.patients[0].severity, 3);
    assert.ok(list.data.totals.bySeverity[3] >= 2);
    const urgent = await call('GET', '/api/assistant?severity=3&category=symptom');
    assert.ok(urgent.data.patients[0].findings.every(f => f.severity === 3 && f.category === 'symptom'));

    const view = await call('GET', `/api/patients/${id}`);
    assert.ok(view.data.assistant.active >= 2);
    assert.equal(view.data.assistant.severity, 3);

    const mine = await call('GET', `/api/patients/${id}/assistant`);
    const kHigh = mine.data.active.find(f => f.rule === 'k_high');
    assert.ok(kHigh);
    assert.ok(!mine.data.active.some(f => f.rule === 'text_chest_pain'), '„без болка в гърдите“ не е сигнал');

    // Прието с напомняне.
    const acc = await call('POST', `/api/patients/${id}/assistant/feedback`, { key: kHigh.key, status: 'accepted', until: addDays(T, 7), remind: true });
    assert.equal(acc.status, 200, JSON.stringify(acc.data));
    assert.ok(acc.data.handled.some(f => f.key === kHigh.key));
    const p = spaces.gp.patient(id);
    assert.equal(p.reminders.length, 1);
    assert.equal(p.reminders[0].date, addDays(T, 7));
    assert.match(p.reminders[0].text, /^Асистент: /);

    // Грешни решения.
    assert.equal((await call('POST', `/api/patients/${id}/assistant/feedback`, { key: kHigh.key, status: 'maybe' })).status, 400);
    assert.equal((await call('POST', `/api/patients/${id}/assistant/feedback`, { key: kHigh.key, status: 'snoozed', until: addDays(T, -1) })).status, 400);
    assert.equal((await call('POST', `/api/patients/${id}/assistant/feedback`, { key: kHigh.key, status: 'snoozed', until: addDays(T, 2000) })).status, 400);
    assert.equal((await call('POST', `/api/patients/${id}/assistant/feedback`, { status: 'done' })).status, 400);
    assert.equal((await call('POST', '/api/patients/nope/assistant/feedback', { key: 'x', status: 'done' })).status, 404);

    // Връщане.
    const back = await call('POST', `/api/patients/${id}/assistant/feedback`, { key: kHigh.key, status: 'reset' });
    assert.ok(back.data.active.some(f => f.key === kHigh.key));

    // Журналът записва решението.
    const audit = await call('GET', '/api/audit?limit=20');
    assert.ok(audit.data.entries.some(e => e.action === 'assistant_feedback' && e.status === 'accepted'));

    // Решенията не трупат файла безкрайно.
    for (let i = 0; i < 405; i++) p.assistant[`x:${i}`] = { status: 'done', until: '', at: `2020-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` };
    await call('POST', `/api/patients/${id}/assistant/feedback`, { key: kHigh.key, status: 'done' });
    assert.ok(Object.keys(spaces.gp.patient(id).assistant).length <= 400);
    assert.ok(spaces.gp.patient(id).assistant[kHigh.key], 'новото решение се пази');
  });
});

test('API: асистентът работи и в практиката за СИМП', async () => {
  await withApp(async ({ call }) => {
    await setupGp(call);
    const setup = await call('POST', '/api/setup', { workspace: 'simp', practiceName: 'СИМП', doctorName: 'д-р Кардиолог', specialties: ['cardio'] });
    assert.equal(setup.status, 200, JSON.stringify(setup.data));
    const pt = await call('POST', '/api/patients', { name: 'Петър Петров', birthDate: born(70), sex: 'm' });
    const id = pt.data.patient.id;
    await call('POST', `/api/patients/${id}/results`, { date: addDays(T, -2), items: [{ code: 'hb', value: 105 }] });
    const list = await call('GET', '/api/assistant');
    assert.deepEqual(list.data.patients.map(p => p.id), [id], 'само пациентите на СИМП');
    const acc = await call('POST', `/api/patients/${id}/assistant/feedback`, { key: list.data.patients[0].findings[0].key, status: 'accepted' });
    assert.equal(acc.status, 200);
  });
});

/* ------------------------------ езиков модел: API ------------------------------ */

const KEY = 'sk-ant-api03-' + 'a'.repeat(40) + 'WXYZ';

function mockClient(respond) {
  const calls = [];
  return {
    calls,
    factory: (apiKey) => ({
      messages: { create: async (params) => { calls.push({ apiKey, params, kind: 'create' }); return { model: params.model, content: [{ type: 'text', text: 'готово' }], stop_reason: 'end_turn' }; } },
      beta: {
        messages: {
          stream: (params) => {
            calls.push({ apiKey, params, kind: 'stream' });
            return { finalMessage: async () => respond(params) };
          },
        },
      },
    }),
  };
}

test('API: настройката на езиковия модел — само на този компютър, ключът не излиза', async () => {
  await withApp(async ({ call, dir }) => {
    await setupGp(call);
    const start = await call('GET', '/api/ai');
    assert.equal(start.data.enabled, false);
    assert.equal(start.data.hasKey, false);
    assert.equal(start.data.canChange, true);
    assert.equal(start.data.model, 'claude-opus-5-5');

    // От друг компютър — отказ.
    const remote = await call('PUT', '/api/ai', { enabled: true, apiKey: KEY }, { 'X-Forwarded-For': '192.168.1.20' });
    assert.equal(remote.status, 403);
    assert.equal((await call('POST', '/api/ai/test', {}, { 'X-Forwarded-For': '192.168.1.20' })).status, 403);

    assert.equal((await call('PUT', '/api/ai', { enabled: true })).status, 400, 'без ключ не се включва');
    assert.equal((await call('PUT', '/api/ai', { apiKey: 'sk-grешен' })).status, 400);

    const saved = await call('PUT', '/api/ai', { enabled: true, apiKey: KEY });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.keyHint, '…WXYZ');
    assert.ok(!JSON.stringify(saved.data).includes(KEY));
    const file = path.join(dir, 'ai.json');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, KEY);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);

    const got = await call('GET', '/api/ai');
    assert.equal(got.data.enabled, true);
    assert.ok(!JSON.stringify(got.data).includes(KEY));

    // Ключът не е в експорта, в журнала и в данните на практиката.
    const exp = await call('GET', '/api/export');
    assert.ok(!JSON.stringify(exp.data).includes(KEY));
    const audit = await call('GET', '/api/audit?limit=50');
    assert.ok(!JSON.stringify(audit.data).includes(KEY));
    assert.ok(!fs.readFileSync(path.join(dir, 'practice.json'), 'utf8').includes(KEY));

    // Проверка на връзката с подменен клиент.
    const mock = mockClient(() => null);
    setAiClientFactory(mock.factory);
    const t = await call('POST', '/api/ai/test', {});
    assert.equal(t.status, 200, JSON.stringify(t.data));
    assert.equal(mock.calls[0].apiKey, KEY);

    // Изключване и премахване.
    const off = await call('PUT', '/api/ai', { enabled: false, apiKey: '' });
    assert.equal(off.data.hasKey, false);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey, '');
  });
});

test('API: втори поглед — обезличен текст, отговорът се пази в досието', async () => {
  await withApp(async ({ call, spaces }) => {
    const id = await setupGp(call);
    // Без включен модел — отказ.
    assert.equal((await call('POST', `/api/patients/${id}/assistant/ai`, {})).status, 400);

    const preview = await call('POST', `/api/patients/${id}/assistant/ai/preview`, {});
    assert.equal(preview.status, 200);
    const text = preview.data.text;
    assert.ok(!/Иван|Петров|0888/.test(text), text);
    assert.ok(!text.includes(T), 'без точни дати');
    assert.match(text, /мъж, 62 г\./);
    assert.match(text, /Рамиприл, от 6 мес\.\n/, 'без празна схема и без двойна точка');
    assert.match(text, /K⁺|Калий|K /);
    assert.match(text, /кръв в изпражненията/);

    await call('PUT', '/api/ai', { enabled: true, apiKey: KEY });
    const answer = {
      summary: 'Хиперкалиемия при АСЕ инхибитор и ректално кървене.',
      caveats: 'Няма ПКК.',
      suggestions: [{ title: 'ПКК и феритин', action: 'Днес', why: 'кървене', urgency: 'urgent', source: 'NICE NG12' }],
    };
    const mock = mockClient(() => ({
      model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 300 },
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(answer) }],
    }));
    setAiClientFactory(mock.factory);
    const res = await call('POST', `/api/patients/${id}/assistant/ai`, {});
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.review.suggestions[0].severity, 3);
    const sent = mock.calls.find(c => c.kind === 'stream').params;
    assert.equal(sent.model, 'claude-opus-5-5');
    assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(sent.fallbacks, 'default');
    assert.equal(sent.output_config.format.type, 'json_schema');
    assert.equal(sent.messages[0].content, text, 'изпраща се точно показаният текст');
    assert.equal(spaces.gp.patient(id).aiReview.summary, answer.summary);
    const again = await call('GET', `/api/patients/${id}/assistant`);
    assert.equal(again.data.review.suggestions.length, 1);
    const audit = await call('GET', '/api/audit?limit=20');
    const entry = audit.data.entries.find(e => e.action === 'ai_review');
    assert.equal(entry.inputTokens, 900);

    // Твърде скоро за същото досие.
    assert.equal((await call('POST', `/api/patients/${id}/assistant/ai`, {})).status, 429);
  });
});

test('API: отказ, непълен отговор и смяна на модела по време на отговора', async () => {
  await withApp(async ({ call }) => {
    await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'Практика', doctorName: 'д-р Тест' });
    await call('PUT', '/api/ai', { enabled: true, apiKey: KEY });
    const mk = async (name) => (await call('POST', '/api/patients', { name, birthDate: born(50), sex: 'f' })).data.patient.id;
    const good = { summary: 'ok', caveats: '', suggestions: [] };

    setAiClientFactory(mockClient(() => ({ model: 'x', stop_reason: 'refusal', content: [] })).factory);
    const refused = await call('POST', `/api/patients/${await mk('А Б')}/assistant/ai`, {});
    assert.equal(refused.status, 502);
    assert.match(refused.data.error, /отказа/);

    setAiClientFactory(mockClient(() => ({ model: 'x', stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"summ' }] })).factory);
    assert.match((await call('POST', `/api/patients/${await mk('В Г')}/assistant/ai`, {})).data.error, /непълен/);

    setAiClientFactory(mockClient(() => ({ model: 'x', stop_reason: 'end_turn', content: [{ type: 'text', text: 'не е JSON' }] })).factory);
    assert.equal((await call('POST', `/api/patients/${await mk('Д Е')}/assistant/ai`, {})).status, 502);

    // Частичният текст преди смяната на модела не се чете.
    setAiClientFactory(mockClient(() => ({
      model: 'claude-opus-4-8', stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"summary": "част' }, { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } }, { type: 'text', text: JSON.stringify(good) }],
    })).factory);
    const fb = await call('POST', `/api/patients/${await mk('Ж З')}/assistant/ai`, {});
    assert.equal(fb.status, 200, JSON.stringify(fb.data));
    assert.equal(fb.data.review.model, 'claude-opus-4-8');

    // Грешка от клиента не сваля сървъра.
    setAiClientFactory(() => ({ beta: { messages: { stream: () => ({ finalMessage: async () => { throw new Error('мрежа'); } }) } } }));
    assert.equal((await call('POST', `/api/patients/${await mk('И Й')}/assistant/ai`, {})).status, 502);
  });
});
