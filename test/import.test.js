/* Версия 2.1: внасяне на списъци с пациенти от Excel, LibreOffice, CSV,
 * HTML, XML и поставено от Excel. Примерните файлове в test/fixtures са
 * създадени с openpyxl, xlwt и LibreOffice (виж make-fixtures.py). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.js';
import { routes } from '../lib/api.js';
import { readPasted, readSpreadsheet } from '../lib/import/index.js';
import { decodeText, parseCsv, readText } from '../lib/import/text.js';
import { excelSerialToISO, isDateFormat } from '../lib/import/cells.js';
import { normPhone, parseDateValue, parseSex, planImport, tidyName } from '../lib/import/patients.js';
import { crc32, makeXlsx, zipStore } from '../public/js/shared/xlsx-writer.js';
import { detectHeaderRow, guessMapping, targetForHeader } from '../public/js/shared/import-columns.js';
import { conditionForIcd, parseDiagnoses } from '../public/js/shared/icd.js';
import { monitoringTasks } from '../public/js/shared/chronic.js';
import { computePlan } from '../public/js/shared/schedule.js';
import { today } from '../public/js/shared/dates.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name) => readSpreadsheet(fs.readFileSync(path.join(FIX, name)), name);
const T = today();

/* Един и същ списък, записан от различни програми, трябва да се прочете еднакво. */
const EXPECTED = [
  ['5803140426', 'Иван', 'Петров', 'Георгиев', '1958-03-14'],
  ['6211020711', 'МАРИЯ', 'ИВАНОВА', 'ДИМИТРОВА', '1962-11-02'],
];

/* ------------------------------ формати ------------------------------ */

for (const [file, format] of [
  ['patients-openpyxl.xlsx', 'xlsx'],
  ['patients-libreoffice.xlsx', 'xlsx'],
  ['patients-libreoffice.xls', 'xls'],
  ['patients-xlwt.xls', 'xls'],
  ['patients-libreoffice.ods', 'ods'],
  ['patients-2003.xml', 'xml'],
]) {
  test(`чете ${file}`, () => {
    const r = read(file);
    assert.equal(r.format, format);
    const s = r.sheets[0];
    assert.equal(s.name, 'Пациенти');
    const header = detectHeaderRow(s.rows);
    assert.ok(header >= 0, 'заглавният ред е намерен');
    const egnCol = s.rows[header].indexOf('ЕГН');
    const dateCol = s.rows[header].indexOf('Дата на раждане');
    for (const [k, exp] of EXPECTED.entries()) {
      const row = s.rows[header + 1 + k];
      assert.equal(row[egnCol], exp[0]);
      assert.deepEqual(row.slice(egnCol + 1, egnCol + 4), exp.slice(1, 4));
      assert.equal(row[dateCol], exp[4], 'датата е разпозната като дата');
    }
  });
}

test('HTML таблица от LibreOffice: всеки лист е отделна таблица', () => {
  const r = read('patients-libreoffice.html');
  assert.equal(r.format, 'html');
  assert.equal(r.sheets.length, 2);
  const rows = r.sheets[0].rows;
  assert.ok(rows.some(row => row.includes('Мария') || row.includes('МАРИЯ')));
});

test('CSV в Windows-1251 с разделител „;“ и кавички', () => {
  const r = read('patients-1251.csv');
  assert.equal(r.format, 'csv');
  assert.equal(r.encoding, 'Windows-1251');
  assert.deepEqual(r.sheets[0].rows[1].slice(0, 5), ['5803140426', 'Иван', 'Петров', 'Георгиев', '14.03.1958']);
});

test('текст: BOM, UTF-16, „sep=“ и полета с нови редове', () => {
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Име,ЕГН\nИван,5803140426\n')]);
  assert.equal(decodeText(bom).encoding, 'UTF-8');
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Име\tЕГН\r\nИван\t5803140426', 'utf16le')]);
  assert.equal(decodeText(u16).text.split('\r\n')[1], 'Иван\t5803140426');
  const t = readText('sep=,\n"Петров, Иван";"x"\n"ред ""1""\nи 2",5\n');
  assert.equal(t.delimiter, ',');
  assert.deepEqual(t.sheets[0].rows[1], ['ред "1"\nи 2', '5']);
  assert.deepEqual(parseCsv('a;"b;c";d', ';')[0], ['a', 'b;c', 'd']);
});

