const { query } = require('../../shared/db');

async function initMotoboysTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS motoboys (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      usuario_id          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      nome_completo       TEXT NOT NULL,
      cpf                 VARCHAR(11) NOT NULL,
      rg                  TEXT,
      data_nascimento     DATE,
      telefone_principal  TEXT,
      telefone_emergencia TEXT,
      cep                 VARCHAR(8),
      endereco            TEXT,
      foto_url            TEXT,
      status              TEXT NOT NULL DEFAULT 'ativo',
      online              BOOLEAN NOT NULL DEFAULT FALSE,
      observacoes         TEXT,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, cpf)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_motoboys_empresa ON motoboys(empresa_id)`);
}

async function migrarMotoboys() {
  const cols = [
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS pin_hash TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS codigo INTEGER",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS email TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS senha_hash TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS logradouro TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS numero TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS complemento TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS bairro TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS cidade TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS estado VARCHAR(2)",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS modalidade_interesse_id UUID",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS situacao_cadastro TEXT DEFAULT 'aprovado'",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS origem_cadastro TEXT DEFAULT 'central'",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS motivo_reenvio TEXT",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS revisado_por UUID",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS revisado_em TIMESTAMPTZ",
    "ALTER TABLE motoboys ADD COLUMN IF NOT EXISTS ativado_em TIMESTAMPTZ",
  ];
  for (const sql of cols) { try { await query(sql); } catch {} }

  try { await query(`ALTER TABLE motoboys DROP CONSTRAINT IF EXISTS motoboys_status_check`); } catch {}

  try {
    await query(`
      WITH numerados AS (
        SELECT id, row_number() OVER (PARTITION BY empresa_id ORDER BY criado_em, id) AS seq
          FROM motoboys WHERE codigo IS NULL
      )
      UPDATE motoboys m SET codigo = n.seq + COALESCE(
        (SELECT max(codigo) FROM motoboys x WHERE x.empresa_id = m.empresa_id), 0)
      FROM numerados n WHERE n.id = m.id
    `);
  } catch {}
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_motoboys_codigo ON motoboys(empresa_id, codigo)`); } catch {}
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_motoboys_email ON motoboys(empresa_id, lower(email)) WHERE email IS NOT NULL`); } catch {}
  try { await query(`CREATE INDEX IF NOT EXISTS idx_motoboys_situacao ON motoboys(empresa_id, situacao_cadastro)`); } catch {}

  await query(`
    CREATE TABLE IF NOT EXISTS motoboy_documentos (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      motoboy_id   UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      tipo         TEXT NOT NULL,
      storage_key  TEXT NOT NULL,
      url          TEXT,
      mime         TEXT,
      tamanho      INTEGER,
      status       TEXT NOT NULL DEFAULT 'enviado',
      enviado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (motoboy_id, tipo)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_motoboy_docs_motoboy ON motoboy_documentos(motoboy_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS motoboy_modalidades_interesse (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome         TEXT NOT NULL,
      descricao    TEXT,
      cor          TEXT DEFAULT '#7c3aed',
      ordem        INTEGER DEFAULT 0,
      ativo        BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_mb_modalidades_empresa ON motoboy_modalidades_interesse(empresa_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS motoboy_cadastro_config (
      empresa_id     UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
      campos         JSONB NOT NULL DEFAULT '{}'::jsonb,
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    INSERT INTO motoboy_cadastro_config (empresa_id, campos)
    SELECT e.id, $1::jsonb FROM empresas e
     WHERE NOT EXISTS (SELECT 1 FROM motoboy_cadastro_config c WHERE c.empresa_id = e.id)
  `, [JSON.stringify({
    nome_completo: true, cpf: true, data_nascimento: true, telefone_principal: true,
    email: true, senha: true, telefone_emergencia: false,
    cep: true, logradouro: true, numero: true, complemento: false, bairro: true, cidade: true, estado: true,
    doc_selfie: true, doc_habilitacao: true, doc_comprovante_endereco: true, doc_antecedentes: true,
  })]);
}

async function initMotoboysTablesAll() {
  await initMotoboysTables();
  await migrarMotoboys();
}

module.exports = { initMotoboysTables: initMotoboysTablesAll };
