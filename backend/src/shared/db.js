// Pool de conexão PostgreSQL (Neon). Toda query usa parâmetros $1, $2... (nunca concatenação).
const { Pool } = require('pg');

// SSL configurável por provedor:
//  - Managed com proxy público (Railway proxy, Supabase, Neon) -> DB_SSL=true (padrão)
//  - PostgreSQL interno do Railway (rede privada *.railway.internal) ou VPS local -> DB_SSL=false
const usarSSL = process.env.DB_SSL !== 'false';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: usarSSL ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[db] erro inesperado no pool:', err.message));

async function query(texto, params = []) {
  return pool.query(texto, params);
}

module.exports = { pool, query };
