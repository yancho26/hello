/* Цветен PDF отчет за хранителния режим и тренировъчния план: корица, цели с диаграма,
 * насоки, цикъл, тренировки (календар и графика по седмици), меню по дни с рецептите,
 * списък за пазаруване с квадратчета и източниците с връзки. Общ за браузъра и тестовете. */

import { PDFDocument } from './pdf.js';
import { C, Flow, bullets, card, checkbox, chip, chipRow, chipWidth, columns, drawLines, textBlock, wrap } from './kit.js';
import { formatAge, formatDate, today } from '../dates.js';
import { FOODS, GOALS, PACES, weekChunks } from '../nutrition.js';
import { shopName } from '../recipes.js';
import { INTENSITY, TRAINING_LEVELS } from '../training.js';
import { enBaseName } from '../i18n/en-foods.js';
import { ui, withPlanLang } from '../i18n/plan-en.js';

const dec = (v) => String(v ?? '').replace('.', ',');
const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
/** z със знак и един знак след запетаята: „+1,5“, „−0,7“, „0,0“. */
const signed = (z) => (Math.abs(z) < 0.05 ? '0' : `${z > 0 ? '+' : '−'}${dec(Math.abs(z).toFixed(1))}`);
/* Датата и текстовете около режима — на езика на режима (версия 4.11). */
const fd = (iso) => ui(formatDate(iso));

const MACRO = { protein: C.teal, carbs: '#d39b12', fat: C.rose };
const MEAL_COLOR = { breakfast: C.amber, snack: C.teal, lunch: C.brand, dinner: C.sky, milk: C.slate };
/* Движението на детето (версия 4.16): игра, умерено до интензивно, интензивно, мускули и кости. */
const KIND_COLOR = { play: '#c9a227', mvpa: C.sky, vigorous: C.coral, strength: C.green };
const PHASE = {
  menstrual: [C.rose, C.roseSoft], follicular: [C.green, C.greenSoft], ovulation: [C.amber, C.amberSoft],
  luteal: [C.brand, C.brandSoft], premenstrual: [C.slate, C.slateSoft],
};
const INTENSITY_COLOR = { light: ['#3f9b6b', '#e3f3ea'], moderate: ['#c98a12', '#fdf0d9'], vigorous: [C.coral, C.coralSoft] };
const ACT_SHORT = {
  gym: 'фитнес', bodyweight: 'у дома', reformer: 'реформър', matpilates: 'пилатес', yoga: 'йога', taichi: 'тай чи',
  running: 'бягане', walking: 'ходене', cycling: 'колело', swimming: 'плуване', rowing: 'гребане', hiit: 'HIIT',
  dance: 'танци', team: 'отборен спорт', racket: 'тенис', hiking: 'преход',
  // Версия 4.15.
  chair: 'на стол', stretching: 'разтягане', stairs: 'стълби', waterwalk: 'във вода', ebike: 'ел. колело', folk: 'хора',
  gardening: 'градина', xcski: 'ски бягане', alpineski: 'ски', skating: 'кънки', paddling: 'каяк', climbing: 'катерене',
  combat: 'бокс', tabletennis: 'тенис на маса', golf: 'голф',
};
const PALETTE = [C.brand, C.teal, C.coral, C.sky, '#d39b12', C.rose, C.green, C.slate];
const SHOP_COLOR = { veg: C.green, fruit: C.coral, grain: '#b8860b', legume: C.amber, protein: C.rose, dairy: C.sky, nuts: '#8d6e63', fat: C.teal, other: C.slate };
const SECTION = {
  goals: { color: C.brand, soft: C.brandSoft, icon: '◎' },
  guide: { color: C.green, soft: C.greenSoft, icon: '✓' },
  cycle: { color: C.rose, soft: C.roseSoft, icon: '●' },
  training: { color: C.coral, soft: C.coralSoft, icon: '▲' },
  menu: { color: C.teal, soft: C.tealSoft, icon: '★' },
  shop: { color: C.amber, soft: C.amberSoft, icon: '☑' },
  sources: { color: C.slate, soft: C.slateSoft, icon: '►' },
};

/**
 * PDF файл (Uint8Array). plan — изготвеният режим; person — { name, birthDate, age, sex };
 * practice — { name, phone }; doctor — { name }; fonts — { regular, semibold, bold, symbols } (байтове).
 * only: 'shopping' — само списъците за пазаруване.
 */
export async function nutritionReport(args) {
  return withPlanLang(args.plan, () => report(args));
}

function report({ plan, person = {}, practice = {}, doctor = null, fonts, version = '', date = today(), only = null }) {
  const training = only ? null : plan.training;
  const title = only === 'shopping' ? ui('Списък за пазаруване') : training ? ui('Хранене и тренировки') : plan.child ? ui('Хранене и движение') : ui('Личен хранителен режим');
  const doc = new PDFDocument({
    title: `${title} — ${person.name || ''}`.trim(), author: doctor?.name || practice.name || 'DocUp', subject: title,
    creator: 'DocUp', producer: `DocUp ${version}`.trim(), lang: plan.lang === 'en' ? 'en-GB' : 'bg-BG',
  });
  doc.addFont('symbols', fonts.symbols).setFallback('symbols');
  doc.addFont('regular', fonts.regular).addFont('semibold', fonts.semibold).addFont('bold', fonts.bold);

  const flow = new Flow(doc, {
    header: (page, section) => {
      page.gradient(0, 0, page.w, 5, C.brandDark, C.teal);
      page.text(`${title} · ${person.name || ''}`, 40, 30, { size: 7.5, color: C.ink3 });
      if (section) page.text(section, page.w - 40, 30, { font: 'semibold', size: 7.5, color: C.brand, align: 'right' });
      page.line(40, 38, page.w - 40, 38, { color: C.line, width: 0.5 });
    },
  });
  const ctx = { doc, flow, plan, person, practice, doctor, date, title };

  if (only === 'shopping') {
    flow.newPage({ first: true });
    cover(ctx, { compact: true });
    shoppingWeeks(plan).forEach((sh, i, all) => shopping(ctx, sh, all.length > 1 ? ui(`Пазаруване за седмица ${sh.week}`) : ui('Списък за пазаруване'), i > 0));
  } else {
    flow.newPage({ first: true });
    cover(ctx);
    targets(ctx);
    guidance(ctx);
    if (plan.cycle) cycleBlock(ctx);
    if (training) trainingSection(ctx, training);
    if (plan.child?.movement) movementSection(ctx, plan.child.movement);
    menu(ctx);
    sources(ctx);
  }
  footers(ctx);
  return doc.bytes();
}

/* ----------------------------------- общи ----------------------------------- */

function heading(ctx, key, text, sub = null, { newPage = false, level = 0 } = {}) {
  const { flow, doc } = ctx;
  const s = SECTION[key];
  flow.section = text;
  if (newPage && flow.y > flow.top + 1) flow.newPage();
  const subBlock = sub ? textBlock(doc, sub, flow.width - 34, { size: 8.5, color: C.ink2 }) : null;
  flow.need(34 + (subBlock ? subBlock.h : 0) + 60);
  const { page } = flow;
  const y = flow.y;
  page.rect(flow.x, y, 24, 24, { fill: s.color, radius: 6 });
  page.text(s.icon, flow.x + 12, y + 16.5, { font: 'bold', size: 11, color: C.white, align: 'center' });
  page.text(text, flow.x + 34, y + 17, { font: 'bold', size: 15, color: C.ink });
  doc.bookmark(text, page, y - 6, level);
  flow.y += 30;
  if (subBlock) { subBlock.draw(page, flow.x + 34, flow.y - 4); flow.y += subBlock.h; }
  flow.y += 6;
}

function subheading(ctx, text, color = C.ink, { bookmark = false } = {}) {
  const { flow, doc } = ctx;
  flow.need(18 + 50);
  flow.page.text(text, flow.x, flow.y + 11, { font: 'bold', size: 10.5, color });
  if (bookmark) doc.bookmark(text, flow.page, flow.y - 4, 1);
  flow.y += 18;
}

/** Цветна кутия с текст (предупреждения, цел). */
function noteBox(ctx, runs, { fg = C.ink, bg = C.brandSoft, bar = C.brand, size = 8.8 } = {}) {
  const { doc, flow } = ctx;
  const inner = textBlock(doc, runs, flow.width - 26, { size, color: fg });
  flow.add({
    h: inner.h + 14,
    draw: (page, x, y) => {
      page.rect(x, y, flow.width, inner.h + 14, { fill: bg, radius: 7 });
      page.rect(x, y, 4, inner.h + 14, { fill: bar, radius: [7, 0, 0, 7] });
      inner.draw(page, x + 16, y + 7);
    },
  }, { gap: 6 });
}

function personFacts(ctx) {
  const { plan, person, date } = ctx;
  const i = plan.input || {};
  const facts = [];
  if (person.birthDate) facts.push(ui(formatAge(person.birthDate, date)));
  else if (person.age || i.age) facts.push(ui(`${person.age || i.age} г.`));
  if (i.weight) facts.push(ui(`${dec(i.weight)} кг`));
  if (i.height) facts.push(ui(`${i.height} см`));
  if (plan.child) facts.push(ui(`ИТМ ${dec(plan.child.bmi.value)}`) + (plan.child.percentile ? ui(` (${plan.child.percentile} перцентил)`) : ''));
  else if (plan.bmi) facts.push(ui(`ИТМ ${dec(plan.bmi)}`));
  return facts;
}

