const express = require('express');
const AppError = require('../../shared/AppError');
const { query } = require('../../shared/db');
const { verificarTokenMotoboy } = require('../../middleware/auth');
let emitirParaEmpresa = () => {};
try { emitirParaEmpresa = require('../../realtime/ws').emitirParaEmpresa; } catch {}

// Calcula distância total da entrega (coleta → pontos) via haversine
// Usado quando ORS não calculou a distância na criação
async function calcularKmEntrega(entregaId) {
  try {
    const { rows } = await query(
      `SELECT e.coleta_lat, e.coleta_lng,
              json_agg(json_build_object('lat', ep.lat, 'lng', ep.lng) ORDER BY ep.ordem) AS pontos
       FROM entregas e
       JOIN entregas_pontos ep ON ep.entrega_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [entregaId]
    );
    if (!rows[0]) return null;
    const { coleta_lat, coleta_lng, pontos } = rows[0];
    if (!coleta_lat || !coleta_lng || !pontos?.length) return null;
    const pts = [
      { lat: parseFloat(coleta_lat), lng: parseFloat(coleta_lng) },
      ...pontos.filter(p => p.lat && p.lng).map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) })),
    ];
    if (pts.length < 2) return null;
    let km = 0;
    const R = 6371, rad = x => x * Math.PI / 180;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
      km += 2 * R * Math.asin(Math.sqrt(h));
    }
    return parseFloat(km.toFixed(2));
  } catch {
    return null;
  }
}

module.exports = function motoboyAppRoutes() {
  const router = express.Router();

  // GET /motoboys/app/eu
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

  // GET /motoboys/app/fila
  router.get('/app/fila', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT e.id, e.protocolo, e.status, e.criado_em,
                e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng, e.distancia_km,
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

  // PATCH /motoboys/app/status
  router.patch('/app/status', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { online } = req.body;
      await query(`UPDATE motoboys SET online = $1 WHERE id = $2`, [!!online, req.motoboy.id]);
      emitirParaEmpresa(req.motoboy.empresaId, 'motoboy.status', { motoboyId: req.motoboy.id, online: !!online });
      res.json({ ok: true, online: !!online });
    } catch (e) { next(e); }
  });

  // POST /motoboys/app/posicao
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

  // PATCH /motoboys/app/entregas/:id/status
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

      const extra = status === 'entregue' ? `, concluida_em = now()` : '';
      await query(`UPDATE entregas SET status = $1${extra} WHERE id = $2`, [status, req.params.id]);

      emitirParaEmpresa(req.motoboy.empresaId, 'entrega.status', {
        entregaId: req.params.id, status, motoboyId: req.motoboy.id,
      });
      res.json({ ok: true, status });
    } catch (e) { next(e); }
  });

  // POST /motoboys/app/entregas/:entregaId/pontos/:pontoId/concluir
  // Responde imediatamente e processa fotos em background (evita timeout no app)
  router.post('/app/entregas/:entregaId/pontos/:pontoId/concluir', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { recebedor, fotos_urls, observacao } = req.body;
      const { entregaId, pontoId } = req.params;
      const empresaId = req.motoboy.empresaId;

      // 1. Atualizar ponto
      await query(
        `UPDATE entregas_pontos
         SET status = 'entregue', recebedor = $1, entregue_em = now(), finalizado_em = now(),
             observacao_motoboy = $4
         WHERE id = $2 AND entrega_id = $3`,
        [recebedor || null, pontoId, entregaId, observacao || null]
      );

      // 2. Verificar se todos pontos foram entregues
      const { rows: pendentes } = await query(
        `SELECT count(*)::int AS qtd FROM entregas_pontos
         WHERE entrega_id = $1 AND status != 'entregue'`,
        [entregaId]
      );
      const todosEntregues = pendentes[0].qtd === 0;

      if (todosEntregues) {
        // Calcular km via haversine se ORS não calculou (distancia_km null ou zero)
        const kmHaversine = await calcularKmEntrega(entregaId);
        await query(
          `UPDATE entregas
           SET status = 'entregue', concluida_em = now(),
               tempo_total_min = ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(iniciada_em, criado_em))) / 60),
               distancia_km = COALESCE(NULLIF(distancia_km, 0), $2)
           WHERE id = $1`,
          [entregaId, kmHaversine]
        );
      }

      // 3. Responder IMEDIATAMENTE ao app
      res.json({ ok: true, todos_entregues: todosEntregues });

      // 4. Fotos em background
      if (Array.isArray(fotos_urls) && fotos_urls.length) {
        setImmediate(async () => {
          for (const url of fotos_urls) {
            if (!url) continue;
            try {
              await query(
                `INSERT INTO protocolos (entrega_ponto_id, tipo, arquivo_url) VALUES ($1, 'outro', $2)`,
                [pontoId, url]
              );
            } catch (err) {
              console.error('[app:concluir] foto background:', err.message);
            }
          }
        });
      }

      if (todosEntregues) {
        emitirParaEmpresa(empresaId, 'entrega.concluida', { entregaId });
      }

    } catch (e) { next(e); }
  });

  // POST /motoboys/app/entregas/:entregaId/concluir-sem-ponto
  // Fallback: pega automaticamente o primeiro ponto pendente
  router.post('/app/entregas/:entregaId/concluir-sem-ponto', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { recebedor, fotos_urls, observacao } = req.body;
      const { entregaId } = req.params;
      const empresaId = req.motoboy.empresaId;

      // Pegar o primeiro ponto pendente
      const { rows: pontos } = await query(
        `SELECT id FROM entregas_pontos
         WHERE entrega_id = $1 AND status != 'entregue'
         ORDER BY ordem LIMIT 1`,
        [entregaId]
      );
      const pontoId = pontos[0]?.id;

      if (pontoId) {
        await query(
          `UPDATE entregas_pontos
           SET status = 'entregue', recebedor = $1, entregue_em = now(), finalizado_em = now(),
               observacao_motoboy = $3
           WHERE id = $2`,
          [recebedor || null, pontoId, observacao || null]
        );
      }

      // Verificar pendentes
      const { rows: pend } = await query(
        `SELECT count(*)::int AS qtd FROM entregas_pontos
         WHERE entrega_id = $1 AND status != 'entregue'`,
        [entregaId]
      );
      const todosEntregues = pend[0].qtd === 0;

      if (todosEntregues) {
        // Calcular km via haversine se ORS não calculou
        const kmHaversine = await calcularKmEntrega(entregaId);
        await query(
          `UPDATE entregas
           SET status = 'entregue', concluida_em = now(),
               tempo_total_min = ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(iniciada_em, criado_em))) / 60),
               distancia_km = COALESCE(NULLIF(distancia_km, 0), $2)
           WHERE id = $1`,
          [entregaId, kmHaversine]
        );
      }

      // Responder imediatamente
      res.json({ ok: true, todos_entregues: todosEntregues });

      // Fotos em background
      if (pontoId && Array.isArray(fotos_urls) && fotos_urls.length) {
        setImmediate(async () => {
          for (const url of fotos_urls) {
            if (!url) continue;
            try {
              await query(
                `INSERT INTO protocolos (entrega_ponto_id, tipo, arquivo_url) VALUES ($1, 'outro', $2)`,
                [pontoId, url]
              );
            } catch (err) {
              console.error('[app:concluir-sem-ponto] foto background:', err.message);
            }
          }
        });
      }

      if (todosEntregues) {
        emitirParaEmpresa(empresaId, 'entrega.concluida', { entregaId });
      }

    } catch (e) { next(e); }
  });

  return router;
};
