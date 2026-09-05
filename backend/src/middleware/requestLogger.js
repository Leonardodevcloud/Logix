// Correlação + log estruturado de cada requisição.
//
// 1) Gera (ou aceita do proxy) um X-Request-Id e devolve no header da resposta —
//    o suporte pede o id ao cliente e acha o log exato.
// 2) Abre o contexto (AsyncLocalStorage) da requisição com esse reqId, para que
//    TODO log.* dentro do handler saia com reqId/empresaId sem passar nada.
// 3) No fim, loga método, rota, status, duração e tamanho — em JSON.
const crypto = require('crypto');
const { comContexto } = require('../shared/contexto');
const log = require('../shared/logger');

const HEADER = 'x-request-id';
const REQ_ID_OK = /^[A-Za-z0-9._-]{8,128}$/;

function requestLogger(req, res, next) {
  const vindo = req.headers[HEADER];
  const reqId = (typeof vindo === 'string' && REQ_ID_OK.test(vindo)) ? vindo : crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);

  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const campos = {
      reqId,
      metodo: req.method,
      rota: req.originalUrl.split('?')[0],
      status: res.statusCode,
      duracao_ms: Math.round(ms * 10) / 10,
      bytes: Number(res.getHeader('content-length')) || undefined,
      ip: req.ip,
      // O tenant/usuário entram via mixin do logger (contexto) quando resolvidos.
      usuarioId: req.usuario ? req.usuario.id : (req.motoboy ? req.motoboy.id : undefined),
      perfil: req.usuario ? req.usuario.perfil : (req.motoboy ? 'motoboy' : undefined),
    };
    if (res.statusCode >= 500) log.error(campos, 'http');
    else if (res.statusCode >= 400) log.warn(campos, 'http');
    else if (ms > 1000) log.warn({ ...campos, lento: true }, 'http');
    else log.info(campos, 'http');
  });

  // Tudo que roda a partir daqui (handlers, services, integrações) enxerga o reqId.
  comContexto({ reqId }, () => next());
}

module.exports = { requestLogger };
