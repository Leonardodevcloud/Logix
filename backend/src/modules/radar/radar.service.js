const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');

// Distância em metros entre dois pontos (haversine).
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── Config por empresa ────────────────────────────────────────────
async function getConfig({ empresaId }) {
  const { rows } = await query(`SELECT * FROM radar_config WHERE empresa_id = $1`, [empresaId]);
  if (!rows[0]) {
    return { configurado: false, ativo: false, parado_atencao_min: null, parado_critico_min: null, raio_parado_m: null, sem_sinal_min: null, push_central: false };
  }
  return { configurado: true, ...rows[0] };
}

async function salvarConfig({ empresaId, ativo, paradoAtencaoMin, paradoCriticoMin, raioParadoM, semSinalMin, pushCentral }) {
  const n = (v) => (v === '' || v == null ? null : Math.round(Number(v)));
  const pa = n(paradoAtencaoMin), pc = n(paradoCriticoMin), raio = n(raioParadoM), ss = n(semSinalMin);
  // Para LIGAR o radar, todos os limites precisam estar preenchidos e válidos.
  if (ativo) {
    if ([pa, pc, raio, ss].some(v => !v || v <= 0)) throw AppError.validacao('Preencha todos os limites (maiores que zero) para ativar o radar.');
    if (pc < pa) throw AppError.validacao('O tempo do alerta crítico deve ser maior ou igual ao de atenção.');
  }
  await query(
    `INSERT INTO radar_config (empresa_id, ativo, parado_atencao_min, parado_critico_min, raio_parado_m, sem_sinal_min, push_central, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (empresa_id) DO UPDATE SET
       ativo = EXCLUDED.ativo, parado_atencao_min = EXCLUDED.parado_atencao_min,
       parado_critico_min = EXCLUDED.parado_critico_min, raio_parado_m = EXCLUDED.raio_parado_m,
       sem_sinal_min = EXCLUDED.sem_sinal_min, push_central = EXCLUDED.push_central, atualizado_em = now()`,
    [empresaId, !!ativo, pa, pc, raio, ss, !!pushCentral]);
  return await getConfig({ empresaId });
}

// ── Alertas (leitura) ─────────────────────────────────────────────
async function listarAlertas({ empresaId }) {
  const { rows } = await query(
    `SELECT a.id, a.tipo, a.severidade, a.minutos, a.lat, a.lng, a.ultima_pos_em, a.parado_desde,
            a.entrega_id, e.protocolo,
            a.motoboy_id, m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo, m.telefone_principal
       FROM radar_alertas a
       JOIN entregas e ON e.id = a.entrega_id
       JOIN motoboys m ON m.id = a.motoboy_id
      WHERE a.empresa_id = $1 AND a.status = 'ativo'
      ORDER BY (a.severidade = 'critico') DESC, a.minutos DESC`, [empresaId]);
  return { alertas: rows };
}

