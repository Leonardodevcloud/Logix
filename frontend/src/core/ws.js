// Cliente WebSocket com reconexão simples. Eventos do backend: entrega.criada, motoboy.posicao, etc.
let sock = null;

export function conectar(token, aoEvento) {
  const base = window.LOGIX_WS || (location.origin.replace(/^http/, 'ws') + '/ws');
  sock = new WebSocket(base + '?token=' + encodeURIComponent(token));
  sock.onmessage = (e) => { try { aoEvento(JSON.parse(e.data)); } catch { /* ignora */ } };
  sock.onclose = () => { if (token) setTimeout(() => conectar(token, aoEvento), 3000); };
  return sock;
}
export function fechar() { if (sock) { sock.onclose = null; sock.close(); sock = null; } }
