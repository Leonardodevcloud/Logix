// motoboy_posicao_atual: 1 linha por motoboy com a ÚLTIMA posição (UPSERT a cada ping).
// Mapa, rastreio público, radar, filas e integrações leem daqui — nunca mais
// "ORDER BY capturado_em DESC LIMIT 1" sobre o histórico (que cresce sem parar).
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS motoboy_posicao_atual (
      motoboy_id    UUID PRIMARY KEY REFERENCES motoboys(id) ON DELETE CASCADE,
      empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      entrega_id    UUID REFERENCES entregas(id) ON DELETE SET NULL,
      lat           NUMERIC(9,6) NOT NULL,
      lng           NUMERIC(9,6) NOT NULL,
      precisao_m    NUMERIC(7,1),
      velocidade    NUMERIC(5,1),
      capturado_em  TIMESTAMPTZ NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // O mapa filtra por empresa + "recente"; este índice atende os dois.
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_posicao_atual_empresa_tempo ON motoboy_posicao_atual (empresa_id, capturado_em DESC)`);

  // Backfill a partir do histórico: última posição conhecida de cada motoboy.
  pgm.sql(`
    INSERT INTO motoboy_posicao_atual (motoboy_id, empresa_id, entrega_id, lat, lng, capturado_em)
    SELECT DISTINCT ON (r.motoboy_id) r.motoboy_id, m.empresa_id, r.entrega_id, r.lat, r.lng, r.capturado_em
      FROM rastreamento r
      JOIN motoboys m ON m.id = r.motoboy_id
     ORDER BY r.motoboy_id, r.capturado_em DESC
    ON CONFLICT (motoboy_id) DO NOTHING`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS motoboy_posicao_atual`);
};
