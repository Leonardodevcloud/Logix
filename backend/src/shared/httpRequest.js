// Utilitário HTTP para integrações externas (fetch nativo do Node 18+) com timeout.
async function httpRequest(url, { metodo = 'GET', headers = {}, corpo = null, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
    const texto = await resp.text();
    let dados;
    try { dados = JSON.parse(texto); } catch { dados = texto; }
    return { ok: resp.ok, status: resp.status, dados };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { httpRequest };
