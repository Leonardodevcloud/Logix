const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const storage = require('../../shared/storage');
let emitirParaEmpresa = () => {}, emitirParaMotoboy = () => {};
try { const ws = require('../../realtime/ws'); emitirParaEmpresa = ws.emitirParaEmpresa; emitirParaMotoboy = ws.emitirParaMotoboy; } catch {}
let empresaTemModulo = async () => true;
try { empresaTemModulo = require('../permissoes/permissoes.service').empresaTemModulo; } catch {}

async function chatAtivo(empresaId) { try { return await empresaTemModulo(empresaId, 'chat'); } catch { return false; } }

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
    `SELECT id, protocolo, motoboy_id, loja_id FROM entregas WHERE id = $1 AND empresa_id = $2`,
    [entregaId, empresaId]
  );
  if (!e[0]) throw AppError.naoEncontrado('Corrida não encontrada');
  if (e[0].motoboy_id && String(e[0].motoboy_id) !== String(motoboyId)) throw AppError.proibido('Esta corrida não é sua');
  const lojaId = tipo === 'solicitante' ? (e[0].loja_id || null) : null;
  if (tipo === 'solicitante' && !lojaId) throw AppError.validacao('Esta corrida não tem loja solicitante.');

  const { rows } = await query(
    `INSERT INTO chat_conversas (empresa_id, entrega_id, tipo, motoboy_id, loja_id, protocolo)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (entrega_id, tipo) DO UPDATE SET motoboy_id = COALESCE(chat_conversas.motoboy_id, $4)
     RETURNING id`,
    [empresaId, entregaId, tipo, motoboyId, lojaId, e[0].protocolo]
  );
  return { conversa_id: rows[0].id, tipo, protocolo: e[0].protocolo };
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
  let midiaKey = null;
  if (tipo === 'foto') {
    if (!arquivo) throw AppError.validacao('Envie a foto');
    const up = await storage.subirBase64({ empresaId, motoboyId: conv.motoboy_id || empresaId, tipo: 'chat', dataUri: arquivo });
    midiaKey = up.key;
  } else if (tipo === 'local') {
    if (lat == null || lng == null) throw AppError.validacao('Localização inválida');
  } else {
    if (!String(texto || '').trim()) throw AppError.validacao('Mensagem vazia');
    tipo = 'texto';
  }
  const { rows } = await query(
    `INSERT INTO chat_mensagens (conversa_id, empresa_id, autor_tipo, autor_id, autor_nome, tipo, texto, midia_key, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, criado_em`,
    [conversaId, empresaId, autorTipo, autorId || null, autorNome || null, tipo, tipo === 'texto' ? String(texto).trim() : null, midiaKey, lat != null ? lat : null, lng != null ? lng : null]
  );
  await query(`UPDATE chat_conversas SET ultima_msg_em = now(), ultima_previa = $2 WHERE id = $1`, [conversaId, previa(tipo, texto)]);
  await marcarLida({ conversaId, lado: autorTipo }); // quem enviou já "leu"

  const evt = { conversaId, entregaId: conv.entrega_id, tipo: conv.tipo, autorTipo, motoboyId: conv.motoboy_id, lojaId: conv.loja_id, protocolo: conv.protocolo };
  try { if (conv.motoboy_id && autorTipo !== 'motoboy') emitirParaMotoboy(conv.motoboy_id, 'chat.mensagem', evt); } catch {}
  try { emitirParaEmpresa(empresaId, 'chat.mensagem', evt); } catch {}

  return { id: rows[0].id, criado_em: rows[0].criado_em };
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
  return { conversa: { id: conv.id, tipo: conv.tipo, protocolo: conv.protocolo, entrega_id: conv.entrega_id }, mensagens: rows };
}

// ── App: lista as conversas do motoboy ──
async function conversasApp({ empresaId, motoboyId }) {
  if (!(await chatAtivo(empresaId))) return { ativo: false, conversas: [] };
  const { rows } = await query(
    `SELECT c.id, c.tipo, c.protocolo, c.entrega_id, c.ultima_previa, c.ultima_msg_em,
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
    `SELECT c.id, c.tipo, c.protocolo, c.entrega_id, c.ultima_previa, c.ultima_msg_em,
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
};
