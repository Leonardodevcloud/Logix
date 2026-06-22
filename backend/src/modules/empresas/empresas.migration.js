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
}

module.exports = { initEmpresasTables };
