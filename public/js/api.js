import { getToken, clearSession } from './session.js';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Check that it is running and try again.', 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      clearSession();
      window.location.href = '/login.html';
    }
    throw new ApiError((data && data.error) || `Request failed (${res.status}).`, res.status, data);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

/** Sends raw bytes (used for Help Room files). */
export async function uploadFile(path, file) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: file });
  } catch {
    throw new ApiError('Cannot reach the server. Check that it is running and try again.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError((data && data.error) || `Upload failed (${res.status}).`, res.status, data);
  return data;
}

/** Downloads a protected file (needs the login token, so a plain link will not work). */
export async function downloadFile(path, filename) {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* none */ }
    throw new ApiError((data && data.error) || 'Download failed.', res.status, data);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Builds "?a=1&b=2" from an object, skipping empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v === true ? 'true' : v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}
