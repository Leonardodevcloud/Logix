const { query } = require('../../shared/db');
const { METRICAS_PADRAO, NIVEIS_PADRAO } = require('./score.migration');

// Config global (ajustes gerais da gamificação da empresa).
const CONFIG_GLOBAL_PADRAO = { janela_dias: 30, ranking_ativo: true, gamificacao_ativa: true, nome_programa: '' };

// Config da empresa (mescla o padrão para trazer métricas novas que ainda não
// estejam salvas no JSON antigo).
async function obterConfig(empresaId) {
  const { rows } = await query(`SELECT metricas, niveis, config FROM score_config WHERE empresa_id = $1`, [empresaId]);
  if (!rows[0]) return { metricas: METRICAS_PADRAO, niveis: NIVEIS_PADRAO, config: CONFIG_GLOBAL_PADRAO };
  const metricas = { ...METRICAS_PADRAO };
  for (const [k, v] of Object.entries(rows[0].metricas || {})) metricas[k] = { ...(metricas[k] || {}), ...v };
  const niveis = Array.isArray(rows[0].niveis) && rows[0].niveis.length ? rows[0].niveis : NIVEIS_PADRAO;
  const config = { ...CONFIG_GLOBAL_PADRAO, ...(rows[0].config || {}) };
  return { metricas, niveis, config };
}

// Salva SÓ os campos enviados (não apaga os outros).
async function salvarConfig({ empresaId, metricas, niveis, config }) {
  await query(`INSERT INTO score_config (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING`, [empresaId]);
  const sets = [];
  const params = [empresaId];
  if (metricas !== undefined) { params.push(JSON.stringify(metricas || {})); sets.push(`metricas = $${params.length}::jsonb`); }
  if (niveis !== undefined) { params.push(JSON.stringify(niveis || [])); sets.push(`niveis = $${params.length}::jsonb`); }
  if (config !== undefined) { params.push(JSON.stringify(config || {})); sets.push(`config = $${params.length}::jsonb`); }
  if (sets.length) { sets.push('atualizado_em = now()'); await query(`UPDATE score_config SET ${sets.join(', ')} WHERE empresa_id = $1`, params); }
  return { ok: true };
}

// Dado um total de pontos, resolve nível atual + progresso para o próximo.
function nivelDe(pontos, niveis) {
  const ord = [...(niveis || [])].sort((a, b) => Number(a.min) - Number(b.min));
  if (!ord.length) return { nome: '—', faltam: 0, progresso: 100, proximo: null };
  let atual = ord[0], proximo = null;
  for (let i = 0; i < ord.length; i++) {
    if (pontos >= Number(ord[i].min)) atual = ord[i];
    else { proximo = ord[i]; break; }
  }
  const base = Number(atual.min), teto = proximo ? Number(proximo.min) : base;
  const progresso = proximo && teto > base ? Math.min(1, (pontos - base) / (teto - base)) : 1;
  return {
    nome: atual.nome,
    faltam: proximo ? Math.max(0, teto - pontos) : 0,
    proximo: proximo ? proximo.nome : null,
    progresso: Math.round(progresso * 100),
  };
}

