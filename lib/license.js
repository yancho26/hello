/* Активиране на DocUp с продуктов ключ.
 *
 * Ключът има вида DOCUP-XXXXX-XXXXX-XXXXX-XXXXX: 19 случайни знака и един
 * контролен (азбука Crockford base32 — без O, I, L и U, които лесно се
 * бъркат). Контролният знак хваща повечето грешки при преписване, още преди
 * ключът да се провери.
 *
 * В програмата НЕ се пазят самите ключове, а само техните отпечатъци
 * (SHA-256). От отпечатък ключ не може да се възстанови — 19 случайни знака са
 * около 95 бита и не могат да се налучкат. Затова кодът може да е публичен, а
 * ключовете остават само у DocUp. Нови ключове: scripts/make-keys.mjs.
 *
 * Активирането се записва в license.json в папката с данните (заедно с
 * отпечатъка, не с ключа) и важи за тази инсталация. Проверката е изцяло на
 * компютъра — без връзка с интернет, така че програмата не може да знае дали
 * същият ключ е въведен и другаде.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_CHARS = 19;
const KEY_CHARS = RANDOM_CHARS + 1;

/** Отпечатъците на издадените ключове (виж scripts/make-keys.mjs). */
const KEY_HASHES = [
  // 20 ключа, издадени на 2026-09-28
  'e146282d9c197835304c7064bfcba29d4f12a063e133e3b0632aeaab3388b376',
  'c142b9e45a65b0fb3f902626ead5e25a2dcfc0b35fab9176884a0386dafaffda',
  '8bf907fecf33f762e823e7fe70a6ee58bca6ce712edd4f71ef668f7e6522687f',
  'dc8ca52c099ef8ef2fd48480d016b86ce31a4b67c4b9f7cc51885cc0ef7cec41',
  '84722303be15fbd07a8cc60434b9aa377ed6c298b81cb982cac9c7e0c2681ef3',
  'fc0d47f0ff7e69de146b6bd828b8bc7769e440d60a806ea42c49a955f0747d1f',
  'a813433a54d26ab229541f14a8d6ab08879b2856a614282dc718572b53beed4c',
  '3e7816b5648562b7cacbd5bdb1dd220e785d80d7c4cac12df6105d592143c347',
  '9abdbe46660cac9a7d7238dca6056ee56135ac8b5a80e03c69bca86739c567fc',
  '913fc530c0e31463939708446b838f3d830b6d3d1db538453abac818ca04f24f',
  '3b67505db6c80adcf4a79784d211b9a4f2a3d641912169296387dbe62f546634',
  '5e16b1725343e00cdae343074c228acea0d4580edc6afa4c97ce85f492fbf316',
  '15412785df2f8664513ab517244d2348fce23afe24ccdfb02f13c3597b291c99',
  '5fd32ded9c96e6b7d5b58b6ef458e657b5f2b51e73a72040829ec58a64434564',
  'ce3c801d31c54e2fa2abb1009ce9833758c707ff64c376dde3a00a131576b336',
  '8334f4c9db4d554a6ad9b46a6908709b4104676764a60954d8cc05d7db7836cb',
  'fb69b136a1f86cd9e845231fd50c95db77278b422181155a7f2d4f860d410059',
  '41c7ea015c721d0fab22c0b3e42de00832aa206cf88a6dfd47905d887df3be8c',
  'aaccf3b2e54fbae7c96cf1fd0df9b2f2ab9f85d06bd860eeaad09041f569b389',
  'df78cdbe60482fe6e110b7ce00acb741cfc945942b9c4879b7b331b8548a97e2',
];

/* При проверката на Windows в GitHub се сглобява отделна версия с еднократен
 * тестов ключ, създаден при самото сглобяване (виж build-windows.mjs). */
/* global __TEST_KEY_HASHES__ */
const TEST_KEY_HASHES = typeof __TEST_KEY_HASHES__ !== 'undefined' ? __TEST_KEY_HASHES__ : [];

export const ISSUED = new Set([...KEY_HASHES, ...TEST_KEY_HASHES]);

/** Приема ключа така, както е въведен: малки букви, интервали, „O“ вместо нула… */
export function normalizeKey(input) {
  return String(input ?? '').toUpperCase()
    .replace(/^\s*DOCUP[\s\-_.]*/, '')
    .replace(/[\s\-_.–—]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}

export function checkChar(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * ALPHABET.indexOf(body[i]);
  return ALPHABET[sum % 31];
}

/** Вярна ли е формата на ключа (дължина, знаци, контролен знак). */
export function wellFormed(key) {
  return key.length === KEY_CHARS
    && [...key].every(c => ALPHABET.includes(c))
    && key[RANDOM_CHARS] === checkChar(key.slice(0, RANDOM_CHARS));
}

export const keyHash = (key) => crypto.createHash('sha256').update('docup-key-v1:' + key).digest('hex');

export function formatKey(key) {
  return 'DOCUP-' + key.match(/.{1,5}/g).join('-');
}

/** За показване: само последната група. */
export const maskedKey = (last) => `DOCUP-•••••-•••••-•••••-${last}`;

/** Нов случаен ключ (за scripts/make-keys.mjs и за тестовете). */
export function generateKey() {
  let body = '';
  for (let i = 0; i < RANDOM_CHARS; i++) body += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return body + checkChar(body);
}

/**
 * Проверява въведен ключ.
 * @returns {{ ok: true, key, hash } | { ok: false, reason: 'format' | 'unknown' }}
 */
export function checkKey(input, issued = ISSUED) {
  const key = normalizeKey(input);
  if (!wellFormed(key)) return { ok: false, reason: 'format' };
  const hash = keyHash(key);
  return issued.has(hash) ? { ok: true, key, hash } : { ok: false, reason: 'unknown' };
}

export class License {
  /**
   * @param {string} dir  папката с данните
   * @param {{ issued?: Set<string> }} [opts]  издадените ключове (за тестовете)
   */
  constructor(dir, { issued = ISSUED } = {}) {
    this.file = path.join(dir, 'license.json');
    this.issued = issued;
    this.data = null;
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // Важи само запис с отпечатък на издаден ключ — ръчно написан файл не активира.
      this.data = d && typeof d.keyHash === 'string' && this.issued.has(d.keyHash) ? d : null;
    } catch {
      this.data = null;
    }
  }

  get active() { return !!this.data; }

  activate(input, by = null) {
    const res = checkKey(input, this.issued);
    if (!res.ok) return res;
    const data = {
      keyHash: res.hash,
      keyEnd: res.key.slice(-5),
      activatedAt: new Date().toISOString(),
      activatedBy: by ? by.name : '',
      computer: os.hostname(),
    };
    const tmp = this.file + '.tmp';
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, this.file);
    this.data = data;
    return { ok: true, key: res.key };
  }

  info() {
    if (!this.data) return { active: false };
    return {
      active: true,
      key: maskedKey(this.data.keyEnd || ''),
      activatedAt: this.data.activatedAt || '',
      activatedBy: this.data.activatedBy || '',
    };
  }
}
