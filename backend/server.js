require('dotenv').config();
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
const { iniciarWebSocket } = require('./src/realtime/ws');
const { iniciarCron } = require('./src/jobs/cron');

// Módulos (cada um expõe initXRoutes + initXTables)
const auth = require('./src/modules/auth');
const empresas = require('./src/modules/empresas');
const motoboys = require('./src/modules/motoboys');
const entregas = require('./src/modules/entregas');
const branding = require('./src/modules/branding');
const permissoes = require('./src/modules/permissoes');
const filas = require('./src/modules/filas');
const equipe = require('./src/modules/equipe');
const lojas = require('./src/modules/lojas');
const config = require('./src/modules/config');
const clientehub = require('./src/modules/clientehub');
const financeiro = require('./src/modules/financeiro');
const mapa = require('./src/modules/mapa');

// Executa as migrations na ordem correta (FKs: empresas antes de usuarios/motoboys/entregas).
async function migrar() {
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
  console.log('[migrations] tabelas verificadas/criadas');
}

// Monta o app Express com middlewares globais e wiring dos módulos.
function montarApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Compressao gzip/brotli das respostas. Corta 70-90% do payload JSON das telas
  // de admin (acompanhamento/mapa enviam listas grandes). Ganho imediato no fio,
  // independente da rede. Fica no topo da stack para envolver todas as respostas.
  app.use(compression());
  app.use(helmet());
  const origensCors = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origensCors.length ? origensCors : true, credentials: true }));
  // 15mb: o cadastro do app envia até 4 documentos/fotos em base64 numa única requisição.
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  app.use(sanitizarEntrada);
  app.use(requestLogger);
  app.use(limiteGlobal);

  app.get('/health', (req, res) => res.json({ ok: true, servico: 'logix-api', em: new Date().toISOString() }));
  // Mede a latência real do banco (use um pinger externo aqui para manter tudo quente).
  app.get('/health/db', async (req, res) => {
    const { query } = require('./src/shared/db');
    const t0 = Date.now();
    try { await query('SELECT 1'); res.json({ ok: true, db_ms: Date.now() - t0 }); }
    catch (e) { res.status(500).json({ ok: false, erro: e.message, db_ms: Date.now() - t0 }); }
  });

  const api = express.Router();
  api.use('/auth', auth.initAuthRoutes());
  api.use('/empresas', empresas.initEmpresasRoutes());
  api.use('/motoboys', motoboys.initMotoboysRoutes());
  api.use('/entregas', entregas.initEntregasRoutes());
  api.use('/branding', branding.initBrandingRoutes());
  api.use('/permissoes', permissoes.initPermissoesRoutes());
  api.use('/filas', filas.initFilasRoutes());
  api.use('/equipe', equipe.initEquipeRoutes());
  api.use('/lojas', lojas.initLojasRoutes());
  api.use('/config', config.initConfigRoutes());
  api.use('/clientes', clientehub.initClienteHubRoutes());
  api.use('/financeiro', financeiro.initFinanceiroRoutes());
  api.use('/mapa', mapa.initMapaRoutes());
  app.use('/api/v1', api);

  app.use(errorHandler); // sempre por último
  return app;
}

async function iniciar() {
  await migrar();
  const app = montarApp();
  const server = http.createServer(app);
  iniciarWebSocket(server);

  // Modo econômico (padrão): roda os cron jobs no MESMO processo da API — 1 container só.
  // Ao escalar para múltiplas instâncias, rode o worker separado e defina WORKER_EMBUTIDO=false.
  if (process.env.WORKER_EMBUTIDO !== 'false') iniciarCron('api');

  const porta = process.env.PORT || 3000;
  server.listen(porta, () => console.log(`[logix-api] ouvindo na porta ${porta}`));
}

iniciar().catch((e) => {
  console.error('[logix-api] falha ao iniciar:', e);
  process.exit(1);
});
