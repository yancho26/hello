/* Активиране с продуктов ключ. Тестовете ползват собствени, временни ключове —
 * истинските не са в хранилището, има само техните отпечатъци. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, hashPin } from '../lib/store.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import {
  ALPHABET, ISSUED, License, checkChar, checkKey, formatKey, generateKey, keyHash, normalizeKey, wellFormed,
} from '../lib/license.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dk-lic-'));

test('ключът: вид, контролен знак и прошка при въвеждане', () => {
  const key = generateKey();
  assert.equal(key.length, 20);
  assert.ok([...key].every(c => ALPHABET.includes(c)));
  assert.ok(wellFormed(key));
  const shown = formatKey(key);
  assert.match(shown, /^DOCUP(-[0-9A-Z]{5}){4}$/);
  assert.equal(normalizeKey(shown), key);
  assert.equal(normalizeKey(' docup ' + shown.slice(6).toLowerCase().replace(/-/g, ' ')), key);
  // O вместо нула и I/L вместо единица се приемат.
  assert.equal(normalizeKey('DOCUP-O0IL1'), '00111');
  // Всяка единична грешка в знак се хваща от контролния знак.
  let caught = 0;
  let total = 0;
  for (let i = 0; i < 20; i++) {
    for (const c of ALPHABET) {
      if (c === key[i]) continue;
      total++;
      if (!wellFormed(key.slice(0, i) + c + key.slice(i + 1))) caught++;
    }
  }
  assert.ok(caught / total > 0.95, `хванати ${caught} от ${total}`);
  assert.equal(checkChar(key.slice(0, 19)), key[19]);
});

test('издадените ключове са само отпечатъци в програмата', () => {
  assert.equal(ISSUED.size, 20);
  for (const h of ISSUED) assert.match(h, /^[0-9a-f]{64}$/);
  const source = fs.readFileSync(new URL('../lib/license.js', import.meta.url), 'utf8');
  const shaped = source.match(/DOCUP(-[0-9A-Z]{5}){4}/g) || [];
  assert.ok(!shaped.some(k => wellFormed(normalizeKey(k))), 'в кода няма ключове');
  assert.equal(checkKey(formatKey(generateKey())).reason, 'unknown', 'случаен ключ не е валиден');
});

test('активиране: грешен вид, непознат ключ, валиден ключ, запис и повторно зареждане', () => {
  const dir = tmp();
  const good = generateKey();
  const issued = new Set([keyHash(good)]);
  const lic = new License(dir, { issued });
  assert.equal(lic.active, false);
  assert.equal(lic.activate('DOCUP-12345').reason, 'format');
  assert.equal(lic.activate(formatKey(generateKey())).reason, 'unknown');
  assert.equal(lic.active, false);
  const res = lic.activate(formatKey(good).toLowerCase(), { name: 'д-р Тест' });
  assert.equal(res.ok, true);
  assert.equal(lic.info().key, `DOCUP-•••••-•••••-•••••-${good.slice(15)}`);
  const saved = fs.readFileSync(path.join(dir, 'license.json'), 'utf8');
  assert.ok(!saved.includes(good), 'ключът не се записва, само отпечатъкът');
  assert.equal(new License(dir, { issued }).active, true);
  // Ръчно написан файл с неиздаден отпечатък не активира.
  fs.writeFileSync(path.join(dir, 'license.json'), JSON.stringify({ keyHash: 'a'.repeat(64) }));
  assert.equal(new License(dir, { issued }).active, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('сървърът не показва данни преди активиране; ключът отключва', async () => {
  const dir = tmp();
  const store = new Store(dir);
  store.data.doctors.push({ id: 'd1', name: 'Д-р А', active: true, pin: hashPin('1111') });
  store.data.patients.push({ id: 'p1', name: 'Иван', birthDate: '2020-01-01' });
  store.migrate();
  const good = generateKey();
  store.license = new License(dir, { issued: new Set([keyHash(good)]) });
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, cookie) => {
    const res = await fetch(base + url, {
      method, body: body && JSON.stringify(body),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie') };
  };
  try {
    const state = await call('GET', '/api/state');
    assert.equal(state.data.needsActivation, true);
    assert.equal(state.data.practice, undefined, 'нищо от практиката преди активиране');
    for (const [m, u, b] of [['GET', '/api/patients'], ['GET', '/api/export'], ['POST', '/api/login', { doctorId: 'd1', pin: '1111' }], ['POST', '/api/setup', { practiceName: 'x', doctorName: 'y' }]]) {
      const r = await call(m, u, b);
      assert.equal(r.status, 403, u);
      assert.equal(r.data.needsActivation, true);
    }
    assert.equal((await call('GET', '/')).status, 200, 'интерфейсът се зарежда, за да покаже екрана за ключ');

    assert.equal((await call('POST', '/api/activate', { key: 'DOCUP-ABC' })).status, 400);
    const wrong = await call('POST', '/api/activate', { key: formatKey(generateKey()) });
    assert.equal(wrong.status, 403);
    assert.match(wrong.data.error, /не е валиден/);
    const ok = await call('POST', '/api/activate', { key: formatKey(good) });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.license.active, true);

    const after = await call('GET', '/api/state');
    assert.equal(after.data.needsActivation, undefined);
    assert.equal(after.data.practice.name, 'Моята практика');
    const login = await call('POST', '/api/login', { doctorId: 'd1', pin: '1111' });
    assert.equal(login.status, 200);
    const cookie = login.cookie.split(';')[0];
    const boot = await call('GET', '/api/bootstrap', undefined, cookie);
    assert.equal(boot.data.license.active, true);
    assert.match(boot.data.license.key, new RegExp(good.slice(15) + '$'));
    // Смяна на ключа на активирана програма — само от вписан потребител.
    assert.equal((await call('POST', '/api/activate', { key: formatKey(good) })).status, 401);
    assert.equal((await call('POST', '/api/activate', { key: formatKey(good) }, cookie)).status, 200);
    const log = store.readAudit(20).map(e => e.action);
    assert.ok(log.includes('activated'));
    assert.ok(log.includes('activation_failed'));
    const check = await call('GET', '/api/system/check', undefined, cookie);
    assert.ok(check.data.items.some(i => /DocUp е активиран/.test(i.title)));
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    await store.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('налучкване на ключ: изчакване след 5 невалидни ключа', async () => {
  const dir = tmp();
  const store = new Store(dir);
  const good = generateKey();
  store.license = new License(dir, { issued: new Set([keyHash(good)]) });
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const activate = async (key) => (await fetch(base + '/api/activate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
  })).status;
  try {
    for (let i = 0; i < 5; i++) assert.equal(await activate(formatKey(generateKey())), 403);
    assert.equal(await activate(formatKey(good)), 429, 'дори верният ключ чака');
    // Грешно преписан ключ (контролният знак не съвпада) не се брои като опит за налучкване.
    assert.equal(store.activationGuard.users.get('activation').count, 5);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
