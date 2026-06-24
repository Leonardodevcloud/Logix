const express = require('express');
const AppError = require('../../shared/AppError');
const { query } = require('../../shared/db');
const { verificarTokenMotoboy } = require('../../middleware/auth');
let emitirParaEmpresa = () => {};
try { emitirParaEmpresa = require('../../realtime/ws').emitirParaEmpresa; } catch {}

module.exports = function motoboyAppRoutes() {
  const router = express.Router();

  // GET /motoboys/app/eu — perfil + status atual
  router.get('/app/eu', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT m.id, m.nome_completo, m.telefone_principal, m.foto_url, m.online, m.status,
                count(e.id)::int AS entregas_ativas
         FROM motoboys m
         LEFT JOIN entregas e ON e.motoboy_id = m.id
           AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
         WHERE m.id = $1
         GROUP BY m.id`,
        [req.motoboy.id]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
      res.json(rows[0]);
    } catch (e) { next(e); }
  });

  // GET /motoboys/app/fila — entregas atribuídas a este motoboy
  router.get('/app/fila', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT e.id, e.protocolo, e.status, e.criado_em,
                e.coleta_endereco, e.coleta_lat, e.coleta_lng, e.distancia_km,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ep.id, 'ordem', ep.ordem, 'endereco', ep.endereco,
                      'lat', ep.lat, 'lng', ep.lng, 'nome_fantasia', ep.nome_fantasia,
                      'numero_nf', ep.numero_nf, 'complemento', ep.complemento,
                      'observacoes', ep.observacoes, 'telefone', ep.telefone,
                      'status', ep.status
                    ) ORDER BY ep.ordem
                  ) FILTER (WHERE ep.id IS NOT NULL),
                  '[]'::json
                ) AS pontos
         FROM entregas e
         LEFT JOIN entregas_pontos ep ON ep.entrega_id = e.id
         WHERE e.motoboy_id = $1
           AND e.empresa_id = $2
           AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
         GROUP BY e.id
         ORDER BY e.criado_em`,
        [req.motoboy.id, req.motoboy.empresaId]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  // PATCH /motoboys/app/status — motoboy atualiza próprio status (online/offline)
  router.patch('/app/status', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { online } = req.body;
      await query(`UPDATE motoboys SET online = $1 WHERE id = $2`, [!!online, req.motoboy.id]);
      emitirParaEmpresa(req.motoboy.empresaId, 'motoboy.status', { motoboyId: req.motoboy.id, online: !!online });
      res.json({ ok: true, online: !!online });
    } catch (e) { next(e); }
  });

  // POST /motoboys/app/posicao — reportar GPS (chamado em background pelo app)
  router.post('/app/posicao', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { lat, lng, entrega_id } = req.body;
      if (!lat || !lng) throw AppError.validacao('lat e lng obrigatórios');
      await query(
        `INSERT INTO rastreamento (motoboy_id, entrega_id, lat, lng) VALUES ($1, $2, $3, $4)`,
        [req.motoboy.id, entrega_id || null, lat, lng]
      );
      emitirParaEmpresa(req.motoboy.empresaId, 'motoboy.posicao', {
        motoboyId: req.motoboy.id, entregaId: entrega_id || null, lat, lng,
      });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // PATCH /motoboys/app/entregas/:id/status — motoboy avança o status da entrega
  // status: aguardando_coleta → em_coleta → em_rota → entregue
  router.patch('/app/entregas/:id/status', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { status } = req.body;
      const FLUXO = ['aguardando_atribuicao', 'aguardando_coleta', 'em_coleta', 'em_rota', 'entregue'];
      if (!FLUXO.includes(status)) throw AppError.validacao('Status inválido');

      const { rows } = await query(
        `SELECT id, status FROM entregas WHERE id = $1 AND motoboy_id = $2 AND empresa_id = $3`,
        [req.params.id, req.motoboy.id, req.motoboy.empresaId]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');

      const atualIdx = FLUXO.indexOf(rows[0].status);
      const novoIdx  = FLUXO.indexOf(status);
      if (novoIdx <= atualIdx) throw AppError.validacao('Não é possível voltar o status');

      const extra = status === 'entregue'
        ? `, concluida_em = now()` : '';

      await query(
        `UPDATE entregas SET status = $1${extra} WHERE id = $2`,
        [status, req.params.id]
      );

      emitirParaEmpresa(req.motoboy.empresaId, 'entrega.status', {
        entregaId: req.params.id, status, motoboyId: req.motoboy.id,
      });

      res.json({ ok: true, status });
    } catch (e) { next(e); }
  });

  // POST /motoboys/app/entregas/:entregaId/pontos/:pontoId/concluir
  // Motoboy finaliza um ponto de entrega e envia foto de protocolo (URL já no storage)
  router.post('/app/entregas/:entregaId/pontos/:pontoId/concluir', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { recebedor, fotos_urls } = req.body; // fotos_urls: string[] de URLs já upadas

      await query(
        `UPDATE entregas_pontos SET status = 'entregue', recebedor = $1, entregue_em = now()
         WHERE id = $2 AND entrega_id = $3`,
        [recebedor || null, req.params.pontoId, req.params.entregaId]
      );

      // Registrar fotos de protocolo
      if (Array.isArray(fotos_urls) && fotos_urls.length) {
        for (const url of fotos_urls) {
          await query(
            `INSERT INTO protocolos (entrega_ponto_id, tipo, arquivo_url) VALUES ($1, 'foto', $2)`,
            [req.params.pontoId, url]
          );
        }
      }

      // Verificar se todos os pontos foram entregues
      const { rows: pendentes } = await query(
        `SELECT count(*)::int AS qtd FROM entregas_pontos
         WHERE entrega_id = $1 AND status != 'entregue'`,
        [req.params.entregaId]
      );

      if (pendentes[0].qtd === 0) {
        await query(
          `UPDATE entregas SET status = 'entregue', concluida_em = now() WHERE id = $1`,
          [req.params.entregaId]
        );
        emitirParaEmpresa(req.motoboy.empresaId, 'entrega.concluida', { entregaId: req.params.entregaId });
      }

      res.json({ ok: true, todos_entregues: pendentes[0].qtd === 0 });
    } catch (e) { next(e); }
  });

  return router;
};
