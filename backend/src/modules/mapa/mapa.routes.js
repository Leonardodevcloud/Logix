const express = require('express');
const { exigirTenant } = require('../../middleware/tenant');
const AppError = require('../../shared/AppError');
const service = require('./mapa.service');
let lojaPode = async () => true;
try { lojaPode = require('../clientehub/clientehub.service').lojaPode; } catch {}

module.exports = function mapaRoutes() {
  const router = express.Router();

  // GET /mapa/overview — lojas + motoboys online + ETAs, já no escopo do solicitante.
  // Central vê tudo; loja só vê a si mesma e os motoboys com corrida dela,
  // e somente se a central tiver habilitado o módulo para ela.
  router.get('/overview', exigirTenant, async (req, res, next) => {
    try {
      if (req.lojaId) {
        const ok = await lojaPode(req.lojaId, 'mapa_tempo_real');
        if (!ok) throw AppError.proibido('Mapa em tempo real não está habilitado para esta loja');
      }
      res.json(await service.overview({ empresaId: req.empresaId, lojaId: req.lojaId || null }));
    } catch (e) { next(e); }
  });

  return router;
};
