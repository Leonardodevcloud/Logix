const { query } = require('../../shared/db');

// Lista corridas (resumo) com filtros: protocolo, entregador (nome/código), data + janela de hora.
async function listarRotas({ empresaId, lojaId = null, protocolo = null, entregador = null, data = null, horaIni = null, horaFim = null }) {
  const params = [empresaId];
  const cond = ['e.empresa_id = $1', 'e.motoboy_id IS NOT NULL'];
  if (lojaId) { params.push(lojaId); cond.push(`e.loja_id = $${params.length}`); }
  if (protocolo) { params.push('%' + String(protocolo).trim() + '%'); cond.push(`e.protocolo ILIKE $${params.length}`); }
  if (entregador) {
    params.push('%' + String(entregador).trim() + '%'); const pn = params.length;
    params.push(String(entregador).trim()); const pc = params.length;
    cond.push(`(m.nome_completo ILIKE $${pn} OR m.codigo::text = $${pc})`);
  }
  if (data) {
    const ini = `${data} ${horaIni || '00:00'}:00`;
    const fim = `${data} ${horaFim || '23:59'}:59`;
    params.push(ini); const pi = params.length;
    params.push(fim); const pf = params.length;
    cond.push(`(e.criado_em AT TIME ZONE 'America/Bahia') BETWEEN $${pi}::timestamp AND $${pf}::timestamp`);
  }
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.criado_em, e.concluida_em, e.status,
            m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo,
            (SELECT ep.endereco FROM entregas_pontos ep WHERE ep.entrega_id = e.id ORDER BY ep.ordem DESC LIMIT 1) AS destino,
            (SELECT count(*) FROM rastreamento r WHERE r.entrega_id = e.id)::int AS pontos_gps
       FROM entregas e
       JOIN motoboys m ON m.id = e.motoboy_id
      WHERE ${cond.join(' AND ')}
      ORDER BY e.criado_em DESC
      LIMIT 500`,
    params
  );
  return { corridas: rows };
}

// Pontos de GPS (traçado) de uma ou mais corridas, agrupados por corrida.
async function pontosRota({ empresaId, lojaId = null, entregaIds = [] }) {
  if (!Array.isArray(entregaIds) || !entregaIds.length) return { rotas: [] };
  const params = [empresaId, entregaIds];
  let escopo = '';
  if (lojaId) { params.push(lojaId); escopo = `AND e.loja_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT e.id AS entrega_id, e.protocolo,
            m.nome_completo AS motoboy_nome, m.codigo AS motoboy_codigo,
            r.lat, r.lng, r.capturado_em
       FROM entregas e
       JOIN motoboys m ON m.id = e.motoboy_id
       JOIN rastreamento r ON r.entrega_id = e.id
      WHERE e.empresa_id = $1 AND e.id = ANY($2::uuid[]) ${escopo}
      ORDER BY e.id, r.capturado_em`,
    params
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.entrega_id)) {
      map.set(r.entrega_id, { entrega_id: r.entrega_id, protocolo: r.protocolo, motoboy_nome: r.motoboy_nome, motoboy_codigo: r.motoboy_codigo, pontos: [] });
    }
    map.get(r.entrega_id).pontos.push({ lat: Number(r.lat), lng: Number(r.lng), hora: r.capturado_em });
  }
  return { rotas: Array.from(map.values()) };
}

module.exports = { listarRotas, pontosRota };
