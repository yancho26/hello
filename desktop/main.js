/* Входна точка на инсталираната версия за Windows (DetskaKonsultacia.exe).
 *
 * Изпълнимият файл съдържа Node.js, сървъра и целия интерфейс. При стартиране:
 *   - ако програмата вече работи, само отваря браузъра;
 *   - иначе стартира сървъра във фонов режим (без черен прозорец) и отваря
 *     браузъра на http://localhost:<порт>.
 *
 * Аргументи:
 *   --background   стартира без да отваря браузъра (автоматично при влизане);
 *   --stop         спира работещото копие; с --quiet не показва съобщение.
 *
 * Папки (под Windows):
 *   C:\ProgramData\DetskaKonsultacia\data        данните и резервните копия
 *   C:\ProgramData\DetskaKonsultacia\logs        дневник на сървъра
 *   C:\ProgramData\DetskaKonsultacia\config.json порт и други настройки
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import util from 'node:util';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Store } from '../lib/store.js';
import { APP_ID, banner, createAppServer, localAddresses } from '../lib/http.js';
import { diskStatic, memoryStatic } from '../lib/static.js';

const TITLE = 'Детска консултация';
const IS_WINDOWS = process.platform === 'win32';
const sea = process.getBuiltinModule?.('node:sea');
const IS_SEA = !!sea?.isSea();

/* --------------------------------- пътища --------------------------------- */

const args = new Set(process.argv.slice(1).filter(a => a.startsWith('--')));

const HOME = path.resolve(process.env.DETSKA_HOME || (IS_WINDOWS
  ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'DetskaKonsultacia')
  : path.join(os.homedir(), '.detska-konsultacia')));
const CONFIG_FILE = path.join(HOME, 'config.json');
const CONTROL_FILE = path.join(HOME, 'control.json');
const LOG_DIR = path.join(HOME, 'logs');

const DEFAULT_CONFIG = {
  port: 8080,
  host: '0.0.0.0',
  dataDir: '',
  _бележка: 'port — порт на сървъра; host — "0.0.0.0" за достъп от кабинета или "127.0.0.1" само за този компютър; '
    + 'dataDir — друга папка за данните (празно = папка data до този файл). След промяна спрете и стартирайте програмата.',
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function loadConfig() {
  let config = readJson(CONFIG_FILE);
  if (!config) {
    config = { ...DEFAULT_CONFIG };
    if (!fs.existsSync(CONFIG_FILE)) {
      try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch { /* само за четене */ }
    }
  }
  const port = Number(process.env.PORT) || Number(config.port) || DEFAULT_CONFIG.port;
  const host = process.env.HOST || config.host || DEFAULT_CONFIG.host;
  const dataDir = path.resolve(process.env.DATA_DIR || config.dataDir || path.join(HOME, 'data'));
  return { port, host, dataDir };
}

function appVersion() {
  // При сглобяването версията се вгражда; при `node desktop/main.js` се чете от package.json.
  if (typeof __APP_VERSION__ === 'string') return __APP_VERSION__;
  const pkg = readJson(path.join(path.dirname(process.argv[1] || '.'), '..', 'package.json'));
  return pkg?.version || '0.0.0';
}

/* -------------------------------- дневник --------------------------------- */

/* Без конзолен прозорец изходът на console.* би се губил — пренасочваме го
 * към logs\server.log. Дневникът се сменя, когато надхвърли 5 MB. */
function setupLogging() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, 'server.log');
  try {
    if (fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, file + '.1');
  } catch { /* няма дневник или е зает */ }

  let fd = null;
  try { fd = fs.openSync(file, 'a'); } catch { /* пишем само в конзолата */ }

  const original = { log: console.log, error: console.error };
  const write = (level, parts, fallback) => {
    const text = util.format(...parts);
    if (fd !== null) {
      try { fs.writeSync(fd, `${new Date().toISOString()} ${level} ${text}\n`); } catch { /* диск */ }
    }
    fallback(text);
  };
  console.log = console.info = (...p) => write('INFO ', p, original.log);
  console.warn = (...p) => write('WARN ', p, original.error);
  console.error = (...p) => write('ERROR', p, original.error);
  return file;
}

