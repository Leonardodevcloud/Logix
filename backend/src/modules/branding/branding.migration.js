const { query } = require('../../shared/db');

// Branding 1:1 com empresa. Roda após empresas (FK).
async function initBrandingTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_branding (
      empresa_id         UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
      nome_exibicao      TEXT,
      logo_url           TEXT,
      logo_escuro_url    TEXT,
      icone_app_url      TEXT,
      favicon_url        TEXT,
      cor_primaria       VARCHAR(7),
      cor_secundaria     VARCHAR(7),
      cor_destaque       VARCHAR(7),
      cor_clara          VARCHAR(7),
      dominio            TEXT UNIQUE,
      subdominio         TEXT UNIQUE,
      remetente_nome     TEXT,
      remetente_email    TEXT,
      mostrar_powered_by BOOLEAN NOT NULL DEFAULT TRUE,
      extra              JSONB,
      atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_branding_dominio ON empresa_branding(dominio)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_branding_subdominio ON empresa_branding(subdominio)`);
}

module.exports = { initBrandingTables };
