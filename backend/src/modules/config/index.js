const { initConfigRoutes } = require('./config.routes');
const { initConfigTables } = require('./config.migration');

module.exports = { initConfigRoutes, initConfigTables };