function menuKind(plan) {
  if (!plan.week) return ui('Примерно меню за ден');
  const a = plan.week[0].date;
  const b = plan.week[plan.week.length - 1].date;
  return `${plan.week.length > 7 ? ui('Меню за месец') : ui(`Меню за ${plan.week.length} дни`)} · ${fd(a)} – ${fd(b)}`;
}

/* ----------------------------------- корица ----------------------------------- */

function cover(ctx, { compact = false } = {}) {
  const { flow, plan, person, practice, doctor, date, title } = ctx;
  const { page } = flow;
  const H = compact ? 118 : 158;
  page.gradient(0, 0, page.w, H, C.brandDark, C.teal);
  page.circle(page.w - 70, 18, 86, { fill: C.white, opacity: 0.07 });
  page.circle(page.w - 190, H - 6, 40, { fill: C.white, opacity: 0.06 });
  page.circle(64, H + 6, 26, { fill: C.white, opacity: 0.05 });
  const kicker = compact ? ui('ЛИЧЕН ПЛАН · ПАЗАРУВАНЕ') : plan.training ? ui('ЛИЧЕН ПЛАН · ХРАНЕНЕ И ТРЕНИРОВКИ')
    : plan.child ? ui('ЛИЧЕН ПЛАН · ХРАНЕНЕ И ДВИЖЕНИЕ') : ui('ЛИЧЕН ПЛАН · ХРАНЕНЕ');
  page.text(kicker, 40, 40, { font: 'semibold', size: 7.5, color: C.white, opacity: 0.85, spacing: 1.1 });
  page.text(title, 40, compact ? 70 : 76, { font: 'bold', size: compact ? 22 : 27, color: C.white });
  page.text(person.name || '', 40, compact ? 92 : 104, { font: 'semibold', size: 14, color: C.white });
  if (!compact) page.text([...personFacts(ctx), ui(`изготвен ${formatDate(date)}`)].join('  ·  '), 40, 124, { size: 9, color: C.white, opacity: 0.92 });
  page.text(menuKind(plan), 40, compact ? 108 : 142, { size: 8.5, color: C.white, opacity: 0.85 });
  let ry = 40;
  for (const [text, font, size] of [[practice.name, 'semibold', 9], [doctor?.name, 'regular', 8.5], [practice.phone ? ui(`тел. ${practice.phone}`) : '', 'regular', 8]]) {
    if (!text) continue;
    page.text(text, page.w - 40, ry, { font, size, color: C.white, align: 'right', opacity: 0.95 });
    ry += size + 5;
  }
  flow.y = H + 18;
}

/* ------------------------------------ цели ------------------------------------ */

function projectionRuns(plan) {
  if (plan.child) {
    // Дете: ИТМ за възрастта по СЗО — вместо цел за теглото.
    const c = plan.child;
    const b = c.bmi;
    const z = b.z === null ? '' : `, z ${signed(b.z)}`;
    return [{ text: ui('ИТМ за възрастта: '), font: 'bold', color: C.brandDark },
      { text: ui(`${dec(b.value)} кг/м²`) + (c.percentile ? ui(` — ${c.percentile} перцентил`) : '') + z + ui(`, ${b.label} (СЗО).`) + ' ' },
      { text: ui(`Активност: ${c.activityLabel} (PAL ${dec(c.pal)}).`), color: C.ink2 }];
  }
  const pr = plan.projection;
  const goal = plan.input?.goal;
  const head = { text: ui('Цел: '), font: 'bold', color: C.brandDark };
  if (!goal || goal === 'maintain') return [head, { text: ui('поддържане на теглото.') }];
  if (!pr) return [head, { text: ui(`${GOALS[goal] || ''}.`) }];
  const parts = [ui(`${GOALS[goal]}, ${PACES[plan.input.pace]?.label || ''} темпо`), ui(`около ${pr.weeklyKg > 0 ? '+' : '−'}${dec(Math.abs(pr.weeklyKg))} кг седмично`)];
  if (pr.targetWeight) parts.push(ui(`до ${dec(pr.targetWeight)} кг за около ${pr.weeks} седмици, към ${formatDate(pr.eta)}`));
  return [head, { text: parts.join(' · ') + '.' }, ...(pr.note ? [{ text: ' ' + pr.note, color: C.ink2 }] : [])];
}

/** Очакваното тегло по седмици (версия 4.14): разходът намалява с теглото — промяната се забавя (Hall 2011). */
function projectionChart(ctx) {
  const { doc, flow, plan } = ctx;
  const pr = plan.projection;
  const curve = pr?.curve;
  if (!curve?.length) return;
  const H = 128;
  const tw = pr.targetWeight;
  const ws = curve.map(c => c.weight);
  let lo = Math.min(...ws, tw || Infinity);
  let hi = Math.max(...ws, tw || -Infinity);
  const pad = Math.max(0.5, (hi - lo) * 0.12);
  lo -= pad; hi += pad;
  const note = textBlock(doc, ui('Прогнозата отчита, че с теглото се променя и разходът на енергия — промяната се забавя с времето (Hall 2011).'), flow.width - 24, { size: 7, color: C.ink3 });
  flow.add({
    h: H + note.h + 4,
    draw: (page, x, y) => {
      page.rect(x, y, flow.width, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 10 });
      page.text(ui('Очаквано тегло по седмици'), x + 12, y + 17, { font: 'bold', size: 9, color: C.ink });
      const px = x + 40;
      const pw = flow.width - 56;
      const py = y + 28;
      const ph = H - 50;
      const last = curve[curve.length - 1].week || 1;
      const X = (wk) => px + (wk / last) * pw;
      const Y = (v) => py + ph - ((v - lo) / (hi - lo)) * ph;
      const step = hi - lo > 20 ? 5 : hi - lo > 8 ? 2 : 1;
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        page.line(px, Y(v), px + pw, Y(v), { color: C.line, width: 0.5 });
        page.text(dec(v), px - 5, Y(v) + 2.5, { size: 6.5, color: C.ink3, align: 'right' });
      }
      const every = last > 52 ? 13 : last > 26 ? 8 : last > 12 ? 4 : 2;
      for (let wk = 0; wk <= last; wk += every) page.text(ui(`${wk} седм.`), X(wk), py + ph + 11, { size: 6.5, color: C.ink3, align: 'center' });
      if (tw) {
        page.line(px, Y(tw), px + pw, Y(tw), { color: C.green, width: 1, dash: [3, 2] });
        page.text(ui(`цел ${dec(tw)} кг`), px + 4, Y(tw) - 3, { font: 'semibold', size: 6.8, color: C.green });
      }
      for (let i = 1; i < curve.length; i++) {
        page.line(X(curve[i - 1].week), Y(curve[i - 1].weight), X(curve[i].week), Y(curve[i].weight), { color: C.brand, width: 1.8 });
      }
      const endW = curve[curve.length - 1].weight;
      page.circle(X(0), Y(curve[0].weight), 2.6, { fill: C.brand });
      page.circle(X(last), Y(endW), 2.6, { fill: C.brand });
      page.text(ui(`${dec(endW)} кг`), X(last) - 4, Y(endW) + (endW > curve[0].weight ? -5 : 11), { font: 'bold', size: 7, color: C.brandDark, align: 'right' });
      note.draw(page, x + 2, y + H + 4);
    },
  }, { gap: 6 });
}

function minerals(plan) {
  if (plan.week) {
    const n = plan.week.length;
    return { fe: plan.week.reduce((s, d) => s + (d.totals.fe || 0), 0) / n, ca: plan.week.reduce((s, d) => s + (d.totals.ca || 0), 0) / n };
  }
  return { fe: plan.day?.fe || 0, ca: plan.day?.ca || 0 };
}

