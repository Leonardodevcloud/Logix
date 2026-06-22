const crypto = require('crypto');
const AppError = require('../shared/AppError');

// Double-submit cookie: emite um token legível e exige o mesmo valor no header X-CSRF-Token
// nas mutações feitas por sessão de cookie (Bearer/API é isento).
function emitirCsrf(req, res, next) {
  let token = req.cookies && req.cookies.lx_csrf;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('lx_csrf', token, { sameSite: 'strict', secure: true, path: '/' });
  }
  res.locals.csrf = token;
  next();
}

function verificarCsrf(req, res, next) {
  const usaCookie = req.cookies && req.cookies.lx_access;
  if (!usaCookie) return next(); // requisições por Bearer não usam CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieToken = req.cookies.lx_csrf;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || cookieToken !== headerToken) return next(AppError.proibido('Token CSRF inválido'));
  next();
}

module.exports = { emitirCsrf, verificarCsrf };
