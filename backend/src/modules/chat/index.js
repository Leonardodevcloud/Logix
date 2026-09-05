const { initChatTables } = require('./chat.migration');
const { initChatRoutes } = require('./chat.routes');
const service = require('./chat.service');
const eventos = require('../../shared/eventos');

// Corrida finalizada → encerra as conversas dela. O chat ouve; entregas não o conhece.
function registrarOuvintes() {
  eventos.ouvir('entrega.concluida', (d) => service.encerrarPorCorrida({ empresaId: d.empresaId, entregaId: d.entregaId }), { origem: 'chat' });
}

module.exports = { initChatTables, initChatRoutes, registrarOuvintes };
