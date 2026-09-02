const { query } = require('../../shared/db');

// Métricas padrão por empresa (o admin edita cada valor/ativo na sub-aba).
// grupo: 'ganha' | 'perde'. emVigor:true = já entra no cálculo read-only da
// Fase 1 (as demais entram com as campanhas na Fase 2).
const METRICAS_PADRAO = {
  entrega_concluida:     { rotulo: 'Entrega concluída',        pontos: 10, ativo: true,  grupo: 'ganha', icone: 'sc_check',  emVigor: true },
  no_prazo:              { rotulo: 'No prazo (dentro do SLA)',  pontos: 5,  ativo: true,  grupo: 'ganha', icone: 'sc_clock',  emVigor: false },
  foto_ok:               { rotulo: 'Foto/protocolo ok',        pontos: 2,  ativo: true,  grupo: 'ganha', icone: 'sc_cam',    emVigor: false },
  aceitar_oferta:        { rotulo: 'Aceitar oferta',           pontos: 3,  ativo: true,  grupo: 'ganha', icone: 'sc_thumb',  emVigor: false },
  hora_online_pico:      { rotulo: 'Hora online no pico',      pontos: 1,  ativo: false, grupo: 'ganha', icone: 'sc_power',  emVigor: false },
  dia_ativo:             { rotulo: 'Dia ativo',                pontos: 5,  ativo: false, grupo: 'ganha', icone: 'sc_cal',    emVigor: false },
  insucesso_culpa:       { rotulo: 'Insucesso por culpa',      pontos: -8, ativo: true,  grupo: 'perde', icone: 'sc_x',      emVigor: true },
  recusar_oferta:        { rotulo: 'Recusar/expirar oferta',   pontos: -3, ativo: false, grupo: 'perde', icone: 'sc_minus',  emVigor: false },
  cancelar_apos_aceitar: { rotulo: 'Cancelar após aceitar',    pontos: -15,ativo: true,  grupo: 'perde', icone: 'sc_undo',   emVigor: false },
};

const NIVEIS_PADRAO = [
  { nome: 'Bronze',   min: 0 },
  { nome: 'Prata',    min: 300 },
  { nome: 'Ouro',     min: 800 },
  { nome: 'Diamante', min: 1600 },
];

async function initScoreTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS score_config (
      empresa_id    UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
      metricas      JSONB NOT NULL DEFAULT '{}'::jsonb,
      niveis        JSONB NOT NULL DEFAULT '[]'::jsonb,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Semeia o padrão para empresas que ainda não têm config.
  await query(
    `INSERT INTO score_config (empresa_id, metricas, niveis)
     SELECT e.id, $1::jsonb, $2::jsonb FROM empresas e
      WHERE NOT EXISTS (SELECT 1 FROM score_config c WHERE c.empresa_id = e.id)`,
    [JSON.stringify(METRICAS_PADRAO), JSON.stringify(NIVEIS_PADRAO)]
  );
}

module.exports = { initScoreTables, METRICAS_PADRAO, NIVEIS_PADRAO };
