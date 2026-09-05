// Camada de storage para arquivos (documentos e fotos dos motoboys).
// Compatível com qualquer provedor S3: Cloudflare R2, AWS S3, MinIO, etc.
// O banco guarda apenas a `storage_key`; o arquivo vive no bucket.
//
// Variáveis de ambiente necessárias:
//   STORAGE_ENDPOINT      ex (R2): https://<accountid>.r2.cloudflarestorage.com
//   STORAGE_REGION        ex: auto (R2) ou us-east-1 (S3)
//   STORAGE_BUCKET        nome do bucket
//   STORAGE_ACCESS_KEY    access key id
//   STORAGE_SECRET_KEY    secret access key
//   STORAGE_PUBLIC_URL    (opcional) base de URL pública do bucket, se tiver domínio público

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const BUCKET = process.env.STORAGE_BUCKET;
const PUBLIC_URL = process.env.STORAGE_PUBLIC_URL || null;

let _client = null;
function client() {
  if (_client) return _client;
  if (!process.env.STORAGE_ENDPOINT || !process.env.STORAGE_ACCESS_KEY) {
    throw new Error('Storage não configurado. Defina STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY.');
  }
  _client = new S3Client({
    region: process.env.STORAGE_REGION || 'auto',
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.STORAGE_SECRET_KEY,
    },
    forcePathStyle: true, // necessário para R2/MinIO
  });
  return _client;
}

function storageConfigurado() {
  return !!(process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY);
}

// Gera uma chave única e organizada por empresa/motoboy.
function gerarChave({ empresaId, motoboyId, tipo, mime }) {
  const ext = (mime && mime.split('/')[1]) ? mime.split('/')[1].replace('jpeg', 'jpg') : 'bin';
  const rand = crypto.randomBytes(6).toString('hex');
  return `empresas/${empresaId}/motoboys/${motoboyId}/${tipo}-${Date.now()}-${rand}.${ext}`;
}

// Sobe um Buffer e retorna a chave.
async function subirArquivo({ empresaId, motoboyId, tipo, buffer, mime }) {
  const key = gerarChave({ empresaId, motoboyId, tipo, mime });
  await client().send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buffer, ContentType: mime || 'application/octet-stream',
  }));
  return key;
}

// Sobe a partir de uma data URI base64 (ex: "data:image/jpeg;base64,...").
async function subirBase64({ empresaId, motoboyId, tipo, dataUri }) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUri || '');
  if (!m) throw new Error('Formato de arquivo inválido (esperado data URI base64)');
  const mime = m[1];
  const buffer = Buffer.from(m[2], 'base64');
  const tamanho = buffer.length;
  const key = await subirArquivo({ empresaId, motoboyId, tipo, buffer, mime });
  return { key, mime, tamanho };
}

// URL para visualizar o arquivo. Se o bucket tem domínio público, usa direto;
// senão gera uma URL assinada temporária (1h).
async function urlDe(key, { expiraSeg = 3600 } = {}) {
  if (!key) return null;
  if (PUBLIC_URL) return `${PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: expiraSeg });
}

async function removerArquivo(key) {
  if (!key) return;
  try { await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); } catch (e) { /* ignora */ }
}

// ── Upload DIRETO (URL pré-assinada) ──────────────────────────────────────────
// O cliente (app/painel) faz PUT do arquivo direto no bucket; a API só emite a URL
// e depois confirma a chave. Bytes nunca passam pela API (ver módulo uploads).
const FINALIDADES = ['protocolo', 'documento', 'chat', 'cadastro', 'logo'];

function extensaoDe(mime) {
  const m = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  return m[mime] || 'bin';
}

// Chave por empresa/finalidade/ano-mês/uuid. O prefixo empresas/<id>/ é o que
// permite validar depois que a chave pertence ao tenant que a está usando.
function gerarChaveUpload({ empresaId, finalidade, mime }) {
  if (!FINALIDADES.includes(finalidade)) throw new Error('Finalidade de upload inválida');
  const d = new Date();
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `empresas/${empresaId}/${finalidade}/${ym}/${crypto.randomUUID()}.${extensaoDe(mime)}`;
}

function chavePertenceA(key, empresaId, finalidade = null) {
  if (typeof key !== 'string' || key.includes('..') || key.startsWith('/')) return false;
  const pref = `empresas/${empresaId}/`;
  if (!key.startsWith(pref)) return false;
  if (finalidade && !key.startsWith(pref + finalidade + '/')) return false;
  return true;
}

// URL assinada para PUT. Content-Type entra na assinatura: o cliente tem que enviar
// exatamente esse header, senão o bucket rejeita.
async function urlUpload({ key, mime, expiraSeg = 600 }) {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mime }), { expiresIn: expiraSeg });
}

// HEAD do objeto: existe? tamanho? tipo? (null se não existir)
async function infoObjeto(key) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { tamanho: Number(r.ContentLength) || 0, mime: r.ContentType || null };
  } catch (e) {
    if (e && (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound')) return null;
    throw e;
  }
}

// Uma chave de storage ou uma URL? (para colunas que hoje guardam qualquer coisa)
function ehChaveStorage(v) { return typeof v === 'string' && v.startsWith('empresas/') && !v.startsWith('data:'); }

module.exports = { storageConfigurado, subirArquivo, subirBase64, urlDe, removerArquivo, FINALIDADES, gerarChaveUpload, chavePertenceA, urlUpload, infoObjeto, ehChaveStorage };
