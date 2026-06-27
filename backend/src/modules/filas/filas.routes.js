const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirModulo, exigirPermissao } = require('../../middleware/permissoes');
const service = require('./filas.service');
const clienteHub = require('../clientehub/clientehub.service');
const AppError = require('../../shared/AppError');

function initFilasRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirModulo('filas'));

  // Exige permissão do cliente só quando o ator é a loja (req.lojaId). Central nunca é bloqueada.
  const exigirPermissaoCliente = (permissao, msg) => async (req, res, next) => {
    try {
      if (req.lojaId) {
        const ok = await clienteHub.lojaPode(req.lojaId, permissao);
        if (!ok) throw AppError.proibido(msg || 'Ação não permitida para este cliente');
      }
      next();
    } catch (e) { next(e); }
  };

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

  // Atribui várias entregas a um motoboy de uma vez (despacho em lote).
  // Estática: registrada ANTES de /:entregaId/* para não colidir.
  router.post('/atribuir-lote', exigirPermissao('filas.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.atribuirLote({
        empresaId: req.empresaId, entregaIds: req.body.entrega_ids,
        motoboyId: req.body.motoboy_id, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // Troca o motoboy de uma entrega já atribuída/em rota.
  router.post('/:entregaId/reatribuir', exigirPermissao('filas.gerenciar'),
    exigirPermissaoCliente('pode_alterar_profissional', 'Este cliente não tem permissão para alterar o profissional'),
    async (req, res, next) => {
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

  // Dispara a oferta de uma corrida para os motoboys no raio (primeiro a aceitar leva).
  router.post('/:entregaId/disparar', exigirPermissao('filas.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.dispararOferta({
        empresaId: req.empresaId, entregaId: req.params.entregaId, usuarioId: req.usuario.id, ip: req.ip,
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
