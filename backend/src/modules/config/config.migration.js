const { query } = require('../../shared/db');

// Módulo de Configurações.
// Aba 1: Categorias de Frete — categorias da operação (nome, cor/etiqueta, status)
// com vínculo muitos-para-muitos a lojas (clientes). Valores ficam para depois.
async function initConfigTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS frete_categorias (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome         TEXT NOT NULL,
      cor          TEXT NOT NULL DEFAULT '#7c3aed',  -- etiqueta visual
      descricao    TEXT,
      ativo        BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Nome único por empresa (case-insensitive).
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_frete_cat_nome ON frete_categorias(empresa_id, lower(nome))`);
  await query(`CREATE INDEX IF NOT EXISTS idx_frete_cat_empresa ON frete_categorias(empresa_id, ativo)`);

  // Vínculo categoria <-> loja (cliente). Muitos-para-muitos.
  await query(`
    CREATE TABLE IF NOT EXISTS frete_categoria_lojas (
      categoria_id UUID NOT NULL REFERENCES frete_categorias(id) ON DELETE CASCADE,
      loja_id      UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (categoria_id, loja_id)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_frete_cat_lojas_loja ON frete_categoria_lojas(loja_id)`);
}

module.exports = { initConfigTables };
