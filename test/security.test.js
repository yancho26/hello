/* Версия 2.2: сигурност, устойчивост към повредени данни и съжителство с
 * другите програми. Всеки тест отговаря на конкретен открит проблем. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Store, hashPin, normalizeData } from '../lib/store.js';
import { SECURITY_HEADERS, addressKind, createAppServer, hostAllowed } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import { LoginGuard } from '../lib/guard.js';
import { readSpreadsheet } from '../lib/import/index.js';
import { DRUGS } from '../public/js/shared/drugs.js';
import { CONDITIONS } from '../public/js/shared/chronic.js';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

async function withServer(setup, fn) {
  const dir = tmp('dk-sec-');
  const store = new Store(dir);
  setup?.(store);
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': '<!doctype html>' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  try {
    await fn(call, store, base);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    await store.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const openPractice = (store) => {
  store.settings.requireLogin = false;
  store.data.doctors.push({ id: 'd1', name: 'Д-р Тест', role: 'ОПЛ', active: true });
  store.data.patients.push({
    id: 'p1', name: 'Иван Иванов', birthDate: '1960-05-05', sex: 'm', records: {},
    chronic: [], meds: [], results: [], assessments: [], measurements: [], visits: [], reminders: [],
    development: [], contacts: [], allergies: [], conditions: [], optIn: [], nutritionPlans: [], lifestyle: {},
  });
};

/* ------------------------------- грешки 500 ------------------------------- */

test('тяло null, списък или число — 400 вместо вътрешна грешка', async () => {
  await withServer(openPractice, async (call) => {
    for (const body of ['null', '[]', '5', '"x"']) {
      const r = await call('POST', '/api/patients/p1/visits', body);
      assert.equal(r.status, 400, body);
    }
    assert.equal((await call('POST', '/api/login', 'null')).status, 400);
    assert.equal((await call('GET', '/api/patients/%E0%A4%A')).status, 400, 'неразбираем %-код в адреса');
    assert.equal((await call('GET', '/api/patients/a%2Fb')).status, 404, '%2F в идентификатор не е разделител');
  });
});

test('ключ „toString“ не минава за лекарство, заболяване или скала и не чупи списъка', async () => {
  assert.equal(DRUGS.toString, undefined);
  assert.equal(CONDITIONS.constructor, undefined);
  await withServer(openPractice, async (call) => {
    for (const drug of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      assert.equal((await call('POST', '/api/patients/p1/meds', { drug })).status, 400, drug);
    }
    assert.equal((await call('POST', '/api/patients/p1/chronic', { code: 'toString' })).status, 400);
    assert.equal((await call('POST', '/api/patients/p1/assessments', { tool: 'constructor' })).status, 404);
    assert.equal((await call('POST', '/api/patients/p1/nutrition', { activity: 'constructor' })).status, 400);
    assert.equal((await call('GET', '/api/patients')).status, 200);
    assert.equal((await call('GET', '/api/tasks')).status, 200);
  });
});

test('обект на мястото на текст не се записва като „[object Object]“', async () => {
  await withServer(openPractice, async (call, store) => {
    assert.equal((await call('POST', '/api/patients/p1/visits', { diagnosis: { a: 1 } })).status, 400);
    assert.equal((await call('PATCH', '/api/patients/p1', { phone: ['0888'] })).status, 400);
    const r = await call('PATCH', '/api/patients/p1', { allergies: ['пеницилин', { x: 1 }, null], contacts: [null, { name: 'Мария', phone: '0877' }] });
    assert.equal(r.status, 200);
    assert.deepEqual(store.patient('p1').allergies, ['пеницилин']);
    assert.equal(store.patient('p1').contacts.length, 1);
    assert.equal((await call('POST', '/api/patients/p1/results', { items: [null] })).status, 400);
    assert.equal((await call('POST', '/api/patients/p1/records', { records: [null] })).status, 400);
    assert.ok(!JSON.stringify(store.data).includes('[object Object]'));
  });
});

