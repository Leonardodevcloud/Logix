const crypto = require('crypto');
const AppError = require('../shared/AppError');

// Assina (e valida) o corpo de webhooks com HMAC-SHA256.
function assinarWebhook(corpo, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(corpo).digest('hex');
}

function verificarAssinaturaWebhook(secret) {
  return (req, res, next) => {
    const assinatura = req.headers['x-lx-signature'];
    const corpoBruto = req.rawBody || JSON.stringify(req.body || {});
    if (!assinatura || assinatura !== assinarWebhook(corpoBruto, secret)) {
      return next(AppError.naoAutorizado('Assinatura de webhook inválida'));
    }
    next();
  };
}

module.exports = { assinarWebhook, verificarAssinaturaWebhook };
