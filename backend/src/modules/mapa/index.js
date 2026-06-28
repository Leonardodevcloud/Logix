const mapaRoutes = require('./mapa.routes');
const { initMapaTables } = require('./mapa.migration');

module.exports = {
  initMapaRoutes: mapaRoutes,
  initMapaTables,
};
