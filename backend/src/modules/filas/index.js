const { initFilasTables } = require('./filas.migration');
const { initFilasRoutes } = require('./filas.routes');
const { promoverOndasPendentes } = require('./filas.service');
module.exports = { initFilasTables, initFilasRoutes, promoverOndasPendentes };
