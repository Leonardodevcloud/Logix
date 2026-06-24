const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, ERRO_MSGS, STATUS_ENTREGA } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { geocodificar, otimizarRota } = require('../../integracoes/openrouteservice');
const { emitirParaEmpresa } = require('../../realtime/ws');
const sh = require('./entregas.shared');

// Garante coordenadas: usa lat/lng informadas ou geocodifica o endereço.
async function comCoordenadas(ponto) {
  if (ponto.lat && ponto.lng) return ponto;
  return { ...ponto, ...(await geocodificar(ponto.endereco)) };
}

// Lança uma nova entrega: geocoding, otimização de rota e gravação transacional.
async function criarEntrega({ empresaId, criadoPor, coleta, destinos, distribuicao = 'automatica', motoboyId = null, ip }) {
  if (!coleta || !coleta.endereco) throw AppError.validacao('Informe o ponto de coleta');
  if (!Array.isArray(destinos) || destinos.length === 0) throw AppError.validacao('Informe ao menos um destino');

  const coletaGeo = await comCoordenadas(coleta);
  const destinosGeo = [];
  for (const d of destinos) destinosGeo.push(await comCoordenadas(d));

  // Sequência ótima (segue sem otimização se o ORS falhar).
  let ordem = destinosGeo.map((_, i) => i);
  let distanciaKm = null, tempoEstimado = null;
  try {
    const r = await otimizarRota({ coleta: coletaGeo, pontos: destinosGeo });
    if (r.ordem.length === destinosGeo.length) ordem = r.ordem;
    distanciaKm = r.distanciaKm; tempoEstimado = r.duracaoMin;
  } catch (e) {
    console.warn('[entregas] otimização indisponível, mantendo ordem original:', e.message);
  }

  const protocolo = await sh.gerarProtocolo();
  const status = (distribuicao === 'manual' && motoboyId)
    ? STATUS_ENTREGA.AGUARDANDO_COLETA
    : STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO;

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO entregas (empresa_id, protocolo, motoboy_id, status, distribuicao,
         coleta_nome, coleta_endereco, coleta_lat, coleta_lng, distancia_km, tempo_estimado_min, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [empresaId, protocolo, motoboyId, status, distribuicao, coleta.nome || null, coleta.endereco,
       coletaGeo.lat, coletaGeo.lng, distanciaKm, tempoEstimado, criadoPor]
    );
    const entregaId = rows[0].id;
    let posicao = 1;
    for (const idx of ordem) {
      const d = destinos[idx], g = destinosGeo[idx];
      await cliente.query(
        `INSERT INTO entregas_pontos (entrega_id, ordem, nome, endereco, lat, lng, telefone, observacoes, numero_nf, nome_fantasia, complemento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [entregaId, posicao++, d.nome || null, d.endereco, g.lat, g.lng, d.telefone || null, d.observacoes || null, d.numero_nf || null, d.nome_fantasia || null, d.complemento || null]
      );
    }
    await cliente.query('COMMIT');
    await registrarAuditoria({
      empresaId, usuarioId: criadoPor, categoria: AUDIT_CATEGORIES.ENTREGA,
      acao: 'criar', detalhe: { protocolo }, ip,
    });
    emitirParaEmpresa(empresaId, 'entrega.criada', { id: entregaId, protocolo, status });
    return obter({ empresaId, id: entregaId });
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}

async function obter({ empresaId, id }) {
  const { rows } = await query(`SELECT * FROM entregas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado(ERRO_MSGS.ENTREGA_NAO_ENCONTRADA);
  const pontos = await query(`SELECT * FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`, [id]);
  return { ...rows[0], pontos: pontos.rows };
}

async function listar({ empresaId, status, motoboyId }) {
  const cond = ['empresa_id = $1']; const params = [empresaId];
  if (status) { params.push(status); cond.push(`status = $${params.length}`); }
  if (motoboyId) { params.push(motoboyId); cond.push(`motoboy_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.motoboy_id, e.status, e.distancia_km, e.tempo_estimado_min,
             e.coleta_endereco, e.criado_em,
             m.nome_completo AS motoboy_nome,
             (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco
       FROM entregas e
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
       WHERE e.empresa_id = $1 ORDER BY e.criado_em DESC LIMIT 200`,
    params
  );
  return rows;
}

async function listarConcluidas({ empresaId, de, ate, motoboyId, status }) {
  const cond = ['e.empresa_id = $1']; const params = [empresaId];
  // status: 'entregue' | 'cancelada' | null (todas)
  if (status === 'entregue') cond.push("e.status = 'entregue'");
  else if (status === 'cancelada') cond.push("e.status = 'cancelada'");
  else cond.push("e.status IN ('entregue','cancelada')");
  if (de) { params.push(de); cond.push(`e.criado_em >= $${params.length}`); }
  if (ate) { params.push(ate); cond.push(`e.criado_em <= $${params.length}`); }
  if (motoboyId) { params.push(motoboyId); cond.push(`e.motoboy_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.status, e.motoboy_id, e.distancia_km, e.tempo_estimado_min,
            e.coleta_endereco, e.criado_em, e.concluida_em, e.cancelada_em, e.motivo_cancelamento,
            m.nome_completo AS motoboy_nome, m.foto_url AS motoboy_foto, m.telefone AS motoboy_telefone,
            (SELECT count(*)::int FROM entregas_pontos p WHERE p.entrega_id = e.id) AS total_pontos,
            (SELECT ep.numero_nf FROM entregas_pontos ep WHERE ep.entrega_id = e.id AND ep.numero_nf IS NOT NULL ORDER BY ep.ordem LIMIT 1) AS primeira_nf,
            (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco
       FROM entregas e
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
       WHERE ${cond.join(' AND ')} ORDER BY e.criado_em DESC LIMIT 500`,
    params
  );
  return rows;
}

// Detalhe de uma entrega concluída: pontos + protocolos (fotos)
async function detalharConcluida({ empresaId, id }) {
  const { rows: ent } = await query(
    `SELECT e.*, m.nome_completo AS motoboy_nome, m.foto_url AS motoboy_foto, m.telefone AS motoboy_telefone
     FROM entregas e LEFT JOIN motoboys m ON m.id = e.motoboy_id
     WHERE e.id = $1 AND e.empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  const { rows: pontos } = await query(
    `SELECT ep.*,
            json_agg(json_build_object('url', pr.arquivo_url, 'tipo', pr.tipo) ORDER BY pr.criado_em)
              FILTER (WHERE pr.id IS NOT NULL) AS fotos
     FROM entregas_pontos ep
     LEFT JOIN protocolos pr ON pr.entrega_ponto_id = ep.id
     WHERE ep.entrega_id = $1
     GROUP BY ep.id ORDER BY ep.ordem`, [id]);
  return { ...ent[0], pontos };
}

// Acompanhamento: entrega + pontos + última posição conhecida do motoboy.
async function acompanhar({ empresaId, id }) {
  const entrega = await obter({ empresaId, id });
  let ultimaPosicao = null;
  if (entrega.motoboy_id) {
    const r = await query(
      `SELECT lat, lng, capturado_em FROM rastreamento
        WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`,
      [entrega.motoboy_id]
    );
    ultimaPosicao = r.rows[0] || null;
  }
  return { ...entrega, ultima_posicao: ultimaPosicao };
}

// Registra a posição enviada pelo app do motoboy (rastreamento em segundo plano).
async function registrarPosicao({ empresaId, motoboyId, entregaId, lat, lng }) {
  if (lat == null || lng == null) throw AppError.validacao('Coordenadas obrigatórias');
  await query(
    `INSERT INTO rastreamento (motoboy_id, entrega_id, lat, lng) VALUES ($1, $2, $3, $4)`,
    [motoboyId, entregaId || null, lat, lng]
  );
  emitirParaEmpresa(empresaId, 'motoboy.posicao', { motoboyId, entregaId, lat, lng });
  return { ok: true };
}

// Conclui um ponto após receber os comprovantes; fecha a entrega quando todos os pontos terminam.
async function registrarProtocoloPonto({ empresaId, entregaId, pontoId, recebedor, comprovantes, usuarioId, ip }) {
  const e = await query(`SELECT id FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]);
  if (!e.rows[0]) throw AppError.naoEncontrado(ERRO_MSGS.ENTREGA_NAO_ENCONTRADA);
  const p = await query(`SELECT id FROM entregas_pontos WHERE id = $1 AND entrega_id = $2`, [pontoId, entregaId]);
  if (!p.rows[0]) throw AppError.naoEncontrado('Ponto não encontrado');
  if (!Array.isArray(comprovantes) || comprovantes.length === 0) {
    throw AppError.validacao('Envie ao menos um comprovante para concluir o ponto');
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const c of comprovantes) {
      await cliente.query(
        `INSERT INTO protocolos (entrega_ponto_id, tipo, arquivo_url) VALUES ($1, $2, $3)`,
        [pontoId, c.tipo, c.arquivoUrl]
      );
    }
    await cliente.query(
      `UPDATE entregas_pontos SET status = 'entregue', recebedor = $1, entregue_em = now() WHERE id = $2`,
      [recebedor || null, pontoId]
    );
    const { rows: pend } = await cliente.query(
      `SELECT count(*)::int AS pendentes FROM entregas_pontos WHERE entrega_id = $1 AND status <> 'entregue'`,
      [entregaId]
    );
    let novoStatus = STATUS_ENTREGA.EM_ROTA;
    if (pend[0].pendentes === 0) {
      novoStatus = STATUS_ENTREGA.ENTREGUE;
      await cliente.query(
        `UPDATE entregas SET status = 'entregue', concluida_em = now(),
           tempo_total_min = ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(iniciada_em, criado_em))) / 60)
         WHERE id = $1`,
        [entregaId]
      );
    } else {
      await cliente.query(
        `UPDATE entregas SET status = 'em_rota' WHERE id = $1 AND status NOT IN ('entregue','cancelada')`,
        [entregaId]
      );
    }
    await cliente.query('COMMIT');
    await registrarAuditoria({
      empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA,
      acao: 'protocolo_ponto', detalhe: { entregaId, pontoId }, ip,
    });
    emitirParaEmpresa(empresaId, novoStatus === STATUS_ENTREGA.ENTREGUE ? 'entrega.concluida' : 'ponto.entregue',
      { entregaId, pontoId });
    return { ok: true, status: novoStatus };
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { cancelarEntrega,
  criarEntrega, obter, listar, listarConcluidas, detalharConcluida, acompanhar, registrarPosicao, registrarProtocoloPonto,
};

async function cancelarEntrega({ empresaId, id, motivo, usuarioId, ip }) {
  const { rows: ent } = await query(
    `SELECT id, status, protocolo FROM entregas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (['entregue', 'cancelada'].includes(ent[0].status))
    throw AppError.validacao(`Entrega já está ${ent[0].status} — não pode ser cancelada`);
  await query(
    `UPDATE entregas SET status = 'cancelada', cancelada_em = now(), cancelado_por = $3, motivo_cancelamento = $4
     WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId, usuarioId, motivo || null]
  );
  emitirParaEmpresa(empresaId, 'entrega.cancelada', { id, protocolo: ent[0].protocolo });
  // auditoria sem await — não bloqueia a resposta
  registrarAuditoria({ empresaId, usuarioId, categoria: 'entregas', acao: 'cancelar', detalhe: { id, motivo }, ip }).catch(() => {});
  return { ok: true };
}
