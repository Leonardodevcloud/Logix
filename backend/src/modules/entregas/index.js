const { initEntregasRoutes } = require('./entregas.routes');
const { initEntregasTables } = require('./entregas.migration');
const { initEnderecosSalvosTables } = require('./routes/enderecos-salvos.migration');

async function initEntregasTablesAll() {
  await initEntregasTables();
  await initEnderecosSalvosTables();
}

module.exports = { initEntregasRoutes, initEntregasTables: initEntregasTablesAll };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./entregas.service') });
