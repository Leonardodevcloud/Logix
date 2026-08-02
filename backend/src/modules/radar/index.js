const { initRadarRoutes } = require('./radar.routes');
const { initRadarTables } = require('./radar.migration');
const { varrerAlertas } = require('./radar.service');

module.exports = { initRadarRoutes, initRadarTables, varrerAlertas };
