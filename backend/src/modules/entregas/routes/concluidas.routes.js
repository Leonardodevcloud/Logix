const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const service = require('../entregas.service');

module.exports = function concluidasRoutes() {
  const router = express.Router();

  // GET /entregas/concluidas
  router.get('/concluidas', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.listarConcluidas({
        empresaId: req.empresaId,
        status: req.query.status || null,
        de: req.query.de, ate: req.query.ate,
        motoboyId: req.query.motoboy_id,
        lojaId: req.lojaId || req.query.loja_id || null,
        limite: req.query.limite, offset: req.query.offset,
      }));
    } catch (e) { next(e); }
  });

  // GET /entregas/concluidas/resumo — contagens + km do período (calculado no banco)
  router.get('/concluidas/resumo', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.resumoConcluidas({
        empresaId: req.empresaId,
        status: req.query.status || null,
        de: req.query.de, ate: req.query.ate,
        motoboyId: req.query.motoboy_id,
        lojaId: req.lojaId || req.query.loja_id || null,
      }));
    } catch (e) { next(e); }
  });

  // GET /entregas/:id/detalhe
  router.get('/:id/detalhe', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.detalharConcluida({ empresaId: req.empresaId, id: req.params.id, lojaId: req.lojaId || null }));
    } catch (e) { next(e); }
  });


  return router;
};
