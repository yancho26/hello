/* Съхранение на данните.
 *
 * Всичко живее в един JSON файл (data/practice.json), който се записва
 * атомарно: пише се във временен файл, синхронизира се на диска и се
 * преименува. Така прекъснат запис не може да остави повреден файл.
 *
 * Успоредно с това всяка промяна се допълва към data/audit.log — един ред
 * JSON на действие. Журналът е само за дописване и служи и като проследимост
 * кой какво е направил, и като последна възможност за възстановяване.
 * Всеки ред носи отпечатък (SHA-256), изчислен и от предишния ред — така
 * изтрит или променен ред се забелязва при проверката в „Настройки“.
 *
 * Всяко първо записване за деня прави копие в data/backups/.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { defaultAdultSchedule, defaultSchedule } from '../public/js/shared/calendar.js';
import { today } from '../public/js/shared/dates.js';
import { License } from './license.js';

const SCHEMA_VERSION = 1;
const KEEP_BACKUPS = 60;
const EXTRA_EVERY_MS = 60 * 60 * 1000;
const EXTRA_TIMEOUT_MS = 15 * 1000;

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'practice.json');
    this.auditFile = path.join(dir, 'audit.log');
    this.backupDir = path.join(dir, 'backups');
    this.sessionFile = path.join(dir, 'sessions.json');
    this.extraStatusFile = path.join(dir, 'extra-backup.json');
    this.extraStatus = null;
    this.extraRunning = new Map();
    this.writeQueued = false;
    this.writePromise = Promise.resolve();
    this.lastWriteError = null;
    this.auditHead = null;
    this.load();
    this.license = new License(dir);
  }

  /* ------------------------------- зареждане ------------------------------- */

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    this.existedBefore = fs.existsSync(this.file);
    if (this.existedBefore) {
      const raw = fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '');
      try {
        this.data = JSON.parse(raw);
        if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) {
          throw new Error('съдържанието не е обект с данни');
        }
      } catch (err) {
        // Повреден файл — не го затриваме, а спираме със смислено съобщение.
        const rescue = this.file + '.corrupt-' + Date.now();
        fs.copyFileSync(this.file, rescue);
        throw new Error(
          `Файлът с данните е повреден и не може да бъде прочетен (${err.message}).\n` +
          `Копие е запазено в ${rescue}.\n` +
          `Възстановете последното резервно копие от ${this.backupDir}.`);
      }
    } else {
      this.data = {
        version: SCHEMA_VERSION,
        practice: { name: 'Моята практика', address: '', phone: '' },
        doctors: [],
        patients: [],
        schedule: defaultSchedule(),
        settings: { horizonDays: 30, requireLogin: true },
        createdAt: new Date().toISOString(),
      };
      this.persistSync();
    }
    this.migrate();

    try { this.extraStatus = JSON.parse(fs.readFileSync(this.extraStatusFile, 'utf8')); } catch { /* още няма */ }

    /* В sessions.json се пазят само отпечатъци на ключовете за сесия, не самите
     * ключове: копие на файла не позволява влизане. Файловете до версия 2.1
     * съдържат самите ключове — превръщат се при първото зареждане. */
    this.sessions = new Map();
    if (fs.existsSync(this.sessionFile)) {
      let legacy = false;
      try {
        for (const [key, s] of Object.entries(JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')))) {
          if (!s || typeof s !== 'object') continue;
          const hashed = /^[0-9a-f]{64}$/.test(key);
          if (!hashed) legacy = true;
          this.sessions.set(hashed ? key : sessionKey(key), s);
        }
      } catch { /* повредените сесии просто изтичат */ }
      if (legacy) this.saveSessions();
    }
  }

  migrate() {
    this.repairs = normalizeData(this.data);
    if (this.repairs.length) console.error('[данни] поправени при зареждане:', this.repairs.join('; '));
  }

  /**
   * Отбелязва версията на програмата. При обновяване запомня предишната,
   * за да може интерфейсът веднъж да покаже „Какво е новото“.
   */
  noteAppVersion(version) {
    const d = this.data;
    if (d.appVersion === version) return;
    // Данни от версия 1.0.0 нямат appVersion, но вече са съществували.
    if (d.appVersion || this.existedBefore) d.previousVersion = d.appVersion || '1.0.0';
    d.appVersion = version;
    this.persistSync();
  }

  /* -------------------------------- запис --------------------------------- */

  /** Записва веднага и синхронно — ползва се при първоначално създаване. */
  persistSync() {
    const tmp = this.file + '.tmp';
    const json = JSON.stringify(this.data, null, 1);
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, json);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(tmp, this.file);
  }

  /** Насрочва запис. Няколко промени в един тик се записват веднъж. */
  persist() {
    this.data.updatedAt = new Date().toISOString();
    if (this.writeQueued) return this.writePromise;
    this.writeQueued = true;
    this.writePromise = new Promise((resolve, reject) => {
      setImmediate(() => {
        this.writeQueued = false;
        // Неуспешно дневно копие (антивирус, зает файл) не бива да спира самия запис.
        try { this.dailyBackup(); } catch (err) { console.error('[копие] дневното копие не е направено:', err.message); }
        try {
          this.persistSync();
          this.lastWriteError = null;
        } catch (err) {
          this.lastWriteError = { at: new Date().toISOString(), message: err.message, code: err.code || '' };
          console.error('[данни] неуспешен запис:', err.message);
          reject(err);
          return;
        }
        // Външното копие се подновява най-много веднъж на час при промени.
        const last = this.extraStatus?.at;
        if (this.settings.extraBackupDir && (!last || Date.now() - Date.parse(last) > EXTRA_EVERY_MS)) {
          this.copyToExtra('hourly');
        }
        resolve();
      });
    });
    // Грешката се показва в „Настройки“; необработено отхвърляне не бива да спира програмата.
    this.writePromise.catch(() => {});
    return this.writePromise;
  }

  /** Едно резервно копие на ден, преди първата промяна за деня. */
  dailyBackup() {
    if (!fs.existsSync(this.file)) return;
    const name = `practice-${today()}.json`;
    const target = path.join(this.backupDir, name);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(this.backupDir, { recursive: true });
    fs.copyFileSync(this.file, target);

    const old = fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('practice-') && f.endsWith('.json'))
      .sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
      try { fs.unlinkSync(path.join(this.backupDir, f)); } catch { /* ще се изтрие следващия път */ }
    }
  }

  /**
   * Копие на данните във външна папка — флашка, втори диск или мрежова папка.
   * Защитава при повреда или кражба на компютъра. Прави се при първата
   * промяна за деня, най-много веднъж на час при промени, при спиране на
   * програмата и при натискане на „Копирай сега“. Пазят се последните 60 дни.
   *
   * Работи асинхронно: недостъпна мрежова папка не бива да блокира
   * програмата за останалите. Грешката (например извадена флашка) не спира
   * работата, а се показва в „Настройки → Данни и копия“.
   */
  copyToExtra(reason = 'manual', dir = this.settings.extraBackupDir) {
    if (!dir) return Promise.resolve(null);
    const record = (status) => {
      if (dir === this.settings.extraBackupDir) {
        this.extraStatus = status;
        try { fs.writeFileSync(this.extraStatusFile, JSON.stringify(status)); } catch { /* само за показване */ }
      }
      return status;
    };
    // Недостъпна мрежова папка може да не отговаря дълго — не чакаме повече от 15 секунди.
    const withTimeout = (work) => Promise.race([work, new Promise(resolve => {
      setTimeout(() => resolve(record({
        at: new Date().toISOString(), dir, reason, ok: false,
        error: 'папката не отговаря (изтече времето за изчакване)',
      })), EXTRA_TIMEOUT_MS).unref();
    })]);
    // Предишен опит към същата папка, който още не е приключил (например увиснала мрежова папка).
    if (this.extraRunning.has(dir)) return withTimeout(this.extraRunning.get(dir));
    const snapshot = JSON.stringify(this.data, null, 1);
    const work = (async () => {
      const status = { at: new Date().toISOString(), dir, reason, ok: false };
      try {
        await fsp.mkdir(dir, { recursive: true });
        const name = `practice-${today()}.json`;
        const tmp = path.join(dir, name + '.tmp');
        await fsp.writeFile(tmp, snapshot);
        await renameAsync(tmp, path.join(dir, name));
        const old = (await fsp.readdir(dir)).filter(f => /^practice-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
        for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
          await fsp.unlink(path.join(dir, f)).catch(() => {});
        }
        status.ok = true;
        status.file = path.join(dir, name);
      } catch (err) {
        status.error = err.message;
        console.error('[външно копие]', err.message);
      }
      record(status);
      this.extraRunning.delete(dir);
      return status;
    })();
    this.extraRunning.set(dir, work);
    return withTimeout(work);
  }

  /* -------------------------------- журнал -------------------------------- */

  /** Дописва ред в журнала. Грешките тук никога не спират работата. */
  audit(actor, action, details = {}) {
    try {
      const body = JSON.stringify({
        ts: new Date().toISOString(),
        actor: actor ? { id: actor.id, name: actor.name } : null,
        action,
        ...details,
      });
      if (this.auditHead === null) this.auditHead = lastAuditHash(this.auditFile);
      const h = chainHash(this.auditHead, body);
      fs.appendFileSync(this.auditFile, body.slice(0, -1) + `,"h":"${h}"}\n`);
      this.auditHead = h;
    } catch (err) {
      console.error('[журнал] запис неуспешен:', err.message);
    }
  }

  readAudit(limit = 200) {
    if (!fs.existsSync(this.auditFile)) return [];
    const n = Math.max(1, Math.min(5000, Math.floor(Number(limit)) || 200));
    const lines = fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).reverse().map(l => {
      try {
        const { h, ...entry } = JSON.parse(l);
        return entry;
      } catch { return null; }
    }).filter(Boolean);
  }

  /**
   * Проверява веригата от отпечатъци в журнала. Редовете отпреди версия 2.2
   * нямат отпечатък — те се броят отделно и служат за начало на веригата.
   */
  verifyAudit() {
    const out = { total: 0, verified: 0, legacy: 0, ok: true, brokenAt: null };
    if (!fs.existsSync(this.auditFile)) return out;
    let prev = '';
    const lines = fs.readFileSync(this.auditFile, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      out.total++;
      const m = /^(.*),"h":"([0-9a-f]{32})"\}$/.exec(line);
      if (!m) {
        // Ред без отпечатък след началото на веригата означава намеса.
        if (out.verified) { out.ok = false; out.brokenAt = out.brokenAt ?? i + 1; }
        out.legacy++;
        prev = chainHash(prev, line);
        continue;
      }
      const expected = chainHash(prev, m[1] + '}');
      if (expected !== m[2] && out.ok) { out.ok = false; out.brokenAt = i + 1; }
      out.verified++;
      prev = m[2];
    }
    return out;
  }

  /* -------------------------------- сесии --------------------------------- */

  saveSessions() {
    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify(Object.fromEntries(this.sessions)));
    } catch (err) {
      console.error('[сесии] запис неуспешен:', err.message);
    }
  }

  createSession(doctorId) {
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(sessionKey(token), { doctorId, createdAt: Date.now(), lastSeen: Date.now() });
    this.saveSessions();
    return token;
  }

  getSession(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    const key = sessionKey(token);
    const s = this.sessions.get(key);
    if (!s) return null;
    // Сесията изтича след 14 дни без активност или по-рано, ако в
    // настройките е включено автоматично излизане (с 2 минути толеранс,
    // защото браузърът подновява сесията само докато някой работи).
    const idleMinutes = this.settings.requireLogin ? Number(this.settings.autoLogoutMinutes) || 0 : 0;
    const limit = idleMinutes ? (idleMinutes + 2) * 60000 : 14 * 86400000;
    if (Date.now() - s.lastSeen > limit) {
      this.sessions.delete(key);
      this.saveSessions();
      if (idleMinutes) this.audit(this.doctor(s.doctorId), 'auto_logout');
      return null;
    }
    s.lastSeen = Date.now();
    return s;
  }

  dropSession(token) {
    if (token && this.sessions.delete(sessionKey(String(token)))) this.saveSessions();
  }

  /** Затваря сесиите на потребител (при сменен ПИН или спрян достъп), без посочената. */
  dropSessionsOf(doctorId, keepToken = null) {
    const keep = keepToken ? sessionKey(String(keepToken)) : null;
    let count = 0;
    for (const [key, s] of this.sessions) {
      if (s.doctorId === doctorId && key !== keep) {
        this.sessions.delete(key);
        count++;
      }
    }
    if (count) this.saveSessions();
    return count;
  }

  /* ------------------------------- достъпи -------------------------------- */

  get patients() { return this.data.patients; }
  get doctors() { return this.data.doctors; }
  get schedule() { return this.data.schedule; }
  get settings() { return this.data.settings; }

  patient(id) { return this.data.patients.find(p => p.id === id) || null; }
  doctor(id) { return this.data.doctors.find(d => d.id === id) || null; }

  nextId(prefix) {
    return prefix + '-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  }
}

