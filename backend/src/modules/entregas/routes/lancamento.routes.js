const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const service = require('../entregas.service');

// Lançamento e listagem de entregas.
module.exports = function lancamentoRoutes() {
  const router = express.Router();

  // POST /entregas — lança rota (coleta + N destinos)
  router.post('/', exigirTenant, exigirPermissao('entregas.criar'), async (req, res, next) => {
    try {
      // Loja do pedido: usuário de loja usa a própria (do token); central informa no body.
      const lojaId = req.lojaId || req.body.loja_id || null;
      const r = await service.criarEntrega({
        empresaId: req.empresaId,
        lojaId,
        criadoPor: req.usuario.id,
        coleta: req.body.coleta,
        destinos: req.body.destinos,
        distribuicao: req.body.distribuicao,
        motoboyId: req.body.motoboy_id,
        ip: req.ip,
      });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // GET /entregas?status=&motoboy_id=&loja_id=
  router.get('/', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      // Usuário de loja só vê as próprias; central pode filtrar por loja_id (query).
      const lojaId = req.lojaId || req.query.loja_id || null;
      res.json(await service.listar({
        empresaId: req.empresaId, status: req.query.status, motoboyId: req.query.motoboy_id, lojaId,
      }));
    } catch (e) { next(e); }
  });

  return router;
};
