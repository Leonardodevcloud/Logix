const { initEmpresasRoutes } = require('./empresas.routes');
const { initEmpresasTables } = require('./empresas.migration');

module.exports = { initEmpresasRoutes, initEmpresasTables };
