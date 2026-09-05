require('dotenv').config();
const { iniciarObservabilidade, capturarErro, encerrarObservabilidade } = require('./src/shared/observabilidade');
iniciarObservabilidade(); // Sentry (só se SENTRY_DSN definido) — antes de qualquer require de módulo
const log = require('./src/shared/logger');
const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { requestLogger } = require('./src/middleware/requestLogger');
const { sanitizarEntrada } = require('./src/middleware/sanitizer');
const { limiteGlobal } = require('./src/middleware/rateLimit');
const errorHandler = require('./src/middleware/errorHandler');
const { iniciarWebSocket, encerrarWebSocket } = require('./src/realtime/ws');
const { query, estadoPool, encerrarPool } = require('./src/shared/db');
const { iniciarCron } = require('./src/jobs/cron');

// Módulos (cada um expõe initXRoutes + initXTables)
const auth = require('./src/modules/auth');
const empresas = require('./src/modules/empresas');
const motoboys = require('./src/modules/motoboys');
const entregas = require('./src/modules/entregas');
const rotas = require('./src/modules/rotas');
const branding = require('./src/modules/branding');
const permissoes = require('./src/modules/permissoes');
const filas = require('./src/modules/filas');
const equipe = require('./src/modules/equipe');
const lojas = require('./src/modules/lojas');
const config = require('./src/modules/config');
const clientehub = require('./src/modules/clientehub');
const financeiro = require('./src/modules/financeiro');
const radar = require('./src/modules/radar');
const mapa = require('./src/modules/mapa');
const precos = require('./src/modules/precos');
const integracoes = require('./src/modules/integracoes');
const relatorios = require('./src/modules/relatorios');
const score = require('./src/modules/score');
const apiuso = require('./src/modules/apiuso');
const regioes = require('./src/modules/regioes');
const chat = require('./src/modules/chat');

// Executa as migrations na ordem correta (FKs: empresas antes de usuarios/motoboys/entregas).
// Advisory lock: com N réplicas subindo juntas no deploy, só UMA executa as
// migrations; as outras esperam e seguem. Sem isto, CREATE ... IF NOT EXISTS
// concorrente gera "duplicate key value violates unique constraint pg_type_typname".
const MIGRATION_LOCK = 7264_2025;
async function migrar() {
  await query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
  try { await migrarTabelas(); }
  finally { await query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {}); }
}
async function migrarTabelas() {
  await empresas.initEmpresasTables();
  await auth.initAuthTables();
  await permissoes.initPermissoesTables();
  await motoboys.initMotoboysTables();
  await entregas.initEntregasTables();
  await lojas.initLojasTables();   // depois de entregas e enderecos_salvos (FKs + ALTER perfil)
  await filas.initFilasTables();
  await equipe.initEquipeTables();
  await config.initConfigTables();  // depois de lojas (FK frete_categoria_lojas -> lojas)
  await clientehub.initClienteHubTables();  // depois de config (FK -> frete_categorias) e motoboys
  await branding.initBrandingTables();
  await mapa.initMapaTables();    // depois de clientehub (coluna em cliente_regras_acionamento)
  await precos.initPrecosTables();
  await financeiro.initFinanceiroTables();  // tabelas de lancamentos/fechamentos + ALTER entregas
  await radar.initRadarTables();            // config + alertas do radar operacional
  await integracoes.initIntegracoesTables(); // chaves de API + ALTER entregas (referencia_externa, rastreio_token...)
  await score.initScoreTables();             // gamificação: score_config por empresa (só depende de empresas)
  await regioes.initRegioesTables();         // regiões (polígonos) por empresa
  await chat.initChatTables();               // chat interno (conversas/mensagens) — depois de entregas/lojas/motoboys
  await apiuso.initApiUsoTables();            // monitor de uso/custo das APIs externas (ORS/Google) por cliente
  log.info('migrations verificadas/aplicadas');
}

