#!/usr/bin/env node
/* Локален сървър на практиката.
 *
 * Работи без външни библиотеки. Стартира се с `node server.js` и обслужва
 * както интерфейса, така и данните. Другите компютри в кабинета се свързват
 * по адреса, който се изписва при стартиране.
 *
 * Инсталираната версия за Windows ползва същия сървър през desktop/main.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspaces } from './lib/workspaces.js';
import { banner, createAppServer, localAddresses } from './lib/http.js';
import { diskStatic } from './lib/static.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
// Демонстрацията с измислени данни (Codespaces) работи без продуктов ключ.
const DEMO = process.env.DOCUP_DEMO === '1';

// Двете практики: на ОПЛ (data/) и за СИМП (data/simp/).
const workspaces = Workspaces.open(DATA_DIR);
const store = workspaces.gp;
workspaces.noteAppVersion(VERSION);

const server = createAppServer({
  workspaces,
  requireActivation: !DEMO,
  serveStatic: diskStatic(path.join(ROOT, 'public')),
  info: () => ({
    version: VERSION,
    previousVersion: store.data.previousVersion || null,
    edition: 'node',
    port: PORT,
    host: HOST,
    dataDir: DATA_DIR,
    backupDir: store.backupDir,
    addresses: localAddresses().map(a => `http://${a}:${PORT}`),
  }),
});

server.listen(PORT, HOST, () => {
  console.log(banner({ port: PORT, dataDir: DATA_DIR, stopHint: 'Спиране: Ctrl+C' }));
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log('\nЗаписване на данните и спиране…');
    try { workspaces.persistSync(); } catch (err) { console.error(err.message); }
    server.close();
    server.closeAllConnections?.();
    await Promise.race([workspaces.copyToExtra('shutdown'), new Promise(r => setTimeout(r, 8000))]);
    process.exit(0);
  });
}

export { server, store, workspaces };
