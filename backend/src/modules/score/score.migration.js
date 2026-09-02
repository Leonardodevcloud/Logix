const { query } = require('../../shared/db');

// Métricas padrão por empresa (o admin edita cada valor/ativo na sub-aba).
// grupo: 'ganha' | 'perde'. emVigor:true = já entra no cálculo read-only da
// Fase 1 (as demais entram com as campanhas na Fase 2).
const METRICAS_PADRAO = {
  entrega_concluida:     { rotulo: 'Entrega concluída',        pontos: 10, ativo: true,  grupo: 'ganha', icone: 'sc_check',  emVigor: true },
  no_prazo:              { rotulo: 'No prazo (dentro do SLA)',  pontos: 5,  ativo: true,  grupo: 'ganha', icone: 'sc_clock',  emVigor: true },
  foto_ok:               { rotulo: 'Foto/protocolo ok',        pontos: 2,  ativo: true,  grupo: 'ganha', icone: 'sc_cam',    emVigor: true },
  aceitar_oferta:        { rotulo: 'Aceitar oferta',           pontos: 3,  ativo: true,  grupo: 'ganha', icone: 'sc_thumb',  emVigor: true },
  hora_online_pico:      { rotulo: 'Hora online no pico',      pontos: 1,  ativo: false, grupo: 'ganha', icone: 'sc_power',  emVigor: false },
  dia_ativo:             { rotulo: 'Dia ativo',                pontos: 5,  ativo: false, grupo: 'ganha', icone: 'sc_cal',    emVigor: true },
  insucesso_culpa:       { rotulo: 'Insucesso por culpa',      pontos: -8, ativo: true,  grupo: 'perde', icone: 'sc_x',      emVigor: true },
  recusar_oferta:        { rotulo: 'Recusar/expirar oferta',   pontos: -3, ativo: false, grupo: 'perde', icone: 'sc_minus',  emVigor: true },
  cancelar_apos_aceitar: { rotulo: 'Cancelar após aceitar',    pontos: -15,ativo: true,  grupo: 'perde', icone: 'sc_undo',   emVigor: false },
};

const NIVEIS_PADRAO = [
  { nome: 'Bronze',   min: 0 },
  { nome: 'Prata',    min: 300 },
  { nome: 'Ouro',     min: 800 },
  { nome: 'Diamante', min: 1600 },
];

async function initScoreTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS score_config (
      empresa_id    UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
      metricas      JSONB NOT NULL DEFAULT '{}'::jsonb,
      niveis        JSONB NOT NULL DEFAULT '[]'::jsonb,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`ALTER TABLE score_config ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb`);
  // Semeia o padrão para empresas que ainda não têm config.
  await query(
    `INSERT INTO score_config (empresa_id, metricas, niveis)
     SELECT e.id, $1::jsonb, $2::jsonb FROM empresas e
      WHERE NOT EXISTS (SELECT 1 FROM score_config c WHERE c.empresa_id = e.id)`,
    [JSON.stringify(METRICAS_PADRAO), JSON.stringify(NIVEIS_PADRAO)]
  );

  // ── Fase 2: campanhas (missões) e registro de prêmios pagos ──
  await query(`
    CREATE TABLE IF NOT EXISTS score_campanhas (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome        TEXT NOT NULL,
      tipo        TEXT NOT NULL DEFAULT 'missao',
      alvo        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { todos, motoboys[], clientes[], novatos_dias }
      meta        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { qtd, sucesso_min }
      premio      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { tipo:'bonus_rs', valor_cent }
      inicio      DATE,
      fim         DATE,
      status      TEXT NOT NULL DEFAULT 'rascunho',     -- rascunho|ativa|pausada|encerrada
      prioridade  INTEGER NOT NULL DEFAULT 0,
      exclusivo   BOOLEAN NOT NULL DEFAULT FALSE,
      criado_por  UUID,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_score_campanhas_empresa ON score_campanhas(empresa_id, status)`);

  await query(`
    CREATE TABLE IF NOT EXISTS score_missao_premios (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      campanha_id   UUID NOT NULL REFERENCES score_campanhas(id) ON DELETE CASCADE,
      motoboy_id    UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      lancamento_id UUID,
      valor_cent    INTEGER NOT NULL DEFAULT 0,
      pago_por      UUID,
      pago_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (campanha_id, motoboy_id)
    )`);

  // ── Fase 4: ledger de eventos de score ──────────────────────────
  // Cada evento pontuável vira uma linha, com os pontos "congelados" no momento
  // (mudar a config depois não reescreve o histórico). O score = soma do ledger
  // na janela. ref_id evita duplicar (entrega, ponto, oferta, ou a data do dia).
  await query(`
    CREATE TABLE IF NOT EXISTS score_eventos (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      motoboy_id  UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      tipo        TEXT NOT NULL,
      pontos      INTEGER NOT NULL DEFAULT 0,
      ref_id      TEXT NOT NULL,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, motoboy_id, tipo, ref_id)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_score_eventos_mb ON score_eventos(empresa_id, motoboy_id, criado_em)`);

  // Backfill (uma vez, idempotente): gera eventos de 'entrega_concluida' e
  // 'insucesso_culpa' dos últimos 60 dias a partir das entregas/pontos já feitos,
  // usando os pontos configurados da empresa — assim o score não zera no deploy.
  try {
    await query(`
      INSERT INTO score_eventos (empresa_id, motoboy_id, tipo, pontos, ref_id, criado_em)
      SELECT e.empresa_id, e.motoboy_id, 'entrega_concluida',
             COALESCE((sc.metricas->'entrega_concluida'->>'pontos')::int, 10),
             p.id::text, COALESCE(e.concluida_em, e.criado_em)
        FROM entregas_pontos p
        JOIN entregas e ON e.id = p.entrega_id
        LEFT JOIN score_config sc ON sc.empresa_id = e.empresa_id
       WHERE p.status = 'entregue' AND e.motoboy_id IS NOT NULL
         AND COALESCE(e.concluida_em, e.criado_em) >= now() - interval '60 days'
      ON CONFLICT (empresa_id, motoboy_id, tipo, ref_id) DO NOTHING`);
  } catch {}
  try {
    await query(`
      INSERT INTO score_eventos (empresa_id, motoboy_id, tipo, pontos, ref_id, criado_em)
      SELECT e.empresa_id, e.motoboy_id, 'insucesso_culpa',
             COALESCE((sc.metricas->'insucesso_culpa'->>'pontos')::int, -8),
             p.id::text, COALESCE(e.concluida_em, e.criado_em)
        FROM entregas_pontos p
        JOIN entregas e ON e.id = p.entrega_id
        LEFT JOIN score_config sc ON sc.empresa_id = e.empresa_id
       WHERE p.status = 'insucesso' AND e.motoboy_id IS NOT NULL
         AND COALESCE(e.concluida_em, e.criado_em) >= now() - interval '60 days'
      ON CONFLICT (empresa_id, motoboy_id, tipo, ref_id) DO NOTHING`);
  } catch {}
}

module.exports = { initScoreTables, METRICAS_PADRAO, NIVEIS_PADRAO };
