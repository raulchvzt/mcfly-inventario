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

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Una petición se puede repetir sin riesgo si solo consulta datos o es el inicio de sesión.
// Las demás (registrar una compra, por ejemplo) nunca se repiten solas.
const esRepetible = (method, path) => method === 'GET' || path === '/auth/login';

// Si el servidor no responde, o el proxy se cae antes de llegar al backend, la respuesta
// no trae el JSON de la API. Eso pasa en la primera conexión después de arrancar.
const fallaDeConexion = (res) => res.status >= 500 && res.headers.get('content-type')?.includes('json') !== true;

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const pedir = () =>
    fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res;
  try {
    res = await pedir();
    if (fallaDeConexion(res) && esRepetible(method, path)) {
      await esperar(500);
      res = await pedir();
    }
  } catch {
    if (!esRepetible(method, path)) throw new ApiError(0, 'No se pudo conectar con el servidor.');
    try {
      await esperar(500);
      res = await pedir();
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor.');
    }
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