const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirModulo, exigirPermissao } = require('../../middleware/permissoes');
const service = require('./motoboys.service');

const rastreioRoutes = require('./rastreio.routes');
const authRoutes = require('./motoboy-auth.routes');
const appRoutes = require('./motoboy-app.routes');
const { rotasPublicasCadastro, rotasAppCadastro, rotasCentralCadastro } = require('./cadastro.routes');

function initMotoboysRoutes() {
  const router = express.Router();
  // Auth do motoboy (login/logout) não precisa de token de usuário — montar antes
  router.use('/', authRoutes());
  // Cadastro PÚBLICO pelo app (sem login): /motoboys/cadastro/*
  router.use('/cadastro', rotasPublicasCadastro());
  // Rotas do app autenticado (token de motoboy): /motoboys/app/meu-cadastro, /app/reenviar-cadastro
  router.use('/app', rotasAppCadastro());
  // Cadastro pela CENTRAL — tem seus próprios middlewares (verificarToken+tenant) internamente.
  router.use('/', rotasCentralCadastro());
  // Demais rotas exigem token de usuário ou motoboy
  router.use(verificarToken, resolverTenant);
  router.use('/', rastreioRoutes());
  router.use('/', appRoutes());
  router.use(exigirTenant, exigirModulo('motoboys'));

  // GET /motoboys?status=ativo&online=true
  router.get('/', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try {
      const online = req.query.online === undefined ? undefined : req.query.online === 'true';
      res.json(await service.listar({ empresaId: req.empresaId, status: req.query.status, online }));
    } catch (e) { next(e); }
  });

  // GET /motoboys/:id
  router.get('/:id', exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try { res.json(await service.obter({ empresaId: req.empresaId, id: req.params.id })); } catch (e) { next(e); }
  });

  // POST /motoboys
  router.post('/', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try {
      const r = await service.criar({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id, ip: req.ip });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // PUT /motoboys/:id
  router.put('/:id', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try {
      const r = await service.atualizar({ empresaId: req.empresaId, id: req.params.id, dados: req.body, usuarioId: req.usuario.id, ip: req.ip });
      res.json(r);
    } catch (e) { next(e); }
  });

  // PATCH /motoboys/:id/online
  router.patch('/:id/online', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.definirOnline({ empresaId: req.empresaId, id: req.params.id, online: req.body.online }));
    } catch (e) { next(e); }
  });


  // PATCH /motoboys/:id/reativar
  router.patch('/:id/reativar', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.reativar({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  // DELETE /motoboys/:id — desativa (exclusão lógica)
  router.delete('/:id', exigirPermissao('motoboys.gerenciar'), async (req, res, next) => {
    try {
      res.json(await service.desativar({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initMotoboysRoutes };
