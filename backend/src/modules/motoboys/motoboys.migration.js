const { query } = require('../../shared/db');

async function initMotoboysTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS motoboys (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      usuario_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_completo       TEXT NOT NULL,
      cpf                 VARCHAR(11) NOT NULL,
      rg                  TEXT,
      data_nascimento     DATE,
      telefone_principal  TEXT,
      telefone_emergencia TEXT,
      cep                 VARCHAR(8),
      endereco            TEXT,
      foto_url            TEXT,
      status              TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
      online              BOOLEAN NOT NULL DEFAULT FALSE,
      observacoes         TEXT,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, cpf)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_motoboys_empresa ON motoboys(empresa_id)`);
}

async function migrarMotoboys() {
  const cols = [
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS pin_hash TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS codigo INTEGER",
  ];
  for (const sql of cols) { try { await query(sql); } catch {} }

  // Backfill: numera sequencialmente (por empresa) os motoboys que ainda não têm código.
  try {
    await query(`
      WITH numerados AS (
        SELECT id, row_number() OVER (PARTITION BY empresa_id ORDER BY criado_em, id) AS seq
          FROM motoboys WHERE codigo IS NULL
      )
      UPDATE motoboys m SET codigo = n.seq + COALESCE(
        (SELECT max(codigo) FROM motoboys x WHERE x.empresa_id = m.empresa_id), 0)
      FROM numerados n WHERE n.id = m.id
    `);
  } catch {}
  // Índice único do código por empresa.
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_motoboys_codigo ON motoboys(empresa_id, codigo)`); } catch {}
}

async function initMotoboysTablesAll() {
  await initMotoboysTables();
  await migrarMotoboys();
}

module.exports = { initMotoboysTables: initMotoboysTablesAll };
