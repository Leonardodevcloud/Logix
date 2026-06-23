const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const AppError = require('../../../shared/AppError');
const { httpRequest } = require('../../../shared/httpRequest');
const { query } = require('../../../shared/db');

const BASE_ORS = 'https://api.openrouteservice.org';

module.exports = function geocodeRoutes() {
  const router = express.Router();

  // GET /entregas/geocode?q=endereco — busca de endereços via ORS (autocomplete)
  router.get('/geocode', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 3) return res.json({ resultados: [] });

      const url = `${BASE_ORS}/geocode/autocomplete?api_key=${process.env.ORS_API_KEY}`
        + `&text=${encodeURIComponent(q)}&boundary.country=BR&size=6&lang=pt`;
      const { ok, dados } = await httpRequest(url);

      if (!ok || !dados || !dados.features) return res.json({ resultados: [] });

      const resultados = dados.features.map(f => ({
        label: f.properties.label,
        endereco: f.properties.label,
        bairro: f.properties.neighbourhood || f.properties.locality || '',
        cidade: f.properties.localadmin || f.properties.county || '',
        uf: f.properties.region_a || '',
        cep: f.properties.postalcode || '',
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));

      res.json({ resultados });
    } catch (e) { next(e); }
  });

  // GET /entregas/enderecos-salvos — lista endereços salvos da empresa
  router.get('/enderecos-salvos', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      let sql = `SELECT * FROM enderecos_salvos WHERE empresa_id = $1`;
      const params = [req.empresaId];
      if (q) { params.push(`%${q}%`); sql += ` AND (apelido ILIKE $${params.length} OR endereco_completo ILIKE $${params.length})`; }
      sql += ` ORDER BY is_coleta_padrao DESC, uso_count DESC, apelido LIMIT 20`;
      const { rows } = await query(sql, params);
      res.json(rows);
    } catch (e) { next(e); }
  });

  // POST /entregas/enderecos-salvos — salvar novo endereço
  router.post('/enderecos-salvos', exigirTenant, exigirPermissao('entregas.criar'), async (req, res, next) => {
    try {
      const { apelido, endereco_completo, lat, lng, bairro, cidade, uf, cep, is_coleta_padrao } = req.body;
      if (!apelido || !endereco_completo) throw AppError.validacao('Apelido e endereço são obrigatórios');
      // Se for coleta padrão, desmarcar o anterior primeiro
      if (is_coleta_padrao) {
        await query(`UPDATE enderecos_salvos SET is_coleta_padrao = false WHERE empresa_id = $1 AND is_coleta_padrao = true`, [req.empresaId]);
      }
      const { rows } = await query(
        `INSERT INTO enderecos_salvos (empresa_id, apelido, endereco_completo, lat, lng, bairro, cidade, uf, cep, is_coleta_padrao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (empresa_id, apelido) DO UPDATE SET
           endereco_completo = EXCLUDED.endereco_completo, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
           bairro = EXCLUDED.bairro, cidade = EXCLUDED.cidade, uf = EXCLUDED.uf, cep = EXCLUDED.cep,
           is_coleta_padrao = EXCLUDED.is_coleta_padrao,
           uso_count = enderecos_salvos.uso_count + 1, atualizado_em = now()
         RETURNING *`,
        [req.empresaId, apelido.trim(), endereco_completo, lat || null, lng || null, bairro || null, cidade || null, uf || null, cep || null, !!is_coleta_padrao]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  });

  // DELETE /entregas/enderecos-salvos/:id
  router.delete('/enderecos-salvos/:id', exigirTenant, exigirPermissao('entregas.criar'), async (req, res, next) => {
    try {
      await query(`DELETE FROM enderecos_salvos WHERE id = $1 AND empresa_id = $2`, [req.params.id, req.empresaId]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // GET /entregas/:id/rota — geometria da rota para desenhar no mapa
  router.get('/:id/rota', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT e.coleta_lat, e.coleta_lng, e.coleta_endereco,
                json_agg(json_build_object('lat', ep.lat, 'lng', ep.lng, 'endereco', ep.endereco, 'ordem', ep.ordem)
                  ORDER BY ep.ordem) AS pontos
         FROM entregas e
         LEFT JOIN entregas_pontos ep ON ep.entrega_id = e.id
         WHERE e.id = $1 AND e.empresa_id = $2
         GROUP BY e.id`,
        [req.params.id, req.empresaId]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
      const e = rows[0];

      // Montar coordenadas para ORS directions
      const coords = [[e.coleta_lng, e.coleta_lat]];
      (e.pontos || []).forEach(p => { if (p.lat && p.lng) coords.push([p.lng, p.lat]); });

      if (coords.length < 2) return res.json({ coords: [], distanciaKm: 0, duracaoMin: 0 });

      const { ok, dados } = await httpRequest(`${BASE_ORS}/v2/directions/driving-car/geojson`, {
        metodo: 'POST',
        headers: { Authorization: process.env.ORS_API_KEY },
        corpo: { coordinates: coords },
      });

      if (!ok || !dados?.features?.[0]) return res.json({ coords, distanciaKm: 0, duracaoMin: 0 });

      const seg = dados.features[0].properties.segments || [];
      const distanciaKm = +(seg.reduce((s, x) => s + (x.distance || 0), 0) / 1000).toFixed(1);
      const duracaoMin = Math.round(seg.reduce((s, x) => s + (x.duration || 0), 0) / 60);
      const geom = dados.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);

      res.json({ coords: geom, distanciaKm, duracaoMin, coleta: { lat: e.coleta_lat, lng: e.coleta_lng, endereco: e.coleta_endereco }, pontos: e.pontos });
    } catch (e) { next(e); }
  });


  // POST /entregas/geocode-rota — geometria de rota para o mapa antes de criar a entrega
  router.post('/geocode-rota', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const { pontos } = req.body;
      if (!pontos || pontos.length < 2) return res.json({ geom: [], distanciaKm: 0, duracaoMin: 0 });
      const coords = pontos.map(p => [p.lng, p.lat]);
      const { ok, dados } = await httpRequest(`${BASE_ORS}/v2/directions/driving-car/geojson`, {
        metodo: 'POST',
        headers: { Authorization: process.env.ORS_API_KEY },
        corpo: { coordinates: coords },
      });
      if (!ok || !dados?.features?.[0]) return res.json({ geom: [], distanciaKm: 0, duracaoMin: 0 });
      const seg = dados.features[0].properties.segments || [];
      const distanciaKm = +(seg.reduce((s, x) => s + (x.distance || 0), 0) / 1000).toFixed(1);
      const duracaoMin = Math.round(seg.reduce((s, x) => s + (x.duration || 0), 0) / 60);
      const geom = dados.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      res.json({ geom, distanciaKm, duracaoMin });
    } catch (e) { next(e); }
  });

  return router;
};

// POST /entregas/geocode-rota — geometria de rota para o mapa de lançamento
// (chamado antes de criar a entrega, só para visualização)
