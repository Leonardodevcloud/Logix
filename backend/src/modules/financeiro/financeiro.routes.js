const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const service = require('./financeiro.service');

function initFinanceiroRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirCentral);

  const periodo = (req) => ({ de: req.query.de || null, ate: req.query.ate || null });
  const base = (req) => ({ empresaId: req.empresaId, usuarioId: req.usuario && req.usuario.id });

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

  // ── Faturamento / Saldo Motoboy ────────────────────────────────
  router.get('/motoboy', async (req, res, next) => {
    try { res.json(await service.faturamentoMotoboy({ empresaId: req.empresaId, ...periodo(req) })); } catch (e) { next(e); }
  });
  router.get('/motoboy/:motoboyId/corridas', async (req, res, next) => {
    try { res.json(await service.faturamentoMotoboyCorridas({ empresaId: req.empresaId, motoboyId: req.params.motoboyId, ...periodo(req) })); } catch (e) { next(e); }
  });
  router.get('/motoboy/:motoboyId/extrato', async (req, res, next) => {
    try { res.json(await service.extratoMotoboy({ empresaId: req.empresaId, motoboyId: req.params.motoboyId, ...periodo(req) })); } catch (e) { next(e); }
  });

  // ── Categorias ─────────────────────────────────────────────────
  router.get('/categorias', async (req, res, next) => {
    try { res.json(await service.listarCategorias({ empresaId: req.empresaId })); } catch (e) { next(e); }
  });
  router.post('/categorias', async (req, res, next) => {
    try { res.status(201).json(await service.criarCategoria({ empresaId: req.empresaId, nome: req.body.nome, tipo: req.body.tipo, cor: req.body.cor })); } catch (e) { next(e); }
  });
  router.put('/categorias/:id', async (req, res, next) => {
    try { res.json(await service.atualizarCategoria({ empresaId: req.empresaId, id: req.params.id, nome: req.body.nome, tipo: req.body.tipo, cor: req.body.cor, ativo: req.body.ativo })); } catch (e) { next(e); }
  });
  router.delete('/categorias/:id', async (req, res, next) => {
    try { res.json(await service.excluirCategoria({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  // ── Lançamentos ────────────────────────────────────────────────
  router.get('/motoboy/:motoboyId/lancamentos', async (req, res, next) => {
    try { res.json(await service.listarLancamentos({ empresaId: req.empresaId, motoboyId: req.params.motoboyId, ...periodo(req) })); } catch (e) { next(e); }
  });
  router.post('/motoboy/:motoboyId/lancamentos', async (req, res, next) => {
    try {
      res.status(201).json(await service.criarLancamento({
        ...base(req), motoboyId: req.params.motoboyId,
        categoriaId: req.body.categoria_id || null, tipo: req.body.tipo,
        valorCent: req.body.valor_cent, descricao: req.body.descricao, competencia: req.body.competencia || null,
      }));
    } catch (e) { next(e); }
  });
  router.delete('/lancamentos/:id', async (req, res, next) => {
    try { res.json(await service.excluirLancamento({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  // ── Fechamentos (repasse) ──────────────────────────────────────
  router.post('/motoboy/:motoboyId/fechar', async (req, res, next) => {
    try { res.status(201).json(await service.fecharPeriodo({ ...base(req), motoboyId: req.params.motoboyId, de: req.body.de, ate: req.body.ate })); } catch (e) { next(e); }
  });
  router.get('/fechamentos', async (req, res, next) => {
    try { res.json(await service.listarFechamentos({ empresaId: req.empresaId, motoboyId: req.query.motoboy_id || null, status: req.query.status || null })); } catch (e) { next(e); }
  });
  router.patch('/fechamentos/:id/pago', async (req, res, next) => {
    try { res.json(await service.marcarPago({ empresaId: req.empresaId, id: req.params.id, formaPagamento: req.body.forma_pagamento })); } catch (e) { next(e); }
  });
  router.delete('/fechamentos/:id', async (req, res, next) => {
    try { res.json(await service.estornarFechamento({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initFinanceiroRoutes };
