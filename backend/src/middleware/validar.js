// Validação de entrada com zod. Uso:
//   router.post('/x', validar(schemas.login), handler)               // valida req.body
//   router.get('/x', validar(schemas.paginacao, 'query'), handler)   // valida req.query
// Substitui o req.body/req.query pelo objeto JÁ validado e coerido (números viram
// number, strings sofrem trim, campos desconhecidos são removidos).
// Em caso de erro → 422 com a lista de campos e mensagens (formato do AppError).
const AppError = require('../shared/AppError');

function validar(schema, alvo = 'body') {
  return (req, res, next) => {
    const r = schema.safeParse(req[alvo] || {});
    if (!r.success) {
      const campos = r.error.issues.map((i) => ({ campo: i.path.join('.') || alvo, mensagem: i.message }));
      return next(AppError.validacao('Dados inválidos', { campos }));
    }
    req[alvo] = r.data;
    next();
  };
}

module.exports = { validar };
