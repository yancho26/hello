/* Версия 4.9: PDF отчет за хранене и тренировки — шрифтове, PDF писател и самият отчет. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseTTF, subsetTTF } from '../public/js/shared/pdf/ttf.js';
import { PDFDocument } from '../public/js/shared/pdf/pdf.js';
import { wrap } from '../public/js/shared/pdf/kit.js';
import { nutritionReport } from '../public/js/shared/pdf/nutrition-report.js';
import { nutritionPlan } from '../public/js/shared/nutrition.js';

const F = new URL('../public/fonts/', import.meta.url);
const read = (f) => new Uint8Array(fs.readFileSync(new URL(f, F)));
const fonts = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };
const latin1 = (b) => Buffer.from(b).toString('latin1');

/** Обектите на PDF файла по таблицата с отместванията; проверява, че всяко сочи към „N 0 obj“. */
function objects(bytes) {
  const s = latin1(bytes);
  assert.ok(s.startsWith('%PDF-1.7'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const start = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.equal(s.slice(start, start + 4), 'xref');
  const count = Number(/xref\n0 (\d+)/.exec(s.slice(start))[1]);
  const rows = s.slice(start).split('\n').slice(3, 2 + count);
  const out = [];
  rows.forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `обект ${i + 1}`);
    const end = s.indexOf('endobj', off);
    out.push(s.slice(off, end));
  });
  return out;
}

/** Разкомпресираните потоци (съдържанието на страниците, ToUnicode). */
function streams(objs) {
  return objs.filter(o => o.includes('stream\n') && o.includes('/FlateDecode')).map(o => {
    const body = o.slice(o.indexOf('stream\n') + 7, o.lastIndexOf('\nendstream'));
    try { return zlib.inflateSync(Buffer.from(body, 'latin1')).toString('latin1'); } catch { return ''; }
  });
}

const hexOf = (ttf, text) => [...text].map(ch => ttf.glyph(ch.codePointAt(0)).toString(16).padStart(4, '0')).join('');