// SCORE READ-ONLY (últimos 30 dias). Não escreve nada e não toca no fluxo de
// conclusão — só lê 'entregas'. As métricas com emVigor=false entram na Fase 2
// (motor de eventos/campanhas).
async function meuScore({ empresaId, motoboyId }) {
  const cfg = await obterConfig(empresaId);
  const m = cfg.metricas;
  const pt = (chave) => {
    const it = m[chave];
    return it && it.ativo !== false ? Number(it.pontos || 0) : 0;
  };

  let entregues = 0, insucessos = 0;
  const janela = String(Number(cfg.config && cfg.config.janela_dias) || 30);
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM entregas
        WHERE empresa_id = $1 AND motoboy_id = $2 AND status = 'entregue'
          AND concluida_em >= now() - (($3)::text || ' days')::interval`,
      [empresaId, motoboyId, janela]
    );
    entregues = rows[0] ? rows[0].n : 0;
  } catch {}
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n
         FROM entregas_pontos p JOIN entregas en ON en.id = p.entrega_id
        WHERE en.empresa_id = $1 AND en.motoboy_id = $2 AND p.status = 'insucesso'
          AND COALESCE(en.concluida_em, en.criado_em) >= now() - (($3)::text || ' days')::interval`,
      [empresaId, motoboyId, janela]
    );
    insucessos = rows[0] ? rows[0].n : 0;
  } catch {}

  const ptEntrega = pt('entrega_concluida');
  const ptInsucesso = pt('insucesso_culpa');
  const pontos = Math.max(0, entregues * ptEntrega + insucessos * ptInsucesso);

  const detalhe = [{ rotulo: 'Entregas concluídas', qtd: entregues, pontos: entregues * ptEntrega }];
  if (insucessos) detalhe.push({ rotulo: 'Insucessos', qtd: insucessos, pontos: insucessos * ptInsucesso });

  return {
    pontos,
    entregues_30d: entregues,
    insucessos_30d: insucessos,
    nivel: nivelDe(pontos, cfg.niveis),
    niveis: cfg.niveis,
    detalhe,
    janela: '30 dias',
  };
}

// ═══════════════════════════════════════════════════════════════════
//  FASE 2 — Campanhas (missões) com alvo + bônus em R$ (liberação manual)
// ═══════════════════════════════════════════════════════════════════
const AppError = require('../../shared/AppError');
const financeiro = require('../financeiro/financeiro.service');

const HOJE = "(now() AT TIME ZONE 'America/Bahia')::date";

// Resolve QUEM participa (motoboys) a partir do alvo. Alvo vazio (sem filtro e
// sem 'todos') → ninguém, de propósito (evita atingir a base toda por engano).
async function resolverCandidatos(empresaId, alvo = {}) {
  const cond = ['empresa_id = $1', "status = 'ativo'", "situacao_cadastro = 'aprovado'"];
  const params = [empresaId];
  if (!alvo.todos) {
    const ors = [];
    if (Array.isArray(alvo.motoboys) && alvo.motoboys.length) { params.push(alvo.motoboys); ors.push(`id = ANY($${params.length}::uuid[])`); }
    if (alvo.novatos_dias) { params.push(String(alvo.novatos_dias)); ors.push(`criado_em >= now() - (($${params.length})::text || ' days')::interval`); }
    if (!ors.length) return [];
    cond.push('(' + ors.join(' OR ') + ')');
  }
  const { rows } = await query(`SELECT id, nome_completo, codigo FROM motoboys WHERE ${cond.join(' AND ')} ORDER BY codigo`, params);
  return rows;
}

// Conta entregas concluídas por motoboy dentro da janela + filtro de cliente.
async function contarEntregues(empresaId, ids, campanha) {
  if (!ids.length) return {};
  const cond = ['empresa_id = $1', "status = 'entregue'", 'motoboy_id = ANY($2::uuid[])'];
  const params = [empresaId, ids];
  if (campanha.inicio) { params.push(campanha.inicio); cond.push(`concluida_em >= $${params.length}::date`); }
  if (campanha.fim) { params.push(campanha.fim); cond.push(`concluida_em < ($${params.length}::date + 1)`); }
  const clientes = campanha.alvo && campanha.alvo.clientes;
  if (Array.isArray(clientes) && clientes.length) { params.push(clientes); cond.push(`loja_id = ANY($${params.length}::uuid[])`); }
  const { rows } = await query(`SELECT motoboy_id, count(*)::int AS n FROM entregas WHERE ${cond.join(' AND ')} GROUP BY motoboy_id`, params);
  const mapa = {};
  for (const r of rows) mapa[r.motoboy_id] = r.n;
  return mapa;
}

async function previaAlvo({ empresaId, alvo }) {
  const c = await resolverCandidatos(empresaId, alvo || {});
  return { total: c.length };
}

