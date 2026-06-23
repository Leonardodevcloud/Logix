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

// Atribuição automática de uma entrega.
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

module.exports = { listarFila, listarDisponiveis, atribuir, atribuirAutomatica, distribuirFila };
