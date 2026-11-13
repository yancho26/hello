/* Версия 5.0: нов интерфейс — изглед (тема, плътност, меню), бързо търсене, иконки и стилове.
 *
 * Екраните се проверяват в браузър (scripts/ui-check.mjs). Тук е това, което не зависи от
 * браузъра: логиката на предпочитанията и търсенето, адресът /api/search и правилата на
 * стиловия файл — всяка променлива да е дефинирана, двете теми да са пълни и четливи. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, hashPin } from '../lib/store.js';
import { Workspaces } from '../lib/workspaces.js';
import { createAppServer } from '../lib/http.js';
import { memoryStatic } from '../lib/static.js';
import {
  AUTO_FULL_MIN, DEFAULT_PREFS, PHONE_MAX, RAIL_MAX, cleanPrefs, navChoiceAvailable, oppositeTheme, parsePrefs, resolveNav, resolveTheme,
} from '../public/js/shared/ui-prefs.js';
import { matchItems, nameScore, normaliseSearch, pushRecent, searchPatients } from '../public/js/shared/quick-search.js';
import { GLYPH_ICONS, ICONS, splitGlyph } from '../public/js/ui/icons.js';
import { CHANGES } from '../public/js/whats-new.js';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CSS = read('public/css/app.css');

/* ------------------------------ изглед ------------------------------ */

test('5.0 изглед: предпочитанията се четат безопасно, каквото и да е записано в браузъра', () => {
  assert.deepEqual(cleanPrefs(null), { ...DEFAULT_PREFS });
  assert.deepEqual(cleanPrefs({ theme: 'dark', density: 'compact', nav: 'rail' }), { theme: 'dark', density: 'compact', nav: 'rail' });
  assert.deepEqual(cleanPrefs({ theme: 'розова', density: 7, nav: null, друго: 1 }), { ...DEFAULT_PREFS });
  assert.deepEqual(parsePrefs('{"theme":"light"}'), { ...DEFAULT_PREFS, theme: 'light' });
  assert.deepEqual(parsePrefs('повреден запис'), { ...DEFAULT_PREFS });
  assert.deepEqual(parsePrefs(null), { ...DEFAULT_PREFS });
  assert.deepEqual(parsePrefs('[1,2]'), { ...DEFAULT_PREFS });
});

test('5.0 изглед: темата следва компютъра, докато не е избрана изрично', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('друго', true), 'dark');
  // Бутонът за бърза смяна винаги променя това, което се вижда: едно щракване, една смяна.
  assert.equal(oppositeTheme('light', false), 'dark');
  assert.equal(oppositeTheme('dark', false), 'light');
  assert.equal(oppositeTheme('auto', false), 'dark', 'компютърът е със светла тема');
  assert.equal(oppositeTheme('auto', true), 'light', 'компютърът е с тъмна тема');
  assert.equal(oppositeTheme('light', true), 'dark');
});

test('5.0 изглед: менюто е лента отдолу на телефон, иконки на таблет и по избор на широк екран', () => {
  assert.equal(resolveNav('full', 390), 'phone');
  assert.equal(resolveNav('auto', PHONE_MAX), 'phone');
  assert.equal(resolveNav('auto', PHONE_MAX + 1), 'rail');
  // На тесен прозорец изборът „разгънато“ не важи: менюто не бива да изяжда съдържанието.
  assert.equal(resolveNav('full', RAIL_MAX), 'rail');
  assert.equal(resolveNav('full', RAIL_MAX + 1), 'full');
  assert.equal(resolveNav('rail', 1920), 'rail');
  assert.equal(resolveNav('auto', AUTO_FULL_MIN - 1), 'rail');
  assert.equal(resolveNav('auto', AUTO_FULL_MIN), 'full');
  assert.equal(resolveNav('auto', 1366), 'full', 'лаптоп 1366 пиксела е с разгънато меню');
  assert.equal(navChoiceAvailable(RAIL_MAX), false);
  assert.equal(navChoiceAvailable(RAIL_MAX + 1), true);
});

/* ------------------------------ бързо търсене ------------------------------ */