function targets(ctx) {
  const { doc, flow, plan } = ctx;
  const t = plan.targets;
  noteBox(ctx, projectionRuns(plan), { bg: C.brandSoft, bar: C.brand });
  for (const w of plan.warnings || []) noteBox(ctx, [{ text: '! ', font: 'bold', color: C.red }, { text: w }], { bg: C.redSoft, bar: C.red });
  projectionChart(ctx);
  flow.space(4);
  heading(ctx, 'goals', ui('Дневни цели'), plan.child
    ? ui('Енергия по EFSA 2013 (покой по Henry 2005 × PAL × 1,01 за растежа); белтък, фибри, вода, витамини и минерали — по EFSA за възрастта; сол — EFSA 2019; захари — ESPGHAN 2017.')
    : ui('Енергия по Mifflin–St Jeor с коефициент за активност; белтък, мазнини, фибри, сол и течности по EFSA, СЗО и насоките за заболяванията.'));

  const H = 168;
  const leftW = 206;
  const gap = 10;
  const m = minerals(plan);
  const pk = t.protein * 4;
  const ck = t.carbs * 4;
  const fk = t.fat * 9;
  const sum = pk + ck + fk || 1;
  const share = [[ui('Белтък'), pk / sum, MACRO.protein], [ui('Въглехидрати'), ck / sum, MACRO.carbs], [ui('Мазнини'), fk / sum, MACRO.fat]];
  const tiles = [
    [ui('Белтък'), t.protein, ui('г'), ui(`${dec(t.proteinPerKg)} г/кг`) + (t.proteinMax ? ui(` · до ${t.proteinMax} г`) : ''), MACRO.protein],
    [ui('Въглехидрати'), t.carbs, ui('г'), ui(`${t.carbPct}%`) + (t.sugarMax ? ui(` · захари <${t.sugarMax} г`) : plan.child ? ui(' · без добавена захар') : ''), MACRO.carbs],
    [ui('Мазнини'), t.fat, ui('г'), ui(`${t.fatPct}%`) + (t.satFat ? ui(` · наситени <${t.satFat} г`) : ''), MACRO.fat],
    [ui('Фибри'), t.fiber, ui('г'), ui('поне толкова'), C.green],
    [ui('Сол'), ui(`<${dec(t.salt)}`), ui('г'), ui('заедно с хляба'), C.slate],
    [ui('Течности'), ui(dec(Math.round(t.fluids / 100) / 10)), ui('л'), plan.child ? ui(`общо с храната ${dec(plan.child.water)} л`) : ui('вода, чай, супи'), C.sky],
  ];
  if (t.iron) tiles.push([ui('Желязо'), t.iron, ui('мг'), ui(`в менюто ≈${Math.round(m.fe)} мг`), C.rose]);
  if (t.calcium) tiles.push([ui('Калций'), t.calcium, ui('мг'), ui(`в менюто ≈${Math.round(m.ca / 10) * 10} мг`), C.teal]);
  tiles.push([ui('Хранения'), plan.input?.mealsPerDay || (plan.week?.[0]?.meals.length ?? plan.meals?.length ?? ''), ui('на ден'), plan.pattern?.label || '', C.brand]);
  const shown = tiles.slice(0, 9);

  flow.add({
    h: H,
    draw: (page, x, y) => {
      // Енергия с кръгова диаграма на макронутриентите.
      page.rect(x, y, leftW, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 10 });
      page.gradient(x, y, leftW, 6, C.brandDark, C.teal, { radius: [10, 10, 0, 0] });
      page.text(ui('ЕНЕРГИЯ ДНЕВНО'), x + 14, y + 26, { font: 'semibold', size: 7.5, color: C.ink2, spacing: 0.6 });
      const big = thousands(t.kcal);
      const bw = page.text(big, x + 14, y + 56, { font: 'bold', size: 28, color: C.brandDark });
      page.text('kcal', x + 18 + bw, y + 56, { font: 'semibold', size: 10, color: C.ink2 });
      if (plan.energy) page.text(ui(`покой ${thousands(plan.energy.bmr)} · разход ${thousands(plan.energy.tdee)}`), x + 14, y + 71, { size: 7.2, color: C.ink3 });
      const cx = x + 52;
      const cy = y + 120;
      let a = 0;
      for (const [, v, color] of share) { page.ring(cx, cy, 34, 21, a, a + v * 360, { fill: color }); a += v * 360; }
      page.text(ui('Б · В · М'), cx, cy + 3, { font: 'semibold', size: 6.5, color: C.ink2, align: 'center' });
      share.forEach(([label, v, color], i) => {
        const ly = y + 98 + i * 16;
        page.rect(x + 96, ly - 6.5, 8, 8, { fill: color, radius: 2 });
        page.text(label, x + 108, ly, { size: 7.5, color: C.ink });
        page.text(`${Math.round(v * 100)}%`, x + leftW - 12, ly, { font: 'bold', size: 8, color, align: 'right' });
      });
      // Плочки.
      const gx = x + leftW + gap;
      const gw = flow.width - leftW - gap;
      const cols = 3;
      const tw = (gw - (cols - 1) * 8) / cols;
      const th = (H - 2 * 8) / 3;
      shown.forEach(([label, value, unit, sub, color], i) => {
        const tx = gx + (i % cols) * (tw + 8);
        const ty = y + Math.floor(i / cols) * (th + 8);
        page.rect(tx, ty, tw, th, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
        page.rect(tx, ty, 4, th, { fill: color, radius: [8, 0, 0, 8] });
        page.text(label, tx + 12, ty + 14, { font: 'semibold', size: 7.4, color: C.ink2 });
        const vw = page.text(String(value), tx + 12, ty + 33, { font: 'bold', size: 15, color });
        page.text(unit, tx + 15 + vw, ty + 33, { size: 7.5, color: C.ink2 });
        const subLine = wrap(doc, String(sub || ''), tw - 18, 6.6)[0];
        if (subLine) drawLines(page, [subLine], tx + 12, ty + th - 13, 6.6);
      });
    },
  }, { gap: 8 });
  if (t.proteinNote) flow.text(t.proteinNote, { size: 8, color: C.ink2 });
  microTable(ctx);
}

/** Витамини и минерали в менюто спрямо EFSA (версия 4.15): две колони с ленти и подсказките. */
function microTable(ctx) {
  const { doc, flow, plan } = ctx;
  const m = plan.micro;
  if (!m?.rows?.length) return;
  const num = (v) => (plan.lang === 'en' ? String(v) : dec(v));
  flow.space(6);
  subheading(ctx, m.basis === 'week' ? ui('Витамини и минерали — средно на ден в менюто') : ui('Витамини и минерали — в първия вариант на деня'), C.teal);
  const half = Math.ceil(m.rows.length / 2);
  const rowH = 15;
  const H = half * rowH + 6;
  const colW = (flow.width - 14) / 2;
  const color = (r) => (r.status === 'ok' ? C.green : r.status === 'near' ? C.amber : C.red);
  flow.add({
    h: H,
    draw: (page, x, y) => {
      m.rows.forEach((r, i) => {
        const cx = x + (i < half ? 0 : colW + 14);
        const cy = y + (i % half) * rowH;
        page.rect(cx, cy, colW, rowH - 2, { fill: i % 2 ? C.white : C.bg, radius: 3 });
        page.text(r.label, cx + 6, cy + 9.5, { font: r.status === 'ok' || r.status === 'near' ? 'regular' : 'semibold', size: 7.4, color: C.ink });
        const bx = cx + colW * 0.43;
        const bw = colW * 0.22;
        page.rect(bx, cy + 4, bw, 5, { fill: C.line, radius: 2.5 });
        page.rect(bx, cy + 4, Math.max(1.5, bw * Math.min(1, r.pct / 100)), 5, { fill: color(r), radius: 2.5 });
        page.text(`${num(r.value)} / ${r.max ? '<' : ''}${num(r.ref)} ${r.unit}`, cx + colW - 6, cy + 9.5, { size: 7.2, color: C.ink2, align: 'right' });
      });
    },
  }, { gap: 6 });
  for (const n of m.notes || []) noteBox(ctx, n.text, { bg: C.amberSoft, bar: C.amber, size: 8 });
  flow.text(ui('Препоръки за възрастни по EFSA 2017; съставът на храните — по USDA FoodData Central. Растителните напитки и кисели млека са без витамините, добавени от производителя.'), { size: 7, color: C.ink3 });
}

/* ----------------------------------- насоки ----------------------------------- */

