const TOKEN_KEY = 'mcfly_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

let alExpirarSesion = () => {};
export const onSesionExpirada = (fn) => { alExpirarSesion = fn; };

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && token) alExpirarSesion();
    throw new ApiError(res.status, data?.error || 'Ocurrió un error.', data);
  }
  return data;
}

export async function apiSubir(path, blob) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': blob.type },
      body: blob,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) alExpirarSesion();
    throw new ApiError(res.status, data?.error || 'Ocurrió un error.', data);
  }
  return data;
}