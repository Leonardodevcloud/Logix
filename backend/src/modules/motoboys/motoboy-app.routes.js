const express = require('express');
const AppError = require('../../shared/AppError');
const { query } = require('../../shared/db');
const { verificarTokenMotoboy } = require('../../middleware/auth');
const storage = require('../../shared/storage');
const push = require('../../shared/push');
let emitirParaEmpresa = () => {};
try { emitirParaEmpresa = require('../../realtime/ws').emitirParaEmpresa; } catch {}
let geocodificar = null;
try { geocodificar = require('../../integracoes/openrouteservice').geocodificar; } catch {}

// Gera a URL assinada fresca da selfie do motoboy (a foto não é persistida como URL).
async function fotoSelfie(motoboyId) {
  try {
    const { rows } = await query(`SELECT storage_key FROM motoboy_documentos WHERE motoboy_id = $1 AND tipo = 'selfie' LIMIT 1`, [motoboyId]);
    if (rows[0]) return await storage.urlDe(rows[0].storage_key);
  } catch {}
  return null;
}

// Haversine entre dois pontos {lat,lng} em km.
function _haversineKm(pts) {
  let km = 0;
  const R = 6371, rad = x => x * Math.PI / 180;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(h));
  }
  return parseFloat(km.toFixed(2));
}

