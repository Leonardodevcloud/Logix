// Módulo UPLOADS — mecanismo único de envio de arquivos para todo o sistema.
//
//   1) cliente → POST /uploads/...  { finalidade, mime, tamanho }  → { key, url, headers, expira_em }
//   2) cliente → PUT url (direto no R2/S3) com o arquivo e o header Content-Type
//   3) cliente → rota de negócio com { storage_key }
//   4) rota de negócio → confirmarChave(): prefixo da empresa + objeto existe + tamanho ≤ limite
//
// Os bytes NUNCA passam pela API. O banco guarda só a chave; a URL de leitura é
// assinada na hora de exibir (storage.urlDe).
const AppError = require('../../shared/AppError');
const storage = require('../../shared/storage');
const metricas = require('../../shared/metricas');
const log = require('../../shared/logger');

const MB = 1024 * 1024;
// Limites por finalidade. Documento aceita PDF (CNH digital, comprovante).
const REGRAS = {
  protocolo: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * MB },
  documento: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxBytes: 10 * MB },
  cadastro:  { mimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxBytes: 10 * MB },
  chat:      { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * MB },
  logo:      { mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], maxBytes: 2 * MB },
};

function regra(finalidade) {
  const r = REGRAS[finalidade];
  if (!r) throw AppError.validacao('Finalidade de upload inválida', { finalidades: Object.keys(REGRAS) });
  return r;
}

// Passo 1: emite a URL assinada. `tamanho` é declarado pelo cliente (pré-checagem
// barata); o tamanho REAL é verificado no passo 4 via HEAD.
async function criarUrlUpload({ empresaId, finalidade, mime, tamanho }) {
  if (!storage.storageConfigurado()) throw new AppError('Storage não configurado no servidor', 503, 'STORAGE_INDISPONIVEL');
  const r = regra(finalidade);
  if (!r.mimes.includes(mime)) throw AppError.validacao('Tipo de arquivo não permitido', { permitidos: r.mimes });
  if (tamanho != null && Number(tamanho) > r.maxBytes) throw AppError.validacao(`Arquivo muito grande (máx ${Math.round(r.maxBytes / MB)} MB)`);
  const key = storage.gerarChaveUpload({ empresaId, finalidade, mime });
  metricas.uploadsDireto.inc({ finalidade }); metricas.contarUpload(true);
  const url = await storage.urlUpload({ key, mime, expiraSeg: 600 });
  return { key, url, metodo: 'PUT', headers: { 'Content-Type': mime }, expira_em: new Date(Date.now() + 600_000).toISOString(), max_bytes: r.maxBytes };
}

// Passo 4: confirma que a chave é da empresa, é da finalidade certa, existe no
// bucket e respeita o tamanho. Devolve { key, mime, tamanho } para gravar.
async function confirmarChave({ empresaId, key, finalidade, finalidadesAceitas = null }) {
  const aceitas = finalidadesAceitas || [finalidade];
  if (!aceitas.some((f) => storage.chavePertenceA(key, empresaId, f))) {
    throw AppError.validacao('Arquivo inválido para esta operação', { campo: 'storage_key' });
  }
  const fin = aceitas.find((f) => storage.chavePertenceA(key, empresaId, f));
  const r = regra(fin);
  const info = await storage.infoObjeto(key);
  if (!info) throw AppError.validacao('Arquivo não encontrado no storage — faça o upload antes de confirmar', { campo: 'storage_key' });
  if (info.tamanho > r.maxBytes) { await storage.removerArquivo(key); throw AppError.validacao(`Arquivo muito grande (máx ${Math.round(r.maxBytes / MB)} MB)`); }
  if (info.mime && !r.mimes.includes(info.mime)) { await storage.removerArquivo(key); throw AppError.validacao('Tipo de arquivo não permitido'); }
  return { key, mime: info.mime, tamanho: info.tamanho };
}

// Compatibilidade: aceita chave (novo) OU data URI base64 (apps antigos). No caso
// legado, sobe para o storage em vez de deixar o base64 seguir para o banco.
async function resolverArquivo({ empresaId, motoboyId = null, finalidade, entrada, finalidadesAceitas = null }) {
  if (!entrada) return null;
  const chave = typeof entrada === 'string' ? entrada : (entrada.storage_key || entrada.key || null);
  if (storage.ehChaveStorage(chave)) return confirmarChave({ empresaId, key: chave, finalidade, finalidadesAceitas });
  if (typeof entrada === 'string' && /^data:[^;]+;base64,/.test(entrada)) {
    if (!storage.storageConfigurado()) throw new AppError('Storage não configurado no servidor', 503, 'STORAGE_INDISPONIVEL');
    metricas.uploadsLegado.inc({ finalidade }); metricas.contarUpload(false); log.info({ finalidade, bytes: entrada.length }, 'upload legado em base64 (cliente antigo)');
    return storage.subirBase64({ empresaId, motoboyId: motoboyId || empresaId, tipo: finalidade, dataUri: entrada });
  }
  // Base64 "cru" (sem prefixo data:) — o app antigo de conclusão mandava assim.
  if (typeof entrada === 'string' && /^[A-Za-z0-9+/=]{100,}$/.test(entrada.slice(0, 200))) {
    const mime = entrada.startsWith('/9j/') ? 'image/jpeg' : entrada.startsWith('iVBOR') ? 'image/png' : entrada.startsWith('UklG') ? 'image/webp' : 'image/jpeg';
    metricas.uploadsLegado.inc({ finalidade }); metricas.contarUpload(false); log.info({ finalidade, bytes: entrada.length }, 'upload legado em base64 cru (app antigo)');
    return storage.subirBase64({ empresaId, motoboyId: motoboyId || empresaId, tipo: finalidade, dataUri: `data:${mime};base64,${entrada}` });
  }
  throw AppError.validacao('Arquivo inválido: envie a storage_key do upload ou o arquivo em base64');
}

// Leitura: transforma chave em URL assinada; URL/data URI legada passa direto.
async function urlParaExibir(valor, { expiraSeg = 3600 } = {}) {
  if (!valor) return null;
  if (storage.ehChaveStorage(valor)) { try { return await storage.urlDe(valor, { expiraSeg }); } catch { return null; } }
  return valor;
}

module.exports = { criarUrlUpload, confirmarChave, resolverArquivo, urlParaExibir, REGRAS };
