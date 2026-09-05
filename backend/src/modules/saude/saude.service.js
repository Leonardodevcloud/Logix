// Saúde do sistema — só super_admin. Junta: amostras por minuto das réplicas
// (HTTP, GPS, WS, memória), estado dos componentes (banco, Redis, storage, RLS) e
// consultas ao próprio banco (ofertas, partições, uploads, erros).
const { query, estadoPool, verificarRls } = require('../../shared/db');
const { redisDisponivel, configurado: redisConfigurado } = require('../../shared/redis');
const { storageConfigurado } = require('../../shared/storage');
const metricas = require('../../shared/metricas');
const log = require('../../shared/logger');

let estatisticasWebSocket = () => ({ motoboys: 0, painel: 0 });
try { ({ estatisticasWebSocket } = require('../../realtime/ws')); } catch {}

const PERIODOS = { '1h': 60, '6h': 360, '24h': 1440, '7d': 10080 };
const RETENCAO_DIAS = 7;

// Chamado a cada 60 s em CADA réplica (não usa lock: cada uma grava a sua).
async function gravarAmostra() {
  const a = metricas.colherAmostra();
  const ws = estatisticasWebSocket();
  const pool = estadoPool();
  a.ws_motoboys = ws.motoboys; a.ws_painel = ws.painel; a.pubsub = !!ws.pubsub;
  a.pool_total = pool.total; a.pool_ociosas = pool.ociosas; a.pool_aguardando = pool.aguardando; a.pool_max = pool.max;
  await query(`INSERT INTO saude_amostras (instancia, dados) VALUES ($1, $2)`, [a.instancia, JSON.stringify(a)]);
  return a;
}

async function registrarErro(d) {
  try {
    await query(`INSERT INTO saude_erros (status, rota, req_id, empresa_id, mensagem) VALUES ($1, $2, $3, $4, $5)`,
      [d.status || 500, d.rota || null, d.reqId || null, d.empresaId || null, d.mensagem || null]);
  } catch (e) { log.warn({ err: e }, 'saude: não gravou erro'); }
}

async function limparAntigas() {
  const r1 = await query(`DELETE FROM saude_amostras WHERE em < now() - make_interval(days => $1)`, [RETENCAO_DIAS]);
  const r2 = await query(`DELETE FROM saude_erros WHERE em < now() - make_interval(days => $1)`, [RETENCAO_DIAS]);
  return { amostras: r1.rowCount, erros: r2.rowCount };
}

function bucketMin(periodoMin) { return periodoMin <= 60 ? 1 : periodoMin <= 360 ? 5 : periodoMin <= 1440 ? 15 : 60; }

