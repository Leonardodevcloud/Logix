const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const service = require('./motoboys.service');

function initMotoboysRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant);

  // GET /motoboys?status=ativo&online=true
  router.get('/', async (req, res, next) => {
    try {
      const online = req.query.online === undefined ? undefined : req.query.online === 'true';
      res.json(await service.listar({ empresaId: req.empresaId, status: req.query.status, online }));
    } catch (e) { next(e); }
  });

  // GET /motoboys/:id
  router.get('/:id', async (req, res, next) => {
    try { res.json(await service.obter({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  // POST /motoboys
  router.post('/', async (req, res, next) => {
    try {
      const r = await service.criar({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id, ip: req.ip });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // PUT /motoboys/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const r = await service.atualizar({ empresaId: req.empresaId, id: req.params.id, dados: req.body, usuarioId: req.usuario.id, ip: req.ip });
      res.json(r);
    } catch (e) { next(e); }
  });

  // PATCH /motoboys/:id/online
  router.patch('/:id/online', async (req, res, next) => {
    try {
      res.json(await service.definirOnline({ empresaId: req.empresaId, id: req.params.id, online: req.body.online }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initMotoboysRoutes };
