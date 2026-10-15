/* PDF отчетът за хранене и тренировки: изготвя се в браузъра и се изтегля като файл. */

import { state } from '../app.js';
import { toast } from '../ui/components.js';
import { formatDate, today } from '../shared/dates.js';
import { nutritionReport } from '../shared/pdf/nutrition-report.js';
import { infantReport } from '../shared/pdf/infant-report.js';

const FONTS = { regular: 'NotoSans-Regular.ttf', semibold: 'NotoSans-SemiBold.ttf', bold: 'NotoSans-Bold.ttf', symbols: 'DejaVuSans-Symbols.ttf' };
let fontsPromise = null;

/** Шрифтовете се зареждат веднъж (около 260 KB от самата програма). */
function loadFonts() {
  fontsPromise ||= Promise.all(Object.entries(FONTS).map(async ([key, file]) => {
    const res = await fetch(`/fonts/${file}`);
    if (!res.ok) throw new Error(`Шрифтът ${file} не се зареди.`);
    return [key, new Uint8Array(await res.arrayBuffer())];
  })).then(Object.fromEntries).catch((err) => { fontsPromise = null; throw err; });
  return fontsPromise;
}

const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Изготвя и изтегля PDF. person — { name, birthDate, age, sex }; only: 'shopping' — само пазаруването. */
export async function downloadNutritionPdf(person, plan, { only = null } = {}) {
  if (typeof CompressionStream === 'undefined') {
    toast('Браузърът е твърде стар за PDF. Обновете Chrome, Edge или Firefox.', 'error');
    return;
  }
  try {
    const bytes = await nutritionReport({
      plan, person, only, fonts: await loadFonts(),
      practice: { name: state.practice?.name || '', phone: state.practice?.phone || '' },
      doctor: state.doctor ? { name: state.doctor.name } : null,
      version: state.server?.version || '', date: today(),
    });
    const kind = plan.lang === 'en'
      ? (only === 'shopping' ? 'Shopping' : plan.training ? 'Nutrition and training' : 'Nutrition plan')
      : (only === 'shopping' ? 'Пазаруване' : plan.training ? 'Хранене и тренировки' : 'Хранителен режим');
    const name = `${safeName(`${kind} - ${person.name || ''} - ${formatDate(today()).replace(/ г\.$/, '')}`)}.pdf`;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`PDF файлът е изтеглен: ${name}`, 'ok');
  } catch (err) {
    toast('PDF не можа да се изготви: ' + err.message, 'error');
  }
}

/** Бутонът показва, че се изготвя, докато файлът стане готов. */
export function busy(fn) {
  return async (e) => {
    const b = e.currentTarget;
    const label = b.textContent;
    b.disabled = true;
    b.textContent = '⏳ Изготвя се…';
    try { await fn(); } finally { b.disabled = false; b.textContent = label; }
  };
}

/** PDF за храненето на кърмачето — за родителя. */
export async function downloadInfantPdf(p, plan) {
  if (typeof CompressionStream === 'undefined') {
    toast('Браузърът е твърде стар за PDF. Обновете Chrome, Edge или Firefox.', 'error');
    return;
  }
  try {
    const bytes = await infantReport({
      plan, fonts: await loadFonts(),
      person: { name: p.name, birthDate: p.birthDate, sex: p.sex, birth: p.birth || {}, measurements: p.measurements || [] },
      practice: { name: state.practice?.name || '', phone: state.practice?.phone || '' },
      doctor: state.doctor ? { name: state.doctor.name } : null,
      version: state.server?.version || '', date: today(),
    });
    save(bytes, `${safeName(`Хранене до 1 година - ${p.name || ''} - ${formatDate(today()).replace(/ г\.$/, '')}`)}.pdf`);
  } catch (err) {
    toast('PDF не можа да се изготви: ' + err.message, 'error');
  }
}

function save(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`PDF файлът е изтеглен: ${name}`, 'ok');
}