// Monta o app Express com middlewares globais e wiring dos módulos.
function montarApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Compressao gzip/brotli das respostas (telas de admin enviam listas grandes).
  // requestLogger PRIMEIRO: gera o X-Request-Id e abre o contexto antes de qualquer
  // outro middleware — assim até erro de JSON inválido no body-parser sai com reqId.
  app.use(requestLogger);
  app.use(compression());
  app.use(helmet());
  // CORS: lista explícita de origens. SEM CORS_ORIGIN, nenhuma origem cross-site é
  // aceita (antes o padrão era refletir QUALQUER origem com credentials — inseguro).
  // Requisições sem header Origin (app nativo, ERP server-to-server, curl) passam.
  // Origens permitidas = CORS_ORIGIN (fixas: painel Logix/Vercel) + qualquer domínio
  // white-label cadastrado em empresa_branding (dinâmico, cache 5 min). Um cliente novo
  // não precisa de variável nem de deploy. Sem curinga: com credentials=true, um
  // curinga permitiria que outro site lesse /auth/refresh com o cookie da vítima.
  const origensCors = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origensCors.length && process.env.NODE_ENV === 'production') log.warn('CORS_ORIGIN vazio — só domínios white-label cadastrados serão aceitos');
  const cacheOrigem = new Map(); // origin -> { ok, ate }
  const ORIGEM_TTL_MS = 5 * 60_000;
  async function origemPermitida(origin) {
    if (origensCors.includes(origin)) return true;
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
    const c = cacheOrigem.get(origin);
    if (c && c.ate > Date.now()) return c.ok;
    let ok = false;
    try {
      const host = new URL(origin).hostname;
      ok = !!(await branding.resolverEmpresaPorHost(host));
    } catch (_) { ok = false; }
    cacheOrigem.set(origin, { ok, ate: Date.now() + ORIGEM_TTL_MS });
    if (!ok) log.warn({ origin }, 'CORS: origem não permitida');
    return ok;
  }
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // app nativo, ERP, curl, same-origin sem header
      origemPermitida(origin).then((ok) => cb(null, ok)).catch(() => cb(null, false));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  }));
  // 15mb: o cadastro do app envia até 4 documentos/fotos em base64 numa única requisição.
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  app.use(sanitizarEntrada);

  // API PÚBLICA de integração (ERP dos clientes) — montada ANTES do limite global
  // por IP: um ERP dispara muitas corridas do mesmo IP e tem limitador próprio por
  // chave (2 gravar/s, 1 status/30s). Não usa JWT (auth por cod_cliente + token).
  app.use('/api/v1/integracao', integracoes.initIntegracoesPublicRoutes());

  app.use(limiteGlobal);

  // Health checks (padrão Kubernetes):
  //   /health/live  → o processo está vivo (não toca em nada externo)
  //   /health/ready → pronto para receber tráfego (banco responde). Aponte o Railway aqui.
  //   /health e /health/db mantidos por compatibilidade.
  const VERSAO = process.env.APP_VERSION || require('./package.json').version;
  const live = (req, res) => res.json({ ok: true, servico: 'logix-api', versao: VERSAO, uptime_s: Math.round(process.uptime()), em: new Date().toISOString() });
  const ready = async (req, res) => {
    const t0 = Date.now();
    try {
      await query('SELECT 1');
      res.json({ ok: true, versao: VERSAO, db_ms: Date.now() - t0, pool: estadoPool(), encerrando });
    } catch (e) {
      res.status(503).json({ ok: false, erro: 'banco indisponível', db_ms: Date.now() - t0 });
    }
  };
  app.get('/health', live);
  app.get('/health/live', live);
  app.get('/health/ready', ready);
  app.get('/health/db', ready);

  const api = express.Router();
  // Contexto por requisição (carrega empresa_id até as integrações externas p/ métricas de API).
  const { als } = require('./src/shared/contexto');
  api.use((req, res, next) => als.run({ empresaId: null }, () => next()));
  api.use('/auth', auth.initAuthRoutes());
  api.use('/empresas', empresas.initEmpresasRoutes());
  api.use('/motoboys', motoboys.initMotoboysRoutes());
  api.use('/entregas', entregas.initEntregasRoutes());
  api.use('/rotas', rotas.initRotasRoutes());
  api.use('/branding', branding.initBrandingRoutes());
  api.use('/permissoes', permissoes.initPermissoesRoutes());
  api.use('/filas', filas.initFilasRoutes());
  api.use('/equipe', equipe.initEquipeRoutes());
  api.use('/lojas', lojas.initLojasRoutes());
  api.use('/config', config.initConfigRoutes());
  api.use('/clientes', clientehub.initClienteHubRoutes());
  api.use('/financeiro', financeiro.initFinanceiroRoutes());
  api.use('/radar', radar.initRadarRoutes());
  api.use('/mapa', mapa.initMapaRoutes());
  api.use('/precos', precos.initPrecosRoutes());
  api.use('/integracoes', integracoes.initIntegracoesRoutes());
  api.use('/relatorios', relatorios.initRelatoriosRoutes());
  api.use('/score', score.initScoreRoutes());
  api.use('/api-uso', apiuso.initApiUsoRoutes());
  api.use('/regioes', regioes.initRegioesRoutes());
  api.use('/chat', chat.initChatRoutes());
  app.use('/api/v1', api);

  app.use(errorHandler); // sempre por último
  return app;
}

