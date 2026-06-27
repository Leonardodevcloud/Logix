const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const service = require('./config.service');

function initConfigRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant);

  // ── Categorias de Frete ──────────────────────────────────────────
  // GET /config/frete-categorias?incluirInativas=true
  router.get('/frete-categorias', exigirCentral, async (req, res, next) => {
    try {
      const incluirInativas = req.query.incluirInativas !== 'false';
      res.json(await service.listarCategorias({ empresaId: req.empresaId, incluirInativas }));
    } catch (e) { next(e); }
  });

  // GET /config/frete-categorias/:id
  router.get('/frete-categorias/:id', exigirCentral, async (req, res, next) => {
    try { res.json(await service.obterCategoria({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  // POST /config/frete-categorias
  router.post('/frete-categorias', exigirCentral, async (req, res, next) => {
    try {
      res.status(201).json(await service.criarCategoria({
        empresaId: req.empresaId, usuarioId: req.usuario.id, ip: req.ip,
        nome: req.body.nome, cor: req.body.cor, descricao: req.body.descricao,
        lojaIds: req.body.lojaIds || [],
      }));
    } catch (e) { next(e); }
  });

  // PUT /config/frete-categorias/:id
  router.put('/frete-categorias/:id', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.atualizarCategoria({
        empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip,
        nome: req.body.nome, cor: req.body.cor, descricao: req.body.descricao,
        lojaIds: req.body.lojaIds,
      }));
    } catch (e) { next(e); }
  });

  // PATCH /config/frete-categorias/:id/ativo — ativa/desativa
  router.patch('/frete-categorias/:id/ativo', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.alternarCategoria({
        empresaId: req.empresaId, id: req.params.id, ativo: !!req.body.ativo,
        usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // DELETE /config/frete-categorias/:id
  router.delete('/frete-categorias/:id', exigirCentral, async (req, res, next) => {
    try { res.json(await service.excluirCategoria({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip })); }
    catch (e) { next(e); }
  });

  // ── SLA global ─────────────────────────────────────────────────
  router.get('/sla', exigirCentral, async (req, res, next) => {
    try { res.json(await service.obterSla({ empresaId: req.empresaId, lojaId: null })); } catch (e) { next(e); }
  });
  router.put('/sla', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.salvarSla({
        empresaId: req.empresaId, lojaId: null,
        faixas: req.body.faixas, minutosAtencao: req.body.minutos_atencao,
        minutosIminente: req.body.minutos_iminente, slaPadraoMin: req.body.sla_padrao_min,
        usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // ── SLA por cliente (sobrescreve o global) ─────────────────────
  router.get('/sla/cliente/:lojaId', exigirCentral, async (req, res, next) => {
    try { res.json(await service.obterSla({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.put('/sla/cliente/:lojaId', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.salvarSla({
        empresaId: req.empresaId, lojaId: req.params.lojaId,
        faixas: req.body.faixas, minutosAtencao: req.body.minutos_atencao,
        minutosIminente: req.body.minutos_iminente, slaPadraoMin: req.body.sla_padrao_min,
        usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });
  router.delete('/sla/cliente/:lojaId', exigirCentral, async (req, res, next) => {
    try { res.json(await service.removerSlaLoja({ empresaId: req.empresaId, lojaId: req.params.lojaId, usuarioId: req.usuario.id, ip: req.ip })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initConfigRoutes };
