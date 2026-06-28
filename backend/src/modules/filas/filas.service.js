const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, STATUS_ENTREGA } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { emitirParaEmpresa, emitirParaMotoboy } = require('../../realtime/ws');
const { notificarMotoboy } = require('../../shared/push');

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

// ── Regras de acionamento efetivas de uma corrida ─────────────────
// Junta: regras do cliente (raio, máx corridas, só online) + a modalidade da
// corrida (e se ela é "só exclusivos"). Cai em defaults se não houver config.
async function regrasDaEntrega(empresaId, entrega) {
  const lojaId = entrega.loja_id || null;
  const modalidadeId = entrega.modalidade_id || null;

  // Regras gerais do cliente.
  let regras = { max_corridas_motoboy: 3, raio_km: 5, somente_online: true };
  if (lojaId) {
    const r = await query(
      `SELECT max_corridas_motoboy, raio_km, somente_online
         FROM cliente_regras_acionamento WHERE loja_id = $1`,
      [lojaId]
    );
    if (r.rows[0]) regras = r.rows[0];
  }

  // Modalidade da corrida: é exclusiva?
  let soExclusivos = false;
  if (modalidadeId) {
    const m = await query(`SELECT so_exclusivos FROM cliente_modalidades WHERE id = $1`, [modalidadeId]);
    if (m.rows[0]) soExclusivos = !!m.rows[0].so_exclusivos;
  }

  // Se exclusiva, quais motoboys estão atribuídos a este cliente nesta modalidade
  // (ou em "todas as modalidades", quando modalidade_id da atribuição é NULL).
  let exclusivosSet = null;
  if (soExclusivos && lojaId) {
    const ex = await query(
      `SELECT motoboy_id FROM cliente_motoboys
        WHERE loja_id = $1 AND (modalidade_id = $2 OR modalidade_id IS NULL)`,
      [lojaId, modalidadeId]
    );
    exclusivosSet = new Set(ex.rows.map(r => r.motoboy_id));
  }

  return {
    maxCorridas: Number(regras.max_corridas_motoboy) || 3,
    raioKm: Number(regras.raio_km) || 5,
    somenteOnline: regras.somente_online !== false,
    soExclusivos,
    exclusivosSet, // Set de motoboy_id, ou null se não exclusiva
  };
}

// Filtra uma lista de motoboys disponíveis pelas regras: máx corridas e
// exclusividade. Retorna { elegiveis, descartes } com a contagem por motivo
// para montar mensagens de erro explicativas.
function aplicarRegrasElegibilidade(disponiveis, regras) {
  const elegiveis = [];
  const descartes = { porLimite: 0, porExclusividade: 0 };
  for (const d of disponiveis) {
    if ((d.carga || 0) >= regras.maxCorridas) { descartes.porLimite++; continue; }
    if (regras.exclusivosSet && !regras.exclusivosSet.has(d.id)) { descartes.porExclusividade++; continue; }
    elegiveis.push(d);
  }
  return { elegiveis, descartes };
}

// Monta uma mensagem explicativa do porquê ninguém ficou elegível, com base no funil.
// onlineTotal = qtos estavam online; etapa = onde travou ('elegibilidade' | 'raio').
function mensagemFunil({ onlineTotal, regras, descartes, etapa, raioKm, semPosicao = 0, foraDoRaio = 0 }) {
  const partes = [];
  partes.push(`${onlineTotal} motoboy(s) online no momento.`);
  if (regras.soExclusivos) {
    partes.push('Esta modalidade é exclusiva: só recebe motoboys atribuídos a este cliente.');
    if (descartes.porExclusividade) partes.push(`${descartes.porExclusividade} descartado(s) por não serem exclusivos deste cliente.`);
  }
  if (descartes.porLimite) partes.push(`${descartes.porLimite} já no limite de ${regras.maxCorridas} corrida(s) simultânea(s).`);
  if (etapa === 'raio') {
    if (foraDoRaio) partes.push(`${foraDoRaio} fora do raio de ${raioKm} km da coleta.`);
    if (semPosicao) partes.push(`${semPosicao} sem localização GPS recente (não dá pra medir a distância).`);
  }
  return partes.join(' ');
}

