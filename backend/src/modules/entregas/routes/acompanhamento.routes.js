const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const { limiteRastreamento } = require('../../../middleware/rateLimit');
const service = require('../entregas.service');

// Acompanhamento em tempo real + recebimento de posição do app.
module.exports = function acompanhamentoRoutes() {
  const router = express.Router();

  // GET /entregas/:id/acompanhar
  router.get('/:id/acompanhar', exigirTenant, async (req, res, next) => {
    try { res.json(await service.acompanhar({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  // POST /entregas/:id/posicao — ping de localização do motoboy (background)
  router.post('/:id/posicao', exigirTenant, limiteRastreamento, async (req, res, next) => {
    try {
      const r = await service.registrarPosicao({
        empresaId: req.empresaId, motoboyId: req.body.motoboy_id, entregaId: req.params.id,
        lat: req.body.lat, lng: req.body.lng,
      });
      res.json(r);
    } catch (e) { next(e); }
  });


  // PATCH /entregas/:id/cancelar
  router.patch('/:id/cancelar', exigirTenant, async (req, res, next) => {
    try {
      res.json(await service.cancelarEntrega({
        empresaId: req.empresaId, id: req.params.id,
        motivo: req.body.motivo, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  return router;
};
