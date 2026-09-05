// Cliente Redis (ioredis) — OPCIONAL. Sem REDIS_URL o sistema funciona em modo
// "1 réplica" (estado em memória), exatamente como antes. Com REDIS_URL:
//   - WebSocket: pub/sub entre réplicas (realtime/ws.js)
//   - rate-limit: contadores compartilhados (middleware/rateLimit.js)
//   - cache: ORS/Google compartilhado (shared/cache.js)
// Dois clientes: um para comandos e um dedicado a SUBSCRIBE (exigência do protocolo).
const log = require('./logger');

let Redis = null;
let cliente = null;
let assinante = null;
let disponivel = false;

function configurado() { return !!process.env.REDIS_URL; }

function criar(nome) {
  if (!Redis) Redis = require('ioredis');
  const r = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,       // sem Redis, falha rápido em vez de enfileirar
    connectTimeout: 5000,
    retryStrategy: (n) => Math.min(30000, 500 * 2 ** Math.min(n, 6)),
    connectionName: `${process.env.SERVICO_NOME || 'logix-api'}:${nome}`,
  });
  r.on('ready', () => { disponivel = true; log.info({ redis: nome }, 'redis pronto'); });
  r.on('error', (e) => { if (disponivel) log.error({ err: e, redis: nome }, 'redis erro'); disponivel = false; });
  r.on('close', () => { disponivel = false; });
  return r;
}

// Conecta (idempotente). Retorna false se REDIS_URL não estiver definida.
async function iniciarRedis() {
  if (!configurado()) { log.info('REDIS_URL ausente — modo 1 réplica (estado em memória)'); return false; }
  if (cliente) return true;
  cliente = criar('cmd');
  assinante = criar('sub');
  try {
    await Promise.all([cliente.connect(), assinante.connect()]);
    return true;
  } catch (e) {
    log.error({ err: e }, 'não foi possível conectar ao Redis — seguindo em memória');
    return false;
  }
}

function redis() { return cliente; }
function redisSub() { return assinante; }
function redisDisponivel() { return !!cliente && disponivel; }

async function encerrarRedis() {
  for (const c of [cliente, assinante]) { try { if (c) await c.quit(); } catch { /* ignora */ } }
  cliente = null; assinante = null; disponivel = false;
}

module.exports = { configurado, iniciarRedis, redis, redisSub, redisDisponivel, encerrarRedis };
