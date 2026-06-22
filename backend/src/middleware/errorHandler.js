const AppError = require('../shared/AppError');

// Tratamento central de erros. AppError vira resposta com status correto; o resto é 500.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return res.status(err.status).json({ erro: err.message, codigo: err.codigo, detalhe: err.detalhe });
  }
  console.error('[erro nao tratado]', err);
  return res.status(500).json({ erro: 'Erro interno do servidor', codigo: 'INTERNO' });
}

module.exports = errorHandler;