test('отказана промяна не оставя половин промяна', async () => {
  await withServer(openPractice, async (call, store) => {
    const med = (await call('POST', '/api/patients/p1/meds', { drug: 'ramipril', start: '2024-01-01' })).data.med;
    const r = await call('PATCH', `/api/patients/p1/meds/${med.id}`, { end: '2023-01-01', dose: '10 мг' });
    assert.equal(r.status, 400);
    const saved = store.patient('p1').meds[0];
    assert.equal(saved.end, undefined);
    assert.equal(saved.dose, '');

    const before = JSON.stringify(store.settings);
    assert.equal((await call('PATCH', '/api/settings', { horizonDays: 90, cvRegion: 'марс' })).status, 400);
    assert.equal(JSON.stringify(store.settings), before);

    const item = store.schedule.find(i => !i.recur && !i.seasonal && i.track !== 'adult');
    const name = item.name;
    assert.equal((await call('PUT', `/api/schedule/${item.id}`, { name: 'Ново', dueMonths: 9999 })).status, 400);
    assert.equal(item.name, name);
  });
});

test('едно повредено досие не спира списъка, задачите и справките', async () => {
  await withServer((store) => {
    openPractice(store);
    // Добавено след зареждането — както при ръчно редактиран файл, без проверката при зареждане.
    store.data.patients.push({ id: 'bad', name: 'Повреден', birthDate: '2020-01-01', records: {}, development: 5, measurements: 'x' });
  }, async (call) => {
    const list = await call('GET', '/api/patients');
    assert.equal(list.status, 200);
    assert.ok(list.data.patients.some(p => p.id === 'bad' && p.broken));
    assert.equal((await call('GET', '/api/tasks')).status, 200);
    assert.equal((await call('GET', '/api/reports')).status, 200);
    const one = await call('GET', '/api/patients/bad');
    assert.equal(one.status, 500);
    assert.match(one.data.error, /повредени/);
  });
});

test('проверката при зареждане поправя неправилни типове', () => {
  const d = {
    doctors: [null, { id: 'd1', name: 'Д', pin: 42 }],
    patients: [null, 'x', { name: 5, records: [], meds: 'none', allergies: [1, 'а'], chronic: [null, { code: 'htn' }] },
      { id: 'dup', name: 'A' }, { id: 'dup', name: 'B' }],
    schedule: [{ id: 'x', name: 'X' }, null],
    settings: { network: 'всички', allowedHosts: 'x' },
  };
  const repairs = normalizeData(d);
  assert.ok(repairs.length >= 3);
  assert.equal(d.doctors.length, 1);
  assert.equal(d.doctors[0].pin, null);
  assert.equal(d.patients.length, 3);
  assert.equal(typeof d.patients[0].id, 'string');
  assert.equal(d.patients[0].name, '5');
  assert.deepEqual(d.patients[0].records, {});
  assert.deepEqual(d.patients[0].meds, []);
  assert.deepEqual(d.patients[0].allergies, ['а']);
  assert.equal(d.patients[0].chronic.length, 1);
  assert.notEqual(d.patients[1].id, d.patients[2].id, 'повтарящ се идентификатор');
  assert.equal(d.settings.network, 'lan');
  assert.deepEqual(d.settings.allowedHosts, []);
  assert.ok(d.schedule.some(i => i.track === 'adult'));
});

test('възстановяване от копие: проверка преди замяна и без чужди мрежови настройки', async () => {
  await withServer(openPractice, async (call, store) => {
    store.settings.network = 'local';
    const r = await call('POST', '/api/import', {
      patients: [null, { id: 'n1', name: 'Нов', birthDate: '2020-01-01' }],
      doctors: [{ id: 'dx', name: 'Спрян', active: false }],
    });
    assert.equal(r.status, 400, 'без активен потребител');
    assert.equal(store.patients[0].id, 'p1', 'данните не са заменени');

    const ok = await call('POST', '/api/import', {
      patients: [null, { id: 'n1', name: 'Нов', birthDate: '2020-01-01' }],
      settings: { network: 'any', extraBackupDir: '/tmp/чужда', requireLogin: false, horizonDays: 45 },
    });
    assert.equal(ok.status, 200);
    assert.equal(store.patients.length, 1);
    assert.deepEqual(store.patients[0].meds, []);
    assert.equal(store.settings.network, 'local', 'мрежата остава на този компютър');
    assert.equal(store.settings.extraBackupDir, '');
    assert.equal(store.settings.horizonDays, 45);
  });
});

