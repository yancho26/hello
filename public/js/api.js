/* Връзка със сървъра. Всички грешки идват като съобщения на български. */

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

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
    throw new ApiError(0, 'Няма връзка със сървъра на практиката. Проверете дали програмата работи.');
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
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
  login: (doctorId, pin) => request('POST', '/api/login', { doctorId, pin }),
  logout: () => request('POST', '/api/logout', {}),
  bootstrap: () => request('GET', '/api/bootstrap'),

  patients: (params) => request('GET', '/api/patients' + qs(params)),
  patient: (id, params) => request('GET', `/api/patients/${id}` + qs(params)),
  createPatient: (data) => request('POST', '/api/patients', data),
  updatePatient: (id, data) => request('PATCH', `/api/patients/${id}`, data),
  archivePatient: (id, archived, reason) =>
    request('POST', `/api/patients/${id}/archive`, { archived, reason }),

  setRecord: (id, itemId, data) => request('PUT', `/api/patients/${id}/records/${itemId}`, data),
  clearRecord: (id, itemId) => request('DELETE', `/api/patients/${id}/records/${itemId}`),
  setOptIn: (id, optIn) => request('PUT', `/api/patients/${id}/optin`, { optIn }),

  addMeasurement: (id, data) => request('POST', `/api/patients/${id}/measurements`, data),
  deleteMeasurement: (id, mid) => request('DELETE', `/api/patients/${id}/measurements/${mid}`),

  addVisit: (id, data) => request('POST', `/api/patients/${id}/visits`, data),
  deleteVisit: (id, vid) => request('DELETE', `/api/patients/${id}/visits/${vid}`),

  addReminder: (id, data) => request('POST', `/api/patients/${id}/reminders`, data),
  updateReminder: (id, rid, data) => request('PATCH', `/api/patients/${id}/reminders/${rid}`, data),
  deleteReminder: (id, rid) => request('DELETE', `/api/patients/${id}/reminders/${rid}`),

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

  exportAll: () => request('GET', '/api/export'),
  importAll: (data) => request('POST', '/api/import', data),
};
