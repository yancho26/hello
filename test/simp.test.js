/* Версия 4.0: две отделни практики (ОПЛ и СИМП) с избор при входа и
 * функциите на СИМП — направления, прегледи, протоколи, диспансерно
 * наблюдение, график с часове, табло и справки. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, normalizeData } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addDays, addMonths, today } from '../public/js/shared/dates.js';
import {
  daySlots, firstFree, followupState, isoWeekday, overlapping, protocolState, referralState, simpSummary,
} from '../public/js/shared/simp.js';

const T = today();
const born = (years) => addMonths(T, -12 * years);

/** Сървър с двете практики и „браузър“, който пази бисквитките. */
async function withApp(fn, prepare = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-simp-'));
  const spaces = new Workspaces(new Store(dir));
  prepare(spaces);
  const server = createAppServer({ workspaces: spaces, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = () => {
    const jar = new Map();
    const call = async (method, url, body, headers = {}) => {
      const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + url, {
        method,
        body: body && JSON.stringify(body),
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (attrs.some(a => /max-age=0/i.test(a))) jar.delete(name); else jar.set(name, value);
      }
      return { status: res.status, data: await res.json().catch(() => null) };
    };
    call.jar = jar;
    return call;
  };
  try {
    await fn({ browser, spaces, dir });
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    for (const s of spaces.all()) await s.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------- логика ------------------------------- */

test('направление: очаква преглед, срок за вторичен преглед, изпълнено', () => {
  const ref = { id: 'r1', issued: addDays(T, -10) };
  assert.equal(referralState(ref, [], T).status, 'new');
  assert.equal(referralState(ref, [], T).waiting, 10);
  const primary = { simp: true, referralId: 'r1', examType: 'primary', date: addDays(T, -5) };
  const st = referralState(ref, [primary], T, 30);
  assert.equal(st.status, 'secondary');
  assert.equal(st.secondaryUntil, addDays(T, 25));
  assert.equal(st.daysLeft, 25);
  assert.equal(referralState(ref, [{ ...primary, date: addDays(T, -31) }], T, 30).status, 'done', 'срокът е минал');
  const secondary = { simp: true, referralId: 'r1', examType: 'secondary', date: T };
  assert.equal(referralState(ref, [primary, secondary], T).status, 'done');
  assert.equal(referralState({ ...ref, closed: true }, [], T).status, 'closed');
  assert.equal(referralState(ref, [{ ...primary, simp: false }], T).status, 'new', 'прегледите на ОПЛ не се броят');
});

test('диспансерно наблюдение: от последния преглед плюс интервала', () => {
  const f = { since: addMonths(T, -8), everyMonths: 6 };
  assert.equal(followupState(f, [], T).status, 'overdue', 'без нито един преглед от началото');
  const recent = [{ simp: true, examType: 'dispensary', date: addMonths(T, -2) }];
  const ok = followupState(f, recent, T);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.due, addMonths(addMonths(T, -2), 6));
  assert.equal(followupState(f, [{ simp: true, examType: 'dispensary', date: addDays(addMonths(T, -6), 10) }], T, 30).status, 'soon');
  assert.equal(followupState(f, [{ simp: true, examType: 'dispensary', date: addDays(addMonths(T, -6), -10) }], T).status, 'due');
  assert.equal(followupState(f, [{ simp: true, examType: 'paid', date: T }], T).status, 'overdue', 'платеният преглед не е диспансерен');
  assert.equal(followupState({ ...f, status: 'ended' }, recent, T).status, 'ended');
});

test('протокол: активен, изтичащ, изтекъл, подновен', () => {
  assert.equal(protocolState({ validUntil: addDays(T, 100) }, T, 30).status, 'active');
  assert.equal(protocolState({ validUntil: addDays(T, 20) }, T, 30).status, 'expiring');
  assert.equal(protocolState({ validUntil: T }, T, 30).label, 'Изтича днес');
  assert.equal(protocolState({ validUntil: addDays(T, -1) }, T, 30).status, 'expired');
  assert.equal(protocolState({ validUntil: addDays(T, -1), status: 'renewed' }, T).status, 'renewed');
  assert.equal(protocolState({ validUntil: addDays(T, 5), status: 'cancelled' }, T).status, 'cancelled');
});

test('график: свободни интервали, застъпване, първи свободен час', () => {
  const agenda = { start: '08:00', end: '10:00', slot: 30, days: [1, 2, 3, 4, 5] };
  let monday = T;
  while (isoWeekday(monday) !== 1) monday = addDays(monday, 1);
  const appts = [
    { id: 'a', date: monday, time: '08:30', minutes: 30, status: 'booked' },
    { id: 'b', date: monday, time: '09:00', minutes: 30, status: 'cancelled' },
    { id: 'c', date: monday, time: '18:00', minutes: 20, status: 'booked' },
  ];
  const day = daySlots(agenda, monday, appts);
  assert.equal(day.working, true);
  assert.deepEqual(day.slots.map(s => s.free), [true, false, true, true], 'отказаният час не заема място');
  assert.equal(day.outside.length, 1, 'часът след работно време се вижда отделно');
  assert.equal(daySlots(agenda, addDays(monday, 5), []).working, false, 'събота');
  assert.equal(overlapping(appts, { id: 'x', date: monday, time: '08:45', minutes: 20, doctorId: '' }).length, 1);
  assert.equal(overlapping(appts, { id: 'x', date: monday, time: '08:45', minutes: 20, doctorId: 'd2' }).length, 0, 'друг лекар');
  assert.equal(overlapping(appts, { id: 'x', date: monday, time: '09:00', minutes: 30, doctorId: '' }).length, 0);
  assert.deepEqual(firstFree(agenda, appts, monday, '08:10'), { date: monday, time: '09:00' });
});

test('обобщение на СИМП: сигнали за наблюдение, протокол и срок за вторичен преглед', () => {
  const p = {
    visits: [{ simp: true, examType: 'primary', referralId: 'r1', date: addDays(T, -27), type: 'Първичен преглед' }],
    referrals: [{ id: 'r1', issued: addDays(T, -30), purpose: 'consult' }],
    followups: [{ id: 'f1', diagnosis: 'Хипертония', since: addDays(T, -10), everyMonths: 6 }],
    protocols: [{ id: 'p1', number: '123', drugs: ['Дапаглифлозин'], validUntil: addDays(T, -3), status: 'active' }],
  };
  const s = simpSummary(p, { secondaryDays: 30, protocolWarnDays: 30, horizonDays: 30 }, T);
  assert.equal(s.lastExam.examType, 'primary');
  assert.deepEqual(s.alerts.map(a => a.kind).sort(), ['followup', 'protocol', 'referral']);
  p.protocols.push({ id: 'p2', drugs: ['Дапаглифлозин'], validUntil: addDays(T, 360), renewedFrom: 'p1', status: 'active' });
  const again = simpSummary(p, { secondaryDays: 30, protocolWarnDays: 30 }, T);
  assert.ok(!again.alerts.some(a => a.kind === 'protocol'), 'подновеният протокол не е сигнал');
});

test('проверката при зареждане поправя часовете и работното време', () => {
  const d = {
    kind: 'simp',
    settings: { agenda: { start: '25:00', end: '07:00', slot: 7, days: [9] }, secondaryDays: 'x' },
    appointments: [{ id: 'a', date: T, time: '09:00', minutes: 999, status: 'weird' }, { id: 'b', date: 'вчера', time: '9' }, 'junk'],
    patients: [{ id: 'p', name: 'X', protocols: [{ id: 'pr', drugs: 'Инсулин' }, { id: 'pr2', drugs: ['a', 5] }] }],
  };
  normalizeData(d);
  assert.deepEqual(d.settings.agenda, { start: '08:00', end: '16:00', slot: 20, days: [1, 2, 3, 4, 5] });
  assert.equal(d.settings.secondaryDays, 30);
  assert.equal(d.appointments.length, 1);
  assert.equal(d.appointments[0].minutes, 20);
  assert.equal(d.appointments[0].status, 'booked');
  assert.deepEqual(d.patients[0].protocols[0].drugs, ['Инсулин']);
  assert.deepEqual(d.patients[0].protocols[1].drugs, ['a']);
  assert.deepEqual(d.patients[0].referrals, []);
});

/* --------------------------- две практики при входа --------------------------- */

test('вход: две практики с отделни данни, потребители и сесии', async () => {
  await withApp(async ({ browser, spaces, dir }) => {
    const b = browser();
    let st = await b('GET', '/api/state');
    assert.equal(st.data.workspaceChosen, false, 'първо се избира практика');
    assert.deepEqual(st.data.workspaces.map(w => [w.id, w.ready]), [['gp', false], ['simp', false]]);
    assert.equal(fs.existsSync(path.join(dir, 'simp')), false, 'папката на СИМП още не съществува');

    // Практика на ОПЛ с ПИН.
    const gp = await b('POST', '/api/setup', { workspace: 'gp', practiceName: 'АИППМП д-р Иванова', doctorName: 'д-р Иванова', pin: '1234' });
    assert.equal(gp.status, 200);
    assert.equal(b.jar.get('ws'), 'gp');
    assert.equal((await b('POST', '/api/patients', { name: 'Пациент ОПЛ', birthDate: born(50) })).status, 200);

    // Друг компютър в мрежата не може да създаде втората практика без вход.
    const stranger = browser();
    const refused = await stranger('POST', '/api/setup', { workspace: 'simp', practiceName: 'X', doctorName: 'Y' }, { 'X-Forwarded-For': '192.168.1.50' });
    assert.equal(refused.status, 403);
    assert.equal(spaces.simp.doctors.length, 0);

    // Вписаният в практиката на ОПЛ може да създаде практиката за СИМП.
    const simp = await b('POST', '/api/setup', {
      workspace: 'simp', practiceName: 'ИПСМП д-р Петров', doctorName: 'д-р Петров', pin: '5678', specialties: ['cardio', 'evil'], uin: '1234567890',
    }, { 'X-Forwarded-For': '192.168.1.60' });
    assert.equal(simp.status, 200, JSON.stringify(simp.data));
    assert.equal(simp.data.doctor.role, 'Кардиолог');
    assert.deepEqual(spaces.simp.settings.modules, { cardio: true, endo: false });
    assert.equal(spaces.simp.doctors[0].uin, '1234567890');
    assert.equal(b.jar.get('ws'), 'simp');
    assert.ok(b.jar.get('sid') && b.jar.get('sid_simp'), 'двете сесии живеят успоредно');

    let list = await b('GET', '/api/patients');
    assert.equal(list.data.total, 0, 'пациентите на ОПЛ не се виждат в СИМП');
    assert.equal((await b('GET', '/api/bootstrap')).data.kind, 'simp');

    st = await b('GET', '/api/state');
    assert.equal(st.data.kind, 'simp');
    assert.deepEqual(st.data.workspaces.map(w => [w.id, w.ready, w.name]), [['gp', true, 'АИППМП д-р Иванова'], ['simp', true, 'ИПСМП д-р Петров']]);
    assert.deepEqual(st.data.workspaces[1].specialties, ['Кардиология']);
    assert.ok(st.data.workspaces.every(w => w.signedIn));

    // Смяна на практиката без изход.
    await b('POST', '/api/workspace', { workspace: 'gp' });
    list = await b('GET', '/api/patients');
    assert.equal(list.data.total, 1);
    assert.equal((await b('POST', '/api/workspace', { workspace: 'mars' })).status, 400);

    // Изход — затваря сесията в текущата практика и връща към избора.
    await b('POST', '/api/logout');
    assert.equal(b.jar.has('ws'), false);
    assert.equal(b.jar.has('sid'), false);
    assert.ok(b.jar.has('sid_simp'), 'сесията в СИМП остава');
    st = await b('GET', '/api/state');
    assert.equal(st.data.workspaceChosen, false);
    assert.equal(st.data.workspaces[0].signedIn, null);

    // Вход в СИМП от чист браузър — с избор на практиката в заявката.
    const c = browser();
    const doctorId = spaces.simp.doctors[0].id;
    assert.equal((await c('POST', '/api/login', { workspace: 'simp', doctorId, pin: '0000' })).status, 401);
    assert.equal((await c('POST', '/api/login', { workspace: 'gp', doctorId, pin: '5678' })).status, 401, 'потребителят е от другата практика');
    assert.equal((await c('POST', '/api/login', { workspace: 'simp', doctorId, pin: '5678' })).status, 200);
    assert.equal(c.jar.get('ws'), 'simp');
    assert.equal((await c('GET', '/api/patients')).status, 200);
    await c('POST', '/api/workspace', { workspace: 'gp' });
    assert.equal((await c('GET', '/api/patients')).status, 401, 'в ОПЛ не е вписан');

    // Копие от едната практика не се възстановява в другата.
    const exp = await b('GET', '/api/export');
    assert.equal(exp.status, 401);
    const gpExport = await c('GET', '/api/export', undefined, {});
    assert.equal(gpExport.status, 401);
    await c('POST', '/api/workspace', { workspace: 'simp' });
    const simpExport = await c('GET', '/api/export');
    assert.equal(simpExport.data.kind, 'simp');
    assert.equal((await c('POST', '/api/import', { patients: [], kind: 'gp' })).status, 400);
    assert.match((await c('POST', '/api/import', { patients: [] })).data.error, /обща медицина|ОПЛ/);

    // Мрежата е обща за инсталацията — променена от СИМП, важи за всички.
    assert.equal((await c('PATCH', '/api/settings', { network: 'local' })).status, 200);
    assert.equal(spaces.gp.settings.network, 'local');
    assert.equal((await c('GET', '/api/system/check')).data.network, 'local');
    assert.equal((await c('PATCH', '/api/settings', { network: 'lan' })).status, 200);

    assert.ok(fs.existsSync(path.join(dir, 'simp', 'practice.json')));
    assert.ok(spaces.simp.readAudit(20).some(e => e.action === 'setup' && e.kind === 'simp'));
  });
});

test('старите бисквитки и заявки без избор отиват в практиката на ОПЛ', async () => {
  await withApp(async ({ browser, spaces }) => {
    const b = browser();
    const res = await b('GET', '/api/patients');
    assert.equal(res.status, 200);
    assert.equal(res.data.total, 1);
    assert.equal(spaces.exists('simp'), false);
    // Функциите на СИМП отказват в практиката на ОПЛ.
    assert.equal((await b('GET', '/api/appointments')).status, 400);
    assert.equal((await b('POST', '/api/patients/p1/referrals', { purpose: 'consult' })).status, 400);
  }, (spaces) => {
    spaces.gp.data.settings.requireLogin = false;
    spaces.gp.data.patients.push({ id: 'p1', name: 'Стар пациент', birthDate: born(40) });
    spaces.gp.migrate();
  });
});

/* ------------------------------ функции на СИМП ------------------------------ */

async function simpApp(fn) {
  await withApp(async (env) => {
    const b = env.browser();
    await b('POST', '/api/workspace', { workspace: 'simp' });
    await fn({ ...env, b, store: env.spaces.simp });
  }, (spaces) => {
    const s = spaces.simp;
    s.data.settings.requireLogin = false;
    s.data.settings.modules = { cardio: true, endo: true };
    s.data.doctors.push({ id: 'd1', name: 'д-р Петров', role: 'Кардиолог', active: true });
    s.data.patients.push(
      { id: 'a1', name: 'Иван Колев', sex: 'm', birthDate: born(64), phone: '0888', createdAt: born(1) },
      { id: 'k1', name: 'Дете Детски', sex: 'f', birthDate: born(9), createdAt: born(1) },
    );
    s.migrate();
  });
}

test('СИМП: направление, първичен и вторичен преглед с амбулаторен лист', async () => {
  await simpApp(async ({ b, store }) => {
    const bad = await b('POST', '/api/patients/a1/referrals', { number: 'НРН!', purpose: 'consult' });
    assert.equal(bad.status, 400);
    const ref = await b('POST', '/api/patients/a1/referrals', {
      number: '26270a00012c', issued: addDays(T, -3), purpose: 'consult', fromName: 'д-р Иванова', fromUin: '0987654321', icd: 'i10', diagnosis: 'Хипертония',
    });
    assert.equal(ref.status, 200, JSON.stringify(ref.data));
    assert.equal(ref.data.referral.number, '26270A00012C');
    assert.equal(ref.data.referral.icd, 'I10');
    assert.equal(store.patient('a1').gp.name, 'д-р Иванова', 'насочващият лекар се запомня като личен лекар');
    assert.equal((await b('POST', '/api/patients/k1/referrals', { number: '26270A00012C', purpose: 'consult' })).status, 409, 'същият номер');
    assert.equal((await b('POST', '/api/patients/a1/referrals', { purpose: 'mars' })).status, 400);
    const rid = ref.data.referral.id;

    assert.equal((await b('POST', '/api/patients/a1/exams', { examType: 'primary', referralId: rid })).status, 400, 'без диагноза');
    assert.equal((await b('POST', '/api/patients/a1/exams', { examType: 'primary', icd: 'хипертония' })).status, 400, 'кодът не е по МКБ');
    const primary = await b('POST', '/api/patients/a1/exams', {
      examType: 'primary', referralId: rid, date: T, time: '09:20', specialty: 'cardio',
      complaint: 'Главоболие', findings: 'РР 160/95', diagnosis: 'Есенциална хипертония', icd: 'I10',
      extraDx: [{ icd: 'e78.0', text: 'Хиперхолестеролемия' }, { icd: '', text: '' }],
      treatment: 'Периндоприл 5 мг', recommendations: 'Домашно измерване', nextDate: addDays(T, 20),
      vitals: { systolic: 160, diastolic: 95, pulse: 78, weight: 92 },
    });
    assert.equal(primary.status, 200, JSON.stringify(primary.data));
    assert.deepEqual(primary.data.warnings, []);
    assert.equal(primary.data.visit.type, 'Първичен преглед');
    assert.deepEqual(primary.data.visit.extraDx, [{ icd: 'E78.0', text: 'Хиперхолестеролемия' }]);
    assert.equal(store.patient('a1').measurements.length, 1, 'налягането и теглото са в измерванията');

    let view = await b('GET', '/api/patients/a1');
    assert.equal(view.data.kind, 'simp');
    assert.equal(view.data.simp.referrals[0].state.status, 'secondary');
    assert.equal(view.data.simp.lastExam.icd, 'I10');
    assert.ok(view.data.specialty.cardio, 'разделът на специалността е в досието');

    const again = await b('POST', '/api/patients/a1/exams', { examType: 'primary', referralId: rid, diagnosis: 'Същото' });
    assert.match(again.data.warnings.join(' '), /вече има първичен преглед/);
    const noRef = await b('POST', '/api/patients/a1/exams', { examType: 'dispensary', diagnosis: 'Контрол' });
    assert.match(noRef.data.warnings.join(' '), /без въведено направление/);
    const paid = await b('POST', '/api/patients/a1/exams', { examType: 'paid', diagnosis: 'Контрол' });
    assert.deepEqual(paid.data.warnings, []);

    const secondary = await b('POST', '/api/patients/a1/exams', { examType: 'secondary', referralId: rid, diagnosis: 'Есенциална хипертония', icd: 'I10' });
    assert.equal(secondary.status, 200);
    view = await b('GET', '/api/patients/a1');
    assert.equal(view.data.simp.referrals[0].state.status, 'done');

    // Поправка на прегледа.
    const vid = primary.data.visit.id;
    const fixed = await b('PUT', `/api/patients/a1/exams/${vid}`, { ...primary.data.visit, findings: 'РР 158/94' });
    assert.equal(fixed.status, 200);
    assert.equal(store.patient('a1').visits.find(v => v.id === vid).findings, 'РР 158/94');
    assert.equal((await b('PUT', '/api/patients/a1/exams/nope', { examType: 'primary', diagnosis: 'x' })).status, 404);

    assert.equal((await b('DELETE', `/api/patients/a1/referrals/${rid}`)).status, 400, 'има прегледи');
    assert.equal((await b('PATCH', `/api/patients/a1/referrals/${rid}`, { closed: true })).data.referral.closed, true);

    const log = store.readAudit(50).map(e => e.action);
    for (const a of ['referral_add', 'exam_add', 'exam_update', 'referral_update']) assert.ok(log.includes(a), a);
  });
});

test('СИМП: протоколи, подновяване и диспансерно наблюдение', async () => {
  await simpApp(async ({ b, store }) => {
    assert.equal((await b('POST', '/api/patients/a1/protocols', { drugs: [], validUntil: addDays(T, 10) })).status, 400);
    assert.equal((await b('POST', '/api/patients/a1/protocols', { drugs: ['X'], issued: T, validUntil: T })).status, 400);
    assert.equal((await b('POST', '/api/patients/a1/protocols', { drugs: ['X'], issued: T, validUntil: addDays(T, 900) })).status, 400);
    const pr = await b('POST', '/api/patients/a1/protocols', {
      number: '1234/2026', kind: '1А', drugs: 'Дапаглифлозин 10 мг\nСитаглиптин 100 мг', icd: 'E11.9', issued: addDays(T, -350), validUntil: addDays(T, 10),
    });
    assert.equal(pr.status, 200, JSON.stringify(pr.data));
    assert.deepEqual(pr.data.protocol.drugs, ['Дапаглифлозин 10 мг', 'Ситаглиптин 100 мг']);
    let ov = await b('GET', '/api/simp/overview');
    assert.equal(ov.data.protocols.length, 1);
    assert.equal(ov.data.protocols[0].status, 'expiring');

    const renew = await b('POST', '/api/patients/a1/protocols', {
      renewedFrom: pr.data.protocol.id, drugs: pr.data.protocol.drugs, issued: T, validUntil: addDays(T, 365),
    });
    assert.equal(renew.status, 200);
    assert.equal(store.patient('a1').protocols[0].status, 'renewed');
    ov = await b('GET', '/api/simp/overview');
    assert.equal(ov.data.protocols.length, 0, 'подновеният не се показва');
    assert.equal((await b('PATCH', `/api/patients/a1/protocols/${renew.data.protocol.id}`, { status: 'weird' })).status, 400);
    assert.equal((await b('PATCH', `/api/patients/a1/protocols/${renew.data.protocol.id}`, { status: 'cancelled' })).data.protocol.status, 'cancelled');

    assert.equal((await b('POST', '/api/patients/a1/followups', { everyMonths: 6 })).status, 400, 'без диагноза');
    assert.equal((await b('POST', '/api/patients/a1/followups', { diagnosis: 'СН', everyMonths: 2.5 })).status, 400);
    const f = await b('POST', '/api/patients/a1/followups', { icd: 'I50.0', diagnosis: 'Сърдечна недостатъчност', everyMonths: 3, since: addMonths(T, -5) });
    assert.equal(f.status, 200);
    ov = await b('GET', '/api/simp/overview');
    assert.equal(ov.data.followups[0].status, 'overdue');
    const ended = await b('PATCH', `/api/patients/a1/followups/${f.data.followup.id}`, { status: 'ended', endReason: 'насочен към друг кардиолог' });
    assert.equal(ended.data.followup.status, 'ended');
    assert.equal(ended.data.followup.everyMonths, 3, 'останалото се пази');
    ov = await b('GET', '/api/simp/overview');
    assert.equal(ov.data.followups.length, 0);
  });
});

test('СИМП: график с часове — застъпване, записване въпреки това, преглед от часа', async () => {
  await simpApp(async ({ b, store }) => {
    const day = addDays(T, 1);
    assert.equal((await b('POST', '/api/appointments', { date: day, time: '9:00', name: 'X' })).status, 400);
    assert.equal((await b('POST', '/api/appointments', { date: day, time: '09:00' })).status, 400, 'без пациент и име');
    const a1 = await b('POST', '/api/appointments', { date: day, time: '09:00', patientId: 'a1', reason: 'Контрол', examType: 'dispensary', doctorId: 'd1' });
    assert.equal(a1.status, 200, JSON.stringify(a1.data));
    assert.equal(a1.data.appointment.minutes, 20);
    assert.equal(a1.data.appointment.phone, '0888', 'телефонът идва от досието');
    const clash = await b('POST', '/api/appointments', { date: day, time: '09:10', name: 'Нов човек', phone: '0899', doctorId: 'd1' });
    assert.equal(clash.status, 409);
    assert.equal((await b('POST', '/api/appointments', { date: day, time: '09:10', name: 'Нов човек', doctorId: 'd1', force: true })).status, 200);
    assert.equal((await b('POST', '/api/appointments', { date: day, time: '09:10', name: 'Друг лекар', doctorId: '' })).status, 200);
    assert.equal((await b('POST', '/api/appointments', { date: day, time: '10:00', name: 'X', doctorId: 'ghost' })).status, 400);

    const list = await b('GET', `/api/appointments?from=${day}&to=${day}&doctor=d1`);
    assert.equal(list.data.appointments.length, 2);
    assert.equal(list.data.appointments[0].patient.name, 'Иван Колев');
    assert.equal((await b('GET', `/api/appointments?from=${T}&to=${addDays(T, 100)}`)).status, 400);

    const moved = await b('PATCH', `/api/appointments/${a1.data.appointment.id}`, { time: '09:10' });
    assert.equal(moved.status, 409, 'преместване върху зает час');
    assert.equal((await b('PATCH', `/api/appointments/${a1.data.appointment.id}`, { status: 'arrived' })).data.appointment.status, 'arrived');

    const exam = await b('POST', '/api/patients/a1/exams', { examType: 'dispensary', diagnosis: 'Контрол', appointmentId: a1.data.appointment.id, date: T });
    assert.equal(exam.status, 200);
    const appt = store.data.appointments.find(a => a.id === a1.data.appointment.id);
    assert.equal(appt.status, 'done');
    assert.equal(appt.examId, exam.data.visit.id);
    assert.equal((await b('POST', '/api/patients/k1/exams', { examType: 'paid', diagnosis: 'x', appointmentId: a1.data.appointment.id })).status, 400, 'часът е на друг пациент');

    const cards = await b('GET', '/api/patients');
    const card = cards.data.patients.find(p => p.id === 'a1');
    assert.equal(card.simp.exams, 1);
    assert.equal(card.simp.lastExam.type, 'Диспансерен преглед');

    const rep = await b('GET', `/api/simp/reports?from=${addDays(T, -30)}&to=${T}`);
    assert.equal(rep.data.exams.total, 1);
    assert.equal(rep.data.exams.byType[0].label, 'Диспансерен преглед');
    assert.equal(rep.data.rows[0].patient, 'Иван Колев');
    assert.equal((await b('GET', `/api/simp/reports?from=${T}&to=${addDays(T, -1)}`)).status, 400);

    assert.equal((await b('DELETE', `/api/appointments/${a1.data.appointment.id}`)).status, 200);
    assert.equal((await b('DELETE', '/api/appointments/nope')).status, 404);
    const log = store.readAudit(40).map(e => e.action);
    for (const a of ['appointment_add', 'appointment_update', 'appointment_delete', 'exam_add']) assert.ok(log.includes(a), a);
  });
});
