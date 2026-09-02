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
  router.get('/app/missoes', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.missoesDoMotoboy({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });

  // ── Central (admin) ──
  router.use(verificarToken, resolverTenant, exigirTenant);
  router.get('/config', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.obterConfig(req.empresaId)); } catch (e) { next(e); }
  });
  router.put('/config', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try { res.json(await service.salvarConfig({ empresaId: req.empresaId, metricas: req.body.metricas, niveis: req.body.niveis })); } catch (e) { next(e); }
  });

  // Campanhas (missões)
  router.get('/campanhas', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.listarCampanhas({ empresaId: req.empresaId })); } catch (e) { next(e); }
  });
  router.post('/campanhas/previa', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.previaAlvo({ empresaId: req.empresaId, alvo: req.body.alvo })); } catch (e) { next(e); }
  });
  router.post('/campanhas', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try { res.status(201).json(await service.criarCampanha({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.get('/campanhas/:id', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.obterCampanha({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });
  router.put('/campanhas/:id', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try { res.json(await service.atualizarCampanha({ empresaId: req.empresaId, id: req.params.id, dados: req.body })); } catch (e) { next(e); }
  });
  router.delete('/campanhas/:id', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try { res.json(await service.excluirCampanha({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });
  router.get('/campanhas/:id/avaliar', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.avaliarMissao({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });
  // Pagar bônus (dinheiro) — exige gerenciar; idempotente no service.
  router.post('/campanhas/:id/liberar', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try { res.json(await service.liberarPremio({ empresaId: req.empresaId, campanhaId: req.params.id, motoboyId: req.body.motoboy_id, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initScoreRoutes };
