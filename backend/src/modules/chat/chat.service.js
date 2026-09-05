const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const storage = require('../../shared/storage');
let emitirParaEmpresa = () => {}, emitirParaMotoboy = () => {};
try { const ws = require('../../realtime/ws'); emitirParaEmpresa = ws.emitirParaEmpresa; emitirParaMotoboy = ws.emitirParaMotoboy; } catch {}
let notificarMotoboy = async () => {};
try { notificarMotoboy = require('../../shared/push').notificarMotoboy; } catch {}
let empresaTemModulo = async () => true;
try { empresaTemModulo = require('../permissoes/permissoes.service').empresaTemModulo; } catch {}

async function chatAtivo(empresaId) { try { return await empresaTemModulo(empresaId, 'chat'); } catch { return false; } }

// Chat DIRETO com a loja está ativo para (loja, centro)? empresa tem chat E loja
// ligada E o centro resolve (override do centro, senão herda a loja).
async function chatDaLojaAtivo({ empresaId, lojaId, centroId }) {
  if (!lojaId) return false;
  if (!(await chatAtivo(empresaId))) return false;
  const { rows: rl } = await query(`SELECT ativo FROM chat_loja WHERE loja_id = $1 AND empresa_id = $2`, [lojaId, empresaId]);
  const lojaOn = rl[0] ? !!rl[0].ativo : false; // opt-in: sem linha = desligada
  if (!lojaOn) return false;
  if (centroId) {
    const { rows: rc } = await query(`SELECT ativo FROM chat_centro WHERE centro_id = $1 AND empresa_id = $2`, [centroId, empresaId]);
    if (rc[0]) return !!rc[0].ativo; // override do centro
  }
  return true; // herda a loja (ligada)
}

// ── Config (central): lojas e centros do "chat direto" ──
async function lojasChatConfig({ empresaId }) {
  const { rows } = await query(
    `SELECT l.id, l.nome_fantasia AS nome, COALESCE(cl.ativo, false) AS ativo,
            (SELECT count(*)::int FROM cliente_centros_custo c WHERE c.loja_id = l.id) AS centros,
            (SELECT count(*)::int FROM chat_centro cc JOIN cliente_centros_custo c ON c.id = cc.centro_id WHERE c.loja_id = l.id) AS forcados
       FROM lojas l LEFT JOIN chat_loja cl ON cl.loja_id = l.id
      WHERE l.empresa_id = $1 ORDER BY l.nome_fantasia`,
    [empresaId]
  );
  return { lojas: rows };
}
async function centrosChatConfig({ empresaId, lojaId }) {
  const { rows } = await query(
    `SELECT c.id, c.nome, cc.ativo AS forcado   -- null = herda a loja
       FROM cliente_centros_custo c LEFT JOIN chat_centro cc ON cc.centro_id = c.id
      WHERE c.loja_id = $1 ORDER BY c.nome`,
    [lojaId]
  );
  return { centros: rows.map(r => ({ id: r.id, nome: r.nome, estado: r.forcado == null ? 'herda' : (r.forcado ? 'ligado' : 'desligado') })) };
}
async function definirChatLoja({ empresaId, lojaId, ativo }) {
  await query(
    `INSERT INTO chat_loja (loja_id, empresa_id, ativo) VALUES ($1,$2,$3)
     ON CONFLICT (loja_id) DO UPDATE SET ativo = $3`,
    [lojaId, empresaId, !!ativo]
  );
  return { ok: true };
}
async function definirChatCentro({ empresaId, centroId, estado }) {
  if (estado === 'herda') { await query(`DELETE FROM chat_centro WHERE centro_id = $1 AND empresa_id = $2`, [centroId, empresaId]); return { ok: true }; }
  await query(
    `INSERT INTO chat_centro (centro_id, empresa_id, ativo) VALUES ($1,$2,$3)
     ON CONFLICT (centro_id) DO UPDATE SET ativo = $3`,
    [centroId, empresaId, estado === 'ligado']
  );
  return { ok: true };
}

function previa(tipo, texto) {
  if (tipo === 'foto') return 'Foto';
  if (tipo === 'local') return 'Localização';
  return String(texto || '').slice(0, 80);
}

// Conta não lidas de uma conversa para um lado (mensagens de OUTROS depois da leitura).
const SQL_NAO_LIDAS = (aliasConv, ladoParam) => `
  (SELECT count(*)::int FROM chat_mensagens m
     WHERE m.conversa_id = ${aliasConv}.id AND m.autor_tipo <> ${ladoParam}
       AND m.criado_em > COALESCE((SELECT lido_em FROM chat_leituras l WHERE l.conversa_id = ${aliasConv}.id AND l.lado = ${ladoParam}), 'epoch'::timestamptz))`;

