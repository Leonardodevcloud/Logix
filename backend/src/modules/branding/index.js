const { initBrandingRoutes } = require('./branding.routes');
const { initBrandingTables } = require('./branding.migration');

const { resolverEmpresaPorHost } = require('./branding.service');
module.exports = { resolverEmpresaPorHost, initBrandingRoutes, initBrandingTables };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./branding.service') });
