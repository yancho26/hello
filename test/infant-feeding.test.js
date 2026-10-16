/* Версия 4.10: хранене на кърмачето до 1 година — количества, захранване, очакван растеж, API и PDF. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import {
  FOOD_GROUPS, PLAN_MONTHS, cleanFeeding, energyNeed, feedingFlags, infantFeedingPlan, monthDate,
} from '../public/js/shared/infant-feeding.js';
import { lmsAt, valueAtZ, zScore } from '../public/js/shared/growth.js';
import { infantReport } from '../public/js/shared/pdf/infant-report.js';
import { parseTTF } from '../public/js/shared/pdf/ttf.js';
import { Store, normalizeData } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';

const AS_OF = '2026-10-14';
const plan = (o = {}) => infantFeedingPlan({ sex: 'm', birthDate: '2026-08-10', asOf: AS_OF, feeding: 'formula', solidsStart: 6, birth: { weight: 3.45, height: 51, gestWeeks: 39 }, measurements: [], ...o });

test('енергия: FAO/WHO/UNU 2004, таблица 3.2 — момчета от 0 до 9 месеца', () => {
  // [месец, тегло, дневна нужда kcal] от таблицата.
  for (const [m, kg, kcal] of [[0, 4.58, 518], [1, 5.50, 570], [2, 6.28, 596], [3, 6.94, 569], [4, 7.48, 608], [5, 7.93, 639], [6, 8.30, 653], [7, 8.62, 680], [8, 8.89, 702]]) {
    assert.ok(Math.abs(energyNeed('m', m, kg) - kcal) <= 2, `${m} мес.: ${energyNeed('m', m, kg)} срещу ${kcal}`);
  }
  // Момичетата отлагат повече енергия в 3-ия месец, момчетата — в първия.
  assert.ok(energyNeed('f', 3, 6.5) > energyNeed('m', 3, 6.5));
  assert.ok(energyNeed('m', 0, 4) > energyNeed('f', 0, 4));
});

test('първата седмица: 70 или 80 мл × денят от живота, 6–7 хранения през 3–3,5 ч. (НЦОЗА 2013)', () => {
  const small = plan({ birthDate: addDays(AS_OF, -3), birth: { weight: 3.1, height: 50, gestWeeks: 40 } }).now.firstWeek;
  assert.deepEqual([small.day, small.coef, small.daily, small.perFeed, small.feedsText], [4, 70, 280, 40, '6–7']);
  assert.equal(small.schedule.items.length, 7);
  assert.ok(small.schedule.items.every(i => i.what.includes('40 мл')));
  const big = plan({ birthDate: addDays(AS_OF, -2), birth: { weight: 3.4, height: 51, gestWeeks: 40 } }).now.firstWeek;
  assert.deepEqual([big.day, big.coef, big.daily], [3, 80, 240]);
  // Кърмене, недоносено дете и след първата седмица — без формулата.
  assert.equal(plan({ birthDate: addDays(AS_OF, -3), feeding: 'breast' }).now.firstWeek, undefined);
  assert.equal(plan({ birthDate: addDays(AS_OF, -3), birth: { weight: 2.2, gestWeeks: 34 } }).now.firstWeek, undefined);
  assert.equal(plan({ birthDate: addDays(AS_OF, -8) }).now.firstWeek, undefined);
});

test('мляко по месеци: брой хранения, количество на хранене и на ден, таван 960 мл', () => {
  const p = plan();
  assert.equal(p.months.length, PLAN_MONTHS);
  assert.deepEqual(p.months.slice(0, 6).map(m => m.feeds), [8, 7, 6, 6, 6, 6]);
  for (const m of p.months.slice(0, 6)) {
    const f = m.formula;
    assert.ok(f.dailyMin <= f.dailyMax && f.dailyMax <= 960, `${m.month}: ${f.dailyMin}–${f.dailyMax}`);
    assert.equal(f.feeds, m.feeds);
    assert.ok(f.perFeedMin * f.feeds <= f.dailyMax + 40 && f.perFeedMax * f.feeds >= f.dailyMin - 40, `${m.month}: на хранене ${f.perFeedMin}–${f.perFeedMax}`);
    // Горната граница е 150 мл/кг (НЦОЗА 2013), долната — енергийната нужда при 0,67 kcal/мл.
    const mid = (m.growth.start.weight + m.growth.end.weight) / 2;
    assert.ok(Math.abs(f.dailyMax - Math.min(960, Math.max(150 * mid, m.energy / 0.67))) <= 10, `${m.month}: ${f.dailyMax}`);
    assert.ok(Math.abs(f.dailyMin - Math.min(960, 150 * mid, m.energy / 0.67)) <= 10, `${m.month}: ${f.dailyMin}`);
  }
  // След захранването: 5 хранения, млякото — около 500 мл на ден, порциите по НЦОЗА (таблица 9).
  for (const m of p.months.slice(7)) {
    assert.equal(m.feeds, 5);
    assert.deepEqual([m.formula.dailyMin, m.formula.dailyMax], [500, 500]);
    assert.ok(m.portion.to >= 180 && m.portion.to <= 210);
  }
  assert.ok(p.months[6].firstSolidMonth && !p.months[5].solids);
  // Голямо бебе: 150 мл/кг надхвърля 960 мл — остава таванът (AAP).
  const big = plan({ measurements: [{ date: '2026-10-10', weight: 7.9, height: 62 }] });
  assert.ok(big.months.slice(0, 6).every(m => m.formula.dailyMax <= 960));
  assert.ok(big.months.some(m => m.formula.dailyMax === 960));
  // Примерният ден има толкова млечни хранения и хранения с храна, колкото са хранениата (плюс закуска).
  for (const m of p.months) assert.equal(m.day.items.length, m.feeds + (m.snacks ? 1 : 0), `${m.month} мес.`);
});

test('захранване: от 4, 5 или 6 месеца — храните се изместват, алергените не се отлагат', () => {
  for (const start of [4, 5, 6]) {
    const p = plan({ solidsStart: start });
    assert.ok(p.months[start].firstSolidMonth, `${start}`);
    assert.ok(p.months.slice(0, start).every(m => !m.solids));
    assert.ok(p.months.slice(start).every(m => m.solids));
    for (const f of p.foods) assert.ok(f.from >= start && f.to >= f.from, f.id);
    assert.equal(p.foods.find(f => f.id === 'veg').from, start);
  }
  const p4 = plan({ solidsStart: 4 });
  assert.deepEqual(p4.foods.map(f => f.id), FOOD_GROUPS.map(f => f.id));
  // Алергените (яйце, фъстъци, глутен, риба, млечни, ядки) — в първите 2–3 месеца на захранването (версия 4.12).
  for (const start of [4, 5, 6]) {
    for (const f of plan({ solidsStart: start }).foods.filter(x => x.allergen)) assert.ok(f.from <= Math.max(start + 1, 6) && f.to <= 8, `${start}: ${f.id}`);
  }
  // Храната на бучки и за ядене с пръсти — от 8 месеца (ESPGHAN 2017: до 8–10 месеца); закуските — от 9 месеца.
  assert.equal(p4.foods.find(f => f.id === 'finger').from, 8);
  assert.deepEqual(plan().months.map(m => !!m.snacks), [...Array(9).fill(false), true, true, true]);
  // Риск от алергия — правилото за ранните фъстъци (NIAID 2017); фъстъците са за всички деца.
  assert.ok(plan({ allergyRisk: true }).rules.some(r => /Тежка екзема/.test(r.text)));
  assert.ok(!plan().rules.some(r => /Тежка екзема/.test(r.text)));
  assert.ok(plan().rules.some(r => /фъстъц/.test(r.text)));
  // Всяко правило е с източник; кърмените нямат правилото за приготвяне на мляко.
  assert.ok(plan().rules.every(r => r.text && r.src));
  assert.ok(plan({ feeding: 'breast' }).rules.length < plan().rules.length);
});

test('растеж: пътят по кривата на детето е по СЗО (LMS), иначе от рожденото тегло или медианата', () => {
  const meas = [{ date: '2026-09-12', weight: 4.4, height: 55 }, { date: '2026-10-01', weight: 5.1, height: 57 }];
  const p = plan({ measurements: meas });
  const months = (new Date('2026-10-01') - new Date('2026-08-10')) / 86400000 / 30.4375;
  const z = zScore('weight', 'm', months, 5.1);
  assert.equal(p.growth.trackFrom, 'measurement');
  assert.ok(Math.abs(p.growth.zWeight - z) < 0.01);
  for (const k of [0, 3, 6, 9]) {
    const s = p.months[k].growth.start;
    assert.ok(Math.abs(s.weight - valueAtZ(lmsAt('weight', 'm', k), z)) < 0.02, `${k} мес.`);
    assert.ok(s.weightP3 < s.weightMedian && s.weightMedian < s.weightP97);
    assert.ok(s.lengthP3 < s.lengthMedian && s.lengthMedian < s.lengthP97);
  }
  assert.ok(p.months.every((m, i) => i === 0 || m.growth.start.weight > p.months[i - 1].growth.start.weight));
  // Наддаването на месец намалява с възрастта.
  assert.ok(p.months[0].growth.gain > p.months[6].growth.gain && p.months[6].growth.gain > p.months[11].growth.gain);
  // Без измервания — от теглото при раждане; без тегло — медианата и бележка.
  const fromBirth = plan();
  assert.equal(fromBirth.growth.trackFrom, 'birth');
  assert.ok(Math.abs(fromBirth.growth.atBirth.weight - 3.45) < 0.02);
  const none = plan({ birth: {} });
  assert.equal(none.growth.trackFrom, null);
  assert.equal(none.months[4].growth.start.weight, none.months[4].growth.start.weightMedian);
  assert.ok(none.notes.some(n => /медианата/.test(n)));
  // Крайни стойности не се проектират отвъд ±3 SD.
  const tiny = plan({ measurements: [{ date: '2026-10-10', weight: 2.6 }] });
  assert.ok(Math.abs(tiny.months[11].growth.start.weight - valueAtZ(lmsAt('weight', 'm', 11), -3)) < 0.02);
});

test('недоносено и с ниско тегло: коригирана възраст и предупреждения', () => {
  const p = plan({ birthDate: '2026-07-01', feeding: 'breast', birth: { weight: 2.1, height: 44, gestWeeks: 33 }, measurements: [{ date: '2026-09-20', weight: 3.6, height: 50 }] });
  assert.ok(p.age.corrected);
  assert.ok(Math.abs(p.age.chronological - p.age.months - 49 / 30.4375) < 0.05);
  assert.equal(p.age.currentMonth, 1);
  assert.ok(p.warnings.some(w => /33 гестационна седмица/.test(w)));
  assert.ok(p.warnings.some(w => /под 2500 г/.test(w)));
  // Датите на месеците са по коригираната възраст: „0 месеца“ е термът.
  assert.equal(monthDate('2026-07-01', 0, 33), '2026-08-19');
  assert.equal(monthDate('2026-08-10', 2, 39), '2026-10-10');
  // Преди терма не се изчислява път по кривата.
  const early = plan({ birthDate: '2026-09-20', birth: { weight: 1.9, gestWeeks: 32 }, measurements: [{ date: '2026-10-10', weight: 2.2 }] });
  assert.equal(early.growth.trackFrom, null);
});

test('първите седмици: загуба над 10% и забавено възстановяване на рожденото тегло (NICE NG75, СЗО)', () => {
  const b = { weight: 3.5, height: 51, gestWeeks: 40 };
  const loss = plan({ birthDate: addDays(AS_OF, -4), birth: b, measurements: [{ date: AS_OF, weight: 3.1 }] });
  assert.equal(loss.growth.early[0].level, 'warn');
  assert.match(loss.growth.early[0].text, /11%/);
  assert.equal(plan({ birthDate: addDays(AS_OF, -4), birth: b, measurements: [{ date: AS_OF, weight: 3.25 }] }).growth.early.length, 0);
  const d16 = plan({ birthDate: addDays(AS_OF, -16), birth: b, measurements: [{ date: AS_OF, weight: 3.4 }] }).growth.early;
  assert.deepEqual(d16.map(x => x.level), ['info']);
  const d23 = plan({ birthDate: addDays(AS_OF, -23), birth: b, measurements: [{ date: AS_OF, weight: 3.4 }] }).growth.early;
  assert.deepEqual(d23.map(x => x.level), ['warn']);
  // След първия месец ранните знаци не се показват.
  assert.equal(plan({ birthDate: addDays(AS_OF, -40), birth: b, measurements: [{ date: AS_OF, weight: 3.4 }] }).growth.early.length, 0);
});

test('сигнали и възрастови съвети: началото на захранването, след 1 година — само бележка', () => {
  const at6 = plan({ birthDate: addMonths(AS_OF, -6) });
  assert.ok(feedingFlags(at6).some(f => /захранване е започнало/.test(f.text)));
  const at7 = plan({ birthDate: addDays(AS_OF, -213) });
  assert.ok(feedingFlags(at7).some(f => /да не се отлага/.test(f.text)));
  const at10 = plan({ birthDate: addMonths(AS_OF, -10) });
  assert.equal(feedingFlags(at10).length, 0);
  const done = plan({ birthDate: addMonths(AS_OF, -14) });
  assert.ok(done.now.done);
  assert.equal(feedingFlags(done).length, 0);
  assert.ok(done.notes.some(n => /навършило 1 година/.test(n)));
  // Съветите за пелените и спада след раждането са само за малките.
  assert.ok(plan({ birthDate: addDays(AS_OF, -10) }).adequacy.some(a => /спадът на теглото/i.test(a)));
  assert.ok(!at10.adequacy.some(a => /спадът на теглото|пелени/i.test(a)));
  assert.ok(at10.adequacy.some(a => /500 мл/.test(a)));
});

test('настройките в досието: почистване на повредени данни', () => {
  assert.equal(cleanFeeding(null), null);
  assert.equal(cleanFeeding([]), null);
  assert.deepEqual(cleanFeeding({ type: 'мляко', solidsStart: 9, allergyRisk: 'да' }), { type: 'breast', solidsStart: 6, allergyRisk: false, updatedAt: null });
  assert.deepEqual(cleanFeeding({ type: 'mixed', solidsStart: '5', allergyRisk: true, updatedAt: '2026-10-14T10:00:00.000Z' }),
    { type: 'mixed', solidsStart: 5, allergyRisk: true, updatedAt: '2026-10-14T10:00:00.000Z' });
  const data = { patients: [{ id: 'x', name: 'А', sex: 'm', birthDate: '2026-05-01', feeding: { type: 'formula', solidsStart: 4 } }, { id: 'y', name: 'Б', sex: 'f', birthDate: '2026-05-01', feeding: 'зле' }] };
  normalizeData(data);
  assert.equal(data.patients[0].feeding.type, 'formula');
  assert.equal(data.patients[1].feeding, null);
});

test('API: настройки за храненето — проверка, само за кърмачета, запис и одит', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-infant-'));
  const server = createAppServer({ workspaces: new Workspaces(new Store(dir)), serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (method, url, body) => {
    const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(baseUrl + url, {
      method, body: body && JSON.stringify(body),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    await call('POST', '/api/setup', { workspace: 'gp', practiceName: 'П', doctorName: 'д-р Т' });
    const baby = await call('POST', '/api/patients', { name: 'Бебе Тест', birthDate: addMonths(today(), -3), sex: 'f' });
    const id = baby.data.patient.id;
    const put = await call('PUT', `/api/patients/${id}/feeding`, { type: 'mixed', solidsStart: 5, allergyRisk: true });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.feeding.type, 'mixed');
    assert.ok(put.data.feeding.updatedAt);
    for (const bad of [{ type: 'мляко' }, { type: 'breast', solidsStart: 3 }, { type: 'breast', solidsStart: 7 }, { type: 'breast', allergyRisk: 'да' }, []]) {
      assert.equal((await call('PUT', `/api/patients/${id}/feeding`, bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call('PUT', '/api/patients/няма/feeding', { type: 'breast' })).status, 404);
    const big = await call('POST', '/api/patients', { name: 'Голямо Дете', birthDate: addMonths(today(), -30), sex: 'm' });
    assert.equal((await call('PUT', `/api/patients/${big.data.patient.id}/feeding`, { type: 'breast' })).status, 400);
    // Пази се след повторно зареждане; лошата заявка не е променила записа.
    const p = (await call('GET', `/api/patients/${id}`)).data.patient;
    assert.deepEqual([p.feeding.type, p.feeding.solidsStart, p.feeding.allergyRisk], ['mixed', 5, true]);
    const store2 = new Store(dir);
    assert.equal(store2.patient(id).feeding.solidsStart, 5);
    assert.ok(store2.readAudit(50).some(e => e.action === 'feeding_update'));
  } finally {
    server.close();
  }
});

/* ------------------------------------ PDF ------------------------------------ */

