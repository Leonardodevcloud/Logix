const { initScoreRoutes } = require('./score.routes');
const { initScoreTables } = require('./score.migration');
module.exports = { initScoreRoutes, initScoreTables };
