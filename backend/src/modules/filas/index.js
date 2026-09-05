const { initFilasTables } = require('./filas.migration');
const { initFilasRoutes } = require('./filas.routes');
const { promoverOndasPendentes, encerrarOfertasOrfas } = require('./filas.service');
module.exports = { initFilasTables, initFilasRoutes, promoverOndasPendentes, encerrarOfertasOrfas };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./filas.service') });
