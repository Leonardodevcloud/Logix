const { initFinanceiroRoutes } = require('./financeiro.routes');
const { initFinanceiroTables } = require('./financeiro.migration');
const service = require('./financeiro.service');

module.exports = { initFinanceiroRoutes, initFinanceiroTables, service };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./financeiro.service') });
