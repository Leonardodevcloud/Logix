const { query } = require('../../shared/db');

// Tabelas do Financeiro: lançamentos manuais (créditos/abatimentos) por motoboy,
// categorias configuráveis e fechamentos (repasse por período). Valores em centavos.
async function initFinanceiroTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS financeiro_categorias (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome       TEXT NOT NULL,
      tipo       TEXT NOT NULL DEFAULT 'credito' CHECK (tipo IN ('credito','abatimento','ambos')),
      cor        TEXT NOT NULL DEFAULT '#185FA5',
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_fin_cat_empresa ON financeiro_categorias(empresa_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS financeiro_fechamentos (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id             UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      motoboy_id             UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      periodo_de             DATE NOT NULL,
      periodo_ate            DATE NOT NULL,
      qtd_corridas           INT NOT NULL DEFAULT 0,
      total_corridas_cent    BIGINT NOT NULL DEFAULT 0,
      total_creditos_cent    BIGINT NOT NULL DEFAULT 0,
      total_abatimentos_cent BIGINT NOT NULL DEFAULT 0,
      saldo_liquido_cent     BIGINT NOT NULL DEFAULT 0,
      status                 TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','pago')),
      forma_pagamento        TEXT,
      pago_em                TIMESTAMPTZ,
      criado_por             UUID,
      criado_em              TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_fin_fech ON financeiro_fechamentos(empresa_id, motoboy_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      motoboy_id    UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      categoria_id  UUID REFERENCES financeiro_categorias(id) ON DELETE SET NULL,
      tipo          TEXT NOT NULL CHECK (tipo IN ('credito','abatimento')),
      valor_cent    BIGINT NOT NULL CHECK (valor_cent >= 0),
      descricao     TEXT,
      competencia   DATE NOT NULL DEFAULT CURRENT_DATE,
      fechamento_id UUID REFERENCES financeiro_fechamentos(id) ON DELETE SET NULL,
      criado_por    UUID,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_fin_lanc_mb ON financeiro_lancamentos(motoboy_id, competencia)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_fin_lanc_fech ON financeiro_lancamentos(fechamento_id)`);

  // Marca corridas já acertadas num fechamento (não entram mais no "em aberto").
  await query(`ALTER TABLE entregas ADD COLUMN IF NOT EXISTS fechamento_id UUID`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_fechamento ON entregas(fechamento_id)`);

  // Categorias padrão por empresa (só se a empresa ainda não tiver nenhuma).
  await query(`
    INSERT INTO financeiro_categorias (empresa_id, nome, tipo, cor)
    SELECT e.id, x.nome, x.tipo, x.cor
      FROM empresas e
      CROSS JOIN (VALUES
        ('Bônus','credito','#1f9d6b'),
        ('Diária','credito','#378ADD'),
        ('Adiantamento','abatimento','#dc2626'),
        ('Multa / Avaria','abatimento','#b45309'),
        ('Ajuste','ambos','#8ba5bc')
      ) AS x(nome, tipo, cor)
     WHERE NOT EXISTS (SELECT 1 FROM financeiro_categorias c WHERE c.empresa_id = e.id)`);
}

module.exports = { initFinanceiroTables };
