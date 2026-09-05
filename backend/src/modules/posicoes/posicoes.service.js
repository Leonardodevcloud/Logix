// Módulo POSIÇÕES — dono do GPS. Único lugar que escreve em rastreamento (histórico
// particionado) e motoboy_posicao_atual (última posição, 1 linha por motoboy).
// Todo mundo que precisa de "onde está o motoboy agora" pergunta AQUI (ou lê
// motoboy_posicao_atual em JOIN — tabela publicada para leitura, ver ARQUITETURA §6).
//
// É o primeiro candidato a virar serviço próprio (perfil de escala diferente).
const { pool, query } = require('../../shared/db');
const eventos = require('../../shared/eventos');
const log = require('../../shared/logger');
const metricas = require('../../shared/metricas');

let emitirParaEmpresa = () => {};
try { emitirParaEmpresa = require('../../realtime/ws').emitirParaEmpresa; } catch {}

// Registra 1..N pontos de um motoboy. Insere TODOS no histórico (1 INSERT em lote)
// e faz UPSERT do mais recente em motoboy_posicao_atual. Emite WS/evento só do último.
// `pontos`: [{ lat, lng, entrega_id?, capturado_em?, precisao_m?, velocidade? }]
async function registrar({ empresaId, motoboyId, pontos }) {
  if (!Array.isArray(pontos) || !pontos.length) return { gravados: 0 };
  const agora = Date.now();
  const IDADE_MAX_MS = 24 * 3600_000;
  const norm = pontos.map((p) => {
    let em = p.capturado_em ? new Date(p.capturado_em) : new Date(agora);
    // Relógio do celular no futuro → carimba como agora. Ponto sem data → agora.
    if (Number.isNaN(em.getTime()) || em.getTime() > agora + 60_000) em = new Date(agora);
    // Ponto ANTIGO (buffer offline do app) é preservado com a data original —
    // NUNCA re-carimbado, senão um lugar velho vira "posição atual". Mais de 24 h: descarta.
    if (agora - em.getTime() > IDADE_MAX_MS) return null;
    return { lat: Number(p.lat), lng: Number(p.lng), entregaId: p.entrega_id || null, em, precisao: p.precisao_m ?? null, velocidade: p.velocidade ?? null };
  }).filter(Boolean).sort((a, b) => a.em - b.em);
  if (!norm.length) return { gravados: 0, descartados: pontos.length };
  const ultimo = norm[norm.length - 1];

  const valores = []; const params = [];
  norm.forEach((p) => {
    const b = params.length;
    params.push(motoboyId, p.entregaId, p.lat, p.lng, p.precisao, p.velocidade, p.em);
    valores.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`);
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO rastreamento (motoboy_id, entrega_id, lat, lng, precisao_m, velocidade, capturado_em) VALUES ${valores.join(',')}`, params);
    // Só avança a posição atual se este ponto for MAIS NOVO que o já gravado
    // (lotes fora de ordem / réplicas concorrentes não regridem a posição).
    await client.query(
      `INSERT INTO motoboy_posicao_atual (motoboy_id, empresa_id, entrega_id, lat, lng, precisao_m, velocidade, capturado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (motoboy_id) DO UPDATE SET
         empresa_id = EXCLUDED.empresa_id, entrega_id = EXCLUDED.entrega_id,
         lat = EXCLUDED.lat, lng = EXCLUDED.lng, precisao_m = EXCLUDED.precisao_m, velocidade = EXCLUDED.velocidade,
         capturado_em = EXCLUDED.capturado_em, atualizado_em = now()
       WHERE EXCLUDED.capturado_em >= motoboy_posicao_atual.capturado_em`,
      [motoboyId, empresaId, ultimo.entregaId, ultimo.lat, ultimo.lng, ultimo.precisao, ultimo.velocidade, ultimo.em]
    );
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally { client.release(); }

  metricas.gpsPontos.inc({ lote: norm.length > 1 ? 'sim' : 'nao' }, norm.length);
  metricas.contarGps(norm.length, norm.length > 1);
  emitirParaEmpresa(empresaId, 'motoboy.posicao', { motoboyId, entregaId: ultimo.entregaId, lat: ultimo.lat, lng: ultimo.lng, em: ultimo.em.toISOString() });
  eventos.emitir('motoboy.posicao_atualizada', { empresaId, motoboyId, entregaId: ultimo.entregaId, lat: ultimo.lat, lng: ultimo.lng, em: ultimo.em.toISOString() });
  return { gravados: norm.length };
}

// Última posição de um motoboy (ou null).
async function ultima(motoboyId, { empresaId = null } = {}) {
  const { rows } = await query(
    `SELECT lat, lng, capturado_em, entrega_id, precisao_m, velocidade FROM motoboy_posicao_atual
      WHERE motoboy_id = $1 AND ($2::uuid IS NULL OR empresa_id = $2)`, [motoboyId, empresaId]);
  return rows[0] || null;
}

// Últimas posições de vários motoboys → Map(motoboyId → {lat,lng,capturado_em}).
async function ultimas(motoboyIds, { empresaId = null } = {}) {
  if (!motoboyIds || !motoboyIds.length) return new Map();
  const { rows } = await query(
    `SELECT motoboy_id, lat, lng, capturado_em FROM motoboy_posicao_atual
      WHERE motoboy_id = ANY($1::uuid[]) AND ($2::uuid IS NULL OR empresa_id = $2)`, [motoboyIds, empresaId]);
  return new Map(rows.map((r) => [r.motoboy_id, r]));
}

// Trajeto (histórico) de uma entrega, em ordem cronológica.
async function trajetoDaEntrega(entregaId) {
  const { rows } = await query(`SELECT lat, lng, capturado_em FROM rastreamento WHERE entrega_id = $1 ORDER BY capturado_em ASC`, [entregaId]);
  return rows;
}

// Histórico recente de um motoboy (radar: detectar parado / sem sinal).
async function historicoRecente(motoboyId, { minutos = 30, limite = 300 } = {}) {
  const { rows } = await query(
    `SELECT lat, lng, capturado_em FROM rastreamento
      WHERE motoboy_id = $1 AND capturado_em > now() - make_interval(mins => $2)
      ORDER BY capturado_em DESC LIMIT $3`, [motoboyId, minutos, limite]);
  return rows;
}

// ── Partições do histórico ──────────────────────────────────────────────────
// Garante partições diárias de hoje até +diasFrente; remove as mais antigas que a
// retenção com DROP TABLE (instantâneo). Roda no boot e 1x/dia no cron (com lock).
async function manterParticoes({ diasFrente = 7, retencaoDias = 30 } = {}) {
  const ehPart = await query(`SELECT relkind = 'p' AS ok FROM pg_class WHERE relname = 'rastreamento' AND relnamespace = 'public'::regnamespace`);
  if (!ehPart.rows[0] || !ehPart.rows[0].ok) return { particionada: false };
  let criadas = 0, removidas = 0;
  for (let i = 0; i <= diasFrente; i++) {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + i);
    const prox = new Date(d); prox.setUTCDate(prox.getUTCDate() + 1);
    const nome = 'rastreamento_' + d.toISOString().slice(0, 10).replace(/-/g, '');
    const r = await query(`SELECT to_regclass($1) AS existe`, [nome]);
    if (r.rows[0].existe) continue;
    await query(`CREATE TABLE IF NOT EXISTS ${nome} PARTITION OF rastreamento FOR VALUES FROM ('${d.toISOString()}') TO ('${prox.toISOString()}')`);
    criadas++;
  }
  const limite = new Date(); limite.setUTCHours(0, 0, 0, 0); limite.setUTCDate(limite.getUTCDate() - retencaoDias);
  const { rows: parts } = await query(
    `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'rastreamento' AND c.relname ~ '^rastreamento_[0-9]{8}$'`);
  for (const p of parts) {
    const ymd = p.relname.slice(-8);
    const dia = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00Z`);
    if (dia < limite) { await query(`DROP TABLE IF EXISTS ${p.relname}`); removidas++; }
  }
  // A partição default só deve ter sobras raras; limpa pelo critério de retenção.
  await query(`DELETE FROM rastreamento_default WHERE capturado_em < $1`, [limite.toISOString()]).catch(() => {});
  if (criadas || removidas) log.info({ criadas, removidas, retencaoDias }, 'partições de rastreamento mantidas');
  return { particionada: true, criadas, removidas };
}

module.exports = { registrar, ultima, ultimas, trajetoDaEntrega, historicoRecente, manterParticoes };
