const express = require('express');
const { exigirTenant } = require('../../middleware/tenant');
const { exigirPermissao } = require('../../middleware/permissoes');
const { query } = require('../../shared/db');
const { httpRequest } = require('../../shared/httpRequest');

const BASE_ORS = 'https://api.openrouteservice.org';

module.exports = function rastreioRoutes() {
  const router = express.Router();

  // GET /motoboys/rastreio — lista todos motoboys com última posição e carga atual
  router.get('/rastreio', exigirTenant, exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT m.id, m.nome_completo, m.telefone_principal, m.foto_url, m.online, m.status,
                r.lat, r.lng, r.capturado_em AS ultima_posicao_em,
                count(e.id)::int AS entregas_ativas,
                json_agg(
                  json_build_object(
                    'id', e.id, 'protocolo', e.protocolo, 'status', e.status,
                    'destino', (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem DESC LIMIT 1)
                  )
                ) FILTER (WHERE e.id IS NOT NULL) AS entregas
         FROM motoboys m
         LEFT JOIN LATERAL (
           SELECT lat, lng, capturado_em
           FROM rastreamento
           WHERE motoboy_id = m.id
           ORDER BY capturado_em DESC LIMIT 1
         ) r ON true
         LEFT JOIN entregas e ON e.motoboy_id = m.id
           AND e.empresa_id = m.empresa_id
           AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
         WHERE m.empresa_id = $1 AND m.status = 'ativo'
         GROUP BY m.id, r.lat, r.lng, r.capturado_em
         ORDER BY m.online DESC, r.capturado_em DESC NULLS LAST`,
        [req.empresaId]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET /motoboys/:id/rota-atual — rota do motoboy em andamento (posição → pontos pendentes)
  router.get('/:id/rota-atual', exigirTenant, exigirPermissao('motoboys.ver'), async (req, res, next) => {
    try {
      const motoboyId = req.params.id;

      // Última posição do motoboy
      const { rows: pos } = await query(
        `SELECT lat, lng FROM rastreamento WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`,
        [motoboyId]
      );
      if (!pos[0]) return res.json({ geom: [], pontos: [], distanciaKm: 0, duracaoMin: 0 });

      // Pontos pendentes das entregas ativas
      const { rows: pontos } = await query(
        `SELECT ep.lat, ep.lng, ep.endereco, ep.ordem, e.protocolo
         FROM entregas_pontos ep
         JOIN entregas e ON e.id = ep.entrega_id
         WHERE e.motoboy_id = $1
           AND e.empresa_id = $2
           AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
           AND ep.status = 'pendente'
         ORDER BY e.criado_em, ep.ordem`,
        [motoboyId, req.empresaId]
      );

      if (!pontos.length) return res.json({ geom: [], pontos: [], distanciaKm: 0, duracaoMin: 0, posicao: pos[0] });

      // Calcular rota via ORS: posição atual → pontos pendentes
      const coords = [[pos[0].lng, pos[0].lat], ...pontos.filter(p => p.lat && p.lng).map(p => [p.lng, p.lat])];

      if (coords.length < 2) return res.json({ geom: [], pontos, distanciaKm: 0, duracaoMin: 0, posicao: pos[0] });

      try {
        const { ok, dados } = await httpRequest(`${BASE_ORS}/v2/directions/driving-car/geojson`, {
          metodo: 'POST',
          headers: { Authorization: process.env.ORS_API_KEY },
          corpo: { coordinates: coords },
        });

        if (ok && dados?.features?.[0]) {
          const seg = dados.features[0].properties.segments || [];
          const distanciaKm = +(seg.reduce((s, x) => s + (x.distance || 0), 0) / 1000).toFixed(1);
          const duracaoMin = Math.round(seg.reduce((s, x) => s + (x.duration || 0), 0) / 60);
          const geom = dados.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          return res.json({ geom, pontos, distanciaKm, duracaoMin, posicao: pos[0] });
        }
      } catch {}

      res.json({ geom: [], pontos, distanciaKm: 0, duracaoMin: 0, posicao: pos[0] });
    } catch (e) { next(e); }
  });

  return router;
};
