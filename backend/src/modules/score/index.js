const { initScoreRoutes } = require('./score.routes');
const { initScoreTables } = require('./score.migration');
const service = require('./score.service');
const eventos = require('../../shared/eventos');

// O score REAGE a fatos do domínio — filas/entregas não sabem que ele existe.
// Cada handler é idempotente no service (o mesmo refId não pontua duas vezes).
function registrarOuvintes() {
  eventos.ouvir('oferta.aceita', (d) => service.registrarEvento({ empresaId: d.empresaId, motoboyId: d.motoboyId, tipo: 'aceitar_oferta', refId: d.ofertaId }), { origem: 'score' });
  eventos.ouvir('oferta.recusada', (d) => service.registrarEvento({ empresaId: d.empresaId, motoboyId: d.motoboyId, tipo: 'recusar_oferta', refId: d.ofertaId }), { origem: 'score' });
  eventos.ouvir('entrega.ponto_concluido', (d) => service.registrarEventosConclusao({
    empresaId: d.empresaId, motoboyId: d.motoboyId, entregaId: d.entregaId, refId: d.pontoId,
    insucesso: !!d.insucesso, temFoto: !!d.temFoto,
  }), { origem: 'score' });
}

module.exports = {
  initScoreRoutes, initScoreTables, registrarOuvintes,
  // API pública para outros módulos (R1): só o que está aqui pode ser importado.
  niveisDeMotoboys: service.niveisDeMotoboys,
};
