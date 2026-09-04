/* Съхранение на данните.
 *
 * Всичко живее в един JSON файл (data/practice.json), който се записва
 * атомарно: пише се във временен файл, синхронизира се на диска и се
 * преименува. Така прекъснат запис не може да остави повреден файл.
 *
 * Успоредно с това всяка промяна се допълва към data/audit.log — един ред
 * JSON на действие. Журналът е само за дописване и служи и като проследимост
 * кой какво е направил, и като последна възможност за възстановяване.
 *
 * Всяко първо записване за деня прави копие в data/backups/.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { defaultSchedule } from '../public/js/shared/calendar.js';
import { today } from '../public/js/shared/dates.js';

const SCHEMA_VERSION = 1;
const KEEP_BACKUPS = 60;

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'practice.json');
    this.auditFile = path.join(dir, 'audit.log');
    this.backupDir = path.join(dir, 'backups');
    this.sessionFile = path.join(dir, 'sessions.json');
    this.writeQueued = false;
    this.writePromise = Promise.resolve();
    this.load();
  }

  /* ------------------------------- зареждане ------------------------------- */

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });

    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      try {
        this.data = JSON.parse(raw);
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

    this.sessions = new Map();
    if (fs.existsSync(this.sessionFile)) {
      try {
        for (const [token, s] of Object.entries(JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')))) {
          this.sessions.set(token, s);
        }
      } catch { /* повредените сесии просто изтичат */ }
    }
  }

  migrate() {
    const d = this.data;
    d.version ??= SCHEMA_VERSION;
    d.practice ??= { name: 'Моята практика', address: '', phone: '' };
    d.doctors ??= [];
    d.patients ??= [];
    d.settings ??= { horizonDays: 30, requireLogin: true };
    d.settings.horizonDays ??= 30;
    d.settings.requireLogin ??= true;
    if (!Array.isArray(d.schedule) || !d.schedule.length) d.schedule = defaultSchedule();
    for (const p of d.patients) {
      p.records ??= {};
      p.optIn ??= [];
      p.measurements ??= [];
      p.visits ??= [];
      p.reminders ??= [];
      p.development ??= [];
      p.contacts ??= [];
      p.allergies ??= [];
      p.conditions ??= [];
    }
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
    fs.renameSync(tmp, this.file);
  }

  /** Насрочва запис. Няколко промени в един тик се записват веднъж. */
  persist() {
    this.data.updatedAt = new Date().toISOString();
    if (this.writeQueued) return this.writePromise;
    this.writeQueued = true;
    this.writePromise = new Promise((resolve, reject) => {
      setImmediate(() => {
        this.writeQueued = false;
        try {
          this.dailyBackup();
          this.persistSync();
          resolve();
        } catch (err) {
          console.error('[данни] неуспешен запис:', err.message);
          reject(err);
        }
      });
    });
    return this.writePromise;
  }

  /** Едно резервно копие на ден, преди първата промяна за деня. */
  dailyBackup() {
    if (!fs.existsSync(this.file)) return;
    const name = `practice-${today()}.json`;
    const target = path.join(this.backupDir, name);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(this.file, target);

    const old = fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('practice-') && f.endsWith('.json'))
      .sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
      fs.unlinkSync(path.join(this.backupDir, f));
    }
  }

  /** Дописва ред в журнала. Грешките тук никога не спират работата. */
  audit(actor, action, details = {}) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      actor: actor ? { id: actor.id, name: actor.name } : null,
      action,
      ...details,
    });
    try {
      fs.appendFileSync(this.auditFile, line + '\n');
    } catch (err) {
      console.error('[журнал] запис неуспешен:', err.message);
    }
  }

  readAudit(limit = 200) {
    if (!fs.existsSync(this.auditFile)) return [];
    const lines = fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
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
    this.sessions.set(token, { doctorId, createdAt: Date.now(), lastSeen: Date.now() });
    this.saveSessions();
    return token;
  }

  getSession(token) {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    // Сесията изтича след 14 дни без активност.
    if (Date.now() - s.lastSeen > 14 * 86400000) {
      this.sessions.delete(token);
      this.saveSessions();
      return null;
    }
    s.lastSeen = Date.now();
    return s;
  }

  dropSession(token) {
    if (this.sessions.delete(token)) this.saveSessions();
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

/* ----------------------------- пароли (ПИН) ------------------------------ */

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(String(pin), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected);
}
