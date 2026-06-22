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
// Retorna { ordem: [indices], distanciaKm, duracaoMin }.
async function otimizarRota({ coleta, pontos }) {
  const corpo = {
    jobs: pontos.map((p, i) => ({ id: i + 1, location: [p.lng, p.lat] })),
    vehicles: [{ id: 1, profile: 'driving-car', start: [coleta.lng, coleta.lat] }],
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

module.exports = { geocodificar, otimizarRota };
