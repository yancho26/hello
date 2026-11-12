#!/usr/bin/env node
/* Проверка на интерфейса в браузър — за разработка, не е част от програмата.
 *
 * Обхожда всички страници и раздели на досиетата и проверява:
 *   • грешки в конзолата и отговори 4xx/5xx;
 *   • съдържание, което излиза хоризонтално извън екрана;
 *   • текст с нисък контраст спрямо фона под него (WCAG AA);
 * после минава през основните действия: меню, бързо търсене, тема, клавиши, досие.
 *
 * Нужни са работеща програма с примерни данни и Playwright с Chromium:
 *   DATA_DIR=/tmp/docup-demo node scripts/demo-data.js
 *   DATA_DIR=/tmp/docup-demo PORT=8433 DOCUP_DEMO=1 node server.js &
 *   node scripts/ui-check.mjs --width 1440,1024,390 --theme light,dark --practice gp,simp
 *
 * Опции: --base адрес (по подразбиране http://127.0.0.1:8433/), --width, --theme, --practice,
 *        --shots папка (снимки на всеки екран), --skip-actions, --skip-sweep.
 * Playwright не е зависимост на проекта: `npm i -g playwright` или PLAYWRIGHT=/път/до/playwright/index.js.
 * Кодът за изход е 1, ако има находки. */

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '1'] : null)).filter(Boolean));
const BASE = (args.base || 'http://127.0.0.1:8433/').replace(/\/?$/, '/');
const WIDTHS = String(args.width || '1440,390').split(',').map(Number);
const THEMES = String(args.theme || 'light,dark').split(',');
const PRACTICES = String(args.practice || 'gp,simp').split(',');
const SHOTS = args.shots || '';

async function loadPlaywright() {
  for (const spec of [process.env.PLAYWRIGHT, 'playwright', '/opt/node22/lib/node_modules/playwright/index.js'].filter(Boolean)) {
    try { const m = await import(spec); return m.default || m; } catch { /* следващият */ }
  }
  console.error('Не намирам Playwright. Инсталирайте го (npm i -g playwright) или задайте PLAYWRIGHT=/път/до/playwright/index.js.');
  process.exit(2);
}
const pw = await loadPlaywright();
const browser = await pw.chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const findings = [];

/** Контраст на видимия текст спрямо фона под него. Изпълнява се в страницата. */
function contrastInPage() {
  const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { rgb: v.slice(0, 3), a: v[3] === undefined ? 1 : v[3] }; };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // преливка: не се оценява
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let out = (parse(getComputedStyle(document.body).backgroundColor) || { rgb: [255, 255, 255] }).rgb;
    for (const l of layers.reverse()) out = out.map((v, i) => v * (1 - l.a) + l.rgb[i] * l.a);
    return out;
  };
  const bad = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    const text = node.nodeValue.trim();
    if (text.length < 2) continue;
    const el = node.parentElement;
    if (!el || el.closest('svg, .toast, option')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.6) continue;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) continue;
    const f = fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
    const [hi, lo] = [lum(f), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.5 && Number(cs.fontWeight) >= 600) ? 3 : 4.5;
    if (ratio < need - 0.05) {
      const key = `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} ${cs.color} върху rgb(${bg.map(Math.round)})`;
      if (!bad.has(key)) bad.set(key, `${ratio.toFixed(2)} „${text.slice(0, 24)}“`);
    }
  }
  return [...bad.entries()].map(([k, v]) => `${k} → ${v}`);
}

