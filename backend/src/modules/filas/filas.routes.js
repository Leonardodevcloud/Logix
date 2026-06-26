const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirModulo, exigirPermissao } = require('../../middleware/permissoes');
const service = require('./filas.service');

function initFilasRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirModulo('filas'));

  router.get('/', exigirPermissao('filas.ver'), async (req, res, next) => {
    try { res.json(await service.listarFila(req.empresaId)); } catch (e) { next(e); }
  });

  router.get('/disponiveis', exigirPermissao('filas.ver'), async (req, res, next) => {
    try { res.json(await service.listarDisponiveis(req.empresaId)); } catch (e) { next(e); }
  });

  // Todos os motoboys ativos (online e offline) — para o seletor de troca de motoboy.
  router.get('/motoboys-ativos', exigirPermissao('filas.ver'), async (req, res, next) => {
    try { res.json(await service.listarTodosAtivos(req.empresaId)); } catch (e) { next(e); }
  });

  // Troca o motoboy de uma entrega já atribuída/em rota.
  router.post('/:entregaId/reatribuir', exigirPermissao('filas.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.reatribuir({
        empresaId: req.empresaId, entregaId: req.params.entregaId,
        motoboyId: req.body.motoboy_id, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  router.post('/:entregaId/atribuir', exigirPermissao('filas.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.atribuir({
        empresaId: req.empresaId, entregaId: req.params.entregaId,
        motoboyId: req.body.motoboy_id, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  router.post('/:entregaId/atribuir-auto', exigirPermissao('filas.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.atribuirAutomatica({
        empresaId: req.empresaId, entregaId: req.params.entregaId, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  router.post('/distribuir', exigirPermissao('filas.gerenciar'), async (req, res, next) => {
    try { res.json(await service.distribuirFila({ empresaId: req.empresaId, usuarioId: req.usuario.id, ip: req.ip })); }
    catch (e) { next(e); }
  });

  return router;
}

module.exports = { initFilasRoutes };