/* -------------------------------- мрежа --------------------------------- */

test('Host: чужди имена се отказват (DNS rebinding)', async () => {
  assert.equal(hostAllowed('localhost:8080'), true);
  assert.equal(hostAllowed('127.0.0.1:8080'), true);
  assert.equal(hostAllowed('192.168.1.20:8080'), true);
  assert.equal(hostAllowed('[::1]:8080'), true);
  assert.equal(hostAllowed('RECEPTION-PC:8080'), true);
  assert.equal(hostAllowed('reception-pc.local:8080'), true);
  assert.equal(hostAllowed('kabinet.lan'), true);
  assert.equal(hostAllowed(os.hostname()), true);
  assert.equal(hostAllowed('evil.example.com:8080'), false);
  assert.equal(hostAllowed('127.0.0.1.nip.io:8080'), false);
  assert.equal(hostAllowed('kabinet.example.bg', ['kabinet.example.bg']), true);
  assert.equal(hostAllowed('a.clinic.bg', ['*.clinic.bg']), true);
  assert.equal(hostAllowed('clinic.bg.evil.com', ['*.clinic.bg']), false);

  // fetch не позволява смяна на Host — затова тук е http.request.
  const get = (base, pathname, host) => new Promise((resolve, reject) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path: pathname, headers: { Host: host } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
  await withServer(openPractice, async (call, store, base) => {
    const r = await get(base, '/api/patients', 'evil.example.com');
    assert.equal(r.status, 421);
    assert.match(JSON.parse(r.body).error, /не е разрешен/);
    assert.equal((await get(base, '/', 'evil.example.com:80')).status, 421);
    assert.equal((await get(base, '/api/patients', 'localhost')).status, 200);
    store.settings.allowedHosts = ['evil.example.com'];
    assert.equal((await get(base, '/api/patients', 'evil.example.com')).status, 200, 'изрично разрешено');
  });
});

test('видове адреси: вътрешна мрежа срещу интернет', () => {
  assert.equal(addressKind('127.0.0.1'), 'loopback');
  assert.equal(addressKind('::ffff:127.0.0.1'), 'loopback');
  assert.equal(addressKind('::1'), 'loopback');
  for (const a of ['10.0.0.5', '172.16.3.4', '172.31.255.1', '192.168.0.10', '169.254.1.1', '100.101.102.103', 'fe80::1', 'fd12::3', '::ffff:192.168.1.2']) {
    assert.equal(addressKind(a), 'private', a);
  }
  for (const a of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2a00:1450::1', '::ffff:1.2.3.4']) {
    assert.equal(addressKind(a), 'public', a);
  }
});

test('заглавки за сигурност и режим „само този компютър“', async () => {
  await withServer(openPractice, async (call) => {
    const r = await call('GET', '/');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, k);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    // От 127.0.0.1 тестът е „същият компютър“ — режимът local го пропуска.
    assert.equal((await call('PATCH', '/api/settings', { network: 'local' })).status, 200);
    assert.equal((await call('GET', '/api/patients')).status, 200);
    assert.equal((await call('PATCH', '/api/settings', { network: 'навсякъде' })).status, 400);
    assert.equal((await call('PATCH', '/api/settings', { allowedHosts: ['*.bg'] })).status, 400, 'твърде общо');
    const ok = await call('PATCH', '/api/settings', { allowedHosts: 'https://Kabinet.Example.bg:8080/ x.lan' });
    assert.deepEqual(ok.data.settings.allowedHosts, ['kabinet.example.bg', 'x.lan']);
  });
});

test('мрежата и разрешените адреси се променят само от самия компютър', async () => {
  await withServer(openPractice, async (call) => {
    // Зад обратно прокси заявката не е „от този компютър“.
    const r = await call('PATCH', '/api/settings', { network: 'any' }, { 'X-Forwarded-For': '192.168.1.50' });
    assert.equal(r.status, 403);
  });
});

/* --------------------------------- вход --------------------------------- */

