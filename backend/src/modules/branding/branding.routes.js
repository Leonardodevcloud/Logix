const express = require('express');
const cors = require('cors');
const AppError = require('../../shared/AppError');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
const { PERFIS } = require('../../shared/constants');
const service = require('./branding.service');

function initBrandingRoutes() {
  const router = express.Router();

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
      const empresaId = req.empresaId || (req.usuario && req.usuario.empresaId) || null;
      res.json(await service.obterPublico({ empresaId }));
    } catch (e) { next(e); }
  });

  // GET /branding/completo  (dados completos para a tela de configuração)
  router.get('/completo', verificarToken, resolverTenant, async (req, res, next) => {
    try {
      const empresaId = req.empresaId || (req.usuario && req.usuario.empresaId);
      if (!empresaId) throw AppError.validacao('Empresa não informada');
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
      res.json(await service.definir({ empresaId, dados: req.body, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initBrandingRoutes };
