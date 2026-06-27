const { query } = require('../../shared/db');

async function initEntregasTables() {
  // Sequência para o protocolo legível (LX-NNNNN)
  await query(`CREATE SEQUENCE IF NOT EXISTS seq_protocolo_entrega START 20000`);

  await query(`
    CREATE TABLE IF NOT EXISTS entregas (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      protocolo          TEXT UNIQUE NOT NULL,
      motoboy_id         UUID REFERENCES motoboys(id) ON DELETE SET NULL,
      status             TEXT NOT NULL DEFAULT 'aguardando_atribuicao'
        CHECK (status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota','entregue','cancelada')),
      distribuicao       TEXT NOT NULL DEFAULT 'automatica' CHECK (distribuicao IN ('automatica','manual')),
      coleta_nome        TEXT, coleta_endereco TEXT,
      coleta_lat         NUMERIC(9,6), coleta_lng NUMERIC(9,6),
      distancia_km       NUMERIC(7,2),
      tempo_estimado_min INTEGER, tempo_total_min INTEGER,
      criado_por         UUID REFERENCES usuarios(id),
      criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
      iniciada_em        TIMESTAMPTZ, concluida_em TIMESTAMPTZ
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_empresa_status ON entregas(empresa_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_motoboy ON entregas(motoboy_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS entregas_pontos (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id  UUID NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      ordem       INTEGER NOT NULL,
      nome        TEXT, endereco TEXT NOT NULL,
      lat         NUMERIC(9,6), lng NUMERIC(9,6),
      telefone    TEXT, observacoes TEXT,
      status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','entregue','falha')),
      recebedor   TEXT, entregue_em TIMESTAMPTZ
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pontos_entrega ON entregas_pontos(entrega_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS protocolos (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_ponto_id UUID NOT NULL REFERENCES entregas_pontos(id) ON DELETE CASCADE,
      tipo             TEXT NOT NULL CHECK (tipo IN ('canhoto','nota_fiscal','mercadoria','assinatura','outro')),
      arquivo_url      TEXT NOT NULL,
      criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS rastreamento (
      id           BIGSERIAL PRIMARY KEY,
      motoboy_id   UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      entrega_id   UUID REFERENCES entregas(id) ON DELETE SET NULL,
      lat          NUMERIC(9,6) NOT NULL, lng NUMERIC(9,6) NOT NULL,
      capturado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rastreamento_motoboy_tempo ON rastreamento(motoboy_id, capturado_em DESC)`);
}

async function migrarColunasExtras() {
  const cols = [
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES usuarios(id)",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMPTZ",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS chegou_em TIMESTAMPTZ",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMPTZ",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS numero_nf TEXT",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS nome_fantasia TEXT",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS complemento TEXT",
    "ALTER TABLE enderecos_salvos ADD COLUMN IF NOT EXISTS is_coleta_padrao BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS observacao_motoboy TEXT",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS modalidade_id UUID",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS centro_custo_id UUID",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS valor_cliente_cent INTEGER",
    "ALTER TABLE entregas ADD COLUMN IF NOT EXISTS valor_motoboy_cent INTEGER",
  ];
  for (const sql of cols) {
    try { await query(sql); } catch {}
  }
}

// Configuração de SLA por empresa (geral) e por loja (opcional).
// O prazo conta a partir da CRIAÇÃO da corrida. O tempo-base vem por FAIXA DE KM.
// Estrutura pensada para ser editada na futura tela de configurações.
async function initSlaConfig() {
  await query(`
    CREATE TABLE IF NOT EXISTS sla_config (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id         UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      loja_id            UUID REFERENCES lojas(id) ON DELETE CASCADE,  -- NULL = config geral da empresa
      -- faixas de km -> minutos de SLA. Ex.: [{"ate_km":3,"minutos":60},{"ate_km":7,"minutos":90},...]
      faixas             JSONB NOT NULL DEFAULT '[]'::jsonb,
      -- minutos para entrar em cada alerta antes do vencimento
      minutos_atencao    INTEGER NOT NULL DEFAULT 30,
      minutos_iminente   INTEGER NOT NULL DEFAULT 15,
      -- SLA fixo (minutos) usado quando não há faixa aplicável ou distância desconhecida
      sla_padrao_min     INTEGER NOT NULL DEFAULT 90,
      ativo              BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Garante no máximo uma config geral por empresa e uma por loja.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_geral ON sla_config(empresa_id) WHERE loja_id IS NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_loja ON sla_config(empresa_id, loja_id) WHERE loja_id IS NOT NULL`);

  // Semeia uma config geral default para empresas que ainda não têm.
  await query(`
    INSERT INTO sla_config (empresa_id, loja_id, faixas, minutos_atencao, minutos_iminente, sla_padrao_min)
    SELECT e.id, NULL,
           '[{"ate_km":3,"minutos":60},{"ate_km":7,"minutos":90},{"ate_km":15,"minutos":120},{"ate_km":9999,"minutos":180}]'::jsonb,
           30, 15, 90
      FROM empresas e
     WHERE NOT EXISTS (SELECT 1 FROM sla_config s WHERE s.empresa_id = e.id AND s.loja_id IS NULL)
  `);

  // Raio de disparo (km) para a oferta de corridas — configurável na tela futura.
  await query(`ALTER TABLE sla_config ADD COLUMN IF NOT EXISTS raio_disparo_km NUMERIC(6,2) NOT NULL DEFAULT 5`);
  // Tempo (segundos) que a oferta fica disponível antes de expirar.
  await query(`ALTER TABLE sla_config ADD COLUMN IF NOT EXISTS oferta_expira_seg INTEGER NOT NULL DEFAULT 120`);
}

// Tabela de ofertas: quando uma corrida é "disparada", ela fica ofertada aos
// motoboys do raio; o primeiro a aceitar leva (trava por status).
async function initOfertasTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS entregas_ofertas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id    UUID NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'ofertada' CHECK (status IN ('ofertada','aceita','expirada','cancelada')),
      raio_km       NUMERIC(6,2),
      aceita_por    UUID REFERENCES motoboys(id) ON DELETE SET NULL,
      aceita_em     TIMESTAMPTZ,
      expira_em     TIMESTAMPTZ NOT NULL,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ofertas_entrega ON entregas_ofertas(entrega_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ofertas_status ON entregas_ofertas(empresa_id, status)`);
  // candidatos da oferta (quais motoboys estavam no raio quando disparou)
  await query(`
    CREATE TABLE IF NOT EXISTS entregas_ofertas_candidatos (
      oferta_id   UUID NOT NULL REFERENCES entregas_ofertas(id) ON DELETE CASCADE,
      motoboy_id  UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      distancia_km NUMERIC(6,2),
      PRIMARY KEY (oferta_id, motoboy_id)
    )`);
}

async function initEntregasTablesComMigracoes() {
  await initEntregasTables();
  await migrarColunasExtras();
  await initSlaConfig();
  await initOfertasTable();
}

module.exports = { initEntregasTables: initEntregasTablesComMigracoes };
