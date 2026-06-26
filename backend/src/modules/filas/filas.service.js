const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, STATUS_ENTREGA } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { emitirParaEmpresa } = require('../../realtime/ws');

const STATUS_ATIVOS = [STATUS_ENTREGA.AGUARDANDO_COLETA, STATUS_ENTREGA.EM_COLETA, STATUS_ENTREGA.EM_ROTA];

// Fila de entregas aguardando atribuição.
async function listarFila(empresaId) {
  const { rows } = await query(
    `SELECT id, protocolo, status, coleta_endereco, coleta_lat, coleta_lng, criado_em
       FROM entregas WHERE empresa_id = $1 AND status = $2 ORDER BY criado_em`,
    [empresaId, STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO]
  );
  return rows;
}

// Motoboys online + ativos, com a carga atual (entregas em andamento).
async function listarDisponiveis(empresaId) {
  const { rows } = await query(
    `SELECT m.id, m.nome_completo, COALESCE(c.carga, 0) AS carga
       FROM motoboys m
       LEFT JOIN (
         SELECT motoboy_id, count(*)::int AS carga FROM entregas
          WHERE empresa_id = $1 AND status = ANY($2) GROUP BY motoboy_id
       ) c ON c.motoboy_id = m.id
      WHERE m.empresa_id = $1 AND m.online = TRUE AND m.status = 'ativo'
      ORDER BY carga ASC, m.nome_completo`,
    [empresaId, STATUS_ATIVOS]
  );
  return rows;
}

