const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const { limiteRastreamento } = require('../../../middleware/rateLimit');
const service = require('../entregas.service');

// Acompanhamento em tempo real + recebimento de posição do app.
module.exports = function acompanhamentoRoutes() {
  const router = express.Router();

  const csv = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

  // GET /entregas/acompanhamento — visão da central (3 seções + filtros).
  // Aceita: loja_ids (csv), cidades (csv), de, ate, q. Registrada antes de /:id/*.
  router.get('/acompanhamento', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.listarAcompanhamento({
        empresaId: req.empresaId,
        lojaIds: csv(req.query.loja_ids),
        cidades: csv(req.query.cidades),
        de: req.query.de || null, ate: req.query.ate || null,
        q: req.query.q || null,
        lojaIdToken: req.lojaId || null, // trava de segurança p/ usuário de loja
      }));
    } catch (e) { next(e); }
  });

  // GET /entregas/acompanhamento/cidades — cidades das lojas (filtro de região).
  router.get('/acompanhamento/cidades', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.listarCidadesLojas(req.empresaId)); } catch (e) { next(e); }
  });

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

  // PUT /entregas/:id/enderecos — editar coleta/pontos de uma entrega ativa
  router.put('/:id/enderecos', exigirTenant, exigirPermissao('entregas.editar'), async (req, res, next) => {
    try {
      res.json(await service.editarEnderecos({
        empresaId: req.empresaId, id: req.params.id,
        coleta: req.body.coleta, pontos: req.body.pontos,
        usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // PATCH /entregas/:id/finalizar — finalização manual pela central
  router.patch('/:id/finalizar', exigirTenant, exigirPermissao('entregas.editar'), async (req, res, next) => {
    try {
      res.json(await service.finalizarManual({
        empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  return router;
};
