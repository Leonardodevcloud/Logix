const express = require('express');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const service = require('./empresas.service');
const { buscarCep } = require('./empresas.shared');

function initEmpresasRoutes() {
  const router = express.Router();
  router.use(verificarToken, verificarAdmin); // gestão de tenants é exclusiva do super admin

  // GET /empresas?ativo=true
  router.get('/', async (req, res, next) => {
    try {
      const ativo = req.query.ativo === undefined ? undefined : req.query.ativo === 'true';
      res.json(await service.listar({ ativo }));
    } catch (e) { next(e); }
  });

  // GET /empresas/cep/:cep — autocompletar endereço
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

  // PUT /empresas/:id
  router.put('/:id', async (req, res, next) => {
    try {
      const r = await service.atualizar(req.params.id, req.body, { adminId: req.usuario.id, ip: req.ip });
      res.json(r);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initEmpresasRoutes };