// Escolhe o melhor motoboy: mais próximo (se houver posição), senão o menos carregado.
// Respeita as regras de acionamento do cliente (exclusividade, máx corridas).
// Retorna { motoboy } ou { motoboy: null, motivo } com explicação do funil.
async function escolherMotoboy(empresaId, entrega) {
  let disponiveis = await listarDisponiveis(empresaId);
  if (!disponiveis.length) return { motoboy: null, motivo: 'Nenhum motoboy online no momento.' };

  const regras = await regrasDaEntrega(empresaId, entrega);
  const onlineTotal = disponiveis.length;
  const { elegiveis, descartes } = aplicarRegrasElegibilidade(disponiveis, regras);
  if (!elegiveis.length) {
    return { motoboy: null, motivo: mensagemFunil({ onlineTotal, regras, descartes, etapa: 'elegibilidade' }) };
  }
  disponiveis = elegiveis;

  if (entrega.coleta_lat != null && entrega.coleta_lng != null) {
    const ids = disponiveis.map((d) => d.id);
    const { rows } = await query(
      `SELECT DISTINCT ON (motoboy_id) motoboy_id, lat, lng FROM rastreamento
        WHERE motoboy_id = ANY($1::uuid[]) ORDER BY motoboy_id, capturado_em DESC`,
      [ids]
    );
    const pos = new Map(rows.map((r) => [r.motoboy_id, r]));
    const semPosicao = disponiveis.filter(d => !pos.has(d.id)).length;
    let comPos = disponiveis.filter((d) => pos.has(d.id));
    const antesRaio = comPos.length;
    comPos = comPos.filter(d => distanciaKm(entrega, pos.get(d.id)) <= regras.raioKm);
    const foraDoRaio = antesRaio - comPos.length;
    if (comPos.length) {
      comPos.sort((a, b) => distanciaKm(entrega, pos.get(a.id)) - distanciaKm(entrega, pos.get(b.id)));
      return { motoboy: comPos[0] };
    }
    // Ninguém no raio: explica.
    return { motoboy: null, motivo: mensagemFunil({ onlineTotal, regras, descartes, etapa: 'raio', raioKm: regras.raioKm, semPosicao, foraDoRaio }) };
  }
  return { motoboy: disponiveis[0] }; // sem coordenadas: menor carga
}

