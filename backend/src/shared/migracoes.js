// Migrations VERSIONADAS (node-pg-migrate). Complementa — não substitui ainda — as
// migrations idempotentes de boot dos módulos (CREATE IF NOT EXISTS).
//
// Regra a partir da Sprint 3: TODA mudança de schema nova nasce como arquivo em
// backend/migrations/ (numerado, com up/down), nunca mais como ALTER solto no boot.
// As de boot ficam congeladas como "baseline" até serem consolidadas.
//
// Onde roda:
//   1) `npm run migrate`  — release command no Railway (antes do processo subir). Ideal.
//   2) app.js migrar()    — também no boot, sob o mesmo advisory lock. Rede de segurança:
//      se alguém esquecer o release command, a API não sobe com schema velho.
// Ambas são idempotentes: a tabela pgmigrations registra o que já rodou.
const path = require('path');
const { pool } = require('./db');
const log = require('./logger');

async function rodarMigracoes({ direcao = 'up', quantidade, verificar = false } = {}) {
  const { default: runner } = await import('node-pg-migrate');
  const client = await pool.connect();
  try {
    const aplicadas = await runner({
      dbClient: client,
      dir: path.join(__dirname, '..', '..', 'migrations'),
      direction: direcao,
      count: quantidade,
      migrationsTable: 'pgmigrations',
      checkOrder: true,
      verbose: false,
      dryRun: verificar,
      log: (m) => log.info({ migracao: true }, String(m).trim()),
      logger: { info: () => {}, warn: (m) => log.warn(String(m)), error: (m) => log.error(String(m)), debug: () => {} },
    });
    if (aplicadas.length) log.info({ aplicadas: aplicadas.map((m) => m.name) }, `migrations versionadas: ${aplicadas.length} aplicada(s)`);
    else log.info('migrations versionadas: nada pendente');
    return aplicadas;
  } finally {
    client.release();
  }
}

module.exports = { rodarMigracoes };
