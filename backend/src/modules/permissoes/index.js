const { initPermissoesTables } = require('./permissoes.migration');
const { initPermissoesRoutes } = require('./permissoes.routes');
module.exports = { initPermissoesTables, initPermissoesRoutes };
