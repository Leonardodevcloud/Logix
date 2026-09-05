const jwt = require('jsonwebtoken');
const AppError = require('../shared/AppError');
const { ERRO_MSGS, PERFIS } = require('../shared/constants');

function extrairToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  // Decisão (ADR-003): o access token NÃO vive mais em cookie. O painel guarda em
  // memória e renova pelo cookie httpOnly lx_refresh (só usado em /auth/refresh e
  // /auth/logout). Assim nenhuma rota de negócio aceita autenticação por cookie e a
  // superfície de CSRF desaparece.
  return null;
}

// Exige um access token válido. Popula req.usuario = { id, perfil, empresaId, nome }.
function verificarToken(req, res, next) {
  const token = extrairToken(req);
  if (!token) return next(AppError.naoAutorizado(ERRO_MSGS.TOKEN_AUSENTE));
  try {
    req.usuario = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    try { require('../shared/contexto').setUsuario(req.usuario.id); } catch (_) {}
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
// Aceita perfis de administração da central (e legado 'cliente' durante a transição).
const verificarAdminOuFinanceiro = exigirPerfil(PERFIS.SUPER_ADMIN, PERFIS.CENTRAL_ADMIN, PERFIS.LOJA, PERFIS.CLIENTE);

module.exports = { verificarToken, exigirPerfil, verificarAdmin, verificarAdminOuFinanceiro };

// Verifica token do app do motoboy (Bearer simples, sem cookie).
function verificarTokenMotoboy(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return next(AppError.naoAutorizado('Token do motoboy não informado'));
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (payload.perfil !== 'motoboy') return next(AppError.naoAutorizado('Acesso restrito a motoboys'));
    req.motoboy = { id: payload.id, empresaId: payload.empresaId, nome: payload.nome };
    try { const ctx = require('../shared/contexto'); ctx.setEmpresa(payload.empresaId); ctx.setUsuario(payload.id); } catch (_) {}
    next();
  } catch { next(AppError.naoAutorizado('Token do motoboy inválido ou expirado')); }
}

module.exports.verificarTokenMotoboy = verificarTokenMotoboy;
