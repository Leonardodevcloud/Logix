const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const service = require('../entregas.service');

// Histórico de entregas concluídas (base para export Excel/PDF no front).
module.exports = function concluidasRoutes() {
  const router = express.Router();

  // GET /entregas/concluidas?de=&ate=&motoboy_id=
  router.get('/concluidas', exigirTenant, async (req, res, next) => {
    try {
      res.json(await service.listarConcluidas({
        empresaId: req.empresaId, de: req.query.de, ate: req.query.ate, motoboyId: req.query.motoboy_id,
      }));
    } catch (e) { next(e); }
  });

  return router;
};
