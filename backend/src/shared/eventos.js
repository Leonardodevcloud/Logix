// Barramento de eventos de domínio (ver ARQUITETURA.md §5).
//
// Um módulo que CAUSA um fato emite; módulos INTERESSADOS ouvem. O emissor não
// conhece os ouvintes — é isso que permite adicionar score, chat, push, webhooks
// sem tocar em `entregas` ou `filas`, e extrair um módulo depois sem reescrever.
//
//   eventos.emitir('entrega.concluida', { empresaId, entregaId, motoboyId });
//   eventos.ouvir('entrega.concluida', async (dados) => { ... });
//
// Regras:
//  - nome: <agregado>.<fato-no-passado>  (oferta.aceita, entrega.concluida)
//  - payload: ids e dados imutáveis; quem precisa de mais, consulta
//  - handler NUNCA lança para fora (aqui já é blindado e logado)
//  - handler é idempotente (o mesmo evento pode chegar 2x)
//  - hoje é in-process; com Redis Streams a assinatura é a mesma
const { EventEmitter } = require('events');
const log = require('./logger');

const bus = new EventEmitter();
bus.setMaxListeners(100);
const NOME_OK = /^[a-z_]+\.[a-z_]+$/;

function emitir(nome, dados = {}) {
  if (!NOME_OK.test(nome)) throw new Error(`Nome de evento inválido: "${nome}" (use agregado.fato_no_passado)`);
  const evento = { nome, dados, em: new Date().toISOString() };
  // setImmediate: o emissor devolve a resposta HTTP antes dos ouvintes rodarem.
  setImmediate(() => { try { bus.emit(nome, evento); } catch (e) { log.error({ err: e, evento: nome }, 'falha ao emitir evento'); } });
  return evento;
}

function ouvir(nome, handler, { origem = 'desconhecido' } = {}) {
  bus.on(nome, async (evento) => {
    try { await handler(evento.dados, evento); }
    catch (e) { log.error({ err: e, evento: nome, ouvinte: origem }, 'ouvinte de evento falhou'); }
  });
}

// Para testes.
function limpar() { bus.removeAllListeners(); }
function ouvintes(nome) { return bus.listenerCount(nome); }

module.exports = { emitir, ouvir, limpar, ouvintes };
