const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const { exigirModulo, exigirPermissao } = require('../../middleware/permissoes');
const service = require('./lojas.service');

function initLojasRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant, exigirModulo('lojas'));

  // GET /lojas?ativo=true — lista as lojas da empresa (apenas central enxerga todas).
  router.get('/', exigirCentral, async (req, res, next) => {
    try {
      const ativo = req.query.ativo === undefined ? undefined : req.query.ativo === 'true';
      res.json(await service.listar({ empresaId: req.empresaId, ativo }));
    } catch (e) { next(e); }
  });

  // GET /lojas/:id
  router.get('/:id', exigirCentral, async (req, res, next) => {
    try { res.json(await service.obter({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  // POST /lojas — cadastra loja (+ usuário de acesso opcional).
  router.post('/', exigirCentral, async (req, res, next) => {
    try {
      const r = await service.criar({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id, ip: req.ip });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // PUT /lojas/:id
  router.put('/:id', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.atualizar({ empresaId: req.empresaId, id: req.params.id, dados: req.body, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  // DELETE /lojas/:id — soft delete.
  router.delete('/:id', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.desativar({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  // ── Endereços de coleta da loja ────────────────────────────────
  // GET /lojas/:id/enderecos
  router.get('/:id/enderecos', async (req, res, next) => {
    try { res.json(await service.listarEnderecos({ empresaId: req.empresaId, lojaId: req.params.id })); } catch (e) { next(e); }
  });

  // POST /lojas/:id/enderecos
  router.post('/:id/enderecos', exigirCentral, async (req, res, next) => {
    try {
      const r = await service.adicionarEndereco({ empresaId: req.empresaId, lojaId: req.params.id, dados: req.body, usuarioId: req.usuario.id, ip: req.ip });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // DELETE /lojas/:id/enderecos/:enderecoId
  router.delete('/:id/enderecos/:enderecoId', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.removerEndereco({ empresaId: req.empresaId, lojaId: req.params.id, enderecoId: req.params.enderecoId }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initLojasRoutes };
