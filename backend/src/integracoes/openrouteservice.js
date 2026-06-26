const { httpRequest } = require('../shared/httpRequest');
const AppError = require('../shared/AppError');

const BASE = 'https://api.openrouteservice.org';

// Geocodifica um endereço -> { lat, lng }.
async function geocodificar(endereco) {
  const url = `${BASE}/geocode/search?api_key=${process.env.ORS_API_KEY}`
    + `&text=${encodeURIComponent(endereco)}&boundary.country=BR&size=1`;
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
  return {
    ordem,
    distanciaKm: Number((rota.distance / 1000).toFixed(2)),
    duracaoMin: Math.round(rota.duration / 60),
  };
}

// Traça a rota real pelas ruas entre uma sequência de pontos [{lat,lng}, ...].
// Retorna a geometria como lista de [lat, lng] para desenhar no mapa, + distância/duração.
async function tracarRota(pontos) {
  if (!Array.isArray(pontos) || pontos.length < 2) return { coordenadas: [], distanciaKm: 0, duracaoMin: 0 };
  const corpo = { coordinates: pontos.map((p) => [p.lng, p.lat]) };
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
