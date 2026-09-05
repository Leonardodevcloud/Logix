require('dotenv').config();
// server.js = PROCESSO: observabilidade, Redis, migrations, porta HTTP, WebSocket,
// cron, sinais do SO. A aplicação Express em si vive em src/app.js.
const { iniciarObservabilidade, capturarErro, encerrarObservabilidade } = require('./src/shared/observabilidade');
iniciarObservabilidade(); // Sentry (só se SENTRY_DSN definido) — antes de qualquer require de módulo
const log = require('./src/shared/logger');
const http = require('http');
const { iniciarRedis, encerrarRedis } = require('./src/shared/redis');
const { iniciarWebSocket, iniciarPubSubWebSocket, encerrarWebSocket } = require('./src/realtime/ws');
const { encerrarPool } = require('./src/shared/db');
const { iniciarCron } = require('./src/jobs/cron');
const { montarApp, migrar } = require('./src/app');
const filas = require('./src/modules/filas');

const estado = { encerrando: false };

async function iniciar() {
  await iniciarRedis();      // opcional: sem REDIS_URL segue em memória (1 réplica)
  await migrar();
  const app = montarApp(estado);
  const server = http.createServer(app);
  // Mantem conexoes keep-alive vivas por 65s (padrao do Node = 5s). Sem isto, a
  // conexao ociosa entre os polls e fechada pelo servidor e o OkHttp do Android
  // falha ao reusa-la numa acao (PATCH/POST) — virava 'Sem conexao' no motoboy.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000; // deve ser > keepAliveTimeout
  iniciarWebSocket(server);
  await iniciarPubSubWebSocket(); // só faz algo com Redis: eventos chegam a todas as réplicas

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
    if (estado.encerrando) return;
    estado.encerrando = true;
    log.warn({ sinal }, 'encerrando processo');
    clearInterval(timerOndas);
    const forcar = setTimeout(() => { log.error('shutdown forçado (timeout)'); process.exit(1); }, 10000);
    forcar.unref();
    try {
      await new Promise((ok) => server.close(() => ok()));
      encerrarWebSocket(1001, 'servidor reiniciando');
      await encerrarPool();
      await encerrarRedis();
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