const PEOPLE = [
  { id: 'a', name: 'Мария Иванова Петрова', egn: '8501011234', phone: '0888 123 456', birthDate: '1985-01-01', sex: 'f', allergies: ['пеницилин'], contacts: [] },
  { id: 'b', name: 'Иван Георгиев Колев', egn: '7203154321', phone: '0877654321', birthDate: '1972-03-15', sex: 'm', contacts: [{ name: 'Елена Колева', phone: '0899 000 111' }] },
  { id: 'c', name: 'Ивайло Иванов Стоянов', egn: '1042127788', phone: '', birthDate: '2010-02-12', sex: 'm' },
  { id: 'd', name: 'Петър Иванов', egn: '6905156237', phone: '+359 888 646 369', birthDate: '1969-05-15', sex: 'm', archived: true },
  { id: 'e', name: 'Гълъбина Младенова', egn: '9009095566', phone: '0888000999', birthDate: '1990-09-09', sex: 'f' },
];
const ids = (r) => r.items.map(x => x.id).join('');

test('5.0 търсене: по име — началото на името е преди средата, архивът е накрая, редът на думите не е важен', () => {
  assert.equal(normaliseSearch('  ГЪЛЪБИНА   Младенова '), 'глбина младенова');
  assert.equal(nameScore('Иван Георгиев Колев', 'ива'), 0);
  assert.equal(nameScore('Мария Иванова Петрова', 'ива'), 1);
  assert.equal(nameScore('Мария Иванова Петрова', 'ванов'), 2);
  assert.equal(nameScore('Мария Иванова Петрова', 'стоян'), -1);
  assert.equal(nameScore('Мария Иванова Петрова', ''), -1);

  const r = searchPatients(PEOPLE, 'ива');
  // Първо тези, чието име започва с „Ива“ (по азбучен ред), после с „Ива“ в презиме или фамилия, архивът накрая.
  assert.equal(ids(r), 'cbad');
  assert.equal(r.total, 4);
  assert.equal(ids(searchPatients(PEOPLE, 'петрова мария')), 'a', 'думите могат да са в друг ред');
  assert.equal(ids(searchPatients(PEOPLE, 'мария колев')), '', 'всяка дума трябва да се среща');
  // „ъ“ и „ь“ не пречат: „гълъбина“ и „глбина“ са едно и също за търсенето.
  assert.equal(ids(searchPatients(PEOPLE, 'Гълъбина')), 'e');
  assert.equal(ids(searchPatients(PEOPLE, 'глбина')), 'e');
  assert.deepEqual(searchPatients(PEOPLE, '   '), { total: 0, items: [] });
  assert.deepEqual(searchPatients(null, 'ива'), { total: 0, items: [] });
});

test('5.0 търсене: по ЕГН, по телефон и по близък; връща само данните за показване', () => {
  assert.equal(ids(searchPatients(PEOPLE, '8501')), 'a', 'началото на ЕГН');
  assert.equal(ids(searchPatients(PEOPLE, '6905156237')), 'd');
  assert.equal(ids(searchPatients(PEOPLE, '0888 123')), 'a', 'телефон с интервали');
  assert.equal(ids(searchPatients(PEOPLE, '646369')), 'd', 'краят на телефон, записан с +359 и интервали');
  assert.equal(ids(searchPatients(PEOPLE, '0899000111')), 'b', 'телефонът на близък');
  assert.equal(ids(searchPatients(PEOPLE, 'елена')), 'b', 'името на близък');
  assert.equal(searchPatients(PEOPLE, '0899000111').items[0].by, 'contact');
  assert.equal(searchPatients(PEOPLE, '8501').items[0].by, 'egn');
  // Една цифра не е търсене по номер; търси се като текст и не намира нищо.
  assert.equal(searchPatients(PEOPLE, '8').total, 0);

  const item = searchPatients(PEOPLE, 'мария').items[0];
  assert.deepEqual(Object.keys(item).sort(), ['allergies', 'archived', 'birthDate', 'by', 'egn', 'id', 'name', 'phone', 'sex']);
  assert.equal(item.allergies, true, 'само че има алергия — не каква е');
  // „Петър“ намира и „Петрова“ („ъ“ не се брои); архивираният Петър е след действащото досие.
  const petar = searchPatients(PEOPLE, 'петър');
  assert.equal(ids(petar), 'ad');
  assert.equal(petar.items[1].archived, true);
});

