// Cliente WebSocket com reconexão (backoff) e autenticação por MENSAGEM.
// O token não vai mais na URL (aparecia em logs de proxy). Fluxo:
//   conectar → open → envia {tipo:'auth', token} → servidor responde 'ws.autenticado'.
// Eventos do backend: entrega.criada, motoboy.posicao, etc.
let sock = null;
let tentativas = 0;

export function conectar(token, aoEvento) {
  const base = window.LOGIX_WS || (location.origin.replace(/^http/, 'ws') + '/ws');
  sock = new WebSocket(base);
  sock.onopen = () => { tentativas = 0; try { sock.send(JSON.stringify({ tipo: 'auth', token })); } catch { /* ignora */ } };
  sock.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.evento === 'ws.autenticado') return; // handshake — não repassa
      aoEvento(msg);
    } catch { /* ignora */ }
  };
  sock.onclose = (ev) => {
    // 1008 = token inválido/expirado: não adianta reconectar com o mesmo token —
    // quem chama deve renovar a sessão e chamar conectar() de novo.
    if (!token || ev.code === 1008 || ev.code === 4001) return;
    const espera = Math.min(30000, 1000 * 2 ** Math.min(tentativas++, 5)); // 1s,2s,4s…30s
    setTimeout(() => conectar(token, aoEvento), espera);
  };
  return sock;
}
export function fechar() { if (sock) { sock.onclose = null; sock.close(); sock = null; } }
