// Tratamento central de erros.
//  - AppError → status/código dela.
//  - Erros do Postgres com significado HTTP claro → 409/422 (em vez de 500 genérico).
//  - JSON malformado / corpo grande → 400/413.
//  - Resto → 500, logado com stack + reqId e enviado ao Sentry (se configurado).
// A resposta 500 NUNCA expõe mensagem interna; devolve o reqId para o suporte rastrear.
const AppError = require('../shared/AppError');
const log = require('../shared/logger');
const { capturarErro } = require('../shared/observabilidade');

const PG_PARA_HTTP = {
  '23505': () => AppError.conflito('Registro duplicado'),                // unique_violation
  '23503': () => AppError.validacao('Referência inválida (registro relacionado não existe)'), // fk_violation
  '23502': () => AppError.validacao('Campo obrigatório ausente'),        // not_null_violation
  '23514': () => AppError.validacao('Valor não permitido para este campo'), // check_violation
  '22P02': () => AppError.validacao('Formato de valor inválido'),        // invalid_text_representation (ex.: uuid ruim)
  '22001': () => AppError.validacao('Valor excede o tamanho permitido'), // string_data_right_truncation
  '22003': () => AppError.validacao('Valor numérico fora da faixa'),
  '57014': () => new AppError('A consulta demorou demais e foi cancelada', 504, 'TIMEOUT_DB'),
};

function errorHandler(err, req, res, next) {
  let e = err;

  if (!(e instanceof AppError)) {
    if (e && e.type === 'entity.parse.failed') e = AppError.validacao('JSON inválido no corpo da requisição');
    else if (e && e.type === 'entity.too.large') e = new AppError('Corpo da requisição muito grande', 413, 'CORPO_GRANDE');
    else if (e && typeof e.code === 'string' && PG_PARA_HTTP[e.code]) {
      log.warn({ pg: e.code, constraint: e.constraint, detalhe: e.detail }, 'erro de banco mapeado');
      e = PG_PARA_HTTP[e.code]();
    }
  }

  if (e instanceof AppError) {
    if (e.status >= 500) {
      log.error({ err: e }, e.message);
      try { require('../shared/eventos').emitir('sistema.erro_http', { status: e.status, rota: `${req.method} ${req.originalUrl.split('?')[0]}`, reqId: req.id, empresaId: req.empresaId || null, mensagem: e.message.slice(0, 300) }); } catch {}
    }
    return res.status(e.status).json({ erro: e.message, codigo: e.codigo, detalhe: e.detalhe, reqId: req.id });
  }

  log.error({ err, rota: req.originalUrl, metodo: req.method }, 'erro não tratado');
  capturarErro(err, { reqId: req.id, rota: req.originalUrl, metodo: req.method });
  try {
    require('../shared/eventos').emitir('sistema.erro_http', {
      status: 500, rota: `${req.method} ${req.originalUrl.split('?')[0]}`, reqId: req.id, empresaId: req.empresaId || null,
      mensagem: String(err && err.message || 'erro').slice(0, 300),
    });
  } catch {}
  return res.status(500).json({ erro: 'Erro interno do servidor', codigo: 'INTERNO', reqId: req.id });
}

module.exports = errorHandler;