/* --------------------------- проверка на данните --------------------------- */

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const PATIENT_LISTS = ['measurements', 'visits', 'reminders', 'development', 'contacts',
  'chronic', 'meds', 'results', 'assessments', 'nutritionPlans', 'studies', 'nodules'];
const PATIENT_TEXT_LISTS = ['optIn', 'allergies', 'conditions'];

/**
 * Допълва липсващите полета (данни от по-стари версии) и поправя неправилни
 * типове — например след ръчна редакция на файла или възстановяване от
 * чуждо копие. Един повреден запис не бива да спира списъка с всички пациенти.
 * Връща списък с направените поправки (за дневника).
 */
export function normalizeData(d) {
  const repairs = [];
  d.version ??= SCHEMA_VERSION;
  if (!isObject(d.practice)) d.practice = { name: 'Моята практика', address: '', phone: '' };
  if (!Array.isArray(d.doctors)) d.doctors = [];
  const doctors = d.doctors.filter(x => isObject(x) && typeof x.id === 'string' && x.id);
  if (doctors.length !== d.doctors.length) repairs.push(`премахнати ${d.doctors.length - doctors.length} неправилни потребителя`);
  d.doctors = doctors;
  for (const doc of d.doctors) {
    if (typeof doc.name !== 'string') doc.name = String(doc.name ?? '');
    if (doc.pin !== null && doc.pin !== undefined && (typeof doc.pin !== 'string' || !doc.pin.includes(':'))) {
      // Неразбираем ПИН (ръчно редактиран файл) би заключил потребителя завинаги.
      // Който може да редактира файла, и без това има достъп до данните.
      doc.pin = null;
      repairs.push(`ПИН-ът на „${doc.name}“ е неразбираем и е премахнат — задайте нов`);
    }
  }
  if (!Array.isArray(d.patients)) d.patients = [];
  const patients = d.patients.filter(isObject);
  if (patients.length !== d.patients.length) repairs.push(`премахнати ${d.patients.length - patients.length} празни записа за пациенти`);
  d.patients = patients;

  if (!isObject(d.settings)) d.settings = { horizonDays: 30, requireLogin: true };
  const st = d.settings;
  st.horizonDays ??= 30;
  st.requireLogin ??= true;
  st.autoLogoutMinutes ??= 0;
  st.extraBackupDir ??= '';
  st.cvRegion ??= 'very_high';
  if (!['local', 'lan', 'any'].includes(st.network)) st.network = 'lan';
  if (!Array.isArray(st.allowedHosts)) st.allowedHosts = [];
  st.allowedHosts = st.allowedHosts.filter(h => typeof h === 'string' && h).slice(0, 20);
  // Модули за специалисти — по подразбиране изключени (практика на ОПЛ).
  const mods = isObject(st.modules) ? st.modules : {};
  st.modules = { cardio: mods.cardio === true, endo: mods.endo === true };

  if (!Array.isArray(d.schedule) || !d.schedule.length) d.schedule = defaultSchedule();
  const schedule = d.schedule.filter(i => isObject(i) && typeof i.id === 'string' && i.id);
  if (schedule.length !== d.schedule.length) repairs.push(`премахнати ${d.schedule.length - schedule.length} неправилни дейности от календара`);
  d.schedule = schedule.length ? schedule : defaultSchedule();
  // Данни от версия 1.x нямат календар за възрастни — добавя се веднъж.
  if (!d.schedule.some(i => i.track === 'adult')) d.schedule.push(...defaultAdultSchedule());

  const ids = new Set();
  for (const p of d.patients) {
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id)) {
      p.id = 'p-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      repairs.push(`нов идентификатор за досие „${p.name}“`);
    }
    ids.add(p.id);
    if (typeof p.name !== 'string') p.name = String(p.name ?? '');
    if (!isObject(p.records)) p.records = {};
    for (const [k, rec] of Object.entries(p.records)) {
      if (!isObject(rec)) delete p.records[k];
    }
    for (const k of PATIENT_LISTS) {
      if (!Array.isArray(p[k])) p[k] = [];
      else if (p[k].some(x => !isObject(x))) p[k] = p[k].filter(isObject);
    }
    for (const k of PATIENT_TEXT_LISTS) {
      if (!Array.isArray(p[k])) p[k] = [];
      else if (p[k].some(x => typeof x !== 'string')) p[k] = p[k].filter(x => typeof x === 'string');
    }
    if (!isObject(p.lifestyle)) p.lifestyle = {};
    for (const st of p.studies) if (!isObject(st.values)) st.values = {};
    for (const n of p.nodules) {
      for (const k of ['exams', 'fna']) {
        if (!Array.isArray(n[k])) n[k] = [];
        else if (n[k].some(x => !isObject(x))) n[k] = n[k].filter(isObject);
      }
      for (const e of n.exams) {
        if (!Array.isArray(e.dims)) e.dims = [];
        e.dims = e.dims.map(Number).filter(x => Number.isFinite(x) && x > 0).slice(0, 3);
      }
    }
  }
  return repairs;
}

