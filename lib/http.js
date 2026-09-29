/* HTTP сървърът на платформата.
 *
 * Един и същ код обслужва и стартирането с `node server.js`, и инсталираната
 * версия за Windows (.exe). Разликите — откъде идват файловете на интерфейса
 * и как се спира програмата — се подават отвън.
 */

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import { APP_ID, HttpError, LEGACY_APP_IDS, PUBLIC_ROUTES, routes } from './api.js';
import { ACTIVATION_ROUTES } from './api-license.js';
import { WORKSPACE_IDS, Workspaces } from './workspaces.js';

export { APP_ID, LEGACY_APP_IDS };
const MAX_BODY = 32 * 1024 * 1024; // достатъчно за внос на цяла база

/* ------------------------------- рутиране ------------------------------- */

/** Разбива дефинициите на пътища в подредена таблица с параметри. */
const table = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const parts = pattern.split('/').filter(Boolean);
  return { key, method, parts, handler };
});

/** Търси пътя по суровия (незакодиран) адрес — всяка част се декодира отделно,
 * така че „%2F“ в идентификатор не се превръща в разделител. */
export function match(method, rawPath) {
  let parts;
  try {
    parts = rawPath.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  for (const route of table) {
    if (route.method !== method || route.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const spec = route.parts[i];
      if (spec.startsWith(':')) params[spec.slice(1)] = parts[i];
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
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        reject(new HttpError(400, 'Тялото на заявката не е валиден JSON.'));
        return;
      }
      // Всички обработчици очакват обект; null, списък или число водеха до грешка 500.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(new HttpError(400, 'Тялото на заявката трябва да е JSON обект.'));
        return;
      }
      resolve(parsed);
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
  const a = String(address || '').toLowerCase().replace(/^::ffff:/, '');
  return a === '::1' || /^127\./.test(a);
}

/** Заявката идва ли от същия компютър — по 127.0.0.1 или по собствен адрес в мрежата. */
export function isLocalRequest(req) {
  // Зад обратно прокси (Codespaces, nginx) истинският клиент е другаде.
  if (req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) return false;
  const address = clientAddress(req);
  return isLoopback(address) || localAddresses().includes(address);
}

export const clientAddress = (req) => String(req.socket.remoteAddress || '').toLowerCase().replace(/^::ffff:/, '');

/**
 * Вид на адреса, от който идва заявката:
 *   'loopback' — същият компютър;
 *   'private'  — вътрешна мрежа (кабинет, домашен рутер, VPN като Tailscale);
 *   'public'   — адрес в интернет.
 */
export function addressKind(address) {
  const a = String(address || '').toLowerCase().replace(/^::ffff:/, '');
  if (isLoopback(a)) return 'loopback';
  if (net.isIPv4(a)) {
    const [x, y] = a.split('.').map(Number);
    if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168)
      || (x === 169 && y === 254) || (x === 100 && y >= 64 && y <= 127)) return 'private';
    return 'public';
  }
  if (net.isIPv6(a) && (/^fe[89ab]/.test(a) || /^f[cd]/.test(a))) return 'private';
  return 'public';
}

/**
 * Позволен ли е адресът, с който браузърът е отворил програмата (заглавката Host).
 *
 * Защита срещу „DNS rebinding“: чужд сайт, отворен в браузъра на кабинета,
 * може да насочи своето име към 127.0.0.1 и да чете данните като „свой“
 * адрес. Такава заявка носи чуждото име в Host — затова приемаме само
 * IP адреси, localhost, имена на компютри в мрежата (без точка или с
 * .local, .lan, .home…) и изрично добавените в „Настройки → Сигурност“.
 */
export function hostAllowed(hostHeader, extra = []) {
  if (hostHeader === undefined) return true; // HTTP/1.0 без Host — не идва от браузър
  let host = String(hostHeader).trim().toLowerCase();
  if (!host) return false;
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end > 0 && net.isIPv6(host.slice(1, end));
  }
  host = host.replace(/:\d*$/, '').replace(/\.$/, '');
  if (net.isIP(host)) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (/^[a-z0-9_-]+$/.test(host)) return true; // име на компютър в мрежата, напр. RECEPTION-PC
  if (/\.(local|lan|home|internal|intranet|corp|localdomain|home\.arpa)$/.test(host)) return true;
  const me = os.hostname().toLowerCase();
  if (host === me || host.startsWith(me + '.')) return true;
  if (host.endsWith('.app.github.dev')) return true; // пробна среда в GitHub Codespaces
  const rules = [...extra, ...String(process.env.ALLOWED_HOSTS || '').split(',')];
  for (const rule of rules) {
    const r = String(rule || '').trim().toLowerCase().replace(/:\d*$/, '');
    if (!r) continue;
    if (r.startsWith('*.') ? host.endsWith(r.slice(1)) : host === r) return true;
  }
  return false;
}

/** Заглавки за сигурност на всеки отговор. Интерфейсът не зарежда нищо външно. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function tokensEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/* -------------------------------- сървър -------------------------------- */

/** Бисквитката със сесията на всяка практика — двете сесии живеят успоредно. */
const SESSION_COOKIE = { gp: 'sid', simp: 'sid_simp' };
const COOKIE_TAIL = 'Path=/; HttpOnly; SameSite=Strict';