test('поставено от Excel се чете като таблица с табулации', () => {
  const r = readPasted('ЕГН\tИме\n5803140426\tИван Петров\n');
  assert.equal(r.format, 'paste');
  assert.deepEqual(r.sheets[0].rows[1], ['5803140426', 'Иван Петров']);
});

test('отказва документ на Word и празен файл', () => {
  const docx = zipStore([{ name: 'word/document.xml', data: new TextEncoder().encode('<w:document/>') }]);
  assert.throws(() => readSpreadsheet(Buffer.from(docx), 'x.docx'), /Word/);
  assert.throws(() => readSpreadsheet(Buffer.alloc(0), 'x.xlsx'), /празен/);
});

test('дати от Excel и формати за дата', () => {
  assert.equal(excelSerialToISO(44927), '2023-01-01');
  assert.equal(excelSerialToISO(21258), '1958-03-14');
  assert.equal(excelSerialToISO(61), '1900-03-01');
  assert.equal(excelSerialToISO(0, true), null);
  assert.ok(isDateFormat(14));
  assert.ok(isDateFormat(164, 'dd.mm.yyyy'));
  assert.ok(isDateFormat(165, '[$-402]d mmmm yyyy "г."'));
  assert.ok(!isDateFormat(166, '0.00'));
  assert.ok(!isDateFormat(167, '[h]:mm'));
});

/* ------------------------------ запис на .xlsx ------------------------------ */

test('записаният .xlsx се чете обратно — ЕГН с водеща нула, дати, специални знаци', () => {
  assert.equal(crc32(new TextEncoder().encode('Детска консултация')), zlib.crc32('Детска консултация'));
  const bytes = makeXlsx([{
    name: 'Пациенти',
    rows: [['Име', 'ЕГН', 'Роден'], ['Ана & <Мария> "Иванова"', '0547090240', '2005-07-09'], ['Петър', '5803140426', '']],
    dateColumns: [2],
  }]);
  const r = readSpreadsheet(Buffer.from(bytes), 'x.xlsx');
  assert.deepEqual(r.sheets[0].rows, [['Име', 'ЕГН', 'Роден'], ['Ана & <Мария> "Иванова"', '0547090240', '2005-07-09'], ['Петър', '5803140426']]);
});

/* ------------------------------ колони ------------------------------ */

test('колоните се разпознават по заглавие', () => {
  assert.equal(targetForHeader('ЕГН/ЛНЧ'), 'egn');
  assert.equal(targetForHeader('Три имена'), 'fullName');
  assert.equal(targetForHeader('Дата на раждане'), 'birthDate');
  assert.equal(targetForHeader('Тел.'), 'phone');
  assert.equal(targetForHeader('Диспансерни диагнози (МКБ)'), 'diagnoses');
  assert.equal(targetForHeader('Телефон на родител'), 'contactPhone');
  assert.equal(targetForHeader('Пол'), 'sex');
  assert.equal(targetForHeader('№'), null);
  const rows = [['Справка към 01.09.2026'], [], ['№', 'ЕГН', 'Име', 'Презиме', 'Фамилия', 'Тел']];
  assert.equal(detectHeaderRow(rows), 2);
  assert.deepEqual(guessMapping(rows, 2), [null, 'egn', 'firstName', 'middleName', 'lastName', 'phone']);
});

test('без заглавен ред колоните се разпознават по съдържание', () => {
  const rows = [
    ['Иван Петров Георгиев', '5803140426', '14.03.1958', 'м', '0888123456'],
    ['Мария Иванова Димитрова', '6211020711', '02.11.1962', 'ж', '0887555111'],
    ['Ема Георгиева Колева', '1941250899', '25.01.2019', 'ж', '0899765432'],
  ];
  assert.equal(detectHeaderRow(rows), -1);
  assert.deepEqual(guessMapping(rows, -1), ['fullName', 'egn', 'birthDate', 'sex', 'phone']);
});

/* ------------------------------ стойности ------------------------------ */

