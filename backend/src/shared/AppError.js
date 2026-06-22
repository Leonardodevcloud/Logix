// Erro de aplicação com status HTTP correto. Tratado centralmente pelo errorHandler.
class AppError extends Error {
  constructor(mensagem, status = 400, codigo = null, detalhe = null) {
    super(mensagem);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
    this.detalhe = detalhe;
    this.operacional = true;
  }

  static naoAutorizado(msg = 'Não autorizado') { return new AppError(msg, 401, 'NAO_AUTORIZADO'); }
  static proibido(msg = 'Acesso negado') { return new AppError(msg, 403, 'PROIBIDO'); }
  static naoEncontrado(msg = 'Recurso não encontrado') { return new AppError(msg, 404, 'NAO_ENCONTRADO'); }
  static conflito(msg = 'Conflito de dados') { return new AppError(msg, 409, 'CONFLITO'); }
  static validacao(msg = 'Dados inválidos', detalhe = null) { return new AppError(msg, 422, 'VALIDACAO', detalhe); }
}

module.exports = AppError;
