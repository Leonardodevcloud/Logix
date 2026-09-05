const { initApiUsoTables } = require('./apiuso.migration');
const { initApiUsoRoutes } = require('./apiuso.routes');
module.exports = { initApiUsoTables, initApiUsoRoutes };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./apiuso.service') });