// Atribui um motoboy a uma entrega da fila.
async function atribuir({ empresaId, entregaId, motoboyId, usuarioId, ip }) {
  const ent = await query(`SELECT id, status, protocolo, loja_id, modalidade_id FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]);
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (ent.rows[0].status !== STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO) throw AppError.validacao('Entrega não está na fila de atribuição');

  const mb = await query(`SELECT id, nome_completo FROM motoboys WHERE id = $1 AND empresa_id = $2 AND online = TRUE AND status = 'ativo'`, [motoboyId, empresaId]);
  if (!mb.rows[0]) throw AppError.validacao('Motoboy indisponível (offline ou inativo)');

  // Regras do cliente: exclusividade da modalidade + limite de corridas.
  const regras = await regrasDaEntrega(empresaId, ent.rows[0]);
  if (regras.exclusivosSet && !regras.exclusivosSet.has(motoboyId)) {
    throw AppError.validacao(`${mb.rows[0].nome_completo} não está atribuído a este cliente nesta modalidade exclusiva. Atribua o motoboy ao cliente em "Gerir cliente → Atribuição de motos" ou escolha um motoboy exclusivo.`);
  }
  const cargaAtual = await query(
    `SELECT count(*)::int AS carga FROM entregas WHERE empresa_id = $1 AND motoboy_id = $2 AND status = ANY($3)`,
    [empresaId, motoboyId, STATUS_ATIVOS]
  );
  const carga = cargaAtual.rows[0]?.carga || 0;
  if (carga >= regras.maxCorridas) {
    throw AppError.validacao(`${mb.rows[0].nome_completo} já tem ${carga} corrida(s) em andamento e o limite deste cliente é ${regras.maxCorridas}. Aumente o limite em "Regras de acionamento" ou aguarde ele finalizar uma corrida.`);
  }

  const { rows } = await query(
    `UPDATE entregas SET motoboy_id = $1, status = $2 WHERE id = $3 RETURNING id, protocolo, status, motoboy_id`,
    [motoboyId, STATUS_ENTREGA.AGUARDANDO_COLETA, entregaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'atribuir', detalhe: { entregaId, motoboyId }, ip });
  emitirParaEmpresa(empresaId, 'entrega.atribuida', { id: entregaId, motoboyId, protocolo: rows[0].protocolo });
  emitirParaMotoboy(motoboyId, 'entrega.atribuida', { entregaId, protocolo: rows[0].protocolo });
  notificarMotoboy(motoboyId, {
    titulo: '📦 Corrida atribuída a você',
    corpo: `A corrida ${rows[0].protocolo} é sua. Toque para abrir.`,
    dados: { tipo: 'atribuida', entregaId },
  }).catch(() => {});
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
  // Tempo real no app do motoboy: um evento por corrida atribuída.
  rows.forEach(r => emitirParaMotoboy(motoboyId, 'entrega.atribuida', { entregaId: r.id, protocolo: r.protocolo }));
  // Uma notificação só, resumindo o lote, para não estourar o celular do motoboy.
  notificarMotoboy(motoboyId, {
    titulo: '📦 Corridas atribuídas a você',
    corpo: rows.length === 1
      ? `A corrida ${rows[0].protocolo} é sua. Toque para abrir.`
      : `${rows.length} corridas foram atribuídas a você. Toque para abrir.`,
    dados: { tipo: 'atribuida_lote', ids: rows.map(r => r.id) },
  }).catch(() => {});
  return { atribuidas: rows.length, protocolos: rows.map(r => r.protocolo), motoboy_nome: mb.rows[0].nome_completo };
}

// Dispara a OFERTA de uma corrida: oferece aos motoboys online dentro do raio
// configurado. Não atribui ninguém ainda — o primeiro a aceitar leva.
async function dispararOferta({ empresaId, entregaId, usuarioId, ip, automatico = false }) {
  const ent = await query(
    `SELECT id, status, protocolo, coleta_lat, coleta_lng, loja_id, modalidade_id FROM entregas WHERE id = $1 AND empresa_id = $2`,
    [entregaId, empresaId]
  );
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  const e = ent.rows[0];
  if (e.status !== STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO) throw AppError.validacao('Entrega não está disponível para disparo');
  if (e.coleta_lat == null || e.coleta_lng == null) throw AppError.validacao('Coleta sem coordenadas — geocodifique antes de disparar');

  // Evita duplicar: se já há uma oferta ativa (ofertada e não expirada) para esta entrega, não dispara outra.
  const jaTem = await query(
    `SELECT 1 FROM entregas_ofertas WHERE entrega_id = $1 AND status = 'ofertada' LIMIT 1`,
    [entregaId]
  );
  if (jaTem.rows[0]) {
    if (automatico) return { jaOfertada: true };
    throw AppError.validacao('Esta corrida já tem uma oferta ativa.');
  }

  // Regras efetivas do cliente (raio, máx corridas, exclusividade da modalidade).
  const regras = await regrasDaEntrega(empresaId, e);
  const raioKm = regras.raioKm;

  // A oferta NÃO expira por tempo: fica disponível até alguém aceitar ou a central cancelar.
  // Mantemos expira_em (coluna NOT NULL) com data distante apenas para satisfazer o schema.
  const expiraEm = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(); // ~10 anos

  // Motoboys online + ativos, filtrados pelas regras (exclusividade + máx corridas).
  let disp = await listarDisponiveis(empresaId);
  if (!disp.length) throw AppError.validacao('Nenhum motoboy online no momento.');
  const onlineTotal = disp.length;
  const { elegiveis, descartes } = aplicarRegrasElegibilidade(disp, regras);
  if (!elegiveis.length) {
    throw AppError.validacao(mensagemFunil({ onlineTotal, regras, descartes, etapa: 'elegibilidade' }));
  }
  disp = elegiveis;

  const ids = disp.map(d => d.id);
  const { rows: posicoes } = await query(
    `SELECT DISTINCT ON (motoboy_id) motoboy_id, lat, lng FROM rastreamento
      WHERE motoboy_id = ANY($1::uuid[]) ORDER BY motoboy_id, capturado_em DESC`,
    [ids]
  );
  const posMap = new Map(posicoes.map(p => [p.motoboy_id, p]));

  // Filtra quem está dentro do raio do cliente.
  const candidatos = [];
  let semPosicao = 0, foraDoRaio = 0;
  for (const d of disp) {
    const p = posMap.get(d.id);
    if (!p) { semPosicao++; continue; }
    const dist = distanciaKm(e, { lat: Number(p.lat), lng: Number(p.lng) });
    if (dist <= raioKm) candidatos.push({ motoboy_id: d.id, distancia_km: Number(dist.toFixed(2)) });
    else foraDoRaio++;
  }
  if (!candidatos.length) {
    throw AppError.validacao(mensagemFunil({ onlineTotal, regras, descartes, etapa: 'raio', raioKm, semPosicao, foraDoRaio }));
  }

  // Cria a oferta + candidatos.
  const ofe = await query(
    `INSERT INTO entregas_ofertas (entrega_id, empresa_id, status, raio_km, expira_em)
     VALUES ($1, $2, 'ofertada', $3, $4) RETURNING id`,
    [entregaId, empresaId, raioKm, expiraEm]
  );
  const ofertaId = ofe.rows[0].id;
  for (const c of candidatos) {
    await query(`INSERT INTO entregas_ofertas_candidatos (oferta_id, motoboy_id, distancia_km) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [ofertaId, c.motoboy_id, c.distancia_km]);
  }

  // Marca a entrega como "ofertada" via campo distribuicao (mantém status na fila).
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'disparar-oferta', detalhe: { entregaId, ofertaId, candidatos: candidatos.length, raioKm, automatico }, ip });
  // Notifica os candidatos (app escuta esse evento por motoboy).
  // Notifica cada candidato individualmente (na sala do próprio motoboy) e a central.
  candidatos.forEach(c => emitirParaMotoboy(c.motoboy_id, 'oferta.nova', { ofertaId, entregaId, protocolo: e.protocolo, distanciaKm: c.distancia_km, expiraEm }));
  // Push com app fechado: avisa cada candidato que há uma corrida disponível.
  candidatos.forEach(c => notificarMotoboy(c.motoboy_id, {
    titulo: '🛵 Nova corrida disponível!',
    corpo: `Corrida ${e.protocolo} a ${c.distancia_km} km de você. Toque para ver.`,
    dados: { tipo: 'oferta', ofertaId, entregaId },
  }).catch(() => {}));
  emitirParaEmpresa(empresaId, 'oferta.disparada', { ofertaId, entregaId, protocolo: e.protocolo, candidatos: candidatos.length });

  return { ofertaId, candidatos: candidatos.length, raioKm, expiraEm };
}

