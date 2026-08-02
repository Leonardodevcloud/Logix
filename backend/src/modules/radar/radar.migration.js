const { query } = require('../../shared/db');

// Radar operacional: vigia motoboys COM corrida em rota (já coletada) que ficam
// parados demais ou sem sinal. Os limites são configurados por empresa; sem
// config salva e ativa, o radar fica desligado para aquela empresa.
async function initRadarTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS radar_config (
      empresa_id         UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
      ativo              BOOLEAN NOT NULL DEFAULT FALSE,
      parado_atencao_min INT,
      parado_critico_min INT,
      raio_parado_m      INT,
      sem_sinal_min      INT,
      push_central       BOOLEAN NOT NULL DEFAULT FALSE,
      atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS radar_alertas (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      entrega_id     UUID NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      motoboy_id     UUID NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
      tipo           TEXT NOT NULL CHECK (tipo IN ('parado','sem_sinal')),
      severidade     TEXT NOT NULL DEFAULT 'atencao' CHECK (severidade IN ('atencao','critico')),
      minutos        INT NOT NULL DEFAULT 0,
      lat            NUMERIC(9,6),
      lng            NUMERIC(9,6),
      ultima_pos_em  TIMESTAMPTZ,
      parado_desde   TIMESTAMPTZ,
      status         TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','resolvido','dispensado')),
      dispensado_ate TIMESTAMPTZ,
      criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, entrega_id, tipo)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_radar_alertas_ativos ON radar_alertas(empresa_id, status)`);
}

module.exports = { initRadarTables };