async function marcarLida({ conversaId, lado }) {
  await query(
    `INSERT INTO chat_leituras (conversa_id, lado, lido_em) VALUES ($1,$2,now())
     ON CONFLICT (conversa_id, lado) DO UPDATE SET lido_em = now()`,
    [conversaId, lado]
  );
}

// ── App: abre (ou cria) a conversa de uma corrida ──
async function abrirConversaApp({ empresaId, motoboyId, entregaId, tipo }) {
  if (!['suporte', 'solicitante'].includes(tipo)) throw AppError.validacao('Tipo inválido');
  const { rows: e } = await query(
    `SELECT id, protocolo, motoboy_id, loja_id, centro_custo_id FROM entregas WHERE id = $1 AND empresa_id = $2`,
    [entregaId, empresaId]
  );
  if (!e[0]) throw AppError.naoEncontrado('Corrida não encontrada');
  if (e[0].motoboy_id && String(e[0].motoboy_id) !== String(motoboyId)) throw AppError.proibido('Esta corrida não é sua');
  const lojaId = tipo === 'solicitante' ? (e[0].loja_id || null) : null;
  if (tipo === 'solicitante') {
    if (!lojaId) throw AppError.validacao('Esta corrida não tem loja solicitante.');
    if (!(await chatDaLojaAtivo({ empresaId, lojaId, centroId: e[0].centro_custo_id }))) {
      throw AppError.proibido('A loja desta corrida não tem chat direto habilitado.');
    }
  }

  const { rows } = await query(
    `INSERT INTO chat_conversas (empresa_id, entrega_id, tipo, motoboy_id, loja_id, protocolo)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (entrega_id, tipo) DO UPDATE SET motoboy_id = COALESCE(chat_conversas.motoboy_id, $4)
     RETURNING id`,
    [empresaId, entregaId, tipo, motoboyId, lojaId, e[0].protocolo]
  );
  // Loja disponível para chat direto nesta corrida? (para o app mostrar/ocultar o segmento "Loja")
  let lojaDisponivel = false;
  try { lojaDisponivel = e[0].loja_id ? await chatDaLojaAtivo({ empresaId, lojaId: e[0].loja_id, centroId: e[0].centro_custo_id }) : false; } catch {}
  return { conversa_id: rows[0].id, tipo, protocolo: e[0].protocolo, loja_disponivel: lojaDisponivel };
}

// ── Loja: abre (ou cria) a conversa 'solicitante' de uma corrida dela ──
async function abrirConversaLoja({ empresaId, lojaId, entregaId }) {
  const { rows: e } = await query(
    `SELECT id, protocolo, motoboy_id, loja_id FROM entregas WHERE id = $1 AND empresa_id = $2`,
    [entregaId, empresaId]
  );
  if (!e[0]) throw AppError.naoEncontrado('Corrida não encontrada');
  if (String(e[0].loja_id) !== String(lojaId)) throw AppError.proibido('Esta corrida não é da sua loja');
  const { rows } = await query(
    `INSERT INTO chat_conversas (empresa_id, entrega_id, tipo, motoboy_id, loja_id, protocolo)
     VALUES ($1,$2,'solicitante',$3,$4,$5)
     ON CONFLICT (entrega_id, tipo) DO UPDATE SET loja_id = $4
     RETURNING id`,
    [empresaId, entregaId, e[0].motoboy_id || null, lojaId, e[0].protocolo]
  );
  return { conversa_id: rows[0].id, tipo: 'solicitante', protocolo: e[0].protocolo };
}