async function listarCampanhas({ empresaId }) {
  const { rows } = await query(`SELECT * FROM score_campanhas WHERE empresa_id = $1 ORDER BY criado_em DESC`, [empresaId]);
  return { campanhas: rows };
}
async function obterCampanha({ empresaId, id }) {
  const { rows } = await query(`SELECT * FROM score_campanhas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Campanha não encontrada');
  return rows[0];
}
function sanitizarCampanha(d = {}) {
  const alvo = d.alvo || {}, meta = d.meta || {}, premio = d.premio || {};
  return {
    nome: String(d.nome || '').trim() || 'Campanha',
    tipo: 'missao',
    alvo: {
      todos: !!alvo.todos,
      motoboys: Array.isArray(alvo.motoboys) ? alvo.motoboys.filter(Boolean) : [],
      clientes: Array.isArray(alvo.clientes) ? alvo.clientes.filter(Boolean) : [],
      novatos_dias: alvo.novatos_dias ? parseInt(alvo.novatos_dias, 10) : null,
    },
    meta: { qtd: Math.max(1, parseInt(meta.qtd, 10) || 1), sucesso_min: Math.min(100, Math.max(0, parseInt(meta.sucesso_min, 10) || 0)) },
    premio: { tipo: 'bonus_rs', valor_cent: Math.max(0, Math.round(Number(premio.valor_cent) || 0)) },
    inicio: d.inicio || null,
    fim: d.fim || null,
    status: ['rascunho', 'ativa', 'pausada', 'encerrada'].includes(d.status) ? d.status : 'rascunho',
    prioridade: parseInt(d.prioridade, 10) || 0,
    exclusivo: !!d.exclusivo,
  };
}
async function criarCampanha({ empresaId, dados, usuarioId }) {
  const c = sanitizarCampanha(dados);
  const { rows } = await query(
    `INSERT INTO score_campanhas (empresa_id, nome, tipo, alvo, meta, premio, inicio, fim, status, prioridade, exclusivo, criado_por)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [empresaId, c.nome, c.tipo, JSON.stringify(c.alvo), JSON.stringify(c.meta), JSON.stringify(c.premio), c.inicio, c.fim, c.status, c.prioridade, c.exclusivo, usuarioId || null]
  );
  return { id: rows[0].id };
}
async function atualizarCampanha({ empresaId, id, dados }) {
  await obterCampanha({ empresaId, id });
  const c = sanitizarCampanha(dados);
  await query(
    `UPDATE score_campanhas SET nome=$3, alvo=$4::jsonb, meta=$5::jsonb, premio=$6::jsonb, inicio=$7, fim=$8, status=$9, prioridade=$10, exclusivo=$11
      WHERE id=$1 AND empresa_id=$2`,
    [id, empresaId, c.nome, JSON.stringify(c.alvo), JSON.stringify(c.meta), JSON.stringify(c.premio), c.inicio, c.fim, c.status, c.prioridade, c.exclusivo]
  );
  return { ok: true };
}
async function excluirCampanha({ empresaId, id }) {
  await query(`DELETE FROM score_campanhas WHERE id=$1 AND empresa_id=$2`, [id, empresaId]);
  return { ok: true };
}

// Avalia uma missão: cada candidato com progresso, se completou e se já foi pago.
async function avaliarMissao({ empresaId, id }) {
  const campanha = await obterCampanha({ empresaId, id });
  const candidatos = await resolverCandidatos(empresaId, campanha.alvo);
  const ids = candidatos.map(c => c.id);
  const entregues = await contarEntregues(empresaId, ids, campanha);
  const { rows: pagosRows } = await query(`SELECT motoboy_id FROM score_missao_premios WHERE campanha_id = $1`, [id]);
  const pagos = new Set(pagosRows.map(r => r.motoboy_id));
  const metaQtd = campanha.meta.qtd || 1;
  const lista = candidatos.map(c => {
    const n = entregues[c.id] || 0;
    return { motoboy_id: c.id, nome: c.nome_completo, codigo: c.codigo, entregues: n, meta: metaQtd, completo: n >= metaQtd, jaPago: pagos.has(c.id) };
  }).sort((a, b) => b.entregues - a.entregues);
  return { campanha, valor_cent: campanha.premio.valor_cent || 0, candidatos: lista };
}