function guidance(ctx) {
  const { doc, flow, plan } = ctx;
  // Заглавието не остава само в края на страницата — първата карта след него е висока.
  heading(ctx, 'guide', ui('Как да се храните'), null, { newPage: flow.room < 200 });
  if (plan.pattern) {
    const about = textBlock(doc, plan.pattern.about, flow.width, { size: 8.5, color: C.ink2 });
    flow.add({ h: 18 + about.h, draw: (page, x, y) => { chip(page, doc, plan.pattern.label, x, y, { size: 8, fg: C.green, bg: C.greenSoft }); about.draw(page, x, y + 18); } }, { gap: 8 });
  }
  const dislikes = (plan.input?.dislikes || []).filter(id => FOODS[id]).map(id => (plan.lang === 'en' ? enBaseName(id) : shopName(id)));
  if (dislikes.length) flow.text([{ text: ui('Не яде: '), font: 'semibold', color: C.ink }, { text: dislikes.join(', ') + '.', color: C.ink2 }], { size: 8.5, after: 6 });
  const dx = plan.diagnoses || [];
  if (dx.length) {
    subheading(ctx, ui('Заболявания, взети предвид'));
    for (const c of dx) {
      const codeW = chipWidth(doc, c.code, { size: 7.5 }) + 6;
      const body = textBlock(doc, [{ text: c.name || '', font: 'semibold' },
        { text: c.label ? ` — ${c.effects.join(', ')}${c.src ? ` (${c.src})` : ''}` : ui(' — без специфични хранителни правила; режимът е общ'), color: C.ink2 }], flow.width - codeW, { size: 8.5 });
      flow.add({ h: Math.max(14, body.h), draw: (page, x, y) => { chip(page, doc, c.code, x, y, { size: 7.5, fg: C.brandDark, bg: C.brandSoft }); body.draw(page, x + codeW, y + 1); } }, { gap: 4 });
    }
    flow.space(6);
  }

  if (plan.portions) {
    const cw = (flow.width - 14) / 2;
    const portions = {
      h: plan.portions.length * 26,
      draw: (page, x, y) => plan.portions.forEach((p, i) => {
        const yy = y + i * 26;
        page.circle(x + 11, yy + 10, 10, { fill: C.greenSoft });
        page.text(String(p.count), x + 11, yy + 13.5, { font: 'bold', size: 9.5, color: C.green, align: 'center' });
        page.text(p.group, x + 28, yy + 8.5, { font: 'semibold', size: 8.5, color: C.ink });
        const ln = wrap(doc, p.unit, cw - 28, 6.8)[0];
        if (ln) drawLines(page, [ln], x + 28, yy + 11, 6.8);
      }),
    };
    flow.add(columns([
      card(doc, ui('Порции за деня'), cw, () => portions, { color: C.green, soft: C.greenSoft }),
      card(doc, ui('Седмичен ритъм'), cw, (w) => bullets(doc, plan.weekly || [], w, { color: C.green, size: 8.3 }), { color: C.green, soft: C.greenSoft }),
    ], flow.width), { gap: 10 });
  }
  // Дете: напитките за деня до 5 г. (HER 2019) и седмичният ритъм.
  if (plan.child) {
    const cw = (flow.width - 14) / 2;
    const drinks = plan.child.drinks;
    flow.add(columns([
      drinks ? card(doc, ui('Напитки за деня'), cw, (w) => bullets(doc, [...drinks.map(x => [{ text: `${x.what}: `, font: 'semibold' }, { text: x.amount }]),
        [{ text: ui('Healthy Eating Research 2019 (AAP, AND, AHA, AAPD).'), color: C.ink3 }]], w, { color: C.sky, size: 8.2 }), { color: C.sky, soft: C.skySoft }) : null,
      card(doc, ui('Седмичен ритъм'), drinks ? cw : flow.width, (w) => bullets(doc, plan.weekly || [], w, { color: C.green, size: 8.3 }), { color: C.green, soft: C.greenSoft }),
    ], flow.width), { gap: 10 });
  }
  const three = [[ui('Предпочитайте'), plan.prefer, C.green, C.greenSoft, '✓'], [ui('Ограничете'), plan.limit, C.amber, C.amberSoft, '!'], [ui('Избягвайте'), plan.avoid, C.red, C.redSoft, '✗']];
  listCards(ctx, three);
  if (plan.medNotes?.length) {
    subheading(ctx, ui('Лекарства и храна'), C.sky);
    flow.add(bullets(doc, plan.medNotes.map(n => [{ text: `${n.med}: `, font: 'semibold' }, { text: n.text }]), flow.width, { color: C.sky }), { gap: 6 });
  }
  if (plan.habits) listCards(ctx, [[ui('Навици'), plan.habits, C.brand, C.brandSoft], [ui('Вкус без много сол'), plan.flavor, C.teal, C.tealSoft], [plan.child ? ui('Растеж') : ui('Контрол на теглото'), plan.monitoring, C.sky, C.skySoft]]);
  if (plan.notes?.length) {
    subheading(ctx, ui('Бележки'));
    flow.add(bullets(doc, plan.notes, flow.width, { color: C.brand }), { gap: 6 });
  }
}

/** Карти със списъци в колони; ако не се побират на страница — една под друга. */
function listCards(ctx, groups) {
  const { doc, flow } = ctx;
  const list = groups.filter(g => g[1]?.length);
  if (!list.length) return;
  const gap = 10;
  const cw = (flow.width - gap * (list.length - 1)) / list.length;
  const cards = list.map(([title, items, color, soft, icon]) => card(doc, title, cw, (w) => bullets(doc, items, w, { color, size: 8.2 }), { color, soft, icon }));
  const row = columns(cards, flow.width, gap);
  if (row.h <= flow.limit - flow.top) flow.add(row, { gap: 10 });
  else for (const [title, items, color, soft, icon] of list) flow.add(card(doc, title, flow.width, (w) => bullets(doc, items, w, { color, size: 8.2 }), { color, soft, icon }), { gap: 10 });
}

/* ----------------------------------- цикъл ----------------------------------- */

function cycleBlock(ctx) {
  const { doc, flow, plan } = ctx;
  const c = plan.cycle;
  heading(ctx, 'cycle', ui('Цикъл и хранене'));
  if (!c.applied) { flow.text(c.reason, { color: C.ink2 }); return; }
  const s = c.stats;
  flow.text([{ text: ui(`Последна менструация ${formatDate(s.lastStart)} · цикъл ${s.length} дни · менструация ${s.bleed} дни`)
    + (s.nextStart ? ui(` · следваща около ${formatDate(s.nextStart)}`) : '') + '. ' },
  { text: ui(`В лутеалната фаза +${c.kcalUp} kcal, в останалите дни −${c.kcalDown} kcal — средно за цикъла същата енергия.`), color: C.ink2 }], { size: 8.5 });
  const seen = [...new Set((plan.week || [{ cycle: c.days[0] }]).map(d => d.cycle?.phase).filter(Boolean))];
  const phases = seen.map(ph => {
    const d = (plan.week || []).find(x => x.cycle?.phase === ph)?.cycle || c.days[0];
    return { text: cap(d.label), fg: PHASE[ph][0], bg: PHASE[ph][1] };
  });
  flow.add(chipRow(doc, phases, flow.width), { gap: 8 });
  flow.add(bullets(doc, [...c.evidence, ...c.notes], flow.width, { color: C.rose, size: 8.3 }), { gap: 4 });
  flow.text(c.notIncluded, { size: 7.4, color: C.ink3, after: 8 });
}

/* --------------------------------- тренировки --------------------------------- */

