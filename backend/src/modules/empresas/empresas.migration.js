const { query } = require('../../shared/db');

async function initEmpresasTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      razao_social  TEXT NOT NULL,
      nome_fantasia TEXT,
      cnpj          VARCHAR(14) UNIQUE NOT NULL,
      cep           VARCHAR(8),
      logradouro    TEXT, numero TEXT, complemento TEXT,
      bairro        TEXT, cidade TEXT, estado CHAR(2),
      responsavel   TEXT, email TEXT, telefone TEXT,
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Slug curto para o app (white-label) identificar a empresa no cadastro público.
  try { await query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slug TEXT`); } catch {}
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_slug ON empresas(lower(slug)) WHERE slug IS NOT NULL`); } catch {}
  // Backfill: gera um slug a partir do nome para empresas que ainda não têm.
  try {
    await query(`
      UPDATE empresas SET slug = regexp_replace(lower(coalesce(nome_fantasia, razao_social)), '[^a-z0-9]+', '-', 'g')
       WHERE slug IS NULL
    `);
  } catch {}
}

module.exports = { initEmpresasTables };
