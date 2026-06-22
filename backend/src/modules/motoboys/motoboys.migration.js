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

module.exports = { initMotoboysTables };
