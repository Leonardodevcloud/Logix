const express = require('express');
const cors = require('cors');
const AppError = require('../../shared/AppError');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
const { PERFIS } = require('../../shared/constants');
const service = require('./branding.service');

function initBrandingRoutes() {
  const router = express.Router();

  // Branding NUNCA pode ser cacheado: a leitura depende do empresa_id (header/query),
  // e cache de borda/navegador chaveado só pela URL devolvia sempre a mesma marca (vazia).
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
  });

  // GET /branding?host=...|?empresa_id=...  (PÚBLICO)
  // O portal/app de qualquer cliente carrega o tema ANTES do login, de domínios diversos,
  // então este endpoint usa CORS permissivo (só expõe dados de marca, não sensíveis).
  router.get('/', cors({ origin: true }), async (req, res, next) => {
    try {
      const host = req.query.host || req.headers['x-forwarded-host'] || req.headers.host;
      res.json(await service.obterPublico({ empresaId: req.query.empresa_id || null, host }));
    } catch (e) { next(e); }
  });

  // GET /branding/eu  (autenticado — tema do próprio tenant, usado pelo app após login)
  router.get('/eu', verificarToken, resolverTenant, async (req, res, next) => {
    try {
      const empresaId = req.empresaId
        || (req.usuario && req.usuario.empresaId)
        || req.headers['x-empresa-id']
        || req.query.empresa_id
        || null;
      console.log('[branding.eu] empresaId=%s perfil=%s', empresaId, req.usuario && req.usuario.perfil);
      res.json(await service.obterPublico({ empresaId }));
    } catch (e) { next(e); }
  });

  // GET /branding/completo  (dados completos para a tela de configuração)
  router.get('/completo', verificarToken, resolverTenant, async (req, res, next) => {
    try {
      // Fallback robusto: header (X-Empresa-Id) OU query (?empresa_id=) OU tenant do usuário.
      // Sem isto, se o proxy comer o header, o GET não acha a empresa e a tela vem vazia.
      const empresaId = req.empresaId
        || req.headers['x-empresa-id']
        || req.query.empresa_id
        || (req.usuario && req.usuario.empresaId);
      if (!empresaId) throw AppError.validacao('Empresa não informada');
      console.log('[branding.completo] empresaId=%s (header=%s query=%s)', empresaId, req.headers['x-empresa-id'] || '-', req.query.empresa_id || '-');
      res.json(await service.obterCompleto(empresaId));
    } catch (e) { next(e); }
  });

  // PUT /branding  (super admin define para qualquer tenant; cliente edita o próprio)
  router.put('/', verificarToken, resolverTenant, async (req, res, next) => {
    try {
      const empresaId = req.usuario.perfil === PERFIS.SUPER_ADMIN
        ? (req.headers['x-empresa-id'] || req.empresaId || req.body.empresa_id || null)
        : req.usuario.empresaId;
      if (!empresaId) throw AppError.validacao('Empresa não informada');
      console.log('[branding.put] empresaId=%s (header=%s body=%s) perfil=%s', empresaId, req.headers['x-empresa-id'] || '-', req.body.empresa_id || '-', req.usuario.perfil);
      res.json(await service.definir({ empresaId, dados: req.body, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initBrandingRoutes };
