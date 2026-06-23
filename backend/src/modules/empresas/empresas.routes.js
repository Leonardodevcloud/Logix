const express = require('express');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const service = require('./empresas.service');
const { buscarCep } = require('./empresas.shared');

function initEmpresasRoutes() {
  const router = express.Router();
  router.use(verificarToken, verificarAdmin);

  // GET /empresas
  router.get('/', async (req, res, next) => {
    try {
      const ativo = req.query.ativo === undefined ? undefined : req.query.ativo === 'true';
      res.json(await service.listar({ ativo }));
    } catch (e) { next(e); }
  });

  // GET /empresas/cep/:cep
  router.get('/cep/:cep', async (req, res, next) => {
    try { res.json(await buscarCep(req.params.cep)); } catch (e) { next(e); }
  });

  // GET /empresas/:id
  router.get('/:id', async (req, res, next) => {
    try { res.json(await service.obter(req.params.id)); } catch (e) { next(e); }
  });

  // POST /empresas
  router.post('/', async (req, res, next) => {
    try {
      const r = await service.criar(req.body, { adminId: req.usuario.id, ip: req.ip });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // PUT /empresas/:id — atualizar dados + ativo/inativo
  router.put('/:id', async (req, res, next) => {
    try {
      const r = await service.atualizar(req.params.id, req.body, { adminId: req.usuario.id, ip: req.ip });
      res.json(r);
    } catch (e) { next(e); }
  });

  // PATCH /empresas/:id/credenciais — trocar email e/ou senha do responsável
  router.patch('/:id/credenciais', async (req, res, next) => {
    try {
      const r = await service.atualizarCredenciais(req.params.id, req.body, { adminId: req.usuario.id, ip: req.ip });
      res.json(r);
    } catch (e) { next(e); }
  });

  // DELETE /empresas/:id — exclusão lógica (desativa + anonimiza)
  router.delete('/:id', async (req, res, next) => {
    try {
      await service.excluir(req.params.id, { adminId: req.usuario.id, ip: req.ip });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // POST /empresas/:id/impersonar — gera token como responsável do cliente
  router.post('/:id/impersonar', async (req, res, next) => {
    try {
      const r = await service.impersonarResponsavel(req.params.id, { adminId: req.usuario.id, ip: req.ip });
      res.json(r);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initEmpresasRoutes };
