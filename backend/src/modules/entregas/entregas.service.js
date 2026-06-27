const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, ERRO_MSGS, STATUS_ENTREGA } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { geocodificar, otimizarRota, tracarRota } = require('../../integracoes/openrouteservice');
const { emitirParaEmpresa } = require('../../realtime/ws');
const sh = require('./entregas.shared');

// Garante coordenadas: usa lat/lng informadas ou geocodifica o endereço.
async function comCoordenadas(ponto) {
  if (ponto.lat && ponto.lng) return ponto;
  return { ...ponto, ...(await geocodificar(ponto.endereco)) };
}

// Lança uma nova entrega: geocoding, otimização de rota e gravação transacional.
async function criarEntrega({ empresaId, lojaId = null, criadoPor, coleta, destinos, distribuicao = 'automatica', motoboyId = null, ip }) {
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
      `INSERT INTO entregas (empresa_id, loja_id, protocolo, motoboy_id, status, distribuicao,
         coleta_nome, coleta_endereco, coleta_lat, coleta_lng, distancia_km, tempo_estimado_min, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [empresaId, lojaId, protocolo, motoboyId, status, distribuicao, coleta.nome || null, coleta.endereco,
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

async function listar({ empresaId, status, motoboyId, lojaId = null }) {
  const cond = ['e.empresa_id = $1']; const params = [empresaId];
  if (status) { params.push(status); cond.push(`e.status = $${params.length}`); }
  if (motoboyId) { params.push(motoboyId); cond.push(`e.motoboy_id = $${params.length}`); }
  if (lojaId) { params.push(lojaId); cond.push(`e.loja_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.motoboy_id, e.status, e.distancia_km, e.tempo_estimado_min,
             e.coleta_endereco, e.criado_em, e.loja_id,
             m.nome_completo AS motoboy_nome,
             (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco
       FROM entregas e
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
       WHERE ${cond.join(' AND ')} ORDER BY e.criado_em DESC LIMIT 200`,
    params
  );
  return rows;
}

async function listarConcluidas({ empresaId, de, ate, motoboyId, status, lojaId = null }) {
  const cond = ['e.empresa_id = $1']; const params = [empresaId];
  // status: 'entregue' | 'cancelada' | null (todas)
  if (status === 'entregue') cond.push("e.status = 'entregue'");
  else if (status === 'cancelada') cond.push("e.status = 'cancelada'");
  else cond.push("e.status IN ('entregue','cancelada')");
  if (de) { params.push(de); cond.push(`e.criado_em >= $${params.length}`); }
  if (ate) { params.push(ate); cond.push(`e.criado_em <= $${params.length}`); }
  if (motoboyId) { params.push(motoboyId); cond.push(`e.motoboy_id = $${params.length}`); }
  if (lojaId) { params.push(lojaId); cond.push(`e.loja_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.status, e.motoboy_id,
            -- Usa distancia_km do banco; se null/zero/NaN e existem coordenadas de coleta e destino,
            -- calcula haversine entre ponto de coleta e primeiro destino
            COALESCE(
              CASE WHEN e.distancia_km = 0 OR e.distancia_km = 'NaN'::numeric THEN NULL ELSE e.distancia_km END,
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
async function detalharConcluida({ empresaId, id, lojaId = null }) {
  const { rows: ent } = await query(
    `SELECT e.*, m.nome_completo AS motoboy_nome, m.foto_url AS motoboy_foto, m.telefone_principal AS motoboy_telefone
     FROM entregas e LEFT JOIN motoboys m ON m.id = e.motoboy_id
     WHERE e.id = $1 AND e.empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  // Isolamento por loja: usuário de loja não acessa entrega de outra loja.
  if (lojaId && ent[0].loja_id && ent[0].loja_id !== lojaId) {
    throw AppError.naoEncontrado('Entrega não encontrada');
  }

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

  // FIX KM: calcular haversine se distancia_km for null ou zero.
  // Se a coleta não tem coordenada mas tem endereço, geocodifica e persiste —
  // assim entregas de ponto único (sem coleta_lat) passam a exibir km.
  let distanciaKm = e.distancia_km;
  const kmInvalido = distanciaKm == null || Number.isNaN(Number(distanciaKm)) || parseFloat(distanciaKm) === 0;
  if (kmInvalido) {
    try {
      let coletaLat = e.coleta_lat, coletaLng = e.coleta_lng;
      if ((!coletaLat || !coletaLng) && e.coleta_endereco) {
        try {
          const g = await geocodificar(e.coleta_endereco);
          if (g && g.lat && g.lng) {
            coletaLat = g.lat; coletaLng = g.lng;
            query(
              `UPDATE entregas SET coleta_lat = $1, coleta_lng = $2
               WHERE id = $3 AND (coleta_lat IS NULL OR coleta_lng IS NULL)`,
              [coletaLat, coletaLng, id]
            ).catch(() => {});
          }
        } catch { /* geocoding indisponível */ }
      }

      const pontosComCoord = pontos.filter(p => p.lat && p.lng)
        .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
      const coleta = (coletaLat && coletaLng)
        ? { lat: parseFloat(coletaLat), lng: parseFloat(coletaLng) }
        : (pontosComCoord[0] || null); // fallback: usa 1º ponto como origem
      const pts = coleta
        ? (coleta === pontosComCoord[0] ? pontosComCoord : [coleta, ...pontosComCoord])
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
        query(`UPDATE entregas SET distancia_km = $1 WHERE id = $2 AND (distancia_km IS NULL OR distancia_km = 0 OR distancia_km = 'NaN'::numeric)`, [distanciaKm, id]).catch(() => {});
      }
    } catch {}
  }

  // Garante que NaN nunca vaze para o front (renderiza como '—' corretamente).
  if (distanciaKm != null && Number.isNaN(Number(distanciaKm))) distanciaKm = null;

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

// ── Tela de Acompanhamento (central) ──────────────────────────────────────────
// Retorna as corridas separadas em 3 seções, com filtros opcionais.
// Filtros: lojaIds[] (OR), cidades[] (OR, via cidade da loja), de/ate (range de datas).
// q (busca): quando presente, IGNORA os demais filtros e procura em protocolo/NF/endereço.
// lojaIdToken: trava de segurança — usuário de loja só vê a própria, sempre.
async function listarAcompanhamento({ empresaId, lojaIds = null, cidades = null, de = null, ate = null, q = null, lojaIdToken = null }) {
  const cond = ['e.empresa_id = $1']; const params = [empresaId];

  // Trava de segurança: usuário de loja nunca escapa da própria loja.
  if (lojaIdToken) { params.push(lojaIdToken); cond.push(`e.loja_id = $${params.length}`); }

  const buscando = q && String(q).trim();
  if (buscando) {
    // Busca = override temporário: ignora loja/cidade/data, procura em tudo.
    params.push(`%${String(q).trim()}%`);
    const i = params.length;
    cond.push(`(e.protocolo ILIKE $${i}
       OR e.coleta_endereco ILIKE $${i}
       OR EXISTS (SELECT 1 FROM entregas_pontos ep WHERE ep.entrega_id = e.id AND (ep.numero_nf ILIKE $${i} OR ep.endereco ILIKE $${i})))`);
  } else {
    if (Array.isArray(lojaIds) && lojaIds.length) {
      params.push(lojaIds); cond.push(`e.loja_id = ANY($${params.length}::uuid[])`);
    }
    if (Array.isArray(cidades) && cidades.length) {
      params.push(cidades);
      cond.push(`e.loja_id IN (SELECT id FROM lojas WHERE empresa_id = $1 AND cidade = ANY($${params.length}::text[]))`);
    }
    if (de) { params.push(de); cond.push(`e.criado_em >= $${params.length}`); }
    if (ate) { params.push(ate); cond.push(`e.criado_em <= $${params.length}`); }
  }

  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.status, e.distancia_km, e.criado_em, e.concluida_em,
            e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng, e.loja_id,
            l.nome_fantasia AS loja_nome, l.cidade AS loja_cidade, l.estado AS loja_uf,
            m.id AS motoboy_id, m.codigo AS motoboy_codigo, m.nome_completo AS motoboy_nome, m.telefone_principal AS motoboy_telefone,
            (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco,
            (SELECT ep.lat FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_lat,
            (SELECT ep.lng FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_lng,
            (SELECT count(*)::int FROM entregas_pontos ep WHERE ep.entrega_id = e.id) AS total_pontos
       FROM entregas e
       LEFT JOIN lojas l    ON l.id = e.loja_id
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
      WHERE ${cond.join(' AND ')}
      ORDER BY e.criado_em DESC
      LIMIT 500`,
    params
  );

  // Carrega config de SLA (geral da empresa + específicas por loja) para calcular o status.
  const slaCfgs = await query(
    `SELECT loja_id, faixas, minutos_atencao, minutos_iminente, sla_padrao_min
       FROM sla_config WHERE empresa_id = $1 AND ativo = TRUE`,
    [empresaId]
  );
  const slaGeral = slaCfgs.rows.find(c => c.loja_id == null) || null;
  const slaPorLoja = new Map(slaCfgs.rows.filter(c => c.loja_id != null).map(c => [c.loja_id, c]));

  const semAssociacao = [], emAndamento = [], concluidas = [], canceladas = [];
  for (const r of rows) {
    const cfg = slaPorLoja.get(r.loja_id) || slaGeral;
    if (r.status === 'entregue') {
      // veredito final: compara a hora de conclusão com o vencimento
      r.sla = calcularStatusSla(r, cfg, r.concluida_em ? new Date(r.concluida_em).getTime() : Date.now(), true);
    } else if (r.status === 'cancelada') {
      r.sla = null;
    } else {
      // em aberto: compara com agora
      r.sla = calcularStatusSla(r, cfg, Date.now(), false);
    }
    if (r.status === 'aguardando_atribuicao') semAssociacao.push(r);
    else if (['aguardando_coleta', 'em_coleta', 'em_rota'].includes(r.status)) emAndamento.push(r);
    else if (r.status === 'cancelada') canceladas.push(r);
    else concluidas.push(r); // entregue
  }
  return { semAssociacao, emAndamento, concluidas, canceladas, buscando: !!buscando,
    totais: { semAssociacao: semAssociacao.length, emAndamento: emAndamento.length, concluidas: concluidas.length, canceladas: canceladas.length } };
}

// Calcula o status de SLA de uma corrida com base na config (faixas por km).
// `momento` = instante de referência (Date.now() para ativas; concluida_em para finalizadas).
// `final` = true quando é veredito de corrida concluída (só No prazo / Fora do prazo).
// Retorna { nivel, rotulo, vencimentoIso, minutosRestantes, final } ou null se sem config.
function calcularStatusSla(corrida, cfg, momento = Date.now(), final = false) {
  if (!cfg) return null;
  const km = corrida.distancia_km != null ? Number(corrida.distancia_km) : null;
  let minutos = cfg.sla_padrao_min || 90;
  if (km != null && Array.isArray(cfg.faixas) && cfg.faixas.length) {
    const faixa = [...cfg.faixas].sort((a, b) => a.ate_km - b.ate_km).find(f => km <= f.ate_km);
    if (faixa && faixa.minutos) minutos = faixa.minutos;
  }
  const criado = new Date(corrida.criado_em).getTime();
  const vencimento = criado + minutos * 60000;
  const restanteMin = Math.round((vencimento - momento) / 60000);
  const atencao = cfg.minutos_atencao ?? 30;
  const iminente = cfg.minutos_iminente ?? 15;

  let nivel, rotulo;
  if (final) {
    // veredito de corrida concluída: só dois resultados
    if (restanteMin < 0) { nivel = 'fora_prazo'; rotulo = 'Fora do prazo'; }
    else { nivel = 'no_prazo'; rotulo = 'No prazo'; }
  } else {
    if (restanteMin < 0) { nivel = 'fora_prazo'; rotulo = 'Fora do prazo'; }
    else if (restanteMin <= iminente) { nivel = 'iminente'; rotulo = 'Atraso iminente'; }
    else if (restanteMin <= atencao) { nivel = 'atencao'; rotulo = 'Atenção'; }
    else { nivel = 'no_prazo'; rotulo = 'No prazo'; }
  }
  return { nivel, rotulo, vencimentoIso: new Date(vencimento).toISOString(), minutosRestantes: restanteMin, final };
}

// Trajeto GPS de uma entrega: pontos do rastreamento (ordenados) + coleta + destinos.
// Usado pelo botão "ver rota" no acompanhamento. Em entregas concluídas mostra o caminho real.
async function trajetoEntrega({ empresaId, id }) {
  const ent = await query(
    `SELECT e.id, e.protocolo, e.status, e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
            m.nome_completo AS motoboy_nome
       FROM entregas e LEFT JOIN motoboys m ON m.id = e.motoboy_id
      WHERE e.id = $1 AND e.empresa_id = $2`,
    [id, empresaId]
  );
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');

  const pontos = await query(
    `SELECT id, ordem, endereco, lat, lng, status FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`,
    [id]
  );
  const trajeto = await query(
    `SELECT lat, lng, capturado_em FROM rastreamento WHERE entrega_id = $1 ORDER BY capturado_em ASC`,
    [id]
  );

  const coleta = ent.rows[0].coleta_lat != null ? { lat: Number(ent.rows[0].coleta_lat), lng: Number(ent.rows[0].coleta_lng), endereco: ent.rows[0].coleta_endereco } : null;
  const destinos = pontos.rows.filter(p => p.lat != null).map(p => ({ lat: Number(p.lat), lng: Number(p.lng), endereco: p.endereco, ordem: p.ordem, status: p.status }));

  // Rota traçada pelas ruas (coleta -> destinos). Se o ORS falhar, segue sem ela.
  let rota = { coordenadas: [], distanciaKm: 0, duracaoMin: 0 };
  try {
    const seq = [];
    if (coleta) seq.push(coleta);
    destinos.forEach(d => seq.push(d));
    if (seq.length >= 2) rota = await tracarRota(seq);
  } catch { /* sem rota traçada */ }

  return {
    entrega: ent.rows[0],
    coleta,
    destinos,
    trajeto: trajeto.rows.map(t => ({ lat: Number(t.lat), lng: Number(t.lng), em: t.capturado_em })),
    rota, // { coordenadas: [[lat,lng],...], distanciaKm, duracaoMin }
  };
}

// Rota otimizada para um conjunto de entregas (despacho em lote).
// Pega as entregas selecionadas, usa a coleta como origem e otimiza a ordem dos destinos.
// retornar=true considera o motoboy voltando à coleta no fim.
// Retorna a sequência sugerida + a geometria da rota pelas ruas.
// Distância aproximada em km entre dois pontos (haversine).
function _distKm(latA, lngA, latB, lngB) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(latB - latA), dLng = toRad(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Agrupa destinos por DIREÇÃO (rumo a partir da coleta) + DISTÂNCIA entre eles.
// Entregas em direções muito diferentes (> JANELA_ANG) viram grupos separados;
// dentro da mesma direção, pontos muito distantes entre si (> RAIO_KM) também separam.
// Retorna [[idx,idx...], ...] (índices de destinos por grupo).
function agruparDestinos(coleta, destinos) {
  const JANELA_ANG = 75;   // graus: destinos com rumos a até 75° entram no mesmo "leque"
  const RAIO_KM = 6;       // km: dentro do leque, separa se ficarem muito longe entre si

  if (!coleta || destinos.length <= 1) return [destinos.map((_, i) => i)];

  // ordena por rumo (varredura tipo radar)
  const comRumo = destinos.map((d, i) => ({ i, rumo: _rumo(coleta.lat, coleta.lng, d.lat, d.lng), lat: d.lat, lng: d.lng }));
  comRumo.sort((a, b) => a.rumo - b.rumo);

  const grupos = [];
  let atual = [comRumo[0]];
  for (let k = 1; k < comRumo.length; k++) {
    const ant = atual[atual.length - 1];
    const cur = comRumo[k];
    const difRumo = _difAng(ant.rumo, cur.rumo);
    const dist = _distKm(ant.lat, ant.lng, cur.lat, cur.lng);
    // mesmo grupo se a direção é próxima E não está geograficamente longe
    if (difRumo <= JANELA_ANG && dist <= RAIO_KM) {
      atual.push(cur);
    } else {
      grupos.push(atual); atual = [cur];
    }
  }
  grupos.push(atual);

  // junta o último com o primeiro se "fecharem o círculo" na mesma direção (ex: rumos 350° e 10°)
  if (grupos.length >= 2) {
    const primeiro = grupos[0], ultimo = grupos[grupos.length - 1];
    if (_difAng(primeiro[0].rumo, ultimo[ultimo.length - 1].rumo) <= JANELA_ANG &&
        _distKm(primeiro[0].lat, primeiro[0].lng, ultimo[ultimo.length - 1].lat, ultimo[ultimo.length - 1].lng) <= RAIO_KM) {
      grupos[0] = ultimo.concat(primeiro); grupos.pop();
    }
  }
  return grupos.map(g => g.map(x => x.i));
}

// Otimiza um único grupo (sequência interna) e traça a geometria pelas ruas.
async function montarRotaGrupo(coleta, destinosGrupo, retornar) {
  let ordem = destinosGrupo.map((_, i) => i);
  let distanciaKm = 0, duracaoMin = 0;
  if (coleta && destinosGrupo.length >= 2) {
    try {
      const r = await otimizarRota({ coleta, pontos: destinosGrupo, retornar });
      if (Array.isArray(r.ordem) && r.ordem.length) ordem = r.ordem;
      distanciaKm = r.distanciaKm || 0; duracaoMin = r.duracaoMin || 0;
    } catch { /* ordem original */ }
    ordem = corrigirDirecaoOposta(coleta, destinosGrupo, ordem);
  }
  const ordenados = ordem.map((idx, pos) => ({ ...destinosGrupo[idx], sequencia: pos + 1 }));
  let rotaGeo = { coordenadas: [], distanciaKm, duracaoMin };
  if (coleta && ordenados.length >= 1) {
    try {
      const seq = [coleta, ...ordenados];
      if (retornar) seq.push(coleta);
      if (seq.length >= 2) {
        const g = await tracarRota(seq);
        rotaGeo = { coordenadas: g.coordenadas, distanciaKm: g.distanciaKm || distanciaKm, duracaoMin: g.duracaoMin || duracaoMin };
      }
    } catch { /* sem geometria */ }
  }
  return { destinos: ordenados, rota: rotaGeo };
}

// Rota em lote AGRUPADA: separa as entregas em grupos coerentes (direção + distância),
// cada grupo vira uma rota própria. O operador pode forçar grupos via `gruposManual`
// (array de arrays de IDs) — nesse caso usamos exatamente esses grupos.
async function rotaLote({ empresaId, ids, retornar = false, gruposManual = null }) {
  if (!Array.isArray(ids) || !ids.length) throw AppError.validacao('Nenhuma entrega informada');

  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
            (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_endereco,
            (SELECT ep.lat FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_lat,
            (SELECT ep.lng FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem LIMIT 1) AS destino_lng
       FROM entregas e
      WHERE e.empresa_id = $1 AND e.id = ANY($2::uuid[])`,
    [empresaId, ids]
  );
  if (!rows.length) throw AppError.naoEncontrado('Entregas não encontradas');

  const comColeta = rows.find(r => r.coleta_lat != null);
  const coleta = comColeta ? { lat: Number(comColeta.coleta_lat), lng: Number(comColeta.coleta_lng), endereco: comColeta.coleta_endereco } : null;

  const destinos = rows.filter(r => r.destino_lat != null).map(r => ({
    id: r.id, protocolo: r.protocolo, endereco: r.destino_endereco,
    lat: Number(r.destino_lat), lng: Number(r.destino_lng),
  }));

  // Define os grupos (índices em `destinos`).
  let gruposIdx;
  if (Array.isArray(gruposManual) && gruposManual.length) {
    // operador definiu os grupos manualmente (por ID) — converte para índices
    const idxPorId = new Map(destinos.map((d, i) => [d.id, i]));
    gruposIdx = gruposManual.map(g => g.map(id => idxPorId.get(id)).filter(i => i != null)).filter(g => g.length);
  } else {
    gruposIdx = agruparDestinos(coleta, destinos);
  }

  // Monta cada grupo como uma rota própria.
  const cores = ['#185FA5', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#be185d', '#65a30d'];
  const grupos = [];
  for (let gi = 0; gi < gruposIdx.length; gi++) {
    const destinosGrupo = gruposIdx[gi].map(i => destinos[i]);
    const r = await montarRotaGrupo(coleta, destinosGrupo, retornar);
    grupos.push({
      indice: gi,
      cor: cores[gi % cores.length],
      destinos: r.destinos,
      rota: r.rota,
    });
  }

  return {
    coleta,
    grupos,
    retornar,
    semCoordenada: rows.filter(r => r.destino_lat == null).map(r => ({ id: r.id, protocolo: r.protocolo })),
  };
}

// Rumo (bearing) de A->B em graus 0..360.
function _rumo(latA, lngA, latB, lngB) {
  const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  const dLng = toRad(lngB - lngA);
  const y = Math.sin(dLng) * Math.cos(toRad(latB));
  const x = Math.cos(toRad(latA)) * Math.sin(toRad(latB)) - Math.sin(toRad(latA)) * Math.cos(toRad(latB)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
// Diferença angular mínima entre dois rumos (0..180).
function _difAng(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

// Ordena destinos por varredura angular a partir da coleta (vizinho mais coerente
// em direção), evitando saltos para lados opostos. Heurística "radar + vizinho próximo".
function _ordemAngular(coleta, destinos) {
  // rumo de cada destino em relação à coleta
  const comRumo = destinos.map((d, i) => ({ i, rumo: _rumo(coleta.lat, coleta.lng, d.lat, d.lng) }));
  // começa pelo destino mais próximo angularmente de "norte" e segue varrendo no sentido
  comRumo.sort((a, b) => a.rumo - b.rumo);
  return comRumo.map(x => x.i);
}

// Se a sequência do ORS tiver reversões bruscas de direção (mandar para lados
// opostos), troca pela ordenação angular, que mantém o motoboy "ganhando direção".
function corrigirDirecaoOposta(coleta, destinos, ordemORS) {
  if (destinos.length < 3) return ordemORS;
  // mede a pior reversão de rumo entre passos consecutivos da rota do ORS
  let piorReversao = 0;
  const pts = [coleta, ...ordemORS.map(i => destinos[i])];
  for (let k = 1; k < pts.length - 1; k++) {
    const r1 = _rumo(pts[k - 1].lat, pts[k - 1].lng, pts[k].lat, pts[k].lng);
    const r2 = _rumo(pts[k].lat, pts[k].lng, pts[k + 1].lat, pts[k + 1].lng);
    piorReversao = Math.max(piorReversao, _difAng(r1, r2));
  }
  // se houver uma guinada > 120° (vai para um lado e volta para o oposto), usa a angular
  if (piorReversao > 120) return _ordemAngular(coleta, destinos);
  return ordemORS;
}

// Cidades distintas das lojas da empresa — alimenta o filtro de "região" (checkbox).
async function listarCidadesLojas(empresaId) {
  const { rows } = await query(
    `SELECT DISTINCT cidade, estado FROM lojas
      WHERE empresa_id = $1 AND cidade IS NOT NULL AND cidade <> ''
      ORDER BY cidade`,
    [empresaId]
  );
  return rows;
}

// Edita os endereços/observações dos pontos e/ou da coleta de uma entrega ativa.
// Só permite enquanto a entrega não foi concluída/cancelada.
async function editarEnderecos({ empresaId, id, coleta, pontos, usuarioId, ip }) {
  const { rows: ent } = await query(`SELECT id, status FROM entregas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (['entregue', 'cancelada'].includes(ent[0].status))
    throw AppError.validacao(`Entrega já está ${ent[0].status} — não pode ser editada`);

  // Atualiza coleta (se enviada). Re-geocodifica se vier endereço sem coordenada.
  if (coleta && coleta.endereco) {
    let { lat, lng } = coleta;
    if ((!lat || !lng)) { try { const g = await geocodificar(coleta.endereco); lat = g.lat; lng = g.lng; } catch {} }
    await query(
      `UPDATE entregas SET coleta_nome = COALESCE($2, coleta_nome), coleta_endereco = $3, coleta_lat = $4, coleta_lng = $5 WHERE id = $1`,
      [id, coleta.nome || null, coleta.endereco, lat || null, lng || null]
    );
  }

  // Atualiza pontos individuais (cada item: { id, endereco, observacoes }).
  if (Array.isArray(pontos)) {
    for (const p of pontos) {
      if (!p.id) continue;
      let lat = p.lat, lng = p.lng;
      if (p.endereco && (!lat || !lng)) { try { const g = await geocodificar(p.endereco); lat = g.lat; lng = g.lng; } catch {} }
      await query(
        `UPDATE entregas_pontos SET
           endereco = COALESCE($2, endereco),
           lat = COALESCE($3, lat), lng = COALESCE($4, lng),
           observacoes = COALESCE($5, observacoes)
         WHERE id = $1 AND entrega_id = $6`,
        [p.id, p.endereco || null, lat || null, lng || null, p.observacoes ?? null, id]
      );
    }
  }

  registrarAuditoria({ empresaId, usuarioId, categoria: 'entregas', acao: 'editar_enderecos', detalhe: { id }, ip }).catch(() => {});
  emitirParaEmpresa(empresaId, 'entrega.status', { id });
  return { ok: true };
}

// Finaliza manualmente uma entrega (admin marca como entregue sem passar pelo app).
async function finalizarManual({ empresaId, id, usuarioId, ip }) {
  const { rows: ent } = await query(`SELECT id, status, protocolo, iniciada_em, criado_em FROM entregas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (['entregue', 'cancelada'].includes(ent[0].status))
    throw AppError.validacao(`Entrega já está ${ent[0].status}`);

  // Marca todos os pontos pendentes como entregues e a entrega como concluída.
  await query(`UPDATE entregas_pontos SET status = 'entregue', entregue_em = COALESCE(entregue_em, now()), finalizado_em = COALESCE(finalizado_em, now()) WHERE entrega_id = $1 AND status != 'entregue'`, [id]);
  await query(
    `UPDATE entregas SET status = 'entregue', concluida_em = now(),
        tempo_total_min = ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(iniciada_em, criado_em))) / 60)
     WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  registrarAuditoria({ empresaId, usuarioId, categoria: 'entregas', acao: 'finalizar_manual', detalhe: { id }, ip }).catch(() => {});
  emitirParaEmpresa(empresaId, 'entrega.concluida', { id, protocolo: ent[0].protocolo });
  return { ok: true };
}

// Reabre uma corrida concluída: volta para a fila de atribuição (Sem associação)
// e remove o motoboy. Os pontos voltam para pendente.
async function reabrirEntrega({ empresaId, id, usuarioId, ip }) {
  const { rows: ent } = await query(`SELECT id, status, protocolo FROM entregas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (!['entregue', 'cancelada'].includes(ent[0].status)) throw AppError.validacao('Só é possível reabrir corridas concluídas ou canceladas');

  await query(`UPDATE entregas_pontos SET status = 'pendente', entregue_em = NULL, finalizado_em = NULL WHERE entrega_id = $1`, [id]);
  await query(
    `UPDATE entregas SET status = 'aguardando_atribuicao', motoboy_id = NULL,
        concluida_em = NULL, iniciada_em = NULL, tempo_total_min = NULL,
        cancelada_em = NULL, cancelado_por = NULL, motivo_cancelamento = NULL
     WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  registrarAuditoria({ empresaId, usuarioId, categoria: 'entregas', acao: 'reabrir', detalhe: { id, deStatus: ent[0].status }, ip }).catch(() => {});
  emitirParaEmpresa(empresaId, 'entrega.reaberta', { id, protocolo: ent[0].protocolo });
  return { ok: true, protocolo: ent[0].protocolo };
}

// Monta a timeline (logs) de uma corrida: criação, atribuições, edições, coleta,
// entregas de pontos, cancelamento, reabertura — por admin ou pelo motoboy.
async function logsEntrega({ empresaId, id }) {
  const { rows: ent } = await query(
    `SELECT e.id, e.protocolo, e.criado_em, e.iniciada_em, e.concluida_em, e.cancelada_em,
            e.status, e.criado_por, u.nome AS criado_por_nome
       FROM entregas e LEFT JOIN usuarios u ON u.id = e.criado_por
      WHERE e.id = $1 AND e.empresa_id = $2`,
    [id, empresaId]
  );
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  const e = ent[0];

  const eventos = [];
  // 1) Criação
  eventos.push({ em: e.criado_em, tipo: 'criada', titulo: 'Corrida criada', autor: e.criado_por_nome || 'Sistema', origem: 'central' });

  // 2) Auditoria relacionada a esta entrega (detalhe contém o id/entregaId, ou ids[] no lote)
  const { rows: audit } = await query(
    `SELECT a.acao, a.detalhe, a.criado_em, a.usuario_id, u.nome AS autor
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.empresa_id = $1
        AND a.categoria IN ('entregas','entrega','ENTREGA','filas','fila')
        AND (
          a.detalhe->>'entregaId' = $2 OR a.detalhe->>'id' = $2
          OR (a.detalhe ? 'ids' AND a.detalhe->'ids' @> to_jsonb($2::text))
        )
      ORDER BY a.criado_em ASC`,
    [empresaId, id]
  );
  const rotulos = {
    'atribuir': 'Motoboy atribuído', 'atribuir-lote': 'Atribuída em lote', 'reatribuir': 'Motoboy trocado',
    'disparar-oferta': 'Oferta disparada (raio)', 'editar_enderecos': 'Endereços editados',
    'cancelar': 'Corrida cancelada', 'finalizar_manual': 'Finalizada manualmente', 'reabrir': 'Corrida reaberta',
  };
  for (const a of audit) {
    eventos.push({ em: a.criado_em, tipo: a.acao, titulo: rotulos[a.acao] || a.acao, autor: a.autor || 'Sistema', origem: 'central', detalhe: a.detalhe || null });
  }

  // 3) Marcos da própria entrega (coleta/conclusão), úteis mesmo sem auditoria
  if (e.iniciada_em) eventos.push({ em: e.iniciada_em, tipo: 'iniciada', titulo: 'Coleta iniciada', autor: 'Motoboy', origem: 'app' });
  if (e.concluida_em) eventos.push({ em: e.concluida_em, tipo: 'concluida', titulo: 'Corrida concluída', autor: 'Motoboy', origem: 'app' });
  if (e.cancelada_em) eventos.push({ em: e.cancelada_em, tipo: 'cancelada', titulo: 'Corrida cancelada', autor: 'Central', origem: 'central' });

  // 4) Entregas de pontos (cada destino finalizado pelo motoboy)
  const { rows: pontos } = await query(
    `SELECT ordem, endereco, status, entregue_em, recebedor FROM entregas_pontos
      WHERE entrega_id = $1 AND entregue_em IS NOT NULL ORDER BY entregue_em ASC`,
    [id]
  );
  for (const p of pontos) {
    eventos.push({ em: p.entregue_em, tipo: 'ponto_entregue', titulo: `Ponto ${p.ordem} entregue`, autor: 'Motoboy', origem: 'app', detalhe: { endereco: p.endereco, recebedor: p.recebedor } });
  }

  // ordena por data
  eventos.sort((a, b) => new Date(a.em) - new Date(b.em));
  return { protocolo: e.protocolo, status: e.status, eventos };
}

// Detalhes completos dos pontos de uma corrida (coleta + todos os destinos com
// razão social, telefone, nº da nota, complemento, observações).
async function detalhesPontos({ empresaId, id }) {
  const { rows: ent } = await query(
    `SELECT e.id, e.protocolo, e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
            l.nome_fantasia AS loja_nome
       FROM entregas e LEFT JOIN lojas l ON l.id = e.loja_id
      WHERE e.id = $1 AND e.empresa_id = $2`,
    [id, empresaId]
  );
  if (!ent[0]) throw AppError.naoEncontrado('Entrega não encontrada');

  const { rows: pontos } = await query(
    `SELECT ordem, nome, nome_fantasia, endereco, complemento, telefone, numero_nf,
            observacoes, status, recebedor, entregue_em, lat, lng
       FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`,
    [id]
  );
  return {
    protocolo: ent[0].protocolo,
    loja_nome: ent[0].loja_nome,
    coleta: { nome: ent[0].coleta_nome, endereco: ent[0].coleta_endereco, lat: ent[0].coleta_lat, lng: ent[0].coleta_lng },
    pontos,
  };
}

module.exports = { cancelarEntrega,
  criarEntrega, obter, listar, listarConcluidas, detalharConcluida, acompanhar, registrarPosicao, registrarProtocoloPonto,
  listarAcompanhamento, listarCidadesLojas, trajetoEntrega, rotaLote, editarEnderecos, finalizarManual, reabrirEntrega, logsEntrega, detalhesPontos,
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
            ep.observacao_motoboy,
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
