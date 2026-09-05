// Error tracking (Sentry) — opcional: só liga se SENTRY_DSN estiver definido.
// Mantém a dependência isolada aqui para o resto do código não conhecer o Sentry.
let Sentry = null;

function iniciarObservabilidade() {
  if (!process.env.SENTRY_DSN) return false;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES || 0), // 0 = só erros
    });
    return true;
  } catch (e) {
    Sentry = null;
    return false;
  }
}

function capturarErro(err, extra = {}) {
  if (!Sentry) return;
  try { Sentry.withScope((s) => { Object.entries(extra).forEach(([k, v]) => s.setTag(k, String(v))); Sentry.captureException(err); }); } catch { /* nunca quebra o fluxo */ }
}

async function encerrarObservabilidade() {
  if (!Sentry) return;
  try { await Sentry.close(2000); } catch { /* ignora */ }
}

module.exports = { iniciarObservabilidade, capturarErro, encerrarObservabilidade };
