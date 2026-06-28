const { query } = require('../../shared/db');

// Velocidade média urbana de moto (km/h) para estimar tempos SEM chamar API.
// Tudo é haversine + esta constante: instantâneo e sem limite de requisições.
const VEL_MEDIA_KMH = 25;

const STATUS_ATIVOS = ['aguardando_atribuicao', 'aguardando_coleta', 'em_coleta', 'em_rota'];

// Haversine em km entre dois pontos {lat,lng}.
function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Converte km -> minutos pela velocidade média.
function kmParaMin(km) {
  if (km == null) return null;
  return Math.max(1, Math.round((km / VEL_MEDIA_KMH) * 60));
}

// Soma a distância de um caminho [{lat,lng}, {lat,lng}, ...].
function distCaminho(pontos) {
  let km = 0;
  for (let i = 0; i < pontos.length - 1; i++) {
    const d = distKm(pontos[i], pontos[i + 1]);
    if (d != null) km += d;
  }
  return +km.toFixed(2);
}

// Lojas da empresa com coordenadas (endereço de coleta padrão).
// Se lojaId vier preenchido (perfil loja), traz só ela.
async function lojasComCoord(empresaId, lojaId) {
  const { rows } = await query(
    `SELECT l.id, l.nome_fantasia AS nome,
            es.lat, es.lng, es.endereco_completo AS endereco
       FROM lojas l
       JOIN LATERAL (
         SELECT lat, lng, endereco_completo
           FROM enderecos_salvos
          WHERE loja_id = l.id AND lat IS NOT NULL AND lng IS NOT NULL
          ORDER BY is_coleta_padrao DESC, uso_count DESC
          LIMIT 1
       ) es ON true
      WHERE l.empresa_id = $1
        AND ($2::uuid IS NULL OR l.id = $2)`,
    [empresaId, lojaId || null]
  );
  return rows.map(r => ({ id: r.id, nome: r.nome, lat: Number(r.lat), lng: Number(r.lng), endereco: r.endereco }));
}

// Motoboys ONLINE com última posição + corridas ativas e seus pontos pendentes.
// Se lojaId vier, só motoboys com pelo menos uma corrida ativa daquela loja.
async function motoboysOnline(empresaId, lojaId) {
  const { rows } = await query(
    `SELECT m.id, m.nome_completo AS nome, m.telefone_principal AS telefone, m.foto_url, m.online,
            r.lat, r.lng, r.capturado_em AS ultima_posicao_em,
            COALESCE(json_agg(
              json_build_object(
                'id', e.id, 'protocolo', e.protocolo, 'status', e.status, 'loja_id', e.loja_id,
                'criado_em', e.criado_em,
                'pontos', (
                  SELECT COALESCE(json_agg(json_build_object(
                            'lat', ep.lat, 'lng', ep.lng, 'endereco', ep.endereco, 'ordem', ep.ordem
                          ) ORDER BY ep.ordem) FILTER (WHERE ep.status <> 'entregue'), '[]'::json)
                    FROM entregas_pontos ep WHERE ep.entrega_id = e.id
                )
              ) ORDER BY e.criado_em
            ) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS corridas
       FROM motoboys m
       LEFT JOIN LATERAL (
         SELECT lat, lng, capturado_em FROM rastreamento
          WHERE motoboy_id = m.id ORDER BY capturado_em DESC LIMIT 1
       ) r ON true
       LEFT JOIN entregas e ON e.motoboy_id = m.id AND e.empresa_id = m.empresa_id
            AND e.status = ANY($2)
            AND ($3::uuid IS NULL OR e.loja_id = $3)
      WHERE m.empresa_id = $1 AND m.status = 'ativo' AND m.online = TRUE
        AND r.lat IS NOT NULL
      GROUP BY m.id, r.lat, r.lng, r.capturado_em`,
    [empresaId, STATUS_ATIVOS, lojaId || null]
  );

  return rows
    // No escopo de loja, descarta motoboy online que não tem nenhuma corrida dela.
    .filter(m => !lojaId || (m.corridas && m.corridas.length))
    .map(m => {
      const pos = { lat: Number(m.lat), lng: Number(m.lng) };
      // Junta todos os pontos pendentes de todas as corridas, na ordem das corridas.
      const pendentes = [];
      (m.corridas || []).forEach(c => (c.pontos || []).forEach(p => {
        if (p.lat != null && p.lng != null) pendentes.push({ lat: Number(p.lat), lng: Number(p.lng), endereco: p.endereco });
      }));

      // Rota = posição atual -> todos os pontos pendentes, em sequência.
      let etaConclusaoMin = null, kmRestante = null, posicaoLivre = pos;
      if (pendentes.length) {
        const caminho = [pos, ...pendentes];
        kmRestante = distCaminho(caminho);
        etaConclusaoMin = kmParaMin(kmRestante);
        posicaoLivre = pendentes[pendentes.length - 1]; // onde ele termina a última corrida
      }

      return {
        id: m.id,
        nome: m.nome,
        telefone: m.telefone,
        foto_url: m.foto_url,
        online: m.online,
        lat: pos.lat,
        lng: pos.lng,
        ultima_posicao_em: m.ultima_posicao_em,
        ocupado: pendentes.length > 0,
        entregas_ativas: (m.corridas || []).length,
        corridas: (m.corridas || []).map(c => ({
          id: c.id, protocolo: c.protocolo, status: c.status, loja_id: c.loja_id,
          pontos_pendentes: (c.pontos || []).length,
        })),
        km_restante: kmRestante,
        eta_conclusao_min: etaConclusaoMin,
        // De onde ele estaria "livre" para um próximo serviço (fim da última corrida,
        // ou a posição atual se estiver sem corrida). Usado para o ETA até as lojas.
        posicao_livre: posicaoLivre,
      };
    });
}

// Visão geral do mapa. Respeita o escopo: lojaId preenchido => só a loja e os
// motoboys com corrida dela. Central (lojaId null) => tudo.
async function overview({ empresaId, lojaId = null }) {
  const [lojas, motoboys] = await Promise.all([
    lojasComCoord(empresaId, lojaId),
    motoboysOnline(empresaId, lojaId),
  ]);

  // Para cada motoboy, lista as lojas mais próximas a partir da posição livre,
  // com distância e ETA. (Cálculo barato: haversine + velocidade média.)
  for (const m of motoboys) {
    m.lojas_proximas = lojas
      .map(l => {
        const km = distKm(m.posicao_livre, l);
        return km == null ? null : { loja_id: l.id, nome: l.nome, km: +km.toFixed(2), eta_min: kmParaMin(km) };
      })
      .filter(Boolean)
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }

  return {
    lojas,
    motoboys,
    config: { vel_media_kmh: VEL_MEDIA_KMH },
    escopo: lojaId ? 'loja' : 'central',
    em: new Date().toISOString(),
  };
}

module.exports = { overview, distKm, kmParaMin, VEL_MEDIA_KMH };