const F = new URL('../public/fonts/', import.meta.url);
const read = (f) => new Uint8Array(fs.readFileSync(new URL(f, F)));
const fonts = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };

function pdfParts(bytes) {
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.7') && s.trimEnd().endsWith('%%EOF'));
  const start = Number(/startxref\n(\d+)/.exec(s)[1]);
  const count = Number(/xref\n0 (\d+)/.exec(s.slice(start))[1]);
  const objs = s.slice(start).split('\n').slice(3, 2 + count).map((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `обект ${i + 1}`);
    return s.slice(off, s.indexOf('endobj', off));
  });
  const content = objs.filter(o => o.includes('stream\n') && o.includes('/FlateDecode')).map(o => {
    try { return zlib.inflateSync(Buffer.from(o.slice(o.indexOf('stream\n') + 7, o.lastIndexOf('\nendstream')), 'latin1')).toString('latin1'); } catch { return ''; }
  }).join('\n');
  return { all: objs.join('\n'), content };
}
const hexOf = (ttf, text) => [...text].map(ch => ttf.glyph(ch.codePointAt(0)).toString(16).padStart(4, '0')).join('');

test('PDF за родителя: всички раздели, 12 месеца и отметки', async () => {
  const person = { name: 'Никола Петров', birthDate: '2026-08-10', sex: 'm', birth: { weight: 3.45, height: 51, gestWeeks: 39 }, measurements: [{ date: '2026-10-01', weight: 5.1, height: 57 }] };
  for (const feeding of ['formula', 'breast', 'mixed']) {
    const p = infantFeedingPlan({ ...person, asOf: AS_OF, feeding, solidsStart: 6, allergyRisk: true });
    const bytes = await infantReport({ plan: p, person, practice: { name: 'П', phone: '' }, doctor: { name: 'д-р Т' }, fonts, version: '4.10.0', date: AS_OF });
    const { all, content } = pdfParts(bytes);
    const pages = (all.match(/\/Type \/Page /g) || []).length;
    assert.ok(pages >= 8 && pages <= 16, `${feeding}: ${pages} страници`);
    const b = parseTTF(fonts.bold);
    for (const title of ['Очакван растеж до 1 година', 'План по месеци', 'Кога се въвежда всяка храна', 'Правила']) assert.ok(content.includes(hexOf(b, title)), `${feeding}: ${title}`);
    const sb = parseTTF(fonts.semibold);
    for (const m of p.months) assert.ok(content.includes(hexOf(b, m.label.split(' ')[0])) || content.includes(hexOf(sb, m.label.split(' ')[0])), m.label);
    assert.ok((all.match(/\/Title <FEFF/g) || []).length >= 5);
    assert.ok(bytes.length < 400000, `${bytes.length} байта`);
  }
  // Без дата на раждане и измервания — пак валиден файл.
  const p = infantFeedingPlan({ sex: 'f', birthDate: addMonths(AS_OF, -2), asOf: AS_OF });
  pdfParts(await infantReport({ plan: p, person: { name: '', birthDate: addMonths(AS_OF, -2), sex: 'f' }, fonts, date: AS_OF }));
});

test('всички модули на интерфейса са синтактично верни (браузърът не ги проверява преди зареждане)', () => {
  const root = new URL('../public/js/', import.meta.url).pathname;
  const files = fs.readdirSync(root, { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join(root, f));
  assert.ok(files.length > 40);
  const bad = files.filter(f => spawnSync(process.execPath, ['--check', f]).status !== 0);
  assert.deepEqual(bad, []);
});
