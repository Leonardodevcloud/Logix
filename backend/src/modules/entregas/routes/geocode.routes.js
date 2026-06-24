const express = require('express');
const { exigirTenant } = require('../../../middleware/tenant');
const { exigirPermissao } = require('../../../middleware/permissoes');
const AppError = require('../../../shared/AppError');
const { httpRequest } = require('../../../shared/httpRequest');
const { query } = require('../../../shared/db');

const BASE_ORS = 'https://api.openrouteservice.org';
const BASE_GOOGLE = 'https://maps.googleapis.com/maps/api';

// ── Cache permanente no banco ─────────────────────────────────────────────────
// Consulta o cache antes de chamar a API. Grava o resultado se não existir.
async function geocodeComCache(chave, fn) {
  const chaveNorm = chave.trim().toLowerCase();

  // 1. Verificar cache
  try {
    const { rows } = await query(
      `SELECT resultado FROM geocode_cache WHERE chave = $1`,
      [chaveNorm]
    );
    if (rows[0]) {
      // Incrementar hit_count em background sem bloquear
      query(`UPDATE geocode_cache SET hit_count = hit_count + 1, ultimo_acesso = now() WHERE chave = $1`, [chaveNorm]).catch(() => {});
      return rows[0].resultado;
    }
  } catch {}

  // 2. Cache miss — chamar a API
  const resultado = await fn();

  // 3. Persistir no banco (sem await — não bloqueia a resposta)
  if (resultado && resultado.length > 0) {
    query(
      `INSERT INTO geocode_cache (chave, resultado) VALUES ($1, $2)
       ON CONFLICT (chave) DO UPDATE SET resultado = EXCLUDED.resultado, hit_count = geocode_cache.hit_count + 1, ultimo_acesso = now()`,
      [chaveNorm, JSON.stringify(resultado)]
    ).catch(() => {});
  }

  return resultado;
}

// ── Google Geocoding API ──────────────────────────────────────────────────────
function googleResultToResult(r) {
  const get = (tipo) => (r.address_components || []).find(c => c.types?.includes(tipo))?.long_name || '';
  const getS = (tipo) => (r.address_components || []).find(c => c.types?.includes(tipo))?.short_name || '';
  const lat = r.geometry?.location?.lat;
  const lng = r.geometry?.location?.lng;
  const numero = get('street_number');
  const componentes = (r.address_components || []).map(c => ({
    types: c.types,
    long_name: c.long_name,
    short_name: c.short_name,
  }));
  return {
    label: r.formatted_address,
    endereco: r.formatted_address,
    latitude: lat, longitude: lng,
    lat, lng,
    numero,
    rua: get('route'),
    bairro: get('sublocality_level_1') || get('sublocality') || get('neighborhood') || '',
    cidade: get('administrative_area_level_2') || get('locality') || '',
    uf: getS('administrative_area_level_1') || '',
    cep: get('postal_code') || '',
    componentes,
    tem_numero: !!numero,
    place_id: r.place_id || null,
  };
}

async function chamarGoogleGeocode(endereco) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY não configurada');
  const url = `${BASE_GOOGLE}/geocode/json?address=${encodeURIComponent(endereco)}&region=br&language=pt-BR&key=${key}`;
  const { ok, dados } = await httpRequest(url);
  if (!ok || !dados || dados.status === 'REQUEST_DENIED') throw new Error('Google Geocoding indisponível: ' + (dados?.error_message || dados?.status || 'erro'));
  if (!dados.results?.length) return [];
  return dados.results.slice(0, 6).map(googleResultToResult);
}

async function chamarGoogleReverso(lat, lng) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY não configurada');
  const url = `${BASE_GOOGLE}/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${key}`;
  const { ok, dados } = await httpRequest(url);
  if (!ok || !dados?.results?.length) return [];
  return dados.results.slice(0, 1).map(googleResultToResult);
}

// ── Fallback ORS (usado se Google não estiver configurado) ────────────────────
function orsFeatureToResult(f) {
  const p = f.properties;
  const lat = f.geometry.coordinates[1];
  const lng = f.geometry.coordinates[0];
  const componentes = [
    p.housenumber ? { types: ['street_number'], long_name: p.housenumber, short_name: p.housenumber } : null,
    p.street ? { types: ['route'], long_name: p.street, short_name: p.street } : null,
    p.neighbourhood ? { types: ['sublocality_level_1', 'sublocality'], long_name: p.neighbourhood, short_name: p.neighbourhood } : null,
    p.locality || p.localadmin ? { types: ['administrative_area_level_2'], long_name: p.locality || p.localadmin, short_name: p.locality || p.localadmin } : null,
    p.region_a ? { types: ['administrative_area_level_1'], long_name: p.region || p.region_a, short_name: p.region_a } : null,
    p.postalcode ? { types: ['postal_code'], long_name: p.postalcode, short_name: p.postalcode } : null,
  ].filter(Boolean);
  return {
    label: p.label, endereco: p.label,
    latitude: lat, longitude: lng, lat, lng,
    numero: p.housenumber || '', rua: p.street || '',
    bairro: p.neighbourhood || p.locality || '',
    cidade: p.localadmin || p.locality || '',
    uf: p.region_a || '', cep: p.postalcode || '',
    componentes, tem_numero: !!p.housenumber,
  };
}

