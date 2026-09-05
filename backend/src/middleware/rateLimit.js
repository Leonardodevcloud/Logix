const rateLimit = require('express-rate-limit');
const { redis, redisDisponivel } = require('../shared/redis');

// Fábrica: cria um limitador que usa Redis quando disponível (contadores
// compartilhados entre réplicas) e memória caso contrário. O store é resolvido
// na PRIMEIRA requisição (o Redis conecta depois do require dos módulos).
function criarLimite(opcoes) {
  let limitador = null;
  let usandoRedis = false;
  const montar = () => {
    const base = {
      standardHeaders: true, legacyHeaders: false,
      // O limitador é criado na 1ª requisição DE PROPÓSITO (o Redis conecta depois do
      // require dos módulos). Desliga só a validação que reclama disso.
      validate: { creationStack: false },
      ...opcoes,
    };
    if (redisDisponivel()) {
      try {
        const { RedisStore } = require('rate-limit-redis');
        base.store = new RedisStore({
          sendCommand: (...args) => redis().call(...args),
          prefix: `lx:rl:${opcoes.nome || 'geral'}:`,
        });
        usandoRedis = true;
      } catch { usandoRedis = false; }
    }
    delete base.nome;
    return rateLimit(base);
  };
  return (req, res, next) => {
    // Se o Redis ficou disponível depois (ou caiu), remonta o limitador.
    if (!limitador || usandoRedis !== redisDisponivel()) limitador = montar();
    return limitador(req, res, next);
  };
}

const limiteGlobal = criarLimite({ nome: 'global', windowMs: 60_000, max: 120 });
const limiteLogin = criarLimite({
  nome: 'login', windowMs: 15 * 60_000, max: 10,
  message: { erro: 'Muitas tentativas. Tente novamente mais tarde.', codigo: 'RATE_LIMIT' },
});
// Rastreamento recebe muitos pings; limite mais alto.
const limiteRastreamento = criarLimite({ nome: 'rastreio', windowMs: 60_000, max: 240 });
// Chat: anti-spam no envio de mensagens (por IP/sessão).
const limiteChat = criarLimite({ nome: 'chat', windowMs: 10_000, max: 20, message: { erro: 'Você está enviando muito rápido. Aguarde um instante.' } });

// GPS do app: por MOTOBOY (não por IP — vários motoboys compartilham IP de operadora).
// App envia a cada 15s (~4/min); 12/min dá folga para retentativas sem permitir flood.
const limiteRastreamentoMotoboy = criarLimite({
  nome: 'gps', windowMs: 60_000, max: 12,
  keyGenerator: (req) => (req.motoboy && req.motoboy.id) ? String(req.motoboy.id) : req.ip,
});

module.exports = { criarLimite, limiteGlobal, limiteLogin, limiteRastreamento, limiteRastreamentoMotoboy, limiteChat };