/* ------------------------------ помощни ---------------------------------- */

/** Отпечатък на ключа за сесия — само той се пази на диска и в паметта. */
function sessionKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Отпечатък на ред от журнала, свързан с предишния. */
function chainHash(prev, body) {
  return crypto.createHash('sha256').update(prev + '\n' + body).digest('hex').slice(0, 32);
}

/** Отпечатъкът на последния ред (или началото на веригата за стар журнал). */
function lastAuditHash(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return '';
  }
  try {
    const size = fs.fstatSync(fd).size;
    if (!size) return '';
    const len = Math.min(size, 64 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n').filter(l => l.trim());
    const last = lines.at(-1) || '';
    const m = /,"h":"([0-9a-f]{32})"\}$/.exec(last);
    if (m) return m[1];
    // Стар журнал без отпечатъци: веригата започва от целия досегашен файл.
    return chainHashOfLegacy(file);
  } finally {
    fs.closeSync(fd);
  }
}

function chainHashOfLegacy(file) {
  let prev = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const m = /^(.*),"h":"([0-9a-f]{32})"\}$/.exec(line);
    prev = m ? m[2] : chainHash(prev, line);
  }
  return prev;
}

/* Под Windows антивирусът или програма за резервни копия може за миг да
 * държи файла отворен и преименуването да върне EPERM/EBUSY. Изчакваме
 * кратко и опитваме пак, вместо да губим записа. */
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const pause = new Int32Array(new SharedArrayBuffer(4));

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (!RETRYABLE.has(err.code) || attempt >= 20) throw err;
      Atomics.wait(pause, 0, 0, 25 + attempt * 25);
    }
  }
}

async function renameAsync(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      if (!RETRYABLE.has(err.code) || attempt >= 20) throw err;
      await new Promise(r => setTimeout(r, 25 + attempt * 25));
    }
  }
}

/* ----------------------------- пароли (ПИН) ------------------------------ */

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(String(pin), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected);
}
