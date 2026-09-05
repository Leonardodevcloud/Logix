// Montagem da aplicação Express + migrations. Separado do server.js para que os
// testes de integração (supertest) subam o app SEM abrir porta nem WebSocket.
// server.js = processo (porta, WS, sinais). app.js = aplicação.
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const log = require('./shared/logger');
const { requestLogger } = require('./middleware/requestLogger');
const { sanitizarEntrada } = require('./middleware/sanitizer');
const { limiteGlobal } = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const { query, estadoPool } = require('./shared/db');
const eventos = require('./shared/eventos');
const metricas = require('./shared/metricas');
const { rodarMigracoes } = require('./shared/migracoes');
const posicoes = require('./modules/posicoes');
const uploads = require('./modules/uploads');
const { estatisticasWebSocket } = require('./realtime/ws');

// Módulos (cada um expõe initXRoutes + initXTables)
const auth = require('./modules/auth');
const empresas = require('./modules/empresas');
const motoboys = require('./modules/motoboys');
const entregas = require('./modules/entregas');
const rotas = require('./modules/rotas');
const branding = require('./modules/branding');
const permissoes = require('./modules/permissoes');
const filas = require('./modules/filas');
const equipe = require('./modules/equipe');
const lojas = require('./modules/lojas');
const config = require('./modules/config');
const clientehub = require('./modules/clientehub');
const financeiro = require('./modules/financeiro');
const radar = require('./modules/radar');
const mapa = require('./modules/mapa');
const precos = require('./modules/precos');
const integracoes = require('./modules/integracoes');
const relatorios = require('./modules/relatorios');
const score = require('./modules/score');
const apiuso = require('./modules/apiuso');
const regioes = require('./modules/regioes');
const chat = require('./modules/chat');

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
  log.info('migrations de boot (baseline) verificadas');
  // Migrations VERSIONADAS (backend/migrations/*). Idempotente; normalmente já rodou
  // no release command (npm run migrate) — aqui é rede de segurança.
  await rodarMigracoes();
  // Partições do histórico GPS: garante os próximos 7 dias (o cron mantém depois).
  await posicoes.manterParticoes({ diasFrente: 7, retencaoDias: Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30 });
}

// Ouvintes de eventos de domínio (score, chat, ...). Idempotente.
let ouvintesRegistrados = false;
function registrarOuvintes() {
  if (ouvintesRegistrados) return;
  ouvintesRegistrados = true;
  eventos.limpar();
  score.registrarOuvintes();
  chat.registrarOuvintes();
  log.info({ eventos: ['oferta.aceita', 'oferta.recusada', 'entrega.ponto_concluido', 'entrega.concluida'] }, 'ouvintes de eventos registrados');
}

// Monta o app Express com middlewares globais e wiring dos módulos.
// `estado.encerrando` é lido pelo /health/ready (o server.js muda durante o shutdown).
function montarApp(estado = { encerrando: false }) {
  registrarOuvintes();
  const app = express();
  app.set('trust proxy', 1);

  // Compressao gzip/brotli das respostas (telas de admin enviam listas grandes).
  // requestLogger PRIMEIRO: gera o X-Request-Id e abre o contexto antes de qualquer
  // outro middleware — assim até erro de JSON inválido no body-parser sai com reqId.
  app.use(requestLogger);
  app.use(metricas.middlewareHttp);
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
  // Corpo JSON: 1 MB por padrão. Arquivos NÃO passam mais pela API (upload direto ao
  // storage via /uploads). As rotas abaixo ainda aceitam base64 de apps/painéis ANTIGOS
  // e por isso mantêm 15 MB — a lista encolhe até sumir quando todos os clientes migrarem.
  const jsonPadrao = express.json({ limit: '1mb' });
  const jsonLegadoGrande = express.json({ limit: '15mb' });
  const ROTAS_LEGADAS_BASE64 = [
    /^\/api\/v1\/motoboys\/app\/entregas\/[^/]+\/(pontos\/[^/]+\/concluir|concluir-sem-ponto)$/,
    /^\/api\/v1\/motoboys\/app\/documentos$/,
    /^\/api\/v1\/motoboys\/cadastro\/([^/]+|reenviar-cadastro|documentos|cadastros(\/[^/]+\/aprovar)?)$/,
    /^\/api\/v1\/chat\/.+\/mensagens$/,
    /^\/api\/v1\/entregas\/[^/]+\/pontos\/[^/]+\/(concluir|comprovantes)$/,
    /^\/api\/v1\/branding\/?$/,
  ];
  app.use((req, res, next) => (ROTAS_LEGADAS_BASE64.some((re) => re.test(req.path)) ? jsonLegadoGrande : jsonPadrao)(req, res, next));
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
  const VERSAO = process.env.APP_VERSION || require('../package.json').version;
  const live = (req, res) => res.json({ ok: true, servico: 'logix-api', versao: VERSAO, uptime_s: Math.round(process.uptime()), em: new Date().toISOString() });
  const ready = async (req, res) => {
    const t0 = Date.now();
    try {
      await query('SELECT 1');
      res.json({ ok: true, versao: VERSAO, db_ms: Date.now() - t0, pool: estadoPool(), encerrando: estado.encerrando });
    } catch (e) {
      res.status(503).json({ ok: false, erro: 'banco indisponível', db_ms: Date.now() - t0 });
    }
  };
  app.get('/health', live);
  app.get('/health/live', live);
  app.get('/health/ready', ready);
  app.get('/health/db', ready);

  // Métricas Prometheus. Protegidas: exige METRICS_TOKEN (Bearer). Sem a variável → 404.
  metricas.registrarColetores({
    estatisticasWebSocket, estadoPool,
    contarOfertasAbertas: async () => { const r = await query(`SELECT count(*)::int AS n FROM entregas_ofertas WHERE status = 'ofertada'`); return r.rows[0].n; },
  });
  app.get('/metrics', async (req, res) => {
    const tk = process.env.METRICS_TOKEN;
    if (!tk) return res.status(404).end();
    if ((req.headers.authorization || '') !== `Bearer ${tk}`) return res.status(401).end();
    res.set('Content-Type', metricas.tipoConteudo);
    res.send(await metricas.texto());
  });

  const api = express.Router();
  // (O contexto por requisição — reqId/empresaId/usuarioId — já foi aberto pelo
  // requestLogger. Reabrir aqui descartava o reqId dentro das rotas.)
  api.use('/uploads', uploads.initUploadsRoutes()); // upload direto ao storage (URL assinada) — qualquer perfil logado
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

  // Rota inexistente → JSON (o padrão do Express devolve HTML).
  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada', codigo: 'NAO_ENCONTRADO', reqId: req.id }));
  app.use(errorHandler); // sempre por último
  return app;
}


module.exports = { montarApp, migrar, registrarOuvintes };
