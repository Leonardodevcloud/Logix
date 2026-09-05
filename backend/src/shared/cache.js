// Cache chave/valor com TTL. Redis quando disponível (compartilhado entre réplicas),
// senão node-cache local. API assíncrona para os dois casos.
//   const v = await cache.obter('ors:rota:abc');
//   await cache.guardar('ors:rota:abc', valor, 120);   // ttl em segundos
const NodeCache = require('node-cache');
const { redis, redisDisponivel } = require('./redis');

const local = new NodeCache({ stdTTL: 120, checkperiod: 180, useClones: false });
const PREFIXO = 'lx:cache:';

async function obter(chave) {
  if (redisDisponivel()) {
    try {
      const v = await redis().get(PREFIXO + chave);
      return v == null ? undefined : JSON.parse(v);
    } catch { /* cai no local */ }
  }
  return local.get(chave);
}

async function guardar(chave, valor, ttlSeg = 120) {
  local.set(chave, valor, ttlSeg);
  if (redisDisponivel()) {
    try { await redis().set(PREFIXO + chave, JSON.stringify(valor), 'EX', Math.max(1, Math.round(ttlSeg))); } catch { /* ignora */ }
  }
}

async function apagar(chave) {
  local.del(chave);
  if (redisDisponivel()) { try { await redis().del(PREFIXO + chave); } catch { /* ignora */ } }
}

module.exports = { obter, guardar, apagar };