async function open(width, theme, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width <= 720 ? 844 : 900 } });
  await ctx.addInitScript((prefs) => { if (!localStorage.getItem('docup.ui')) localStorage.setItem('docup.ui', JSON.stringify(prefs)); }, { theme, density: 'normal', nav: 'auto', ...extra });
  const page = await ctx.newPage();
  const tag = `${width}px ${theme}`;
  const state = { where: '' };
  const note = (text) => findings.push(`[${tag}] ${state.where} | ${text}`);
  page.on('pageerror', e => note(`ГРЕШКА ${String(e).slice(0, 200)}`));
  page.on('console', m => { if (m.type() === 'error') note(`КОНЗОЛА ${m.text().slice(0, 200)}`); });
  page.on('response', r => { if (r.status() >= 400) note(`HTTP ${r.status()} ${r.url().replace(BASE, '/')}`); });
  return { ctx, page, state, note, tag };
}

async function enter(page, practice) {
  await page.goto(BASE);
  await page.waitForSelector('.entry-grid');
  await page.locator('.entry-option').nth(practice === 'simp' ? 1 : 0).locator('button', { hasText: 'Влез' }).click();
  await page.waitForSelector('.page-head');
  await page.waitForTimeout(400);
  const seen = page.locator('.modal button', { hasText: 'Разбрах' });
  if (await seen.count()) await seen.click();
}

const patientsOf = (page) => page.evaluate(async () => (await fetch('/api/patients').then(r => r.json())).patients.map(x => ({ id: x.id, birthDate: x.birthDate, sex: x.sex, name: x.name })));
const yearsOld = (d) => (Date.now() - new Date(d).getTime()) / (365.25 * 864e5);

/* ------------------------------- обхождане ------------------------------- */

