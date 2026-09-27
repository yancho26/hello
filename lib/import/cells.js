/* Общи помощници за клетките: числа, дати от Excel и формати на датите. */

/** Число като текст — без експонента и без излишни нули (ЕГН, телефони). */
export function numberText(n) {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return Math.abs(n) < 1e21 ? n.toFixed(0) : String(n);
  // Грешките от плаваща запетая (0.1 + 0.2) се закръглят до 10 значещи цифри след запетаята.
  return String(Math.round(n * 1e10) / 1e10);
}

/**
 * Пореден номер на ден от Excel → ISO дата. В системата от 1900 г. Excel
 * смята 1900 за високосна (фалшивият 29.02.1900 е ден 60), затова датите
 * след него са с един ден напред.
 */
export function excelSerialToISO(serial, date1904 = false) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const days = Math.floor(serial);
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const offset = date1904 ? days : days > 59 ? days - 1 : days;
  return new Date(base + offset * 86400000).toISOString().slice(0, 10);
}

/* Вградените формати на Excel, които са дати. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Дали форматът (номер или текст на формата) показва дата. */
export function isDateFormat(id, code) {
  if (BUILTIN_DATE_FORMATS.has(Number(id))) return true;
  if (!code) return false;
  const clean = String(code)
    .replace(/"[^"]*"/g, '')     // текст в кавички
    .replace(/\[[^\]]*\]/g, '')  // [Red], [$-402] и др.
    .replace(/\\./g, '')          // избягани знаци
    .toLowerCase();
  if (/general|стандарт/.test(clean)) return false;
  // Дни или години; само „m“ без тях може да е и минути в час.
  return /[dy]|д|г/.test(clean) || (/m/.test(clean) && !/[hs]/.test(clean) && /[\/.\-]/.test(clean));
}
