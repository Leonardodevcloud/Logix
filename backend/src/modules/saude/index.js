const { initSaudeRoutes } = require('./saude.routes');
const service = require('./saude.service');
const eventos = require('../../shared/eventos');

function registrarOuvintes() {
  eventos.ouvir('sistema.erro_http', (d) => service.registrarErro(d), { origem: 'saude' });
}

module.exports = { initSaudeRoutes, registrarOuvintes, gravarAmostra: service.gravarAmostra, limparAntigas: service.limparAntigas };