test('шрифтове: Noto Sans с кирилица, символите от DejaVu, лицензите до тях', () => {
  for (const key of ['regular', 'semibold', 'bold']) {
    const t = parseTTF(fonts[key]);
    assert.equal(t.unitsPerEm, 1000);
    for (const ch of 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯабвгдежзийклмнопрстуфхцчшщъьюя„“–—·½°№') assert.ok(t.glyph(ch.codePointAt(0)), `${key}: ${ch}`);
    assert.ok(t.advance(t.glyph(0x416)) > 0);
  }
  const sym = parseTTF(fonts.symbols);
  for (const ch of '≈≤≥→✓☐●▲★') assert.ok(sym.glyph(ch.codePointAt(0)), ch);
  assert.match(fs.readFileSync(new URL('OFL.txt', F), 'utf8'), /SIL Open Font License/);
  assert.match(fs.readFileSync(new URL('DejaVu-LICENSE.txt', F), 'utf8'), /Bitstream/);
});

test('подмножество: само нужните глифове, номерата и ширините остават', () => {
  const t = parseTTF(fonts.regular);
  const used = new Set([...'Хранене'].map(ch => t.glyph(ch.codePointAt(0))));
  const sub = parseTTF(subsetTTF(t, used));
  assert.equal(sub.numGlyphs, t.numGlyphs);
  for (const g of used) {
    assert.ok(sub.loca[g + 1] > sub.loca[g], `глиф ${g}`);
    assert.equal(sub.advance(g), t.advance(g));
  }
  const unused = t.glyph('Q'.codePointAt(0));
  assert.equal(sub.loca[unused + 1] - sub.loca[unused], 0);
  assert.equal(sub.glyph('Q'.codePointAt(0)), 0, 'знакът го няма в новата cmap');
  assert.equal(sub.glyph('Х'.codePointAt(0)), t.glyph('Х'.codePointAt(0)));
  assert.ok(sub.tables.glyf.length < t.tables.glyf.length / 20, `glyf: ${sub.tables.glyf.length}`);
});

test('PDF писател: страници, вградени шрифтове с ToUnicode, връзки, отметки, резервен шрифт', async () => {
  const doc = new PDFDocument({ title: 'Проба', lang: 'bg-BG' });
  doc.addFont('symbols', fonts.symbols).setFallback('symbols').addFont('regular', fonts.regular);
  const p = doc.addPage();
  p.gradient(0, 0, p.w, 100, '#4b4aa6', '#0f8f7e');
  p.text('Здравей ≈ 5 г 🏃', 40, 60, { size: 12 });
  p.ring(100, 200, 40, 20, 0, 270, { fill: '#c94a5b' });
  p.rect(40, 300, 100, 30, { fill: '#efeefb', radius: 6, opacity: 0.5 });
  p.link(40, 300, 100, 30, 'https://www.nhlbi.nih.gov/');
  doc.bookmark('Начало', p, 0);
  const p2 = doc.addPage();
  p2.goto(40, 40, 50, 12, p, 0);
  const objs = objects(await doc.bytes());
  const all = objs.join('\n');
  assert.equal((all.match(/\/Type \/Page /g) || []).length, 2);
  assert.equal((all.match(/\/Subtype \/Type0/g) || []).length, 2, 'Noto Sans и символите');
  assert.match(all, /\/FontFile2/);
  assert.match(all, /\/URI \(https:\/\/www\.nhlbi\.nih\.gov\/\)/);
  assert.match(all, /\/Outlines/);
  assert.match(all, /\/Lang \(bg-BG\)/);
  const content = streams(objs).join('\n');
  const t = parseTTF(fonts.regular);
  assert.ok(content.includes(hexOf(t, 'Здравей')), 'текстът е в съдържанието');
  assert.match(content, /\/Sh1 sh/);
  assert.match(content, /beginbfchar/);
  // Знакът ≈ идва от резервния шрифт, а емоджито се пропуска.
  const sym = parseTTF(fonts.symbols);
  assert.ok(content.includes(hexOf(sym, '≈')));
});

test('пренасяне на текста: в ширината, без загубени думи', () => {
  const doc = new PDFDocument();
  doc.addFont('regular', fonts.regular).addFont('bold', fonts.bold);
  const text = 'Сварете макароните без сол и ги отцедете. Загрейте фурната на 175 °C и задушете лука около 3 минути.';
  const lines = wrap(doc, [{ text: 'Приготвяне: ', font: 'bold' }, { text }], 160, 9);
  assert.ok(lines.length >= 3);
  for (const ln of lines) assert.ok(ln.w <= 160.01, ln.w);
  const joined = lines.map(l => l.segs.map(s => s.text).join('')).join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(joined, ('Приготвяне: ' + text));
});

const base = { sex: 'f', age: 34, weight: 72, height: 166, activity: 'light', asOf: '2026-10-14', diagnoses: [{ code: 'E66.0' }, { code: 'I10' }] };
const training = { activities: ['gym', 'running', 'reformer'], level: 'intermediate', daysPerWeek: 4, minutes: 45, time: 'evening', focus: 'weight' };
const cycle = { periods: [{ start: '2026-10-05' }], length: 28 };
const report = (plan, extra = {}) => nutritionReport({
  plan, person: { name: 'Мария Иванова', birthDate: '1992-03-08', sex: 'f' }, practice: { name: 'Практика „Здраве“', phone: '0888 123 456' },
  doctor: { name: 'д-р Петър Петров' }, fonts, version: '4.9.0', date: '2026-10-14', ...extra,
});

test('отчет: седмица с тренировки и цикъл — всички раздели, рецептите и пазаруването', async () => {
  const plan = nutritionPlan({ ...base, goal: 'lose', days: 7, mealsPerDay: 4, cycleSync: true, cycle, training });
  const objs = objects(await report(plan));
  const all = objs.join('\n');
  const pages = (all.match(/\/Type \/Page /g) || []).length;
  assert.ok(pages >= 8 && pages <= 30, `страници: ${pages}`);
  const content = streams(objs).join('\n');
  const t = parseTTF(fonts.bold);
  for (const title of ['Дневни цели', 'Как да се храните', 'Цикъл и хранене', 'Тренировъчен план за 4 седмици', 'Меню за седмицата', 'Списък за пазаруване', 'Източници и бележки']) {
    assert.ok(content.includes(hexOf(t, title)), title);
  }
  // Всяко ястие от менюто и всеки продукт от пазаруването са в отчета.
  const r = parseTTF(fonts.regular);
  for (const d of plan.week) for (const m of d.meals) assert.ok(content.includes(hexOf(t, m.option.name.split(' ')[0])), m.option.name);
  for (const g of plan.shopping.groups) for (const it of g.items) assert.ok(content.includes(hexOf(r, it.name.split(' ')[0])), it.name);
  // Връзки към рецептите на NHLBI и отметки за разделите.
  assert.ok((all.match(/\/URI \(https:\/\/www\.nhlbi\.nih\.gov/g) || []).length >= 5);
  assert.ok((all.match(/\/Title <FEFF/g) || []).length >= 7);
  // „Страница N от M“ на всяка страница.
  const sb = parseTTF(fonts.semibold);
  assert.ok(content.includes(hexOf(sb, `стр. ${pages} от ${pages}`)));
});

test('отчет: месечно меню, ден без тренировки и отделно пазаруване', async () => {
  const month = nutritionPlan({ ...base, goal: 'maintain', days: 28, mealsPerDay: 3 });
  const objs = objects(await report(month));
  const content = streams(objs).join('\n');
  const t = parseTTF(fonts.bold);
  for (let w = 1; w <= 4; w++) assert.ok(content.includes(hexOf(t, `Пазаруване за седмица ${w}`)), `седмица ${w}`);
  assert.ok(!content.includes(hexOf(t, 'Тренировъчен план')), 'без тренировки няма такъв раздел');

  const day = nutritionPlan({ ...base, goal: 'gain', days: 1, mealsPerDay: 5, preferences: ['vegan'] });
  const dayObjs = objects(await report(day));
  assert.ok(streams(dayObjs).join('\n').includes(hexOf(t, 'Примерно меню за деня')));

  const shop = objects(await report(month, { only: 'shopping' }));
  const shopAll = shop.join('\n');
  const shopContent = streams(shop).join('\n');
  assert.ok(shopContent.includes(hexOf(t, 'Пазаруване за седмица 4')));
  assert.ok(!shopContent.includes(hexOf(t, 'Дневни цели')), 'само пазаруването');
  assert.ok((shopAll.match(/\/Type \/Page /g) || []).length <= 8);
});

test('отчет: непълни данни не пречат (без цикъл, без диагнози, без име)', async () => {
  const plan = nutritionPlan({ sex: 'm', age: 50, weight: 90, height: 180, days: 7 });
  const bytes = await nutritionReport({ plan, person: {}, fonts, date: '2026-10-14' });
  objects(bytes);
  assert.ok(bytes.length > 20000 && bytes.length < 600000, `${bytes.length} байта`);
});
