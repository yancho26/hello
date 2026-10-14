/* Хранене на кърмачето (от версия 4.10): настройките в досието — начин на хранене, кога
 * започва захранването и риск от алергия. Самият план се изчислява в интерфейса
 * (public/js/shared/infant-feeding.js) от датата на раждане, данните при раждане и измерванията. */

import { bad, notFound } from './validate.js';
import { ageInMonthsExact, today } from '../public/js/shared/dates.js';
import { FEEDING_TYPES } from '../public/js/shared/infant-feeding.js';

/** До каква възраст (месеци) се пази и показва планът — първата година с малък запас. */
export const FEEDING_MAX_MONTHS = 24;

export function readFeeding(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Непознати данни за храненето.');
  if (!FEEDING_TYPES[body.type]) bad('Изберете начин на хранене: кърмене, адаптирано мляко или смесено.');
  const solidsStart = Number(body.solidsStart ?? 6);
  if (![4, 5, 6].includes(solidsStart)) bad('Захранването започва на 4, 5 или 6 навършени месеца.');
  if (body.allergyRisk !== undefined && typeof body.allergyRisk !== 'boolean') bad('Полето за риск от алергия има неправилен вид.');
  return { type: body.type, solidsStart, allergyRisk: body.allergyRisk === true, updatedAt: new Date().toISOString() };
}

export const infantRoutes = {
  'PUT /api/patients/:id/feeding': (ctx) => {
    const { store, params, body, doctor } = ctx;
    const p = store.patient(params.id);
    if (!p) notFound('Досието не е намерено.');
    if (ageInMonthsExact(p.birthDate, today()) >= FEEDING_MAX_MONTHS) bad('Планът за хранене е за кърмачета — до 1 година.');
    p.feeding = readFeeding(body);
    p.updatedAt = new Date().toISOString();
    store.persist();
    store.audit(doctor, 'feeding_update', { patientId: p.id, name: p.name, type: p.feeding.type });
    return { feeding: p.feeding };
  },
};