async function geocodificarComFallback(q) {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return chamarGoogleGeocode(q);
  }
  // Fallback ORS
  const url = `${BASE_ORS}/geocode/autocomplete?api_key=${process.env.ORS_API_KEY}&text=${encodeURIComponent(q)}&boundary.country=BR&size=6&lang=pt`;
  const { ok, dados } = await httpRequest(url);
  if (!ok || !dados?.features) return [];
  return dados.features.map(orsFeatureToResult);
}

async function geocodificarReversoComFallback(lat, lng) {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return chamarGoogleReverso(lat, lng);
  }
  const url = `${BASE_ORS}/geocode/reverse?api_key=${process.env.ORS_API_KEY}&point.lat=${lat}&point.lon=${lng}&size=1&lang=pt`;
  const { ok, dados } = await httpRequest(url);
  if (!ok || !dados?.features?.length) return [];
  return dados.features.slice(0, 1).map(orsFeatureToResult);
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
module.exports = function geocodeRoutes() {
  const router = express.Router();

  // GET /entregas/geocode?q=endereco
  router.get('/geocode', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 3) return res.json({ resultados: [] });

      // Geocode reverso (coordenadas)
      const coordMatch = q.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
      if (coordMatch) {
        const [, lat, lng] = coordMatch;
        const chave = `rev:${parseFloat(lat).toFixed(5)},${parseFloat(lng).toFixed(5)}`;
        const resultados = await geocodeComCache(chave, () => geocodificarReversoComFallback(lat, lng));
        return res.json({ resultados: resultados || [] });
      }

      // Geocode normal com cache permanente
      const resultados = await geocodeComCache(q, () => geocodificarComFallback(q));
      res.json({ resultados: resultados || [] });
    } catch (e) {
      console.error('[geocode]', e.message);
      res.json({ resultados: [], erro: e.message });
    }
  });

  // GET /entregas/enderecos-salvos
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

  // POST /entregas/enderecos-salvos
  router.post('/enderecos-salvos', exigirTenant, exigirPermissao('entregas.criar'), async (req, res, next) => {
    try {
      const { apelido, endereco_completo, lat, lng, bairro, cidade, uf, cep, is_coleta_padrao } = req.body;
      if (!apelido || !endereco_completo) throw AppError.validacao('Apelido e endereço são obrigatórios');
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
        [req.empresaId, apelido.trim(), endereco_completo, lat||null, lng||null, bairro||null, cidade||null, uf||null, cep||null, !!is_coleta_padrao]
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

  // GET /entregas/:id/rota
  router.get('/:id/rota', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT e.coleta_lat, e.coleta_lng, e.coleta_endereco,
                json_agg(json_build_object('lat', ep.lat, 'lng', ep.lng, 'endereco', ep.endereco, 'ordem', ep.ordem) ORDER BY ep.ordem) AS pontos
         FROM entregas e LEFT JOIN entregas_pontos ep ON ep.entrega_id = e.id
         WHERE e.id = $1 AND e.empresa_id = $2 GROUP BY e.id`,
        [req.params.id, req.empresaId]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
      const e = rows[0];
      const coords = [[e.coleta_lng, e.coleta_lat]];
      (e.pontos || []).forEach(p => { if (p.lat && p.lng) coords.push([p.lng, p.lat]); });
      if (coords.length < 2) return res.json({ coords: [], distanciaKm: 0, duracaoMin: 0, coleta: { lat: e.coleta_lat, lng: e.coleta_lng, endereco: e.coleta_endereco }, pontos: e.pontos });
      const { ok, dados } = await httpRequest(`${BASE_ORS}/v2/directions/driving-car/geojson`, {
        metodo: 'POST', headers: { Authorization: process.env.ORS_API_KEY }, corpo: { coordinates: coords },
      });
      if (!ok || !dados?.features?.[0]) return res.json({ coords: [], distanciaKm: 0, duracaoMin: 0, coleta: { lat: e.coleta_lat, lng: e.coleta_lng, endereco: e.coleta_endereco }, pontos: e.pontos });
      const seg = dados.features[0].properties.segments || [];
      const distanciaKm = +(seg.reduce((s, x) => s + (x.distance||0), 0) / 1000).toFixed(1);
      const duracaoMin = Math.round(seg.reduce((s, x) => s + (x.duration||0), 0) / 60);
      const geom = dados.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      res.json({ coords: geom, distanciaKm, duracaoMin, coleta: { lat: e.coleta_lat, lng: e.coleta_lng, endereco: e.coleta_endereco }, pontos: e.pontos });
    } catch (e) { next(e); }
  });

  // POST /entregas/geocode-rota
  router.post('/geocode-rota', exigirTenant, exigirPermissao('entregas.ver'), async (req, res, next) => {
    try {
      const { pontos } = req.body;
      if (!pontos || pontos.length < 2) return res.json({ geom: [], distanciaKm: 0, duracaoMin: 0 });
      const coords = pontos.map(p => [p.lng, p.lat]);
      const { ok, dados } = await httpRequest(`${BASE_ORS}/v2/directions/driving-car/geojson`, {
        metodo: 'POST', headers: { Authorization: process.env.ORS_API_KEY }, corpo: { coordinates: coords },
      });
      if (!ok || !dados?.features?.[0]) return res.json({ geom: [], distanciaKm: 0, duracaoMin: 0 });
      const seg = dados.features[0].properties.segments || [];
      const distanciaKm = +(seg.reduce((s, x) => s + (x.distance||0), 0) / 1000).toFixed(1);
      const duracaoMin = Math.round(seg.reduce((s, x) => s + (x.duration||0), 0) / 60);
      const geom = dados.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      res.json({ geom, distanciaKm, duracaoMin });
    } catch (e) { next(e); }
  });

  return router;
};
