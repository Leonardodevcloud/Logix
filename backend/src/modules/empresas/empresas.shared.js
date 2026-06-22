const { httpRequest } = require('../../shared/httpRequest');
const { apenasDigitos } = require('../../shared/validators');

// Busca endereço por CEP (ViaCEP). Retorna null se não encontrado.
async function buscarCep(cep) {
  const limpo = apenasDigitos(cep);
  if (limpo.length !== 8) return null;
  const { ok, dados } = await httpRequest(`https://viacep.com.br/ws/${limpo}/json/`);
  if (!ok || !dados || dados.erro) return null;
  return {
    cep: limpo,
    logradouro: dados.logradouro,
    bairro: dados.bairro,
    cidade: dados.localidade,
    estado: dados.uf,
  };
}

module.exports = { buscarCep };
