const { initUploadsRoutes } = require('./uploads.routes');
const service = require('./uploads.service');
// API pública (R1): rotas de negócio chamam resolverArquivo/urlParaExibir — nunca o storage direto para uploads.
module.exports = {
  initUploadsRoutes,
  resolverArquivo: service.resolverArquivo,
  confirmarChave: service.confirmarChave,
  urlParaExibir: service.urlParaExibir,
};