// Motoboy aceita a oferta. Primeiro a aceitar leva (trava por UPDATE condicional).
async function aceitarOferta({ empresaId, ofertaId, motoboyId }) {
  const ofe = await query(`SELECT id, entrega_id, status FROM entregas_ofertas WHERE id = $1 AND empresa_id = $2`, [ofertaId, empresaId]);
  if (!ofe.rows[0]) throw AppError.naoEncontrado('Oferta não encontrada');
  if (ofe.rows[0].status !== 'ofertada') throw AppError.validacao('Oferta já não está mais disponível');

  // valida que o motoboy era candidato
  const cand = await query(`SELECT 1 FROM entregas_ofertas_candidatos WHERE oferta_id = $1 AND motoboy_id = $2`, [ofertaId, motoboyId]);
  if (!cand.rows.length) throw AppError.validacao('Você não está entre os candidatos desta oferta');

  // LIMITE de corridas simultâneas do cliente: bloqueia com aviso claro se já atingiu.
  // (A oferta pode ter sido disparada antes do motoboy encher o limite aceitando outras.)
  const entL = await query(`SELECT loja_id FROM entregas WHERE id = $1`, [ofe.rows[0].entrega_id]);
  let maxCorridas = 3;
  if (entL.rows[0] && entL.rows[0].loja_id) {
    const rg = await query(`SELECT max_corridas_motoboy FROM cliente_regras_acionamento WHERE loja_id = $1`, [entL.rows[0].loja_id]);
    if (rg.rows[0]) maxCorridas = Number(rg.rows[0].max_corridas_motoboy) || 3;
  }
  const cg = await query(
    `SELECT count(*)::int AS carga FROM entregas WHERE empresa_id = $1 AND motoboy_id = $2 AND status = ANY($3)`,
    [empresaId, motoboyId, STATUS_ATIVOS]
  );
  const cargaAtual = cg.rows[0] ? cg.rows[0].carga : 0;
  if (cargaAtual >= maxCorridas) {
    throw AppError.validacao(`Você já está com ${cargaAtual} corrida(s) em andamento — o limite para este cliente é ${maxCorridas}. Conclua uma corrida para poder aceitar outra.`);
  }

  // TRAVA: só um aceita. Atualiza a oferta de 'ofertada' -> 'aceita' atomicamente.
  const trava = await query(
    `UPDATE entregas_ofertas SET status = 'aceita', aceita_por = $2, aceita_em = now()
      WHERE id = $1 AND status = 'ofertada' RETURNING entrega_id`,
    [ofertaId, motoboyId]
  );
  if (!trava.rows[0]) throw AppError.validacao('Outro motoboy já aceitou esta corrida');

  const entregaId = trava.rows[0].entrega_id;
  // Atribui a entrega ao motoboy que aceitou (se ainda estiver na fila).
  const upd = await query(
    `UPDATE entregas SET motoboy_id = $1, status = $2
      WHERE id = $3 AND empresa_id = $4 AND status = $5 RETURNING protocolo`,
    [motoboyId, STATUS_ENTREGA.AGUARDANDO_COLETA, entregaId, empresaId, STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO]
  );
  if (!upd.rows[0]) {
    // entrega saiu da fila no meio do caminho — desfaz a oferta
    await query(`UPDATE entregas_ofertas SET status = 'cancelada' WHERE id = $1`, [ofertaId]);
    throw AppError.validacao('A corrida não está mais disponível');
  }
  emitirParaEmpresa(empresaId, 'entrega.atribuida', { id: entregaId, motoboyId, protocolo: upd.rows[0].protocolo, via: 'oferta' });
  // Avisa os OUTROS candidatos que a oferta saiu (para sumir da lista deles em tempo real).
  try {
    const { rows: outros } = await query(
      `SELECT motoboy_id FROM entregas_ofertas_candidatos WHERE oferta_id = $1 AND motoboy_id <> $2`,
      [ofertaId, motoboyId]
    );
    outros.forEach(o => emitirParaMotoboy(o.motoboy_id, 'oferta.encerrada', { ofertaId }));
  } catch {}
  return { entregaId, protocolo: upd.rows[0].protocolo, ok: true };
}