let encerrando = false;

async function iniciar() {
  await migrar();
  const app = montarApp();
  const server = http.createServer(app);
  // Mantem conexoes keep-alive vivas por 65s (padrao do Node = 5s). Sem isto, a
  // conexao ociosa entre os polls e fechada pelo servidor e o OkHttp do Android
  // falha ao reusa-la numa acao (PATCH/POST) — virava 'Sem conexao' no motoboy.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000; // deve ser > keepAliveTimeout
  iniciarWebSocket(server);

  // Promotor de ondas da prioridade por nível: abre as próximas ondas das
  // ofertas escalonadas. Roda AQUI (processo com WebSocket), a cada 5s. É leve:
  // só toca ofertas 'ofertada' com proxima_onda_em vencida. Blindado por try/catch.
  const timerOndas = setInterval(() => { filas.promoverOndasPendentes().catch((e) => log.error({ err: e }, 'promoverOndas falhou')); }, 5000);

  // Modo econômico (padrão): roda os cron jobs no MESMO processo da API — 1 container só.
  // Ao escalar para múltiplas instâncias, rode o worker separado e defina WORKER_EMBUTIDO=false.
  if (process.env.WORKER_EMBUTIDO !== 'false') {
    if (process.env.NODE_ENV === 'production') log.warn('WORKER_EMBUTIDO=true: cron dentro da API. Ao rodar 2+ réplicas, suba o worker e defina WORKER_EMBUTIDO=false');
    iniciarCron('api');
  }

  const porta = process.env.PORT || 3000;
  server.listen(porta, () => log.info({ porta, versao: process.env.APP_VERSION || require('./package.json').version, node: process.version }, 'logix-api ouvindo'));

  // Graceful shutdown: no deploy o Railway envia SIGTERM. Sem isto, requisições em
  // voo morrem no meio, WebSockets caem sem código e conexões pg ficam presas.
  // Sequência: para de aceitar → avisa WS → espera requests (até 10s) → fecha pool → sai.
  const encerrar = async (sinal) => {
    if (encerrando) return;
    encerrando = true;
    log.warn({ sinal }, 'encerrando processo');
    clearInterval(timerOndas);
    const forcar = setTimeout(() => { log.error('shutdown forçado (timeout)'); process.exit(1); }, 10000);
    forcar.unref();
    try {
      await new Promise((ok) => server.close(() => ok()));
      encerrarWebSocket(1001, 'servidor reiniciando');
      await encerrarPool();
      await encerrarObservabilidade();
      log.info('encerrado com sucesso');
      process.exit(0);
    } catch (e) {
      log.error({ err: e }, 'erro no shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

// Falhas fora de request: logar + Sentry. unhandledRejection derrubava o processo em silêncio.
process.on('unhandledRejection', (razao) => {
  log.error({ err: razao }, 'unhandledRejection');
  capturarErro(razao instanceof Error ? razao : new Error(String(razao)), { origem: 'unhandledRejection' });
});
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaughtException — encerrando');
  capturarErro(err, { origem: 'uncaughtException' });
  setTimeout(() => process.exit(1), 500).unref();
});

iniciar().catch((e) => {
  log.fatal({ err: e }, 'falha ao iniciar');
  process.exit(1);
});