function trainingSection(ctx, tp) {
  const { doc, flow } = ctx;
  const w1 = tp.weeks[1] || tp.weeks[0];
  heading(ctx, 'training', ui('Тренировъчен план за 4 седмици'),
    ui(`${tp.input.daysPerWeek} тренировки седмично по ${tp.input.minutes} мин · ${(TRAINING_LEVELS[tp.input.level] || '').split(' — ')[0]} · цели по СЗО 2020, интензивност по Compendium 2024, силови по ACSM.`),
    { newPage: true });
  for (const w of tp.warnings) noteBox(ctx, [{ text: '! ', font: 'bold', color: C.red }, { text: w }], { bg: C.redSoft, bar: C.red, size: 8.4 });

  // Плочки.
  const tiles = [
    [ui('Аеробни'), w1.aerobic, ui('мин/седм.'), ui(`цел ${tp.targets.aerobic}${tp.targets.aerobic < tp.targets.aerobicMax ? `–${tp.targets.aerobicMax}` : ''} (СЗО)`), C.coral],
    [ui('Силови'), w1.strength, ui('дни/седм.'), ui(`цел поне ${tp.targets.strengthDays}`), C.brand],
    [ui('Разход'), thousands(w1.kcal), ui('kcal/седм.'), ui('над покоя'), C.teal],
    tp.hr ? [ui('Пулс умерено'), `${tp.hr.moderate[0]}–${tp.hr.moderate[1]}`, ui('/мин'), tp.hr.method === 'reserve'
      ? ui(`интензивно ${tp.hr.vigorous[0]}–${tp.hr.vigorous[1]}; пулс в покой ${tp.hr.rest}`)
      : ui(`интензивно ${tp.hr.vigorous[0]}–${tp.hr.vigorous[1]}`), C.rose]
      : [ui('Пулс'), ui('по RPE'), '', ui('бета-блокер: по усещането'), C.rose],
  ];
  if (tp.steps) tiles.push([ui('Крачки'), `${thousands(tp.steps.from)}–${thousands(tp.steps.to)}`, ui('/ден'), ui('Paluch 2022, Ding 2025'), C.sky]);
  if (tp.targets.balanceDays) tiles.push([ui('Баланс'), tp.targets.balanceDays === 7 ? ui('всеки ден') : tp.targets.balanceDays, tp.targets.balanceDays === 7 ? '' : ui('дни/седм.'), ui('СЗО'), C.green]);
  if (tp.targets.pelvicFloor) tiles.push([ui('Тазово дъно'), ui('всеки ден'), '', ui('3 × поне 8 стягания (NICE)'), C.slate]);
  // До 5 плочки на ред; при повече — на два реда.
  const perRow = tiles.length > 5 ? Math.ceil(tiles.length / 2) : tiles.length;
  const tw = (flow.width - 8 * (perRow - 1)) / perRow;
  const rows = Math.ceil(tiles.length / perRow);
  flow.add({
    h: rows * 54 + (rows - 1) * 8,
    draw: (page, x, y0) => tiles.forEach(([label, value, unit, sub, color], i) => {
      const tx = x + (i % perRow) * (tw + 8);
      const y = y0 + Math.floor(i / perRow) * 62;
      page.rect(tx, y, tw, 54, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
      page.rect(tx, y, 4, 54, { fill: color, radius: [8, 0, 0, 8] });
      page.text(label, tx + 12, y + 14, { font: 'semibold', size: 7.4, color: C.ink2 });
      const unitW = unit ? doc.width(unit, 'regular', 7) + 3 : 0;
      const size = doc.width(String(value), 'bold', 14) + unitW > tw - 18 ? 10.5 : 14;
      const vw = page.text(String(value), tx + 12, y + 33, { font: 'bold', size, color });
      page.text(unit, tx + 15 + vw, y + 33, { size: 7, color: C.ink2 });
      const ln = wrap(doc, sub, tw - 18, 6.5)[0];
      if (ln) drawLines(page, [ln], tx + 12, y + 40, 6.5);
    }),
  }, { gap: 12 });

  trainingCharts(ctx, tp);
  trainingCalendar(ctx, tp);

  // Интензивност: легенда в три колони.
  const lw = (flow.width - 2 * 12) / 3;
  const legend = Object.entries(INTENSITY).map(([k, it]) => ({ k, b: textBlock(doc, [{ text: `${cap(ui(it.label))}: `, font: 'semibold', color: INTENSITY_COLOR[k][0] }, { text: ui(`RPE ${it.rpe} от 10, ${it.talk}`) }], lw - 14, { size: 7, color: C.ink2 }) }));
  flow.add({
    h: Math.max(...legend.map(l => l.b.h)),
    draw: (page, x, y) => legend.forEach(({ k, b }, i) => {
      page.rect(x + i * (lw + 12), y + 1.5, 9, 9, { fill: INTENSITY_COLOR[k][0], radius: 2 });
      b.draw(page, x + i * (lw + 12) + 13, y);
    }),
  }, { gap: 10 });

  listCards(ctx, [[ui('Кога да тренирате'), tp.timeAdvice, C.coral, C.coralSoft], [ui('Цикъл и тренировки'), tp.cycle, C.rose, C.roseSoft]]);
  if (tp.steps) noteBox(ctx, tp.steps.text, { bg: C.skySoft, bar: C.sky, size: 8.2 });
  if (tp.notes?.length) listCards(ctx, [[ui('Бележки'), tp.notes, C.brand, C.brandSoft]]);
  exercisesHowTo(ctx, tp);
  trainingDetails(ctx, tp);
}

/* ----------------------------- движение при дете ----------------------------- */

/** Движение, сън и екрани за детето (версия 4.16): целта, сън и екрани, седмицата по дни, съвети. */
function movementSection(ctx, m) {
  const { doc, flow } = ctx;
  heading(ctx, 'training', ui('Движение, сън и екрани'), m.goal.text, { newPage: true });
  listCards(ctx, [
    [ui('Сън'), [ui(`${m.sleep.hours} часа`) + ` — ${m.sleep.note}`], C.brand, C.brandSoft],
    [ui('Екрани'), [m.screens], C.rose, C.roseSoft],
    [ui('Седене'), [m.restraint], C.slate, C.slateSoft],
  ]);
  const per = 4;
  const gap = 8;
  const cw = (flow.width - gap * (per - 1)) / per;
  const dayCard = (d) => card(doc, `${d.label} · ${ui(`${d.minutes} мин`)}`, cw, (w) => {
    const blocks = d.items.map(x => ({ x, b: textBlock(doc, [{ text: x.label }, { text: ui(` · ${x.minutes} мин`), color: C.ink3 }], w - 8, { size: 7.6 }) }));
    return {
      h: blocks.reduce((s, { b }) => s + b.h + 4, 0),
      draw: (page, x, y) => {
        let yy = y;
        for (const { x: it, b } of blocks) {
          page.rect(x, yy, 2.6, b.h, { fill: KIND_COLOR[it.kind] || C.coral });
          b.draw(page, x + 7, yy);
          yy += b.h + 4;
        }
      },
    };
  }, { color: C.coral, soft: C.coralSoft });
  const blank = { h: 0, draw: () => {} };
  for (let i = 0; i < m.days.length; i += per) {
    const row = m.days.slice(i, i + per).map(dayCard);
    while (row.length < per) row.push(blank);
    flow.add(columns(row, flow.width, gap), { gap: 8 });
  }
  const legend = [['play', 'игра'], ['mvpa', 'умерено до интензивно'], ['vigorous', 'интензивно'], ['strength', 'мускули и кости']];
  flow.add({
    h: 10,
    draw: (page, x, y) => {
      let xx = x;
      for (const [k, label] of legend) {
        page.rect(xx, y + 1, 8, 8, { fill: KIND_COLOR[k], radius: 2 });
        xx += 12 + page.text(ui(label), xx + 12, y + 8, { size: 7, color: C.ink2 }) + 12;
      }
    },
  }, { gap: 8 });
  listCards(ctx, [[ui('Съвети'), m.tips, C.green, C.greenSoft]]);
  flow.text(ui('Движение и екрани — по СЗО 2019 (деца под 5 г.) и СЗО 2020 (5–17 г.); сън — по СЗО 2019 и AASM 2016. Седмицата е пример — дейностите се сменят по желание на детето.'), { size: 7.4, color: C.ink3, after: 8 });
}

/** Как се правят упражненията от плана (версия 4.14) — в две колони. */
function exercisesHowTo(ctx, tp) {
  const { doc, flow } = ctx;
  if (!tp.exercises?.length) return;
  subheading(ctx, ui('Как се правят упражненията'), C.coral, { bookmark: true });
  const gap = 12;
  const cw = (flow.width - gap) / 2;
  const items = tp.exercises.map(x => textBlock(doc, [{ text: `${cap(x.name)}: `, font: 'semibold', color: C.ink }, { text: x.how, color: C.ink2 }], cw - 10, { size: 7.6 }));
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const h = Math.max(...pair.map(b => b.h));
    flow.add({
      h,
      draw: (page, x, y) => pair.forEach((b, j) => {
        page.circle(x + j * (cw + gap) + 3, y + 4.5, 2, { fill: C.coral });
        b.draw(page, x + j * (cw + gap) + 10, y);
      }),
    }, { gap: 5 });
  }
  flow.space(6);
}

/** Минутите по седмици (по интензивност) и видовете тренировки. */
function trainingCharts(ctx, tp) {
  const { doc, flow } = ctx;
  const weeks = tp.weeks.map((w, i) => {
    const mins = { light: 0, moderate: 0, vigorous: 0 };
    for (const d of tp.days.filter(x => x.week === i)) for (const s of d.sessions) mins[s.intensity] = (mins[s.intensity] || 0) + s.minutes;
    return { ...w, mins };
  });
  const byAct = new Map();
  for (const d of tp.days) for (const s of d.sessions) byAct.set(s.activity, (byAct.get(s.activity) || 0) + s.minutes);
  const acts = [...byAct].sort((a, b) => b[1] - a[1]);
  const total = acts.reduce((s, [, m]) => s + m, 0) || 1;
  const H = 170;
  const gap = 12;
  const chartW = flow.width * 0.6;
  const donutW = flow.width - chartW - gap;
  flow.add({
    h: H,
    draw: (page, x, y) => {
      // Стълбове по седмици.
      page.rect(x, y, chartW, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 10 });
      page.text(ui('Минути по седмици'), x + 12, y + 17, { font: 'bold', size: 9, color: C.ink });
      const maxV = Math.max(tp.targets.aerobic, ...weeks.map(w => w.mins.light + w.mins.moderate + w.mins.vigorous)) * 1.12;
      const step = maxV > 400 ? 200 : maxV > 200 ? 100 : 50;
      const top = Math.ceil(maxV / step) * step;
      const px = x + 36;
      const pw = chartW - 50;
      const py = y + 30;
      const ph = H - 58;
      const Y = (v) => py + ph - (v / top) * ph;
      for (let v = 0; v <= top; v += step) {
        page.line(px, Y(v), px + pw, Y(v), { color: C.line, width: 0.5 });
        page.text(String(v), px - 5, Y(v) + 2.5, { size: 6.5, color: C.ink3, align: 'right' });
      }
      const bw = Math.min(42, pw / weeks.length - 22);
      weeks.forEach((w, i) => {
        const cx = px + (pw / weeks.length) * (i + 0.5);
        let v0 = 0;
        for (const k of ['light', 'moderate', 'vigorous']) {
          const v = w.mins[k];
          if (!v) continue;
          const top2 = !['vigorous', 'moderate', 'light'].slice(0, ['vigorous', 'moderate', 'light'].indexOf(k)).some(kk => w.mins[kk]);
          page.rect(cx - bw / 2, Y(v0 + v), bw, Y(v0) - Y(v0 + v), { fill: INTENSITY_COLOR[k][0], radius: top2 ? [4, 4, 0, 0] : 0 });
          v0 += v;
        }
        page.text(String(v0), cx, Y(v0) - 4, { font: 'bold', size: 7, color: C.ink, align: 'center' });
        page.text(ui(`Седм. ${w.week}`), cx, py + ph + 12, { size: 7, color: C.ink2, align: 'center' });
        page.text(ui(`силови ${w.strength}`), cx, py + ph + 21, { size: 6.2, color: C.ink3, align: 'center' });
      });
      // Целта на СЗО за аеробна активност.
      const ty = Y(tp.targets.aerobic);
      page.line(px, ty, px + pw, ty, { color: C.brand, width: 1, dash: [3, 2] });
      const goal = ui(`цел по СЗО: ${tp.targets.aerobic} мин аеробни`);
      page.text(goal, x + chartW - 12, y + 17, { font: 'semibold', size: 6.8, color: C.brand, align: 'right' });
      const gx = x + chartW - 16 - doc.width(goal, 'semibold', 6.8);
      page.line(gx - 16, y + 14.5, gx - 2, y + 14.5, { color: C.brand, width: 1, dash: [3, 2] });

      // Видове тренировки.
      const dx = x + chartW + gap;
      page.rect(dx, y, donutW, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 10 });
      page.text(ui('Видове тренировки'), dx + 12, y + 17, { font: 'bold', size: 9, color: C.ink });
      const cx = dx + 46;
      const cy = y + 72;
      let a = 0;
      acts.forEach(([act, m], i) => { page.ring(cx, cy, 30, 18, a, a + (m / total) * 360, { fill: PALETTE[i % PALETTE.length] }); a += (m / total) * 360; });
      page.text(`${thousands(total)}`, cx, cy + 1, { font: 'bold', size: 8, color: C.ink, align: 'center' });
      page.text(ui('мин'), cx, cy + 9, { size: 6, color: C.ink3, align: 'center' });
      acts.slice(0, 6).forEach(([act, m], i) => {
        const ly = y + 116 + (i % 3) * 14;
        const lx = dx + 12 + Math.floor(i / 3) * ((donutW - 20) / 2);
        page.rect(lx, ly - 6.5, 8, 8, { fill: PALETTE[i % PALETTE.length], radius: 2 });
        page.text(`${cap(ui(ACT_SHORT[act] || act))} ${Math.round((m / total) * 100)}%`, lx + 11, ly, { size: 7, color: C.ink });
      });
    },
  }, { gap: 12 });
}

