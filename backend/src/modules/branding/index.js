const { initBrandingRoutes } = require('./branding.routes');
const { initBrandingTables } = require('./branding.migration');

const { resolverEmpresaPorHost } = require('./branding.service');
module.exports = { resolverEmpresaPorHost, initBrandingRoutes, initBrandingTables };