function distanciaKm(e, p) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(p.lat - e.coleta_lat), dLng = rad(p.lng - e.coleta_lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(e.coleta_lat)) * Math.cos(rad(p.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Escolhe o melhor motoboy: mais próximo (se houver posição), senão o menos carregado.
async function escolherMotoboy(empresaId, entrega) {
  const disponiveis = await listarDisponiveis(empresaId);
  if (!disponiveis.length) return null;
  if (entrega.coleta_lat != null && entrega.coleta_lng != null) {
    const ids = disponiveis.map((d) => d.id);
    const { rows } = await query(
      `SELECT DISTINCT ON (motoboy_id) motoboy_id, lat, lng FROM rastreamento
        WHERE motoboy_id = ANY($1::uuid[]) ORDER BY motoboy_id, capturado_em DESC`,
      [ids]
    );
    const pos = new Map(rows.map((r) => [r.motoboy_id, r]));
    const comPos = disponiveis.filter((d) => pos.has(d.id));
    if (comPos.length) {
      comPos.sort((a, b) => distanciaKm(entrega, pos.get(a.id)) - distanciaKm(entrega, pos.get(b.id)));
      return comPos[0];
    }
  }
  return disponiveis[0]; // fallback: menor carga
}

// Atribui um motoboy a uma entrega da fila.
async function atribuir({ empresaId, entregaId, motoboyId, usuarioId, ip }) {
  const ent = await query(`SELECT id, status, protocolo FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]);
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (ent.rows[0].status !== STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO) throw AppError.validacao('Entrega não está na fila de atribuição');

  const mb = await query(`SELECT id, nome_completo FROM motoboys WHERE id = $1 AND empresa_id = $2 AND online = TRUE AND status = 'ativo'`, [motoboyId, empresaId]);
  if (!mb.rows[0]) throw AppError.validacao('Motoboy indisponível (offline ou inativo)');

  const { rows } = await query(
    `UPDATE entregas SET motoboy_id = $1, status = $2 WHERE id = $3 RETURNING id, protocolo, status, motoboy_id`,
    [motoboyId, STATUS_ENTREGA.AGUARDANDO_COLETA, entregaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'atribuir', detalhe: { entregaId, motoboyId }, ip });
  emitirParaEmpresa(empresaId, 'entrega.atribuida', { id: entregaId, motoboyId, protocolo: rows[0].protocolo });
  return { ...rows[0], motoboy_nome: mb.rows[0].nome_completo };
}

// Atribui várias entregas a um mesmo motoboy de uma vez (despacho em lote).
async function atribuirLote({ empresaId, entregaIds, motoboyId, usuarioId, ip }) {
  if (!Array.isArray(entregaIds) || !entregaIds.length) throw AppError.validacao('Nenhuma entrega selecionada');

  const mb = await query(`SELECT id, nome_completo FROM motoboys WHERE id = $1 AND empresa_id = $2 AND online = TRUE AND status = 'ativo'`, [motoboyId, empresaId]);
  if (!mb.rows[0]) throw AppError.validacao('Motoboy indisponível (offline ou inativo)');

  // Só atribui as que estão realmente na fila de atribuição (evita pegar já despachadas).
  const { rows } = await query(
    `UPDATE entregas SET motoboy_id = $1, status = $2
       WHERE empresa_id = $3 AND id = ANY($4::uuid[]) AND status = $5
       RETURNING id, protocolo`,
    [motoboyId, STATUS_ENTREGA.AGUARDANDO_COLETA, empresaId, entregaIds, STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO]
  );
  if (!rows.length) throw AppError.validacao('Nenhuma das entregas selecionadas está disponível para atribuição');

  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'atribuir-lote', detalhe: { motoboyId, ids: rows.map(r => r.id) }, ip });
  rows.forEach(r => emitirParaEmpresa(empresaId, 'entrega.atribuida', { id: r.id, motoboyId, protocolo: r.protocolo }));
  return { atribuidas: rows.length, protocolos: rows.map(r => r.protocolo), motoboy_nome: mb.rows[0].nome_completo };
}


async function atribuirAutomatica({ empresaId, entregaId, usuarioId, ip }) {
  const ent = await query(
    `SELECT id, status, coleta_lat, coleta_lng FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]
  );
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (ent.rows[0].status !== STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO) throw AppError.validacao('Entrega não está na fila de atribuição');

  const escolhido = await escolherMotoboy(empresaId, ent.rows[0]);
  if (!escolhido) throw AppError.validacao('Nenhum motoboy online disponível no momento');
  return atribuir({ empresaId, entregaId, motoboyId: escolhido.id, usuarioId, ip });
}

// Distribui automaticamente toda a fila. Retorna o resumo.
async function distribuirFila({ empresaId, usuarioId, ip }) {
  const fila = await listarFila(empresaId);
  const resultado = { atribuidas: 0, semMotoboy: 0 };
  for (const e of fila) {
    try { await atribuirAutomatica({ empresaId, entregaId: e.id, usuarioId, ip }); resultado.atribuidas++; }
    catch { resultado.semMotoboy++; }
  }
  return resultado;
}

// Troca o motoboy de uma entrega JÁ atribuída (ou em coleta/rota).
// Diferente de atribuir(), aceita status ativos — usado na tela de acompanhamento.
async function reatribuir({ empresaId, entregaId, motoboyId, usuarioId, ip }) {
  const ent = await query(`SELECT id, status, protocolo, motoboy_id FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]);
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  const statusAtual = ent.rows[0].status;
  if (['entregue', 'cancelada'].includes(statusAtual))
    throw AppError.validacao(`Entrega já está ${statusAtual} — não é possível trocar o motoboy`);

  const mb = await query(`SELECT id, nome_completo FROM motoboys WHERE id = $1 AND empresa_id = $2 AND status = 'ativo'`, [motoboyId, empresaId]);
  if (!mb.rows[0]) throw AppError.validacao('Motoboy inválido ou inativo');

  // Se a entrega estava na fila, passa para aguardando_coleta; senão mantém o status atual.
  const novoStatus = statusAtual === STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO
    ? STATUS_ENTREGA.AGUARDANDO_COLETA : statusAtual;

  const { rows } = await query(
    `UPDATE entregas SET motoboy_id = $1, status = $2 WHERE id = $3 RETURNING id, protocolo, status, motoboy_id`,
    [motoboyId, novoStatus, entregaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'reatribuir', detalhe: { entregaId, de: ent.rows[0].motoboy_id, para: motoboyId }, ip });
  emitirParaEmpresa(empresaId, 'entrega.atribuida', { id: entregaId, motoboyId, protocolo: rows[0].protocolo });
  return { ...rows[0], motoboy_nome: mb.rows[0].nome_completo };
}

// Lista TODOS os motoboys ativos da empresa (não só online), para o seletor de troca.
async function listarTodosAtivos(empresaId) {
  const { rows } = await query(
    `SELECT m.id, m.codigo, m.nome_completo, m.online, COALESCE(c.carga, 0) AS carga
       FROM motoboys m
       LEFT JOIN (
         SELECT motoboy_id, count(*)::int AS carga FROM entregas
          WHERE empresa_id = $1 AND status = ANY($2) GROUP BY motoboy_id
       ) c ON c.motoboy_id = m.id
      WHERE m.empresa_id = $1 AND m.status = 'ativo'
      ORDER BY m.online DESC, carga ASC, m.codigo`,
    [empresaId, STATUS_ATIVOS]
  );
  return rows;
}

module.exports = { listarFila, listarDisponiveis, atribuir, atribuirLote, atribuirAutomatica, distribuirFila, reatribuir, listarTodosAtivos };
