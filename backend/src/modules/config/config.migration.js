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
  // ── Ocorrências de marcação ──────────────────────────────────────
  // Motivos que o motoboy escolhe ao finalizar um ponto.
  // tipo: sucesso | insucesso ; comportamento: finalizar | retorno
  await query(`
    CREATE TABLE IF NOT EXISTS ocorrencias_marcacao (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome          TEXT NOT NULL,
      tipo          TEXT NOT NULL DEFAULT 'sucesso' CHECK (tipo IN ('sucesso','insucesso')),
      comportamento TEXT NOT NULL DEFAULT 'finalizar' CHECK (comportamento IN ('finalizar','retorno')),
      ordem         INTEGER NOT NULL DEFAULT 0,
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ocorrencias_empresa ON ocorrencias_marcacao(empresa_id, ativo)`);

  // Vincula o ponto à ocorrência escolhida na finalização.
  await query(`ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS ocorrencia_id UUID REFERENCES ocorrencias_marcacao(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS ocorrencia_nome TEXT`);
  // Marca um ponto como sendo de retorno (gerado por insucesso) e de qual ponto veio.
  await query(`ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS eh_retorno BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS retorno_de_ponto_id UUID`);

  // Semeia ocorrências padrão para empresas que ainda não têm nenhuma.
  await query(`
    INSERT INTO ocorrencias_marcacao (empresa_id, nome, tipo, comportamento, ordem)
    SELECT e.id, v.nome, v.tipo, v.comportamento, v.ordem
      FROM empresas e
      CROSS JOIN (VALUES
        ('Entregue', 'sucesso', 'finalizar', 0),
        ('Cliente ausente', 'insucesso', 'retorno', 1),
        ('Endereço incorreto', 'insucesso', 'retorno', 2),
        ('Recusado pelo cliente', 'insucesso', 'retorno', 3)
      ) AS v(nome, tipo, comportamento, ordem)
     WHERE NOT EXISTS (SELECT 1 FROM ocorrencias_marcacao o WHERE o.empresa_id = e.id)
  `);
}

module.exports = { initConfigTables };