/* ------------------------------ системни неща ----------------------------- */

function openBrowser(url) {
  if (process.env.DETSKA_NO_BROWSER) return;
  let cmd;
  let cmdArgs;
  if (IS_WINDOWS) {
    cmd = 'rundll32.exe';
    cmdArgs = ['url.dll,FileProtocolHandler', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [url];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [url];
  }
  try {
    const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' });
    child.on('error', err => console.error('[браузър] неуспешно отваряне:', err.message));
    child.unref();
  } catch (err) {
    console.error('[браузър] неуспешно отваряне:', err.message);
  }
}

/** Показва прозорец със съобщение. Под Windows — чрез вградения PowerShell. */
function messageBox(text, { error = false } = {}) {
  (error ? console.error : console.log)('[съобщение]', text.replace(/\n/g, ' '));
  if (!IS_WINDOWS || process.env.DETSKA_NO_DIALOGS) return Promise.resolve();
  return new Promise(resolve => {
    const script = 'Add-Type -AssemblyName System.Windows.Forms; '
      + '[void][System.Windows.Forms.MessageBox]::Show($env:DK_TEXT, $env:DK_TITLE, '
      + "'OK', $env:DK_ICON)";
    try {
      const child = spawn('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script], {
          detached: true, // без конзолен прозорец
          stdio: 'ignore',
          env: { ...process.env, DK_TEXT: text, DK_TITLE: TITLE, DK_ICON: error ? 'Error' : 'Information' },
        });
      child.on('error', () => resolve());
      child.on('exit', () => resolve());
    } catch {
      resolve();
    }
  });
}

async function fatal(text) {
  await messageBox(text, { error: true });
  process.exit(1);
}

/* --------------------------- работещо копие ------------------------------- */

function probeHost(host) {
  return ['0.0.0.0', '::', '', 'localhost'].includes(host) ? '127.0.0.1' : host;
}

/** Проверява какво слуша на порта: 'ours', 'other' или 'free'. */
function probe(host, port) {
  return new Promise(resolve => {
    const req = http.get({ host: probeHost(host), port, path: '/api/state', timeout: 3000 }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw).app === APP_ID ? 'ours' : 'other');
        } catch {
          resolve('other');
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve('other'); });
    req.on('error', err => resolve(err.code === 'ECONNREFUSED' ? 'free' : 'other'));
  });
}

function postStop(control) {
  return new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1', port: control.port, path: '/__control/stop', method: 'POST',
      headers: { 'X-Control-Token': control.token, 'Content-Length': 0 }, timeout: 5000,
    }, res => {
      res.resume();
      resolve(res.statusCode === 200 ? 'stopping' : 'refused');
    });
    req.on('timeout', () => { req.destroy(); resolve('refused'); });
    req.on('error', err => resolve(err.code === 'ECONNREFUSED' ? 'not-running' : 'refused'));
    req.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function stopRunning({ quiet }) {
  const control = readJson(CONTROL_FILE);
  if (!control?.port || !control?.token) {
    if (!quiet) await messageBox('Програмата не работи в момента.');
    return 0;
  }
  const result = await postStop(control);
  if (result === 'not-running') {
    try { fs.unlinkSync(CONTROL_FILE); } catch { /* вече го няма */ }
    if (!quiet) await messageBox('Програмата не работи в момента.');
    return 0;
  }
  if (result === 'refused') {
    if (!quiet) await messageBox('Програмата не отговори на заявката за спиране. Опитайте отново или рестартирайте компютъра.', { error: true });
    return 1;
  }
  for (let i = 0; i < 50; i++) {
    if (await probe('127.0.0.1', control.port) !== 'ours') {
      if (!quiet) await messageBox('Програмата е спряна. Данните са записани.');
      return 0;
    }
    await sleep(200);
  }
  return 1;
}

/* ------------------------------- интерфейс -------------------------------- */

function staticSource() {
  if (IS_SEA) {
    const files = {};
    for (const key of sea.getAssetKeys()) {
      if (key.startsWith('public/')) files[key.slice('public/'.length)] = Buffer.from(sea.getAsset(key));
    }
    return memoryStatic(files);
  }
  return diskStatic(path.join(path.dirname(process.argv[1] || '.'), '..', 'public'));
}

