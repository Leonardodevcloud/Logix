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
    `SELECT e.id, e.protocolo, e.status, e.motoboy_id,
            -- Usa distancia_km do banco; se null/zero e existem coordenadas de coleta e destino,
            -- calcula haversine entre ponto de coleta e primeiro destino
            COALESCE(
              NULLIF(e.distancia_km, 0),
              CASE WHEN e.coleta_lat IS NOT NULL AND e.coleta_lng IS NOT NULL THEN
                (SELECT ROUND((6371 * 2 * ASIN(SQRT(
                  POWER(SIN(RADIANS(ep.lat - e.coleta_lat) / 2), 2) +
                  COS(RADIANS(e.coleta_lat)) * COS(RADIANS(ep.lat)) *
                  POWER(SIN(RADIANS(ep.lng - e.coleta_lng) / 2), 2)
                )))::numeric, 2)
                FROM entregas_pontos ep
                WHERE ep.entrega_id = e.id AND ep.lat IS NOT NULL AND ep.lng IS NOT NULL
                ORDER BY ep.ordem LIMIT 1)
              END
            ) AS distancia_km,
            e.coleta_endereco, e.criado_em, e.concluida_em, e.cancelada_em, e.motivo_cancelamento,
            m.nome_completo AS motoboy_nome, m.foto_url AS motoboy_foto, m.telefone_principal AS motoboy_telefone,
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
    `SELECT e.*, m.nome_completo AS motoboy_nome, m.foto_url AS motoboy_foto, m.telefone_principal AS motoboy_telefone
     FROM entregas e LEFT JOIN motoboys m ON m.id = e.motoboy_id
     WHERE e.id = $1 AND e.empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');

  const { rows: pontos } = await query(
    `SELECT ep.id, ep.ordem, ep.nome, ep.endereco, ep.lat, ep.lng,
            ep.telefone, ep.observacoes, ep.observacao_motoboy, ep.status, ep.recebedor,
            ep.entregue_em, ep.chegou_em, ep.finalizado_em,
            ep.numero_nf, ep.nome_fantasia, ep.complemento,
            COALESCE(
              json_agg(
                json_build_object('url', pr.arquivo_url, 'tipo', pr.tipo)
                ORDER BY pr.criado_em
              ) FILTER (WHERE pr.id IS NOT NULL),
              '[]'::json
            ) AS fotos
     FROM entregas_pontos ep
     LEFT JOIN protocolos pr ON pr.entrega_ponto_id = ep.id
     WHERE ep.entrega_id = $1
     GROUP BY ep.id ORDER BY ep.ordem`, [id]);

  const e = ent[0];

  // FIX KM: calcular haversine se distancia_km for null ou zero
  // Se coleta_lat for null, usa o 1º ponto como âncora de origem
  let distanciaKm = e.distancia_km;
  if (!distanciaKm || parseFloat(distanciaKm) === 0) {
    try {
      const pontosComCoord = pontos.filter(p => p.lat && p.lng)
        .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
      const coleta = (e.coleta_lat && e.coleta_lng)
        ? { lat: parseFloat(e.coleta_lat), lng: parseFloat(e.coleta_lng) }
        : (pontosComCoord[0] || null); // fallback: usa 1º ponto como origem
      const pts = coleta
        ? [coleta, ...pontosComCoord.slice(coleta === pontosComCoord[0] ? 1 : 0)]
        : pontosComCoord;
      if (pts.length >= 2) {
        let km = 0;
        const R = 6371, rad = x => x * Math.PI / 180;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
          km += 2 * R * Math.asin(Math.sqrt(h));
        }
        distanciaKm = parseFloat(km.toFixed(2));
        query(`UPDATE entregas SET distancia_km = $1 WHERE id = $2 AND (distancia_km IS NULL OR distancia_km = 0)`, [distanciaKm, id]).catch(() => {});
      }
    } catch {}
  }

  return { ...e, distancia_km: distanciaKm, pontos };
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

