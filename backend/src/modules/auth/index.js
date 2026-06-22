const { initAuthRoutes } = require('./auth.routes');
const { initAuthTables } = require('./auth.migration');

module.exports = { initAuthRoutes, initAuthTables };
