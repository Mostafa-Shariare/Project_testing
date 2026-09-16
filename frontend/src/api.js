const API_BASE = import.meta.env.VITE_API_URL || '';

export function getToken() {
  return localStorage.getItem('auth_token');
}

export function setAuth(token, username) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_username', username);
}

export function clearAuth() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_username');
  localStorage.removeItem('active_class_code');
}

export function getUsername() {
  return localStorage.getItem('auth_username') || '';
}

export function getActiveClass() {
  return localStorage.getItem('active_class_code') || '';
}

export function setActiveClass(code) {
  if (code) localStorage.setItem('active_class_code', code);
  else localStorage.removeItem('active_class_code');
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || d).join(', ')
          : data.message || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

export function wsUrl(path) {
  const token = getToken();
  const classCode = getActiveClass();
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? '127.0.0.1:8000' : window.location.host;
  const base = `${proto}//${host}`;
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (classCode) params.set('class_code', classCode);
  const q = params.toString() ? `?${params.toString()}` : '';
  return `${base}${path}${q}`;
}

export function exportHistoryUrl(classCode, fromDate, toDate) {
  const base = API_BASE || '';
  const params = new URLSearchParams();
  if (classCode) params.set('class_code', classCode);
  if (fromDate != null) params.set('from_date', String(fromDate));
  if (toDate != null) params.set('to_date', String(toDate));
  const q = params.toString() ? `?${params.toString()}` : '';
  return `${base}/api/analytics/history/export${q}`;
}

export async function downloadReport(path, filename) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Download failed');
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