test('дати, пол, телефони и имена от различни програми', () => {
  assert.equal(parseDateValue('14.03.1958').iso, '1958-03-14');
  assert.equal(parseDateValue('4.3.1958 г.').iso, '1958-03-04');
  assert.equal(parseDateValue('1958-03-14 00:00:00').iso, '1958-03-14');
  assert.equal(parseDateValue('14/03/1958').iso, '1958-03-14');
  assert.equal(parseDateValue('03/25/1958').iso, '1958-03-25', 'американски запис, щом денят е над 12');
  assert.equal(parseDateValue('21258').iso, '1958-03-14', 'пореден ден от Excel');
  const two = parseDateValue('14.03.58', '2026-09-27');
  assert.equal(two.iso, '1958-03-14');
  assert.match(two.warning, /две цифри/);
  assert.equal(parseDateValue('31.02.1990'), null);
  assert.equal(parseSex('Жена'), 'f');
  assert.equal(parseSex('M'), 'm');
  assert.equal(parseSex('?'), undefined);
  assert.equal(normPhone('888123456'), '0888123456');
  assert.equal(normPhone('359888123456'), '+359888123456');
  assert.equal(normPhone('няма'), '');
  assert.equal(tidyName('  ИВАН   ПЕТРОВ-ГЕОРГИЕВ '), 'Иван Петров-Георгиев');
  assert.equal(tidyName('Иван Петров'), 'Иван Петров');
});

test('диагнози: МКБ кодове (и с кирилски букви) и ключови думи', () => {
  assert.deepEqual(parseDiagnoses('I10; Е11.9 Захарен диабет тип 2').conditions, ['htn', 'dm2']);
  assert.deepEqual(parseDiagnoses('I50 СН; N18.3; M54.5 Лумбаго'), { conditions: ['hf', 'ckd'], other: ['M54.5 Лумбаго'] });
  assert.deepEqual(parseDiagnoses('Хипертония ІІ ст.; ХОББ; астма').conditions, ['htn', 'copd', 'asthma']);
  assert.deepEqual(parseDiagnoses('няма'), { conditions: [], other: [] });
  assert.equal(conditionForIcd('e 10.9'), 'dm1');
  assert.equal(conditionForIcd('I70.0'), null, 'атеросклероза на аортата не е ПАБ');
});

/* ------------------------------ внасяне ------------------------------ */

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-import-'));
  const store = new Store(dir);
  store.settings.requireLogin = false;
  store.data.doctors.push({ id: 'd1', name: 'д-р Мария Иванова', active: true }, { id: 'd2', name: 'д-р Петър Стоянов', active: true });
  return { store, dir };
}
const call = (store, key, body) => routes[key]({ store, body, doctor: store.doctors[0], params: {}, query: {} });
/** Изтрива временната папка, след като отложеният запис на хранилището приключи. */
async function cleanup(store, dir) {
  await store.writePromise.catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}

test('внасяне: проверка на сухо, записване, копие и повторно внасяне без дубликати', async () => {
  const { store, dir } = freshStore();
  try {
    const file = fs.readFileSync(path.join(FIX, 'patients-libreoffice.xls'));
    const r = call(store, 'POST /api/import/read', { filename: 'patients.xls', data: file.toString('base64') });
    const s = r.sheets[0];
    const body = {
      rows: s.rows.slice(s.headerRow + 1), header: s.rows[s.headerRow], mapping: s.mapping,
      firstRow: s.headerRow + 2, options: { doctorId: 'd1' }, source: 'patients.xls',
    };
    const dry = call(store, 'POST /api/import/patients', body);
    assert.deepEqual(
      { create: dry.summary.create, error: dry.summary.error, chronic: dry.summary.chronic, children: dry.summary.children },
      { create: 5, error: 1, chronic: 4, children: 1 });
    assert.equal(store.patients.length, 0, 'проверката не записва');
    const bad = dry.problems.find(p => p.action === 'error');
    assert.equal(bad.line, 8, 'номерът на реда е като във файла');

    const peter = dry.preview.find(p => p.name.startsWith('Петър'));
    assert.equal(peter.egn, '0547090240', 'изгубената водеща нула на ЕГН е върната');
    const maria = dry.preview.find(p => p.egn === '6211020711');
    assert.equal(maria.name, 'Мария Иванова Димитрова', 'главните букви са оправени');
    assert.deepEqual(maria.chronic, ['dyslip', 'af']);

    const done = call(store, 'POST /api/import/patients', { ...body, dryRun: false });
    assert.deepEqual(done.done, { created: 5, updated: 0 });
    assert.ok(fs.existsSync(path.join(store.backupDir, done.backup)), 'копие преди внасянето');
    assert.equal(store.patients.length, 5);
    const ivan = store.patients.find(p => p.egn === '5803140426');
    assert.equal(ivan.phone, '0888123456');
    assert.equal(ivan.doctorId, 'd1');
    assert.deepEqual(ivan.chronic.map(c => c.code), ['htn', 'dm2']);
    assert.ok(store.readAudit(10).some(e => e.action === 'patients_import' && e.created === 5));

    const again = call(store, 'POST /api/import/patients', body);
    assert.equal(again.summary.create, 0);
    assert.equal(again.summary.same, 5, 'вече въведените се разпознават');
  } finally {
    await cleanup(store, dir);
  }
});

