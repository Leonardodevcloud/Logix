const { initPermissoesTables } = require('./permissoes.migration');
const { initPermissoesRoutes } = require('./permissoes.routes');
module.exports = { initPermissoesTables, initPermissoesRoutes };

// API pública (R1): `service` é um getter LAZY — o módulo só é carregado quando alguém
// acessa, o que evita ciclos de require entre módulos que se referenciam mutuamente.
Object.defineProperty(module.exports, 'service', { enumerable: true, get: () => require('./permissoes.service') });
Object.assign(module.exports, (({ MODULOS }) => ({ MODULOS }))(require('./permissoes.shared')));
