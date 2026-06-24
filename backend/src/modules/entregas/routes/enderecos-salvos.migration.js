const { query } = require('../../../shared/db');

async function initEnderecosSalvosTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS enderecos_salvos (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      apelido      TEXT NOT NULL,
      endereco_completo TEXT NOT NULL,
      lat          DOUBLE PRECISION,
      lng          DOUBLE PRECISION,
      bairro       TEXT,
      cidade       TEXT,
      uf           VARCHAR(2),
      cep          VARCHAR(9),
      uso_count    INT NOT NULL DEFAULT 0,
      is_coleta_padrao BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, apelido)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_end_salvos_empresa ON enderecos_salvos(empresa_id)`);
}

async function initGeocodeCacheTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS geocode_cache (
      chave         TEXT PRIMARY KEY,
      resultado     JSONB NOT NULL,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT now(),
      hit_count     INT NOT NULL DEFAULT 0
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_geocode_cache_ultimo_acesso ON geocode_cache(ultimo_acesso DESC)`);
}

async function initTodas() {
  await initEnderecosSalvosTables();
  await initGeocodeCacheTables();
}

module.exports = { initEnderecosSalvosTables: initTodas };
