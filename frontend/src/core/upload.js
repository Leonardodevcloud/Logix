// Upload DIRETO ao storage (R2) por URL assinada — painel.
//   1) POST /uploads/url { finalidade, mime, tamanho }  → { url, key }
//   2) PUT do File direto no R2 (o navegador fala com o bucket; a API não vê os bytes)
//   3) devolve a storage_key para a rota de negócio
// Se falhar (rede, bucket sem CORS, storage indisponível), devolve null e a tela cai
// no fluxo antigo (data URI base64) — o servidor aceita os dois.
import { post } from './api.js';

export async function uploadDireto(file, finalidade) {
  try {
    const mime = file.type || 'application/octet-stream';
    const pedido = await post('/uploads/url', { finalidade, mime, tamanho: file.size });
    if (!pedido || !pedido.url || !pedido.key) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    const r = await fetch(pedido.url, { method: 'PUT', headers: { 'Content-Type': mime }, body: file, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return pedido.key;
  } catch (e) {
    console.warn('[upload direto] falhou, usando base64:', e && e.message);
    return null;
  }
}
