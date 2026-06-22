// Validadores simples, sem dependências externas.

function apenasDigitos(v) { return (v || '').toString().replace(/\D/g, ''); }
function ehEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function ehCpf(v) { return apenasDigitos(v).length === 11; }
function ehCnpj(v) { return apenasDigitos(v).length === 14; }

function obrigatorios(obj = {}, campos = []) {
  return campos.filter((c) => obj[c] === undefined || obj[c] === null || obj[c] === '');
}

module.exports = { apenasDigitos, ehEmail, ehCpf, ehCnpj, obrigatorios };
