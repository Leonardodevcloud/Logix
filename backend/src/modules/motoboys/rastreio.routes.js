const express = require('express');
const { exigirTenant } = require('../../middleware/tenant');
const { query } = require('../../shared/db');
const { httpRequest } = require('../../shared/httpRequest');
const ors = require('../../integracoes/openrouteservice');
const storage = require('../../shared/storage');

const BASE_ORS = process.env.ORS_BASE || 'https://api.heigit.org/openrouteservice';

module.exports = function rastreioRoutes() {
  const router = express.Router();

  // GET /motoboys/rastreio — lista motoboys com última posição e carga atual.
  // Central vê todos; loja vê só os atribuídos a ela (respeitando o centro do usuário).
  router.get('/rastreio', exigirTenant, async (req, res, next) => {
    try {
      const params = [req.empresaId];
      let filtroLoja = '';
      if (req.lojaId) {
        // Centro do usuário logado (se for usuário de um centro de custo).
        let centroId = null;
        try {
          const c = await query(`SELECT centro_id FROM cliente_centro_usuarios WHERE usuario_id = $1 LIMIT 1`, [req.usuario && req.usuario.id]);
          centroId = c.rows[0] ? c.rows[0].centro_id : null;
        } catch {}
        params.push(req.lojaId); const pLoja = params.length;
        params.push(centroId); const pCentro = params.length;
        filtroLoja = `AND m.id IN (
          SELECT motoboy_id FROM cliente_motoboys
           WHERE loja_id = $${pLoja}
             AND ($${pCentro}::uuid IS NULL OR centro_id IS NULL OR centro_id = $${pCentro})
        )`;
      }
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
         WHERE m.empresa_id = $1 AND m.status = 'ativo' ${filtroLoja}
         GROUP BY m.id, r.lat, r.lng, r.capturado_em
         ORDER BY m.online DESC, r.capturado_em DESC NULLS LAST`,
        params
      );
      // Resolve a foto (selfie assinada) por leitura — a coluna foto_url do banco
      // não guarda a URL final. Mesmo esquema do app/mapa.
      if (rows.length) {
        try {
          const ids = rows.map(r => r.id);
          const { rows: docs } = await query(
            `SELECT motoboy_id, storage_key FROM motoboy_documentos
              WHERE tipo = 'selfie' AND motoboy_id = ANY($1::uuid[])`,
            [ids]
          );
          const keyByMb = new Map();
          for (const d of docs) { if (!keyByMb.has(d.motoboy_id)) keyByMb.set(d.motoboy_id, d.storage_key); }
          for (const r of rows) {
            const k = keyByMb.get(r.id);
            r.foto_url = k ? await storage.urlDe(k).catch(() => null) : null;
          }
        } catch { /* mantém foto_url do SELECT como fallback */ }
      }
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET /motoboys/:id/rota-atual — rota do motoboy em andamento (posição → pontos pendentes)
  router.get('/:id/rota-atual', exigirTenant, async (req, res, next) => {
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

      // Sem rota ORS: retornar linha reta posição → destinos para mostrar no mapa
      const geomReta = [
        [pos[0].lat, pos[0].lng],
        ...pontos.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng])
      ];
      res.json({ geom: geomReta, pontos, distanciaKm: 0, duracaoMin: 0, posicao: pos[0] });
    } catch (e) { next(e); }
  });

  // GET /motoboys/:id/rota-otimizada — rota OTIMIZADA (VROOM): reordena os pontos
  // pendentes a partir da posição atual e devolve ordem + traçado + km/min.
  router.get('/:id/rota-otimizada', exigirTenant, async (req, res, next) => {
    try {
      const motoboyId = req.params.id;
      const { rows: pos } = await query(
        `SELECT lat, lng FROM rastreamento WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`, [motoboyId]);
      if (!pos[0]) return res.json({ geom: [], pontos: [], distanciaKm: 0, duracaoMin: 0 });
      const { rows: pontos } = await query(
        `SELECT ep.lat, ep.lng, ep.endereco, ep.ordem, e.protocolo
           FROM entregas_pontos ep JOIN entregas e ON e.id = ep.entrega_id
          WHERE e.motoboy_id = $1 AND e.empresa_id = $2
            AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
          ORDER BY e.criado_em, ep.ordem`, [motoboyId, req.empresaId]);
      const validos = pontos.filter(p => p.lat && p.lng);
      const posLL = { lat: pos[0].lat, lng: pos[0].lng };
      if (!validos.length) return res.json({ geom: [], pontos, distanciaKm: 0, duracaoMin: 0, posicao: pos[0], otimizada: true });

      let ordenados = validos, dist = 0, dur = 0;
      if (validos.length > 1) {
        try {
          const otim = await ors.otimizarRota({ coleta: posLL, pontos: validos });
          if (otim && Array.isArray(otim.ordem) && otim.ordem.length) {
            ordenados = otim.ordem.map(i => validos[i]).filter(Boolean);
            dist = otim.distanciaKm || 0; dur = otim.duracaoMin || 0;
          }
        } catch (_) {}
      }
      let geom = [];
      try {
        const rota = await ors.tracarRota([posLL, ...ordenados]);
        geom = (rota && rota.coordenadas) || [];
        if (!dist) dist = (rota && rota.distanciaKm) || 0;
        if (!dur) dur = (rota && rota.duracaoMin) || 0;
      } catch (_) {}
      if (!geom.length) geom = [[posLL.lat, posLL.lng], ...ordenados.map(p => [p.lat, p.lng])];
      res.json({ geom, pontos: ordenados, distanciaKm: dist, duracaoMin: dur, posicao: pos[0], otimizada: true });
    } catch (e) { next(e); }
  });


  return router;
};
