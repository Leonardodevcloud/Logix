const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Cacheia a resposta JSON de uma rota por `ttl` segundos.
function cacheRota(ttl = 60) {
  return (req, res, next) => {
    const chave = `rota:${req.originalUrl}`;
    const guardado = cache.get(chave);
    if (guardado) return res.json(guardado);
    const jsonOriginal = res.json.bind(res);
    res.json = (corpo) => { cache.set(chave, corpo, ttl); return jsonOriginal(corpo); };
    next();
  };
}

module.exports = { cache, cacheRota };
