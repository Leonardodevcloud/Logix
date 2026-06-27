const { query } = require('../../shared/db');

// Módulo Financeiro: agregações de faturamento a partir das corridas concluídas.
// Não tem tabelas próprias — lê de `entregas` (valor_cliente_cent / valor_motoboy_cent).
// Valores sempre em centavos (inteiro).

// Monta a cláusula de período sobre concluida_em. Retorna { cond, params } parciais.
function filtroPeriodo(deIso, ateIso, params) {
  const cond = [];
  if (deIso) { params.push(deIso); cond.push(`e.concluida_em >= $${params.length}`); }
  if (ateIso) { params.push(ateIso); cond.push(`e.concluida_em <= $${params.length}`); }
  return cond;
}

// ── Faturamento por cliente (resumo) ──────────────────────────────
// Soma o valor cobrado do cliente por loja, no período, só de corridas entregues.
async function faturamentoCliente({ empresaId, de = null, ate = null }) {
  const params = [empresaId];
  const cond = ['e.empresa_id = $1', "e.status = 'entregue'", filtroPeriodo(de, ate, params)].flat().filter(Boolean);
  const { rows } = await query(
    `SELECT l.id AS loja_id, l.nome_fantasia AS loja_nome,
            count(*)::int AS qtd_corridas,
            COALESCE(SUM(e.valor_cliente_cent), 0)::bigint AS total_cliente_cent
       FROM entregas e
       JOIN lojas l ON l.id = e.loja_id
      WHERE ${cond.join(' AND ')}
      GROUP BY l.id, l.nome_fantasia
      ORDER BY total_cliente_cent DESC`,
    params
  );
  const totalGeral = rows.reduce((s, r) => s + Number(r.total_cliente_cent), 0);
  return { clientes: rows, total_geral_cent: totalGeral };
}

// ── Detalhe de um cliente: quebra por centro de custo ─────────────
async function faturamentoClienteCentros({ empresaId, lojaId, de = null, ate = null }) {
  const params = [empresaId, lojaId];
  const cond = ['e.empresa_id = $1', 'e.loja_id = $2', "e.status = 'entregue'", filtroPeriodo(de, ate, params)].flat().filter(Boolean);
  const { rows } = await query(
    `SELECT cc.id AS centro_id, COALESCE(cc.nome, 'Sem centro de custo') AS centro_nome,
            count(*)::int AS qtd_corridas,
            COALESCE(SUM(e.valor_cliente_cent), 0)::bigint AS total_cliente_cent
       FROM entregas e
       LEFT JOIN cliente_centros_custo cc ON cc.id = e.centro_custo_id
      WHERE ${cond.join(' AND ')}
      GROUP BY cc.id, cc.nome
      ORDER BY total_cliente_cent DESC`,
    params
  );
  return { centros: rows };
}

// ── Detalhe: corridas de um cliente (opcionalmente de um centro) ──
async function faturamentoClienteCorridas({ empresaId, lojaId, centroId = null, semCentro = false, de = null, ate = null }) {
  const params = [empresaId, lojaId];
  const cond = ['e.empresa_id = $1', 'e.loja_id = $2', "e.status = 'entregue'"];
  if (semCentro) {
    cond.push('e.centro_custo_id IS NULL');
  } else if (centroId) {
    params.push(centroId); cond.push(`e.centro_custo_id = $${params.length}`);
  }
  cond.push(...filtroPeriodo(de, ate, params));
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.concluida_em, e.distancia_km,
            e.valor_cliente_cent, e.coleta_endereco,
            (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco,
            m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo
       FROM entregas e
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
      WHERE ${cond.join(' AND ')}
      ORDER BY e.concluida_em DESC
      LIMIT 1000`,
    params
  );
  return { corridas: rows };
}

// ── Faturamento por motoboy (resumo) ──────────────────────────────
async function faturamentoMotoboy({ empresaId, de = null, ate = null }) {
  const params = [empresaId];
  const cond = ['e.empresa_id = $1', "e.status = 'entregue'", 'e.motoboy_id IS NOT NULL', filtroPeriodo(de, ate, params)].flat().filter(Boolean);
  const { rows } = await query(
    `SELECT m.id AS motoboy_id, m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo,
            count(*)::int AS qtd_corridas,
            COALESCE(SUM(e.valor_motoboy_cent), 0)::bigint AS total_motoboy_cent
       FROM entregas e
       JOIN motoboys m ON m.id = e.motoboy_id
      WHERE ${cond.join(' AND ')}
      GROUP BY m.id, m.nome_completo, m.codigo
      ORDER BY total_motoboy_cent DESC`,
    params
  );
  const totalGeral = rows.reduce((s, r) => s + Number(r.total_motoboy_cent), 0);
  return { motoboys: rows, total_geral_cent: totalGeral };
}

// ── Detalhe: corridas de um motoboy ───────────────────────────────
async function faturamentoMotoboyCorridas({ empresaId, motoboyId, de = null, ate = null }) {
  const params = [empresaId, motoboyId];
  const cond = ['e.empresa_id = $1', 'e.motoboy_id = $2', "e.status = 'entregue'", filtroPeriodo(de, ate, params)].flat().filter(Boolean);
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.concluida_em, e.distancia_km,
            e.valor_motoboy_cent, e.coleta_endereco,
            (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco,
            l.nome_fantasia AS loja_nome
       FROM entregas e
       LEFT JOIN lojas l ON l.id = e.loja_id
      WHERE ${cond.join(' AND ')}
      ORDER BY e.concluida_em DESC
      LIMIT 1000`,
    params
  );
  return { corridas: rows };
}

module.exports = {
  faturamentoCliente, faturamentoClienteCentros, faturamentoClienteCorridas,
  faturamentoMotoboy, faturamentoMotoboyCorridas,
};
