const { httpRequest } = require('../shared/httpRequest');

// Consulta de CEP com fallback. Tenta BrasilAPI v2 (que pode trazer lat/lng),
// e cai para ViaCEP se falhar. Retorna formato unificado.
async function consultarCep(cepRaw) {
  const cep = String(cepRaw || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  // 1) BrasilAPI v2 — às vezes inclui coordenadas.
  try {
    const { ok, dados } = await httpRequest(`https://brasilapi.com.br/api/cep/v2/${cep}`, { timeoutMs: 6000 });
    if (ok && dados && dados.cep) {
      const coord = dados.location && dados.location.coordinates ? dados.location.coordinates : null;
      return {
        cep,
        logradouro: dados.street || '',
        bairro: dados.neighborhood || '',
        cidade: dados.city || '',
        uf: dados.state || '',
        lat: coord && coord.latitude ? Number(coord.latitude) : null,
        lng: coord && coord.longitude ? Number(coord.longitude) : null,
        fonte: 'brasilapi',
      };
    }
  } catch { /* tenta o próximo */ }

  // 2) ViaCEP — só endereço textual, sem coordenadas.
  try {
    const { ok, dados } = await httpRequest(`https://viacep.com.br/ws/${cep}/json/`, { timeoutMs: 6000 });
    if (ok && dados && !dados.erro && dados.cep) {
      return {
        cep,
        logradouro: dados.logradouro || '',
        bairro: dados.bairro || '',
        cidade: dados.localidade || '',
        uf: dados.uf || '',
        lat: null,
        lng: null,
        fonte: 'viacep',
      };
    }
  } catch { /* sem resultado */ }

  return null;
}

module.exports = { consultarCep };
