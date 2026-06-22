// Remove caracteres de controle e faz trim em todas as strings de entrada.
function sanitizar(valor) {
  if (typeof valor === 'string') return valor.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (Array.isArray(valor)) return valor.map(sanitizar);
  if (valor && typeof valor === 'object') {
    for (const k of Object.keys(valor)) valor[k] = sanitizar(valor[k]);
    return valor;
  }
  return valor;
}

function sanitizarEntrada(req, res, next) {
  if (req.body) req.body = sanitizar(req.body);
  if (req.query) sanitizar(req.query);
  next();
}

module.exports = { sanitizar, sanitizarEntrada };