// Motoboy recusa a oferta (marca o candidato como recusado; não cancela a oferta para os outros).
async function recusarOferta({ empresaId, ofertaId, motoboyId }) {
  const ofe = await query(`SELECT id FROM entregas_ofertas WHERE id = $1 AND empresa_id = $2`, [ofertaId, empresaId]);
  if (!ofe.rows[0]) throw AppError.naoEncontrado('Oferta não encontrada');
  await query(`UPDATE entregas_ofertas_candidatos SET recusada_em = now() WHERE oferta_id = $1 AND motoboy_id = $2`, [ofertaId, motoboyId]);
  return { ok: true };
}

// Lista TODAS as ofertas ativas (ofertadas, não recusadas) de um motoboy.
// SEM expiração por tempo: a oferta fica disponível até alguém aceitar ou a central cancelar.
async function ofertasDoMotoboy({ empresaId, motoboyId }) {
  const { rows } = await query(
    `SELECT o.id AS oferta_id, o.entrega_id, o.expira_em, o.criado_em, c.distancia_km,
            e.protocolo, e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
            e.valor_motoboy_cent, e.distancia_km AS rota_km,
            l.nome_fantasia AS cliente_nome,
            (SELECT count(*)::int FROM entregas_pontos p WHERE p.entrega_id = e.id) AS qtd_pontos,
            (SELECT p.endereco FROM entregas_pontos p WHERE p.entrega_id = e.id ORDER BY p.ordem LIMIT 1) AS primeiro_destino,
            (SELECT p.numero_nf FROM entregas_pontos p WHERE p.entrega_id = e.id ORDER BY p.ordem LIMIT 1) AS primeiro_nf
       FROM entregas_ofertas o
       JOIN entregas_ofertas_candidatos c ON c.oferta_id = o.id AND c.motoboy_id = $2
       JOIN entregas e ON e.id = o.entrega_id
       LEFT JOIN lojas l ON l.id = e.loja_id
      WHERE o.empresa_id = $1 AND o.status = 'ofertada' AND c.recusada_em IS NULL
      ORDER BY o.criado_em DESC`,
    [empresaId, motoboyId]
  );
  return { ofertas: rows };
}

