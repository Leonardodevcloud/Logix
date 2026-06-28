const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant } = require('../../middleware/tenant');
const AppError = require('../../shared/AppError');
const { PERFIS } = require('../../shared/constants');
const service = require('./mapa.service');
let lojaPode = async () => true;
try { lojaPode = require('../clientehub/clientehub.service').lojaPode; } catch {}

module.exports = function mapaRoutes() {
  const router = express.Router();

  // GET /mapa/overview — lojas + motoboys online + ETAs, no escopo do solicitante.
  //  • super_admin sem empresa selecionada  → TODAS as empresas (visão global).
  //  • central_admin                        → a empresa dele inteira.
  //  • loja                                 → só ela + motoboys com corrida dela,
  //                                           e somente se a central habilitou.
  router.get('/overview', verificarToken, resolverTenant, async (req, res, next) => {
    try {
      const perfil = req.usuario && req.usuario.perfil;

      // Loja: exige o módulo habilitado para ela.
      if (req.lojaId) {
        const ok = await lojaPode(req.lojaId, 'mapa_tempo_real');
        if (!ok) throw AppError.proibido('Mapa em tempo real não está habilitado para esta loja');
        return res.json(await service.overview({ empresaId: req.empresaId, lojaId: req.lojaId }));
      }

      // Super admin sem empresa: visão global (todas as empresas).
      if (perfil === PERFIS.SUPER_ADMIN && !req.empresaId) {
        return res.json(await service.overview({ empresaId: null, lojaId: null }));
      }

      if (!req.empresaId) throw AppError.validacao('Empresa (tenant) não informada');
      res.json(await service.overview({ empresaId: req.empresaId, lojaId: null }));
    } catch (e) { next(e); }
  });

  return router;
};
