const { query } = require('../../shared/db');

async function initMapaTables() {
  // Acesso da LOJA ao mapa, liberado por loja (lojaPode lê esta coluna).
  try {
    await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS mapa_tempo_real BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch {}
  // Coordenadas da loja (geocodificadas do endereço de cadastro, em cache).
  try {
    await query(`ALTER TABLE lojas ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await query(`ALTER TABLE lojas ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
  } catch {}
}

module.exports = { initMapaTables };
