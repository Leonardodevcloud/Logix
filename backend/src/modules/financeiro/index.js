const { initFinanceiroRoutes } = require('./financeiro.routes');
const { initFinanceiroTables } = require('./financeiro.migration');
const service = require('./financeiro.service');

module.exports = { initFinanceiroRoutes, initFinanceiroTables, service };