// Libera (paga) o bônus — IDEMPOTENTE. Reserva o registro (UNIQUE) ANTES de
// criar o lançamento; se o financeiro falhar, desfaz a reserva.
async function liberarPremio({ empresaId, campanhaId, motoboyId, usuarioId }) {
  const campanha = await obterCampanha({ empresaId, id: campanhaId });
  if (campanha.tipo !== 'missao' || !campanha.premio || campanha.premio.tipo !== 'bonus_rs') throw AppError.validacao('Campanha sem bônus em R$.');
  const valor = Math.round(Number(campanha.premio.valor_cent) || 0);
  if (valor <= 0) throw AppError.validacao('Valor do bônus inválido.');

  const mapa = await contarEntregues(empresaId, [motoboyId], campanha);
  if ((mapa[motoboyId] || 0) < (campanha.meta.qtd || 1)) throw AppError.validacao('Este entregador ainda não bateu a meta.');

  const { rows } = await query(
    `INSERT INTO score_missao_premios (empresa_id, campanha_id, motoboy_id, valor_cent, pago_por)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (campanha_id, motoboy_id) DO NOTHING RETURNING id`,
    [empresaId, campanhaId, motoboyId, valor, usuarioId || null]
  );
  if (!rows[0]) return { ok: true, jaPago: true };

  try {
    const lanc = await financeiro.criarLancamento({
      empresaId, motoboyId, categoriaId: null, tipo: 'credito', valorCent: valor,
      descricao: 'Bônus — ' + campanha.nome, competencia: null, usuarioId,
    });
    await query(`UPDATE score_missao_premios SET lancamento_id = $2 WHERE id = $1`, [rows[0].id, lanc.id]);
  } catch (e) {
    await query(`DELETE FROM score_missao_premios WHERE id = $1`, [rows[0].id]).catch(() => {});
    throw e;
  }
  return { ok: true, pago: true, valor_cent: valor };
}

// Missões ATIVAS que valem para um motoboy (com o progresso dele).
async function missoesDoMotoboy({ empresaId, motoboyId }) {
  const { rows: campanhas } = await query(
    `SELECT * FROM score_campanhas
      WHERE empresa_id = $1 AND tipo = 'missao' AND status = 'ativa'
        AND (inicio IS NULL OR inicio <= ${HOJE})
        AND (fim IS NULL OR fim >= ${HOJE})
      ORDER BY prioridade DESC, criado_em DESC`,
    [empresaId]
  );
  if (!campanhas.length) return { missoes: [] };

  const { rows: mb } = await query(`SELECT criado_em FROM motoboys WHERE id = $1`, [motoboyId]);
  const criadoEm = mb[0] ? new Date(mb[0].criado_em) : null;
  const pagos = await query(`SELECT campanha_id FROM score_missao_premios WHERE motoboy_id = $1`, [motoboyId]);
  const setPagos = new Set(pagos.rows.map(r => r.campanha_id));

  const aplica = (alvo) => {
    if (alvo.todos) return true;
    if (Array.isArray(alvo.motoboys) && alvo.motoboys.includes(motoboyId)) return true;
    if (alvo.novatos_dias && criadoEm) {
      const dias = (Date.now() - criadoEm.getTime()) / 86400000;
      if (dias <= Number(alvo.novatos_dias)) return true;
    }
    return false;
  };

  const missoes = [];
  for (const c of campanhas) {
    if (!aplica(c.alvo || {})) continue;
    const mapa = await contarEntregues(empresaId, [motoboyId], c);
    const feitas = mapa[motoboyId] || 0;
    const metaQtd = (c.meta && c.meta.qtd) || 1;
    missoes.push({
      id: c.id, nome: c.nome, meta: metaQtd, feitas, completo: feitas >= metaQtd,
      progresso: Math.min(100, Math.round((feitas / metaQtd) * 100)),
      premio_cent: (c.premio && c.premio.valor_cent) || 0, jaPago: setPagos.has(c.id), fim: c.fim,
    });
  }
  return { missoes };
}

