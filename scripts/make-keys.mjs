#!/usr/bin/env node
/* Издава нови продуктови ключове за DocUp.
 *
 *   node scripts/make-keys.mjs --count 20 --out ~/DocUp-ключове.txt
 *
 * Ключовете се записват САМО във файла --out, който трябва да е извън
 * хранилището — скриптът отказва да пише в него. В lib/license.js се добавят
 * само отпечатъците им (SHA-256), от които ключ не може да се възстанови.
 * Новите ключове важат от следващата сглобена версия на програмата.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatKey, generateKey, keyHash } from '../lib/license.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LICENSE_JS = path.join(ROOT, 'lib', 'license.js');

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const count = Number(opt('--count') || 20);
const out = opt('--out');

if (!out) {
  console.error('Посочете файл за ключовете: --out <път извън хранилището>');
  process.exit(1);
}
const outPath = path.resolve(out);
if (outPath === ROOT || outPath.startsWith(ROOT + path.sep)) {
  console.error('Ключовете не бива да попадат в хранилището. Изберете папка извън него.');
  process.exit(1);
}
if (!Number.isInteger(count) || count < 1 || count > 1000) {
  console.error('--count трябва да е между 1 и 1000.');
  process.exit(1);
}

const keys = new Set();
while (keys.size < count) keys.add(generateKey());
const list = [...keys];

const source = fs.readFileSync(LICENSE_JS, 'utf8');
const marker = 'const KEY_HASHES = [\n';
const at = source.indexOf(marker);
if (at < 0) throw new Error('В lib/license.js не е намерен списъкът KEY_HASHES.');
const stamp = new Date().toISOString().slice(0, 10);
const lines = [`  // ${count} ключа, издадени на ${stamp}`, ...list.map(k => `  '${keyHash(k)}',`)].join('\n') + '\n';
fs.writeFileSync(LICENSE_JS, source.slice(0, at + marker.length) + lines + source.slice(at + marker.length));

const text = [
  'DocUp — продуктови ключове',
  '===========================',
  '',
  `Издадени: ${stamp}. Брой: ${count}.`,
  '',
  'Всеки ключ активира една инсталация на DocUp (компютъра, на който',
  'работи програмата). Другите компютри в кабинета не се нуждаят от ключ.',
  'Ключът се въвежда при първото отваряне след инсталиране или обновяване.',
  '',
  'Пазете този файл. Ключовете не са записани никъде другаде: в програмата',
  'има само техни отпечатъци, от които ключ не може да бъде възстановен.',
  '',
  ...list.map((k, i) => `${String(i + 1).padStart(2, ' ')}.  ${formatKey(k)}`),
  '',
].join('\r\n');
fs.writeFileSync(outPath, '﻿' + text);
console.log(`${count} ключа са записани в ${outPath}; отпечатъците са добавени в lib/license.js.`);
