/* Графика на стойности във времето — налягане, тегло, HbA1c, LDL, eGFR.
 *
 * Целевата зона се оцветява, а граничните стойности са пунктир, за да се
 * вижда веднага дали пациентът е в целта и накъде върви. */

import { svg } from './dom.js';
import { DAY_MS, formatDateShort } from '../shared/dates.js';

const W = 620, H = 250;
const M = { top: 14, right: 18, bottom: 34, left: 52 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

const toDay = (iso) => Date.parse(iso + 'T00:00:00Z') / DAY_MS;

function niceStep(range, target = 5) {
  const raw = range / target || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const mult of [1, 2, 2.5, 5, 10]) if (raw <= mult * mag) return mult * mag;
  return 10 * mag;
}

/**
 * @param {object} o
 *   series  [{ label, points: [{ date, value }], cls }] — cls: a | b (цвят)
 *   unit    мерна единица за оста
 *   band    { lo, hi } — целева зона
 *   lines   [{ value, label }] — гранични стойности
 *   decimals  знаци след десетичната запетая в етикетите
 */
export function trendChart({ series, unit = '', band = null, lines = [], decimals = 0 }) {
  const all = series.flatMap(s => s.points).filter(p => Number.isFinite(p.value));
  if (!all.length) return null;

  let x0 = Math.min(...all.map(p => toDay(p.date)));
  let x1 = Math.max(...all.map(p => toDay(p.date)));
  if (x1 - x0 < 60) { x0 -= 30; x1 += 30; }
  const padX = (x1 - x0) * 0.04;
  x0 -= padX; x1 += padX;

  const values = [...all.map(p => p.value), ...lines.map(l => l.value)];
  if (band) values.push(...[band.lo, band.hi].filter(Number.isFinite));
  let lo = Math.min(...values), hi = Math.max(...values);
  const padY = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo -= padY; hi += padY;
  if (Math.min(...all.map(p => p.value)) >= 0 && lo < 0) lo = 0;

  const x = (d) => M.left + ((d - x0) / (x1 - x0)) * PW;
  const y = (v) => M.top + PH - ((v - lo) / (hi - lo)) * PH;
  const kids = [];

  if (band) {
    const top = y(Math.min(hi, Number.isFinite(band.hi) ? band.hi : hi));
    const bottom = y(Math.max(lo, Number.isFinite(band.lo) ? band.lo : lo));
    kids.push(svg('rect', { class: 'target', x: M.left, y: top, width: PW, height: Math.max(0, bottom - top) }));
  }

  const step = niceStep(hi - lo);
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    kids.push(svg('line', { class: 'axis', x1: M.left, x2: M.left + PW, y1: y(v), y2: y(v) }));
    kids.push(svg('text', { class: 'axis-text', x: M.left - 7, y: y(v) + 4, 'text-anchor': 'end' },
      v.toFixed(Number.isInteger(step) ? 0 : 1).replace('.', ',')));
  }
  if (unit) {
    kids.push(svg('text', {
      class: 'axis-text', x: 12, y: M.top + PH / 2, 'text-anchor': 'middle',
      transform: `rotate(-90 12 ${M.top + PH / 2})`,
    }, unit));
  }

  // Етикети по времевата ос — по месеци или по години според обхвата.
  const span = x1 - x0;
  const start = new Date(x0 * DAY_MS);
  const months = span > 1100 ? 12 : span > 500 ? 6 : span > 200 ? 3 : 1;
  const tick = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  while (tick.getTime() / DAY_MS <= x1) {
    if (tick.getUTCMonth() % months === 0) {
      const d = tick.getTime() / DAY_MS;
      const iso = tick.toISOString().slice(0, 10);
      kids.push(svg('line', { class: 'axis', x1: x(d), x2: x(d), y1: M.top, y2: M.top + PH, opacity: 0.5 }));
      kids.push(svg('text', { class: 'axis-text', x: x(d), y: H - 12, 'text-anchor': 'middle' },
        months === 12 ? String(tick.getUTCFullYear()) : iso.slice(5, 7) + '.' + iso.slice(2, 4)));
    }
    tick.setUTCMonth(tick.getUTCMonth() + 1);
  }

  for (const l of lines) {
    kids.push(svg('line', { class: 'limit', x1: M.left, x2: M.left + PW, y1: y(l.value), y2: y(l.value) }));
    if (l.label) {
      kids.push(svg('text', { class: 'limit-text', x: M.left + PW - 4, y: y(l.value) - 4, 'text-anchor': 'end' }, l.label));
    }
  }

  kids.push(svg('rect', {
    x: M.left, y: M.top, width: PW, height: PH, fill: 'none', stroke: 'var(--line-strong)', 'stroke-width': 1,
  }));

  for (const s of series) {
    const pts = s.points.filter(p => Number.isFinite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (pts.length > 1) {
      kids.push(svg('path', {
        class: 'line ' + (s.cls || 'a'),
        d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(toDay(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
      }));
    }
    for (const p of pts) {
      kids.push(svg('circle', {
        class: 'pt ' + (s.cls || 'a') + (p.flag ? ' flag' : ''), cx: x(toDay(p.date)).toFixed(1), cy: y(p.value).toFixed(1), r: 4.3,
      }, svg('title', {}, `${s.label ? s.label + ': ' : ''}${String(+p.value.toFixed(decimals)).replace('.', ',')} ${unit} — ${formatDateShort(p.date)}`)));
    }
  }

  return svg('svg', { class: 'trend', viewBox: `0 0 ${W} ${H}`, role: 'img' }, kids);
}
