// Métricas Prometheus (prom-client). Expostas em GET /metrics (ver app.js) —
// protegidas por METRICS_TOKEN. Grafana Cloud / Prometheus fazem scrape.
const client = require('prom-client');
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
const uploadsLegado = new client.Counter({ name: 'logix_uploads_legado_base64_total', help: 'Arquivos ainda recebidos em base64 pela API (clientes antigos). Zero sustentado = pode remover o suporte.', labelNames: ['finalidade'], registers: [registro] });
const ofertasAbertas = new client.Gauge({ name: 'logix_ofertas_abertas', help: 'Ofertas de corrida aguardando aceite', registers: [registro] });

// Normaliza a rota para não explodir cardinalidade (uuids → :id).
function rotaNormalizada(req) {
  const base = (req.baseUrl || '') + (req.route && req.route.path ? req.route.path : req.path || '');
  return base.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\/\d+(\/|$)/g, '/:n$1').slice(0, 120) || 'desconhecida';
}

function middlewareHttp(req, res, next) {
  const fim = httpDuracao.startTimer();
  res.on('finish', () => {
    if (req.originalUrl === '/metrics' || req.originalUrl.startsWith('/health')) return;
    fim({ metodo: req.method, rota: rotaNormalizada(req), status: String(res.statusCode) });
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

module.exports = { registro, middlewareHttp, registrarColetores, texto, tipoConteudo: registro.contentType, gpsPontos, uploadsLegado };
