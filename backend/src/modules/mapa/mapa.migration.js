const { query } = require('../../shared/db');

// O acesso da LOJA ao mapa é liberado por loja, via uma coluna booleana em
// cliente_regras_acionamento — a mesma tabela que lojaPode() já consulta.
// Central (admin) sempre vê tudo; a coluna só governa o que a loja enxerga.
async function initMapaTables() {
  try {
    await query(`ALTER TABLE cliente_regras_acionamento ADD COLUMN IF NOT EXISTS mapa_tempo_real BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch {}
}

module.exports = { initMapaTables };
