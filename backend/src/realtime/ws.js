const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

let wss = null;
const salas = new Map(); // chaveSala -> Set<ws>

// Cada conexão entra na "sala" da sua empresa (super admin entra em sala própria por id).
function iniciarWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const payload = jwt.verify(url.searchParams.get('token'), process.env.JWT_ACCESS_SECRET);
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
    } catch {
      ws.close(1008, 'token inválido');
    }
  });
  console.log('[ws] WebSocket iniciado em /ws');
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

module.exports = { iniciarWebSocket, emitirParaEmpresa, emitirParaMotoboy };