/** Календар: 4 седмици × 7 дни с цветни етикети по интензивност. */
function trainingCalendar(ctx, tp) {
  const { doc, flow } = ctx;
  subheading(ctx, ui('Календар на тренировките'), C.coral);
  const gap = 4;
  const cw = (flow.width - gap * 6) / 7;
  const chipH = 13;
  tp.weeks.forEach((w, wi) => {
    const days = tp.days.filter(d => d.week === wi);
    // Упражненията за тазовото дъно са всеки ден — те са в плочките, не в календара.
    const extras = (d) => d.addOns.filter(a => a.kind !== 'pelvic');
    const rows = Math.max(1, ...days.map(d => d.sessions.length + (extras(d).length ? 1 : 0)));
    const H = 20 + rows * (chipH + 3) + 6;
    flow.add({
      h: H,
      draw: (page, x, y) => days.forEach((d, col) => {
        const cx = x + col * (cw + gap);
        const rest = !d.sessions.length && !extras(d).length;
        page.rect(cx, y, cw, H, { fill: rest ? C.bg : C.white, stroke: C.line, lineWidth: 0.6, radius: 6 });
        if (d.cycle) page.rect(cx, y + H - 3, cw, 3, { fill: PHASE[d.cycle.phase][0], radius: [0, 0, 6, 6] });
        page.text(`${d.label.slice(0, ctx.plan.lang === 'en' ? 3 : 2)} ${formatDate(d.date).slice(0, 5)}`, cx + 5, y + 11, { font: 'semibold', size: 6.6, color: C.ink2 });
        let yy = y + 16;
        if (rest) page.text(ui('почивка'), cx + cw / 2, y + H / 2 + 6, { size: 6.6, color: C.ink3, align: 'center' });
        for (const s of d.sessions) {
          const [fg, bg] = INTENSITY_COLOR[s.intensity] || INTENSITY_COLOR.moderate;
          page.rect(cx + 3, yy, cw - 6, chipH, { fill: bg, radius: 4 });
          page.rect(cx + 3, yy, 3, chipH, { fill: fg, radius: [4, 0, 0, 4] });
          const label = `${ui(ACT_SHORT[s.activity] || s.activity)} ${s.minutes}′`;
          const ln = wrap(doc, label, cw - 14, 6.5, { font: 'semibold', color: fg })[0];
          if (ln) drawLines(page, [ln], cx + 9, yy + 2.2, 6.5);
          yy += chipH + 3;
        }
        if (extras(d).length) {
          const label = extras(d).map(a => ui(a.kind === 'balance' ? 'баланс' : a.kind === 'strength' ? 'сила' : 'добавка')).join(', ');
          page.text(`+ ${label}`, cx + 6, yy + 9, { size: 6.2, color: C.ink2 });
        }
      }),
    }, { gap: 5 });
  });
  flow.space(6);
}

/** Подробно по дни: загрявка, основна част, разпускане. */
function trainingDetails(ctx, tp) {
  const { doc, flow } = ctx;
  tp.weeks.forEach((w, wi) => {
    subheading(ctx, ui(`Седмица ${w.week}`) + ` · ${fd(w.from)} – ${fd(w.to)}`, C.coral, { bookmark: false });
    flow.text(ui(`аеробни ${w.aerobic} мин · силови ${w.strength} · общо ${w.minutes} мин · ≈${thousands(w.kcal)} kcal над покоя`), { size: 7.8, color: C.ink2, after: 6 });
    for (const d of tp.days.filter(x => x.week === wi)) {
      if (!d.sessions.length && !d.addOns.length) continue;
      const blocks = [];
      for (const s of d.sessions) {
        const it = INTENSITY[s.intensity];
        blocks.push(textBlock(doc, [{ text: `${cap(s.label)} · ` + ui(`${s.minutes} мин`) + ` · ${ui(it?.label || '')}`, font: 'semibold', color: (INTENSITY_COLOR[s.intensity] || INTENSITY_COLOR.moderate)[0] },
          { text: `${s.time ? ` · ${s.time}` : ''}${s.long ? ui(' · дълга') : ''}${s.extra ? ui(' · ежедневно движение') : ''}`, color: C.ink2 }], flow.width - 120, { size: 8.2 }));
        for (const b of s.blocks) blocks.push(textBlock(doc, [{ text: `${b.name}: `, font: 'semibold' }, { text: b.text, color: C.ink }], flow.width - 120, { size: 7.8 }));
      }
      for (const a of d.addOns) blocks.push(textBlock(doc, [{ text: '+ ', font: 'bold', color: C.brand }, { text: a.text }], flow.width - 120, { size: 7.8, color: C.ink2 }));
      if (d.cycle) blocks.push(textBlock(doc, d.cycle.text, flow.width - 120, { size: 7.4, color: PHASE[d.cycle.phase][0] }));
      const h = blocks.reduce((s, b) => s + b.h + 2, 0) + 10;
      flow.add({
        h,
        draw: (page, x, y) => {
          page.rect(x, y, flow.width, h, { fill: C.white, stroke: C.line, lineWidth: 0.5, radius: 6 });
          const main = d.sessions[0]?.intensity || 'light';
          page.rect(x, y, 4, h, { fill: (INTENSITY_COLOR[main] || INTENSITY_COLOR.light)[0], radius: [6, 0, 0, 6] });
          page.text(d.label, x + 12, y + 14, { font: 'bold', size: 8.6, color: C.ink });
          page.text(fd(d.date), x + 12, y + 25, { size: 7.2, color: C.ink3 });
          if (d.cycle) chip(page, doc, ui(`ден ${d.cycle.day}`), x + 12, y + 30, { size: 6.4, fg: PHASE[d.cycle.phase][0], bg: PHASE[d.cycle.phase][1], padX: 4 });
          let yy = y + 6;
          for (const b of blocks) { b.draw(page, x + 108, yy); yy += b.h + 2; }
        },
      }, { gap: 5 });
    }
    flow.space(6);
  });
}

/* ------------------------------------ меню ------------------------------------ */

function menu(ctx) {
  const { flow, plan } = ctx;
  if (!plan.week) {
    heading(ctx, 'menu', ui('Примерно меню за деня'), ui(`Около ${plan.day.kcal} kcal, белтък ${plan.day.protein} г, фибри ${plan.day.fiber} г — изберете по един вариант за всяко хранене.`), { newPage: true });
    for (const m of plan.meals) {
      subheading(ctx, `${m.label}${m.time ? ` · ${m.time}` : ''} · ≈${m.kcal} kcal`, MEAL_COLOR[m.meal] || C.brand);
      m.options.forEach((o, i) => recipe(ctx, o, { meal: m.meal, label: ui(`вариант ${i + 1}`) }));
    }
    if (plan.shopping) shopping(ctx, plan.shopping, ui('Списък за пазаруване'), true);
    return;
  }
  const month = plan.week.length > 7;
  const weeks = month ? weekChunks(plan.week) : [plan.week];
  heading(ctx, 'menu', month ? ui('Меню за месеца') : ui('Меню за седмицата'),
    ui('Обядите и вечерите не се повтарят в седмицата; риба поне 2 пъти, бобови поне 3 пъти, червено месо до 2 пъти. Порциите са пресметнати за дневната енергия.'),
    { newPage: true });
  weeks.forEach((days, w) => {
    if (month) {
      flow.section = ui(`Меню · седмица ${w + 1}`);
      if (w) flow.newPage();
      subheading(ctx, ui(`Седмица ${w + 1}`) + ` · ${fd(days[0].date)} – ${fd(days[days.length - 1].date)}`, C.teal, { bookmark: true });
    }
    overview(ctx, days);
    for (const d of days) dayCard(ctx, d);
    const sh = month ? plan.shoppingWeeks?.[w] : plan.shopping;
    if (sh) shopping(ctx, { week: w + 1, ...sh }, month ? ui(`Пазаруване за седмица ${w + 1}`) : ui('Списък за пазаруване'), true);
  });
}

