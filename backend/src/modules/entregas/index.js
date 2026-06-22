const { initEntregasRoutes } = require('./entregas.routes');
const { initEntregasTables } = require('./entregas.migration');

module.exports = { initEntregasRoutes, initEntregasTables };
