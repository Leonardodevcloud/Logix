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
      const sala = payload.empresaId || `admin:${payload.id}`;
      ws.sala = sala;
      if (!salas.has(sala)) salas.set(sala, new Set());
      salas.get(sala).add(ws);
      ws.on('close', () => salas.get(sala) && salas.get(sala).delete(ws));
    } catch {
      ws.close(1008, 'token inválido');
    }
  });
  console.log('[ws] WebSocket iniciado em /ws');
}

// Emite um evento para todos os clientes conectados de uma empresa.
function emitirParaEmpresa(empresaId, evento, dados) {
  const sala = salas.get(empresaId);
  if (!sala) return;
  const msg = JSON.stringify({ evento, dados, em: new Date().toISOString() });
  for (const ws of sala) if (ws.readyState === 1) ws.send(msg);
}

module.exports = { iniciarWebSocket, emitirParaEmpresa };