/** Седмицата накратко: таблица дни × хранения. */
function overview(ctx, days) {
  const { doc, flow } = ctx;
  const meals = days[0].meals;
  const dayW = 74;
  const kcalW = 40;
  const mw = (flow.width - dayW - kcalW) / meals.length;
  const size = 6.8;
  const rows = days.map(d => ({ d, cells: d.meals.map(m => wrap(doc, m.option?.name || '—', mw - 8, size)) }));
  const rowH = (r) => Math.max(24, Math.max(...r.cells.map(c => c.length)) * size * 1.3 + 9);
  // Имената на храненията — на два реда, ако не се побират в колоната („Междинно хранене“).
  const heads = meals.map(m => wrap(doc, m.label, mw - 18, 7.4, { font: 'bold', color: C.ink }));
  const headH = Math.max(1, ...heads.map(l => l.length)) > 1 ? 26 : 18;
  const H = headH + rows.reduce((s, r) => s + rowH(r), 0);
  flow.need(Math.min(H, flow.limit - flow.top));
  flow.add({
    h: H,
    draw: (page, x, y) => {
      page.rect(x, y, flow.width, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
      page.rect(x, y, flow.width, headH, { fill: C.tealSoft, radius: [8, 8, 0, 0] });
      page.text(ui('Ден'), x + 8, y + 12, { font: 'bold', size: 7.4, color: C.teal });
      meals.forEach((m, i) => {
        const mx = x + dayW + i * mw;
        page.circle(mx + 8, y + 9, 3, { fill: MEAL_COLOR[m.meal] || C.brand });
        drawLines(page, heads[i], mx + 14, y + 4.6, 7.4, { lh: 1.15 });
      });
      page.text('kcal', x + flow.width - 8, y + 12, { font: 'bold', size: 7.4, color: C.teal, align: 'right' });
      let yy = y + headH;
      rows.forEach((r, i) => {
        const h = rowH(r);
        if (i % 2) page.rect(x + 1, yy, flow.width - 2, h, { fill: C.bg });
        page.text(r.d.label, x + 8, yy + 11, { font: 'semibold', size: 7.6, color: C.ink });
        page.text(formatDate(r.d.date).slice(0, 5), x + 8, yy + 20, { size: 6.6, color: C.ink3 });
        let mx = x + 34;
        if (r.d.cycle) { page.circle(mx + 3, yy + 17.7, 3, { fill: PHASE[r.d.cycle.phase][0] }); mx += 10; }
        if (r.d.training?.sessions.length) page.poly([[mx, yy + 20.5], [mx + 3.2, yy + 14.5], [mx + 6.4, yy + 20.5]], { fill: C.coral });
        r.cells.forEach((lines, ci) => drawLines(page, lines, x + dayW + ci * mw + 4, yy + 4, size, { lh: 1.3 }));
        page.text(thousands(r.d.totals.kcal), x + flow.width - 8, yy + 11, { font: 'semibold', size: 7.6, color: C.ink, align: 'right' });
        yy += h;
      });
    },
  }, { gap: 6 });
  const legend = [];
  if (days.some(d => d.cycle)) legend.push(ui('● фаза на цикъла'));
  if (days.some(d => d.training?.sessions.length)) legend.push(ui('▲ тренировъчен ден'));
  if (legend.length) flow.text(legend.join('   '), { size: 6.8, color: C.ink3, after: 6 });
}

function dayCard(ctx, d) {
  const { doc, flow } = ctx;
  const chips = [];
  if (d.cycle) {
    chips.push({ text: ui(`ден ${d.cycle.day} от цикъла · ${d.cycle.label}`) + (d.cycle.kcalAdd ? ` · ${d.cycle.kcalAdd > 0 ? '+' : '−'}${Math.abs(d.cycle.kcalAdd)} kcal` : ''), fg: PHASE[d.cycle.phase][0], bg: C.white });
  }
  for (const s of d.training?.sessions || []) chips.push({ text: `${cap(ui(ACT_SHORT[s.activity] || s.activity))} ` + ui(`${s.minutes} мин`) + ` · ${ui(INTENSITY[s.intensity]?.label || '')}`, fg: C.coral, bg: C.white });
  const row = chips.length ? chipRow(doc, chips, flow.width - 24, { size: 7 }) : null;
  const H = 30 + (row ? row.h + 7 : 0);
  const head = {
    h: H,
    draw: (page, x, y) => {
      page.gradient(x, y, flow.width, H, C.tealSoft, C.brandSoft, { radius: 8 });
      page.text(d.label, x + 12, y + 19, { font: 'bold', size: 11, color: C.ink });
      const cx = x + 14 + doc.width(d.label, 'bold', 11);
      page.text(fd(d.date), cx + 4, y + 19, { size: 8.5, color: C.ink2 });
      const t = d.totals;
      page.text(ui(`${thousands(t.kcal)} kcal · Б ${t.protein} г · фибри ${t.fiber} г`) + (t.fe !== undefined ? ui(` · желязо ${Math.round(t.fe)} мг · калций ${Math.round(t.ca / 10) * 10} мг`) : ''),
        x + flow.width - 12, y + 19, { font: 'semibold', size: 7.6, color: C.teal, align: 'right' });
      if (row) row.draw(page, x + 12, y + 28);
    },
  };
  const tips = d.training?.tips?.length ? textBlock(doc, [{ text: ui('Около тренировката: '), font: 'semibold', color: C.coral }, { text: d.training.tips.join(' ') }], flow.width - 20, { size: 7.8, color: C.ink2 }) : null;
  const first = d.meals[0]?.option ? recipeBlock(ctx, d.meals[0].option, d.meals[0]) : null;
  flow.need(head.h + (tips ? tips.h + 6 : 0) + (first ? first.h : 0) + 8);
  flow.add(head, { gap: 6 });
  if (tips) flow.add(tips, { gap: 4, x: flow.x + 10 });
  for (const m of d.meals) recipe(ctx, m.option, { meal: m.meal, label: m.label, time: m.time, kcal: m.kcal });
  flow.space(8);
}

/** Блок рецепта: етикет на храненето отляво, ястието, съставки, приготвяне, стойности и източник. */
function recipeBlock(ctx, o, { meal, label, time, kcal } = {}) {
  const { doc, flow } = ctx;
  const leftW = 74;
  const w = flow.width - leftW - 8;
  if (!o) return textBlock(doc, ui('Няма подходящо ястие при избраните ограничения.'), w, { size: 8, color: C.ink3 });
  const parts = [
    textBlock(doc, [{ text: o.name, font: 'bold' }, { text: o.time ? '  ' + ui(`${o.time} мин`) : '', color: C.ink3 }], w, { size: 9.2 }),
    textBlock(doc, o.items.map(x => x.text.replace(/^\+ /, '+ ')).join(' · '), w, { size: 7.9, color: C.ink2 }),
  ];
  if (o.method) parts.push(textBlock(doc, [{ text: o.method }, ...(o.flavor?.length ? [{ text: ui(` За вкус: ${o.flavor.join(', ')}.`), color: C.ink2 }] : [])], w, { size: 7.8 }));
  parts.push(textBlock(doc, [{ text: ui(`${o.kcal} kcal · Б ${o.protein} г · В ${o.carbs} г · М ${o.fat} г · фибри ${o.fiber} г`), font: 'semibold', color: C.teal }], w, { size: 7.2 }));
  if (o.source?.length) {
    parts.push(textBlock(doc, [{ text: ui('Източник: '), color: C.ink3 }, ...o.source.flatMap((s, i) => [
      ...(i ? [{ text: '; ', color: C.ink3 }] : []),
      { text: ui(`${s.org}, „${s.title}“`), color: C.sky, url: s.url },
      { text: s.page && !s.url.includes('healthy-eating-recipes') ? ui(`, стр. ${s.page}`) : '', color: C.ink3 },
    ])], w, { size: 7 }));
  }
  const h = parts.reduce((s, p) => s + p.h + 2.5, 0) + 8;
  const color = MEAL_COLOR[meal] || C.brand;
  return {
    h,
    draw: (page, x, y) => {
      page.line(x, y, x + flow.width, y, { color: C.line, width: 0.5 });
      if (label) {
        const lines = wrap(doc, label, leftW - 16, 7.2, { font: 'bold', color: C.white });
        const lw = Math.max(...lines.map(l => l.w)) + 12;
        const lh = lines.length * 9.4 + 5;
        page.rect(x, y + 7, lw, lh, { fill: color, radius: Math.min(7, lh / 2) });
        drawLines(page, lines, x + 6, y + 8.3, 7.2, { lh: 1.3 });
        const sub = [time, kcal ? `≈${kcal} kcal` : ''].filter(Boolean).join(' · ');
        if (sub) page.text(sub, x + 2, y + lh + 18, { size: 6.6, color: C.ink3 });
      }
      let yy = y + 6;
      for (const p of parts) { p.draw(page, x + leftW + 8, yy); yy += p.h + 2.5; }
    },
  };
}

function recipe(ctx, o, opts) {
  ctx.flow.add(recipeBlock(ctx, o, opts), { gap: 2 });
}

/* --------------------------------- пазаруване --------------------------------- */

function shoppingWeeks(plan) {
  if (plan.shoppingWeeks?.length) return plan.shoppingWeeks;
  if (plan.shopping && plan.week) return [{ week: 1, from: plan.week[0].date, to: plan.week[plan.week.length - 1].date, ...plan.shopping }];
  return plan.shopping ? [{ week: 1, ...plan.shopping }] : [];
}

function shopping(ctx, sh, titleText, newPage = false) {
  const { doc, flow } = ctx;
  heading(ctx, 'shop', titleText, sh.from ? `${fd(sh.from)} – ${fd(sh.to)} · ` + ui(`${sh.groups.reduce((n, g) => n + g.items.length, 0)} продукта. Количествата са за всички дни от менюто.`) : null, { newPage, level: 1 });
  const gap = 12;
  const cols = 3;
  const cw = (flow.width - gap * (cols - 1)) / cols;
  const size = 7.8;
  // Името се пренася преди количеството: „220 г (сурово тегло)“ е по-широко от „1 бр.“.
  const nameW = (it) => Math.min(cw - 58, cw - 26 - doc.width(it.amount, 'semibold', size - 0.4));
  const itemH = (it) => Math.max(1, wrap(doc, it.name, nameW(it), size).length) * size * 1.32 + 3.2;
  const groupH = (g) => 22 + g.items.reduce((s, it) => s + itemH(it), 0) + 6;
  const drawGroup = (page, g, x, y) => {
    const color = SHOP_COLOR[g.cat] || C.slate;
    page.rect(x, y, cw, 17, { fill: color, radius: 5, opacity: 0.12 });
    page.rect(x, y, 4, 17, { fill: color, radius: [5, 0, 0, 5] });
    page.text(g.label, x + 10, y + 11.8, { font: 'bold', size: 8, color });
    page.text(String(g.items.length), x + cw - 7, y + 11.8, { font: 'semibold', size: 7, color, align: 'right' });
    let yy = y + 22;
    for (const it of g.items) {
      checkbox(page, x + 2, yy + 1.2, 7, C.ink3);
      const lines = wrap(doc, it.name, nameW(it), size);
      drawLines(page, lines, x + 14, yy - 0.8, size, { lh: 1.32 });
      page.text(it.amount, x + cw - 2, yy + size * 0.95, { font: 'semibold', size: size - 0.4, color: C.ink2, align: 'right' });
      yy += itemH(it);
    }
  };
  // Групите се разпределят в три колони; ако не стигнат на страницата — продължават на следващата.
  let pending = [...sh.groups];
  while (pending.length) {
    const room = flow.limit - flow.y;
    const colY = [0, 0, 0];
    const place = [];
    const rest = [];
    for (const g of pending) {
      const h = groupH(g);
      const c = colY.indexOf(Math.min(...colY));
      if (colY[c] + h <= room || (!place.length && !rest.length)) { place.push([g, c, colY[c]]); colY[c] += h + 6; } else rest.push(g);
    }
    if (!place.length) { flow.newPage(); continue; }
    const y0 = flow.y;
    for (const [g, c, dy] of place) drawGroup(flow.page, g, flow.x + c * (cw + gap), y0 + dy);
    flow.y = y0 + Math.max(...colY);
    pending = rest;
    if (pending.length) flow.newPage();
  }
  if (sh.spices?.length) flow.text([{ text: ui('Подправки и билки: '), font: 'semibold' }, { text: sh.spices.join(', '), color: C.ink2 }], { size: 8, after: 8 });
}

/* ---------------------------------- източници ---------------------------------- */

function sources(ctx) {
  const { doc, flow, plan, doctor, date } = ctx;
  const options = plan.week ? plan.week.flatMap(d => d.meals.map(m => m.option)) : plan.meals.flatMap(m => m.options);
  const seen = new Map();
  for (const o of options.filter(Boolean)) for (const s of o.source || []) {
    const key = `${s.url}|${s.title}|${s.page || ''}`;
    if (!seen.has(key)) seen.set(key, s);
  }
  heading(ctx, 'sources', ui('Източници и бележки'), null, { newPage: flow.room < 220 });
  if (seen.size) {
    subheading(ctx, ui(`Рецепти с публикуван източник (${seen.size})`), C.slate);
    const byBook = new Map();
    for (const s of seen.values()) {
      const k = s.book || 'nhlbi.nih.gov — Healthy Eating Recipes';
      if (!byBook.has(k)) byBook.set(k, []);
      byBook.get(k).push(s);
    }
    for (const [book, list] of byBook) {
      flow.text([{ text: book, font: 'semibold', color: C.ink }], { size: 8, after: 2 });
      flow.add(bullets(doc, list.sort((a, b) => (a.title < b.title ? -1 : 1)).map(s => [
        { text: s.title, color: C.sky, url: s.url },
        { text: s.page && !s.url.includes('healthy-eating-recipes') ? ui(`, стр. ${s.page}`) : '', color: C.ink3 },
      ]), flow.width, { size: 7.6, color: C.slate, gap: 1.5 }), { gap: 6 });
    }
  }
  flow.text((plan.child
    ? ui('Енергия по EFSA 2013 (покой по Henry 2005 × PAL); белтък, фибри, вода, витамини и минерали — по EFSA; натрий — EFSA 2019; захари — ESPGHAN 2017; напитки до 5 г. — HER 2019; ИТМ за възрастта — СЗО; задавяне — AAP 2010; движение — СЗО 2019 и 2020; сън — AASM 2016. ')
    : ui('Енергия по Mifflin–St Jeor с коефициент за активност; препоръки по EFSA, СЗО, NICE NG246, ESPEN, ACSM, ESC, ADA 2026, KDIGO 2024; правилата по диагнози — по насоката, посочена до всяка. '))
    + (plan.cycle?.applied ? ui('Фазите на цикъла — по FIGO 2018 и ASRM 2024. ') : '')
    + (plan.projection?.curve ? ui('Прогнозата за теглото — по Hall 2011. ') : '')
    + (plan.training ? ui('Тренировките — по СЗО 2020, 2024 Adult Compendium of Physical Activities и ACSM; крачките — по Paluch 2022 и Ding 2025. ') : '')
    + ui('Рецептите с източник са на NHLBI (National Heart, Lung, and Blood Institute, NIH) — обществено достояние; съставките са пренесени за порция и порциите са пресметнати по каталога на програмата.'),
  { size: 7.6, color: C.ink2, after: 6 });
  noteBox(ctx, plan.child
    ? ui('Режимът е съставен от лекаря по възрастта, теглото, ръста и заболяванията на детето към датата на изготвяне. Той е ориентировъчен — при хронично заболяване, изоставане в растежа или хранително разстройство са нужни педиатър и диетолог.')
    : ui('Режимът е съставен от лекаря въз основа на заболяванията, теглото и лекарствата към датата на изготвяне. Той е ориентировъчен — при напреднало хронично бъбречно заболяване, диализа, бременност или хранителни разстройства е нужен диетолог.'),
    { bg: C.amberSoft, bar: C.amber, size: 8 });
  flow.need(50);
  flow.space(24);
  const { page } = flow;
  page.line(flow.x, flow.y, flow.x + 190, flow.y, { color: C.ink3, width: 0.6 });
  page.line(flow.x + flow.width - 150, flow.y, flow.x + flow.width, flow.y, { color: C.ink3, width: 0.6 });
  page.text(ui('Лекар: ') + (doctor?.name || ''), flow.x, flow.y + 11, { size: 8, color: C.ink2 });
  page.text(ui('Дата: ') + fd(date), flow.x + flow.width - 150, flow.y + 11, { size: 8, color: C.ink2 });
  flow.y += 18;
}

/* ----------------------------------- колонтитул ----------------------------------- */

function footers(ctx) {
  const { doc, practice } = ctx;
  const n = doc.pages.length;
  doc.pages.forEach((page, i) => {
    const y = page.h - 30;
    page.line(40, y - 10, page.w - 40, y - 10, { color: C.line, width: 0.5 });
    page.text(`DocUp${practice.name ? ` · ${practice.name}` : ''}`, 40, y, { size: 7, color: C.ink3 });
    page.text(ui(`стр. ${i + 1} от ${n}`), page.w - 40, y, { font: 'semibold', size: 7, color: C.ink2, align: 'right' });
  });
}
