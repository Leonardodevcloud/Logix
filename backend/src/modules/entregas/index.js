const { initEntregasRoutes } = require('./entregas.routes');
const { initEntregasTables } = require('./entregas.migration');
const { initEnderecosSalvosTables } = require('./routes/enderecos-salvos.migration');

async function initEntregasTablesAll() {
  await initEntregasTables();
  await initEnderecosSalvosTables();
}

module.exports = { initEntregasRoutes, initEntregasTables: initEntregasTablesAll };
