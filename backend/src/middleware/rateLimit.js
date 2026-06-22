const rateLimit = require('express-rate-limit');

const limiteGlobal = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const limiteLogin = rateLimit({
  windowMs: 15 * 60_000, max: 10,
  message: { erro: 'Muitas tentativas. Tente novamente mais tarde.', codigo: 'RATE_LIMIT' },
});
// Rastreamento recebe muitos pings; limite mais alto.
const limiteRastreamento = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });

module.exports = { limiteGlobal, limiteLogin, limiteRastreamento };
