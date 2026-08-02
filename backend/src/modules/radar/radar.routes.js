const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant, exigirCentral } = require('../../middleware/tenant');
const service = require('./radar.service');

function initRadarRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant);

  // Config: só a central lê e edita (limites e liga/desliga).
  router.get('/config', exigirCentral, async (req, res, next) => {
    try { res.json(await service.getConfig({ empresaId: req.empresaId })); } catch (e) { next(e); }
  });
  router.put('/config', exigirCentral, async (req, res, next) => {
    try {
      res.json(await service.salvarConfig({
        empresaId: req.empresaId,
        ativo: !!req.body.ativo,
        paradoAtencaoMin: req.body.parado_atencao_min,
        paradoCriticoMin: req.body.parado_critico_min,
        raioParadoM: req.body.raio_parado_m,
        semSinalMin: req.body.sem_sinal_min,
        pushCentral: !!req.body.push_central,
      }));
    } catch (e) { next(e); }
  });

  // Alertas: central vê tudo; loja vê só os das entregas dela (filtrado por lojaId).
  router.get('/alertas', async (req, res, next) => {
    try { res.json(await service.listarAlertas({ empresaId: req.empresaId, lojaId: req.lojaId || null })); } catch (e) { next(e); }
  });
  // Dispensar é ação de gestão: só a central.
  router.post('/alertas/:id/dispensar', exigirCentral, async (req, res, next) => {
    try { res.json(await service.dispensarAlerta({ empresaId: req.empresaId, id: req.params.id, minutos: req.body.minutos })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initRadarRoutes };
