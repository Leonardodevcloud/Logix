const AppError = require('../shared/AppError');
const { PERFIS } = require('../shared/constants');

// Resolve o empresa_id da requisição. Super admin pode escopar via header X-Empresa-Id;
// demais perfis ficam travados no próprio tenant.
function resolverTenant(req, res, next) {
  const u = req.usuario;
  if (!u) return next(AppError.naoAutorizado());
  if (u.perfil === PERFIS.SUPER_ADMIN) {
    req.empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || null;
  } else {
    req.empresaId = u.empresaId;
  }
  next();
}

// Para rotas que exigem um tenant resolvido.
function exigirTenant(req, res, next) {
  if (!req.empresaId) return next(AppError.validacao('Empresa (tenant) não informada'));
  next();
}

// Resolve o tenant pelo domínio/subdomínio do Host (páginas públicas do portal white-label).
// Lazy require do branding.service para evitar acoplamento na ordem de carga dos módulos.
async function resolverTenantPorHost(req, res, next) {
  try {
    const { resolverEmpresaPorHost } = require('../modules/branding/branding.service');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    req.empresaId = await resolverEmpresaPorHost(host);
    next();
  } catch (e) { next(e); }
}

module.exports = { resolverTenant, exigirTenant, resolverTenantPorHost };
