const { initMotoboysRoutes } = require('./motoboys.routes');
const { initMotoboysTables } = require('./motoboys.migration');

module.exports = { initMotoboysRoutes, initMotoboysTables };
