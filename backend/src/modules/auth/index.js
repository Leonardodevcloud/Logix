const { initAuthRoutes } = require('./auth.routes');
const { initAuthTables } = require('./auth.migration');

module.exports = { initAuthRoutes, initAuthTables };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./auth.service') });
Object.assign(module.exports, (({ hashSenha }) => ({ hashSenha }))(require('./auth.shared')));