test('налучкване на ПИН: изчакване след 5 грешни опита', async () => {
  await withServer((store) => {
    store.settings.requireLogin = true;
    store.data.doctors.push({ id: 'd1', name: 'Д-р А', active: true, pin: hashPin('1234') });
  }, async (call, store) => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await call('POST', '/api/login', { doctorId: 'd1', pin: '000' + i })).status, 401);
    }
    const locked = await call('POST', '/api/login', { doctorId: 'd1', pin: '1234' });
    assert.equal(locked.status, 429, 'дори верният ПИН чака');
    assert.match(locked.data.error, /Опитайте отново след/);
    const log = store.readAudit(20).map(e => e.action);
    assert.ok(log.includes('login_locked'));
    assert.equal(log.filter(a => a === 'login_failed').length, 5);
  });
});

test('LoginGuard: удължаване, нулиране и ограничение по адрес', () => {
  let t = 1_000_000;
  const g = new LoginGuard(() => t);
  for (let i = 0; i < 4; i++) g.fail('d1', 'ip1');
  assert.equal(g.wait('d1', 'ip1'), 0);
  assert.equal(g.fail('d1', 'ip1'), true, 'петият опит заключва');
  assert.equal(g.wait('d1', 'ip1'), 30_000);
  t += 30_001;
  assert.equal(g.wait('d1', 'ip1'), 0);
  g.fail('d1', 'ip1');
  assert.equal(g.wait('d1', 'ip1'), 60_000, 'всеки следващ — двойно');
  g.success('d1');
  assert.equal(g.wait('d1', 'ip2'), 0);
  // 30 грешни опита от един адрес за различни потребители.
  for (let i = 0; i < 30; i++) g.fail('u' + i, 'ip9');
  assert.ok(g.wait('нов', 'ip9') > 0);
  assert.equal(g.wait('нов', 'ip8'), 0);
});

