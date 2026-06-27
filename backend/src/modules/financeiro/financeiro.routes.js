const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const service = require('./financeiro.service');

function initFinanceiroRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirCentral);

  const periodo = (req) => ({ de: req.query.de || null, ate: req.query.ate || null });

  // ── Faturamento Cliente ────────────────────────────────────────
  router.get('/cliente', async (req, res, next) => {
    try { res.json(await service.faturamentoCliente({ empresaId: req.empresaId, ...periodo(req) })); } catch (e) { next(e); }
  });
  router.get('/cliente/:lojaId/centros', async (req, res, next) => {
    try { res.json(await service.faturamentoClienteCentros({ empresaId: req.empresaId, lojaId: req.params.lojaId, ...periodo(req) })); } catch (e) { next(e); }
  });
  router.get('/cliente/:lojaId/corridas', async (req, res, next) => {
    try {
      res.json(await service.faturamentoClienteCorridas({
        empresaId: req.empresaId, lojaId: req.params.lojaId,
        centroId: req.query.centro_id || null,
        semCentro: req.query.sem_centro === '1',
        ...periodo(req),
      }));
    } catch (e) { next(e); }
  });

  // ── Faturamento Motoboy ────────────────────────────────────────
  router.get('/motoboy', async (req, res, next) => {
    try { res.json(await service.faturamentoMotoboy({ empresaId: req.empresaId, ...periodo(req) })); } catch (e) { next(e); }
  });
  router.get('/motoboy/:motoboyId/corridas', async (req, res, next) => {
    try { res.json(await service.faturamentoMotoboyCorridas({ empresaId: req.empresaId, motoboyId: req.params.motoboyId, ...periodo(req) })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initFinanceiroRoutes };
