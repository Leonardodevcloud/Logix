const { initConfigRoutes } = require('./config.routes');
const { initConfigTables } = require('./config.migration');

module.exports = { initConfigRoutes, initConfigTables };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./config.service') });
