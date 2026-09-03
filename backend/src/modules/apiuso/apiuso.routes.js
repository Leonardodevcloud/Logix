const express = require('express');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const service = require('./apiuso.service');

// Monitor de custos de API — exclusivo do super admin (admin Logix).
function initApiUsoRoutes() {
  const router = express.Router();
  router.use(verificarToken, verificarAdmin);

  // GET /api-uso/resumo?preset=7dias|hoje|30dias|mes  (ou de=YYYY-MM-DD&ate=YYYY-MM-DD)
  router.get('/resumo', async (req, res, next) => {
    try {
      res.json(await service.resumo({
        preset: req.query.preset,
        de: req.query.de || null,
        ate: req.query.ate || null,
      }));
    } catch (e) { next(e); }
  });

  // GET /api-uso/precos
  router.get('/precos', async (req, res, next) => {
    try { res.json(await service.precos()); } catch (e) { next(e); }
  });

  // PUT /api-uso/precos  body: [{ provedor, operacao, preco_por_mil }]
  router.put('/precos', async (req, res, next) => {
    try { res.json(await service.definirPrecos(req.body)); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initApiUsoRoutes };
