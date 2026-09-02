const { query } = require('../../shared/db');
const { METRICAS_PADRAO, NIVEIS_PADRAO } = require('./score.migration');

// Config da empresa (mescla o padrão para trazer métricas novas que ainda não
// estejam salvas no JSON antigo).
async function obterConfig(empresaId) {
  const { rows } = await query(`SELECT metricas, niveis FROM score_config WHERE empresa_id = $1`, [empresaId]);
  if (!rows[0]) return { metricas: METRICAS_PADRAO, niveis: NIVEIS_PADRAO };
  const metricas = { ...METRICAS_PADRAO };
  for (const [k, v] of Object.entries(rows[0].metricas || {})) metricas[k] = { ...(metricas[k] || {}), ...v };
  const niveis = Array.isArray(rows[0].niveis) && rows[0].niveis.length ? rows[0].niveis : NIVEIS_PADRAO;
  return { metricas, niveis };
}

async function salvarConfig({ empresaId, metricas, niveis }) {
  await query(
    `INSERT INTO score_config (empresa_id, metricas, niveis, atualizado_em)
     VALUES ($1, $2::jsonb, $3::jsonb, now())
     ON CONFLICT (empresa_id) DO UPDATE SET metricas = $2::jsonb, niveis = $3::jsonb, atualizado_em = now()`,
    [empresaId, JSON.stringify(metricas || {}), JSON.stringify(niveis || [])]
  );
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
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM entregas
        WHERE empresa_id = $1 AND motoboy_id = $2 AND status = 'entregue'
          AND concluida_em >= now() - interval '30 days'`,
      [empresaId, motoboyId]
    );
    entregues = rows[0] ? rows[0].n : 0;
  } catch {}
  try {
    const { rows } = await query(
      `SELECT count(*)::int AS n
         FROM entregas_pontos p JOIN entregas en ON en.id = p.entrega_id
        WHERE en.empresa_id = $1 AND en.motoboy_id = $2 AND p.status = 'insucesso'
          AND COALESCE(en.concluida_em, en.criado_em) >= now() - interval '30 days'`,
      [empresaId, motoboyId]
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

module.exports = { obterConfig, salvarConfig, meuScore, nivelDe };
