// Envio de push notifications para o app do motoboy via Expo Push API.
//
// Por que push REMOTO (e não notificação local): só o push entregue pelo
// servidor mostra alerta + som + vibração com o app FECHADO/em background.
// O WebSocket (realtime/ws.js) continua existindo para o tempo real DENTRO do
// app aberto; o push cobre justamente o caso do celular no bolso.
//
// Tokens ficam em motoboy_push_tokens (1 motoboy pode ter N aparelhos).
// Tokens mortos (DeviceNotRegistered) são removidos automaticamente.

const { query } = require('./db');
const { httpRequest } = require('./httpRequest');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Valida o formato do token da Expo (ExponentPushToken[...] ou ExpoPushToken[...]).
function tokenValido(t) {
  return typeof t === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(t.trim());
}

// Salva/atualiza o token de um aparelho do motoboy (upsert por token).
async function registrarToken({ empresaId, motoboyId, token, plataforma = null }) {
  if (!tokenValido(token)) return { ok: false, motivo: 'token_invalido' };
  await query(
    `INSERT INTO motoboy_push_tokens (empresa_id, motoboy_id, token, plataforma, atualizado_em)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (token) DO UPDATE
        SET motoboy_id = EXCLUDED.motoboy_id,
            empresa_id = EXCLUDED.empresa_id,
            plataforma = EXCLUDED.plataforma,
            atualizado_em = now()`,
    [empresaId, motoboyId, token.trim(), plataforma]
  );
  return { ok: true };
}

// Remove um token específico (logout) ou todos os de um motoboy.
async function removerToken({ token = null, motoboyId = null }) {
  if (token) await query(`DELETE FROM motoboy_push_tokens WHERE token = $1`, [token.trim()]);
  else if (motoboyId) await query(`DELETE FROM motoboy_push_tokens WHERE motoboy_id = $1`, [motoboyId]);
  return { ok: true };
}

// Busca todos os tokens ativos de um motoboy.
async function tokensDoMotoboy(motoboyId) {
  const { rows } = await query(`SELECT token FROM motoboy_push_tokens WHERE motoboy_id = $1`, [motoboyId]);
  return rows.map(r => r.token).filter(tokenValido);
}

// Dispara uma notificação para TODOS os aparelhos de um motoboy.
// Fire-and-forget no chamador: nunca deixe uma falha de push quebrar o fluxo
// principal (sempre chame com .catch(() => {})).
//
// titulo/corpo: texto da notificação.
// dados: payload livre lido pelo app no toque (ex.: { tipo: 'oferta', ofertaId }).
async function notificarMotoboy(motoboyId, { titulo, corpo, dados = {}, som = 'default' }) {
  const tokens = await tokensDoMotoboy(motoboyId);
  if (!tokens.length) return { enviados: 0, motivo: 'sem_token' };

  // Uma mensagem por token. priority high + channelId garantem o pop-up com
  // app fechado no Android. sound 'default' toca + vibra (canal HIGH).
  const mensagens = tokens.map(to => ({
    to,
    title: titulo,
    body: corpo,
    data: dados,
    sound: som,
    priority: 'high',
    channelId: 'corridas',
  }));

  try {
    const resp = await httpRequest(EXPO_PUSH_URL, {
      metodo: 'POST',
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      corpo: mensagens,
      timeoutMs: 10000,
    });

    // A Expo responde { data: [ {status, id|message, details} ] } na mesma ordem.
    const tickets = (resp.dados && resp.dados.data) || [];
    const mortos = [];
    tickets.forEach((tk, i) => {
      if (tk && tk.status === 'error') {
        const cod = tk.details && tk.details.error;
        if (cod === 'DeviceNotRegistered') mortos.push(tokens[i]);
      }
    });
    // Limpa tokens de aparelhos que desinstalaram/revogaram (não bloqueia).
    for (const t of mortos) removerToken({ token: t }).catch(() => {});

    return { enviados: tokens.length - mortos.length, removidos: mortos.length };
  } catch (e) {
    console.error('[push] falha ao enviar:', e.message);
    return { enviados: 0, erro: e.message };
  }
}

module.exports = { registrarToken, removerToken, tokensDoMotoboy, notificarMotoboy, tokenValido };
