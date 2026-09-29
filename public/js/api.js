/* Връзка със сървъра. Всички грешки идват като съобщения на български. */

import { markDown, markUp } from './connection.js';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* Когато сесията изтече (или е изтекло времето без активност), сървърът
 * отговаря с 401 — връщаме потребителя към екрана за вход. */
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

const PUBLIC = new Set(['/api/state', '/api/login', '/api/setup', '/api/logout', '/api/activate', '/api/workspace']);

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    markDown();
    throw new ApiError(0, 'Няма връзка с програмата. Проверете дали тя работи на компютъра, на който е инсталирана.');
  }
  markUp();

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (res.status === 401 && onUnauthorized && !PUBLIC.has(path.split('?')[0])) {
    onUnauthorized();
  }
  // Програмата не е активирана (например ключът е сменен от друг компютър) — към екрана за ключ.
  if (res.status === 403 && data && data.needsActivation) location.reload();
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || `Грешка ${res.status}.`);
  }
  return data;
}

const qs = (params) => {
  const usable = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return usable.length ? '?' + new URLSearchParams(usable).toString() : '';
};

export const api = {
  ApiError,

  state: () => request('GET', '/api/state'),
  setup: (data) => request('POST', '/api/setup', data),
  login: (doctorId, pin, workspace) => request('POST', '/api/login', { doctorId, pin, workspace }),
  /** Избор на практиката при входа: 'gp', 'simp' или null (обратно към избора). */
  chooseWorkspace: (workspace) => request('POST', '/api/workspace', { workspace }),
  logout: () => request('POST', '/api/logout', {}),
  activate: (key) => request('POST', '/api/activate', { key }),
  bootstrap: () => request('GET', '/api/bootstrap'),

  patients: (params) => request('GET', '/api/patients' + qs(params)),
  patient: (id, params) => request('GET', `/api/patients/${id}` + qs(params)),
  createPatient: (data) => request('POST', '/api/patients', data),
  updatePatient: (id, data) => request('PATCH', `/api/patients/${id}`, data),
  archivePatient: (id, archived, reason) =>
    request('POST', `/api/patients/${id}/archive`, { archived, reason }),

  setRecord: (id, itemId, data) =>
    request('PUT', `/api/patients/${id}/records/${encodeURIComponent(itemId)}`, data),
  clearRecord: (id, itemId) => request('DELETE', `/api/patients/${id}/records/${encodeURIComponent(itemId)}`),
  addHistory: (id, data) => request('POST', `/api/patients/${id}/records`, data),
  setOptIn: (id, optIn) => request('PUT', `/api/patients/${id}/optin`, { optIn }),

  addMeasurement: (id, data) => request('POST', `/api/patients/${id}/measurements`, data),
  deleteMeasurement: (id, mid) => request('DELETE', `/api/patients/${id}/measurements/${mid}`),

  addDevelopment: (id, data) => request('POST', `/api/patients/${id}/development`, data),
  deleteDevelopment: (id, devId) => request('DELETE', `/api/patients/${id}/development/${devId}`),

  addVisit: (id, data) => request('POST', `/api/patients/${id}/visits`, data),
  deleteVisit: (id, vid) => request('DELETE', `/api/patients/${id}/visits/${vid}`),

  addReminder: (id, data) => request('POST', `/api/patients/${id}/reminders`, data),
  updateReminder: (id, rid, data) => request('PATCH', `/api/patients/${id}/reminders/${rid}`, data),
  deleteReminder: (id, rid) => request('DELETE', `/api/patients/${id}/reminders/${rid}`),

  addCondition: (id, data) => request('POST', `/api/patients/${id}/chronic`, data),
  updateCondition: (id, cid, data) => request('PATCH', `/api/patients/${id}/chronic/${cid}`, data),
  deleteCondition: (id, cid) => request('DELETE', `/api/patients/${id}/chronic/${cid}`),

  addMed: (id, data) => request('POST', `/api/patients/${id}/meds`, data),
  updateMed: (id, mid, data) => request('PATCH', `/api/patients/${id}/meds/${mid}`, data),
  deleteMed: (id, mid) => request('DELETE', `/api/patients/${id}/meds/${mid}`),

  addResults: (id, data) => request('POST', `/api/patients/${id}/results`, data),
  deleteResult: (id, rid) => request('DELETE', `/api/patients/${id}/results/${rid}`),

  addAssessment: (id, data) => request('POST', `/api/patients/${id}/assessments`, data),
  deleteAssessment: (id, aid) => request('DELETE', `/api/patients/${id}/assessments/${aid}`),

  setLifestyle: (id, data) => request('PUT', `/api/patients/${id}/lifestyle`, data),
  nutrition: (id, data) => request('POST', `/api/patients/${id}/nutrition`, data),
  deleteNutrition: (id, nid) => request('DELETE', `/api/patients/${id}/nutrition/${nid}`),

  addStudy: (id, data) => request('POST', `/api/patients/${id}/studies`, data),
  deleteStudy: (id, sid) => request('DELETE', `/api/patients/${id}/studies/${sid}`),
  addNodule: (id, data) => request('POST', `/api/patients/${id}/nodules`, data),
  updateNodule: (id, nid, data) => request('PATCH', `/api/patients/${id}/nodules/${nid}`, data),
  deleteNodule: (id, nid) => request('DELETE', `/api/patients/${id}/nodules/${nid}`),
  addNoduleExam: (id, nid, data) => request('POST', `/api/patients/${id}/nodules/${nid}/exams`, data),
  addNoduleFna: (id, nid, data) => request('POST', `/api/patients/${id}/nodules/${nid}/fna`, data),
  deleteNoduleEntry: (id, nid, list, eid) => request('DELETE', `/api/patients/${id}/nodules/${nid}/${list}/${eid}`),
  specialty: (module, params) => request('GET', `/api/specialty/${module}` + qs(params)),

  // Практиката за СИМП.
  addExam: (id, data) => request('POST', `/api/patients/${id}/exams`, data),
  updateExam: (id, vid, data) => request('PUT', `/api/patients/${id}/exams/${vid}`, data),
  addReferral: (id, data) => request('POST', `/api/patients/${id}/referrals`, data),
  updateReferral: (id, rid, data) => request('PATCH', `/api/patients/${id}/referrals/${rid}`, data),
  deleteReferral: (id, rid) => request('DELETE', `/api/patients/${id}/referrals/${rid}`),
  addProtocol: (id, data) => request('POST', `/api/patients/${id}/protocols`, data),
  updateProtocol: (id, prid, data) => request('PATCH', `/api/patients/${id}/protocols/${prid}`, data),
  deleteProtocol: (id, prid) => request('DELETE', `/api/patients/${id}/protocols/${prid}`),
  addFollowup: (id, data) => request('POST', `/api/patients/${id}/followups`, data),
  updateFollowup: (id, fid, data) => request('PATCH', `/api/patients/${id}/followups/${fid}`, data),
  deleteFollowup: (id, fid) => request('DELETE', `/api/patients/${id}/followups/${fid}`),
  appointments: (params) => request('GET', '/api/appointments' + qs(params)),
  addAppointment: (data) => request('POST', '/api/appointments', data),
  updateAppointment: (aid, data) => request('PATCH', `/api/appointments/${aid}`, data),
  deleteAppointment: (aid) => request('DELETE', `/api/appointments/${aid}`),
  simpOverview: (params) => request('GET', '/api/simp/overview' + qs(params)),
  simpReports: (params) => request('GET', '/api/simp/reports' + qs(params)),

  tasks: (params) => request('GET', '/api/tasks' + qs(params)),
  reports: (params) => request('GET', '/api/reports' + qs(params)),
  audit: (limit) => request('GET', '/api/audit' + qs({ limit })),

  addDoctor: (data) => request('POST', '/api/doctors', data),
  updateDoctor: (id, data) => request('PATCH', `/api/doctors/${id}`, data),
  updateSettings: (data) => request('PATCH', '/api/settings', data),

  updateScheduleItem: (itemId, data) => request('PUT', `/api/schedule/${itemId}`, data),
  addScheduleItem: (data) => request('POST', '/api/schedule', data),
  deleteScheduleItem: (itemId) => request('DELETE', `/api/schedule/${itemId}`),
  resetSchedule: () => request('POST', '/api/schedule/reset', {}),

  stopProgram: () => request('POST', '/api/system/stop', {}),
  systemCheck: () => request('GET', '/api/system/check'),
  copyBackupNow: () => request('POST', '/api/backup/extra', {}),

  importRead: (data) => request('POST', '/api/import/read', data),
  importPatients: (data) => request('POST', '/api/import/patients', data),

  exportAll: () => request('GET', '/api/export'),
  importAll: (data) => request('POST', '/api/import', data),
};
