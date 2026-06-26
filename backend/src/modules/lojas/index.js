const { initLojasRoutes } = require('./lojas.routes');
const { initLojasTables } = require('./lojas.migration');

module.exports = { initLojasRoutes, initLojasTables };
