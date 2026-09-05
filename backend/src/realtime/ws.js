const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const log = require('../shared/logger');
const { redis, redisSub, redisDisponivel } = require('../shared/redis');

// Identidade desta réplica: ao receber do Redis um evento que ela mesma publicou,
// não entrega de novo (já entregou localmente).
const INSTANCIA = crypto.randomBytes(6).toString('hex');
const CANAL = 'lx:ws';
let pubsubAtivo = false;

// Liga o pub/sub. Chamado uma vez no boot, depois de iniciarRedis().
async function iniciarPubSubWebSocket() {
  if (!redisDisponivel()) return false;
  try {
    await redisSub().subscribe(CANAL);
    redisSub().on('message', (canal, texto) => {
      if (canal !== CANAL) return;
      try {
        const m = JSON.parse(texto);
        if (m.origem === INSTANCIA) return;
        if (m.tipo === 'empresa') entregarEmpresa(m.empresaId, m.msg);
        else if (m.tipo === 'motoboy') entregarMotoboy(m.motoboyId, m.msg);
      } catch (e) { log.warn({ err: e }, 'ws pub/sub: mensagem inválida'); }
    });
    pubsubAtivo = true;
    log.info({ instancia: INSTANCIA }, 'ws pub/sub entre réplicas ativo');
    return true;
  } catch (e) {
    log.error({ err: e }, 'ws pub/sub não iniciou — só entrega local');
    return false;
  }
}

function publicar(payload) {
  if (!pubsubAtivo || !redisDisponivel()) return;
  redis().publish(CANAL, JSON.stringify({ ...payload, origem: INSTANCIA })).catch(() => {});
}

let wss = null;
const salas = new Map(); // chaveSala -> Set<ws>

// Cada conexão entra na "sala" da sua empresa (super admin entra em sala própria por id).
function iniciarWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    // Autenticação em duas formas:
    //  1) (preferida) primeira mensagem {"tipo":"auth","token":"..."} — o token não
    //     aparece em URL nem em logs de proxy.
    //  2) (legado) ?token= na URL — mantida para apps/painéis antigos; será removida.
    const url = new URL(req.url, 'http://localhost');
    const tokenUrl = url.searchParams.get('token');
    if (tokenUrl) return autenticar(ws, tokenUrl, 'url');

    const timer = setTimeout(() => { try { ws.close(4001, 'auth timeout'); } catch {} }, 5000);
    ws.once('message', (buf) => {
      clearTimeout(timer);
      try {
        const m = JSON.parse(buf.toString());
        if (m && m.tipo === 'auth' && m.token) return autenticar(ws, m.token, 'mensagem');
      } catch {}
      ws.close(4001, 'auth obrigatória');
    });
  });
  // Heartbeat: fecha conexões mortas (celular sem rede não envia FIN). 30s.
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.vivo === false) { ws.terminate(); continue; }
      ws.vivo = false;
      try { ws.ping(); } catch {}
    }
  }, 30000);
  wss.on('close', () => clearInterval(hb));
  log.info('WebSocket iniciado em /ws');
}

function autenticar(ws, token, via) {
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      ws.vivo = true;
      ws.on('pong', () => { ws.vivo = true; });
      if (via === 'url') log.debug({ perfil: payload.perfil }, 'ws auth via url (legado)');
      // App do motoboy entra em sala própria (motoboy:<id>); demais na sala da empresa.
      const sala = payload.perfil === 'motoboy'
        ? `motoboy:${payload.id}`
        : (payload.empresaId || `admin:${payload.id}`);
      ws.sala = sala;
      if (!salas.has(sala)) salas.set(sala, new Set());
      salas.get(sala).add(ws);
      // Super admin vê todas as empresas — entra também na sala global para
      // receber eventos emitidos via emitirParaEmpresa de qualquer empresa.
      const ehSuper = payload.perfil === 'super_admin';
      if (ehSuper) {
        if (!salas.has('__super__')) salas.set('__super__', new Set());
        salas.get('__super__').add(ws);
      }
      ws.on('close', () => {
        salas.get(sala) && salas.get(sala).delete(ws);
        if (ehSuper) salas.get('__super__') && salas.get('__super__').delete(ws);
      });
      ws.send(JSON.stringify({ evento: 'ws.autenticado', dados: { sala }, em: new Date().toISOString() }));
    } catch {
      ws.close(1008, 'token inválido');
    }
}

// Fecha todas as conexões com código (graceful shutdown). O cliente reconecta na nova réplica.
function encerrarWebSocket(codigo = 1001, motivo = 'reiniciando') {
  if (!wss) return;
  for (const ws of wss.clients) { try { ws.close(codigo, motivo); } catch {} }
  try { wss.close(); } catch {}
}

// Métrica: conexões abertas por tipo de sala.
function estatisticasWebSocket() {
  let motoboys = 0, painel = 0;
  for (const [chave, set] of salas) { if (chave.startsWith('motoboy:')) motoboys += set.size; else if (chave !== '__super__') painel += set.size; }
  return { motoboys, painel, total: wss ? wss.clients.size : 0, pubsub: pubsubAtivo, instancia: INSTANCIA };
}

// Emite um evento para todos os clientes conectados de uma empresa.
// Também alcança os super admins (sala global), que veem todas as empresas.
function entregarSala(chave, msg) {
  const sala = salas.get(chave);
  if (!sala) return;
  for (const ws of sala) if (ws.readyState === 1) ws.send(msg);
}
function entregarEmpresa(empresaId, msg) {
  entregarSala(empresaId, msg);
  if (empresaId !== '__super__') entregarSala('__super__', msg);
}
function entregarMotoboy(motoboyId, msg) { entregarSala(`motoboy:${motoboyId}`, msg); }

function emitirParaEmpresa(empresaId, evento, dados) {
  const msg = JSON.stringify({ evento, dados, em: new Date().toISOString() });
  entregarEmpresa(empresaId, msg);                       // conexões desta réplica
  publicar({ tipo: 'empresa', empresaId, msg });          // conexões das outras
}

// Emite um evento para o app de um motoboy específico.
function emitirParaMotoboy(motoboyId, evento, dados) {
  const msg = JSON.stringify({ evento, dados, em: new Date().toISOString() });
  entregarMotoboy(motoboyId, msg);
  publicar({ tipo: 'motoboy', motoboyId, msg });
}

module.exports = { iniciarWebSocket, iniciarPubSubWebSocket, emitirParaEmpresa, emitirParaMotoboy, encerrarWebSocket, estatisticasWebSocket };