async function resumo({ periodo = '6h' } = {}) {
  const min = PERIODOS[periodo] || 360;
  const bucket = bucketMin(min);

  // Em lotes de 4: 12 consultas em paralelo consumiriam o pool inteiro (max 12) e travariam a API.
  const emLotes = async (fns, n = 4) => { const out = []; for (let i = 0; i < fns.length; i += n) out.push(...await Promise.all(fns.slice(i, i + n).map((f) => f()))); return out; };
  const [ultimas, agreg, serie, rotas, ofertas, particoes, hist, fotos, erros, errosHora, rls, migr] = await emLotes([
    // última amostra de cada réplica viva (≤ 2 min)
    () => query(`SELECT DISTINCT ON (instancia) instancia, em, dados FROM saude_amostras WHERE em > now() - interval '2 minutes' ORDER BY instancia, em DESC`),
    // agregados do período e do período anterior (para o delta)
    () => query(`SELECT
        sum((dados->>'req')::int) FILTER (WHERE em > now() - make_interval(mins => $1)) AS req,
        sum((dados->>'err5xx')::int) FILTER (WHERE em > now() - make_interval(mins => $1)) AS err,
        sum((dados->>'gps')::int) FILTER (WHERE em > now() - make_interval(mins => $1)) AS gps,
        sum((dados->>'gps_lote')::int) FILTER (WHERE em > now() - make_interval(mins => $1)) AS gps_lote,
        sum((dados->>'up_direto')::int) FILTER (WHERE em > now() - make_interval(mins => $1)) AS up_direto,
        sum((dados->>'up_legado')::int) FILTER (WHERE em > now() - make_interval(mins => $1)) AS up_legado,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY (dados->>'p95_ms')::int) FILTER (WHERE em > now() - make_interval(mins => $1) AND (dados->>'req')::int > 0) AS p95,
        sum((dados->>'req')::int) FILTER (WHERE em <= now() - make_interval(mins => $1) AND em > now() - make_interval(mins => $2)) AS req_ant,
        sum((dados->>'err5xx')::int) FILTER (WHERE em <= now() - make_interval(mins => $1) AND em > now() - make_interval(mins => $2)) AS err_ant,
        count(DISTINCT instancia) FILTER (WHERE em > now() - make_interval(mins => $1)) AS instancias
      FROM saude_amostras WHERE em > now() - make_interval(mins => $2)`, [min, min * 2]),
    // série temporal em buckets
    () => query(`SELECT to_timestamp(floor(extract(epoch FROM em) / ($2 * 60)) * ($2 * 60)) AS t,
                  sum((dados->>'req')::int) AS req, sum((dados->>'err5xx')::int) AS err, sum((dados->>'gps')::int) AS gps
             FROM saude_amostras WHERE em > now() - make_interval(mins => $1) GROUP BY 1 ORDER BY 1`, [min, bucket]),
    // p95 por rota (mediana dos p95 de cada minuto, ponderando só onde houve tráfego)
    () => query(`SELECT r->>'rota' AS rota, sum((r->>'n')::int) AS n, sum((r->>'err')::int) AS err,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY (r->>'p95_ms')::int) AS p95
             FROM saude_amostras, jsonb_array_elements(dados->'rotas') r
            WHERE em > now() - make_interval(mins => $1) GROUP BY 1 HAVING sum((r->>'n')::int) >= 3 ORDER BY 4 DESC LIMIT 8`, [min]),
    () => query(`SELECT count(*)::int AS abertas, extract(epoch FROM (now() - min(criado_em)))::int AS mais_antiga_s FROM entregas_ofertas WHERE status = 'ofertada'`),
    () => query(`SELECT count(*)::int AS n FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'rastreamento'`),
    () => query(`SELECT coalesce(sum(greatest(c.reltuples, 0)),0)::bigint AS pontos, coalesce(sum(pg_total_relation_size(i.inhrelid)),0)::bigint AS bytes
             FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent JOIN pg_class c ON c.oid = i.inhrelid WHERE p.relname = 'rastreamento'`),
    () => query(`SELECT count(*)::int AS n, coalesce(sum(length(arquivo_url)),0)::bigint AS bytes FROM protocolos WHERE arquivo_url IS NOT NULL AND arquivo_url NOT LIKE 'empresas/%' AND arquivo_url NOT LIKE 'http%'`),
    () => query(`SELECT e.em, e.status, e.rota, e.req_id, e.mensagem, emp.nome_fantasia, emp.razao_social
             FROM saude_erros e LEFT JOIN empresas emp ON emp.id = e.empresa_id ORDER BY e.em DESC LIMIT 20`),
    () => query(`SELECT count(*)::int AS n FROM saude_erros WHERE em > now() - interval '1 hour'`),
    () => verificarRls(),
    () => query(`SELECT count(*)::int AS n FROM pgmigrations`).catch(() => ({ rows: [{ n: null }] })),
  ]);

  const A = agreg.rows[0] || {};
  const reps = ultimas.rows.map((r) => ({ instancia: r.instancia, em: r.em, ...r.dados }));
  const num = (v) => Number(v || 0);
  const reqMin = num(A.req) / min, reqMinAnt = num(A.req_ant) / min;
  const gpsMin = num(A.gps) / min;

  return {
    periodo, bucket_min: bucket, em: new Date().toISOString(),
    status: {
      api: { replicas: reps.length, ok: reps.length > 0 },
      banco: { ok: true, pool: estadoPool() },
      redis: { configurado: redisConfigurado(), conectado: redisDisponivel(), pubsub: reps.some((r) => r.pubsub) },
      storage: { configurado: storageConfigurado() },
      rls,
      erros_hora: errosHora.rows[0].n,
      sentry: !!process.env.SENTRY_DSN,
      versao: process.env.APP_VERSION || require('../../../package.json').version,
      commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    },
    kpis: {
      req_min: Math.round(reqMin), req_delta_pct: reqMinAnt ? Math.round(((reqMin - reqMinAnt) / reqMinAnt) * 100) : null,
      p95_ms: Math.round(num(A.p95)),
      err_pct: num(A.req) ? Math.round((num(A.err) / num(A.req)) * 10000) / 100 : 0, err_total: num(A.err),
      err_pct_ant: num(A.req_ant) ? Math.round((num(A.err_ant) / num(A.req_ant)) * 10000) / 100 : null,
      gps_min: Math.round(gpsMin), gps_lote_pct: num(A.gps) ? Math.round((num(A.gps_lote) / num(A.gps)) * 100) : 0,
      ws_motoboys: reps.reduce((s, r) => s + num(r.ws_motoboys), 0), ws_painel: reps.reduce((s, r) => s + num(r.ws_painel), 0),
    },
    serie: serie.rows.map((r) => ({ t: r.t, req: num(r.req), err: num(r.err), gps: num(r.gps) })),
    rotas: rotas.rows.map((r) => ({ rota: r.rota, n: num(r.n), err: num(r.err), p95_ms: Math.round(num(r.p95)) })),
    tempo_real: { ofertas_abertas: ofertas.rows[0].abertas, oferta_mais_antiga_s: ofertas.rows[0].mais_antiga_s },
    banco: {
      pool: estadoPool(), particoes_gps: particoes.rows[0].n, gps_pontos: num(hist.rows[0].pontos), gps_bytes: num(hist.rows[0].bytes),
      migrations_aplicadas: migr.rows[0].n, retencao_gps_dias: Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30,
    },
    arquivos: { up_direto: num(A.up_direto), up_legado: num(A.up_legado), fotos_legadas: fotos.rows[0].n, fotos_legadas_bytes: num(fotos.rows[0].bytes) },
    replicas: reps.map((r) => ({
      instancia: r.instancia, versao: r.versao, commit: r.commit, uptime_s: r.uptime_s, mem_rss_mb: r.mem_rss_mb, el_p99_ms: r.el_p99_ms,
      ws: num(r.ws_motoboys) + num(r.ws_painel), req_min: r.janela_s ? Math.round(num(r.req) / (r.janela_s / 60)) : num(r.req), em: r.em,
    })),
    erros: erros.rows.map((e) => ({ em: e.em, status: e.status, rota: e.rota, reqId: e.req_id, empresa: e.nome_fantasia || e.razao_social || null, mensagem: e.mensagem })),
  };
}

module.exports = { gravarAmostra, registrarErro, limparAntigas, resumo, PERIODOS };
