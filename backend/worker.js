/* Worker separado — use apenas quando a API escalar para MÚLTIPLAS instâncias
   (aí defina WORKER_EMBUTIDO=false na API para o cron não rodar duplicado).
   No deploy econômico de 1 container, o cron já roda dentro da própria API. */
require('dotenv').config();
process.env.SERVICO_NOME = process.env.SERVICO_NOME || 'logix-worker';
const { iniciarObservabilidade, capturarErro } = require('./src/shared/observabilidade');
iniciarObservabilidade();
const log = require('./src/shared/logger');
const { iniciarCron } = require('./src/jobs/cron');
const { encerrarPool } = require('./src/shared/db');

log.info('worker iniciado');
iniciarCron('worker');

process.on('unhandledRejection', (r) => { log.error({ err: r }, 'unhandledRejection'); capturarErro(r instanceof Error ? r : new Error(String(r))); });
const encerrar = async (sinal) => { log.warn({ sinal }, 'worker encerrando'); await encerrarPool(); process.exit(0); };
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
