const express = require('express');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const service = require('./permissoes.service');

function initPermissoesRoutes() {
  const router = express.Router();
  router.use(verificarToken);

  // --- Usuário logado: o que ele pode ver/fazer (para o frontend) ---
  router.get('/eu', resolverTenant, async (req, res, next) => {
    try {
      const u = { ...req.usuario, empresaId: req.empresaId || req.usuario.empresaId };
      res.json(await service.permissoesEfetivas(u));
    } catch (e) { next(e); }
  });

  // --- Master: catálogo e módulos por cliente ---
  router.get('/modulos', verificarAdmin, async (req, res, next) => {
    try { res.json(await service.listarModulos()); } catch (e) { next(e); }
  });
  router.get('/empresas/:id/modulos', verificarAdmin, async (req, res, next) => {
    try { res.json(await service.modulosDaEmpresa(req.params.id)); } catch (e) { next(e); }
  });
  router.put('/empresas/:id/modulos', verificarAdmin, async (req, res, next) => {
    try { res.json(await service.definirModulosDaEmpresa(req.params.id, req.body.modulos || [])); } catch (e) { next(e); }
  });

  // --- Cliente: papéis e atribuição a usuários ---
  router.get('/papeis', resolverTenant, exigirTenant, async (req, res, next) => {
    try { res.json(await service.listarPapeis(req.empresaId)); } catch (e) { next(e); }
  });
  router.get('/papeis/:id', resolverTenant, async (req, res, next) => {
    try { res.json(await service.obterPapel(req.params.id)); } catch (e) { next(e); }
  });
  router.post('/papeis', resolverTenant, exigirTenant, exigirPermissao('usuarios.gerenciar'), async (req, res, next) => {
    try { res.status(201).json(await service.criarPapel({ empresaId: req.empresaId, ...req.body })); } catch (e) { next(e); }
  });
  router.post('/usuarios/:usuarioId/papel', resolverTenant, exigirTenant, exigirPermissao('usuarios.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.atribuirPapel({ empresaId: req.empresaId, usuarioId: req.params.usuarioId, papelId: req.body.papelId }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initPermissoesRoutes };
