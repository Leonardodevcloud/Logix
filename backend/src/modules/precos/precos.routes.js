const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const service = require('./precos.service');

function initPrecosRoutes() {
  const router = express.Router();
  // Preço dinâmico é ferramenta da central. Ver exige precos.ver; alterar exige precos.gerenciar.
  router.use(verificarToken, resolverTenant, exigirTenant, exigirCentral);

  router.get('/', exigirPermissao('precos.ver'), async (req, res, next) => {
    try { res.json(await service.listar(req.empresaId)); } catch (e) { next(e); }
  });

  router.post('/', exigirPermissao('precos.gerenciar'), async (req, res, next) => {
    try { res.status(201).json(await service.criar({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id })); }
    catch (e) { next(e); }
  });

  router.put('/:id', exigirPermissao('precos.gerenciar'), async (req, res, next) => {
    try { res.json(await service.atualizar({ empresaId: req.empresaId, id: req.params.id, dados: req.body })); }
    catch (e) { next(e); }
  });

  router.patch('/:id/ativo', exigirPermissao('precos.gerenciar'), async (req, res, next) => {
    try { res.json(await service.alternar({ empresaId: req.empresaId, id: req.params.id, ativo: req.body.ativo })); }
    catch (e) { next(e); }
  });

  router.delete('/:id', exigirPermissao('precos.gerenciar'), async (req, res, next) => {
    try { res.json(await service.remover({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  return router;
}

module.exports = { initPrecosRoutes };
