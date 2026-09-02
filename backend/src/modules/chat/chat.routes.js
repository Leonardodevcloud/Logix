const express = require('express');
const { verificarToken, verificarTokenMotoboy } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const { exigirModulo, exigirPermissao } = require('../../middleware/permissoes');
const service = require('./chat.service');

function initChatRoutes() {
  const router = express.Router();

  // ── APP do motoboy (token de motoboy) ──
  const emp = (req) => req.motoboy.empresaId;
  router.get('/app/conversas', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.conversasApp({ empresaId: emp(req), motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });
  router.get('/app/nao-lidas', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.naoLidasApp({ empresaId: emp(req), motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });
  router.post('/app/abrir', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.abrirConversaApp({ empresaId: emp(req), motoboyId: req.motoboy.id, entregaId: req.body.entregaId, tipo: req.body.tipo })); } catch (e) { next(e); }
  });
  router.get('/app/conversas/:id/mensagens', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await service.mensagens({ empresaId: emp(req), conversaId: req.params.id, lado: 'motoboy' })); } catch (e) { next(e); }
  });
  router.post('/app/conversas/:id/mensagens', verificarTokenMotoboy, async (req, res, next) => {
    try {
      res.json(await service.enviar({
        empresaId: emp(req), conversaId: req.params.id, autorTipo: 'motoboy', autorId: req.motoboy.id, autorNome: 'Entregador',
        tipo: req.body.tipo, texto: req.body.texto, arquivo: req.body.arquivo, lat: req.body.lat, lng: req.body.lng,
      }));
    } catch (e) { next(e); }
  });

  // ── CENTRAL / LOJA (token de usuário) — gated pelo módulo chat + permissões ──
  router.use(verificarToken, resolverTenant, exigirTenant, exigirModulo('chat'));
  const lado = (req) => (req.lojaId ? 'loja' : 'central');

  router.get('/conversas', exigirPermissao('chat.ver'), async (req, res, next) => {
    try { res.json(await service.conversasCentral({ empresaId: req.empresaId, lojaId: req.lojaId || null })); } catch (e) { next(e); }
  });
  router.get('/nao-lidas', exigirPermissao('chat.ver'), async (req, res, next) => {
    try { res.json(await service.naoLidasCentral({ empresaId: req.empresaId, lojaId: req.lojaId || null })); } catch (e) { next(e); }
  });
  router.post('/abrir', exigirPermissao('chat.ver'), async (req, res, next) => {
    try { res.json(await service.abrirConversaLoja({ empresaId: req.empresaId, lojaId: req.lojaId, entregaId: req.body.entregaId })); } catch (e) { next(e); }
  });
  router.get('/conversas/:id/mensagens', exigirPermissao('chat.ver'), async (req, res, next) => {
    try { res.json(await service.mensagens({ empresaId: req.empresaId, conversaId: req.params.id, lado: lado(req) })); } catch (e) { next(e); }
  });
  router.post('/conversas/:id/mensagens', exigirPermissao('chat.responder'), async (req, res, next) => {
    try {
      res.json(await service.enviar({
        empresaId: req.empresaId, conversaId: req.params.id, autorTipo: lado(req),
        autorId: req.usuario.id, autorNome: req.usuario.nome || (req.lojaId ? 'Loja' : 'Suporte'),
        tipo: req.body.tipo, texto: req.body.texto, arquivo: req.body.arquivo, lat: req.body.lat, lng: req.body.lng,
      }));
    } catch (e) { next(e); }
  });

  // ── Config do "chat direto com a loja" — só a CENTRAL (empresa admin) ──
  const soCentral = (req, res, next) => { if (req.lojaId) return next(require('../../shared/AppError').proibido('Apenas a central configura módulos')); next(); };
  router.get('/config/lojas', exigirPermissao('chat.ver'), soCentral, async (req, res, next) => {
    try { res.json(await service.lojasChatConfig({ empresaId: req.empresaId })); } catch (e) { next(e); }
  });
  router.get('/config/lojas/:lojaId/centros', exigirPermissao('chat.ver'), soCentral, async (req, res, next) => {
    try { res.json(await service.centrosChatConfig({ empresaId: req.empresaId, lojaId: req.params.lojaId })); } catch (e) { next(e); }
  });
  router.put('/config/lojas/:lojaId', exigirPermissao('chat.responder'), soCentral, async (req, res, next) => {
    try { res.json(await service.definirChatLoja({ empresaId: req.empresaId, lojaId: req.params.lojaId, ativo: req.body.ativo })); } catch (e) { next(e); }
  });
  router.put('/config/centros/:centroId', exigirPermissao('chat.responder'), soCentral, async (req, res, next) => {
    try { res.json(await service.definirChatCentro({ empresaId: req.empresaId, centroId: req.params.centroId, estado: req.body.estado })); } catch (e) { next(e); }
  });

  return router;
}
module.exports = { initChatRoutes };
