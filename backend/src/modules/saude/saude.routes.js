const express = require('express');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const service = require('./saude.service');

function initSaudeRoutes() {
  const router = express.Router();
  router.use(verificarToken, verificarAdmin); // só super_admin (plataforma)
  router.get('/resumo', async (req, res, next) => {
    try {
      const periodo = service.PERIODOS[req.query.periodo] ? req.query.periodo : '6h';
      res.set('Cache-Control', 'no-store');
      res.json(await service.resumo({ periodo }));
    } catch (e) { next(e); }
  });
  return router;
}
module.exports = { initSaudeRoutes };
