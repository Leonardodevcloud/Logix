// Métricas Prometheus (prom-client). Expostas em GET /metrics (ver app.js) —
// protegidas por METRICS_TOKEN. Grafana Cloud / Prometheus fazem scrape.
const client = require('prom-client');
const crypto = require('crypto');
const { monitorEventLoopDelay } = require('perf_hooks');
const registro = new client.Registry();
client.collectDefaultMetrics({ register: registro, prefix: 'logix_' }); // CPU, memória, event loop, GC

const httpDuracao = new client.Histogram({
  name: 'logix_http_duracao_segundos', help: 'Duração das requisições HTTP',
  labelNames: ['metodo', 'rota', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registro],
});
const gpsPontos = new client.Counter({ name: 'logix_gps_pontos_total', help: 'Pontos GPS gravados', labelNames: ['lote'], registers: [registro] });
const wsConexoes = new client.Gauge({ name: 'logix_ws_conexoes', help: 'Conexões WebSocket abertas nesta réplica', labelNames: ['tipo'], registers: [registro] });
const pgPool = new client.Gauge({ name: 'logix_pg_pool', help: 'Estado do pool pg', labelNames: ['estado'], registers: [registro] });
const uploadsDireto = new client.Counter({ name: 'logix_uploads_direto_total', help: 'URLs de upload direto emitidas', labelNames: ['finalidade'], registers: [registro] });
const uploadsLegado = new client.Counter({ name: 'logix_uploads_legado_base64_total', help: 'Arquivos ainda recebidos em base64 pela API (clientes antigos). Zero sustentado = pode remover o suporte.', labelNames: ['finalidade'], registers: [registro] });
const ofertasAbertas = new client.Gauge({ name: 'logix_ofertas_abertas', help: 'Ofertas de corrida aguardando aceite', registers: [registro] });

// Normaliza a rota para não explodir cardinalidade (uuids → :id).
function rotaNormalizada(req) {
  const base = (req.baseUrl || '') + (req.route && req.route.path ? req.route.path : req.path || '');
  return base.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\/\d+(\/|$)/g, '/:n$1').slice(0, 120) || 'desconhecida';
}

// ── Amostra por minuto (para a tela "Saúde do sistema") ─────────────────────
// Além do Prometheus (que é "puxado"), cada réplica acumula um resumo do último
// minuto e o módulo saude grava no banco. Tudo aqui é em memória e barato.
const INSTANCIA = crypto.randomBytes(6).toString('hex');
const elLag = monitorEventLoopDelay({ resolution: 20 }); elLag.enable();
let acum = novoAcumulador();
function novoAcumulador() { return { inicio: Date.now(), req: 0, err5xx: 0, err4xx: 0, dur: [], porRota: new Map(), gps: 0, gpsLote: 0, upDireto: 0, upLegado: 0 }; }
function p95(arr) { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]; }
function registrarHttp(rota, status, ms) {
  acum.req++;
  if (status >= 500) acum.err5xx++; else if (status >= 400) acum.err4xx++;
  if (acum.dur.length < 5000) acum.dur.push(ms); // reservoir simples
  let r = acum.porRota.get(rota);
  if (!r) { r = { n: 0, dur: [], err: 0 }; acum.porRota.set(rota, r); }
  r.n++; if (status >= 500) r.err++; if (r.dur.length < 1000) r.dur.push(ms);
}
function contarGps(n, lote) { acum.gps += n; if (lote) acum.gpsLote += n; }
function contarUpload(direto) { if (direto) acum.upDireto++; else acum.upLegado++; }
// Fecha a amostra do minuto e zera. Devolve um objeto pronto para JSON.
function colherAmostra() {
  const a = acum; acum = novoAcumulador();
  const rotas = [...a.porRota.entries()].map(([rota, r]) => ({ rota, n: r.n, err: r.err, p95_ms: Math.round(p95(r.dur)) }))
    .sort((x, y) => y.p95_ms - x.p95_ms).slice(0, 15);
  const mem = process.memoryUsage();
  const amostra = {
    instancia: INSTANCIA, versao: process.env.APP_VERSION || undefined,
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || undefined,
    uptime_s: Math.round(process.uptime()), janela_s: Math.round((Date.now() - a.inicio) / 1000),
    req: a.req, err5xx: a.err5xx, err4xx: a.err4xx, p95_ms: Math.round(p95(a.dur)), rotas,
    gps: a.gps, gps_lote: a.gpsLote, up_direto: a.upDireto, up_legado: a.upLegado,
    mem_rss_mb: Math.round(mem.rss / 1048576), el_p99_ms: Math.round(elLag.percentile(99) / 1e6),
  };
  elLag.reset();
  return amostra;
}

function middlewareHttp(req, res, next) {
  const fim = httpDuracao.startTimer();
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.originalUrl === '/metrics' || req.originalUrl.startsWith('/health')) return;
    const rota = rotaNormalizada(req);
    fim({ metodo: req.method, rota, status: String(res.statusCode) });
    registrarHttp(req.method + ' ' + rota, res.statusCode, Number(process.hrtime.bigint() - t0) / 1e6);
  });
  next();
}

// Coletores "puxados" na hora do scrape (não custam nada entre scrapes).
function registrarColetores({ estatisticasWebSocket, estadoPool, contarOfertasAbertas }) {
  const g = new client.Gauge({
    name: 'logix_coletores_ok', help: 'Coletores executados no último scrape', registers: [registro],
    async collect() {
      try {
        if (estatisticasWebSocket) { const s = estatisticasWebSocket(); wsConexoes.set({ tipo: 'motoboy' }, s.motoboys); wsConexoes.set({ tipo: 'painel' }, s.painel); }
        if (estadoPool) { const p = estadoPool(); pgPool.set({ estado: 'total' }, p.total); pgPool.set({ estado: 'ociosas' }, p.ociosas); pgPool.set({ estado: 'aguardando' }, p.aguardando); }
        if (contarOfertasAbertas) ofertasAbertas.set(await contarOfertasAbertas());
        g.set(1);
      } catch { g.set(0); }
    },
  });
}

async function texto() { return registro.metrics(); }

module.exports = { registro, middlewareHttp, registrarColetores, texto, tipoConteudo: registro.contentType, gpsPontos, uploadsLegado, uploadsDireto, colherAmostra, contarGps, contarUpload, INSTANCIA };