// Detalhe completo de uma oferta (para a tela "Ver detalhes"): coleta + todos os pontos com NF, complemento, observações, telefone.
async function detalheOferta({ empresaId, motoboyId, ofertaId }) {
  const { rows } = await query(
    `SELECT o.id AS oferta_id, o.entrega_id, o.status, o.criado_em, c.distancia_km,
            e.protocolo, e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
            e.valor_motoboy_cent, e.distancia_km AS rota_km, e.tempo_estimado_min,
            l.nome_fantasia AS cliente_nome
       FROM entregas_ofertas o
       JOIN entregas_ofertas_candidatos c ON c.oferta_id = o.id AND c.motoboy_id = $3
       JOIN entregas e ON e.id = o.entrega_id
       LEFT JOIN lojas l ON l.id = e.loja_id
      WHERE o.id = $2 AND o.empresa_id = $1 AND o.status = 'ofertada' AND c.recusada_em IS NULL`,
    [empresaId, ofertaId, motoboyId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Oferta não encontrada ou não disponível');
  const oferta = rows[0];
  const pts = await query(
    `SELECT ordem, nome, endereco, lat, lng, telefone, observacoes, numero_nf, nome_fantasia, complemento
       FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`,
    [oferta.entrega_id]
  );
  // Geometria da rota pelas ruas (ORS): coleta -> cada ponto, na ordem.
  let rotaCoords = [];
  try {
    const seq = [];
    if (oferta.coleta_lat != null && oferta.coleta_lng != null) seq.push({ lat: Number(oferta.coleta_lat), lng: Number(oferta.coleta_lng) });
    for (const p of pts.rows) if (p.lat != null && p.lng != null) seq.push({ lat: Number(p.lat), lng: Number(p.lng) });
    if (seq.length >= 2) {
      const { tracarRota } = require('../../integracoes/openrouteservice');
      const r = await tracarRota(seq);
      rotaCoords = r.coordenadas || []; // [[lat,lng], ...]
      // Usa a distância/tempo reais da rota traçada quando disponíveis (mais precisos).
      if (r.distanciaKm > 0) oferta.rota_km = r.distanciaKm;
      if (r.duracaoMin > 0) oferta.tempo_estimado_min = r.duracaoMin;
    }
  } catch { /* sem geometria: o app desenha linha reta como fallback */ }
  return { oferta, pontos: pts.rows, rota: rotaCoords };
}

// Compat: retorna a oferta ativa mais recente (singular). Mantida para não quebrar chamadas antigas.
async function ofertaAtivaDoMotoboy({ empresaId, motoboyId }) {
  const r = await ofertasDoMotoboy({ empresaId, motoboyId });
  return { oferta: r.ofertas[0] || null };
}

async function atribuirAutomatica({ empresaId, entregaId, usuarioId, ip }) {
  const ent = await query(
    `SELECT id, status, coleta_lat, coleta_lng, loja_id, modalidade_id FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]
  );
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  if (ent.rows[0].status !== STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO) throw AppError.validacao('Entrega não está na fila de atribuição');

  const escolha = await escolherMotoboy(empresaId, ent.rows[0]);
  if (!escolha.motoboy) throw AppError.validacao(escolha.motivo || 'Nenhum motoboy elegível disponível no momento');
  return atribuir({ empresaId, entregaId, motoboyId: escolha.motoboy.id, usuarioId, ip });
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
  // Troca de motoboy descarta qualquer protocolo já registrado (fotos, recebedor,
  // ocorrência, obs) e zera liberações: o novo motoboy gera tudo do zero.
  await query(`DELETE FROM protocolos WHERE entrega_ponto_id IN (SELECT id FROM entregas_pontos WHERE entrega_id = $1)`, [entregaId]);
  await query(
    `UPDATE entregas_pontos SET status = 'pendente', entregue_em = NULL, finalizado_em = NULL,
            recebedor = NULL, observacao_motoboy = NULL, ocorrencia_id = NULL, ocorrencia_nome = NULL,
            liberado = FALSE, liberacao_solicitada_em = NULL, liberacao_motivo = NULL, liberado_por = NULL, liberado_em = NULL
      WHERE entrega_id = $1`,
    [entregaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'reatribuir', detalhe: { entregaId, de: ent.rows[0].motoboy_id, para: motoboyId }, ip });
  emitirParaEmpresa(empresaId, 'entrega.atribuida', { id: entregaId, motoboyId, protocolo: rows[0].protocolo });
  // Novo motoboy recebe a corrida (tempo real no app + push).
  emitirParaMotoboy(motoboyId, 'entrega.atribuida', { entregaId, protocolo: rows[0].protocolo });
  notificarMotoboy(motoboyId, {
    titulo: '📦 Corrida atribuída a você',
    corpo: `A corrida ${rows[0].protocolo} é sua. Toque para abrir.`,
    dados: { tipo: 'atribuida', entregaId },
  }).catch(() => {});
  // Motoboy anterior (se havia) é avisado de que perdeu a corrida.
  if (ent.rows[0].motoboy_id && ent.rows[0].motoboy_id !== motoboyId) {
    emitirParaMotoboy(ent.rows[0].motoboy_id, 'entrega.removida', { entregaId, protocolo: rows[0].protocolo });
    notificarMotoboy(ent.rows[0].motoboy_id, {
      titulo: 'Corrida transferida',
      corpo: `A corrida ${rows[0].protocolo} foi passada para outro motoboy.`,
      dados: { tipo: 'removida', entregaId },
    }).catch(() => {});
  }
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

// Remove o motoboy da entrega: volta para a fila (aguardando_atribuicao) e dispara nova oferta.
async function desatribuir({ empresaId, entregaId, usuarioId, ip }) {
  const ent = await query(`SELECT id, status, protocolo, motoboy_id FROM entregas WHERE id = $1 AND empresa_id = $2`, [entregaId, empresaId]);
  if (!ent.rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');
  const statusAtual = ent.rows[0].status;
  if (['entregue', 'cancelada'].includes(statusAtual))
    throw AppError.validacao(`Entrega já está ${statusAtual} — não é possível remover o motoboy`);

  const { rows } = await query(
    `UPDATE entregas SET motoboy_id = NULL, status = $2 WHERE id = $1 RETURNING id, protocolo, status`,
    [entregaId, STATUS_ENTREGA.AGUARDANDO_ATRIBUICAO]
  );
  // Volta à fila descarta protocolo já registrado e zera liberações —
  // o próximo motoboy gera tudo do zero.
  await query(`DELETE FROM protocolos WHERE entrega_ponto_id IN (SELECT id FROM entregas_pontos WHERE entrega_id = $1)`, [entregaId]);
  await query(
    `UPDATE entregas_pontos SET status = 'pendente', entregue_em = NULL, finalizado_em = NULL,
            recebedor = NULL, observacao_motoboy = NULL, ocorrencia_id = NULL, ocorrencia_nome = NULL,
            liberado = FALSE, liberacao_solicitada_em = NULL, liberacao_motivo = NULL, liberado_por = NULL, liberado_em = NULL
      WHERE entrega_id = $1`,
    [entregaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.ENTREGA, acao: 'desatribuir', detalhe: { entregaId, de: ent.rows[0].motoboy_id }, ip });

  // Log na timeline da corrida.
  try {
    await query(`INSERT INTO entregas_logs (entrega_id, tipo, descricao) VALUES ($1, 'sistema', 'Motoboy removido — corrida devolvida à fila')`, [entregaId]);
  } catch {}

  emitirParaEmpresa(empresaId, 'entrega.status', { id: entregaId });

  // Avisa o motoboy que foi removido (WS + push com app fechado).
  if (ent.rows[0].motoboy_id) {
    emitirParaMotoboy(ent.rows[0].motoboy_id, 'entrega.removida', { entregaId, protocolo: ent.rows[0].protocolo });
    notificarMotoboy(ent.rows[0].motoboy_id, {
      titulo: 'Corrida removida',
      corpo: `A corrida ${ent.rows[0].protocolo} foi removida de você pela central.`,
      dados: { tipo: 'removida', entregaId },
    }).catch(() => {});
  }
  setImmediate(() => {
    dispararOferta({ empresaId, entregaId, usuarioId, ip, automatico: true }).catch(() => {});
  });

  return { ...rows[0], motoboy_nome: null };
}

module.exports = { listarFila, listarDisponiveis, atribuir, atribuirLote, dispararOferta, aceitarOferta, recusarOferta, ofertaAtivaDoMotoboy, ofertasDoMotoboy, detalheOferta, atribuirAutomatica, distribuirFila, reatribuir, desatribuir, listarTodosAtivos };
