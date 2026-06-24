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
      }));
    } catch (e) { next(e); }
  });

  // GET /entregas/:id/detalhe
  router.get('/:id/detalhe', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.detalharConcluida({ empresaId: req.empresaId, id: req.params.id }));
    } catch (e) { next(e); }
  });

  // GET /entregas/:id/protocolo  — PÚBLICO, sem auth, gera HTML imprimível
  // URL acessada diretamente no browser como nova aba
  router.get('/:id/protocolo', async (req, res, next) => {
    try {
      const html = await service.gerarProtocoloHtml(req.params.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) { next(e); }
  });

  return router;
};
