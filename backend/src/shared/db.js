// Pool de conexão PostgreSQL (Neon). Toda query usa parâmetros $1, $2... (nunca concatenação).
const { Pool } = require('pg');

// SSL configurável por provedor:
//  - Managed com proxy público (Railway proxy, Supabase, Neon) -> DB_SSL=true (padrão)
//  - PostgreSQL interno do Railway (rede privada *.railway.internal) ou VPS local -> DB_SSL=false
const usarSSL = process.env.DB_SSL !== 'false';
// Validação do certificado LIGADA por padrão (Neon/Supabase/RDS usam CA pública).
// Só desligue (DB_SSL_REJECT_UNAUTHORIZED=false) para proxy público do Railway com
// certificado autoassinado — e prefira a URL interna (*.railway.internal) com DB_SSL=false.
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: usarSSL ? { rejectUnauthorized } : false,
  max: Number(process.env.DB_POOL_MAX) || 12,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  allowExitOnIdle: false,
  // Teto de 20s por query: evita que uma consulta travada segure a conexão para sempre.
  // Aplicado no handshake da conexão (parâmetro de sessão do Postgres).
  options: `-c statement_timeout=${Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 20000}`,
  application_name: process.env.SERVICO_NOME || 'logix-api',
});

const log = require('./logger');
pool.on('error', (err) => log.error({ err }, 'erro inesperado no pool pg'));
// (statement_timeout é definido via `options` na conexão — ver acima. O antigo
// pool.on('connect') + client.query disparava um DeprecationWarning do pg por
// enfileirar query junto com a primeira do chamador.)

async function query(texto, params = []) {
  return pool.query(texto, params);
}

module.exports = { pool, query };

// ── Row-Level Security (ADR-012) ──────────────────────────────────────────────
// Com RLS_ENABLED=true, todo checkout de conexão define app.empresa_id com a
// empresa do contexto da requisição (vazio = sem restrição). O parâmetro é de
// SESSÃO e a conexão é reaproveitada por outros tenants — por isso é redefinido em
// TODO checkout, inclusive para vazio. Custo: 1 round-trip extra por checkout.
// Cobre pool.query() e pool.connect() (pg usa connect internamente).
const RLS_ATIVO = process.env.RLS_ENABLED === 'true';
if (RLS_ATIVO) {
  const { getRlsEmpresa } = require('./contexto');
  const connectOriginal = pool.connect.bind(pool);
  pool.connect = function connectComRls(cb) {
    const p = connectOriginal().then(async (client) => {
      try {
        await client.query("SELECT set_config('app.empresa_id', $1, false)", [getRlsEmpresa() || '']);
      } catch (e) { client.release(e); throw e; }
      return client;
    });
    if (typeof cb === 'function') {
      p.then((client) => cb(undefined, client, (err) => client.release(err)), (err) => cb(err, undefined, () => {}));
      return undefined;
    }
    return p;
  };
  log.info('RLS ativo: app.empresa_id definido por checkout de conexão');
}
function rlsAtivo() { return RLS_ATIVO; }

// RLS "ligado" com usuário superuser é falsa segurança: superuser ignora políticas.
// Chamado no boot (loga erro) e exposto em /health/ready (rls.efetivo).
async function verificarRls() {
  if (!RLS_ATIVO) return { ativo: false, efetivo: false };
  try {
    const { rows } = await pool.query('SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user');
    const superuser = !!(rows[0] && rows[0].superuser);
    if (superuser) log.error('RLS_ENABLED=true mas o usuário do banco é SUPERUSER — as políticas são ignoradas. Troque para um papel NOSUPERUSER (DEPLOY-rls.md).');
    return { ativo: true, efetivo: !superuser, superuser };
  } catch (e) { return { ativo: true, efetivo: false, erro: e.message }; }
}
module.exports.verificarRls = verificarRls;

// Métricas simples do pool (expostas em /health/ready e futuramente em /metrics).
function estadoPool() {
  return { total: pool.totalCount, ociosas: pool.idleCount, aguardando: pool.waitingCount, max: pool.options.max };
}

// Encerramento limpo (graceful shutdown): espera as queries em voo e fecha o pool.
async function encerrarPool() { try { await pool.end(); } catch (_) { /* já fechado */ } }

module.exports.estadoPool = estadoPool;
module.exports.rlsAtivo = rlsAtivo;
module.exports.encerrarPool = encerrarPool;
