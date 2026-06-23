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
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS numero_nf TEXT",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS nome_fantasia TEXT",
    "ALTER TABLE entregas_pontos ADD COLUMN IF NOT EXISTS complemento TEXT",
    "ALTER TABLE enderecos_salvos ADD COLUMN IF NOT EXISTS is_coleta_padrao BOOLEAN NOT NULL DEFAULT FALSE",
  ];
  for (const sql of cols) {
    try { await query(sql); } catch {}
  }
}

async function initEntregasTablesComMigracoes() {
  await initEntregasTables();
  await migrarColunasExtras();
}

module.exports = { initEntregasTables: initEntregasTablesComMigracoes };
