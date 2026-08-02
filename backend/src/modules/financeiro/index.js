const { initFinanceiroRoutes } = require('./financeiro.routes');
const { initFinanceiroTables } = require('./financeiro.migration');

module.exports = { initFinanceiroRoutes, initFinanceiroTables };
