/* Растежни криви по стандартите на СЗО, рисувани като SVG.
 *
 * Показват се перцентилите 3, 15, 50, 85 и 97, а върху тях — измерванията
 * на детето. Точките извън ±2 SD се оцветяват, за да се забелязват веднага. */

import { svg } from './dom.js';
import { INDICATORS, percentileCurves } from '../shared/growth.js';

const W = 620, H = 360;
const M = { top: 16, right: 46, bottom: 40, left: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/** „Кръгли“ стъпки за скалата. */
function niceStep(range, target = 7) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const mult of [1, 2, 2.5, 5, 10]) {
    if (raw <= mult * mag) return mult * mag;
  }
  return 10 * mag;
}

/**
 * Рисува графика за показател.
 * @param {string} key           weight | height | bmi | head
 * @param {object} patient       { sex }
 * @param {Array}  points        [{ ageMonths, value, severity }]
 * @param {object} opts          { fromMonths, toMonths }
 */
export function growthChart(key, patient, points, opts = {}) {
  const ind = INDICATORS[key];
  const sex = patient.sex === 'f' ? 'f' : 'm';

  // Възрастов обхват: обхваща измерванията с малко въздух, в рамките на стандарта.
  const ages = points.map(p => p.ageMonths);
  const maxAge = Math.max(...ages, 1);
  let from = opts.fromMonths ?? 0;
  let to = opts.toMonths ?? pickRange(maxAge, ind.maxAgeMonths);
  if (to > ind.maxAgeMonths) to = ind.maxAgeMonths;
  if (from >= to) from = 0;

  const curves = percentileCurves(key, sex, from, to, 80);
  if (!curves.length) return null;

  // Вертикална скала — покрива кривите и точките на детето.
  let lo = Infinity, hi = -Infinity;
  for (const c of curves) for (const [, v] of c.points) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const p of points) {
    if (p.ageMonths >= from && p.ageMonths <= to) { lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
  }
  const pad = (hi - lo) * 0.06 || 1;
  lo = Math.max(0, lo - pad);
  hi = hi + pad;

  const x = (m) => M.left + ((m - from) / (to - from)) * PLOT_W;
  const y = (v) => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

  const path = (pts) => pts
    .map(([m, v], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');

  const kids = [];

  /* --- лента между 3-ия и 97-ия перцентил --- */
  const p3 = curves.find(c => c.p === 3), p97 = curves.find(c => c.p === 97);
  if (p3 && p97) {
    const area = path(p97.points) + ' L' + [...p3.points].reverse()
      .map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' L') + ' Z';
    kids.push(svg('path', { class: 'band', d: area }));
  }

  /* --- мрежа и скали --- */
  const yStep = niceStep(hi - lo);
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) {
    const yy = y(v);
    kids.push(svg('line', { class: 'axis', x1: M.left, x2: M.left + PLOT_W, y1: yy, y2: yy }));
    kids.push(svg('text', {
      class: 'axis-text', x: M.left - 8, y: yy + 4.5, 'text-anchor': 'end',
    }, formatTick(v, yStep)));
  }

  const showYears = to > 30;
  const xStep = to - from <= 14 ? 2 : to - from <= 26 ? 3 : to - from <= 64 ? 6 : 12;
  for (let m = Math.ceil(from / xStep) * xStep; m <= to; m += xStep) {
    const xx = x(m);
    kids.push(svg('line', {
      class: 'axis', x1: xx, x2: xx, y1: M.top, y2: M.top + PLOT_H, opacity: .55,
    }));
    kids.push(svg('text', { class: 'axis-text', x: xx, y: H - 22, 'text-anchor': 'middle' },
      showYears ? (m % 12 === 0 ? String(m / 12) : '') : String(m)));
  }
  kids.push(svg('text', { class: 'axis-text', x: M.left + PLOT_W / 2, y: H - 4, 'text-anchor': 'middle' },
    showYears ? 'възраст (години)' : 'възраст (месеци)'));
  kids.push(svg('text', {
    class: 'axis-text', x: 14, y: M.top + PLOT_H / 2, 'text-anchor': 'middle',
    transform: `rotate(-90 14 ${M.top + PLOT_H / 2})`,
  }, ind.unit));

  /* --- перцентилни криви --- */
  for (const c of curves) {
    kids.push(svg('path', { class: 'curve' + (c.major ? ' major' : ''), d: path(c.points) }));
    const last = c.points[c.points.length - 1];
    kids.push(svg('text', {
      class: 'curve-label', x: x(last[0]) + 5, y: y(last[1]) + 4, 'text-anchor': 'start',
    }, c.p));
  }

  /* --- рамка --- */
  kids.push(svg('rect', {
    x: M.left, y: M.top, width: PLOT_W, height: PLOT_H,
    fill: 'none', stroke: 'var(--line-strong)', 'stroke-width': 1,
  }));

  /* --- измерванията на детето --- */
  const inRange = points
    .filter(p => p.ageMonths >= from && p.ageMonths <= to && Number.isFinite(p.value))
    .sort((a, b) => a.ageMonths - b.ageMonths);

  if (inRange.length > 1) {
    kids.push(svg('path', {
      class: 'patient-line',
      d: inRange.map((p, i) => `${i ? 'L' : 'M'}${x(p.ageMonths).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
    }));
  }
  for (const p of inRange) {
    const cls = p.severity === 2 ? ' danger' : p.severity === 1 ? ' warn' : '';
    kids.push(svg('circle', {
      class: 'point' + cls, cx: x(p.ageMonths).toFixed(1), cy: y(p.value).toFixed(1), r: 4.6,
    }, svg('title', {}, `${p.label || ''}`)));
  }

  return svg('svg', {
    class: 'growth', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${ind.label} — перцентилна крива`,
  }, kids);
}

function pickRange(maxAge, limit) {
  for (const candidate of [6, 12, 24, 36, 60, 120, 228]) {
    if (maxAge <= candidate * 0.92 && candidate <= limit) return candidate;
  }
  return limit;
}

function formatTick(v, step) {
  const decimals = step < 1 ? 1 : 0;
  return v.toFixed(decimals);
}
