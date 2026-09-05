const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const service = require('../entregas.service');
const { query } = require('../../../shared/db');

// Lançamento e listagem de entregas.
module.exports = function lancamentoRoutes() {
  const router = express.Router();

  // POST /entregas — lança rota (coleta + N destinos)
  router.post('/', exigirTenant, exigirPermissao('entregas.criar'), async (req, res, next) => {
    try {
      // Loja do pedido: usuário de loja usa a própria (do token); central informa no body.
      const lojaId = req.lojaId || req.body.loja_id || null;

      // Permissão "escolher profissional": se o ator é loja e não tem a permissão,
      // ignora qualquer motoboy escolhido — a corrida cai no fluxo automático.
      let motoboyId = req.body.motoboy_id;
      let distribuicao = req.body.distribuicao;
      if (req.lojaId && motoboyId) {
        const clienteHub = require('../../clientehub').service;
        const podeEscolher = await clienteHub.lojaPode(req.lojaId, 'pode_escolher_profissional');
        if (!podeEscolher) { motoboyId = undefined; distribuicao = 'automatica'; }
      }
      // Motoboy escolhido explicitamente => atribuição DIRETA (só pra ele), nunca broadcast.
      if (motoboyId) distribuicao = 'manual';

      // Centro de custo da corrida: usa o enviado; senão, deriva do centro do
      // usuário logado (se ele pertence a um centro) — assim toda corrida lançada
      // de dentro de um centro registra de qual centro veio.
      let centroCustoId = req.body.centro_custo_id || null;
      if (!centroCustoId && req.lojaId && req.usuario) {
        try {
          const { rows } = await query(`SELECT centro_id FROM cliente_centro_usuarios WHERE usuario_id = $1 LIMIT 1`, [req.usuario.id]);
          if (rows[0]) centroCustoId = rows[0].centro_id;
        } catch {}
      }

      const r = await service.criarEntrega({
        empresaId: req.empresaId,
        lojaId,
        criadoPor: req.usuario.id,
        coleta: req.body.coleta,
        destinos: req.body.destinos,
        distribuicao,
        motoboyId,
        modalidadeId: req.body.modalidade_id,
        centroCustoId,
        ip: req.ip,
      });
      res.status(201).json(r);
    } catch (e) { next(e); }
  });

  // GET /entregas?status=&motoboy_id=&loja_id=
  // KPIs do painel — contagem no banco (escala). Loja vê só as suas; central o total.
  router.get('/resumo', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const lojaId = req.lojaId || req.query.loja_id || null;
      res.json(await service.resumoEntregas({ empresaId: req.empresaId, lojaId }));
    } catch (e) { next(e); }
  });

  // GET /entregas/dashboard?de=&ate=&loja_id=&centro_id= — métricas do Dashboard
  // Estado atual + desempenho do período (default hoje), com dentro/fora do prazo.
  router.get('/dashboard', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const lojaId = req.lojaId || req.query.loja_id || null;
      const centroId = req.query.centro_id || null;
      res.json(await service.dashboardMetricas({
        empresaId: req.empresaId, lojaId, centroId,
        de: req.query.de || null, ate: req.query.ate || null,
      }));
    } catch (e) { next(e); }
  });

  // Config de lançamento da loja (Automático/Manual + padrão). Fica no módulo
  // entregas porque a loja não tem o módulo de gestão de lojas.
  router.get('/config-lancamento', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try { res.json(await service.configLancamentoLoja({ empresaId: req.empresaId, lojaId: req.lojaId || null })); } catch (e) { next(e); }
  });

  router.get('/', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      // Usuário de loja só vê as próprias; central pode filtrar por loja_id (query).
      const lojaId = req.lojaId || req.query.loja_id || null;
      res.json(await service.listar({
        empresaId: req.empresaId, status: req.query.status, motoboyId: req.query.motoboy_id, lojaId,
      }));
    } catch (e) { next(e); }
  });

  return router;
};
