const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');

// Módulo Financeiro. Faturamento (a partir das corridas) + lançamentos manuais
// por motoboy (créditos/abatimentos com categoria) + fechamento/repasse por
// período. Valores sempre em centavos (inteiro).

function filtroPeriodo(deIso, ateIso, params) {
  const cond = [];
  if (deIso) { params.push(deIso); cond.push(`e.concluida_em >= $${params.length}`); }
  if (ateIso) { params.push(ateIso); cond.push(`e.concluida_em <= $${params.length}`); }
  return cond;
}
// Data local (Bahia) de conclusão — usada no fluxo do motoboy para casar com a
// competência dos lançamentos (que é DATE) e com o agrupamento por dia.
const DIA_BAHIA = "(e.concluida_em AT TIME ZONE 'America/Bahia')::date";

// ── Faturamento por cliente (resumo) ──────────────────────────────
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

// ── Faturamento por motoboy (resumo) — só o que está EM ABERTO ─────
// Junta corridas não fechadas (fechamento_id IS NULL) + lançamentos não fechados
// e devolve saldo = corridas + créditos − abatimentos. Inclui motoboys que só têm
// lançamento no período (sem corrida).
async function faturamentoMotoboy({ empresaId, de = null, ate = null }) {
  const p1 = [empresaId];
  const c1 = ['e.empresa_id = $1', "e.status = 'entregue'", 'e.motoboy_id IS NOT NULL', 'e.fechamento_id IS NULL'];
  if (de) { p1.push(de); c1.push(`${DIA_BAHIA} >= $${p1.length}`); }
  if (ate) { p1.push(ate); c1.push(`${DIA_BAHIA} <= $${p1.length}`); }
  const corr = await query(
    `SELECT m.id AS motoboy_id, m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo,
            count(*)::int AS qtd_corridas, COALESCE(SUM(e.valor_motoboy_cent), 0)::bigint AS total_corridas_cent
       FROM entregas e JOIN motoboys m ON m.id = e.motoboy_id
      WHERE ${c1.join(' AND ')}
      GROUP BY m.id, m.nome_completo, m.codigo`, p1);

  const p2 = [empresaId];
  const c2 = ['l.empresa_id = $1', 'l.fechamento_id IS NULL'];
  if (de) { p2.push(de); c2.push(`l.competencia >= $${p2.length}`); }
  if (ate) { p2.push(ate); c2.push(`l.competencia <= $${p2.length}`); }
  const lanc = await query(
    `SELECT l.motoboy_id,
            COALESCE(SUM(CASE WHEN l.tipo = 'credito' THEN l.valor_cent END), 0)::bigint AS creditos_cent,
            COALESCE(SUM(CASE WHEN l.tipo = 'abatimento' THEN l.valor_cent END), 0)::bigint AS abatimentos_cent
       FROM financeiro_lancamentos l
      WHERE ${c2.join(' AND ')}
      GROUP BY l.motoboy_id`, p2);

  const map = new Map();
  for (const r of corr.rows) {
    map.set(r.motoboy_id, {
      motoboy_id: r.motoboy_id, motoboy_nome: r.motoboy_nome, motoboy_codigo: r.motoboy_codigo,
      qtd_corridas: r.qtd_corridas, total_corridas_cent: Number(r.total_corridas_cent),
      creditos_cent: 0, abatimentos_cent: 0,
    });
  }
  for (const r of lanc.rows) {
    const cur = map.get(r.motoboy_id) || {
      motoboy_id: r.motoboy_id, motoboy_nome: null, motoboy_codigo: null,
      qtd_corridas: 0, total_corridas_cent: 0, creditos_cent: 0, abatimentos_cent: 0,
    };
    cur.creditos_cent = Number(r.creditos_cent);
    cur.abatimentos_cent = Number(r.abatimentos_cent);
    map.set(r.motoboy_id, cur);
  }
  // Nome de motoboys que só têm lançamento (sem corrida no período).
  const semNome = [...map.values()].filter(v => !v.motoboy_nome).map(v => v.motoboy_id);
  if (semNome.length) {
    const nomes = await query(`SELECT id, nome_completo, codigo FROM motoboys WHERE id = ANY($1::uuid[])`, [semNome]);
    const nm = new Map(nomes.rows.map(r => [r.id, r]));
    for (const v of map.values()) {
      if (!v.motoboy_nome && nm.has(v.motoboy_id)) { v.motoboy_nome = nm.get(v.motoboy_id).nome_completo; v.motoboy_codigo = nm.get(v.motoboy_id).codigo; }
    }
  }
  const motoboys = [...map.values()]
    .map(v => ({ ...v, saldo_cent: v.total_corridas_cent + v.creditos_cent - v.abatimentos_cent }))
    .sort((a, b) => b.saldo_cent - a.saldo_cent);
  const totalGeral = motoboys.reduce((s, m) => s + m.saldo_cent, 0);
  return { motoboys, total_geral_cent: totalGeral };
}

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