async function sweep(width, theme, practice) {
  const { ctx, page, state, note, tag } = await open(width, theme);
  let screens = 0;
  const check = async (name, wait = 450) => {
    state.where = name;
    await page.waitForTimeout(wait);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) note(`ИЗЛИЗА ИЗВЪН ЕКРАНА с ${over}px`);
    for (const c of await page.evaluate(contrastInPage)) findings.push(`[${tag}] КОНТРАСТ ${c}   (${name})`);
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${practice}-${width}-${theme}-${String(++screens).padStart(3, '0')}-${name.replace(/[^\wа-яА-Я-]+/g, '_').slice(0, 40)}.png`) });
    } else screens++;
  };
  await page.goto(BASE);
  await page.waitForSelector('.entry-grid');
  await check('вход');
  await enter(page, practice);
  const list = await patientsOf(page);
  const pick = [list.find(x => yearsOld(x.birthDate) < 1), list.find(x => yearsOld(x.birthDate) >= 3 && yearsOld(x.birthDate) < 12),
    list.find(x => yearsOld(x.birthDate) >= 14 && yearsOld(x.birthDate) < 18), list.find(x => yearsOld(x.birthDate) >= 45 && x.sex === 'f'),
    list.find(x => yearsOld(x.birthDate) >= 30 && x.sex === 'm')].filter(Boolean);
  const pages = practice === 'simp' ? ['dashboard', 'agenda', 'patients', 'assistant', 'nutrition', 'reports', 'settings']
    : ['dashboard', 'patients', 'calendar', 'assistant', 'nutrition', 'reports', 'settings'];
  for (const pg of pages) {
    await page.goto(BASE + '#/' + pg);
    await check(pg, 900);
    for (const sel of ['.tabs button', '.seg button']) {
      const items = page.locator(sel);
      for (let i = 1; i < await items.count(); i++) { await items.nth(i).click(); await check(`${pg} ${sel.includes('seg') ? 'списък' : 'раздел'} ${i + 1}`, 550); }
    }
  }
  for (const pt of pick) {
    await page.goto(BASE + '#/patient/' + pt.id);
    await check(`досие ${pt.id}`, 1000);
    const tabs = page.locator('.tabs button');
    for (let i = 1; i < await tabs.count(); i++) {
      await tabs.nth(i).click();
      await check(`досие ${pt.id} · ${(await tabs.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 22)}`, 650);
    }
  }
  // Прозорци.
  await page.goto(BASE + '#/patients');
  await page.waitForTimeout(600);
  await page.locator(width <= 720 ? '.topbar .tool-btn.new' : '.side-new').click();
  await check('прозорец „Нов пациент“');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator(width <= 720 ? '.topbar .tool-btn:last-child' : 'button.user-chip').click();
  await check('меню на потребителя');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.locator(width <= 720 ? '.topbar .tool-btn:not(.new)' : '.side-search').first().click();
  await page.waitForSelector('.palette');
  await page.locator('.palette input').fill('ан');
  await check('бързо търсене', 600);
  console.log(`обхождане ${practice} ${width}px ${theme}: ${screens} екрана`);
  await ctx.close();
}

/* -------------------------------- действия -------------------------------- */

async function actions(width, practice) {
  const { ctx, page, state, note } = await open(width, 'light');
  const expect = (ok, what) => { if (!ok) note(`НЕ РАБОТИ: ${what}`); };
  const phone = width <= 720;
  state.where = 'действия';
  await enter(page, practice);
  const list = await patientsOf(page);
  const shell = page.locator('.app-shell');

  if (!phone) {
    // Свиване и разгъване на менюто; изборът се помни.
    const before = await shell.getAttribute('data-nav');
    if (width > 1099) {
      await page.locator('.side-tools .tool-btn').nth(2).click();
      const after = await shell.getAttribute('data-nav');
      expect(after !== before, 'бутонът за свиване на менюто');
      expect((await page.evaluate(() => JSON.parse(localStorage.getItem('docup.ui')).nav)) === after, 'видът на менюто се помни');
      await page.locator('.side-tools .tool-btn').nth(2).click();
      expect((await shell.getAttribute('data-nav')) === before, 'разгъване на менюто');
    } else expect(before === 'rail', 'на тесен екран менюто е лента с иконки');
    // Тема: бутонът обикаля светла → тъмна → като на компютъра.
    await page.locator('.side-tools .tool-btn').first().click();
    expect((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'смяна към тъмна тема');
    await page.locator('.side-tools .tool-btn').first().click();
    await page.locator('.side-tools .tool-btn').first().click();
    expect((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'връщане към светла тема');
    // Клавиши: „?“ показва комбинациите, g + p води към пациентите.
    await page.keyboard.press('?');
    expect(await page.locator('.modal .keys-list').count() === 1, 'клавиш „?“');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('g'); await page.keyboard.press('p');
    await page.waitForTimeout(700);
    expect(page.url().endsWith('#/patients'), 'клавиши G, P');
    expect((await page.title()) === 'Пациенти · DocUp', 'заглавие на раздела');
  }

  // Табло: броячът за просрочия избира списъка с просрочените.
  await page.goto(BASE + '#/dashboard');
  await page.waitForTimeout(900);
  if (practice === 'gp') {
    await page.locator('.seg button').nth(1).click();
    await page.locator('.stat.clickable', { hasText: 'просрочия' }).click();
    await page.waitForTimeout(500);
    expect((await page.locator('.seg button.active').innerText()).startsWith('Просрочени'), 'броячът води към списъка');
  }

  // Списък с пациенти: търсенето филтрира и курсорът остава в полето.
  await page.goto(BASE + '#/patients');
  await page.waitForTimeout(800);
  const all = await page.locator('tbody tr').count();
  const word = list[0].name.split(' ')[0];
  await page.locator('.search-field input').click();
  await page.keyboard.type(word.slice(0, 4), { delay: 40 });
  await page.waitForTimeout(900);
  expect(await page.locator('tbody tr').count() < all, 'търсенето в списъка филтрира');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.type === 'search'), 'курсорът остава в полето за търсене');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  expect(await page.locator('tbody tr').count() === all, 'Esc изчиства търсенето');

  // Връщане на същото място в списъка след затваряне на досие.
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(200);
  const y = await page.evaluate(() => window.scrollY);
  await page.locator('tbody tr.clickable').nth(Math.min(12, all - 1)).click();
  await page.waitForSelector('.patient-head');
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.scrollY)) === 0, 'досието се отваря от началото');
  await page.goBack();
  await page.waitForSelector('.search-field');
  await page.waitForTimeout(700);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y) < 40, `връщане на същото място в списъка (${y})`);

  // Бързо търсене: отваряне, резултати, Enter отваря досието, после е в „последно отворени“.
  const openSearch = async () => { if (phone) await page.locator('.topbar .tool-btn:not(.new)').first().click(); else await page.keyboard.press('/'); await page.waitForSelector('.palette'); };
  await openSearch();
  await page.locator('.palette input').fill(list[0].name.split(' ').slice(0, 2).join(' '));
  await page.waitForTimeout(600);
  expect(await page.locator('.palette-item .p-avatar').count() >= 1, 'бързото търсене намира пациент');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.patient-head');
  await page.waitForTimeout(600);
  expect(/#\/patient\//.test(page.url()), 'Enter отваря досието');
  expect((await page.title()) === 'Досие · DocUp', 'името не е в заглавието на раздела');
  await openSearch();
  expect(await page.locator('.palette-group', { hasText: 'Последно отворени' }).count() === 1, 'последно отворените досиета');
  await page.locator('.palette input').fill('настр');
  await page.waitForTimeout(300);
  expect((await page.locator('.palette-item .pi-title').first().innerText()) === 'Настройки', 'страница по име');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  expect(await page.locator('.palette').count() === 0, 'Esc затваря търсенето');

  // Досие: лентата с разделите остава горе и показва пациента.
  const adult = list.find(x => yearsOld(x.birthDate) >= 45) || list[0];
  await page.goto(BASE + '#/patient/' + adult.id);
  await page.waitForSelector('.patient-head');
  await page.locator('.tabs button').first().click();
  await page.waitForTimeout(600);
  await page.mouse.move(width * 0.6, 400);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(600);
  if (await page.evaluate(() => window.scrollY > 300)) {
    expect(await page.locator('.dossier-nav.stuck').count() === 1, 'лентата на досието остава горе');
    expect((await page.locator('.dossier-id .nm').innerText()).trim() === adult.name, 'името в залепената лента');
  }
  // Прозорец: заглавието и бутоните остават на екрана при дълго съдържание.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.patient-head button', { hasText: 'Редакция' }).click();
  await page.waitForSelector('.modal');
  const foot = await page.locator('.modal > footer').boundingBox();
  expect(foot && foot.y + foot.height <= (phone ? 844 : 900) + 1, 'бутоните на прозореца са на екрана');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  if (phone) {
    // „Още“ в долната лента показва останалите страници.
    await page.locator('.bottom-nav button').click();
    await page.locator('.menu-item', { hasText: 'Справки' }).click();
    await page.waitForTimeout(700);
    expect(page.url().endsWith('#/reports'), '„Още“ → Справки');
    expect(await page.locator('.bottom-nav button.active').count() === 1, '„Още“ е отбелязано');
  } else {
    // Ред от таблица се отваря с Enter от клавиатурата.
    await page.goto(BASE + '#/patients');
    await page.waitForTimeout(800);
    await page.locator('tbody tr.clickable').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    expect(/#\/patient\//.test(page.url()), 'Enter върху ред отваря досието');
  }
  console.log(`действия ${practice} ${width}px`);
  await ctx.close();
}

try {
  for (const practice of PRACTICES) {
    for (const width of WIDTHS) {
      if (!args['skip-sweep']) for (const theme of THEMES) await sweep(width, theme, practice);
      if (!args['skip-actions']) await actions(width, practice);
    }
  }
} finally {
  await browser.close();
}
const unique = [...new Set(findings)];
console.log(unique.length ? `\nНаходки: ${unique.length}` : '\nНяма находки.');
for (const f of unique.slice(0, 80)) console.log('  ' + f);
process.exit(unique.length ? 1 : 0);
