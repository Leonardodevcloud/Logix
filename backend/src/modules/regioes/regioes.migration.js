const { query } = require('../../shared/db');

async function initRegioesTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS regioes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome        TEXT NOT NULL,
      cor         TEXT DEFAULT '#185FA5',
      poligono    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [[lat,lng], ...]
      ativo       BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_regioes_empresa ON regioes(empresa_id)`);
}

module.exports = { initRegioesTables };
