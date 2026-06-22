// Cliente HTTP: injeta Bearer, trata 401 com refresh automático (uma vez) e padroniza erros.
let BASE = window.LOGIX_API || '/api/v1';
let accessToken = null;

export function setBase(url) { BASE = url; }
export function setToken(t) { accessToken = t; }
export function getToken() { return accessToken; }

async function bruto(metodo, caminho, { corpo, headers = {}, empresaId } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (accessToken) h.Authorization = 'Bearer ' + accessToken;
  if (empresaId) h['X-Empresa-Id'] = empresaId;
  return fetch(BASE + caminho, {
    method: metodo, headers: h, credentials: 'include',
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

async function tentarRenovar() {
  try {
    const resp = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!resp.ok) return false;
    const d = await resp.json();
    if (d.accessToken) { accessToken = d.accessToken; return true; }
  } catch { /* ignora */ }
  return false;
}

export async function req(metodo, caminho, opts = {}) {
  let resp = await bruto(metodo, caminho, opts);
  if (resp.status === 401 && caminho !== '/auth/refresh') {
    if (await tentarRenovar()) resp = await bruto(metodo, caminho, opts);
  }
  const dados = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw Object.assign(new Error((dados && dados.erro) || 'Erro de rede'), { status: resp.status, dados });
  }
  return dados;
}

export const get = (c, o) => req('GET', c, o);
export const post = (c, corpo, o = {}) => req('POST', c, { ...o, corpo });
export const put = (c, corpo, o = {}) => req('PUT', c, { ...o, corpo });
export const patch = (c, corpo, o = {}) => req('PATCH', c, { ...o, corpo });
export const del = (c, o) => req('DELETE', c, o);
