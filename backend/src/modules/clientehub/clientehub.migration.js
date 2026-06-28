const { query } = require('../../shared/db');

// Hub de gestão por cliente (loja): centros de custo, modalidades de frete
// vinculadas, regras de acionamento e atribuição de motoboys exclusivos.
async function initClienteHubTables() {
  // ── Centros de custo de um cliente ──────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_centros_custo (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      loja_id     UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
      nome        TEXT NOT NULL,
      codigo      TEXT,
      ativo       BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cc_loja ON cliente_centros_custo(loja_id)`);

  // Vínculo de um usuário a um centro de custo (um usuário pode estar em vários).
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_centro_usuarios (
      centro_id   UUID NOT NULL REFERENCES cliente_centros_custo(id) ON DELETE CASCADE,
      usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (centro_id, usuario_id)
    )`);

  // ── Modalidades de frete do cliente ─────────────────────────────
  // Liga uma categoria de frete (frete_categorias) a uma loja, com a flag de
  // exclusividade: se TRUE, a corrida dessa modalidade só vai para motoboys
  // atribuídos ao cliente.
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_modalidades (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      loja_id       UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
      categoria_id  UUID NOT NULL REFERENCES frete_categorias(id) ON DELETE CASCADE,
      so_exclusivos BOOLEAN NOT NULL DEFAULT FALSE,  -- só motoboys atribuídos ao cliente
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (loja_id, categoria_id)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cli_modalidade_loja ON cliente_modalidades(loja_id)`);

  // ── Regras de acionamento do cliente ────────────────────────────
  // Uma linha por loja (config geral de disparo/atribuição).
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_regras_acionamento (
      loja_id           UUID PRIMARY KEY REFERENCES lojas(id) ON DELETE CASCADE,
      empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      max_corridas_motoboy INTEGER NOT NULL DEFAULT 3,  -- máx. corridas simultâneas por motoboy
      raio_km           NUMERIC(6,2) NOT NULL DEFAULT 5, -- raio em que a corrida aparece
      atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Regras booleanas (padrão: ligado / permissivo).
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS pode_cancelar_associada BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS pode_alterar_profissional BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS pode_editar_servico BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS pode_escolher_profissional BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS somente_online BOOLEAN NOT NULL DEFAULT TRUE`);
  // Geofence de marcação: o motoboy só conclui um ponto dentro do raio configurado.
  // marcacao_raio_livre = TRUE (padrão) => sem restrição (não quebra operações atuais).
  // Quando FALSE, vale marcacao_raio_km (em km) como distância máxima até o ponto.
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS marcacao_raio_livre BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS marcacao_raio_km NUMERIC(6,2) NOT NULL DEFAULT 0.3`);

  // ── Motoboys exclusivos do cliente (por modalidade) ─────────────
  // Um motoboy pode ser atribuído ao cliente em uma ou mais modalidades.
  await query(`
    CREATE TABLE IF NOT EXISTS cliente_motoboys (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      loja_id       UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
      motoboy_id    UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      modalidade_id UUID REFERENCES cliente_modalidades(id) ON DELETE CASCADE, -- NULL = todas
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (loja_id, motoboy_id, modalidade_id)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cli_motoboys_loja ON cliente_motoboys(loja_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cli_motoboys_motoboy ON cliente_motoboys(motoboy_id)`);
}

module.exports = { initClienteHubTables };