/* -------------------------------- старт ----------------------------------- */

async function main() {
  try {
    fs.mkdirSync(HOME, { recursive: true });
  } catch (err) {
    await fatal(`Папката на програмата не може да бъде създадена:\n${HOME}\n\n${err.message}`);
  }
  setupLogging();

  if (args.has('--stop')) {
    process.exit(await stopRunning({ quiet: args.has('--quiet') }));
  }

  const background = args.has('--background');
  const { port, host, dataDir } = loadConfig();
  const url = `http://localhost:${port}/`;

  const already = await probe(host, port);
  if (already === 'ours') {
    if (!background) openBrowser(url);
    process.exit(0);
  }
  if (already === 'other') {
    await fatal(`Порт ${port} е зает от друга програма и „${TITLE}“ не може да стартира.\n\n`
      + `Сменете порта в ${CONFIG_FILE} (например 8081) и стартирайте отново.`);
  }

  let store;
  try {
    store = new Store(dataDir);
  } catch (err) {
    console.error('[данни]', err);
    await fatal(`Данните не могат да бъдат заредени.\n\n${err.message}`);
  }

  const version = appVersion();
  const token = crypto.randomBytes(24).toString('hex');
  let stopping = false;

  const shutdown = (reason, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    console.log(`Спиране (${reason}). Записване на данните…`);
    try { store.persistSync(); } catch (err) { console.error('[данни]', err.message); }
    try {
      if (readJson(CONTROL_FILE)?.token === token) fs.unlinkSync(CONTROL_FILE);
    } catch { /* няма значение */ }
    server.close(() => process.exit(exitCode));
    server.closeAllConnections?.();
    setTimeout(() => process.exit(exitCode), 3000).unref();
  };

  const server = createAppServer({
    store,
    serveStatic: staticSource(),
    info: () => ({
      version,
      edition: IS_WINDOWS && IS_SEA ? 'windows' : 'node',
      port,
      dataDir,
      backupDir: store.backupDir,
      addresses: host === '127.0.0.1' ? [] : localAddresses().map(a => `http://${a}:${port}`),
    }),
    control: { token, onStop: () => shutdown('заявка за спиране') },
  });

  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      // Две стартирания почти едновременно: другото копие е спечелило порта.
      if (await probe(host, port) === 'ours') {
        if (!background) openBrowser(url);
        process.exit(0);
      }
      await fatal(`Порт ${port} е зает от друга програма.\n\nСменете порта в ${CONFIG_FILE} и стартирайте отново.`);
    }
    console.error('[сървър]', err);
    await fatal(`Сървърът не може да стартира: ${err.message}`);
  });

  server.listen(port, host, () => {
    try {
      fs.writeFileSync(CONTROL_FILE, JSON.stringify({ pid: process.pid, port, token, startedAt: new Date().toISOString() }));
    } catch (err) {
      console.error('[управление] control.json не е записан:', err.message);
    }
    console.log(`${TITLE} ${version} (${IS_SEA ? 'вграден' : 'от изходен код'}), PID ${process.pid}`
      + banner({ port, dataDir, stopHint: 'Спиране: „Спиране на Детска консултация“ в менюто Старт' }));
    if (!background) openBrowser(url);
  });

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => shutdown(signal));
  }
  process.on('uncaughtException', async (err) => {
    console.error('[неочаквана грешка]', err);
    if (stopping) return;
    // Данните се записват веднага; после съобщаваме, за да не спре програмата незабелязано.
    try { store.persistSync(); } catch { /* вече е записано при последната промяна */ }
    await messageBox(`Програмата спря поради неочаквана грешка и трябва да бъде стартирана отново.\n\n`
      + `${err?.message || err}\n\nПодробности: ${path.join(LOG_DIR, 'server.log')}`, { error: true });
    shutdown('неочаквана грешка', 1);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[неочаквана грешка]', err);
  });
}

main().catch(async (err) => {
  console.error('[старт]', err);
  await fatal(`Неочаквана грешка при стартиране:\n${err?.message || err}`);
});