// Calcula distância total da entrega (coleta → pontos) via haversine.
// Usado quando ORS não calculou a distância na criação.
// Se a coleta não tem coordenada mas tem endereço, geocodifica on-the-fly
// e persiste em coleta_lat/lng — assim entregas de ponto único passam a ter km.
async function calcularKmEntrega(entregaId) {
  try {
    const { rows } = await query(
      `SELECT e.coleta_lat, e.coleta_lng, e.coleta_endereco,
              json_agg(json_build_object('lat', ep.lat, 'lng', ep.lng) ORDER BY ep.ordem) AS pontos
       FROM entregas e
       JOIN entregas_pontos ep ON ep.entrega_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [entregaId]
    );
    if (!rows[0]) return null;
    let { coleta_lat, coleta_lng, coleta_endereco, pontos } = rows[0];

    // Se a coleta não tem coordenada, tenta geocodificar pelo endereço e persistir.
    if ((!coleta_lat || !coleta_lng) && coleta_endereco && geocodificar) {
      try {
        const g = await geocodificar(coleta_endereco);
        if (g && g.lat && g.lng) {
          coleta_lat = g.lat; coleta_lng = g.lng;
          query(
            `UPDATE entregas SET coleta_lat = $1, coleta_lng = $2
             WHERE id = $3 AND (coleta_lat IS NULL OR coleta_lng IS NULL)`,
            [coleta_lat, coleta_lng, entregaId]
          ).catch(() => {});
        }
      } catch { /* geocoding indisponível — segue com fallback abaixo */ }
    }

    const pontosCoord = (pontos || []).filter(p => p.lat && p.lng)
      .map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));

    // Origem: coleta georreferenciada; se ainda faltar, usa o 1º ponto como âncora.
    const origem = (coleta_lat && coleta_lng)
      ? { lat: parseFloat(coleta_lat), lng: parseFloat(coleta_lng) }
      : (pontosCoord[0] || null);
    if (!origem) return null;

    const pts = (origem === pontosCoord[0])
      ? pontosCoord                        // coleta == 1º ponto: usa só os pontos
      : [origem, ...pontosCoord];          // coleta separada: prefixa a coleta
    if (pts.length < 2) return null;
    return _haversineKm(pts);
  } catch {
    return null;
  }
}

// Lê a observação do motoboy aceitando variações de nome de campo vindas do app.
function _lerObservacao(body) {
  if (!body) return null;
  const v = body.observacao ?? body.observacao_motoboy ?? body.observacoes ?? body.obs ?? null;
  return (typeof v === 'string' && v.trim()) ? v.trim() : (v || null);
}

module.exports = function motoboyAppRoutes() {
  const router = express.Router();

  // GET /motoboys/app/perfil — dados completos + estatísticas para a aba Perfil.
  router.get('/app/perfil', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const id = req.motoboy.id;
      const { rows } = await query(
        `SELECT m.id, m.nome_completo, m.cpf, m.codigo, m.telefone_principal, m.telefone_emergencia,
                m.foto_url, m.online, m.status, m.criado_em
           FROM motoboys m WHERE m.id = $1`,
        [id]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
      const m = rows[0];
      m.foto_url = await fotoSelfie(id);

      // Estatísticas: concluídas e ganhos (hoje, mês, total). Em centavos.
      const { rows: stat } = await query(
        `SELECT
            count(*) FILTER (WHERE status = 'entregue')::int AS total_entregues,
            count(*) FILTER (WHERE status = 'entregue' AND concluida_em::date = (now() AT TIME ZONE 'America/Bahia')::date)::int AS entregues_hoje,
            COALESCE(SUM(valor_motoboy_cent) FILTER (WHERE status = 'entregue' AND concluida_em::date = (now() AT TIME ZONE 'America/Bahia')::date), 0)::bigint AS ganhos_hoje_cent,
            COALESCE(SUM(valor_motoboy_cent) FILTER (WHERE status = 'entregue' AND date_trunc('month', concluida_em AT TIME ZONE 'America/Bahia') = date_trunc('month', now() AT TIME ZONE 'America/Bahia')), 0)::bigint AS ganhos_mes_cent
           FROM entregas WHERE motoboy_id = $1`,
        [id]
      );
      res.json({ ...m, ...stat[0] });
    } catch (e) { next(e); }
  });

  // GET /motoboys/app/eu
  router.get('/app/eu', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT m.id, m.nome_completo, m.telefone_principal, m.foto_url, m.online, m.status,
                count(e.id)::int AS entregas_ativas
         FROM motoboys m
         LEFT JOIN entregas e ON e.motoboy_id = m.id
           AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
         WHERE m.id = $1
         GROUP BY m.id`,
        [req.motoboy.id]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
      rows[0].foto_url = await fotoSelfie(req.motoboy.id);

      // Estatísticas de ganhos (hoje, mês, total). Em centavos.
      const { rows: stat } = await query(
        `SELECT
            count(*) FILTER (WHERE status = 'entregue')::int AS total_entregues,
            count(*) FILTER (WHERE status = 'entregue' AND concluida_em::date = (now() AT TIME ZONE 'America/Bahia')::date)::int AS entregues_hoje,
            COALESCE(SUM(valor_motoboy_cent) FILTER (WHERE status = 'entregue' AND concluida_em::date = (now() AT TIME ZONE 'America/Bahia')::date), 0)::bigint AS ganhos_hoje_cent,
            COALESCE(SUM(valor_motoboy_cent) FILTER (WHERE status = 'entregue' AND date_trunc('month', concluida_em AT TIME ZONE 'America/Bahia') = date_trunc('month', now() AT TIME ZONE 'America/Bahia')), 0)::bigint AS ganhos_mes_cent
           FROM entregas WHERE motoboy_id = $1`,
        [req.motoboy.id]
      );
      res.json({ ...rows[0], ...stat[0] });
    } catch (e) { next(e); }
  });

  // ── Ofertas de corrida ──────────────────────────────────────────
  const filasService = require('../filas/filas.service');

  // GET /motoboys/app/oferta-ativa — oferta pendente (compat, singular).
  router.get('/app/oferta-ativa', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await filasService.ofertaAtivaDoMotoboy({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });
  // GET /motoboys/app/ofertas — todas as ofertas disponíveis (lista).
  router.get('/app/ofertas', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await filasService.ofertasDoMotoboy({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });
  // GET /motoboys/app/ofertas/:id — detalhe completo de uma oferta (ver detalhes).
  router.get('/app/ofertas/:id', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await filasService.detalheOferta({ empresaId: req.motoboy.empresaId, motoboyId: req.motoboy.id, ofertaId: req.params.id })); } catch (e) { next(e); }
  });
  // POST /motoboys/app/ofertas/:id/aceitar
  router.post('/app/ofertas/:id/aceitar', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await filasService.aceitarOferta({ empresaId: req.motoboy.empresaId, ofertaId: req.params.id, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });
  // POST /motoboys/app/ofertas/:id/recusar
  router.post('/app/ofertas/:id/recusar', verificarTokenMotoboy, async (req, res, next) => {
    try { res.json(await filasService.recusarOferta({ empresaId: req.motoboy.empresaId, ofertaId: req.params.id, motoboyId: req.motoboy.id })); } catch (e) { next(e); }
  });

  // GET /motoboys/app/fila
  router.get('/app/fila', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT e.id, e.protocolo, e.status, e.criado_em, e.iniciada_em, e.valor_motoboy_cent,
                e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng, e.distancia_km,
                l.nome_fantasia AS cliente_nome,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ep.id, 'ordem', ep.ordem, 'endereco', ep.endereco,
                      'lat', ep.lat, 'lng', ep.lng, 'nome_fantasia', ep.nome_fantasia,
                      'numero_nf', ep.numero_nf, 'complemento', ep.complemento,
                      'observacoes', ep.observacoes, 'telefone', ep.telefone,
                      'status', ep.status, 'finalizado_em', ep.finalizado_em
                    ) ORDER BY ep.ordem
                  ) FILTER (WHERE ep.id IS NOT NULL),
                  '[]'::json
                ) AS pontos
         FROM entregas e
         LEFT JOIN entregas_pontos ep ON ep.entrega_id = e.id
         LEFT JOIN lojas l ON l.id = e.loja_id
         WHERE e.motoboy_id = $1
           AND e.empresa_id = $2
           AND e.status IN ('aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota')
         GROUP BY e.id, l.nome_fantasia
         ORDER BY e.criado_em`,
        [req.motoboy.id, req.motoboy.empresaId]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET /motoboys/app/historico?periodo=hoje|semana|mes  — corridas entregues do motoboy
  router.get('/app/historico', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const periodo = req.query.periodo || 'mes';
      let filtroData = '';
      if (periodo === 'hoje') filtroData = `AND e.concluida_em::date = (now() AT TIME ZONE 'America/Bahia')::date`;
      else if (periodo === 'semana') filtroData = `AND e.concluida_em >= (now() AT TIME ZONE 'America/Bahia') - interval '7 days'`;
      else if (periodo === 'mes') filtroData = `AND date_trunc('month', e.concluida_em AT TIME ZONE 'America/Bahia') = date_trunc('month', now() AT TIME ZONE 'America/Bahia')`;

      const { rows } = await query(
        `SELECT e.id, e.protocolo, e.concluida_em, e.distancia_km, e.valor_motoboy_cent,
                e.coleta_endereco, l.nome_fantasia AS cliente_nome,
                (SELECT count(*)::int FROM entregas_pontos ep WHERE ep.entrega_id = e.id) AS qtd_pontos,
                (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem DESC LIMIT 1) AS ultimo_destino
           FROM entregas e
           LEFT JOIN lojas l ON l.id = e.loja_id
          WHERE e.motoboy_id = $1 AND e.empresa_id = $2 AND e.status = 'entregue' ${filtroData}
          ORDER BY e.concluida_em DESC
          LIMIT 100`,
        [req.motoboy.id, req.motoboy.empresaId]
      );
      const totalCent = rows.reduce((s, r) => s + (Number(r.valor_motoboy_cent) || 0), 0);
      res.json({ corridas: rows, total_cent: totalCent, quantidade: rows.length });
    } catch (e) { next(e); }
  });

  // GET /motoboys/app/minha-rota — junta as corridas ativas e sugere a sequência otimizada
  router.get('/app/minha-rota', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT e.id AS entrega_id, e.protocolo, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
                l.nome_fantasia AS cliente_nome,
                ep.id AS ponto_id, ep.ordem, ep.endereco, ep.lat, ep.lng, ep.status AS ponto_status, ep.nome_fantasia
           FROM entregas e
           LEFT JOIN lojas l ON l.id = e.loja_id
           JOIN entregas_pontos ep ON ep.entrega_id = e.id
          WHERE e.motoboy_id = $1 AND e.empresa_id = $2
            AND e.status IN ('aguardando_coleta','em_coleta','em_rota')
            AND ep.status NOT IN ('entregue','insucesso')
          ORDER BY e.criado_em, ep.ordem`,
        [req.motoboy.id, req.motoboy.empresaId]
      );
      if (!rows.length) return res.json({ paradas: [], coleta: null, distancia_km: 0, duracao_min: 0 });

      const coletaRow = rows.find(r => r.coleta_lat != null && r.coleta_lng != null);
      const colObj = coletaRow ? { lat: Number(coletaRow.coleta_lat), lng: Number(coletaRow.coleta_lng), endereco: coletaRow.coleta_endereco, cliente_nome: coletaRow.cliente_nome } : null;

      const pontos = rows
        .filter(r => r.lat != null && r.lng != null)
        .map(r => ({
          ponto_id: r.ponto_id, entrega_id: r.entrega_id, protocolo: r.protocolo,
          endereco: r.endereco, lat: Number(r.lat), lng: Number(r.lng),
          cliente_nome: r.cliente_nome, nome_fantasia: r.nome_fantasia,
        }));

      let ordem = pontos.map((_, i) => i), distanciaKm = 0, duracaoMin = 0;
      if (colObj && pontos.length >= 1) {
        try {
          const { otimizarRota } = require('../../integracoes/openrouteservice');
          const r = await otimizarRota({ coleta: colObj, pontos });
          if (Array.isArray(r.ordem) && r.ordem.length) ordem = r.ordem;
          distanciaKm = r.distanciaKm || 0; duracaoMin = r.duracaoMin || 0;
        } catch { /* sem otimização: mantém ordem natural */ }
      }
      const paradasOrdenadas = ordem.map(i => pontos[i]).filter(Boolean);

      // Traça a geometria real da rota (seguindo as ruas), na ordem coleta -> paradas.
      let coordenadas = [];
      try {
        const { tracarRota } = require('../../integracoes/openrouteservice');
        const seq = [];
        if (colObj) seq.push({ lat: colObj.lat, lng: colObj.lng });
        paradasOrdenadas.forEach(p => seq.push({ lat: p.lat, lng: p.lng }));
        if (seq.length >= 2) {
          const t = await tracarRota(seq);
          coordenadas = t.coordenadas || [];
          // Se a otimização não trouxe distância/duração, usa as do traçado real.
          if (!distanciaKm && t.distanciaKm) distanciaKm = t.distanciaKm;
          if (!duracaoMin && t.duracaoMin) duracaoMin = t.duracaoMin;
        }
      } catch { /* sem geometria: o app cai para a linha reta */ }

      res.json({ coleta: colObj, paradas: paradasOrdenadas, coordenadas, distancia_km: distanciaKm, duracao_min: duracaoMin });
    } catch (e) { next(e); }
  });

  router.patch('/app/status', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { online } = req.body;
      await query(`UPDATE motoboys SET online = $1 WHERE id = $2`, [!!online, req.motoboy.id]);
      emitirParaEmpresa(req.motoboy.empresaId, 'motoboy.status', { motoboyId: req.motoboy.id, online: !!online });
      res.json({ ok: true, online: !!online });
    } catch (e) { next(e); }
  });

  // POST /motoboys/app/posicao
  router.post('/app/posicao', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { lat, lng, entrega_id } = req.body;
      if (!lat || !lng) throw AppError.validacao('lat e lng obrigatórios');
      await query(
        `INSERT INTO rastreamento (motoboy_id, entrega_id, lat, lng) VALUES ($1, $2, $3, $4)`,
        [req.motoboy.id, entrega_id || null, lat, lng]
      );
      emitirParaEmpresa(req.motoboy.empresaId, 'motoboy.posicao', {
        motoboyId: req.motoboy.id, entregaId: entrega_id || null, lat, lng,
      });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // PATCH /motoboys/app/entregas/:id/status
  router.patch('/app/entregas/:id/status', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { status } = req.body;
      const FLUXO = ['aguardando_atribuicao', 'aguardando_coleta', 'em_coleta', 'em_rota', 'entregue'];
      if (!FLUXO.includes(status)) throw AppError.validacao('Status inválido');

      const { rows } = await query(
        `SELECT id, status FROM entregas WHERE id = $1 AND motoboy_id = $2 AND empresa_id = $3`,
        [req.params.id, req.motoboy.id, req.motoboy.empresaId]
      );
      if (!rows[0]) throw AppError.naoEncontrado('Entrega não encontrada');

      const atualIdx = FLUXO.indexOf(rows[0].status);
      const novoIdx  = FLUXO.indexOf(status);
      // Idempotência: se a entrega já está nesse status (ou além), o pedido
      // provavelmente é o retry de uma chamada que JÁ deu certo (a 1ª resposta
      // se perdeu na rede). Em vez de erro, devolve sucesso com o status real,
      // para o app sincronizar a tela sem mostrar "não é possível mudar".
      if (novoIdx <= atualIdx) {
        return res.json({ ok: true, status: rows[0].status, jaAtualizado: true });
      }

      const extra = status === 'entregue' ? `, concluida_em = now()` : '';
      await query(`UPDATE entregas SET status = $1${extra} WHERE id = $2`, [status, req.params.id]);

      emitirParaEmpresa(req.motoboy.empresaId, 'entrega.status', {
        entregaId: req.params.id, status, motoboyId: req.motoboy.id,
      });
      res.json({ ok: true, status });
    } catch (e) { next(e); }
  });

  // GET /motoboys/app/ocorrencias — motivos ativos que o motoboy escolhe ao finalizar
  router.get('/app/ocorrencias', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT id, nome, tipo, comportamento FROM ocorrencias_marcacao
          WHERE empresa_id = $1 AND ativo = TRUE ORDER BY ordem, nome`,
        [req.motoboy.empresaId]
      );
      res.json(rows);
    } catch (e) { next(e); }
  });

  // POST /motoboys/app/entregas/:entregaId/pontos/:pontoId/concluir
  // Responde imediatamente e processa fotos em background (evita timeout no app)
  router.post('/app/entregas/:entregaId/pontos/:pontoId/concluir', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { recebedor, fotos_urls, ocorrencia_id } = req.body;
      const observacao = _lerObservacao(req.body);
      const { entregaId, pontoId } = req.params;
      const empresaId = req.motoboy.empresaId;

      // GEOFENCE: a loja pode exigir que o motoboy esteja dentro de um raio do
      // ponto para marcar. Pulado se o ponto já foi LIBERADO pela central, se a
      // loja está em "raio livre", ou se não há como saber a posição.
      {
        const { rows: pinfo } = await query(
          `SELECT ep.lat AS plat, ep.lng AS plng, ep.liberado, e.loja_id
             FROM entregas_pontos ep JOIN entregas e ON e.id = ep.entrega_id
            WHERE ep.id = $1 AND ep.entrega_id = $2`,
          [pontoId, entregaId]
        );
        const p = pinfo[0];
        if (p && !p.liberado && p.plat != null && p.plng != null && p.loja_id) {
          const { rows: rg } = await query(
            `SELECT marcacao_raio_livre, marcacao_raio_km FROM cliente_regras_acionamento WHERE loja_id = $1`,
            [p.loja_id]
          );
          const raioLivre = rg[0] ? rg[0].marcacao_raio_livre : true;
          const raioKm = rg[0] ? Number(rg[0].marcacao_raio_km) : 0.3;
          if (!raioLivre) {
            let mlat = req.body.lat, mlng = req.body.lng;
            if (mlat == null || mlng == null) {
              const { rows: pos } = await query(
                `SELECT lat, lng FROM rastreamento WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`,
                [req.motoboy.id]
              );
              if (pos[0]) { mlat = Number(pos[0].lat); mlng = Number(pos[0].lng); }
            }
            if (mlat != null && mlng != null) {
              const dist = _haversineKm([{ lat: Number(mlat), lng: Number(mlng) }, { lat: Number(p.plat), lng: Number(p.plng) }]);
              if (dist > raioKm) {
                return res.status(422).json({
                  erro: 'FORA_DO_RAIO',
                  mensagem: `Você está a ${Math.round(dist * 1000)}m do ponto. É preciso estar a até ${Math.round(raioKm * 1000)}m para marcar, ou solicitar liberação à central.`,
                  distancia_m: Math.round(dist * 1000),
                  raio_m: Math.round(raioKm * 1000),
                });
              }
            }
          }
        }
      }

      // 0. Resolver a ocorrência escolhida (tipo + comportamento).
      let ocorrencia = null;
      if (ocorrencia_id) {
        const { rows: oc } = await query(
          `SELECT id, nome, tipo, comportamento FROM ocorrencias_marcacao WHERE id = $1 AND empresa_id = $2`,
          [ocorrencia_id, empresaId]
        );
        ocorrencia = oc[0] || null;
      }
      const ehInsucesso = ocorrencia && ocorrencia.tipo === 'insucesso';
      const geraRetorno = ehInsucesso && ocorrencia.comportamento === 'retorno';

      // 1. Atualizar o ponto: marca status conforme o resultado e grava a ocorrência.
      await query(
        `UPDATE entregas_pontos
         SET status = $5, recebedor = $1, entregue_em = now(), finalizado_em = now(),
             observacao_motoboy = $4, ocorrencia_id = $6, ocorrencia_nome = $7
         WHERE id = $2 AND entrega_id = $3`,
        [recebedor || null, pontoId, entregaId, observacao || null,
         ehInsucesso ? 'insucesso' : 'entregue', ocorrencia ? ocorrencia.id : null, ocorrencia ? ocorrencia.nome : null]
      );

      // 2. Se insucesso com comportamento "retorno", cria um novo ponto = endereço da coleta.
      let pontoRetornoCriado = false;
      if (geraRetorno) {
        const { rows: ent } = await query(
          `SELECT coleta_nome, coleta_endereco, coleta_lat, coleta_lng FROM entregas WHERE id = $1`,
          [entregaId]
        );
        const c = ent[0];
        if (c) {
          const { rows: maxOrd } = await query(`SELECT COALESCE(MAX(ordem),0)+1 AS prox FROM entregas_pontos WHERE entrega_id = $1`, [entregaId]);
          await query(
            `INSERT INTO entregas_pontos (entrega_id, ordem, nome, nome_fantasia, endereco, lat, lng, status, eh_retorno, retorno_de_ponto_id, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente', TRUE, $8, $9)`,
            [entregaId, maxOrd[0].prox, c.coleta_nome || 'Retorno à coleta', 'Retorno à coleta',
             c.coleta_endereco, c.coleta_lat, c.coleta_lng, pontoId,
             `Retorno gerado por: ${ocorrencia.nome}`]
          );
          pontoRetornoCriado = true;
        }
      }

      // 3. Registrar nos logs da corrida (auditoria) e no histórico do ponto.
      try {
        await query(
          `INSERT INTO entregas_logs (entrega_id, ponto_id, tipo, descricao, criado_em)
           VALUES ($1, $2, $3, $4, now())`,
          [entregaId, pontoId, ehInsucesso ? 'insucesso' : 'sucesso',
           `${ocorrencia ? ocorrencia.nome : 'Entregue'}${observacao ? ' — ' + observacao : ''}${pontoRetornoCriado ? ' (retorno gerado)' : ''}`]
        );
      } catch (err) { /* tabela de logs pode não existir ainda; não bloqueia */ }

      // 4. Verificar se todos os pontos (inclusive retornos) foram resolvidos.
      const { rows: pendentes } = await query(
        `SELECT count(*)::int AS qtd FROM entregas_pontos
         WHERE entrega_id = $1 AND status NOT IN ('entregue','insucesso')`,
        [entregaId]
      );
      const todosResolvidos = pendentes[0].qtd === 0;

      if (todosResolvidos) {
        const kmHaversine = await calcularKmEntrega(entregaId);
        await query(
          `UPDATE entregas
           SET status = 'entregue', concluida_em = now(),
               tempo_total_min = ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(iniciada_em, criado_em))) / 60),
               distancia_km = CASE WHEN distancia_km IS NULL OR distancia_km = 0 OR distancia_km = 'NaN'::numeric THEN $2 ELSE distancia_km END
           WHERE id = $1`,
          [entregaId, kmHaversine]
        );
      }

      // 5. Responder imediatamente ao app.
      res.json({ ok: true, todos_entregues: todosResolvidos, retorno_gerado: pontoRetornoCriado });

      // 6. Fotos em background, vinculadas ao protocolo do ponto.
      if (Array.isArray(fotos_urls) && fotos_urls.length) {
        setImmediate(async () => {
          for (const url of fotos_urls) {
            if (!url) continue;
            try {
              await query(
                `INSERT INTO protocolos (entrega_ponto_id, tipo, arquivo_url) VALUES ($1, $2, $3)`,
                [pontoId, ehInsucesso ? 'insucesso' : 'outro', url]
              );
            } catch (err) {
              console.error('[app:concluir] foto background:', err.message);
            }
          }
        });
      }

      if (todosResolvidos) {
        emitirParaEmpresa(empresaId, 'entrega.concluida', { entregaId });
      } else if (pontoRetornoCriado) {
        emitirParaEmpresa(empresaId, 'entrega.retorno', { entregaId, ocorrencia: ocorrencia.nome });
      }

    } catch (e) { next(e); }
  });

  // POST /motoboys/app/entregas/:entregaId/concluir-sem-ponto
  // Fallback: pega automaticamente o primeiro ponto pendente
  router.post('/app/entregas/:entregaId/concluir-sem-ponto', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { recebedor, fotos_urls } = req.body;
      const observacao = _lerObservacao(req.body);
      const { entregaId } = req.params;
      const empresaId = req.motoboy.empresaId;

      // Pegar o primeiro ponto pendente
      const { rows: pontos } = await query(
        `SELECT id FROM entregas_pontos
         WHERE entrega_id = $1 AND status != 'entregue'
         ORDER BY ordem LIMIT 1`,
        [entregaId]
      );
      const pontoId = pontos[0]?.id;

      if (pontoId) {
        await query(
          `UPDATE entregas_pontos
           SET status = 'entregue', recebedor = $1, entregue_em = now(), finalizado_em = now(),
               observacao_motoboy = $3
           WHERE id = $2`,
          [recebedor || null, pontoId, observacao || null]
        );
      }

      // Verificar pendentes
      const { rows: pend } = await query(
        `SELECT count(*)::int AS qtd FROM entregas_pontos
         WHERE entrega_id = $1 AND status != 'entregue'`,
        [entregaId]
      );
      const todosEntregues = pend[0].qtd === 0;

      if (todosEntregues) {
        // Calcular km via haversine se ORS não calculou
        const kmHaversine = await calcularKmEntrega(entregaId);
        await query(
          `UPDATE entregas
           SET status = 'entregue', concluida_em = now(),
               tempo_total_min = ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(iniciada_em, criado_em))) / 60),
               distancia_km = CASE WHEN distancia_km IS NULL OR distancia_km = 0 OR distancia_km = 'NaN'::numeric THEN $2 ELSE distancia_km END
           WHERE id = $1`,
          [entregaId, kmHaversine]
        );
      }

      // Responder imediatamente
      res.json({ ok: true, todos_entregues: todosEntregues });

      // Fotos em background
      if (pontoId && Array.isArray(fotos_urls) && fotos_urls.length) {
        setImmediate(async () => {
          for (const url of fotos_urls) {
            if (!url) continue;
            try {
              await query(
                `INSERT INTO protocolos (entrega_ponto_id, tipo, arquivo_url) VALUES ($1, 'outro', $2)`,
                [pontoId, url]
              );
            } catch (err) {
              console.error('[app:concluir-sem-ponto] foto background:', err.message);
            }
          }
        });
      }

      if (todosEntregues) {
        emitirParaEmpresa(empresaId, 'entrega.concluida', { entregaId });
      }

    } catch (e) { next(e); }
  });

  // Registra o token de push (Expo) do aparelho. Chamado pelo app no login/abertura.
  router.post('/app/push/registrar', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { token, plataforma } = req.body || {};
      const r = await push.registrarToken({
        empresaId: req.motoboy.empresaId,
        motoboyId: req.motoboy.id,
        token,
        plataforma: plataforma || null,
      });
      res.json(r);
    } catch (e) { next(e); }
  });

  // Remove o token do aparelho (logout) — para de receber push neste celular.
  router.post('/app/push/remover', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { token } = req.body || {};
      await push.removerToken({ token: token || null });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Motoboy solicita liberação de um ponto (quando está fora do raio).
  // A central recebe o sinal na corrida e pode liberar.
  router.post('/app/entregas/:entregaId/pontos/:pontoId/solicitar-liberacao', verificarTokenMotoboy, async (req, res, next) => {
    try {
      const { entregaId, pontoId } = req.params;
      const empresaId = req.motoboy.empresaId;
      const motivo = _lerObservacao(req.body) || (req.body && req.body.motivo) || null;

      const { rows } = await query(
        `UPDATE entregas_pontos SET liberacao_solicitada_em = now(), liberacao_motivo = $3
          WHERE id = $1 AND entrega_id = $2 AND liberado = FALSE
          RETURNING id`,
        [pontoId, entregaId, motivo]
      );
      if (!rows[0]) return res.json({ ok: true, ja_liberado: true });

      await query(
        `INSERT INTO entregas_logs (entrega_id, ponto_id, tipo, descricao, criado_em)
         VALUES ($1, $2, 'liberacao_solicitada', $3, now())`,
        [entregaId, pontoId, `Motoboy solicitou liberação de ponto (fora do raio)${motivo ? ' — ' + motivo : ''}`]
      );
      // Também registra na auditoria, que é a fonte da timeline da central.
      try {
        const { registrarAuditoria } = require('../../shared/auditLogger');
        registrarAuditoria({
          empresaId, usuarioId: null, categoria: 'entregas', acao: 'solicitar_liberacao',
          detalhe: { entregaId, pontoId, motivo: motivo || null, motoboyNome: req.motoboy.nome || null },
          ip: req.ip,
        }).catch(() => {});
      } catch {}
      emitirParaEmpresa(empresaId, 'ponto.liberacao_solicitada', { entregaId, pontoId });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
};
