/* Бързо търсене (версия 5.0): пациенти по име, ЕГН или телефон и страници по име.
 *
 * Използва се и от сървъра (GET /api/search), и от браузъра (страниците и действията в прозореца
 * за търсене). Резултатите са подредени така, че най-вероятният пациент да е първи: съвпадение в
 * началото на име е преди съвпадение по средата, действащите досиета са преди архивираните. */

/** Малки букви, без „ь“ и „ъ“ (за да не пречи правописът), с единични интервали. */
export function normaliseSearch(text) {
  return String(text ?? '').toLowerCase().replace(/[ьъ]/g, '').replace(/\s+/g, ' ').trim();
}

const digitsOf = (text) => String(text ?? '').replace(/\D/g, '');

/**
 * Оценка на съвпадението на име със заявка: 0 — всяка дума от заявката е начало на дума от името
 * и първата дума на заявката е начало на името; 1 — всяка е начало на някоя дума; 2 — всяка се
 * среща някъде в името; -1 — няма съвпадение. Редът на думите в заявката не е важен
 * („иванова мария“ намира „Мария Иванова“).
 */
export function nameScore(name, query) {
  const n = normaliseSearch(name);
  const words = normaliseSearch(query).split(' ').filter(Boolean);
  if (!words.length || !n) return -1;
  const parts = n.split(' ');
  let prefixAll = true;
  for (const w of words) {
    if (!n.includes(w)) return -1;
    if (!parts.some(p => p.startsWith(w))) prefixAll = false;
  }
  if (!prefixAll) return 2;
  return n.startsWith(words[0]) ? 0 : 1;
}

/**
 * Пациентите, които отговарят на заявката, най-добрите първи.
 * @param {Array} patients  досиета: { id, name, egn, phone, birthDate, sex, archived, allergies, contacts }
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {{ total: number, items: Array }}  items — до limit, само с полетата за показване
 */
export function searchPatients(patients, query, { limit = 8 } = {}) {
  const q = normaliseSearch(query);
  if (!q) return { total: 0, items: [] };
  const qDigits = digitsOf(q);
  const numeric = qDigits.length >= 2 && qDigits.length === q.replace(/[\s+()-]/g, '').length;
  const found = [];
  for (const p of patients || []) {
    let score = -1;
    let by = 'name';
    if (numeric) {
      const egn = String(p.egn || '');
      const phone = digitsOf(p.phone);
      if (egn.startsWith(qDigits)) { score = 0; by = 'egn'; }
      else if (egn.includes(qDigits)) { score = 1; by = 'egn'; }
      else if (phone && phone.includes(qDigits)) { score = phone.endsWith(qDigits) || phone.startsWith(qDigits) ? 1 : 2; by = 'phone'; }
      else if ((p.contacts || []).some(c => digitsOf(c.phone).includes(qDigits))) { score = 3; by = 'contact'; }
    } else {
      score = nameScore(p.name, q);
      if (score < 0 && (p.contacts || []).some(c => nameScore(c.name, q) >= 0)) { score = 3; by = 'contact'; }
    }
    if (score < 0) continue;
    found.push({ p, score: score + (p.archived ? 10 : 0), by });
  }
  found.sort((a, b) => a.score - b.score || String(a.p.name).localeCompare(String(b.p.name), 'bg'));
  return {
    total: found.length,
    items: found.slice(0, Math.max(1, Math.min(50, Number(limit) || 8))).map(({ p, by }) => ({
      id: p.id, name: p.name, birthDate: p.birthDate || '', sex: p.sex || '', egn: p.egn || '', phone: p.phone || '',
      archived: !!p.archived, allergies: !!(p.allergies && p.allergies.length), by,
    })),
  };
}

/**
 * Страници и действия по надпис: [{ label, keywords }] → тези, в които всяка дума от заявката е
 * начало на дума от надписа или от ключовите думи. Празна заявка връща всички.
 */
export function matchItems(items, query) {
  const words = normaliseSearch(query).split(' ').filter(Boolean);
  if (!words.length) return [...(items || [])];
  return (items || []).filter(it => {
    const hay = normaliseSearch(`${it.label} ${it.keywords || ''}`).split(' ');
    return words.every(w => hay.some(h => h.startsWith(w)));
  });
}

/** Последно отворените досиета: новото отива най-отпред, без повторения, най-много max. */
export function pushRecent(list, entry, max = 6) {
  if (!entry || !entry.id) return Array.isArray(list) ? list.slice(0, max) : [];
  const rest = (Array.isArray(list) ? list : []).filter(x => x && x.id && x.id !== entry.id);
  return [{ id: entry.id, name: String(entry.name || ''), birthDate: entry.birthDate || '', sex: entry.sex || '' }, ...rest].slice(0, max);
}
