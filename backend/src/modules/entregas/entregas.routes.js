const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');

const lancamento = require('./routes/lancamento.routes');
const concluidas = require('./routes/concluidas.routes');
const acompanhamento = require('./routes/acompanhamento.routes');
const protocolos = require('./routes/protocolos.routes');

function initEntregasRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant);

  // Ordem importa: rotas estáticas (/concluidas) antes das com parâmetro (/:id/...)
  router.use('/', concluidas());
  router.use('/', lancamento());
  router.use('/', acompanhamento());
  router.use('/', protocolos());

  return router;
}

module.exports = { initEntregasRoutes };
