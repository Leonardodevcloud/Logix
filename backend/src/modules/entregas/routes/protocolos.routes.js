const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const service = require('../entregas.service');

// Registro de comprovantes por ponto (conclui o ponto e, no último, a entrega).
module.exports = function protocolosRoutes() {
  const router = express.Router();

  // POST /entregas/:id/pontos/:pid/protocolo
  router.post('/:id/pontos/:pid/protocolo', exigirTenant, async (req, res, next) => {
    try {
      const r = await service.registrarProtocoloPonto({
        empresaId: req.empresaId,
        entregaId: req.params.id,
        pontoId: req.params.pid,
        recebedor: req.body.recebedor,
        comprovantes: req.body.comprovantes, // [{ tipo, arquivoUrl }]
        usuarioId: req.usuario.id,
        ip: req.ip,
      });
      res.json(r);
    } catch (e) { next(e); }
  });

  return router;
};