test('сесии: на диска са само отпечатъци; стар файл се превръща', () => {
  const dir = tmp('dk-sess-');
  fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify({ ['ab'.repeat(24)]: { doctorId: 'd1', createdAt: Date.now(), lastSeen: Date.now() } }));
  const store = new Store(dir);
  store.data.doctors.push({ id: 'd1', name: 'Д', active: true });
  assert.ok(store.getSession('ab'.repeat(24)), 'сесията от версия 2.1 остава валидна');
  const token = store.createSession('d1');
  const onDisk = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8');
  assert.ok(!onDisk.includes(token));
  assert.ok(!onDisk.includes('ab'.repeat(24)));
  assert.ok(store.getSession(token));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('сменен ПИН затваря другите сесии; спрян потребител губи достъп веднага', async () => {
  await withServer((store) => {
    store.settings.requireLogin = true;
    store.data.doctors.push({ id: 'd1', name: 'Д-р А', active: true, pin: hashPin('1111') });
    store.data.doctors.push({ id: 'd2', name: 'Д-р Б', active: true, pin: hashPin('2222') });
  }, async (call, store) => {
    const login = async (doctorId, pin) => {
      const r = await call('POST', '/api/login', { doctorId, pin });
      return r.headers.get('set-cookie').split(';')[0];
    };
    const a1 = await login('d1', '1111');
    const a2 = await login('d1', '1111');
    const b = await login('d2', '2222');
    assert.equal((await call('PATCH', '/api/doctors/d1', { pin: '9999' }, { Cookie: a1 })).status, 200);
    assert.equal((await call('GET', '/api/patients', undefined, { Cookie: a1 })).status, 200, 'текущата сесия остава');
    assert.equal((await call('GET', '/api/patients', undefined, { Cookie: a2 })).status, 401, 'другата е затворена');
    assert.ok(store.readAudit(5).some(e => e.action === 'sessions_revoked'));

    assert.equal((await call('GET', '/api/patients', undefined, { Cookie: b })).status, 200);
    assert.equal((await call('PATCH', '/api/doctors/d2', { active: false }, { Cookie: a1 })).status, 200);
    assert.equal((await call('GET', '/api/patients', undefined, { Cookie: b })).status, 401);
  });
});

/* -------------------------------- журнал -------------------------------- */

test('журналът е верига от отпечатъци: промяна или изтрит ред се откриват', () => {
  const dir = tmp('dk-audit-');
  fs.writeFileSync(path.join(dir, 'audit.log'), '{"ts":"2025-01-01T00:00:00Z","action":"login"}\n');
  const store = new Store(dir);
  for (let i = 0; i < 4; i++) store.audit({ id: 'd1', name: 'Д' }, 'patient_update', { name: 'П' + i });
  let v = store.verifyAudit();
  assert.deepEqual([v.ok, v.verified, v.legacy], [true, 4, 1]);
  assert.equal(store.readAudit(1)[0].h, undefined, 'отпечатъкът не се показва');

  const file = path.join(dir, 'audit.log');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  fs.writeFileSync(file, [lines[0], lines[1], lines[2].replace('П1', 'П9'), lines[3], lines[4]].join('\n') + '\n');
  v = store.verifyAudit();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 3);

  fs.writeFileSync(file, [lines[0], lines[1], lines[3], lines[4]].join('\n') + '\n');
  assert.equal(store.verifyAudit().ok, false, 'изтрит ред');

  // Нов Store продължава веригата от последния ред.
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const again = new Store(dir);
  again.audit(null, 'login');
  assert.equal(again.verifyAudit().ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('неуспешно дневно копие не спира записа на данните', async () => {
  const dir = tmp('dk-backup-');
  const store = new Store(dir);
  fs.rmSync(store.backupDir, { recursive: true, force: true });
  fs.writeFileSync(store.backupDir, 'не е папка'); // копието ще се провали
  store.data.practice.name = 'Променено';
  await store.persist();
  assert.equal(JSON.parse(fs.readFileSync(store.file, 'utf8')).practice.name, 'Променено');
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------- проверка ------------------------------- */

test('проверка на сигурността: без ПИН в мрежата е проблем, липсата на копие — препоръка', async () => {
  await withServer(openPractice, async (call) => {
    const r = await call('GET', '/api/system/check');
    assert.equal(r.status, 200);
    const byTitle = Object.fromEntries(r.data.items.map(i => [i.title, i.level]));
    assert.equal(byTitle['Без ПИН и с достъп от мрежата'], 'bad');
    assert.equal(byTitle['Няма външно копие'], 'warn');
    assert.equal(byTitle['Журналът на действията е празен и защитен от промени'], 'ok');
    assert.ok(r.data.items.some(i => /диска/.test(i.title)));
    assert.equal(r.data.canChangeNetwork, true);
  });
});

/* ------------------------------ файлове ------------------------------ */

test('ZIP бомба се отказва, без да изчерпи паметта', () => {
  const deflated = zlib.deflateRawSync(Buffer.alloc(200 * 1024 * 1024), { level: 9 });
  const entry = (name, data, method, offset) => {
    const n = Buffer.from(name);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(method, 8); l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(1000, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(method, 10); c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(1000, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    return { local: Buffer.concat([l, n, data]), central: Buffer.concat([c, n]) };
  };
  const parts = [
    ['xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="a" r:id="rId1"/></sheets></workbook>'), 0],
    ['xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), 0],
    ['xl/worksheets/sheet1.xml', deflated, 8],
  ];
  let off = 0;
  const locals = [];
  const centrals = [];
  for (const [n, d, m] of parts) {
    const e = entry(n, d, m, off);
    locals.push(e.local); centrals.push(e.central); off += e.local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(3, 8); eocd.writeUInt16LE(3, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  const bomb = Buffer.concat([...locals, cd, eocd]);
  assert.ok(bomb.length < 1024 * 1024);
  assert.throws(() => readSpreadsheet(bomb, 'bomb.xlsx'), /твърде голям след разархивиране/);
});

test('повреден .xls с огромна дължина на текст не зацикля', () => {
  const orig = fs.readFileSync(new URL('./fixtures/patients-xlwt.xls', import.meta.url));
  const t0 = Date.now();
  // Всички 4-байтови полета последователно се заменят с 0xFFFFFFFF (размери, указатели).
  for (let at = 0; at < orig.length - 4; at += 97) {
    const buf = Buffer.from(orig);
    buf.writeUInt32LE(0xffffffff, at);
    try { readSpreadsheet(buf, 'x.xls'); } catch (err) { assert.match(err.message, /[а-я]/i, 'съобщение на български'); }
  }
  assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
});