/**
 * @param {object} opts
 * @param {import('./store.js').Store} [opts.store]  практиката на ОПЛ (ако не са дадени двете)
 * @param {Workspaces} [opts.workspaces]  двете практики — ОПЛ и СИМП
 * @param {(req, res, pathname) => void} opts.serveStatic  източник на интерфейса
 * @param {() => object} [opts.info]  данни за сървъра, показвани в Настройки
 * @param {{ token: string, onStop: () => void }} [opts.control]
 *        позволява спиране с POST /__control/stop само от същия компютър
 * @param {boolean} [opts.requireActivation]  данните са достъпни само след
 *        въведен продуктов ключ (изключва се само за тестовете и демонстрацията)
 */
export function createAppServer({ store, workspaces = null, serveStatic, info = () => ({}), control = null, requireActivation = true }) {
  const spaces = workspaces || new Workspaces(store);
  // Мрежата, разрешените адреси и ключът са общи за инсталацията.
  const install = spaces.install;
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

    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const isApi = pathname.startsWith('/api/');
    const refuse = (status, text) => {
      if (isApi) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          .end(JSON.stringify({ error: text }));
      } else {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(text);
      }
    };

    // Кой може да се свърже: само този компютър, кабинетът (вътрешна мрежа) или всеки.
    const ip = clientAddress(req);
    const network = install.settings.network || 'lan';
    const kind = addressKind(ip);
    const fromHere = kind === 'loopback' || localAddresses().includes(ip);
    if (network === 'local' && !fromHere) {
      refuse(403, 'Програмата е настроена да работи само на компютъра, на който е инсталирана. '
        + 'Достъпът от други компютри се разрешава от Настройки → Сигурност на този компютър.');
      return;
    }
    if (network === 'lan' && kind === 'public' && !fromHere) {
      refuse(403, 'Достъпът до програмата е разрешен само от вътрешната мрежа на кабинета.');
      return;
    }
    if (!hostAllowed(req.headers.host, install.settings.allowedHosts)) {
      refuse(421, `Адресът „${String(req.headers.host).slice(0, 100)}“ не е разрешен за достъп до програмата. `
        + 'Ако го използвате нарочно (например име в мрежата на кабинета), добавете го в '
        + 'Настройки → Сигурност → Разрешени адреси от компютъра, на който работи програмата.');
      return;
    }

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

    if (!isApi) {
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
      const found = match(req.method, url.pathname);
      if (!found) {
        send(404, { error: 'Непознат адрес.' });
        return;
      }

      // Без активиране — само състоянието и въвеждането на ключ.
      if (requireActivation && !install.license.active && !ACTIVATION_ROUTES.has(found.route.key)) {
        send(403, { error: 'DocUp не е активиран. Въведете продуктов ключ.', needsActivation: true });
        return;
      }

      /* Коя практика: избраната при входа (бисквитка „ws“). Без избор —
       * практиката на ОПЛ, както до версия 3.3; интерфейсът тогава показва
       * екрана за вход с двете възможности. */
      const cookies = parseCookies(req.headers.cookie);
      const chosen = WORKSPACE_IDS.includes(cookies.ws) ? cookies.ws : null;
      const workspace = chosen || 'gp';
      const store = spaces.get(workspace);
      /** Вписаният потребител в дадена практика — спрян потребител губи достъп веднага, дори с отворена сесия. */
      const doctorIn = (id) => {
        if (!spaces.exists(id)) return null;
        const st = spaces.get(id);
        const s = st.getSession(cookies[SESSION_COOKIE[id]] || '');
        const d = s ? st.doctor(s.doctorId) : null;
        return d && d.active !== false ? d : null;
      };
      const token = cookies[SESSION_COOKIE[workspace]] || '';
      const doctor = doctorIn(workspace);

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

      const outCookies = [];
      const ctx = {
        store,
        workspaces: spaces,
        install,
        workspace,
        workspaceChosen: !!chosen,
        doctorIn,
        server: () => ({
          ...info(),
          // Спиране от интерфейса: само където е предвидено и само от този компютър.
          canStop: !!control,
          local: isLocalRequest(req),
        }),
        stopServer: control ? () => setTimeout(control.onStop, 300) : null,
        isLocal: () => isLocalRequest(req),
        ip,
        activation: { required: requireActivation },
        doctor: doctor || (store.settings.requireLogin ? null : store.doctors.find(d => d.active !== false) || null),
        token,
        params: found.params,
        query: Object.fromEntries(url.searchParams),
        body: req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req),
        setSession: (t, id = workspace) => {
          outCookies.push(`${SESSION_COOKIE[id]}=${t}; ${COOKIE_TAIL}; Max-Age=${14 * 86400}`);
        },
        clearSession: (id = workspace) => {
          outCookies.push(`${SESSION_COOKIE[id]}=; ${COOKIE_TAIL}; Max-Age=0`);
        },
        /** Запомня избраната при входа практика (null — връща към избора). */
        setWorkspace: (id) => {
          outCookies.push(WORKSPACE_IDS.includes(id)
            ? `ws=${id}; ${COOKIE_TAIL}; Max-Age=${400 * 86400}`
            : `ws=; ${COOKIE_TAIL}; Max-Age=0`);
        },
      };

      const result = await found.route.handler(ctx);
      send(200, result === undefined ? { ok: true } : result, outCookies.length ? { 'Set-Cookie': outCookies } : {});
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
    '  │   DocUp — платформа за ОПЛ и специалисти (СИМП)        │',
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
