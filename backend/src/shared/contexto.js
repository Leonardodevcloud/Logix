// Contexto por requisição via AsyncLocalStorage.
// Carrega: empresaId (tenant), reqId (correlação de logs), usuarioId.
// Preenchido pelos middlewares (requestLogger → reqId; tenant/auth → empresaId/usuarioId)
// e lido pelo logger e pelas integrações externas (métricas de API por empresa).
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function comContexto(dados, fn) {
  return als.run({ empresaId: null, reqId: null, usuarioId: null, ...(dados || {}) }, fn);
}

function getContexto() { return als.getStore() || null; }

function setEmpresa(id) { const s = als.getStore(); if (s) s.empresaId = id || null; }
function getEmpresa() { const s = als.getStore(); return s ? (s.empresaId || null) : null; }
function setUsuario(id) { const s = als.getStore(); if (s) s.usuarioId = id || null; }
function setReqId(id) { const s = als.getStore(); if (s) s.reqId = id || null; }
function getReqId() { const s = als.getStore(); return s ? (s.reqId || null) : null; }

module.exports = { als, comContexto, getContexto, setEmpresa, getEmpresa, setUsuario, setReqId, getReqId };
