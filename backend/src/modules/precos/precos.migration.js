const { query } = require('../../shared/db');

// Preço dinâmico: regras que somam um valor (cliente e/ou motoboy) ao preço base
// de uma corrida no lançamento, conforme o gatilho (horário, volume, raio).
async function initPrecosTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS precos_dinamicos (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id    UUID NOT NULL,
      nome          TEXT NOT NULL,
      ativo         BOOLEAN NOT NULL DEFAULT TRUE,
      -- tipo do gatilho: 'horario' | 'volume_cliente' | 'volume_motoboy' | 'raio'
      tipo          TEXT NOT NULL,

      -- ESCOPO (null = qualquer). Anti-choque considera a sobreposição destes.
      loja_id       UUID NULL,
      centro_id     UUID NULL,
      modalidade_id UUID NULL,

      -- VALORES somados (em centavos), independentes.
      add_cliente_cent INTEGER NOT NULL DEFAULT 0,
      add_motoboy_cent INTEGER NOT NULL DEFAULT 0,

      -- Gatilho HORÁRIO (recorrente por dia da semana ou vigência por data).
      dias_semana   INTEGER[] NULL,   -- 0=domingo .. 6=sábado; null = todos os dias
      hora_inicio   TIME NULL,
      hora_fim      TIME NULL,
      data_inicio   DATE NULL,
      data_fim      DATE NULL,

      -- Gatilho VOLUME (a partir da N-ésima; reset da contagem por janela).
      volume_a_partir_de INTEGER NULL,             -- ex.: 10 (a partir da 10ª)
      volume_reset       TEXT NULL,                -- 'dia' | 'semana' | 'mes'

      -- Gatilho RAIO: polígono [[lat,lng], ...] — aplica se a COLETA cair dentro.
      poligono      JSONB NULL,

      criado_por    UUID NULL,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_precos_empresa_ativo ON precos_dinamicos(empresa_id, ativo)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_precos_escopo ON precos_dinamicos(empresa_id, loja_id, tipo)`);
  console.log('[precos] tabela de preço dinâmico verificada');
}

module.exports = { initPrecosTables };
