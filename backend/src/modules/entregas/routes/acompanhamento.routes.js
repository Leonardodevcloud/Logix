const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const { limiteRastreamento } = require('../../../middleware/rateLimit');
const service = require('../entregas.service');
const clienteHub = require('../../clientehub/clientehub.service');
const AppError = require('../../../shared/AppError');

// Acompanhamento em tempo real + recebimento de posição do app.
module.exports = function acompanhamentoRoutes() {
  const router = express.Router();

  const csv = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

  // Middleware: exige uma permissão do cliente APENAS quando o ator é a loja
  // (req.lojaId presente). A central (admin) nunca é bloqueada.
  const exigirPermissaoCliente = (permissao, msg) => async (req, res, next) => {
    try {
      if (req.lojaId) {
        const ok = await clienteHub.lojaPode(req.lojaId, permissao);
        if (!ok) throw AppError.proibido(msg || 'Ação não permitida para este cliente');
      }
      next();
    } catch (e) { next(e); }
  };

  // GET /entregas/acompanhamento — visão da central (3 seções + filtros).
  // Aceita: loja_ids (csv), cidades (csv), categoria_ids (csv), de, ate, q.
  router.get('/acompanhamento', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.listarAcompanhamento({
        empresaId: req.empresaId,
        lojaIds: csv(req.query.loja_ids),
        cidades: csv(req.query.cidades),
        categoriaIds: csv(req.query.categoria_ids),
        de: req.query.de || null, ate: req.query.ate || null,
        q: req.query.q || null,
        lojaIdToken: req.lojaId || null, // trava de segurança p/ usuário de loja
      }));
    } catch (e) { next(e); }
  });

  // GET /entregas/acompanhamento/cidades — cidades das lojas (filtro de região).
  router.get('/acompanhamento/cidades', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.listarCidadesLojas(req.empresaId)); } catch (e) { next(e); }
  });

  // GET /entregas/acompanhamento/categorias — categorias de frete (filtro).
  router.get('/acompanhamento/categorias', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.listarCategoriasFrete(req.empresaId)); } catch (e) { next(e); }
  });

  // POST /entregas/acompanhamento/rota-lote — rota otimizada de várias entregas (despacho em lote).
  // Estática: registrada ANTES de /:id/* para não colidir.
  router.post('/acompanhamento/rota-lote', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.rotaLote({ empresaId: req.empresaId, ids: req.body.ids, retornar: !!req.body.retornar, gruposManual: req.body.grupos_manual || null })); }
    catch (e) { next(e); }
  });

  // GET /entregas/:id/trajeto — rota GPS da entrega (coleta, destinos, caminho do motoboy)
  router.get('/:id/trajeto', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.trajetoEntrega({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  // GET /entregas/:id/acompanhar
  router.get('/:id/acompanhar', exigirTenant, async (req, res, next) => {
    try { res.json(await service.acompanhar({ empresaId: req.empresaId, id: req.params.id })); }
    catch (e) { next(e); }
  });

  // POST /entregas/:id/posicao — ping de localização do motoboy (background)
  router.post('/:id/posicao', exigirTenant, limiteRastreamento, async (req, res, next) => {
    try {
      const r = await service.registrarPosicao({
        empresaId: req.empresaId, motoboyId: req.body.motoboy_id, entregaId: req.params.id,
        lat: req.body.lat, lng: req.body.lng,
      });
      res.json(r);
    } catch (e) { next(e); }
  });

  // PATCH /entregas/:id/cancelar
  router.patch('/:id/cancelar', exigirTenant,
    exigirPermissaoCliente('pode_cancelar_associada', 'Este cliente não tem permissão para cancelar corridas já associadas'),
    async (req, res, next) => {
    try {
      res.json(await service.cancelarEntrega({
        empresaId: req.empresaId, id: req.params.id,
        motivo: req.body.motivo, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // POST /entregas/:id/preview-edicao — calcula distância/valor sem salvar (para confirmar)
  router.post('/:id/preview-edicao', exigirTenant, exigirPermissao('entregas.editar'), async (req, res, next) => {
    try {
      res.json(await service.previewEdicao({
        empresaId: req.empresaId, id: req.params.id,
        coleta: req.body.coleta, pontos: req.body.pontos,
      }));
    } catch (e) { next(e); }
  });

  // PUT /entregas/:id/enderecos — editar coleta/pontos de uma entrega ativa
  router.put('/:id/enderecos', exigirTenant, exigirPermissao('entregas.editar'),
    exigirPermissaoCliente('pode_editar_servico', 'Este cliente não tem permissão para editar o serviço'),
    async (req, res, next) => {
    try {
      res.json(await service.editarEnderecos({
        empresaId: req.empresaId, id: req.params.id,
        coleta: req.body.coleta, pontos: req.body.pontos,
        aplicarValores: req.body.aplicarValores,
        usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // PATCH /entregas/:id/valores — edita valor cliente/motoboy (só central)
  router.patch('/:id/valores', exigirTenant, exigirPermissao('entregas.editar'), async (req, res, next) => {
    try {
      // Usuário de loja não edita valores.
      if (req.lojaId) throw AppError.proibido('Apenas a central pode editar valores');
      res.json(await service.editarValores({
        empresaId: req.empresaId, id: req.params.id,
        valorClienteCent: req.body.valor_cliente_cent,
        valorMotoboyCent: req.body.valor_motoboy_cent,
        usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // PATCH /entregas/:id/finalizar — finalização manual pela central
  router.patch('/:id/finalizar', exigirTenant, exigirPermissao('entregas.editar'), async (req, res, next) => {
    try {
      res.json(await service.finalizarManual({
        empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // PATCH /entregas/:id/reabrir — reabre corrida concluída (volta para a fila, sem motoboy)
  router.patch('/:id/reabrir', exigirTenant, exigirPermissao('entregas.editar'), async (req, res, next) => {
    try {
      res.json(await service.reabrirEntrega({
        empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id, ip: req.ip,
      }));
    } catch (e) { next(e); }
  });

  // GET /entregas/:id/logs — timeline completa da corrida (criação → finalização)
  router.get('/:id/logs', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.logsEntrega({ empresaId: req.empresaId, id: req.params.id }));
    } catch (e) { next(e); }
  });

  // GET /entregas/:id/pontos — todos os pontos com detalhes ricos (razão social, tel, nota, obs)
  router.get('/:id/pontos', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      res.json(await service.detalhesPontos({ empresaId: req.empresaId, id: req.params.id }));
    } catch (e) { next(e); }
  });

  return router;
};
