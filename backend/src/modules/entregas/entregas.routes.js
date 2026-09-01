const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
const { exigirModulo } = require('../../middleware/permissoes');

const lancamento = require('./routes/lancamento.routes');
const concluidas = require('./routes/concluidas.routes');
const acompanhamento = require('./routes/acompanhamento.routes');
const protocolos = require('./routes/protocolos.routes');
const geocode = require('./routes/geocode.routes');
const service = require('./entregas.service');

function initEntregasRoutes() {
  const router = express.Router();

  // PÚBLICO (sem auth): protocolo/comprovante da entrega, para o cliente enviar ao
  // cliente final. Acesso por UUID (capability URL). Fica ANTES do verificarToken —
  // senão o token global barra quem não está logado (era o bug do link público).
  router.get('/:id/protocolo', async (req, res, next) => {
    try {
      const html = await service.gerarProtocoloHtml(req.params.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) { next(e); }
  });

  router.use(verificarToken, resolverTenant, exigirModulo('entregas'));

  // Ordem importa: rotas estáticas (/concluidas) antes das com parâmetro (/:id/...)
  router.use('/', geocode());
  router.use('/', concluidas());
  router.use('/', lancamento());
  router.use('/', acompanhamento());
  router.use('/', protocolos());

  return router;
}

module.exports = { initEntregasRoutes };
