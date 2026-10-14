/* Цветен PDF за родителя: хранене на кърмачето до 1 година — какво сега, примерен ден,
 * очакван растеж (графики по стандартите на СЗО), план по месеци, кога се въвежда всяка храна
 * и правилата с източниците. */

import { PDFDocument } from './pdf.js';
import { C, Flow, bullets, chip, chipWidth, drawLines, textBlock, wrap } from './kit.js';
import { formatAge, formatDate, today } from '../dates.js';
import { FEEDING_TYPES, PLAN_MONTHS, SOLIDS_START, feedingFlags, monthDate } from '../infant-feeding.js';

const dec = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace('.', ','));
const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const STAGE = (m) => (!m.solids ? [C.sky, C.skySoft, 'само мляко'] : m.firstSolidMonth ? [C.green, C.greenSoft, 'начало на захранването']
  : m.snacks ? [C.coral, C.coralSoft, 'храни за ядене с пръсти'] : m.month < 6 ? [C.green, C.greenSoft, 'две хранения с храна'] : [C.amber, C.amberSoft, 'три хранения с храна']);
const COLOR = { green: C.green, amber: '#c98a12', sky: C.sky, coral: C.coral, rose: C.rose, teal: C.teal, brand: C.brand };

/**
 * PDF (Uint8Array). plan — от infantFeedingPlan; person — { name, birthDate, sex, birth, measurements };
 * practice — { name, phone }; doctor — { name }; fonts — { regular, semibold, bold, symbols }.
 */
export async function infantReport({ plan, person = {}, practice = {}, doctor = null, fonts, version = '', date = today() }) {
  const title = 'Хранене до 1 година';
  const doc = new PDFDocument({
    title: `${title} — ${person.name || ''}`.trim(), author: doctor?.name || practice.name || 'DocUp', subject: 'План за хранене на кърмачето',
    creator: 'DocUp', producer: `DocUp ${version}`.trim(), lang: 'bg-BG',
  });
  doc.addFont('symbols', fonts.symbols).setFallback('symbols');
  doc.addFont('regular', fonts.regular).addFont('semibold', fonts.semibold).addFont('bold', fonts.bold);
  const flow = new Flow(doc, {
    header: (page, section) => {
      page.gradient(0, 0, page.w, 5, C.teal, C.sky);
      page.text(`${title} · ${person.name || ''}`, 40, 30, { size: 7.5, color: C.ink3 });
      if (section) page.text(section, page.w - 40, 30, { font: 'semibold', size: 7.5, color: C.teal, align: 'right' });
      page.line(40, 38, page.w - 40, 38, { color: C.line, width: 0.5 });
    },
  });
  const ctx = { doc, flow, plan, person, practice, doctor, date };
  flow.newPage({ first: true });
  cover(ctx);
  nowSection(ctx);
  growthSection(ctx);
  monthsSection(ctx);
  foodsSection(ctx);
  rulesSection(ctx);
  footers(ctx);
  return doc.bytes();
}

/* ----------------------------------- общи ----------------------------------- */

function heading(ctx, text, sub, { color = C.teal, icon = '●', newPage = false } = {}) {
  const { flow, doc } = ctx;
  flow.section = text;
  if (newPage && flow.y > flow.top + 1) flow.newPage();
  const subBlock = sub ? textBlock(doc, sub, flow.width - 34, { size: 8.4, color: C.ink2 }) : null;
  flow.need(34 + (subBlock ? subBlock.h : 0) + 60);
  const { page } = flow;
  const y = flow.y;
  page.rect(flow.x, y, 24, 24, { fill: color, radius: 6 });
  page.text(icon, flow.x + 12, y + 16.5, { font: 'bold', size: 11, color: C.white, align: 'center' });
  page.text(text, flow.x + 34, y + 17, { font: 'bold', size: 15, color: C.ink });
  doc.bookmark(text, page, y - 6);
  flow.y += 30;
  if (subBlock) { subBlock.draw(page, flow.x + 34, flow.y - 4); flow.y += subBlock.h; }
  flow.y += 6;
}

