const { query } = require('../../shared/db');
const { MODULOS, TEMPLATES } = require('./permissoes.shared');

async function initPermissoesTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // Catálogo de módulos do sistema.
  await query(`
    CREATE TABLE IF NOT EXISTS modulos (
      codigo    TEXT PRIMARY KEY,
      nome      TEXT NOT NULL,
      categoria TEXT,
      descricao TEXT,
      ordem     INT NOT NULL DEFAULT 0
    )`);

  // Camada 1: quais módulos cada cliente (tenant) tem contratado.
  await query(`
    CREATE TABLE IF NOT EXISTS empresa_modulos (
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      modulo_codigo TEXT NOT NULL REFERENCES modulos(codigo) ON DELETE CASCADE,
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (empresa_id, modulo_codigo)
    )`);

  // Camada 2: papéis (empresa_id NULL = template do sistema) e suas permissões.
  await query(`
    CREATE TABLE IF NOT EXISTS papeis (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
      nome       TEXT NOT NULL,
      descricao  TEXT,
      sistema    BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Nome único por escopo: templates (NULL) entre si, e cada cliente entre os seus.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_papeis_escopo_nome
               ON papeis (COALESCE(empresa_id::text, 'sistema'), lower(nome))`);

  await query(`
    CREATE TABLE IF NOT EXISTS papel_permissoes (
      papel_id  UUID NOT NULL REFERENCES papeis(id) ON DELETE CASCADE,
      permissao TEXT NOT NULL,
      PRIMARY KEY (papel_id, permissao)
    )`);

  // Vincula o usuário a um papel (executa após a tabela usuarios já existir).
  await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS papel_id UUID REFERENCES papeis(id)`);

  await semear();
  console.log('[permissoes] catálogo e templates verificados');
}

// Idempotente: popula o catálogo de módulos e os papéis-modelo.
async function semear() {
  for (const m of MODULOS) {
    await query(
      `INSERT INTO modulos (codigo, nome, categoria, ordem) VALUES ($1,$2,$3,$4)
       ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, categoria = EXCLUDED.categoria, ordem = EXCLUDED.ordem`,
      [m.codigo, m.nome, m.categoria, m.ordem]
    );
  }
  for (const t of TEMPLATES) {
    const existente = await query(`SELECT id FROM papeis WHERE empresa_id IS NULL AND lower(nome) = lower($1)`, [t.nome]);
    let papelId = existente.rows[0] && existente.rows[0].id;
    if (!papelId) {
      const ins = await query(
        `INSERT INTO papeis (empresa_id, nome, descricao, sistema) VALUES (NULL, $1, $2, TRUE) RETURNING id`,
        [t.nome, t.descricao]
      );
      papelId = ins.rows[0].id;
    }
    for (const perm of t.permissoes) {
      await query(`INSERT INTO papel_permissoes (papel_id, permissao) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [papelId, perm]);
    }
  }
}

module.exports = { initPermissoesTables };
