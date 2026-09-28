import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../lib/store.js';
import { APP_ID, createAppServer } from '../lib/http.js';
import { memoryStatic, safeRelative } from '../lib/static.js';

async function withServer(opts, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-http-'));
  const store = new Store(dir);
  const server = createAppServer({
    store,
    requireActivation: false,
    serveStatic: memoryStatic({ 'index.html': '<!doctype html><title>t</title>', 'js/app.js': 'x=1' }),
    ...opts(store),
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, store);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('safeRelative отказва излизане извън папката', () => {
  assert.equal(safeRelative('/'), 'index.html');
  assert.equal(safeRelative('/js/app.js'), 'js/app.js');
  assert.equal(safeRelative('/../etc/passwd'), null);
  assert.equal(safeRelative('/js/..\\..\\x'), null);
  assert.equal(safeRelative('/a\0b'), null);
});

test('вградените файлове се обслужват с ETag и 304', async () => {
  await withServer(() => ({}), async (base) => {
    const first = await fetch(base + '/');
    assert.equal(first.status, 200);
    assert.match(first.headers.get('content-type'), /text\/html/);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    const again = await fetch(base + '/', { headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    assert.equal((await fetch(base + '/js/app.js')).status, 200);
    assert.equal((await fetch(base + '/missing.js')).status, 404);
  });
});

test('/api/state съдържа знака на приложението, bootstrap — данните за сървъра', async () => {
  await withServer(() => ({
    info: () => ({ version: '9.9.9', dataDir: '/x', port: 1 }),
  }), async (base, store) => {
    const state = await (await fetch(base + '/api/state')).json();
    assert.equal(state.app, APP_ID);
    assert.equal(state.needsSetup, true);

    store.settings.requireLogin = false;
    store.data.doctors.push({ id: 'd1', name: 'Д-р Тест', role: 'ОПЛ' });
    const boot = await (await fetch(base + '/api/bootstrap')).json();
    assert.equal(boot.server.version, '9.9.9');
    assert.equal(boot.server.dataDir, '/x');
  });
});

test('спирането изисква правилния ключ', async () => {
  let stopped = 0;
  await withServer(() => ({
    control: { token: 'secret-token', onStop: () => { stopped++; } },
  }), async (base) => {
    const post = (headers) => fetch(base + '/__control/stop', { method: 'POST', headers });
    assert.equal((await post({})).status, 403);
    assert.equal((await post({ 'X-Control-Token': 'wrong' })).status, 403);
    assert.equal((await fetch(base + '/__control/stop', { headers: { 'X-Control-Token': 'secret-token' } })).status, 403);
    assert.equal(stopped, 0);
    assert.equal((await post({ 'X-Control-Token': 'secret-token' })).status, 200);
    await new Promise(r => setImmediate(r));
    assert.equal(stopped, 1);
  });
});

test('без настроено спиране адресът е забранен', async () => {
  await withServer(() => ({}), async (base) => {
    const res = await fetch(base + '/__control/stop', { method: 'POST', headers: { 'X-Control-Token': '' } });
    assert.equal(res.status, 403);
  });
});

test('заявка от чужд източник се отказва', async () => {
  await withServer(() => ({}), async (base) => {
    const res = await fetch(base + '/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
      body: JSON.stringify({ practiceName: 'X', doctorName: 'Y' }),
    });
    assert.equal(res.status, 403);
  });
});