test('5.0 търсене: лимитът реже списъка, а общият брой остава', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, name: `Анна Тестова ${String(i).padStart(2, '0')}`, egn: '', phone: '' }));
  const r = searchPatients(many, 'анна', { limit: 8 });
  assert.equal(r.items.length, 8);
  assert.equal(r.total, 40);
  assert.equal(r.items[0].name, 'Анна Тестова 00');
  assert.equal(searchPatients(many, 'анна', { limit: 1000 }).items.length, 40 > 50 ? 50 : 40);
  assert.equal(searchPatients(many, 'анна', { limit: 0 }).items.length, 8, 'нула значи подразбирания брой');
  assert.equal(searchPatients(Array.from({ length: 80 }, (_, i) => ({ id: 'q' + i, name: 'Борис ' + i })), 'борис', { limit: 500 }).items.length, 50, 'най-много 50');
});

test('5.0 търсене: страници и действия по начало на дума; последно отворени без повторения', () => {
  const pages = [{ label: 'Табло' }, { label: 'Пациенти' }, { label: 'Настройки', keywords: 'потребители копие изглед тема' }, { label: 'Справки', keywords: 'отчет статистика' }];
  assert.deepEqual(matchItems(pages, '').map(p => p.label), ['Табло', 'Пациенти', 'Настройки', 'Справки']);
  assert.deepEqual(matchItems(pages, 'наст').map(p => p.label), ['Настройки']);
  assert.deepEqual(matchItems(pages, 'тема').map(p => p.label), ['Настройки'], 'по ключова дума');
  assert.deepEqual(matchItems(pages, 'отч').map(p => p.label), ['Справки']);
  assert.deepEqual(matchItems(pages, 'ройки'), [], 'средата на дума не е съвпадение');
  assert.deepEqual(matchItems(null, 'а'), []);

  let recent = [];
  for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f', 'g']) recent = pushRecent(recent, { id, name: 'П ' + id, birthDate: '2000-01-01', sex: 'f', egn: '1', allergies: ['x'] });
  assert.deepEqual(recent.map(x => x.id), ['g', 'f', 'e', 'd', 'a', 'c'], 'най-новото отпред, без повторения, най-много 6');
  assert.deepEqual(Object.keys(recent[0]).sort(), ['birthDate', 'id', 'name', 'sex'], 'в браузъра не се пази ЕГН или друго от досието');
  assert.deepEqual(pushRecent('повредено', null), []);
  assert.deepEqual(pushRecent([{ id: 'a', name: 'А' }, null, { name: 'без ид' }], { id: 'b', name: 'Б' }).map(x => x.id), ['b', 'a']);
});

