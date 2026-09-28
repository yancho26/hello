/* Стартирането на DocUp (desktop/main.js) след преименуването от
 * „Детска консултация“: стара папка с данни и работещо старо копие. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'desktop', 'main.js');

const freePort = () => new Promise(resolve => {
  const srv = http.createServer().listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

async function waitFor(url, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* още не слуша */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Програмата не тръгна: ' + url);
}

/** Стартира desktop/main.js с даден домашен каталог (там търси ~/.docup). */
function launch(home, port, extraArgs = []) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, PORT: String(port), HOST: '127.0.0.1', DOCUP_NO_BROWSER: '1', DOCUP_NO_DIALOGS: '1' };
  delete env.DOCUP_HOME;
  delete env.DETSKA_HOME;
  return spawn(process.execPath, [MAIN, '--background', ...extraArgs], { env, stdio: 'ignore' });
}

const exited = (child) => new Promise(resolve => {
  if (child.exitCode !== null) resolve(child.exitCode);
  else child.on('exit', code => resolve(code));
});

test('данни, останали в старата папка на „Детска консултация“, се четат оттам', { skip: process.platform === 'win32' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-home-'));
  const legacyData = path.join(home, '.detska-konsultacia', 'data');
  fs.mkdirSync(legacyData, { recursive: true });
  fs.writeFileSync(path.join(legacyData, 'practice.json'), JSON.stringify({
    practice: { name: 'Стара практика' }, doctors: [], patients: [{ id: 'p1', name: 'Иван', birthDate: '2020-01-01' }],
  }));
  const port = await freePort();
  const child = launch(home, port);
  try {
    const state = await waitFor(`http://127.0.0.1:${port}/api/state`);
    assert.equal(state.app, 'docup');
    // Инсталираната програма иска продуктов ключ, преди да покаже каквото и да е.
    assert.equal(state.needsActivation, true);
    assert.equal(state.practice, undefined);
    const blocked = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).needsActivation, true);
    // Програмата работи от старата папка: там са control.json и дневникът.
    assert.ok(fs.existsSync(path.join(home, '.detska-konsultacia', 'control.json')));
    assert.ok(fs.existsSync(path.join(home, '.detska-konsultacia', 'logs', 'server.log')));
    assert.ok(!fs.existsSync(path.join(home, '.docup')), 'не се създава празна нова папка');
  } finally {
    child.kill();
    await exited(child);
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('работеща „Детска консултация“ се разпознава — не се стартира второ копие', { skip: process.platform === 'win32' }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-home-'));
  const port = await freePort();
  // Старата програма отговаря със своя знак.
  const old = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ app: 'detska-konsultacia' }));
  });
  await new Promise(r => old.listen(port, '127.0.0.1', r));
  try {
    const child = launch(home, port);
    const code = await Promise.race([exited(child), new Promise(r => setTimeout(() => r('timeout'), 15000))]);
    if (code === 'timeout') child.kill();
    assert.equal(code, 0, 'само отваря браузъра и излиза');
    assert.ok(!fs.existsSync(path.join(home, '.docup', 'control.json')), 'не е стартиран сървър');
  } finally {
    old.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
