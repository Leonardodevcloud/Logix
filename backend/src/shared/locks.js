// Locks distribuídos via Postgres (pg_advisory_lock) — sem dependência de Redis.
//
// comLockExclusivo('cron:fechamento', fn): se outro processo (réplica da API ou
// worker) já estiver executando com a mesma chave, esta chamada é PULADA (não
// espera). É a garantia de que um job nunca roda em duplicidade, mesmo com o cron
// embutido em N réplicas por engano.
const crypto = require('crypto');
const { pool } = require('./db');
const log = require('./logger');

// Chave textual -> int64 estável (o advisory lock recebe bigint).
function chaveNumerica(nome) {
  const h = crypto.createHash('sha1').update(String(nome)).digest();
  return h.readBigInt64BE(0).toString();
}

async function comLockExclusivo(nome, fn) {
  const chave = chaveNumerica(nome);
  const client = await pool.connect();
  let obteve = false;
  try {
    const r = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS ok', [chave]);
    obteve = !!(r.rows[0] && r.rows[0].ok);
    if (!obteve) { log.debug({ lock: nome }, 'lock ocupado — pulando'); return { executou: false }; }
    const resultado = await fn();
    return { executou: true, resultado };
  } finally {
    if (obteve) { try { await client.query('SELECT pg_advisory_unlock($1::bigint)', [chave]); } catch { /* conexão pode ter caído */ } }
    client.release();
  }
}

module.exports = { comLockExclusivo, chaveNumerica };
