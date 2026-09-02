const express = require('express');
const { verificarToken, verificarTokenMotoboy } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const service = require('./score.service');

function initScoreRoutes() {
  const router = express.Router();

  // ── App do motoboy (token de motoboy) — registrar ANTES do verificarToken ──
  router.get('/app/meu-score', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.meuScore({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });

  // ── Central (admin) ──
  router.use(verificarToken, resolverTenant, exigirTenant);
  router.get('/config', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.obterConfig(req.empresaId)); } catch (e) { next(e); }
  });
  router.put('/config', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try { res.json(await service.salvarConfig({ empresaId: req.empresaId, metricas: req.body.metricas, niveis: req.body.niveis })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initScoreRoutes };
