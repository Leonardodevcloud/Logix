const { httpRequest } = require('../shared/httpRequest');
const AppError = require('../shared/AppError');
const cache = require('../shared/cache');
// Contador de uso de API (fire-and-forget). require tolerante p/ não afetar boot/ordem.
let contar = () => {};
try { contar = require('../modules/apiuso/apiuso.service').contar; } catch (_) {}

const BASE = process.env.ORS_BASE || 'https://api.heigit.org/openrouteservice';
// Cache curto da otimização: a ordem das paradas é estável para o mesmo conjunto
// de pontos, então evita repetir a chamada (lenta) ao ORS a cada poll do app.
const TTL_ROTA_SEG = 120;

// Geocodifica um endereço -> { lat, lng }.
async function geocodificar(endereco) {
  const url = `${BASE}/geocode/search?api_key=${process.env.ORS_API_KEY}`
    + `&text=${encodeURIComponent(endereco)}&boundary.country=BR&size=1`;
  contar('ors', 'geocoding', false);
  const { ok, dados } = await httpRequest(url);
  if (!ok || !dados || !dados.features || !dados.features.length) {
    throw AppError.validacao(`Não foi possível localizar o endereço: ${endereco}`);
  }
  const [lng, lat] = dados.features[0].geometry.coordinates;
  return { lat, lng };
}

// Calcula a sequência ótima de paradas a partir da coleta (endpoint /optimization, base VROOM).
// retornar=true fecha o ciclo (veículo volta à coleta), o que evita rotas que terminam longe.
// Retorna { ordem: [indices], distanciaKm, duracaoMin }.
async function otimizarRota({ coleta, pontos, retornar = false }) {
  // Chave do cache: coleta + pontos (arredondados) + retornar. Mesmos pontos => mesma ordem.
  const r5 = (n) => Math.round(Number(n) * 1e5) / 1e5;
  const chave = JSON.stringify({
    c: [r5(coleta.lng), r5(coleta.lat)],
    p: pontos.map((p) => [r5(p.lng), r5(p.lat)]),
    r: !!retornar,
  });
  const emCache = await cache.obter('ors:opt:' + chave);
  if (emCache) { contar('ors', 'optimization', true); return emCache; }
  contar('ors', 'optimization', false);
  const vehicle = { id: 1, profile: 'driving-car', start: [coleta.lng, coleta.lat] };
  if (retornar) vehicle.end = [coleta.lng, coleta.lat];
  const corpo = {
    jobs: pontos.map((p, i) => ({ id: i + 1, location: [p.lng, p.lat] })),
    vehicles: [vehicle],
  };
  const { ok, dados } = await httpRequest(`${BASE}/optimization`, {
    metodo: 'POST',
    headers: { Authorization: process.env.ORS_API_KEY },
    corpo,
  });
  if (!ok || !dados || !dados.routes || !dados.routes.length) {
    throw new AppError('Falha ao otimizar rota', 502, 'ORS_ERRO');
  }
  const rota = dados.routes[0];
  const ordem = rota.steps.filter((s) => s.type === 'job').map((s) => s.job - 1);
  const resultado = {
    ordem,
    distanciaKm: Number((rota.distance / 1000).toFixed(2)),
    duracaoMin: Math.round(rota.duration / 60),
  };
  await cache.guardar('ors:opt:' + chave, resultado, TTL_ROTA_SEG);
  return resultado;
}

// Traça a rota real pelas ruas entre uma sequência de pontos [{lat,lng}, ...].
// Retorna a geometria como lista de [lat, lng] para desenhar no mapa, + distância/duração.
async function tracarRota(pontos) {
  if (!Array.isArray(pontos) || pontos.length < 2) return { coordenadas: [], distanciaKm: 0, duracaoMin: 0 };
  const corpo = { coordinates: pontos.map((p) => [p.lng, p.lat]) };
  contar('ors', 'directions', false);
  const { ok, dados } = await httpRequest(`${BASE}/v2/directions/driving-car/geojson`, {
    metodo: 'POST',
    headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' },
    corpo,
  });
  if (!ok || !dados || !dados.features || !dados.features.length) {
    return { coordenadas: [], distanciaKm: 0, duracaoMin: 0 };
  }
  const feat = dados.features[0];
  // GeoJSON vem em [lng, lat]; convertemos para [lat, lng] (formato do Leaflet).
  const coordenadas = (feat.geometry.coordinates || []).map(([lng, lat]) => [lat, lng]);
  const resumo = feat.properties && feat.properties.summary ? feat.properties.summary : {};
  return {
    coordenadas,
    distanciaKm: resumo.distance ? Number((resumo.distance / 1000).toFixed(2)) : 0,
    duracaoMin: resumo.duration ? Math.round(resumo.duration / 60) : 0,
  };
}

module.exports = { geocodificar, otimizarRota, tracarRota };
