/* Внасяне на пациенти от таблица (Excel, LibreOffice, CSV, HTML, XML или
 * поставено от Excel). Първо файлът се прочита и се показва, после се
 * проверява „на сухо“ и едва тогава се записва. */

import fs from 'node:fs';
import { HttpError, bad, str } from './validate.js';
import { FORMAT_LABELS, MAX_COLS, readPasted, readSpreadsheet } from './import/index.js';
import { MAX_IMPORT_ROWS, applyImport, planImport } from './import/patients.js';
import { detectHeaderRow, guessMapping } from '../public/js/shared/import-columns.js';

const PREVIEW_ROWS = 300;

function readOptions(o = {}) {
  return {
    existing: o.existing === 'skip' ? 'skip' : 'fill',
    baseline: o.baseline === 'missed' ? 'missed' : 'assume',
    doctorId: typeof o.doctorId === 'string' ? o.doctorId.slice(0, 60) : '',
    fixCase: o.fixCase !== false,
    extraToNotes: !!o.extraToNotes,
  };
}

function readTable(body) {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > MAX_IMPORT_ROWS) bad(`Наведнъж могат да се внесат до ${MAX_IMPORT_ROWS} реда.`);
  const clean = (r) => (Array.isArray(r) ? r.slice(0, MAX_COLS).map(v => (v === null || v === undefined ? '' : String(v).slice(0, 2000))) : []);
  const mapping = (Array.isArray(body.mapping) ? body.mapping : []).slice(0, MAX_COLS).map(m => (m ? String(m) : null));
  return {
    rows: rows.map(clean),
    header: clean(body.header || []),
    mapping,
    firstRow: Number(body.firstRow) > 0 ? Math.floor(Number(body.firstRow)) : 1,
  };
}

/** Резултатът за показване: обобщение, първите редове и всички проблемни. */
function view(plan) {
  const slim = (r) => ({
    line: r.line, action: r.action, messages: r.messages || [],
    name: r.fields?.name || '', egn: r.fields?.egn || '', birthDate: r.fields?.birthDate || '',
    sex: r.fields?.sex || '', phone: r.fields?.phone || '', chronic: r.chronic || [],
    other: r.fields?.conditions || [], matchName: r.matchName || '', changes: r.changes || [],
  });
  const visible = plan.results.filter(r => r.action !== 'empty');
  return {
    summary: plan.summary,
    preview: visible.slice(0, PREVIEW_ROWS).map(slim),
    problems: visible.filter(r => r.action === 'error' || r.action === 'duplicate'
      || (r.messages || []).some(m => m.level === 'warning')).map(slim),
  };
}

export const importRoutes = {

  /** Прочита файла и връща листовете с предложение за колоните. */
  'POST /api/import/read': (ctx) => {
    const { body } = ctx;
    let result;
    try {
      if (typeof body.text === 'string') {
        result = readPasted(body.text);
      } else {
        const data = str(body.data, 'Файл', { required: true, max: 30 * 1024 * 1024 });
        const buf = Buffer.from(data, 'base64');
        result = readSpreadsheet(buf, str(body.filename, 'Име на файла', { max: 260 }));
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, err.message || 'Файлът не може да бъде прочетен.');
    }
    return {
      format: result.format,
      formatLabel: FORMAT_LABELS[result.format] || result.format,
      encoding: result.encoding || null,
      sheets: result.sheets.map(s => {
        const headerRow = detectHeaderRow(s.rows);
        return {
          name: s.name, hidden: !!s.hidden, rows: s.rows,
          headerRow, mapping: guessMapping(s.rows, headerRow),
        };
      }),
    };
  },

  /** Проверка „на сухо“ (dryRun) или записване. */
  'POST /api/import/patients': (ctx) => {
    const { store, body, doctor } = ctx;
    const table = readTable(body);
    const options = readOptions(body.options);
    if (options.doctorId && !store.doctor(options.doctorId)) bad('Непознат лекар.');
    let plan;
    try {
      plan = planImport(store, { ...table, options });
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    if (body.dryRun !== false) return view(plan);

    if (!plan.summary.create && !plan.summary.update) bad('Няма нови пациенти или данни за допълване.');
    // Преди внасянето — копие на досегашните данни.
    store.dailyBackup();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${store.backupDir}/pre-import-${stamp}.json`;
    try { fs.copyFileSync(store.file, backup); } catch { /* още няма файл */ }

    const source = str(body.source, 'Източник', { max: 200 });
    const done = applyImport(store, plan, { options, doctor, source });
    store.persist();
    store.audit(doctor, 'patients_import', {
      source, created: done.created, updated: done.updated,
      skipped: plan.summary.error + plan.summary.duplicate + plan.summary.same, baseline: options.baseline,
    });
    return { ...view(plan), done, backup: backup.split(/[\\/]/).pop() };
  },
};
