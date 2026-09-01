const express = require('express');
const { verificarToken } = require('../../middleware/auth');
const { resolverTenant, exigirTenant } = require('../../middleware/tenant');
const service = require('./rotas.service');

function initRotasRoutes() {
  const router = express.Router();
  router.use(verificarToken, resolverTenant, exigirTenant);

  // GET /rotas?protocolo=&entregador=&data=&hora_ini=&hora_fim=
  router.get('/', async (req, res, next) => {
    try {
      res.json(await service.listarRotas({
        empresaId: req.empresaId, lojaId: req.lojaId || null,
        protocolo: req.query.protocolo || null, entregador: req.query.entregador || null,
        data: req.query.data || null, horaIni: req.query.hora_ini || null, horaFim: req.query.hora_fim || null,
      }));
    } catch (e) { next(e); }
  });

  // GET /rotas/pontos?ids=uuid1,uuid2  — traçado de uma ou várias corridas
  router.get('/pontos', async (req, res, next) => {
    try {
      const ids = req.query.ids ? String(req.query.ids).split(',').map(s => s.trim()).filter(Boolean) : [];
      res.json(await service.pontosRota({ empresaId: req.empresaId, lojaId: req.lojaId || null, entregaIds: ids }));
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initRotasRoutes };
