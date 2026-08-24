const { query } = require('../../shared/db');

// Módulo de Integrações: chaves de API para sistemas externos (ERP do cliente)
// criarem/consultarem/cancelarem corridas, e webhooks de notificação de status.
//
// Modelo de credencial espelhado no sistema de integração legado:
//   - "Código do cliente" (cod_cliente): identificador PÚBLICO da integração.
//   - "Token" por operação: <segredo_base>-<operacao> (ex.: ...ab5e-gravar).
//     Guardamos só o HASH do segredo_base; o token nunca fica em claro no banco.
async function initIntegracoesTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // Colunas de rastreabilidade na entrega (aditivas, IF NOT EXISTS).
  const alters = [
    `ALTER TABLE entregas ADD COLUMN IF NOT EXISTS referencia_externa TEXT`,      // numeroPedido/NF do sistema do cliente
    `ALTER TABLE entregas ADD COLUMN IF NOT EXISTS origem TEXT`,                  // 'painel' | 'loja' | 'integracao'
    `ALTER TABLE entregas ADD COLUMN IF NOT EXISTS integracao_chave_id UUID`,     // qual chave criou (auditoria)
    `ALTER TABLE entregas ADD COLUMN IF NOT EXISTS rastreio_token TEXT`,          // token da página pública de rastreio
  ];
  for (const sql of alters) await query(sql);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_rastreio_token ON entregas(rastreio_token)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_ref_externa ON entregas(loja_id, referencia_externa)`);

  // Chaves de API por integração (uma por cliente/ERP; vinculada a uma loja).
  await query(`
    CREATE TABLE IF NOT EXISTS integracoes_chaves (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      loja_id          UUID REFERENCES lojas(id) ON DELETE CASCADE,  -- corrida nasce nesta loja (motor de preço dela)
      nome             TEXT NOT NULL,
      cod_cliente      TEXT NOT NULL UNIQUE,       -- identificador público (lookup)
      token_hash       TEXT NOT NULL,              -- sha256 do segredo-base
      token_prefixo    TEXT NOT NULL,              -- primeiros dígitos do segredo (exibição)
      ativa            BOOLEAN NOT NULL DEFAULT TRUE,
      ops_permitidas   TEXT[] NOT NULL DEFAULT ARRAY['gravar','status','cancelar','calcular'],
      url_notificacao  TEXT,                       -- webhook do cliente (status da entrega)
      notif_segredo    TEXT,                       -- segredo p/ assinar o webhook (HMAC)
      criado_por       UUID,
      criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
      revogada_em      TIMESTAMPTZ,
      ultimo_uso_em    TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_integchaves_empresa ON integracoes_chaves(empresa_id)`);

  // Log de requisições recebidas (auditoria + idempotência do gravar).
  await query(`
    CREATE TABLE IF NOT EXISTS integracoes_requisicoes (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id         UUID NOT NULL,
      chave_id           UUID REFERENCES integracoes_chaves(id) ON DELETE SET NULL,
      operacao           TEXT NOT NULL,            -- 'gravar' | 'status' | 'cancelar' | 'calcular'
      os                 TEXT,                     -- protocolo (LX-N) quando houver
      entrega_id         UUID,
      referencia_externa TEXT,                     -- numeroPedido usado na idempotência
      status_http        INTEGER,
      erro               TEXT,
      ip                 TEXT,
      criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Idempotência: o MESMO numeroPedido da MESMA chave num gravar bem-sucedido
  // devolve a corrida já criada (não duplica).
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_integreq_idem
      ON integracoes_requisicoes(chave_id, referencia_externa)
      WHERE operacao = 'gravar' AND referencia_externa IS NOT NULL AND entrega_id IS NOT NULL
  `);

  // Estado do webhook por entrega (reconciliação de momentos — worker).
  // Evita tocar no motor de entrega: o worker compara colunas e dispara o que faltou.
  await query(`
    CREATE TABLE IF NOT EXISTS integracoes_notif_estado (
      entrega_id        UUID PRIMARY KEY REFERENCES entregas(id) ON DELETE CASCADE,
      chave_id          UUID,
      momentos_enviados TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],   -- '0','0.5','0.75','2','3'
      pontos_enviados   UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],   -- pontos cujo momento '1' já saiu
      atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Log de entrega dos webhooks (sucesso/falha por momento).
  await query(`
    CREATE TABLE IF NOT EXISTS integracoes_notif_log (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id   UUID,
      chave_id     UUID,
      momento      TEXT,
      url          TEXT,
      status_http  INTEGER,
      erro         TEXT,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  console.log('[integracoes] tabelas verificadas/criadas');
}

module.exports = { initIntegracoesTables };