test('внасяне: допълване на съществуващ, повторен ред и лекар по име', async () => {
  const { store, dir } = freshStore();
  try {
    store.patients.push({ id: 'p1', name: 'Иван Петров Георгиев', egn: '5803140426', birthDate: '1958-03-14', sex: 'm', phone: '', records: {}, chronic: [], allergies: [], conditions: [] });
    const rows = [
      ['5803140426', 'ИВАН ПЕТРОВ ГЕОРГИЕВ', '0888 111 222', 'J44', 'Стоянов'],
      ['8412150331', 'Тодор Стоянов Василев', '', 'I10', 'д-р Петър Стоянов'],
      ['8412150331', 'Тодор Стоянов Василев', '', '', ''],
      ['', 'Без Данни', '', '', ''],
    ];
    const mapping = ['egn', 'fullName', 'phone', 'diagnoses', 'doctor'];
    const plan = planImport(store, { rows, header: ['ЕГН', 'Име', 'Тел', 'МКБ', 'Лекар'], mapping, options: { existing: 'fill' } });
    assert.deepEqual(plan.results.map(r => r.action), ['update', 'create', 'duplicate', 'error']);
    assert.deepEqual(plan.results[0].changes, ['телефон', 'личен лекар', 'заболявания: ХОББ']);
    assert.equal(plan.results[1].fields.doctorId, 'd2');
    const skip = planImport(store, { rows, mapping, options: { existing: 'skip' } });
    assert.equal(skip.results[0].action, 'exists');
    assert.throws(() => planImport(store, { rows, mapping: ['egn', null, null, null, null] }), /името/);
  } finally {
    await cleanup(store, dir);
  }
});

test('начална точка: „прието за направено“ или „покажи пропуснатото“', async () => {
  const { store, dir } = freshStore();
  try {
    const rows = [
      ['Ема Колева', '1941250899', 'J45'],
      ['Иван Георгиев', '5803140426', 'I10; E11.9'],
    ];
    const body = { rows, header: ['Име', 'ЕГН', 'МКБ'], mapping: ['fullName', 'egn', 'diagnoses'] };
    call(store, 'POST /api/import/patients', { ...body, options: { baseline: 'assume' }, dryRun: false });
    const ema = store.patients.find(p => p.name === 'Ема Колева');
    const plan = computePlan(ema, store.schedule, { asOf: T });
    assert.equal(plan.filter(e => e.status === 'overdue').length, 0, 'досегашните ваксини са приети');
    assert.ok(plan.some(e => e.record && e.record.imported), 'с отметка „внесено“');
    const ivan = store.patients.find(p => p.name === 'Иван Георгиев');
    const tasks = monitoringTasks(ivan, { asOf: T });
    assert.ok(tasks.every(t => t.status === 'future' || t.status === 'soon'), 'проследяването започва от днес');
    assert.ok(tasks.every(t => t.assumed === T));

    const { store: s2, dir: d2 } = freshStore();
    try {
      call(s2, 'POST /api/import/patients', { ...body, options: { baseline: 'missed' }, dryRun: false });
      const ema2 = s2.patients.find(p => p.name === 'Ема Колева');
      assert.ok(computePlan(ema2, s2.schedule, { asOf: T }).some(e => e.status === 'overdue'), 'пропуснатото излиза като дължимо');
      const ivan2 = s2.patients.find(p => p.name === 'Иван Георгиев');
      assert.ok(monitoringTasks(ivan2, { asOf: T }).some(t => t.status === 'due'));
    } finally {
      await cleanup(s2, d2);
    }
  } finally {
    await cleanup(store, dir);
  }
});

test('внасяне: грешки при четене се връщат като съобщение', async () => {
  const { store, dir } = freshStore();
  try {
    assert.throws(() => call(store, 'POST /api/import/read', { filename: 'x.xlsx', data: Buffer.from('PK\u0003\u0004гаргара').toString('base64') }), /ZIP/);
    assert.throws(() => call(store, 'POST /api/import/read', { text: '   ' }), /Няма поставен текст/);
    assert.throws(() => call(store, 'POST /api/import/patients', { rows: [['a']], mapping: ['fullName'] }), /ЕГН или с датата/);
  } finally {
    await cleanup(store, dir);
  }
});
