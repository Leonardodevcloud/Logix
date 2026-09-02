const { query } = require('../../shared/db');

async function initChatTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS chat_conversas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      entrega_id    UUID REFERENCES entregas(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL CHECK (tipo IN ('suporte','solicitante')),
      motoboy_id    UUID REFERENCES motoboys(id) ON DELETE SET NULL,
      loja_id       UUID REFERENCES lojas(id) ON DELETE SET NULL,
      protocolo     TEXT,
      status        TEXT NOT NULL DEFAULT 'aberta',   -- aberta | encerrada
      encerrada_em  TIMESTAMPTZ,
      encerrada_motivo TEXT,
      ultima_msg_em TIMESTAMPTZ,
      ultima_previa TEXT,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (entrega_id, tipo)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_conv_emp ON chat_conversas(empresa_id, tipo, ultima_msg_em DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_conv_mb ON chat_conversas(motoboy_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_conv_loja ON chat_conversas(loja_id)`);
  await query(`ALTER TABLE chat_conversas ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aberta'`);
  await query(`ALTER TABLE chat_conversas ADD COLUMN IF NOT EXISTS encerrada_em TIMESTAMPTZ`);
  await query(`ALTER TABLE chat_conversas ADD COLUMN IF NOT EXISTS encerrada_motivo TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS chat_mensagens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversa_id UUID NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
      empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      autor_tipo  TEXT NOT NULL CHECK (autor_tipo IN ('motoboy','central','loja')),
      autor_id    UUID,
      autor_nome  TEXT,
      tipo        TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto','foto','local','sistema')),
      texto       TEXT,
      midia_key   TEXT,
      lat         NUMERIC(9,6),
      lng         NUMERIC(9,6),
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_mensagens(conversa_id, criado_em)`);
  await query(`ALTER TABLE chat_mensagens DROP CONSTRAINT IF EXISTS chat_mensagens_tipo_check`);

  await query(`
    CREATE TABLE IF NOT EXISTS chat_leituras (
      conversa_id UUID NOT NULL REFERENCES chat_conversas(id) ON DELETE CASCADE,
      lado        TEXT NOT NULL,   -- 'motoboy' | 'central' | 'loja'
      lido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (conversa_id, lado)
    )`);

  // ── Config do "chat direto com a loja" (opt-in por loja; override por centro) ──
  await query(`
    CREATE TABLE IF NOT EXISTS chat_loja (
      loja_id    UUID PRIMARY KEY REFERENCES lojas(id) ON DELETE CASCADE,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      ativo      BOOLEAN NOT NULL DEFAULT FALSE
    )`);
  // centro: só existe linha quando o admin FORÇA (ausência = herda a loja).
  await query(`
    CREATE TABLE IF NOT EXISTS chat_centro (
      centro_id  UUID PRIMARY KEY REFERENCES cliente_centros_custo(id) ON DELETE CASCADE,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      ativo      BOOLEAN NOT NULL
    )`);
}
module.exports = { initChatTables };
