const { initBrandingRoutes } = require('./branding.routes');
const { initBrandingTables } = require('./branding.migration');

module.exports = { initBrandingRoutes, initBrandingTables };
