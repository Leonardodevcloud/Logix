const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const service = require('./equipe.service');

function initEquipeRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirPermissao('usuarios.gerenciar'));

  router.get('/', async (req, res, next) => { try { res.json(await service.listarEquipe(req.empresaId)); } catch (e) { next(e); } });
  router.get('/papeis', async (req, res, next) => { try { res.json(await service.listarPapeis(req.empresaId)); } catch (e) { next(e); } });

  router.post('/', async (req, res, next) => {
    try {
      const { nome, email, telefone, senha, papel_id } = req.body;
      res.status(201).json(await service.criarMembro({ empresaId: req.empresaId, nome, email, telefone, senha, papelId: papel_id, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      res.json(await service.atualizarMembro({ empresaId: req.empresaId, membroId: req.params.id, papelId: req.body.papel_id, ativo: req.body.ativo, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  return router;
}
module.exports = { initEquipeRoutes };