async function dispensarAlerta({ empresaId, id, minutos = 30 }) {
  const { rows } = await query(
    `UPDATE radar_alertas SET status = 'dispensado', dispensado_ate = now() + make_interval(mins => $3), atualizado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresaId, Math.max(5, Number(minutos) || 30)]);
  if (!rows[0]) throw AppError.naoEncontrado('Alerta não encontrado');
  return { ok: true };
}

// ── Motor de detecção (chamado pelo cron) ─────────────────────────
async function varrerAlertas(emitir) {
  const cfgs = await query(
    `SELECT * FROM radar_config
      WHERE ativo = TRUE AND parado_atencao_min IS NOT NULL AND parado_critico_min IS NOT NULL
        AND raio_parado_m IS NOT NULL AND sem_sinal_min IS NOT NULL`);
  for (const cfg of cfgs.rows) {
    try { await varrerEmpresa(cfg, emitir); }
    catch (e) { console.error('[radar] erro ao varrer empresa', cfg.empresa_id, e.message); }
  }
}

async function varrerEmpresa(cfg, emitir) {
  const empresaId = cfg.empresa_id;
  // Só corridas EM ROTA (já coletadas, mercadoria em trânsito ao destino).
  const ent = await query(
    `SELECT e.id AS entrega_id, e.motoboy_id
       FROM entregas e
      WHERE e.empresa_id = $1 AND e.status = 'em_rota' AND e.motoboy_id IS NOT NULL`, [empresaId]);

  const janelaMin = Math.max(cfg.parado_critico_min, cfg.sem_sinal_min) + 3;
  const agora = Date.now();
  const chavesAtivas = [];

  for (const e of ent.rows) {
    const { rows: pos } = await query(
      `SELECT lat, lng, capturado_em FROM rastreamento
        WHERE motoboy_id = $1 AND capturado_em > now() - make_interval(mins => $2)
        ORDER BY capturado_em DESC LIMIT 300`, [e.motoboy_id, janelaMin]);

    let tipo = null, sev = 'atencao', minutos = 0, lat = null, lng = null, ultimaEm = null, paradoDesde = null;

    if (!pos.length) {
      const u = await query(`SELECT lat, lng, capturado_em FROM rastreamento WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`, [e.motoboy_id]);
      if (u.rows[0]) {
        const minSem = (agora - new Date(u.rows[0].capturado_em).getTime()) / 60000;
        if (minSem >= cfg.sem_sinal_min) { tipo = 'sem_sinal'; minutos = Math.floor(minSem); lat = u.rows[0].lat; lng = u.rows[0].lng; ultimaEm = u.rows[0].capturado_em; }
      }
    } else {
      const ult = pos[0];
      lat = ult.lat; lng = ult.lng; ultimaEm = ult.capturado_em;
      const minSemMandar = (agora - new Date(ult.capturado_em).getTime()) / 60000;
      if (minSemMandar >= cfg.sem_sinal_min) {
        tipo = 'sem_sinal'; minutos = Math.floor(minSemMandar);
      } else {
        // Tempo parado: anda pra trás enquanto as posições ficam dentro do raio.
        let paradoMin = 0;
        for (let i = 1; i < pos.length; i++) {
          const d = haversineM(Number(ult.lat), Number(ult.lng), Number(pos[i].lat), Number(pos[i].lng));
          if (d <= cfg.raio_parado_m) {
            paradoMin = (new Date(ult.capturado_em).getTime() - new Date(pos[i].capturado_em).getTime()) / 60000;
          } else break;
        }
        paradoMin += minSemMandar; // + o tempo desde a última posição até agora
        if (paradoMin >= cfg.parado_critico_min) { tipo = 'parado'; sev = 'critico'; minutos = Math.floor(paradoMin); }
        else if (paradoMin >= cfg.parado_atencao_min) { tipo = 'parado'; sev = 'atencao'; minutos = Math.floor(paradoMin); }
        if (tipo === 'parado') paradoDesde = new Date(agora - paradoMin * 60000);
      }
    }

    if (tipo) {
      chavesAtivas.push(e.entrega_id + ':' + tipo);
      await query(
        `INSERT INTO radar_alertas (empresa_id, entrega_id, motoboy_id, tipo, severidade, minutos, lat, lng, ultima_pos_em, parado_desde, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ativo')
         ON CONFLICT (empresa_id, entrega_id, tipo) DO UPDATE SET
           severidade = EXCLUDED.severidade, minutos = EXCLUDED.minutos, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
           ultima_pos_em = EXCLUDED.ultima_pos_em, atualizado_em = now(),
           status = CASE WHEN radar_alertas.status = 'dispensado' AND radar_alertas.dispensado_ate > now()
                         THEN 'dispensado' ELSE 'ativo' END`,
        [empresaId, e.entrega_id, e.motoboy_id, tipo, sev, minutos, lat, lng, ultimaEm, paradoDesde]);
    }
  }

  // Resolve alertas que não se aplicam mais (motoboy voltou a andar / entregou / cancelou).
  await query(
    `UPDATE radar_alertas SET status = 'resolvido', atualizado_em = now()
      WHERE empresa_id = $1 AND status IN ('ativo','dispensado')
        AND NOT ((entrega_id::text || ':' || tipo) = ANY($2::text[]))`,
    [empresaId, chavesAtivas]);

  if (emitir) {
    const n = await query(`SELECT count(*)::int AS n FROM radar_alertas WHERE empresa_id = $1 AND status = 'ativo'`, [empresaId]);
    try { emitir(empresaId, 'radar:atualizado', { ativos: n.rows[0].n }); } catch {}
  }
}

module.exports = { getConfig, salvarConfig, listarAlertas, dispensarAlerta, varrerAlertas };
