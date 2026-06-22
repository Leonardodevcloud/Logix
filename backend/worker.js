/* Worker separado — use apenas quando a API escalar para MÚLTIPLAS instâncias
   (aí defina WORKER_EMBUTIDO=false na API para o cron não rodar duplicado).
   No deploy econômico de 1 container, o cron já roda dentro da própria API. */
require('dotenv').config();
const { iniciarCron } = require('./src/jobs/cron');

console.log('[worker] processo separado iniciado');
iniciarCron('worker');
