const jwt = require('jsonwebtoken');
const AppError = require('../shared/AppError');
const { ERRO_MSGS, PERFIS } = require('../shared/constants');

function extrairToken(req) {
  // Bearer tem prioridade — usado durante impersonação para sobrepor o cookie do master
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  // Cookie httpOnly — fluxo normal de sessão web
  if (req.cookies && req.cookies.lx_access) return req.cookies.lx_access;
  return null;
}

// Exige um access token válido. Popula req.usuario = { id, perfil, empresaId, nome }.
function verificarToken(req, res, next) {
  const token = extrairToken(req);
  if (!token) return next(AppError.naoAutorizado(ERRO_MSGS.TOKEN_AUSENTE));
  try {
    req.usuario = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    next(AppError.naoAutorizado(ERRO_MSGS.TOKEN_INVALIDO));
  }
}

// Fábrica genérica de verificação de perfil.
function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario) return next(AppError.naoAutorizado());
    if (!perfis.includes(req.usuario.perfil)) return next(AppError.proibido(ERRO_MSGS.SEM_PERMISSAO));
    next();
  };
}

const verificarAdmin = exigirPerfil(PERFIS.SUPER_ADMIN);
const verificarAdminOuFinanceiro = exigirPerfil(PERFIS.SUPER_ADMIN, PERFIS.CLIENTE);

module.exports = { verificarToken, exigirPerfil, verificarAdmin, verificarAdminOuFinanceiro };
