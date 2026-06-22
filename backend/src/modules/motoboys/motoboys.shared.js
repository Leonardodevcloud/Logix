// Espaço para helpers do módulo de motoboys (ex.: regras de elegibilidade para receber entregas).
function ehElegivel(motoboy) {
  return motoboy && motoboy.status === 'ativo';
}

module.exports = { ehElegivel };
