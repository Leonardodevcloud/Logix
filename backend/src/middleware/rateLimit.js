const rateLimit = require('express-rate-limit');

const limiteGlobal = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const limiteLogin = rateLimit({
  windowMs: 15 * 60_000, max: 10,
  message: { erro: 'Muitas tentativas. Tente novamente mais tarde.', codigo: 'RATE_LIMIT' },
});
// Rastreamento recebe muitos pings; limite mais alto.
const limiteRastreamento = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });

// GPS do app: por MOTOBOY (não por IP — vários motoboys compartilham IP de operadora).
// App envia a cada 15s (~4/min); 12/min dá folga para retentativas sem permitir flood.
const limiteRastreamentoMotoboy = rateLimit({
  windowMs: 60_000, max: 12,
  keyGenerator: (req) => (req.motoboy && req.motoboy.id) ? String(req.motoboy.id) : req.ip,
  standardHeaders: true, legacyHeaders: false,
});

module.exports = { limiteGlobal, limiteLogin, limiteRastreamento, limiteRastreamentoMotoboy };
