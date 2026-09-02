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

// SCORE a partir do LEDGER de eventos (últimos N dias da config). Soma pontos
// por tipo e monta o detalhe com o rótulo de cada métrica.
async function meuScore({ empresaId, motoboyId }) {
  const cfg = await obterConfig(empresaId);
  const janela = String(Number(cfg.config && cfg.config.janela_dias) || 30);
  let linhas = [];
  try {
    const { rows } = await query(
      `SELECT tipo, count(*)::int AS qtd, COALESCE(SUM(pontos),0)::int AS pontos
         FROM score_eventos
        WHERE empresa_id = $1 AND motoboy_id = $2
          AND criado_em >= now() - (($3)::text || ' days')::interval
        GROUP BY tipo`,
      [empresaId, motoboyId, janela]
    );
    linhas = rows;
  } catch {}

  const pontos = Math.max(0, linhas.reduce((s, r) => s + Number(r.pontos), 0));
  const detalhe = linhas
    .map(r => ({ rotulo: (cfg.metricas[r.tipo] && cfg.metricas[r.tipo].rotulo) || r.tipo, qtd: r.qtd, pontos: r.pontos }))
    .sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos));

  return {
    pontos,
    nivel: nivelDe(pontos, cfg.niveis),
    niveis: cfg.niveis,
    detalhe,
    janela: janela + ' dias',
  };
}

// Registra um evento pontuável (fire-and-forget nos chamadores). Idempotente por
// (empresa, motoboy, tipo, ref_id). Usa os pontos ATUAIS da métrica; se a métrica
// estiver desligada (ativo=false) ou valer 0, não grava.
async function registrarEvento({ empresaId, motoboyId, tipo, refId }) {
  if (!empresaId || !motoboyId || !tipo || !refId) return;
  try {
    const cfg = await obterConfig(empresaId);
    const m = cfg.metricas[tipo];
    if (!m || m.ativo === false) return;
    const pontos = Math.round(Number(m.pontos) || 0);
    if (!pontos) return;
    await query(
      `INSERT INTO score_eventos (empresa_id, motoboy_id, tipo, pontos, ref_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (empresa_id, motoboy_id, tipo, ref_id) DO NOTHING`,
      [empresaId, motoboyId, tipo, pontos, String(refId)]
    );
  } catch {}
}