// ── Categorias ────────────────────────────────────────────────────
async function listarCategorias({ empresaId }) {
  const { rows } = await query(
    `SELECT id, nome, tipo, cor, ativo,
            (SELECT count(*)::int FROM financeiro_lancamentos l WHERE l.categoria_id = c.id) AS usos
       FROM financeiro_categorias c
      WHERE empresa_id = $1 AND ativo = TRUE ORDER BY nome`, [empresaId]);
  return { categorias: rows };
}
async function criarCategoria({ empresaId, nome, tipo, cor }) {
  if (!nome || !nome.trim()) throw AppError.validacao('Informe o nome da categoria');
  const t = ['credito', 'abatimento', 'ambos'].includes(tipo) ? tipo : 'credito';
  const { rows } = await query(
    `INSERT INTO financeiro_categorias (empresa_id, nome, tipo, cor) VALUES ($1,$2,$3,$4)
     RETURNING id, nome, tipo, cor, ativo`,
    [empresaId, nome.trim(), t, cor || '#185FA5']);
  return rows[0];
}
async function atualizarCategoria({ empresaId, id, nome, tipo, cor, ativo }) {
  const { rows } = await query(
    `UPDATE financeiro_categorias
        SET nome = COALESCE($3, nome), tipo = COALESCE($4, tipo), cor = COALESCE($5, cor), ativo = COALESCE($6, ativo)
      WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresaId, nome ? nome.trim() : null, tipo || null, cor || null, ativo == null ? null : !!ativo]);
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  return { ok: true };
}
async function excluirCategoria({ empresaId, id }) {
  // Soft delete (mantém histórico dos lançamentos que a usaram).
  await query(`UPDATE financeiro_categorias SET ativo = FALSE WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  return { ok: true };
}

// ── Lançamentos ───────────────────────────────────────────────────
async function listarLancamentos({ empresaId, motoboyId, de = null, ate = null, apenasAbertos = false }) {
  const params = [empresaId, motoboyId];
  const cond = ['l.empresa_id = $1', 'l.motoboy_id = $2'];
  if (de) { params.push(de); cond.push(`l.competencia >= $${params.length}`); }
  if (ate) { params.push(ate); cond.push(`l.competencia <= $${params.length}`); }
  if (apenasAbertos) cond.push('l.fechamento_id IS NULL');
  const { rows } = await query(
    `SELECT l.id, l.tipo, l.valor_cent, l.descricao, l.competencia, l.fechamento_id,
            c.nome AS categoria_nome, c.cor AS categoria_cor
       FROM financeiro_lancamentos l
       LEFT JOIN financeiro_categorias c ON c.id = l.categoria_id
      WHERE ${cond.join(' AND ')}
      ORDER BY l.competencia DESC, l.criado_em DESC`, params);
  return { lancamentos: rows };
}
async function criarLancamento({ empresaId, motoboyId, categoriaId, tipo, valorCent, descricao, competencia, usuarioId }) {
  if (!['credito', 'abatimento'].includes(tipo)) throw AppError.validacao('Tipo inválido');
  const v = Math.round(Number(valorCent));
  if (!v || v <= 0) throw AppError.validacao('Informe um valor maior que zero');
  const { rows } = await query(
    `INSERT INTO financeiro_lancamentos (empresa_id, motoboy_id, categoria_id, tipo, valor_cent, descricao, competencia, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8) RETURNING id`,
    [empresaId, motoboyId, categoriaId || null, tipo, v, descricao ? descricao.trim() : null, competencia || null, usuarioId || null]);
  return { id: rows[0].id };
}
async function excluirLancamento({ empresaId, id }) {
  const { rows } = await query(
    `DELETE FROM financeiro_lancamentos WHERE id = $1 AND empresa_id = $2 AND fechamento_id IS NULL RETURNING id`,
    [id, empresaId]);
  if (!rows[0]) throw AppError.validacao('Lançamento não encontrado ou já faz parte de um fechamento (não pode excluir).');
  return { ok: true };
}

// ── Extrato do motoboy (em aberto) ────────────────────────────────
async function extratoMotoboy({ empresaId, motoboyId, de = null, ate = null }) {
  const p = [empresaId, motoboyId];
  const c = ['e.empresa_id = $1', 'e.motoboy_id = $2', "e.status = 'entregue'", 'e.fechamento_id IS NULL'];
  if (de) { p.push(de); c.push(`${DIA_BAHIA} >= $${p.length}`); }
  if (ate) { p.push(ate); c.push(`${DIA_BAHIA} <= $${p.length}`); }
  const corr = await query(
    `SELECT ${DIA_BAHIA} AS dia, count(*)::int AS qtd, COALESCE(SUM(e.valor_motoboy_cent),0)::bigint AS total_cent
       FROM entregas e WHERE ${c.join(' AND ')}
      GROUP BY dia ORDER BY dia DESC`, p);
  const { lancamentos } = await listarLancamentos({ empresaId, motoboyId, de, ate, apenasAbertos: true });

  const totCorridas = corr.rows.reduce((s, r) => s + Number(r.total_cent), 0);
  const qtd = corr.rows.reduce((s, r) => s + r.qtd, 0);
  const totCred = lancamentos.filter(l => l.tipo === 'credito').reduce((s, l) => s + Number(l.valor_cent), 0);
  const totAbat = lancamentos.filter(l => l.tipo === 'abatimento').reduce((s, l) => s + Number(l.valor_cent), 0);
  return {
    corridas_por_dia: corr.rows,
    lancamentos,
    totais: {
      qtd_corridas: qtd, corridas_cent: totCorridas, creditos_cent: totCred,
      abatimentos_cent: totAbat, saldo_cent: totCorridas + totCred - totAbat,
    },
  };
}

// ── Fechamento (repasse) ──────────────────────────────────────────
async function fecharPeriodo({ empresaId, motoboyId, de, ate, usuarioId }) {
  if (!de || !ate) throw AppError.validacao('Informe o período (de/até)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cor = await client.query(
      `SELECT count(*)::int AS qtd, COALESCE(SUM(valor_motoboy_cent),0)::bigint AS total
         FROM entregas
        WHERE empresa_id = $1 AND motoboy_id = $2 AND status = 'entregue' AND fechamento_id IS NULL
          AND (concluida_em AT TIME ZONE 'America/Bahia')::date >= $3
          AND (concluida_em AT TIME ZONE 'America/Bahia')::date <= $4`,
      [empresaId, motoboyId, de, ate]);
    const lan = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo='credito' THEN valor_cent END),0)::bigint AS cred,
              COALESCE(SUM(CASE WHEN tipo='abatimento' THEN valor_cent END),0)::bigint AS abat
         FROM financeiro_lancamentos
        WHERE empresa_id = $1 AND motoboy_id = $2 AND fechamento_id IS NULL
          AND competencia >= $3 AND competencia <= $4`,
      [empresaId, motoboyId, de, ate]);

    const qtd = cor.rows[0].qtd;
    const totalCor = Number(cor.rows[0].total);
    const cred = Number(lan.rows[0].cred);
    const abat = Number(lan.rows[0].abat);
    if (qtd === 0 && cred === 0 && abat === 0) {
      await client.query('ROLLBACK');
      throw AppError.validacao('Nada em aberto para fechar neste período.');
    }
    const saldo = totalCor + cred - abat;
    const f = await client.query(
      `INSERT INTO financeiro_fechamentos
         (empresa_id, motoboy_id, periodo_de, periodo_ate, qtd_corridas, total_corridas_cent, total_creditos_cent, total_abatimentos_cent, saldo_liquido_cent, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [empresaId, motoboyId, de, ate, qtd, totalCor, cred, abat, saldo, usuarioId || null]);
    const fid = f.rows[0].id;
    await client.query(
      `UPDATE entregas SET fechamento_id = $1
        WHERE empresa_id = $2 AND motoboy_id = $3 AND status = 'entregue' AND fechamento_id IS NULL
          AND (concluida_em AT TIME ZONE 'America/Bahia')::date >= $4
          AND (concluida_em AT TIME ZONE 'America/Bahia')::date <= $5`,
      [fid, empresaId, motoboyId, de, ate]);
    await client.query(
      `UPDATE financeiro_lancamentos SET fechamento_id = $1
        WHERE empresa_id = $2 AND motoboy_id = $3 AND fechamento_id IS NULL
          AND competencia >= $4 AND competencia <= $5`,
      [fid, empresaId, motoboyId, de, ate]);
    await client.query('COMMIT');
    return { id: fid, saldo_liquido_cent: saldo };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function listarFechamentos({ empresaId, motoboyId = null, status = null }) {
  const params = [empresaId];
  const cond = ['f.empresa_id = $1'];
  if (motoboyId) { params.push(motoboyId); cond.push(`f.motoboy_id = $${params.length}`); }
  if (status) { params.push(status); cond.push(`f.status = $${params.length}`); }
  const { rows } = await query(
    `SELECT f.id, f.periodo_de, f.periodo_ate, f.qtd_corridas, f.total_corridas_cent,
            f.total_creditos_cent, f.total_abatimentos_cent, f.saldo_liquido_cent,
            f.status, f.forma_pagamento, f.pago_em, f.criado_em,
            m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo
       FROM financeiro_fechamentos f JOIN motoboys m ON m.id = f.motoboy_id
      WHERE ${cond.join(' AND ')}
      ORDER BY f.criado_em DESC LIMIT 500`, params);
  return { fechamentos: rows };
}
async function marcarPago({ empresaId, id, formaPagamento }) {
  const { rows } = await query(
    `UPDATE financeiro_fechamentos SET status = 'pago', forma_pagamento = $3, pago_em = now()
      WHERE id = $1 AND empresa_id = $2 AND status = 'aberto' RETURNING id`,
    [id, empresaId, formaPagamento || null]);
  if (!rows[0]) throw AppError.validacao('Fechamento não encontrado ou já pago.');
  return { ok: true };
}
async function estornarFechamento({ empresaId, id }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const f = await client.query(`SELECT status FROM financeiro_fechamentos WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [id, empresaId]);
    if (!f.rows[0]) { await client.query('ROLLBACK'); throw AppError.naoEncontrado('Fechamento não encontrado'); }
    if (f.rows[0].status === 'pago') { await client.query('ROLLBACK'); throw AppError.validacao('Fechamento já pago não pode ser estornado. Registre um ajuste no próximo período.'); }
    await client.query(`UPDATE entregas SET fechamento_id = NULL WHERE fechamento_id = $1`, [id]);
    await client.query(`UPDATE financeiro_lancamentos SET fechamento_id = NULL WHERE fechamento_id = $1`, [id]);
    await client.query(`DELETE FROM financeiro_fechamentos WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// Lista simples de motoboys ativos (para o seletor de lançamento).
async function listarMotoboysSimples({ empresaId }) {
  const { rows } = await query(
    `SELECT id AS motoboy_id, nome_completo AS motoboy_nome, codigo AS motoboy_codigo
       FROM motoboys WHERE empresa_id = $1 AND status = 'ativo' ORDER BY nome_completo`, [empresaId]);
  return { motoboys: rows };
}

// ═════════ RESUMO (KPIs) ═════════
async function resumoFinanceiro({ empresaId, de = null, ate = null }) {
  const fc = await faturamentoCliente({ empresaId, de, ate });
  const fm = await faturamentoMotoboy({ empresaId, de, ate });
  const pg = await query(`SELECT COALESCE(SUM(saldo_liquido_cent),0)::bigint AS pago FROM financeiro_fechamentos WHERE empresa_id=$1 AND status='pago'`, [empresaId]);
  const tm = await query(`SELECT count(*)::int AS total FROM motoboys WHERE empresa_id=$1 AND status='ativo'`, [empresaId]);
  const comSaldo = (fm.motoboys || []).filter(m => m.saldo_cent > 0).length;
  return {
    faturado_cliente_cent: fc.total_geral_cent || 0,
    a_repassar_cent: fm.total_geral_cent || 0,
    pago_cent: Number(pg.rows[0] ? pg.rows[0].pago : 0),
    motoboys_com_saldo: comSaldo,
    motoboys_total: tm.rows[0] ? tm.rows[0].total : 0,
  };
}

// ═════════ AÇÕES EM LOTE ═════════
async function fecharPeriodoLote({ empresaId, motoboyIds, de, ate, usuarioId }) {
  if (!Array.isArray(motoboyIds) || !motoboyIds.length) throw AppError.validacao('Selecione ao menos um motoboy.');
  if (!de || !ate) throw AppError.validacao('Informe o período (de/até).');
  let fechados = 0, pulados = 0;
  for (const mid of motoboyIds) {
    try { await fecharPeriodo({ empresaId, motoboyId: mid, de, ate, usuarioId }); fechados++; }
    catch (e) { pulados++; }
  }
  return { fechados, pulados };
}
async function marcarPagoLote({ empresaId, ids, formaPagamento }) {
  if (!Array.isArray(ids) || !ids.length) throw AppError.validacao('Selecione ao menos um fechamento.');
  const { rows } = await query(
    `UPDATE financeiro_fechamentos SET status='pago', forma_pagamento=$3, pago_em=now()
      WHERE empresa_id=$1 AND id = ANY($2::uuid[]) AND status='aberto' RETURNING id`,
    [empresaId, ids, formaPagamento || null]);
  return { pagos: rows.length };
}
async function criarLancamentoLote({ empresaId, motoboyIds, categoriaId, tipo, valorCent, descricao, competencia, usuarioId }) {
  if (!Array.isArray(motoboyIds) || !motoboyIds.length) throw AppError.validacao('Selecione ao menos um motoboy.');
  let criados = 0;
  for (const mid of motoboyIds) {
    try { await criarLancamento({ empresaId, motoboyId: mid, categoriaId, tipo, valorCent, descricao, competencia, usuarioId }); criados++; } catch (e) {}
  }
  return { criados };
}

// ═════════ FECHAMENTO AUTOMÁTICO (config + agenda) ═════════
function proximoFechamento(cfg) {
  if (!cfg || !cfg.ativo) return null;
  const hhmm = String(cfg.hora || '08:00').slice(0, 5);
  const [hh, mm] = hhmm.split(':').map(Number);
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
  const alvo = new Date(agora);
  const delta = (Number(cfg.dia_semana) - alvo.getDay() + 7) % 7;
  alvo.setDate(alvo.getDate() + delta);
  alvo.setHours(hh, mm, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 7);
  return alvo.toISOString();
}
function periodoDoFechamento(tipo) {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
  const fmt = (d) => d.toISOString().slice(0, 10);
  if (tipo === 'ultimos_7') { const de = new Date(hoje); de.setDate(de.getDate() - 6); return { de: fmt(de), ate: fmt(hoje) }; }
  if (tipo === 'semana_atual') { const de = new Date(hoje); de.setDate(de.getDate() - ((de.getDay() + 6) % 7)); return { de: fmt(de), ate: fmt(hoje) }; }
  const dom = new Date(hoje); dom.setDate(dom.getDate() - ((dom.getDay() + 6) % 7) - 1); // domingo passado
  const seg = new Date(dom); seg.setDate(dom.getDate() - 6);
  return { de: fmt(seg), ate: fmt(dom) };
}
async function obterFechamentoConfig({ empresaId }) {
  const { rows } = await query(`SELECT * FROM financeiro_fechamento_config WHERE empresa_id=$1`, [empresaId]);
  const cfg = rows[0] || { empresa_id: empresaId, ativo: false, dia_semana: 1, hora: '08:00', periodo_tipo: 'semana_anterior', motoboys_tipo: 'com_saldo', deixar_aberto: true, gerar_lista: true, notificar: false, ultimo_run_em: null };
  cfg.hora = String(cfg.hora || '08:00').slice(0, 5);
  const { de, ate } = periodoDoFechamento(cfg.periodo_tipo);
  return { ...cfg, proximo_em: proximoFechamento(cfg), proximo_periodo: { de, ate } };
}
async function salvarFechamentoConfig({ empresaId, ativo, diaSemana, hora, periodoTipo, motoboysTipo, deixarAberto, gerarLista, notificar }) {
  const h = /^\d{2}:\d{2}/.test(hora || '') ? String(hora).slice(0, 5) : '08:00';
  const ds = Number.isFinite(+diaSemana) ? Math.min(6, Math.max(0, Math.round(+diaSemana))) : 1;
  await query(
    `INSERT INTO financeiro_fechamento_config (empresa_id, ativo, dia_semana, hora, periodo_tipo, motoboys_tipo, deixar_aberto, gerar_lista, notificar, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (empresa_id) DO UPDATE SET ativo=$2, dia_semana=$3, hora=$4, periodo_tipo=$5, motoboys_tipo=$6, deixar_aberto=$7, gerar_lista=$8, notificar=$9, atualizado_em=now()`,
    [empresaId, !!ativo, ds, h, periodoTipo || 'semana_anterior', motoboysTipo || 'com_saldo', deixarAberto !== false, gerarLista !== false, !!notificar]);
  return obterFechamentoConfig({ empresaId });
}
// Chamada pelo cron: fecha automaticamente as empresas cujo horário chegou.
async function rodarFechamentosAutomaticos() {
  const { rows: cfgs } = await query(`SELECT * FROM financeiro_fechamento_config WHERE ativo = TRUE`);
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
  for (const cfg of cfgs) {
    try {
      const [hh, mm] = String(cfg.hora || '08:00').slice(0, 5).split(':').map(Number);
      const ehDia = agora.getDay() === Number(cfg.dia_semana);
      const passou = agora.getHours() > hh || (agora.getHours() === hh && agora.getMinutes() >= mm);
      const jaHoje = cfg.ultimo_run_em && new Date(new Date(cfg.ultimo_run_em).toLocaleString('en-US', { timeZone: 'America/Bahia' })).toDateString() === agora.toDateString();
      if (!(ehDia && passou && !jaHoje)) continue;
      const { de, ate } = periodoDoFechamento(cfg.periodo_tipo);
      const fm = await faturamentoMotoboy({ empresaId: cfg.empresa_id, de, ate });
      let alvos = fm.motoboys || [];
      if (cfg.motoboys_tipo === 'com_saldo') alvos = alvos.filter(m => m.saldo_cent > 0);
      let fechados = 0;
      for (const m of alvos) { try { await fecharPeriodo({ empresaId: cfg.empresa_id, motoboyId: m.motoboy_id, de, ate, usuarioId: null }); fechados++; } catch (e) {} }
      await query(`UPDATE financeiro_fechamento_config SET ultimo_run_em = now() WHERE empresa_id=$1`, [cfg.empresa_id]);
      console.log(`[fechamento-auto] empresa=${cfg.empresa_id} ${de}..${ate} fechados=${fechados}`);
    } catch (e) { console.error('[fechamento-auto] erro', cfg.empresa_id, e.message); }
  }
}

// ═════════ EXPORTAÇÃO (xls/csv) ═════════
function _fmoney(c) { return (Number(c || 0) / 100).toFixed(2).replace('.', ','); }
function _fdt(v) { if (!v) return ''; try { return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Bahia' }); } catch (e) { return ''; } }
function _fcsv(headers, rows) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return '\ufeff' + [headers.map(esc).join(';')].concat(rows.map(r => r.map(esc).join(';'))).join('\r\n');
}
function _fxls(headers, rows, aba) {
  const xe = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cab = headers.map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${xe(h)}</Data></Cell>`).join('');
  const corpo = rows.map(r => '<Row>' + r.map(v => `<Cell><Data ss:Type="String">${xe(v)}</Data></Cell>`).join('') + '</Row>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#042C53" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="${xe(aba || 'Dados')}"><Table><Row>${cab}</Row>${corpo}</Table></Worksheet></Workbook>`;
}
async function exportarClienteCorridas({ empresaId, lojaId, de, ate, formato }) {
  const { corridas } = await faturamentoClienteCorridas({ empresaId, lojaId, de, ate });
  const lj = await query(`SELECT nome_fantasia FROM lojas WHERE id=$1 AND empresa_id=$2`, [lojaId, empresaId]);
  const nome = String(lj.rows[0] ? lj.rows[0].nome_fantasia : 'cliente').replace(/[^a-zA-Z0-9]+/g, '-');
  const headers = ['Protocolo', 'Concluída', 'Coleta', 'Destino', 'Distância (km)', 'Valor', 'Profissional'];
  const rows = corridas.map(c => [c.protocolo, _fdt(c.concluida_em), c.coleta_endereco || '', c.destino_endereco || '', c.distancia_km != null ? Number(c.distancia_km).toFixed(1) : '', _fmoney(c.valor_cliente_cent), (c.motoboy_codigo != null ? c.motoboy_codigo + ' - ' : '') + (c.motoboy_nome || '')]);
  const data = new Date().toISOString().slice(0, 10);
  if (formato === 'csv') return { conteudo: _fcsv(headers, rows), mime: 'text/csv; charset=utf-8', nome: `corridas-${nome}-${data}.csv` };
  return { conteudo: _fxls(headers, rows, 'Corridas'), mime: 'application/vnd.ms-excel; charset=utf-8', nome: `corridas-${nome}-${data}.xls` };
}
async function exportarListaPagamento({ empresaId, ids = null, status = 'aberto', formato }) {
  const params = [empresaId]; const cond = ['f.empresa_id = $1'];
  if (ids && ids.length) { params.push(ids); cond.push(`f.id = ANY($${params.length}::uuid[])`); }
  else if (status) { params.push(status); cond.push(`f.status = $${params.length}`); }
  const { rows } = await query(
    `SELECT f.periodo_de, f.periodo_ate, f.qtd_corridas, f.saldo_liquido_cent, f.status,
            m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo
       FROM financeiro_fechamentos f JOIN motoboys m ON m.id=f.motoboy_id
      WHERE ${cond.join(' AND ')} ORDER BY m.nome_completo`, params);
  const headers = ['Código', 'Motoboy', 'Período', 'Corridas', 'Valor a pagar', 'Status'];
  const linhas = rows.map(r => [r.motoboy_codigo != null ? String(r.motoboy_codigo) : '', r.motoboy_nome || '', (r.periodo_de ? String(r.periodo_de).slice(0, 10) : '') + ' a ' + (r.periodo_ate ? String(r.periodo_ate).slice(0, 10) : ''), r.qtd_corridas, _fmoney(r.saldo_liquido_cent), r.status === 'pago' ? 'Pago' : 'Em aberto']);
  const data = new Date().toISOString().slice(0, 10);
  if (formato === 'csv') return { conteudo: _fcsv(headers, linhas), mime: 'text/csv; charset=utf-8', nome: `lista-pagamento-${data}.csv` };
  return { conteudo: _fxls(headers, linhas, 'Pagamento'), mime: 'application/vnd.ms-excel; charset=utf-8', nome: `lista-pagamento-${data}.xls` };
}


module.exports = {
  faturamentoCliente, faturamentoClienteCentros, faturamentoClienteCorridas,
  faturamentoMotoboy, faturamentoMotoboyCorridas,
  listarMotoboysSimples,
  listarCategorias, criarCategoria, atualizarCategoria, excluirCategoria,
  listarLancamentos, criarLancamento, excluirLancamento,
  extratoMotoboy,
  fecharPeriodo, listarFechamentos, marcarPago, estornarFechamento,
  resumoFinanceiro, fecharPeriodoLote, marcarPagoLote, criarLancamentoLote,
  obterFechamentoConfig, salvarFechamentoConfig, rodarFechamentosAutomaticos,
  exportarClienteCorridas, exportarListaPagamento,
};
