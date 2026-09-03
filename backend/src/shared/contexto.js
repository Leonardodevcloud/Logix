// Contexto por requisição via AsyncLocalStorage.
// Serve para o empresa_id (tenant) "seguir" a requisição até as integrações
// externas (ORS/Google), sem precisar passar o id por todas as assinaturas.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// Executa fn dentro de um novo contexto (chamado pelo middleware, 1x por request).
function comContexto(dados, fn) {
  return als.run({ empresaId: null, ...(dados || {}) }, fn);
}

// Define o empresa_id do contexto atual (chamado quando o tenant é resolvido).
function setEmpresa(id) {
  const s = als.getStore();
  if (s) s.empresaId = id || null;
}

// Lê o empresa_id do contexto atual (chamado dentro das integrações).
function getEmpresa() {
  const s = als.getStore();
  return s ? (s.empresaId || null) : null;
}

module.exports = { als, comContexto, setEmpresa, getEmpresa };