test('5.0 API: /api/search иска вход, търси само в текущата практика и не връща клинични данни', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-500-'));
  const spaces = new Workspaces(new Store(dir));
  const server = createAppServer({ workspaces: spaces, serveStatic: memoryStatic({ 'index.html': 'x' }), requireActivation: false });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = () => {
    const jar = new Map();
    return async (method, url, body) => {
      const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + url, { method, body: body && JSON.stringify(body), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) } });
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const i = pair.indexOf('=');
        if (attrs.some(a => /max-age=0/i.test(a))) jar.delete(pair.slice(0, i).trim()); else jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      return { status: res.status, data: await res.json().catch(() => null) };
    };
  };
  const ok = async (r) => { const x = await r; assert.ok(x.status < 300, `${x.status} ${JSON.stringify(x.data)}`); return x.data; };
  try {
    const gp = browser();
    await ok(gp('POST', '/api/workspace', { workspace: 'gp' }));
    await ok(gp('POST', '/api/setup', { workspace: 'gp', practiceName: 'ОПЛ', doctorName: 'д-р А' }));
    const maria = (await ok(gp('POST', '/api/patients', { name: 'Мария Иванова Петрова', sex: 'f', birthDate: '1985-01-01', egn: '', phone: '0888 123 456', allergies: ['пеницилин'] }))).patient.id;
    const ivan = (await ok(gp('POST', '/api/patients', { name: 'Иван Георгиев Колев', sex: 'm', birthDate: '1972-03-15', phone: '0877654321' }))).patient.id;
    await ok(gp('POST', '/api/patients', { name: 'Ивайло Иванов Стоянов', sex: 'm', birthDate: '2010-02-12' }));

    const r = await ok(gp('GET', '/api/search?q=' + encodeURIComponent('ива')));
    assert.equal(r.q, 'ива');
    assert.equal(r.total, 3);
    assert.deepEqual(r.patients.map(p => p.name), ['Ивайло Иванов Стоянов', 'Иван Георгиев Колев', 'Мария Иванова Петрова']);
    const hit = r.patients.find(p => p.id === maria);
    assert.deepEqual(Object.keys(hit).sort(), ['allergies', 'archived', 'birthDate', 'by', 'egn', 'id', 'name', 'phone', 'sex']);
    assert.equal(hit.allergies, true);
    assert.ok(!JSON.stringify(r).includes('пеницилин'), 'самата алергия не се връща в търсенето');
    // По телефон и с лимит.
    assert.equal((await ok(gp('GET', '/api/search?q=0877654321'))).patients[0].id, ivan);
    const one = await ok(gp('GET', '/api/search?q=' + encodeURIComponent('ива') + '&limit=1'));
    assert.equal(one.patients.length, 1);
    assert.equal(one.total, 3);
    // Празна заявка и безсмислен лимит не чупят нищо.
    assert.deepEqual(await ok(gp('GET', '/api/search')), { q: '', total: 0, patients: [] });
    assert.equal((await ok(gp('GET', '/api/search?q=' + encodeURIComponent('ива') + '&limit=abc'))).patients.length, 3);
    // Архивираното досие остава намираемо, но след действащите и с отметка.
    await ok(gp('POST', `/api/patients/${ivan}/archive`, { archived: true, reason: '' }));
    const arch = await ok(gp('GET', '/api/search?q=' + encodeURIComponent('ива')));
    assert.equal(arch.patients.at(-1).id, ivan);
    assert.equal(arch.patients.at(-1).archived, true);

    // Практиката за СИМП е отделна: нейното търсене не вижда пациентите на ОПЛ и обратно.
    const simp = browser();
    await ok(simp('POST', '/api/workspace', { workspace: 'simp' }));
    await ok(simp('POST', '/api/setup', { workspace: 'simp', practiceName: 'СИМП', doctorName: 'д-р Б', role: 'Кардиолог' }));
    await ok(simp('POST', '/api/patients', { name: 'Иванка Симова', sex: 'f', birthDate: '1960-06-06' }));
    assert.deepEqual((await ok(simp('GET', '/api/search?q=' + encodeURIComponent('ива')))).patients.map(p => p.name), ['Иванка Симова']);
    assert.ok(!(await ok(gp('GET', '/api/search?q=' + encodeURIComponent('иванка')))).patients.length);

    // С включен вход с ПИН търсенето иска вписване, като всеки друг адрес с данни.
    const store = spaces.get('gp');
    store.settings.requireLogin = true;
    store.data.doctors[0].pin = hashPin('1234');
    const stranger = browser();
    await ok(stranger('POST', '/api/workspace', { workspace: 'gp' }));
    assert.equal((await stranger('GET', '/api/search?q=' + encodeURIComponent('ива'))).status, 401);
    await ok(stranger('POST', '/api/login', { doctorId: store.data.doctors[0].id, pin: '1234', workspace: 'gp' }));
    assert.equal((await ok(stranger('GET', '/api/search?q=' + encodeURIComponent('мария')))).patients[0].id, maria);
  } finally {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
    for (const s of spaces.all()) await s.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('5.0 API: без активиране търсенето не връща нищо', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-500b-'));
  const store = new Store(dir);
  const server = createAppServer({ store, serveStatic: memoryStatic({ 'index.html': 'x' }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/search?q=a`);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).needsActivation, true);
  } finally {
    await new Promise(r => server.close(r));
    await store.writePromise.catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------ иконки ------------------------------ */

test('5.0 иконки: всяка използвана иконка съществува; знаците в бутоните се разпознават', () => {
  for (const [glyph, name] of Object.entries(GLYPH_ICONS)) assert.ok(ICONS[name], `${glyph} → ${name}`);
  for (const [name, parts] of Object.entries(ICONS)) {
    assert.ok(Array.isArray(parts) && parts.length, name);
    for (const part of parts) {
      if (typeof part === 'string') assert.match(part, /^M[\d\s.,a-zA-Z-]+$/, `${name}: път`);
      else assert.ok(['rect', 'circle'].includes(part[0]) && typeof part[1] === 'object', `${name}: ${part[0]}`);
    }
  }
  // Имената, подадени на icon('…') и в описанията на страниците (icon: '…'), са от комплекта.
  const used = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'shared') walk(full); continue; }
      if (!e.name.endsWith('.js')) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const m of text.matchAll(/\bicon\('([a-zA-Z]+)'/g)) used.add(m[1]);
      if (/app\.js$|palette\.js$/.test(full)) for (const m of text.matchAll(/\bicon: '([a-zA-Z]+)'/g)) used.add(m[1]);
    }
  };
  walk(path.join(ROOT, 'public/js'));
  assert.ok(used.size >= 20, `намерени ${used.size} имена`);
  for (const name of used) assert.ok(ICONS[name], `иконка „${name}“ липсва в комплекта`);

  assert.deepEqual(splitGlyph('＋ Нов пациент'), { name: 'plus', rest: 'Нов пациент' });
  assert.deepEqual(splitGlyph('🖨 Списък за обаждане'), { name: 'printer', rest: 'Списък за обаждане' });
  assert.deepEqual(splitGlyph('🖨️ Печат'), { name: 'printer', rest: 'Печат' }, 'емоджи с вариантен знак');
  assert.deepEqual(splitGlyph('✓'), { name: 'check', rest: '' });
  assert.deepEqual(splitGlyph('✓ 12'), { name: 'check', rest: '12' });
  assert.deepEqual(splitGlyph('+ Час'), { name: 'plus', rest: 'Час' });
  assert.equal(splitGlyph('Запази'), null);
  assert.equal(splitGlyph('+359 888'), null, 'знак без интервал след него е част от текста');
  assert.equal(splitGlyph('←Назад'), null);
});

/* ------------------------------ стилове ------------------------------ */

/** Променливите, зададени в блок (текстът между { и }), като Map. */
function tokens(block) {
  const out = new Map();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}
const blockOf = (selector) => {
  const at = CSS.indexOf(selector + ' {');
  assert.ok(at >= 0, selector);
  return CSS.slice(at, CSS.indexOf('\n}', at));
};
const LIGHT = tokens(blockOf(':root'));
const DARK = tokens(blockOf(':root[data-theme="dark"]'));

const hexToRgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('5.0 стилове: всяка използвана променлива е дефинирана; тъмната тема покрива всички цветове', () => {
  const used = new Set([...CSS.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
  const local = new Set(['--ph', '--ph-soft']); // задават се от класовете за фазите на цикъла
  for (const name of used) assert.ok(LIGHT.has(name) || local.has(name), `${name} се използва, но не е дефинирана в :root`);
  // Всеки цвят от светлата тема, зададен с число, има стойност и в тъмната.
  const colour = /^#[0-9a-f]{6}$/i;
  for (const [name, value] of LIGHT) {
    if (!colour.test(value) || name === '--on-brand') continue;
    assert.ok(DARK.has(name), `${name} няма стойност в тъмната тема`);
    assert.match(DARK.get(name), colour, name);
    assert.notEqual(DARK.get(name).toLowerCase(), value.toLowerCase(), `${name} е еднаква в двете теми`);
  }
  assert.equal(LIGHT.get('color-scheme') ?? /color-scheme:\s*light/.test(blockOf(':root')), true);
  assert.match(blockOf(':root[data-theme="dark"]'), /color-scheme:\s*dark/);
  assert.match(CSS, /:root\[data-density="compact"\]\s*\{/);
});

test('5.0 стилове: текстът е четлив и в двете теми (WCAG AA, поне 4,5:1)', () => {
  for (const [label, t] of [['светла', LIGHT], ['тъмна', new Map([...LIGHT, ...DARK])]]) {
    const c = (fg, bg) => contrast(t.get(fg), t.get(bg));
    const need = (fg, bg, min = 4.5) => assert.ok(c(fg, bg) >= min, `${label} тема: ${fg} върху ${bg} = ${c(fg, bg).toFixed(2)}, нужни са ${min}`);
    need('--ink', '--surface', 12);
    need('--ink', '--bg', 12);
    need('--ink-2', '--surface', 7);
    need('--ink-2', '--bg', 6);
    need('--ink-3', '--surface');
    need('--ink-3', '--bg');
    need('--ink-3', '--surface-2');
    need('--ink-2', '--surface-3');
    need('--brand', '--surface');
    need('--brand', '--bg');
    need('--brand-dark', '--brand-soft', 6);
    need('--on-brand', '--brand-fill');
    need('--on-brand', '--brand-fill-hover');
    need('--on-brand', '--danger-fill');
    need('--danger', '--danger-soft');
    need('--danger', '--surface');
    need('--warn', '--warn-soft');
    need('--warn', '--surface');
    need('--ok', '--ok-soft');
    need('--ok', '--surface');
    need('--blue', '--blue-soft');
    need('--teal', '--teal-soft');
    need('--ink-2', '--muted-soft');
    // Линиите на полетата се виждат върху фона (3:1 не се изисква за декоративни линии, но полето трябва да личи).
    assert.ok(c('--line-strong', '--surface') >= 1.35, `${label}: рамката на поле`);
  }
});

test('5.0 стилове: телефон, печат и намалено движение са покрити; старата лента я няма', () => {
  assert.match(CSS, /@media \(max-width: 720px\)[\s\S]*?\.bottom-nav\s*\{[^}]*position: fixed/);
  assert.match(CSS, /@media \(max-width: 720px\)[\s\S]*?table\.stack-sm thead \{ display: none; \}/);
  const print = CSS.slice(CSS.lastIndexOf('@media print'));
  for (const cls of ['.side', '.topbar', '.bottom-nav', '.dossier-nav', '.tabstrip', '.route-progress', '.no-print']) {
    assert.ok(print.includes(cls), `при печат ${cls} се скрива`);
  }
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.ok(!/header\.app\b/.test(CSS), 'стиловете на старата горна лента са махнати');
  // Балансирани скоби — счупен стилов файл разваля целия екран.
  let depth = 0;
  for (const ch of CSS) { if (ch === '{') depth++; else if (ch === '}') depth--; assert.ok(depth >= 0, 'затваряща скоба без отваряща'); }
  assert.equal(depth, 0);
});

/* ------------------------------ страницата ------------------------------ */

test('5.0 страница: темата се нанася преди стиловете; няма остатъци от старата обвивка', () => {
  const html = read('public/index.html');
  assert.ok(html.indexOf('/js/theme-boot.js') > 0 && html.indexOf('/js/theme-boot.js') < html.indexOf('/css/app.css'), 'theme-boot.js е преди app.css');
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'няма вграден скрипт: политиката за сигурност го забранява');
  // theme-boot.js е обикновен скрипт за всеки браузър: без модули и без нов синтаксис.
  const boot = read('public/js/theme-boot.js');
  assert.ok(!/\b(import|export|const|let)\b|=>/.test(boot.replace(/\/\*[\s\S]*?\*\//g, '')), 'theme-boot.js е на стар синтаксис');
  assert.match(boot, /localStorage\.getItem\('docup\.ui'\)/);
  assert.match(read('public/js/ui/theme.js'), /const KEY = 'docup\.ui';/);

  const app = read('public/js/app.js');
  for (const gone of ['globalSearch', 'header.app', 'searchHandler']) {
    for (const file of ['public/js/app.js', 'public/js/views/patients.js']) assert.ok(!read(file).includes(gone), `${file}: ${gone}`);
  }
  assert.match(app, /h\('aside\.side\.no-print'/);
  assert.match(app, /h\('nav\.bottom-nav\.no-print'/);
  // Името на пациента не отива в заглавието на раздела (остава в историята на браузъра).
  assert.match(app, /document\.title = 'Досие · DocUp'/);
  assert.ok(!/document\.title = [^;]*\.name/.test(app));
  // Последно отворените се пазят само за раздела и се чистят при вход.
  const palette = read('public/js/ui/palette.js');
  assert.ok(palette.includes('sessionStorage') && !palette.includes('localStorage'));
  assert.match(app, /function entryScreen\(info\) \{\s*\/\/[^\n]*\n\s*forgetRecent\(\);/);
});

test('5.0 „Какво ново“: първият запис е за текущата версия', () => {
  const version = JSON.parse(read('package.json')).version;
  assert.equal(CHANGES[0].version, version);
  assert.ok(CHANGES[0].items.length >= 4 && CHANGES[0].items.length <= 7);
  for (const [icon, title, text] of CHANGES[0].items) assert.ok(icon && title && text && text.length > 30, title);
  assert.ok(read('CHANGELOG.md').includes(`## ${version} — `));
});
