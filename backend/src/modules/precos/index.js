const { initPrecosRoutes } = require('./precos.routes');
const { initPrecosTables } = require('./precos.migration');
const service = require('./precos.service');

module.exports = { initPrecosRoutes, initPrecosTables, service };
