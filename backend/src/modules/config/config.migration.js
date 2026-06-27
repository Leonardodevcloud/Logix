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

  // ── Tabela de valores (precificação por km) ─────────────────────
  // loja_id NULL = tabela global da empresa; com loja_id = sobrescreve só o cliente.
  // faixas: [{ ate_km, valor_cliente_cent, valor_motoboy_cent }] (em centavos).
  await query(`
    CREATE TABLE IF NOT EXISTS valores_config (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      loja_id       UUID REFERENCES lojas(id) ON DELETE CASCADE,
      faixas        JSONB NOT NULL DEFAULT '[]'::jsonb,
      cobranca_ativa BOOLEAN NOT NULL DEFAULT TRUE,  -- por cliente: se FALSE, não cobra nem paga
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_valores_geral ON valores_config(empresa_id) WHERE loja_id IS NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_valores_loja ON valores_config(empresa_id, loja_id) WHERE loja_id IS NOT NULL`);

  // Semeia uma tabela global default para empresas que ainda não têm.
  await query(`
    INSERT INTO valores_config (empresa_id, loja_id, faixas)
    SELECT e.id, NULL,
           '[{"ate_km":3,"valor_cliente_cent":900,"valor_motoboy_cent":700},{"ate_km":7,"valor_cliente_cent":1300,"valor_motoboy_cent":1000},{"ate_km":15,"valor_cliente_cent":1900,"valor_motoboy_cent":1500},{"ate_km":9999,"valor_cliente_cent":2900,"valor_motoboy_cent":2300}]'::jsonb
      FROM empresas e
     WHERE NOT EXISTS (SELECT 1 FROM valores_config v WHERE v.empresa_id = e.id AND v.loja_id IS NULL)
  `);
}

module.exports = { initConfigTables };
