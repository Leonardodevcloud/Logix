const AppError = require('../shared/AppError');
const { PERFIS } = require('../shared/constants');

// Perfis que operam a empresa inteira (não ficam presos a uma loja).
const PERFIS_CENTRAL = [PERFIS.SUPER_ADMIN, PERFIS.CENTRAL_ADMIN];

// Resolve o escopo da requisição em DOIS níveis:
//   req.empresaId — o tenant (central de entregas)
//   req.lojaId    — a loja-cliente (preenchido só para o perfil 'loja')
//
// Regras de visibilidade:
//   super_admin   → escopa empresa via header X-Empresa-Id; sem loja travada
//   central_admin → travado na própria empresa; pode filtrar loja via header/query (opcional)
//   loja/cliente  → travado na própria empresa E na própria loja
function resolverTenant(req, res, next) {
  const u = req.usuario;
  if (!u) return next(AppError.naoAutorizado());

  if (u.perfil === PERFIS.SUPER_ADMIN) {
    // Super admin escolhe a empresa que quer inspecionar.
    req.empresaId = req.headers['x-empresa-id'] || req.query.empresa_id || null;
    req.lojaId = req.headers['x-loja-id'] || req.query.loja_id || null;
  } else if (u.perfil === PERFIS.CENTRAL_ADMIN) {
    // Dono da central: vê a empresa toda; pode opcionalmente filtrar uma loja.
    req.empresaId = u.empresaId;
    req.lojaId = req.headers['x-loja-id'] || req.query.loja_id || null;
  } else {
    // Usuário de loja (ou legado 'cliente'): preso ao próprio escopo.
    req.empresaId = u.empresaId;
    req.lojaId = u.lojaId || null;
  }
  next();
}

// Para rotas que exigem um tenant resolvido.
function exigirTenant(req, res, next) {
  if (!req.empresaId) return next(AppError.validacao('Empresa (tenant) não informada'));
  next();
}

// Para rotas que SÓ podem ser acessadas por quem opera a central (não por lojas).
// Ex.: cadastrar lojas, ver todas as lojas, configurar SLA.
function exigirCentral(req, res, next) {
  const u = req.usuario;
  if (!u || !PERFIS_CENTRAL.includes(u.perfil)) {
    return next(AppError.proibido('Acesso restrito à administração da central'));
  }
  next();
}

// Indica se a requisição está escopada a uma loja específica.
// Útil nos services para decidir se aplicam `AND loja_id = $x`.
function escopadoPorLoja(req) {
  return !!req.lojaId;
}

// Resolve o tenant pelo domínio/subdomínio do Host (páginas públicas do portal white-label).
async function resolverTenantPorHost(req, res, next) {
  try {
    const { resolverEmpresaPorHost } = require('../modules/branding/branding.service');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    req.empresaId = await resolverEmpresaPorHost(host);
    next();
  } catch (e) { next(e); }
}

module.exports = {
  resolverTenant, exigirTenant, exigirCentral, escopadoPorLoja, resolverTenantPorHost,
  PERFIS_CENTRAL,
};
