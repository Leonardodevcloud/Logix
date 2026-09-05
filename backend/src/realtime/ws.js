const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const log = require('../shared/logger');

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
  return { motoboys, painel, total: wss ? wss.clients.size : 0 };
}

// Emite um evento para todos os clientes conectados de uma empresa.
// Também alcança os super admins (sala global), que veem todas as empresas.
function emitirParaEmpresa(empresaId, evento, dados) {
  const msg = JSON.stringify({ evento, dados, em: new Date().toISOString() });
  const entregar = (chave) => {
    const sala = salas.get(chave);
    if (!sala) return;
    for (const ws of sala) if (ws.readyState === 1) ws.send(msg);
  };
  entregar(empresaId);
  if (empresaId !== '__super__') entregar('__super__');
}

// Emite um evento para o app de um motoboy específico.
function emitirParaMotoboy(motoboyId, evento, dados) {
  const sala = salas.get(`motoboy:${motoboyId}`);
  if (!sala) return;
  const msg = JSON.stringify({ evento, dados, em: new Date().toISOString() });
  for (const ws of sala) if (ws.readyState === 1) ws.send(msg);
}

module.exports = { iniciarWebSocket, emitirParaEmpresa, emitirParaMotoboy, encerrarWebSocket, estatisticasWebSocket };
