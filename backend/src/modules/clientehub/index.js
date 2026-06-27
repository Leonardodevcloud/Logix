const { initClienteHubRoutes } = require('./clientehub.routes');
const { initClienteHubTables } = require('./clientehub.migration');

module.exports = { initClienteHubRoutes, initClienteHubTables };