// ── Protocolo HTML público ────────────────────────────────────────────────────
// Gera uma página HTML standalone para impressão/PDF da entrega.
async function gerarProtocoloHtml(id) {
  // Buscar entrega sem filtro de empresa (é público, mas só expõe dados não sensíveis)
  const { rows: ent } = await query(
    `SELECT e.*,
            m.nome_completo AS motoboy_nome, m.telefone_principal AS motoboy_telefone,
            emp.razao_social, emp.nome_fantasia,
            b.cor_primaria, b.logo_url, b.nome_exibicao
     FROM entregas e
     LEFT JOIN motoboys m       ON m.id = e.motoboy_id
     LEFT JOIN empresas emp     ON emp.id = e.empresa_id
     LEFT JOIN empresa_branding b ON b.empresa_id = e.empresa_id
     WHERE e.id = $1`, [id]);
  if (!ent[0]) throw require('../../shared/AppError').naoEncontrado('Entrega não encontrada');
  const d = ent[0];

  const { rows: pontos } = await query(
    `SELECT ep.id, ep.ordem, ep.nome, ep.endereco, ep.status, ep.recebedor,
            ep.entregue_em, ep.chegou_em, ep.finalizado_em,
            ep.numero_nf, ep.nome_fantasia, ep.complemento, ep.telefone, ep.observacoes,
            COALESCE(
              json_agg(
                json_build_object('url', pr.arquivo_url, 'tipo', pr.tipo)
                ORDER BY pr.criado_em
              ) FILTER (WHERE pr.id IS NOT NULL),
              '[]'::json
            ) AS fotos
     FROM entregas_pontos ep
     LEFT JOIN protocolos pr ON pr.entrega_ponto_id = ep.id
     WHERE ep.entrega_id = $1
     GROUP BY ep.id ORDER BY ep.ordem`, [id]);

  const cor = d.cor_primaria || '#185FA5';
  const nomeEmpresa = d.nome_exibicao || d.nome_fantasia || d.razao_social || 'Logix';

  const TZ = 'America/Bahia';
  function fmtDataHtml(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function fmtHoraHtml(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour:'2-digit', minute:'2-digit' });
  }

  // Detectar tipo real de base64
  function normalizarBase64(raw) {
    if (!raw) return null;
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/9j/'))   return 'data:image/jpeg;base64,' + raw;
    if (raw.startsWith('iVBOR')) return 'data:image/png;base64,'  + raw;
    if (raw.startsWith('UklG'))   return 'data:image/webp;base64,' + raw;
    return 'data:image/jpeg;base64,' + raw;
  }

  const pontosHtml = pontos.map((p, i) => {
    const fotos = (() => {
      try { return Array.isArray(p.fotos) ? p.fotos : JSON.parse(p.fotos || '[]'); } catch { return []; }
    })().filter(f => { const r = typeof f === 'string' ? f : (f?.url || ''); return r && r.length > 4; });

    const fotosHtml = fotos.length ? `
      <div class="fotos-label">📷 Fotos de protocolo (${fotos.length})</div>
      <div class="fotos-section">
        ${fotos.map(f => {
          const raw = typeof f === 'string' ? f : (f?.url || '');
          const url = normalizarBase64(raw);
          return url ? `<img src="${url}" class="foto-full" onerror="this.style.display='none'" />` : '';
        }).join('')}
      </div>` : '';

    const horarios = [
      p.chegou_em   ? `<span class="hora chegou">⏱ Chegou: ${fmtHoraHtml(p.chegou_em)}</span>` : '',
      (p.entregue_em || p.finalizado_em) ? `<span class="hora entregue">✓ Entregue: ${fmtHoraHtml(p.entregue_em || p.finalizado_em)}</span>` : '',
    ].filter(Boolean).join('');

    const extras = [
      p.nome_fantasia ? `<span>${p.nome_fantasia}</span>` : '',
      p.numero_nf     ? `<span>NF: ${p.numero_nf}</span>` : '',
      p.complemento   ? `<span>${p.complemento}</span>`   : '',
      p.telefone      ? `<span>📞 ${p.telefone}</span>`   : '',
      p.recebedor     ? `<span>👤 Recebedor: ${p.recebedor}</span>` : '',
    ].filter(Boolean).join('');
    const obsMotoboyHtml = p.observacao_motoboy
      ? `<div class="obs-motoboy">💬 Obs. motoboy: ${p.observacao_motoboy}</div>` : '';

    return `
      <div class="ponto ${p.status === 'entregue' ? 'entregue' : ''}">
        <div class="ponto-header">
          <div class="ponto-num" style="background:${cor}">${i + 1}</div>
          <div class="ponto-info">
            <div class="ponto-label">ENTREGA ${i + 1}</div>
            <div class="ponto-end">${p.endereco || '—'}</div>
            ${extras ? `<div class="ponto-extras">${extras}</div>` : ''}
          </div>
          <div class="ponto-status ${p.status}">${p.status || '—'}</div>
        </div>
        ${obsMotoboyHtml}
        ${horarios ? `<div class="horarios">${horarios}</div>` : ''}
        ${fotosHtml}
      </div>`;
  }).join('');

  const kmStr = d.distancia_km && parseFloat(d.distancia_km) > 0
    ? parseFloat(d.distancia_km).toFixed(1) + ' km' : '—';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Protocolo ${d.protocolo} — ${nomeEmpresa}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a2433; background: #fff; }
    .page { max-width: 680px; margin: 0 auto; padding: 24px 20px; }

    /* Cabeçalho */
    .cabecalho { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 2.5px solid ${cor}; margin-bottom: 20px; }
    .logo-area { display: flex; align-items: center; gap: 10px; }
    .logo-area img { height: 36px; object-fit: contain; }
    .empresa-nome { font-size: 18px; font-weight: 800; color: ${cor}; }
    .protocolo-badge { font-size: 15px; font-weight: 800; color: ${cor}; text-align: right; }
    .protocolo-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8AA2BE; }

    /* Bloco de info geral */
    .info-geral { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; background: #F5F8FC; border-radius: 10px; padding: 14px 16px; }
    .info-item { display: flex; flex-direction: column; gap: 2px; }
    .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: #8AA2BE; font-weight: 600; }
    .info-val { font-size: 13px; font-weight: 600; color: #0F2740; }
    .status-entregue { color: #1D9E75; } .status-cancelada { color: #D93025; }

    /* Coleta */
    .coleta-bloco { border: 1.5px solid #042C53; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; background: #EFF6FF; }
    .coleta-label { font-size: 10px; font-weight: 700; color: #042C53; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
    .coleta-apelido { font-size: 13px; font-weight: 700; color: #042C53; }
    .coleta-end { font-size: 12px; color: #486485; margin-top: 2px; }

    /* Pontos */
    .pontos-titulo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #8AA2BE; margin-bottom: 10px; }
    .ponto { border: 1.5px solid #CBD8E8; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
    .ponto.entregue { border-color: #1D9E75; }
    .ponto-header { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; }
    .ponto-num { width: 26px; height: 26px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 11px; flex: none; margin-top: 1px; }
    .ponto-info { flex: 1; min-width: 0; }
    .ponto-label { font-size: 10px; font-weight: 700; color: ${cor}; text-transform: uppercase; letter-spacing: .06em; }
    .ponto-end { font-size: 12.5px; color: #0F2740; margin-top: 2px; }
    .ponto-extras { font-size: 11px; color: #6B7A8F; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 8px; }
    .ponto-status { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; flex: none; margin-left: auto; }
    .ponto-status.entregue { background: #E1F5EE; color: #1D9E75; }
    .ponto-status.pendente { background: #F0F4F8; color: #6B7A8F; }
    .ponto-status.falha { background: #FAECEA; color: #D93025; }
    .horarios { display: flex; gap: 14px; padding: 6px 12px; border-top: 0.5px solid #E2EAF0; background: #FAFBFC; flex-wrap: wrap; }
    .hora { font-size: 11px; font-weight: 600; }
    .hora.chegou { color: #185FA5; }
    .hora.entregue { color: #1D9E75; }
    .fotos-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #8AA2BE; padding: 6px 12px 4px; border-top: 0.5px solid #E2EAF0; }
    .fotos-section { padding: 8px 12px 14px; display: flex; flex-direction: column; gap: 12px; }
    .foto-full { width: 100%; border-radius: 10px; border: 1px solid #CBD8E8; display: block; page-break-inside: avoid; }
    /* Observação motoboy */
    .obs-motoboy { background:#FFFBEB; border-left:3px solid #F59E0B; border-radius:0 6px 6px 0; padding:6px 10px; font-size:11.5px; color:#92400E; margin-top:4px; }

    /* Rodapé */
    .rodape { margin-top: 28px; padding-top: 14px; border-top: 1px solid #E2EAF0; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #8AA2BE; }

    /* Impressão */
    @media print {
      body { font-size: 12px; }
      .btn-imprimir { display: none !important; }
      .page { padding: 8px; max-width: 100%; }
      @page { margin: 1cm; }
    }

    .btn-imprimir {
      position: fixed; bottom: 24px; right: 24px;
      background: ${cor}; color: #fff; border: none; border-radius: 10px;
      padding: 12px 20px; font-size: 13px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.2);
    }
  </style>
</head>
<body>
<div class="page">

  <div class="cabecalho">
    <div class="logo-area">
      ${d.logo_url ? `<img src="${d.logo_url}" alt="${nomeEmpresa}" />` : ''}
      <span class="empresa-nome">${nomeEmpresa}</span>
    </div>
    <div>
      <div class="protocolo-label">Protocolo</div>
      <div class="protocolo-badge">${d.protocolo}</div>
    </div>
  </div>

  <div class="info-geral">
    <div class="info-item">
      <span class="info-label">Status</span>
      <span class="info-val status-${d.status}">${d.status === 'entregue' ? '✓ Entregue' : d.status === 'cancelada' ? '✗ Cancelada' : d.status}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Motoboy</span>
      <span class="info-val">${d.motoboy_nome || '—'}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Criada em</span>
      <span class="info-val">${fmtDataHtml(d.criado_em)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Concluída em</span>
      <span class="info-val">${fmtDataHtml(d.concluida_em)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Distância</span>
      <span class="info-val">${kmStr}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Telefone motoboy</span>
      <span class="info-val">${d.motoboy_telefone || '—'}</span>
    </div>
  </div>

  <div class="coleta-bloco">
    <div class="coleta-label">📍 Coleta</div>
    ${d.coleta_nome ? `<div class="coleta-apelido">${d.coleta_nome}</div>` : ''}
    <div class="coleta-end">${d.coleta_endereco || '—'}</div>
  </div>

  <div class="pontos-titulo">Pontos de entrega (${pontos.length})</div>
  ${pontosHtml}

  <div class="rodape">
    <span>Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}</span>
    <span>Logix · Gestão de Entregas</span>
  </div>

</div>

<button class="btn-imprimir" onclick="window.print()">
  🖨 Imprimir / Salvar PDF
</button>

</body>
</html>`;
}

module.exports.gerarProtocoloHtml = gerarProtocoloHtml;
