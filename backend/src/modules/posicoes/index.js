// API pública do módulo posicoes (GPS). Outros módulos importam SÓ daqui.
// Não tem rotas próprias: o app envia GPS por /motoboys/app/posicao(es), que chama registrar().
const service = require('./posicoes.service');
module.exports = {
  registrarPosicoes: service.registrar,
  ultimaPosicao: service.ultima,
  ultimasPosicoes: service.ultimas,
  trajetoDaEntrega: service.trajetoDaEntrega,
  historicoRecente: service.historicoRecente,
  manterParticoes: service.manterParticoes,
};
