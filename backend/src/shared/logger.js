// Logger estruturado (JSON) — pino. Substitui console.log em todo o backend.
//
// Por que JSON: Railway, Datadog, Better Stack e Grafana Loki indexam campos.
// "quem foi o motoboy X às 14:32" vira um filtro (reqId / motoboyId), não um grep.
//
// Uso:  const log = require('../shared/logger');  log.info({ entregaId }, 'entrega criada');
// Dentro de uma requisição, o reqId e o empresaId entram automaticamente pelo
// AsyncLocalStorage (ver contexto.js) — não precisa passar nada.
const pino = require('pino');
const { getContexto } = require('./contexto');

const nivel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const base = pino({
  level: nivel,
  base: { servico: process.env.SERVICO_NOME || 'logix-api', versao: process.env.APP_VERSION || require('../../package.json').version },
  // Sempre JSON (1 linha por evento). Em dev, para ler bonito: npm run dev | npx pino-pretty
  // Nunca logar segredos/tokens que passem em objetos.
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'senha', 'token', 'accessToken', 'refreshToken', '*.senha', '*.token'], censor: '[redacted]' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Mixin: injeta reqId/empresaId/usuarioId do contexto da requisição em TODO log.
const log = base.child({}, {
  mixin() {
    const c = getContexto();
    if (!c) return {};
    const extra = {};
    if (c.reqId) extra.reqId = c.reqId;
    if (c.empresaId) extra.empresaId = c.empresaId;
    if (c.usuarioId) extra.usuarioId = c.usuarioId;
    return extra;
  },
});

module.exports = log;
