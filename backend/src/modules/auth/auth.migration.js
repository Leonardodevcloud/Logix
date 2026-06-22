const { query } = require('../../shared/db');

// Cria tabelas de autenticação e a trilha de auditoria. Executa após empresas (FK).
async function initAuthTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID REFERENCES empresas(id) ON DELETE CASCADE,
      perfil        TEXT NOT NULL CHECK (perfil IN ('super_admin','cliente','motoboy')),
      nome          TEXT NOT NULL,
      email         TEXT UNIQUE,
      telefone      TEXT,
      senha_hash    TEXT NOT NULL,
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      ultimo_acesso TIMESTAMPTZ,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expira_em   TIMESTAMPTZ NOT NULL,
      revogado    BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_usuario ON refresh_tokens(usuario_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id         BIGSERIAL PRIMARY KEY,
      empresa_id UUID,
      usuario_id UUID,
      categoria  TEXT NOT NULL,
      acao       TEXT NOT NULL,
      detalhe    JSONB,
      ip         INET,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_tempo ON auditoria(empresa_id, criado_em DESC)`);
}

module.exports = { initAuthTables };