// Eventos da conclusão de um PONTO (ou de uma entrega sem ponto, usando entregaId
// como ref). Emite entrega_concluida OU insucesso_culpa + foto_ok + dia_ativo +
// no_prazo (best-effort via SLA padrão). Tudo blindado — nunca lança.
async function registrarEventosConclusao({ empresaId, motoboyId, entregaId, refId, insucesso, temFoto }) {
  const ref = refId || entregaId;
  try {
    if (insucesso) {
      await registrarEvento({ empresaId, motoboyId, tipo: 'insucesso_culpa', refId: ref });
      return; // insucesso não ganha foto/prazo/dia
    }
    await registrarEvento({ empresaId, motoboyId, tipo: 'entrega_concluida', refId: ref });
    if (temFoto) await registrarEvento({ empresaId, motoboyId, tipo: 'foto_ok', refId: ref });
    // dia ativo (1x por dia, ref = data em America/Bahia)
    try {
      const { rows } = await query(`SELECT (now() AT TIME ZONE 'America/Bahia')::date::text AS d`);
      if (rows[0]) await registrarEvento({ empresaId, motoboyId, tipo: 'dia_ativo', refId: 'dia:' + rows[0].d });
    } catch {}
    // no prazo (best-effort): concluída até criado_em + SLA padrão da empresa/loja.
    try {
      const { rows } = await query(
        `SELECT e.criado_em, e.concluida_em, e.loja_id,
                COALESCE((SELECT sla_padrao_min FROM sla_config s WHERE s.empresa_id = e.empresa_id AND s.loja_id = e.loja_id),
                         (SELECT sla_padrao_min FROM sla_config s WHERE s.empresa_id = e.empresa_id AND s.loja_id IS NULL),
                         90) AS sla_min
           FROM entregas e WHERE e.id = $1`,
        [entregaId]
      );
      const r = rows[0];
      if (r && r.criado_em) {
        const limite = new Date(new Date(r.criado_em).getTime() + Number(r.sla_min || 90) * 60000);
        const fim = r.concluida_em ? new Date(r.concluida_em) : new Date();
        if (fim <= limite) await registrarEvento({ empresaId, motoboyId, tipo: 'no_prazo', refId: ref });
      }
    } catch {}
  } catch {}
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

// Conta entregas concluídas por motoboy dentro da janela + filtro de cliente
// (e de região, quando a campanha tem alvo por região — coleta dentro do polígono).
async function contarEntregues(empresaId, ids, campanha) {
  if (!ids.length) return {};
  const regioesIds = campanha.alvo && Array.isArray(campanha.alvo.regioes) ? campanha.alvo.regioes.filter(Boolean) : [];
  const cond = ['empresa_id = $1', "status = 'entregue'", 'motoboy_id = ANY($2::uuid[])'];
  const params = [empresaId, ids];
  if (campanha.inicio) { params.push(campanha.inicio); cond.push(`concluida_em >= $${params.length}::date`); }
  if (campanha.fim) { params.push(campanha.fim); cond.push(`concluida_em < ($${params.length}::date + 1)`); }
  const clientes = campanha.alvo && campanha.alvo.clientes;
  if (Array.isArray(clientes) && clientes.length) { params.push(clientes); cond.push(`loja_id = ANY($${params.length}::uuid[])`); }

  // Caminho rápido: sem região, conta direto no banco.
  if (!regioesIds.length) {
    const { rows } = await query(`SELECT motoboy_id, count(*)::int AS n FROM entregas WHERE ${cond.join(' AND ')} GROUP BY motoboy_id`, params);
    const mapa = {};
    for (const r of rows) mapa[r.motoboy_id] = r.n;
    return mapa;
  }

  // Com região: puxa as entregas (com coleta) e filtra em JS (ponto no polígono).
  let regioesSvc = null;
  try { regioesSvc = require('../regioes/regioes.service'); } catch {}
  let polys = [];
  if (regioesSvc) { try { polys = await regioesSvc.poligonosDe({ empresaId, ids: regioesIds }); } catch {} }
  const { rows } = await query(`SELECT motoboy_id, coleta_lat, coleta_lng FROM entregas WHERE ${cond.join(' AND ')}`, params);
  const mapa = {};
  for (const r of rows) {
    const la = r.coleta_lat != null ? Number(r.coleta_lat) : null;
    const ln = r.coleta_lng != null ? Number(r.coleta_lng) : null;
    if (la == null || ln == null) continue;
    if (regioesSvc && polys.some(p => regioesSvc.dentroDoPoligono(la, ln, p))) mapa[r.motoboy_id] = (mapa[r.motoboy_id] || 0) + 1;
  }
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
      regioes: Array.isArray(alvo.regioes) ? alvo.regioes.filter(Boolean) : [],
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
  const { rows } = await query(
    `SELECT m.id, m.nome_completo, m.codigo, COALESCE(e.pts, 0)::int AS pontos
       FROM motoboys m
       LEFT JOIN (
         SELECT motoboy_id, SUM(pontos) AS pts FROM score_eventos
          WHERE empresa_id = $1 AND criado_em >= date_trunc('week', now() AT TIME ZONE 'America/Bahia')
          GROUP BY motoboy_id
       ) e ON e.motoboy_id = m.id
      WHERE m.empresa_id = $1 AND m.status = 'ativo' AND m.situacao_cadastro = 'aprovado'`,
    [empresaId]
  );
  const lista = rows
    .map(r => ({ id: r.id, nome: r.nome_completo, codigo: r.codigo, pontos: Math.max(0, r.pontos) }))
    .sort((a, b) => b.pontos - a.pontos);
  lista.forEach((r, i) => { r.posicao = i + 1; });
  const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
  const eu = lista.find(r => r.id === motoboyId) || null;
  return {
    janela: 'semana',
    total: lista.length,
    top: lista.slice(0, 10).map(r => ({ posicao: r.posicao, nome: primeiroNome(r.nome), pontos: r.pontos, eu: r.id === motoboyId })),
    eu: eu ? { posicao: eu.posicao, pontos: eu.pontos } : null,
  };
}

// Nível (nome) de VÁRIOS motoboys de uma vez — usado pela prioridade por nível
// na fila de ofertas. Read-only, mesma janela/pontos do score.
async function niveisDeMotoboys({ empresaId, motoboyIds }) {
  const out = {};
  if (!motoboyIds || !motoboyIds.length) return out;
  const cfg = await obterConfig(empresaId);
  const janela = String(Number(cfg.config && cfg.config.janela_dias) || 30);
  let mapa = {};
  try {
    const { rows } = await query(
      `SELECT motoboy_id, COALESCE(SUM(pontos),0)::int AS pts FROM score_eventos
        WHERE empresa_id = $1 AND motoboy_id = ANY($2::uuid[])
          AND criado_em >= now() - (($3)::text || ' days')::interval
        GROUP BY motoboy_id`,
      [empresaId, motoboyIds, janela]
    );
    for (const r of rows) mapa[r.motoboy_id] = r.pts;
  } catch {}
  for (const id of motoboyIds) out[id] = nivelDe(Math.max(0, mapa[id] || 0), cfg.niveis).nome;
  return out;
}

module.exports = {
  obterConfig, salvarConfig, meuScore, nivelDe,
  previaAlvo, listarCampanhas, obterCampanha, criarCampanha, atualizarCampanha, excluirCampanha,
  avaliarMissao, liberarPremio, missoesDoMotoboy, rankingSemana, niveisDeMotoboys,
  registrarEvento, registrarEventosConclusao,
};