async function _conversa(empresaId, conversaId) {
  const { rows } = await query(`SELECT * FROM chat_conversas WHERE id = $1 AND empresa_id = $2`, [conversaId, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Conversa não encontrada');
  return rows[0];
}

// ── Envia mensagem (autorTipo: motoboy|central|loja) ──
async function enviar({ empresaId, conversaId, autorTipo, autorId, autorNome, tipo = 'texto', texto, arquivo, lat, lng }) {
  const conv = await _conversa(empresaId, conversaId);
  if (conv.status === 'encerrada' && tipo !== 'sistema') throw AppError.validacao('Esta conversa foi encerrada.');
  // Atendente (central/loja): só o DONO responde. O motoboy sempre pode escrever.
  if ((autorTipo === 'central' || autorTipo === 'loja')) {
    if (!conv.atendente_id) throw AppError.validacao('Assuma o atendimento para responder.');
    if (String(conv.atendente_id) !== String(autorId)) throw AppError.proibido('Este atendimento está com ' + (conv.atendente_nome || 'outro atendente') + '. Puxe o atendimento para responder.');
  }
  let midiaKey = null;
  if (tipo === 'foto') {
    if (!arquivo) throw AppError.validacao('Envie a foto');
    if (String(arquivo).length > 11 * 1024 * 1024) throw AppError.validacao('Foto muito grande (máx ~8MB).');
    // `arquivo` = storage_key (upload direto) ou data URI base64 (legado).
    const up = await require('../uploads').resolverArquivo({ empresaId, motoboyId: conv.motoboy_id || empresaId, finalidade: 'chat', entrada: arquivo });
    midiaKey = up.key;
  } else if (tipo === 'local') {
    if (lat == null || lng == null) throw AppError.validacao('Localização inválida');
  } else if (tipo === 'sistema') {
    // nota do sistema — sem validação de texto do usuário
  } else {
    if (!String(texto || '').trim()) throw AppError.validacao('Mensagem vazia');
    tipo = 'texto';
  }
  const { rows } = await query(
    `INSERT INTO chat_mensagens (conversa_id, empresa_id, autor_tipo, autor_id, autor_nome, tipo, texto, midia_key, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, criado_em`,
    [conversaId, empresaId, autorTipo, autorId || null, autorNome || null, tipo, (tipo === 'texto' || tipo === 'sistema') ? String(texto || '').trim() : null, midiaKey, lat != null ? lat : null, lng != null ? lng : null]
  );
  await query(`UPDATE chat_conversas SET ultima_msg_em = now(), ultima_previa = $2 WHERE id = $1`, [conversaId, previa(tipo, texto)]);
  if (autorTipo !== 'sistema') await marcarLida({ conversaId, lado: autorTipo });

  const evt = { conversaId, entregaId: conv.entrega_id, tipo: conv.tipo, autorTipo, motoboyId: conv.motoboy_id, lojaId: conv.loja_id, protocolo: conv.protocolo };
  try { if (conv.motoboy_id && autorTipo !== 'motoboy') emitirParaMotoboy(conv.motoboy_id, 'chat.mensagem', evt); } catch {}
  try { emitirParaEmpresa(empresaId, 'chat.mensagem', evt); } catch {}

  // Push pro motoboy quando a mensagem vem do outro lado (funciona com o app fechado).
  if (conv.motoboy_id && (autorTipo === 'central' || autorTipo === 'loja')) {
    const de = autorTipo === 'central' ? 'Suporte' : 'Loja';
    const corpo = tipo === 'foto' ? 'Enviou uma foto' : tipo === 'local' ? 'Enviou uma localização' : String(texto || '').slice(0, 80);
    notificarMotoboy(conv.motoboy_id, {
      titulo: `💬 ${de}${conv.protocolo ? ' · ' + conv.protocolo : ''}`,
      corpo: corpo || 'Nova mensagem',
      dados: { tipo: 'chat', conversaId, entregaId: conv.entrega_id, chatTipo: conv.tipo },
    }).catch(() => {});
  }

  return { id: rows[0].id, criado_em: rows[0].criado_em };
}

// Encerra as conversas de uma corrida (ao finalizar a entrega). Deixa uma nota
// do sistema visível para todos os lados (inclusive a central entende o motivo).
async function encerrarPorCorrida({ empresaId, entregaId }) {
  const { rows } = await query(
    `SELECT id FROM chat_conversas WHERE empresa_id = $1 AND entrega_id = $2 AND status <> 'encerrada'`,
    [empresaId, entregaId]
  );
  for (const c of rows) {
    await query(`UPDATE chat_conversas SET status = 'encerrada', encerrada_em = now(), encerrada_motivo = 'corrida_finalizada' WHERE id = $1`, [c.id]);
    try { await enviar({ empresaId, conversaId: c.id, autorTipo: 'sistema', tipo: 'sistema', texto: 'Conversa encerrada — a corrida foi finalizada.' }); } catch {}
  }
  return { ok: true, encerradas: rows.length };
}

// Assume (ou puxa) o atendimento para o usuário atual. Vale para central e loja.
async function assumirConversa({ empresaId, conversaId, usuarioId, usuarioNome }) {
  const conv = await _conversa(empresaId, conversaId);
  if (conv.status === 'encerrada') throw AppError.validacao('Esta conversa foi encerrada.');
  const jaEra = conv.atendente_id && String(conv.atendente_id) === String(usuarioId);
  await query(`UPDATE chat_conversas SET atendente_id = $2, atendente_nome = $3, atendido_em = now() WHERE id = $1`, [conversaId, usuarioId, usuarioNome || 'Atendente']);
  if (!jaEra) {
    const nota = conv.atendente_id ? `${usuarioNome || 'Atendente'} assumiu o atendimento.` : `${usuarioNome || 'Atendente'} iniciou o atendimento.`;
    try { await enviar({ empresaId, conversaId, autorTipo: 'sistema', tipo: 'sistema', texto: nota }); } catch {}
  }
  return { ok: true, atendente_id: usuarioId, atendente_nome: usuarioNome };
}

// ── Lista mensagens de uma conversa + marca lida para o lado ──
async function mensagens({ empresaId, conversaId, lado }) {
  const conv = await _conversa(empresaId, conversaId);
  const { rows } = await query(
    `SELECT id, autor_tipo, autor_nome, tipo, texto, midia_key, lat, lng, criado_em
       FROM chat_mensagens WHERE conversa_id = $1 ORDER BY criado_em ASC`,
    [conversaId]
  );
  for (const m of rows) {
    if (m.midia_key) { try { m.midia_url = await storage.urlDe(m.midia_key); } catch { m.midia_url = null; } }
    delete m.midia_key;
  }
  if (lado) await marcarLida({ conversaId, lado });
  const estado = conv.status === 'encerrada' ? 'encerrada' : (conv.atendente_id ? 'em_atendimento' : 'aguardando');
  return { conversa: { id: conv.id, tipo: conv.tipo, protocolo: conv.protocolo, entrega_id: conv.entrega_id, status: conv.status, estado, atendente_id: conv.atendente_id, atendente_nome: conv.atendente_nome }, mensagens: rows };
}

// ── App: lista as conversas do motoboy ──
async function conversasApp({ empresaId, motoboyId }) {
  if (!(await chatAtivo(empresaId))) return { ativo: false, conversas: [] };
  const { rows } = await query(
    `SELECT c.id, c.tipo, c.protocolo, c.entrega_id, c.status, c.ultima_previa, c.ultima_msg_em,
            ${SQL_NAO_LIDAS('c', "'motoboy'")} AS nao_lidas,
            l.nome_fantasia AS loja_nome
       FROM chat_conversas c LEFT JOIN lojas l ON l.id = c.loja_id
      WHERE c.empresa_id = $1 AND c.motoboy_id = $2
      ORDER BY c.ultima_msg_em DESC NULLS LAST, c.criado_em DESC`,
    [empresaId, motoboyId]
  );
  return { ativo: true, conversas: rows };
}

// ── Central/Loja: lista conversas (loja vê 'solicitante' dela; central vê 'suporte') ──
async function conversasCentral({ empresaId, lojaId }) {
  const lado = lojaId ? "'loja'" : "'central'";
  const cond = lojaId ? "c.tipo = 'solicitante' AND c.loja_id = $2" : "c.tipo = 'suporte'";
  const params = lojaId ? [empresaId, lojaId] : [empresaId];
  const { rows } = await query(
    `SELECT c.id, c.tipo, c.protocolo, c.entrega_id, c.status, c.atendente_id, c.atendente_nome, c.ultima_previa, c.ultima_msg_em,
            ${SQL_NAO_LIDAS('c', lado)} AS nao_lidas,
            m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo
       FROM chat_conversas c LEFT JOIN motoboys m ON m.id = c.motoboy_id
      WHERE c.empresa_id = $1 AND ${cond}
      ORDER BY c.ultima_msg_em DESC NULLS LAST, c.criado_em DESC`,
    params
  );
  return { conversas: rows };
}

async function naoLidasApp({ empresaId, motoboyId }) {
  if (!(await chatAtivo(empresaId))) return { ativo: false, total: 0 };
  const { rows } = await query(
    `SELECT COALESCE(SUM(${SQL_NAO_LIDAS('c', "'motoboy'")}),0)::int AS total
       FROM chat_conversas c WHERE c.empresa_id = $1 AND c.motoboy_id = $2`,
    [empresaId, motoboyId]
  );
  return { ativo: true, total: rows[0] ? rows[0].total : 0 };
}
async function naoLidasCentral({ empresaId, lojaId }) {
  const lado = lojaId ? "'loja'" : "'central'";
  const cond = lojaId ? "c.tipo = 'solicitante' AND c.loja_id = $2" : "c.tipo = 'suporte'";
  const params = lojaId ? [empresaId, lojaId] : [empresaId];
  const { rows } = await query(
    `SELECT COALESCE(SUM(${SQL_NAO_LIDAS('c', lado)}),0)::int AS total FROM chat_conversas c WHERE c.empresa_id = $1 AND ${cond}`,
    params
  );
  return { total: rows[0] ? rows[0].total : 0 };
}

module.exports = {
  chatAtivo, abrirConversaApp, abrirConversaLoja, enviar, mensagens,
  conversasApp, conversasCentral, naoLidasApp, naoLidasCentral,
  chatDaLojaAtivo, lojasChatConfig, centrosChatConfig, definirChatLoja, definirChatCentro,
  encerrarPorCorrida, assumirConversa,
};
