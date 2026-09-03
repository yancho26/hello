'use strict';
/* Извлича LMS параметрите от официалните xlsx таблици на СЗО.
   Използва се веднъж при разработка; резултатът се записва в public/js/who-growth-data.js */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;

function unzipEntry(file, entry) {
  return execFileSync('unzip', ['-p', file, entry], { maxBuffer: 1 << 28 }).toString('utf8');
}

function parseSheet(file) {
  let shared = [];
  try {
    const ss = unzipEntry(file, 'xl/sharedStrings.xml');
    shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
  } catch { /* няма sharedStrings */ }

  const sheet = unzipEntry(file, 'xl/worksheets/sheet1.xml');
  const rows = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cm[1], attrs = cm[2], body = cm[3];
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      if (!vm) continue;
      cells[col] = / t="s"/.test(attrs) ? shared[+vm[1]] : vm[1];
    }
    rows.push(cells);
  }
  return rows;
}

function colName(i) { // 0 -> A
  let s = '';
  i++;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/** Връща [{age, L, M, S}] от таблица, като разпознава колоните по заглавие. */
function extractLMS(file, { unit }) {
  const rows = parseSheet(file);
  const header = rows[0];
  const idx = {};
  for (let i = 0; i < 40; i++) {
    const v = header[colName(i)];
    if (!v) continue;
    const k = String(v).trim().toLowerCase();
    if (k === 'l') idx.L = colName(i);
    else if (k === 'm') idx.M = colName(i);
    else if (k === 's') idx.S = colName(i);
    else if (k === 'day') idx.day = colName(i);
    else if (k === 'month' || k === 'agemos' || k === 'age') idx.month = colName(i);
  }
  if (!idx.L || !idx.M || !idx.S) throw new Error('липсват L/M/S колони в ' + path.basename(file) + ' -> ' + JSON.stringify(header));

  const out = [];
  for (const r of rows.slice(1)) {
    const L = parseFloat(r[idx.L]), M = parseFloat(r[idx.M]), S = parseFloat(r[idx.S]);
    if (!isFinite(L) || !isFinite(M) || !isFinite(S)) continue;
    let age;
    if (unit === 'day' && idx.day) age = parseFloat(r[idx.day]) / 30.4375;      // дни -> месеци
    else if (idx.month) age = parseFloat(r[idx.month]);
    else if (idx.day) age = parseFloat(r[idx.day]) / 30.4375;
    else continue;
    if (!isFinite(age)) continue;
    out.push({ age, L, M, S });
  }
  return out;
}

/** Прорежда до цели месеци.
 *  При дневните таблици се взима първият ред на или след точната възраст.
 *  Това има значение на 24 месеца, където СЗО сменя лежащата дължина с
 *  изправен ръст (разлика 0.7 см): от 24-ия месец нататък е в сила ръстът,
 *  както е и в месечните таблици на СЗО. */
function toMonthly(series, from, to) {
  const res = [];
  const sorted = series.slice().sort((a, b) => a.age - b.age);
  for (let m = from; m <= to; m++) {
    let pick = sorted.find(p => p.age >= m - 1e-9);
    if (!pick || pick.age - m > 0.6) {
      // След края на таблицата — вземаме най-близкия ред.
      pick = sorted.reduce((best, p) =>
        Math.abs(p.age - m) < Math.abs(best.age - m) ? p : best, sorted[0]);
      if (Math.abs(pick.age - m) > 0.6) continue;
    }
    res.push([m, round(pick.L, 6), round(pick.M, 5), round(pick.S, 6)]);
  }
  return res;
}
const round = (v, n) => +v.toFixed(n);

const SETS = [
  { key: 'wfa',  file: 'wfa-{s}.xlsx',  unit: 'day',   from: 0,  to: 60,  label: 'тегло за възраст' },
  { key: 'lhfa', file: 'lhfa-{s}.xlsx', unit: 'day',   from: 0,  to: 60,  label: 'дължина/ръст за възраст' },
  { key: 'bfa',  file: 'bfa-{s}.xlsx',  unit: 'day',   from: 0,  to: 60,  label: 'ИТМ за възраст' },
  { key: 'hcfa', file: 'hcfa-{s}.xlsx', unit: 'day',   from: 0,  to: 60,  label: 'обиколка на глава' },
  { key: 'hfa5', file: 'hfa5-{s}.xlsx', unit: 'month', from: 61, to: 228, label: 'ръст за възраст 5-19' },
  { key: 'bfa5', file: 'bfa5-{s}.xlsx', unit: 'month', from: 61, to: 228, label: 'ИТМ за възраст 5-19' },
];

const data = {};
for (const set of SETS) {
  for (const sex of ['boys', 'girls']) {
    const f = path.join(DIR, set.file.replace('{s}', sex));
    if (!fs.existsSync(f)) { console.error('ПРОПУСНАТ (липсва файл):', f); continue; }
    const series = extractLMS(f, set);
    const monthly = toMonthly(series, set.from, set.to);
    data[set.key] = data[set.key] || {};
    data[set.key][sex === 'boys' ? 'm' : 'f'] = monthly;
    console.log(`${set.key}/${sex}: ${series.length} реда -> ${monthly.length} месеца  (${monthly[0]?.join(', ')} … ${monthly.at(-1)?.join(', ')})`);
  }
}

fs.writeFileSync(path.join(DIR, 'who-lms.json'), JSON.stringify(data));
console.log('\nЗаписан who-lms.json:', (fs.statSync(path.join(DIR, 'who-lms.json')).size / 1024).toFixed(1), 'KB');
