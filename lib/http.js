/* HTTP сървърът на платформата.
 *
 * Един и същ код обслужва и стартирането с `node server.js`, и инсталираната
 * версия за Windows (.exe). Разликите — откъде идват файловете на интерфейса
 * и как се спира програмата — се подават отвън.
 */

import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { APP_ID, HttpError, PUBLIC_ROUTES, routes } from './api.js';

export { APP_ID };
const MAX_BODY = 32 * 1024 * 1024; // достатъчно за внос на цяла база

/* ------------------------------- рутиране ------------------------------- */

/** Разбива дефинициите на пътища в подредена таблица с параметри. */
const table = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const parts = pattern.split('/').filter(Boolean);
  return { key, method, parts, handler };
});

export function match(method, pathname) {
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

export function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch { /* чужда бисквитка с неразбираемо съдържание */ }
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

/* ------------------------------ помощни ------------------------------- */

export function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

export function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function tokensEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/* -------------------------------- сървър -------------------------------- */

/**
 * @param {object} opts
 * @param {import('./store.js').Store} opts.store
 * @param {(req, res, pathname) => void} opts.serveStatic  източник на интерфейса
 * @param {() => object} [opts.info]  данни за сървъра, показвани в Настройки
 * @param {{ token: string, onStop: () => void }} [opts.control]
 *        позволява спиране с POST /__control/stop само от същия компютър
 */
export function createAppServer({ store, serveStatic, info = () => ({}), control = null }) {
  return http.createServer(async (req, res) => {
    let url;
    let pathname;
    try {
      url = new URL(req.url, 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end('Неразбираем адрес');
      return;
    }

    // Заявките към данните никога не се кешират и не напускат браузъра.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (pathname === '/__control/stop') {
      const allowed = control
        && req.method === 'POST'
        && isLoopback(req.socket.remoteAddress)
        && tokensEqual(req.headers['x-control-token'], control.token);
      if (!allowed) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      setImmediate(control.onStop);
      return;
    }

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
        server: info,
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
        send(500, { error: 'Вътрешна грешка на сървъра. Подробностите са записани в дневника.' });
      }
    }
  });
}

/** Текстът, който се показва при стартиране. */
export function banner({ port, dataDir, stopHint }) {
  const lines = [
    '',
    '  ┌────────────────────────────────────────────────────────┐',
    '  │   Детска консултация — платформа на практиката         │',
    '  └────────────────────────────────────────────────────────┘',
    '',
    `  На този компютър:   http://localhost:${port}`,
  ];
  for (const addr of localAddresses()) {
    lines.push(`  В кабинета:         http://${addr}:${port}`);
  }
  lines.push(
    '',
    `  Данни:              ${dataDir}`,
    '',
    `  ${stopHint}`,
    '');
  return lines.join('\n');
}
