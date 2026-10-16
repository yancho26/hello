/* Версия 4.13: чеклист за нервно-психическото развитие до 1 година за родителя. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { infantFeedingPlan } from '../public/js/shared/infant-feeding.js';
import { ACT_EARLY, DEVELOPMENT_RULES, PARENT_AGES, PARENT_TIPS, parentChecklist } from '../public/js/shared/infant-development.js';
import { CHECKPOINTS } from '../public/js/shared/development.js';
import { GUIDELINES } from '../public/js/shared/guidelines.js';
import { infantReport } from '../public/js/shared/pdf/infant-report.js';
import { parseTTF } from '../public/js/shared/pdf/ttf.js';

const AS_OF = '2026-10-16';
const base = { sex: 'm', birthDate: '2026-05-10', asOf: AS_OF, birth: { weight: 3.4, height: 51, gestWeeks: 39 }, measurements: [], feeding: 'breast', solidsStart: 6 };

test('чеклист: 2, 4, 6, 9 и 12 месеца — етапите на CDC/AAP 2022 и какво да правят родителите', () => {
  assert.deepEqual(PARENT_AGES, [2, 4, 6, 9, 12]);
  const d = infantFeedingPlan(base).development;
  assert.equal(d.ages.length, 5);
  for (const a of d.ages) {
    const cp = CHECKPOINTS.find(c => c.ageMonths === a.month);
    // Всички етапи от контролния лист, по области, без пропуски.
    assert.deepEqual(a.domains.flatMap(x => x.items.map(i => i.id)), cp.items.map(i => i.id), `${a.month}`);
    assert.ok(a.domains.every(x => x.label && x.items.length));
    assert.ok(a.tips.length >= 5 && a.tips.every(t => !/800-|унции|ounce/.test(t)), `${a.month}: съветите`);
    assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(d.ages.reduce((n, a) => n + a.domains.reduce((k, x) => k + x.items.length, 0), 0), 59);
  assert.match(ACT_EARLY, /не чакайте/);
  assert.ok(Object.keys(PARENT_TIPS).map(Number).every(m => PARENT_AGES.includes(m)));
});

test('чеклист: текуща и следваща възраст; при недоносено — по коригираната възраст', () => {
  // На 5 месеца: сега е 4, следва 6.
  const d = infantFeedingPlan(base).development;
  assert.deepEqual([d.current, d.next], [4, 6]);
  assert.deepEqual(d.ages.map(a => a.status), ['past', 'now', 'next', 'later', 'later']);
  // Новородено: още няма текуща; следва 2 месеца.
  const nb = parentChecklist({ birthDate: '2026-10-01', chronological: 0.5 });
  assert.deepEqual([nb.current, nb.next], [null, 2]);
  // Родено на 32 седмица: 8 седмици корекция — на 5 месеца по календар е на около 3 по коригирана.
  const pre = infantFeedingPlan({ ...base, birth: { weight: 1.8, height: 42, gestWeeks: 32 } }).development;
  assert.ok(pre.corrected);
  assert.deepEqual([pre.current, pre.next], [2, 4]);
  assert.ok(pre.ages[0].date > d.ages[0].date, 'датите са по коригираната възраст');
  // На 1 година — всички възрасти са минали или сега.
  const y1 = infantFeedingPlan({ ...base, birthDate: '2025-10-10' }).development;
  assert.equal(y1.current, 12);
  assert.equal(y1.next, null);
});

test('общите правила: по най-новите насоки, всяка с източник в регистъра', () => {
  const text = DEVELOPMENT_RULES.map(r => `${r.text} (${r.src})`).join('\n');
  assert.match(text, /3 от 4.*CDC\/AAP 2022/);
  assert.match(text, /на 9 месеца прави стандартизиран скрининг.*AAP 2020/);
  assert.match(text, /до 1 месец.*до 3 месеца.*до 6 месеца.*JCIH 2019/);
  assert.match(text, /поне 30 минути на ден/);
  assert.match(text, /14–17 часа.*12–16 часа/);
  assert.match(text, /Без екрани до 2 години, освен видеоразговори.*AAP 2026/);
  const shorts = new Set(Object.values(GUIDELINES).map(g => g.short));
  for (const src of new Set(DEVELOPMENT_RULES.flatMap(r => r.src.split(', ')))) assert.ok(shorts.has(src), `няма в регистъра: ${src}`);
  for (const id of ['aap_devscreen_2020', 'jcih_2019', 'who_movement_2019', 'aap_sleep_2022', 'aap_media_2026', 'who_ecd_2020']) {
    assert.equal(GUIDELINES[id]?.since, '4.13.0', id);
    assert.match(GUIDELINES[id].url, /^https:\/\//);
  }
  assert.ok(GUIDELINES.aap_media_2026.year === 2026 && GUIDELINES.cdc_milestones_2022.url.includes('10.1542/peds.2021-052138'));
});

const F = new URL('../public/fonts/', import.meta.url);
const read = (f) => new Uint8Array(fs.readFileSync(new URL(f, F)));
const hexOf = (ttf, text) => [...text].map(ch => ttf.glyph(ch.codePointAt(0)).toString(16).padStart(4, '0')).join('');

test('PDF за родителя: разделът „Развитие“ с квадратчета за всеки етап', async () => {
  const fonts = { regular: read('NotoSans-Regular.ttf'), semibold: read('NotoSans-SemiBold.ttf'), bold: read('NotoSans-Bold.ttf'), symbols: read('DejaVuSans-Symbols.ttf') };
  const plan = infantFeedingPlan(base);
  const bytes = await infantReport({ plan, person: { name: 'Тест', birthDate: base.birthDate, sex: 'm' }, practice: { name: 'П' }, doctor: { name: 'д-р Т' }, fonts, version: '4.13.0', date: AS_OF });
  const s = Buffer.from(bytes).toString('latin1');
  const content = [...s.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => { try { return zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; } }).join('\n');
  const b = parseTTF(fonts.bold);
  const r = parseTTF(fonts.regular);
  assert.ok(content.includes(hexOf(b, 'Развитие — чеклист за родителя')));
  assert.ok(content.includes(hexOf(b, 'Какво да правите')));
  assert.ok(content.includes(hexOf(b, 'Не чакайте.')));
  // Етапите са в текста — например първият от всяка възраст (първата дума).
  for (const a of plan.development.ages) assert.ok(content.includes(hexOf(r, a.domains[0].items[0].text.split(' ')[0])), a.label);
  assert.ok((s.match(/\/Title <FEFF/g) || []).length >= 6, 'отметка за раздела');
});
