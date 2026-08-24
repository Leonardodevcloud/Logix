// Cliente HTTP: injeta Bearer, trata 401 com refresh automático (uma vez) e padroniza erros.
let BASE = window.LOGIX_API || '/api/v1';
let accessToken = null;
let _bloqueioRefresh = false; // true quando impersonando — nunca renovar com cookie do master

export function setBase(url) { BASE = url; }
export function setToken(t) { accessToken = t; }
export function getToken() { return accessToken; }
export function bloquearRefresh(v) { _bloqueioRefresh = v; }

async function bruto(metodo, caminho, { corpo, headers = {}, empresaId } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (accessToken) h.Authorization = 'Bearer ' + accessToken;
  if (empresaId) h['X-Empresa-Id'] = empresaId;
  const opc = {
    method: metodo, headers: h, credentials: 'include',
    body: corpo ? JSON.stringify(corpo) : undefined,
  };
  // Timeout de segurança só em GET (leituras). Não afeta uploads (POST/PUT/PATCH).
  // 40s dá folga para o cold start do backend, mas evita chamadas penduradas.
  let timer = null;
  if (metodo === 'GET' && typeof AbortController !== 'undefined') {
    const ac = new AbortController();
    opc.signal = ac.signal;
    timer = setTimeout(() => ac.abort(), 40000);
  }
  try {
    return await fetch(BASE + caminho, opc);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tentarRenovar() {
  // Nunca renovar via cookie quando impersonando — o cookie é do master e derrubaria a sessão do cliente
  if (_bloqueioRefresh) return false;
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

export const get   = (c, o)       => req('GET',    c, o);
export const post  = (c, corpo, o = {}) => req('POST',   c, { ...o, corpo });
export const put   = (c, corpo, o = {}) => req('PUT',    c, { ...o, corpo });
export const patch = (c, corpo, o = {}) => req('PATCH',  c, { ...o, corpo });
export const del   = (c, o)       => req('DELETE',  c, o);

// Baixa um arquivo autenticado (relatórios: xls/csv). Usa o token atual e
// respeita o filename vindo do Content-Disposition.
export async function baixar(caminho, nomeSugerido) {
  const h = {};
  if (accessToken) h.Authorization = 'Bearer ' + accessToken;
  const resp = await fetch(BASE + caminho, { headers: h, credentials: 'include' });
  if (!resp.ok) throw new Error('Falha ao baixar (' + resp.status + ')');
  const blob = await resp.blob();
  let nome = nomeSugerido || 'relatorio';
  const cd = resp.headers.get('Content-Disposition');
  if (cd) { const m = /filename="?([^"]+)"?/.exec(cd); if (m) nome = m[1]; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