function noteBox(ctx, runs, { bg = C.tealSoft, bar = C.teal, size = 8.6 } = {}) {
  const { doc, flow } = ctx;
  const inner = textBlock(doc, runs, flow.width - 26, { size });
  flow.add({
    h: inner.h + 14,
    draw: (page, x, y) => {
      page.rect(x, y, flow.width, inner.h + 14, { fill: bg, radius: 7 });
      page.rect(x, y, 4, inner.h + 14, { fill: bar, radius: [7, 0, 0, 7] });
      inner.draw(page, x + 16, y + 7);
    },
  }, { gap: 6 });
}

function tiles(ctx, list, h = 56) {
  const { doc, flow } = ctx;
  const items = list.filter(Boolean);
  const cols = Math.min(items.length, 3);
  const tw = (flow.width - 8 * (cols - 1)) / cols;
  const rows = Math.ceil(items.length / cols);
  flow.add({
    h: rows * h + (rows - 1) * 8,
    draw: (page, x, y) => items.forEach(([label, value, unit, sub, color], i) => {
      const tx = x + (i % cols) * (tw + 8);
      const ty = y + Math.floor(i / cols) * (h + 8);
      page.rect(tx, ty, tw, h, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
      page.rect(tx, ty, 4, h, { fill: color, radius: [8, 0, 0, 8] });
      page.text(label, tx + 12, ty + 14, { font: 'semibold', size: 7.6, color: C.ink2 });
      const vw = page.text(String(value), tx + 12, ty + 34, { font: 'bold', size: 15, color });
      if (unit) page.text(unit, tx + 15 + vw, ty + 34, { size: 7.8, color: C.ink2 });
      const ln = wrap(doc, sub || '', tw - 18, 6.8)[0];
      if (ln) drawLines(page, [ln], tx + 12, ty + h - 15, 6.8);
    }),
  }, { gap: 10 });
}

/** Примерен ден — времева линия с цветни точки (мляко / храна / закуска). */
function dayBlock(ctx, day, width, { size = 8.2 } = {}) {
  const { doc } = ctx;
  const rows = day.items.map(it => ({ it, b: textBlock(doc, it.what, width - 70, { size }) }));
  const head = textBlock(doc, [{ text: 'Примерен ден: ', font: 'semibold', color: C.teal }, { text: day.orientation, color: C.ink2 }], width, { size: 7.6 });
  const h = head.h + 6 + rows.reduce((s, r) => s + Math.max(16, r.b.h + 5), 0);
  return {
    h,
    draw: (page, x, y) => {
      head.draw(page, x, y);
      let yy = y + head.h + 6;
      const lineX = x + 44;
      page.line(lineX, yy + 4, lineX, y + h - 6, { color: C.line, width: 1.2 });
      for (const { it, b } of rows) {
        const food = /пюре|каша|попара|супа|закуска|храни за ядене/i.test(it.what);
        const snack = /закуска/i.test(it.what);
        const color = snack ? C.coral : food ? C.green : C.sky;
        page.text(it.time, x + 34, yy + 8.5, { font: 'bold', size: 8, color: C.ink, align: 'right' });
        page.circle(lineX, yy + 5.5, 3.6, { fill: color });
        b.draw(page, x + 56, yy - 1);
        yy += Math.max(16, b.h + 5);
      }
    },
  };
}

/* ----------------------------------- корица ----------------------------------- */

function cover(ctx) {
  const { flow, plan, person, practice, doctor, date } = ctx;
  const { page } = flow;
  const H = 158;
  page.gradient(0, 0, page.w, H, C.teal, C.sky);
  page.circle(page.w - 70, 18, 86, { fill: C.white, opacity: 0.08 });
  page.circle(page.w - 200, H - 4, 42, { fill: C.white, opacity: 0.07 });
  page.text('ЛИЧЕН ПЛАН · ХРАНЕНЕ НА КЪРМАЧЕТО', 40, 40, { font: 'semibold', size: 7.5, color: C.white, opacity: 0.88, spacing: 1.1 });
  page.text('Хранене до 1 година', 40, 76, { font: 'bold', size: 27, color: C.white });
  page.text(person.name || '', 40, 104, { font: 'semibold', size: 14, color: C.white });
  const facts = [person.birthDate ? `роден(а) ${formatDate(person.birthDate)}` : '', person.birthDate ? formatAge(person.birthDate, date) : '',
    plan.input.birthWeight ? `тегло при раждане ${dec(plan.input.birthWeight, 2)} кг` : '', plan.input.gestWeeks ? `${plan.input.gestWeeks} г.с.` : ''].filter(Boolean);
  page.text(facts.join('  ·  '), 40, 124, { size: 9, color: C.white, opacity: 0.93 });
  page.text(`${FEEDING_TYPES[plan.input.feeding].label} · захранване ${SOLIDS_START[plan.input.solidsStart]} · изготвен ${formatDate(date)}`, 40, 142, { size: 8.5, color: C.white, opacity: 0.88 });
  let ry = 40;
  for (const [text, font, size] of [[practice.name, 'semibold', 9], [doctor?.name, 'regular', 8.5], [practice.phone ? `тел. ${practice.phone}` : '', 'regular', 8]]) {
    if (!text) continue;
    page.text(text, page.w - 40, ry, { font, size, color: C.white, align: 'right', opacity: 0.95 });
    ry += size + 5;
  }
  flow.y = H + 18;
}

/* ------------------------------------ сега ------------------------------------ */

function nowSection(ctx) {
  const { flow, plan } = ctx;
  const cur = plan.months[plan.age.currentMonth];
  const next = plan.months[Math.min(PLAN_MONTHS - 1, plan.age.currentMonth + 1)];
  const breast = plan.input.feeding === 'breast';
  for (const w of plan.warnings) noteBox(ctx, [{ text: '! ', font: 'bold', color: C.red }, { text: w }], { bg: C.redSoft, bar: C.red });
  for (const f of feedingFlags(plan)) noteBox(ctx, f.text, f.level === 'warn' ? { bg: C.redSoft, bar: C.red } : { bg: C.amberSoft, bar: C.amber });
  for (const n of plan.notes) noteBox(ctx, n, { bg: C.skySoft, bar: C.sky });
  heading(ctx, plan.now.done ? 'Първата година' : `Сега: ${cur.label}`,
    plan.age.corrected ? `Коригирана възраст ${dec(plan.age.months)} месеца — планът и растежът са по нея.` : null, { icon: '◎' });
  const fw = plan.now.firstWeek;
  const g = plan.growth;
  tiles(ctx, [
    fw ? ['Хранения на ден', fw.feedsText, '', `през ${fw.every} (НЦОЗА)`, C.teal] : ['Хранения на ден', cur.feeds, '', cur.solids ? 'с храна и мляко' : 'само мляко', C.teal],
    breast ? ['Кърмене', 'при поискване', '', cur.month < 2 ? 'поне 8 пъти на 24 ч. (СЗО)' : 'обикновено поне 5–6 пъти', C.sky]
      : fw ? ['Мляко на хранене', `≈${fw.perFeed}`, 'мл', `ден ${fw.day}: ${fw.daily} мл на ден (НЦОЗА)`, C.sky]
        : ['Мляко на хранене', range(cur.formula.perFeedMin, cur.formula.perFeedMax), 'мл', `${cur.formula.feeds} пъти · ${range(cur.formula.dailyMin, cur.formula.dailyMax)} мл на ден`, C.sky],
    cur.solids ? ['Храна на хранене', cur.firstSolidMonth ? `${cur.portion.from}→${cur.portion.to}` : range(cur.portion.from, cur.portion.to), 'г', cur.firstSolidMonth ? 'от 1–3 супени лъжици за 7–8 дни' : 'порция за възрастта', C.green]
      : ['Енергия', cur.energy, 'kcal', 'на ден (FAO/WHO/UNU 2004)', C.amber],
    g.lastWeight ? ['Тегло', dec(g.lastWeight.value, 2), 'кг', `измерено ${formatDate(g.lastWeight.date)}`, C.brand] : null,
    ['След месец', `≈${dec(next.growth.start.weight, 2)}`, 'кг', `по своята крива · +${cur.growth.gain} г`, C.coral],
    ['Дължина след месец', `≈${dec(next.growth.start.length)}`, 'см', 'по своята крива', C.rose],
  ]);
  if (cur.texture) ctx.flow.text([{ text: 'Консистенция: ', font: 'semibold' }, { text: cur.texture }], { size: 8.5, after: 3 });
  if (cur.newFoods.length) ctx.flow.text([{ text: 'Нови храни този месец: ', font: 'semibold' }, { text: cur.newFoods.join('; ') }], { size: 8.5, after: 6 });
  const day = fw ? fw.schedule : cur.day;
  if (day) flow.add(dayBlock(ctx, day, flow.width), { gap: 10 });
  flow.text([{ text: 'Достатъчно ли яде', font: 'bold', color: C.teal }], { size: 10, after: 4 });
  flow.add(bullets(ctx.doc, plan.adequacy, flow.width, { color: C.teal, size: 8.3 }), { gap: 6 });
}

/* ------------------------------------ растеж ------------------------------------ */

function growthSection(ctx) {
  const { flow, plan, person } = ctx;
  heading(ctx, 'Очакван растеж до 1 година', 'Лентата е нормата между 3-ия и 97-ия перцентил на СЗО, тънката линия — медианата, пунктирът — пътят по кривата на детето. Точките са измерванията.', { icon: '▲', newPage: true });
  const shift = plan.age.corrected ? (40 - plan.input.gestWeeks) * 7 : 0;
  const pts = (key) => (person.measurements || []).filter(m => m[key] > 0).map(m => [((new Date(m.date) - new Date(person.birthDate)) / 86400000 - shift) / 30.4375, Number(m[key])])
    .filter(([a]) => a >= 0 && a <= 12.3);
  const series = [...plan.months.map(m => m.growth.start), plan.growth.at12];
  const half = (flow.width - 12) / 2;
  flow.add({
    h: 190,
    draw: (page, x, y) => {
      chart(ctx, page, x, y, half, 190, 'Тегло, кг', series.map(s => [s.weightP3, s.weightMedian, s.weightP97, s.weight]), pts('weight'), C.teal, 1);
      chart(ctx, page, x + half + 12, y, half, 190, 'Дължина, см', series.map(s => [s.lengthP3, s.lengthMedian, s.lengthP97, s.length]), pts('height'), C.coral, 5);
    },
  }, { gap: 12 });
  // Таблица по месеци.
  const cols = [['Навършени', 60], ['Около', 64], ['Тегло по кривата', 82], ['Норма 3–97 п.', 82], ['Наддаване', 66], ['Дължина', 60], ['Норма', 101]];
  const rowH = 15;
  const H = 18 + series.length * rowH;
  flow.add({
    h: H,
    draw: (page, x, y) => {
      page.rect(x, y, flow.width, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
      page.rect(x, y, flow.width, 18, { fill: C.tealSoft, radius: [8, 8, 0, 0] });
      let cx = x + 8;
      for (const [t, w] of cols) { page.text(t, cx, y + 12, { font: 'bold', size: 7.2, color: C.teal }); cx += w; }
      series.forEach((s, i) => {
        const ry = y + 18 + i * rowH;
        const current = i === plan.age.currentMonth;
        if (current) page.rect(x + 1, ry, flow.width - 2, rowH, { fill: C.amberSoft });
        else if (i % 2) page.rect(x + 1, ry, flow.width - 2, rowH, { fill: C.bg });
        const cells = [`${i} мес.`, formatDate(monthDate(person.birthDate, i, plan.input.gestWeeks)).replace(' г.', ''), `${dec(s.weight, 2)} кг`,
          `${dec(s.weightP3)}–${dec(s.weightP97)} кг`, i > 0 ? `+${plan.months[i - 1].growth.gain} г` : '—', `${dec(s.length)} см`, `${dec(s.lengthP3)}–${dec(s.lengthP97)} см`];
        let tx = x + 8;
        cells.forEach((c, j) => { page.text(c, tx, ry + 10.5, { font: j === 2 || current ? 'semibold' : 'regular', size: 7.6, color: j === 2 ? C.teal : C.ink }); tx += cols[j][1]; });
      });
    },
  }, { gap: 6 });
  ctx.flow.text('Растежни стандарти на СЗО. От втората седмица кърмените бебета наддават около 500 г до 1 кг и повече на месец — всички тези стойности са нормални (СЗО 2009). Рожденото тегло се възстановява до 2 седмици (СЗО 2009), почти винаги до 3 седмици; загуба над 10% изисква оценка (NICE NG75).', { size: 7.4, color: C.ink2, after: 6 });
}

/** Графика: лента P3–P97, медиана, пунктир по кривата и измерванията. values[i] = [p3, median, p97, track] за месец i. */
function chart(ctx, page, x, y, w, h, title, values, points, color, step) {
  page.rect(x, y, w, h, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 10 });
  page.text(title, x + 12, y + 17, { font: 'bold', size: 9, color: C.ink });
  const px = x + 32;
  const pw = w - 44;
  const py = y + 28;
  const ph = h - 50;
  const all = values.flat().concat(points.map(p => p[1])).filter(Number.isFinite);
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil(Math.max(...all) / step) * step;
  const X = (m) => px + (m / 12) * pw;
  const Y = (v) => py + ph - ((v - lo) / (hi - lo)) * ph;
  const tickStep = (hi - lo) / step > 8 ? step * 2 : step;
  for (let v = lo; v <= hi + 1e-6; v += tickStep) {
    page.line(px, Y(v), px + pw, Y(v), { color: C.line, width: 0.4 });
    page.text(String(v), px - 4, Y(v) + 2.4, { size: 6.4, color: C.ink3, align: 'right' });
  }
  for (let m = 0; m <= 12; m += 2) page.text(String(m), X(m), py + ph + 10, { size: 6.4, color: C.ink3, align: 'center' });
  page.text('месеци', px + pw, py + ph + 18, { size: 6.2, color: C.ink3, align: 'right' });
  const band = [...values.map((v, i) => [X(i), Y(v[2])]), ...values.map((v, i) => [X(i), Y(v[0])]).reverse()];
  page.poly(band, { fill: color, opacity: 0.12 });
  page.poly(values.map((v, i) => [X(i), Y(v[1])]), { stroke: color, width: 0.8, close: false, opacity: 0.6 });
  for (let i = 0; i < values.length - 1; i++) page.line(X(i), Y(values[i][3]), X(i + 1), Y(values[i + 1][3]), { color, width: 1.6, dash: [3, 2] });
  for (const [a, v] of points) page.circle(X(a), Y(v), 2.8, { fill: C.brand });
}

/* ---------------------------------- по месеци ---------------------------------- */

function monthsSection(ctx) {
  const { doc, flow, plan } = ctx;
  heading(ctx, 'План по месеци', 'Колко пъти на ден и по колко, какво ново и примерен ден. Количествата са ориентировъчни — бебето се храни според апетита си.', { icon: '★', newPage: true });
  const breast = plan.input.feeding === 'breast';
  for (const m of plan.months) {
    const [color, soft, stage] = STAGE(m);
    const w = flow.width - 24;
    const parts = [];
    const milk = breast ? m.breast
      : `${m.formula.feeds} пъти по ${range(m.formula.perFeedMin, m.formula.perFeedMax)} мл; ${range(m.formula.dailyMin, m.formula.dailyMax)} мл на ден${m.formula.inMeals ? ', заедно с млякото в кашите' : ''}${m.formula.followOn ? ' (преходно мляко)' : ''}.`;
    parts.push(textBlock(doc, [{ text: breast ? 'Кърмене: ' : 'Мляко: ', font: 'semibold' }, { text: milk }], w, { size: 8.2 }));
    if (m.solids) parts.push(textBlock(doc, [{ text: 'Храна: ', font: 'semibold' }, { text: `${Array.isArray(m.solidMeals) ? range(m.solidMeals[0], m.solidMeals[1]) : ''} хранения на ден, порция ${m.firstSolidMonth ? `от 30 до ${m.portion.to}` : range(m.portion.from, m.portion.to)} г; ${m.texture}.${m.snacks ? ' 1–2 закуски с храни за ядене с пръсти.' : ''}` }], w, { size: 8.2 }));
    if (m.newFoods.length) parts.push(textBlock(doc, [{ text: 'Нови храни: ', font: 'semibold', color: C.green }, { text: m.newFoods.join('; ') }], w, { size: 8.2 }));
    if (plan.input.feeding === 'mixed' && m.month < 6) parts.push(textBlock(doc, 'Първо кърма, после адаптирано мляко — количеството му зависи от кърмата и наддаването.', w, { size: 7.6, color: C.ink2 }));
    const day = m.day ? dayBlock(ctx, m.day, w, { size: 7.6 }) : null;
    const headH = 24;
    const bodyH = parts.reduce((s, p) => s + p.h + 3, 0) + (day ? day.h + 6 : 0);
    const H = headH + 8 + bodyH + 6;
    flow.add({
      h: H,
      draw: (page, x, y) => {
        page.rect(x, y, flow.width, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
        page.rect(x, y, flow.width, headH, { fill: soft, radius: [8, 8, 0, 0] });
        page.rect(x, y, 4, H, { fill: color, radius: [8, 0, 0, 8] });
        page.text(m.label, x + 14, y + 16, { font: 'bold', size: 10, color: C.ink });
        const lw = ctx.doc.width(m.label, 'bold', 10);
        chip(page, doc, stage, x + 22 + lw, y + 5, { size: 7, fg: color, bg: C.white });
        page.text(`${m.feeds} хранения · ≈${m.energy} kcal · ${dec(m.growth.start.weight, 2)} → ${dec(m.growth.end.weight, 2)} кг`, x + flow.width - 12, y + 16, { font: 'semibold', size: 7.6, color, align: 'right' });
        let yy = y + headH + 8;
        for (const p of parts) { p.draw(page, x + 14, yy); yy += p.h + 3; }
        if (day) day.draw(page, x + 14, yy + 3);
      },
    }, { gap: 8 });
  }
}

/* ----------------------------------- храни ----------------------------------- */

function foodsSection(ctx) {
  const { doc, flow, plan } = ctx;
  heading(ctx, 'Кога се въвежда всяка храна', 'По НЦОЗА 2013 (таблица 10); нищо не се дава преди началото на захранването. ESPGHAN 2017: алергенните храни (яйце, глутен, риба) могат да се въведат още с началото на захранването.', { icon: '►', newPage: true });
  const labelW = 230;
  const months = [4, 5, 6, 7, 8, 9, 10, 11];
  const cw = (flow.width - labelW) / months.length;
  const rows = plan.foods.map(f => ({ f, b: textBlock(doc, [{ text: f.label }, ...(f.allergen ? [{ text: ' · алерген', color: C.ink3 }] : [])], labelW - 14, { size: 7.6 }) }));
  const rh = (r) => Math.max(17, r.b.h + 6);
  const H = 20 + rows.reduce((s, r) => s + rh(r), 0);
  flow.add({
    h: H,
    draw: (page, x, y) => {
      page.rect(x, y, flow.width, H, { fill: C.white, stroke: C.line, lineWidth: 0.6, radius: 8 });
      page.rect(x, y, flow.width, 20, { fill: C.greenSoft, radius: [8, 8, 0, 0] });
      page.text('Храна', x + 10, y + 13.5, { font: 'bold', size: 7.6, color: C.green });
      months.forEach((m, i) => page.text(`${m} мес.`, x + labelW + i * cw + cw / 2, y + 13.5, { font: 'bold', size: 7.2, color: C.green, align: 'center' }));
      let yy = y + 20;
      rows.forEach((r, i) => {
        const h = rh(r);
        if (i % 2) page.rect(x + 1, yy, flow.width - 2, h, { fill: C.bg });
        r.b.draw(page, x + 10, yy + 3);
        const a = months.indexOf(r.f.from);
        const b = months.indexOf(r.f.to);
        if (a >= 0 && b >= 0) page.rect(x + labelW + a * cw + 3, yy + h / 2 - 4.5, (b - a + 1) * cw - 6, 9, { fill: COLOR[r.f.color] || C.green, radius: 4.5 });
        yy += h;
      });
    },
  }, { gap: 10 });
  flow.text([{ text: 'Готово ли е бебето за захранване', font: 'bold', color: C.green }], { size: 10, after: 4 });
  flow.add(bullets(doc, plan.readiness, flow.width, { color: C.green, size: 8.3 }), { gap: 8 });
}

/* ----------------------------------- правила ----------------------------------- */

function rulesSection(ctx) {
  const { doc, flow, plan, doctor, date } = ctx;
  heading(ctx, 'Правила', null, { icon: '✓', color: C.brand });
  for (const r of plan.rules) {
    const tagW = chipWidth(doc, r.src, { size: 6.8 });
    const b = textBlock(doc, r.text, flow.width - tagW - 30, { size: 8.4 });
    flow.add({
      h: Math.max(18, b.h + 6),
      draw: (page, x, y) => {
        page.circle(x + 5, y + 6.5, 3.2, { fill: C.brand });
        b.draw(page, x + 14, y);
        chip(page, doc, r.src, x + flow.width - tagW, y, { size: 6.8, fg: C.brand, bg: C.brandSoft });
      },
    }, { gap: 3 });
  }
  flow.space(6);
  flow.text('Източници: НЦОЗА 2013 — „Основи на здравословното хранене на деца до 3-годишна възраст. Ръководство за здравни специалисти“ (Петрова, Дулева, Рангелова); FAO/WHO/UNU 2004 — Human energy requirements; '
    + 'СЗО 2009 — Infant and young child feeding: model chapter; ESPGHAN 2013 — Vitamin D in the healthy paediatric population; ESPGHAN 2017 — Complementary feeding (Fewtrell и съавт.); NICE NG75 — Faltering growth; AAP — HealthyChildren.org; растежни стандарти на СЗО.',
  { size: 7.4, color: C.ink2, after: 8 });
  noteBox(ctx, 'Планът е ориентировъчен и е изготвен от лекаря по данните в досието. При недоносено дете, заболяване, алергия или слабо наддаване храненето се определя индивидуално.', { bg: C.amberSoft, bar: C.amber, size: 8 });
  flow.need(50);
  flow.space(24);
  const { page } = flow;
  page.line(flow.x, flow.y, flow.x + 190, flow.y, { color: C.ink3, width: 0.6 });
  page.line(flow.x + flow.width - 150, flow.y, flow.x + flow.width, flow.y, { color: C.ink3, width: 0.6 });
  page.text(`Лекар: ${doctor?.name || ''}`, flow.x, flow.y + 11, { size: 8, color: C.ink2 });
  page.text(`Дата: ${formatDate(date)}`, flow.x + flow.width - 150, flow.y + 11, { size: 8, color: C.ink2 });
  flow.y += 18;
}

function footers(ctx) {
  const { doc, practice } = ctx;
  const n = doc.pages.length;
  doc.pages.forEach((page, i) => {
    const y = page.h - 30;
    page.line(40, y - 10, page.w - 40, y - 10, { color: C.line, width: 0.5 });
    page.text(`DocUp${practice.name ? ` · ${practice.name}` : ''}`, 40, y, { size: 7, color: C.ink3 });
    page.text(`стр. ${i + 1} от ${n}`, page.w - 40, y, { font: 'semibold', size: 7, color: C.ink2, align: 'right' });
  });
}
