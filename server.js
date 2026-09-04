#!/usr/bin/env node
/* Локален сървър на практиката.
 *
 * Работи без външни библиотеки. Стартира се с `node server.js` и обслужва
 * както интерфейса, така и данните. Другите компютри в кабинета се свързват
 * по адреса, който се изписва при стартиране.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { HttpError, PUBLIC_ROUTES, routes } from './lib/api.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const MAX_BODY = 32 * 1024 * 1024; // достатъчно за внос на цяла база

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const store = new Store(DATA_DIR);

/* ------------------------------- рутиране ------------------------------- */

/** Разбива дефинициите на пътища в подредена таблица с параметри. */
const table = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const parts = pattern.split('/').filter(Boolean);
  return { key, method, parts, handler };
});

function match(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const route of table) {
    if (route.method !== method || route.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const spec = route.parts[i];
      if (spec.startsWith(':')) params[spec.slice(1)] = decodeURIComponent(parts[i]);
      else if (spec !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

/* -------------------------------- бисквитки ----------------------------- */

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* --------------------------------- тяло --------------------------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Заявката е твърде голяма.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Тялото на заявката не е валиден JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------ статични файлове ------------------------ */

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // Изрично премахваме опитите за излизане извън папката public.
  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Забранено');
    return;
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Страницата не е намерена');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'ETag': etag,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  });
}

/* -------------------------------- сървър -------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  // Заявките към данните никога не се кешират и не напускат браузъра.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Методът не е позволен');
      return;
    }
    serveStatic(req, res, pathname);
    return;
  }

  const send = (status, payload, headers = {}) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(body);
  };

  try {
    const found = match(req.method, pathname);
    if (!found) {
      send(404, { error: 'Непознат адрес.' });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.sid || '';
    const session = store.getSession(token);
    const doctor = session ? store.doctor(session.doctorId) : null;

    /* Защита срещу заявки от чужди страници: приемаме само същия източник.
     *
     * Зад обратно прокси (Codespaces, nginx, тунел) браузърът праща Origin с
     * външния адрес, а до сървъра стига Host на вътрешния — затова се приема
     * и съвпадение с X-Forwarded-Host. Това не отслабва защитата: чужда
     * страница не може да зададе такава заглавка без preflight заявка, а на
     * нея сървърът не отговаря с CORS разрешение и браузърът я спира. */
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin) {
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch {
          send(403, { error: 'Заявка с неразбираем източник.' });
          return;
        }
        const allowed = [req.headers.host, req.headers['x-forwarded-host']]
          .filter(Boolean)
          .flatMap(v => String(v).split(',').map(h => h.trim()));
        if (!allowed.includes(originHost)) {
          send(403, { error: 'Заявка от друг източник.' });
          return;
        }
      }
    }

    const needsAuth = store.settings.requireLogin
      && store.doctors.length > 0
      && !PUBLIC_ROUTES.has(found.route.key);
    if (needsAuth && !doctor) {
      send(401, { error: 'Необходимо е вписване.' });
      return;
    }

    const outHeaders = {};
    const ctx = {
      store,
      doctor: doctor || (store.settings.requireLogin ? null : store.doctors.find(d => d.active !== false) || null),
      token,
      params: found.params,
      query: Object.fromEntries(url.searchParams),
      body: req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req),
      setSession: (t) => {
        outHeaders['Set-Cookie'] =
          `sid=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${14 * 86400}`;
      },
      clearSession: () => {
        outHeaders['Set-Cookie'] = 'sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
      },
    };

    const result = await found.route.handler(ctx);
    send(200, result === undefined ? { ok: true } : result, outHeaders);
  } catch (err) {
    if (err instanceof HttpError) {
      send(err.status, { error: err.message });
    } else {
      console.error('[грешка]', err);
      send(500, { error: 'Вътрешна грешка на сървъра. Проверете конзолата за подробности.' });
    }
  }
});

/* ------------------------------- стартиране ----------------------------- */

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  const lines = [
    '',
    '  ┌────────────────────────────────────────────────────────┐',
    '  │   Детска консултация — платформа на практиката         │',
    '  └────────────────────────────────────────────────────────┘',
    '',
    `  На този компютър:   http://localhost:${PORT}`,
  ];
  for (const addr of localAddresses()) {
    lines.push(`  В кабинета:         http://${addr}:${PORT}`);
  }
  lines.push(
    '',
    `  Данни:              ${DATA_DIR}`,
    `  Резервни копия:     ${path.join(DATA_DIR, 'backups')}`,
    '',
    '  Спиране: Ctrl+C',
    '');
  console.log(lines.join('\n'));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nЗаписване на данните и спиране…');
    try { store.persistSync(); } catch (err) { console.error(err.message); }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

export { server, store };
