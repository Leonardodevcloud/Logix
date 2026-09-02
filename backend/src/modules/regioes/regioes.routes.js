const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const service = require('./regioes.service');

function initRegioesRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant);
  router.get('/', async (req, res, next) => { try { res.json(await service.listar({ empresaId: req.empresaId })); } catch (e) { next(e); } });
  router.post('/', async (req, res, next) => { try { res.status(201).json(await service.criar({ empresaId: req.empresaId, dados: req.body })); } catch (e) { next(e); } });
  router.put('/:id', async (req, res, next) => { try { res.json(await service.atualizar({ empresaId: req.empresaId, id: req.params.id, dados: req.body })); } catch (e) { next(e); } });
  router.delete('/:id', async (req, res, next) => { try { res.json(await service.excluir({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); } });
  return router;
}
module.exports = { initRegioesRoutes };
