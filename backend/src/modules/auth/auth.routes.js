const express = require('express');
const AppError = require('../../shared/AppError');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const { limiteLogin } = require('../../middleware/rateLimit');
const { obrigatorios, ehEmail } = require('../../shared/validators');
const service = require('./auth.service');
const sh = require('./auth.shared');

function setarCookiesSessao(res, r) {
  res.cookie('lx_access', r.accessToken, { ...sh.COOKIE_OPTS, maxAge: sh.MS_ACCESS });
  res.cookie('lx_refresh', r.refreshToken, { ...sh.COOKIE_OPTS, maxAge: sh.MS_REFRESH });
}

function initAuthRoutes() {
  const router = express.Router();

  // POST /auth/login
  router.post('/login', limiteLogin, async (req, res, next) => {
    try {
      const faltando = obrigatorios(req.body, ['email', 'senha']);
      if (faltando.length) throw AppError.validacao('Campos obrigatórios', { faltando });
      if (!ehEmail(req.body.email)) throw AppError.validacao('E-mail inválido');
      const r = await service.autenticar({ email: req.body.email, senha: req.body.senha, ip: req.ip });
      setarCookiesSessao(res, r);
      res.json({ usuario: r.usuario, accessToken: r.accessToken }); // token também no corpo (app)
    } catch (e) { next(e); }
  });

  // POST /auth/refresh
  router.post('/refresh', async (req, res, next) => {
    try {
      const refreshToken = (req.cookies && req.cookies.lx_refresh) || (req.body && req.body.refreshToken);
      const r = await service.renovar({ refreshToken });
      setarCookiesSessao(res, r);
      res.json({ accessToken: r.accessToken });
    } catch (e) { next(e); }
  });

  // POST /auth/logout
  router.post('/logout', async (req, res, next) => {
    try {
      const refreshToken = (req.cookies && req.cookies.lx_refresh) || (req.body && req.body.refreshToken);
      await service.encerrar({ refreshToken });
      res.clearCookie('lx_access');
      res.clearCookie('lx_refresh');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // POST /auth/impersonar/:usuarioId  (super admin)
  router.post('/impersonar/:usuarioId', verificarToken, verificarAdmin, async (req, res, next) => {
    try {
      const r = await service.impersonar({ adminId: req.usuario.id, usuarioAlvoId: req.params.usuarioId, ip: req.ip });
      setarCookiesSessao(res, r);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // GET /auth/eu — usuário da sessão atual
  router.get('/eu', verificarToken, (req, res) => res.json({ usuario: req.usuario }));

  return router;
}

module.exports = { initAuthRoutes };
