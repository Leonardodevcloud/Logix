const { query } = require('../../shared/db');

// Cria a tabela `lojas` (clientes da central) e adiciona o vínculo loja_id
// em usuarios, entregas e enderecos_salvos. Também migra o perfil 'cliente' -> 'loja'.
// Executa DEPOIS de empresas, auth, entregas e enderecos_salvos (FKs).
async function initLojasTables() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // ── Tabela lojas ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS lojas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome_fantasia TEXT NOT NULL,
      razao_social  TEXT,
      cnpj          VARCHAR(14),
      cep           VARCHAR(8),
      logradouro    TEXT, numero TEXT, complemento TEXT,
      bairro        TEXT, cidade TEXT, estado CHAR(2),
      responsavel   TEXT, email TEXT, telefone TEXT,
      config_sla    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- SLA/preço flexível (definido depois)
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lojas_empresa ON lojas(empresa_id)`);
  // CNPJ único por empresa (uma loja não se repete dentro do mesmo tenant), mas permite null.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lojas_empresa_cnpj
               ON lojas(empresa_id, cnpj) WHERE cnpj IS NOT NULL`);

  // ── Vínculo loja_id em usuarios ─────────────────────────────────
  // Usuário com loja_id preenchido enxerga apenas a própria loja.
  // super_admin e central_admin ficam com loja_id NULL (enxergam a empresa inteira).
  await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE SET NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_loja ON usuarios(loja_id)`);

  // ── Vínculo loja_id em entregas ─────────────────────────────────
  await query(`ALTER TABLE entregas ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE SET NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_loja ON entregas(loja_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_empresa_loja ON entregas(empresa_id, loja_id)`);

  // ── Vínculo loja_id em enderecos_salvos (vários endereços por loja) ──
  await query(`ALTER TABLE enderecos_salvos ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE`);
  await query(`CREATE INDEX IF NOT EXISTS idx_end_salvos_loja ON enderecos_salvos(loja_id)`);

  // ── Migração de perfil: 'cliente' -> 'loja' ─────────────────────
  // Atualiza o CHECK constraint para incluir os novos perfis e migra os dados.
  await migrarPerfis();
}

// Atualiza o CHECK de usuarios.perfil e renomeia 'cliente' -> 'loja'.
// Idempotente e seguro para re-execução no boot.
async function migrarPerfis() {
  // Verifica se o constraint já está no formato novo (contém 'central_admin').
  // Se já estiver, não faz nada — evita drop/recreate desnecessário a cada boot.
  const { rows: jaMigrado } = await query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%central_admin%'
    LIMIT 1`);

  if (jaMigrado.length) {
    // Constraint já atualizado. Apenas garante que não sobrou nenhum 'cliente' pendente.
    await query(`UPDATE usuarios SET perfil = 'loja' WHERE perfil = 'cliente'`);
    return;
  }

  // 1. Remove o(s) CHECK(s) antigo(s) sobre 'perfil' (nome gerado pelo Postgres).
  const { rows: constraints } = await query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%perfil%'`);
  for (const c of constraints) {
    await query(`ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS "${c.conname}"`);
  }

  // 2. Migra os dados: cliente -> loja (antes de recriar o CHECK, para não violar).
  await query(`UPDATE usuarios SET perfil = 'loja' WHERE perfil = 'cliente'`);

  // 3. Recria o CHECK com o conjunto novo de perfis.
  //    'cliente' mantido por compatibilidade durante a transição.
  await query(`
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check
    CHECK (perfil IN ('super_admin','central_admin','loja','motoboy','cliente'))`);
}

module.exports = { initLojasTables };
