// Contexto por requisição via AsyncLocalStorage.
// Carrega: empresaId (tenant), reqId (correlação de logs), usuarioId.
// Preenchido pelos middlewares (requestLogger → reqId; tenant/auth → empresaId/usuarioId)
// e lido pelo logger e pelas integrações externas (métricas de API por empresa).
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function comContexto(dados, fn) {
  return als.run({ empresaId: null, rlsEmpresaId: null, reqId: null, usuarioId: null, ...(dados || {}) }, fn);
}

function getContexto() { return als.getStore() || null; }

function setEmpresa(id) { const s = als.getStore(); if (s) s.empresaId = id || null; }
function getEmpresa() { const s = als.getStore(); return s ? (s.empresaId || null) : null; }
function setUsuario(id) { const s = als.getStore(); if (s) s.usuarioId = id || null; }
// Empresa para Row-Level Security. Só perfis PRESOS a uma empresa (central_admin, loja,
// motoboy) definem isto; super_admin é cross-tenant e fica sem (política permissiva).
function setRlsEmpresa(id) { const s = als.getStore(); if (s) s.rlsEmpresaId = id || null; }
function getRlsEmpresa() { const s = als.getStore(); return s ? (s.rlsEmpresaId || null) : null; }
function setReqId(id) { const s = als.getStore(); if (s) s.reqId = id || null; }
function getReqId() { const s = als.getStore(); return s ? (s.reqId || null) : null; }

module.exports = { als, comContexto, getContexto, setEmpresa, getEmpresa, setRlsEmpresa, getRlsEmpresa, setUsuario, setReqId, getReqId };