// ── Fase 3: ranking da semana (read-only; "reset" é automático pela data) ──
async function rankingSemana({ empresaId, motoboyId }) {
  const cfg = await obterConfig(empresaId);
  if (cfg.config && cfg.config.ranking_ativo === false) return { janela: 'semana', total: 0, top: [], eu: null, desativado: true };
  const met = cfg.metricas.entrega_concluida;
  const ptE = met && met.ativo !== false ? Number(met.pontos || 0) : 0;
  const { rows } = await query(
    `SELECT m.id, m.nome_completo, m.codigo, COALESCE(e.n, 0)::int AS entregues
       FROM motoboys m
       LEFT JOIN (
         SELECT motoboy_id, count(*) AS n FROM entregas
          WHERE empresa_id = $1 AND status = 'entregue'
            AND concluida_em >= date_trunc('week', now() AT TIME ZONE 'America/Bahia')
          GROUP BY motoboy_id
       ) e ON e.motoboy_id = m.id
      WHERE m.empresa_id = $1 AND m.status = 'ativo' AND m.situacao_cadastro = 'aprovado'`,
    [empresaId]
  );
  const lista = rows
    .map(r => ({ id: r.id, nome: r.nome_completo, codigo: r.codigo, entregues: r.entregues, pontos: r.entregues * ptE }))
    .sort((a, b) => b.pontos - a.pontos || b.entregues - a.entregues);
  lista.forEach((r, i) => { r.posicao = i + 1; });
  const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
  const eu = lista.find(r => r.id === motoboyId) || null;
  return {
    janela: 'semana',
    total: lista.length,
    top: lista.slice(0, 10).map(r => ({ posicao: r.posicao, nome: primeiroNome(r.nome), pontos: r.pontos, entregues: r.entregues, eu: r.id === motoboyId })),
    eu: eu ? { posicao: eu.posicao, pontos: eu.pontos, entregues: eu.entregues } : null,
  };
}

// Nível (nome) de VÁRIOS motoboys de uma vez — usado pela prioridade por nível
// na fila de ofertas. Read-only, mesma janela/pontos do score.
async function niveisDeMotoboys({ empresaId, motoboyIds }) {
  const out = {};
  if (!motoboyIds || !motoboyIds.length) return out;
  const cfg = await obterConfig(empresaId);
  const met = cfg.metricas.entrega_concluida;
  const ptE = met && met.ativo !== false ? Number(met.pontos || 0) : 0;
  const janela = String(Number(cfg.config && cfg.config.janela_dias) || 30);
  let mapaN = {};
  try {
    const { rows } = await query(
      `SELECT motoboy_id, count(*)::int AS n FROM entregas
        WHERE empresa_id = $1 AND status = 'entregue' AND motoboy_id = ANY($2::uuid[])
          AND concluida_em >= now() - (($3)::text || ' days')::interval
        GROUP BY motoboy_id`,
      [empresaId, motoboyIds, janela]
    );
    for (const r of rows) mapaN[r.motoboy_id] = r.n;
  } catch {}
  for (const id of motoboyIds) {
    const pts = Math.max(0, (mapaN[id] || 0) * ptE);
    out[id] = nivelDe(pts, cfg.niveis).nome;
  }
  return out;
}

module.exports = {
  obterConfig, salvarConfig, meuScore, nivelDe,
  previaAlvo, listarCampanhas, obterCampanha, criarCampanha, atualizarCampanha, excluirCampanha,
  avaliarMissao, liberarPremio, missoesDoMotoboy, rankingSemana, niveisDeMotoboys,
};
