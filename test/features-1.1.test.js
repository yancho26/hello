/* Функциите от версия 1.1: спиране от интерфейса, минали имунизации,
 * външно копие, автоматично излизане, версия и еднакво броене на просрочията. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../lib/store.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { addMonths, today } from '../public/js/shared/dates.js';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function withApp(opts, fn) {
  const dir = tmp('dk-feat-');
  const store = new Store(dir);
  store.settings.requireLogin = false;
  store.data.doctors.push({ id: 'd1', name: 'д-р Тест', role: 'ОПЛ', active: true });
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }), ...opts(store) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  try {
    await fn(call, store, dir);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('спиране от интерфейса: само където е предвидено и само от същия компютър', async () => {
  let stops = 0;
  await withApp(() => ({ control: { token: 't', onStop: () => { stops++; } } }), async (call) => {
    const remote = await call('POST', '/api/system/stop', {}, { 'X-Forwarded-For': '10.0.0.5' });
    assert.equal(remote.status, 403);
    const boot = await call('GET', '/api/bootstrap');
    assert.equal(boot.data.server.canStop, true);
    assert.equal(boot.data.server.local, true);
    const ok = await call('POST', '/api/system/stop', {});
    assert.equal(ok.status, 200);
    await new Promise(r => setTimeout(r, 400));
    assert.equal(stops, 1);
  });
  await withApp(() => ({}), async (call) => {
    const res = await call('POST', '/api/system/stop', {});
    assert.equal(res.status, 409, 'без управление (node server.js) спирането не е достъпно');
    const boot = await call('GET', '/api/bootstrap');
    assert.equal(boot.data.server.canStop, false);
  });
});

test('минали имунизации: записват се всички наведнъж или нищо', async () => {
  await withApp(() => ({}), async (call, store) => {
    const birth = addMonths(today(), -30);
    const created = await call('POST', '/api/patients', { name: 'Дете От Друга Практика', birthDate: birth, sex: 'f' });
    const id = created.data.patient.id;
    const plan = (await call('GET', `/api/patients/${id}`)).data.plan;
    const past = plan.filter(e => e.group === 'vaccine' && e.status === 'overdue').slice(0, 4);
    assert.ok(past.length >= 3);

    // Един грешен ред (дата преди раждането) отказва целия запис.
    const bad = await call('POST', `/api/patients/${id}/records`, {
      records: [...past.slice(0, 2).map(e => ({ itemId: e.id, date: e.due })), { itemId: past[2].id, date: '2000-01-01' }],
    });
    assert.equal(bad.status, 400);
    assert.equal(Object.keys(store.patient(id).records).length, 0);

    const dup = await call('POST', `/api/patients/${id}/records`, {
      records: [{ itemId: past[0].id, date: past[0].due }, { itemId: past[0].id, date: past[0].due }],
    });
    assert.equal(dup.status, 400);

    const ok = await call('POST', `/api/patients/${id}/records`, {
      note: 'по имунизационен паспорт',
      records: past.map(e => ({ itemId: e.id, date: e.due, batch: 'AB12' })),
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.count, past.length);
    const rec = store.patient(id).records[past[0].id];
    assert.equal(rec.status, 'done');
    assert.equal(rec.note, 'по имунизационен паспорт');
    assert.equal(rec.history, true);
    const after = (await call('GET', `/api/patients/${id}`)).data.plan;
    for (const e of past) assert.equal(after.find(x => x.id === e.id).status, 'done');
  });
});

test('външно копие: проверка на папката, копие и състояние', async () => {
  const usb = tmp('dk-usb-');
  await withApp(() => ({}), async (call, store, dir) => {
    const rel = await call('PATCH', '/api/settings', { extraBackupDir: 'relative/folder' });
    assert.equal(rel.status, 400);
    const inside = await call('PATCH', '/api/settings', { extraBackupDir: path.join(dir, 'copies') });
    assert.equal(inside.status, 400);

    const target = path.join(usb, 'Детска консултация');
    const ok = await call('PATCH', '/api/settings', { extraBackupDir: target });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.extraBackup.ok, true);
    const file = path.join(target, `practice-${today()}.json`);
    assert.ok(fs.existsSync(file));
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).doctors.length, 1);

    const manual = await call('POST', '/api/backup/extra', {});
    assert.equal(manual.status, 200);
    assert.equal(manual.data.extraBackup.reason, 'manual');
    // Състоянието оцелява при рестарт.
    assert.equal(new Store(dir).extraStatus.ok, true);

    const off = await call('PATCH', '/api/settings', { extraBackupDir: '' });
    assert.equal(off.data.settings.extraBackupDir, '');
    const none = await call('POST', '/api/backup/extra', {});
    assert.equal(none.status, 400);
  });
  fs.rmSync(usb, { recursive: true, force: true });
});

test('външно копие: старите копия над 60 дни се трият', async () => {
  const dir = tmp('dk-store-');
  const usb = tmp('dk-usb-');
  const store = new Store(dir);
  store.settings.extraBackupDir = usb;
  for (let i = 1; i <= 65; i++) {
    fs.writeFileSync(path.join(usb, `practice-2020-01-${String(i % 28 + 1).padStart(2, '0')}.json`), '{}');
    fs.writeFileSync(path.join(usb, `practice-2019-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}.json`), '{}');
  }
  fs.writeFileSync(path.join(usb, 'чужд-файл.txt'), 'не се пипа');
  const status = await store.copyToExtra('manual');
  assert.equal(status.ok, true);
  const left = fs.readdirSync(usb).filter(f => f.startsWith('practice-'));
  assert.equal(left.length, 60);
  assert.ok(left.includes(`practice-${today()}.json`));
  assert.ok(fs.existsSync(path.join(usb, 'чужд-файл.txt')));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(usb, { recursive: true, force: true });
});

test('автоматично излизане: сесията изтича след зададеното бездействие', () => {
  const dir = tmp('dk-idle-');
  const store = new Store(dir);
  store.data.doctors.push({ id: 'd1', name: 'Д', active: true });
  store.settings.requireLogin = true;
  store.settings.autoLogoutMinutes = 5;
  const token = store.createSession('d1');
  assert.ok(store.getSession(token));
  store.sessions.get(token).lastSeen = Date.now() - 6 * 60000;
  assert.ok(store.getSession(token), 'в рамките на толеранса от 2 минути');
  store.sessions.get(token).lastSeen = Date.now() - 8 * 60000;
  assert.equal(store.getSession(token), null);

  store.settings.autoLogoutMinutes = 0;
  const t2 = store.createSession('d1');
  store.sessions.get(t2).lastSeen = Date.now() - 3 * 86400000;
  assert.ok(store.getSession(t2), 'без автоматично излизане важат 14-те дни');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('версия: предишната се запомня само при обновяване', () => {
  const fresh = tmp('dk-ver-');
  const s1 = new Store(fresh);
  s1.noteAppVersion('1.1.0');
  assert.equal(s1.data.previousVersion, undefined, 'нова инсталация — няма „Какво е новото“');

  const old = tmp('dk-ver-');
  const s2 = new Store(old); // данни, създадени от 1.0.0 (без appVersion)
  delete s2.data.appVersion;
  s2.persistSync();
  const s3 = new Store(old);
  s3.noteAppVersion('1.1.0');
  assert.equal(s3.data.previousVersion, '1.0.0');
  assert.equal(new Store(old).data.appVersion, '1.1.0');
  fs.rmSync(fresh, { recursive: true, force: true });
  fs.rmSync(old, { recursive: true, force: true });
});

test('Справки и Табло броят децата с просрочия еднакво', async () => {
  await withApp(() => ({}), async (call) => {
    const a = await call('POST', '/api/patients', { name: 'Първо Дете', birthDate: addMonths(today(), -8), sex: 'm' });
    await call('POST', '/api/patients', { name: 'Второ Дете', birthDate: addMonths(today(), -1), sex: 'f' });
    // Лично напомняне с минала дата също е просрочие.
    const third = await call('POST', '/api/patients', { name: 'Трето Дете', birthDate: today(), sex: 'f' });
    await call('POST', `/api/patients/${third.data.patient.id}/reminders`, { date: addMonths(today(), -1).slice(0, 10), text: 'Обаждане' });
    assert.ok(a.data.patient.id);
    const tasks = (await call('GET', '/api/tasks')).data;
    const reports = (await call('GET', '/api/reports')).data;
    const children = new Set(tasks.buckets.overdue.map(t => t.patientId));
    assert.equal(reports.totals.withOverdue, children.size);
  });
});
