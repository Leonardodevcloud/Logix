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

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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

module.exports = { storageConfigurado, subirArquivo, subirBase64, urlDe, removerArquivo };
