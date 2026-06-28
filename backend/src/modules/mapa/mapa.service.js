const { query } = require('../../shared/db');
const storage = require('../../shared/storage');
let geocodificar = null;
try { geocodificar = require('../../integracoes/openrouteservice').geocodificar; } catch {}

// Velocidade média urbana de moto (km/h) para estimar tempos SEM API externa.
const VEL_MEDIA_KMH = 25;
const STATUS_ATIVOS = ['aguardando_atribuicao', 'aguardando_coleta', 'em_coleta', 'em_rota'];

function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function kmParaMin(km) { return km == null ? null : Math.max(1, Math.round((km / VEL_MEDIA_KMH) * 60)); }
function distCaminho(pontos) {
  let km = 0;
  for (let i = 0; i < pontos.length - 1; i++) { const d = distKm(pontos[i], pontos[i + 1]); if (d != null) km += d; }
  return +km.toFixed(2);
}

// Monta o texto do endereço de cadastro da loja para geocodificar.
function enderecoCadastro(l) {
  const partes = [
    [l.logradouro, l.numero].filter(Boolean).join(', '),
    l.bairro, l.cidade, l.estado, l.cep,
  ].filter(Boolean);
  return partes.join(' - ');
}

// Lojas da empresa (ou de todas, se empresaId null = super admin) com coordenadas.
// Posição = lojas.lat/lng (cache) -> senão endereço de coleta padrão -> senão
// geocodifica o ENDEREÇO DE CADASTRO uma vez e persiste em lojas.lat/lng.
async function lojasComCoord(empresaId, lojaId) {
  const { rows } = await query(
    `SELECT l.id, l.empresa_id, l.nome_fantasia AS nome,
            l.lat AS loja_lat, l.lng AS loja_lng,
            l.logradouro, l.numero, l.bairro, l.cidade, l.estado, l.cep,
            es.lat AS end_lat, es.lng AS end_lng, es.endereco_completo
       FROM lojas l
       LEFT JOIN LATERAL (
         SELECT lat, lng, endereco_completo FROM enderecos_salvos
          WHERE loja_id = l.id AND lat IS NOT NULL AND lng IS NOT NULL
          ORDER BY is_coleta_padrao DESC, uso_count DESC LIMIT 1
       ) es ON true
      WHERE ($1::uuid IS NULL OR l.empresa_id = $1)
        AND ($2::uuid IS NULL OR l.id = $2)`,
    [empresaId || null, lojaId || null]
  );

  const lojas = [];
  // Geocodifica no máximo algumas por chamada para não travar a resposta;
  // as restantes entram nas próximas atualizações (a cada 15s).
  let orcamentoGeo = 6;
  for (const r of rows) {
    let lat = r.loja_lat != null ? Number(r.loja_lat) : (r.end_lat != null ? Number(r.end_lat) : null);
    let lng = r.loja_lng != null ? Number(r.loja_lng) : (r.end_lng != null ? Number(r.end_lng) : null);

    if ((lat == null || lng == null) && geocodificar && orcamentoGeo > 0) {
      const txt = enderecoCadastro(r) || r.endereco_completo;
      if (txt) {
        orcamentoGeo--;
        try {
          const g = await geocodificar(txt);
          if (g && g.lat && g.lng) {
            lat = g.lat; lng = g.lng;
            query(`UPDATE lojas SET lat = $1, lng = $2 WHERE id = $3 AND (lat IS NULL OR lng IS NULL)`, [lat, lng, r.id]).catch(() => {});
          }
        } catch {}
      }
    }
    if (lat != null && lng != null) {
      lojas.push({ id: r.id, nome: r.nome, lat, lng, endereco: enderecoCadastro(r) || r.endereco_completo });
    }
  }
  return lojas;
}

// URL assinada da selfie do motoboy (a foto não é persistida como URL fixa).
async function fotoSelfie(motoboyId) {
  try {
    const { rows } = await query(`SELECT storage_key FROM motoboy_documentos WHERE motoboy_id = $1 AND tipo = 'selfie' LIMIT 1`, [motoboyId]);
    if (rows[0]) return await storage.urlDe(rows[0].storage_key);
  } catch {}
  return null;
}

// Motoboys ONLINE com posição, corridas ativas e pontos pendentes.
async function motoboysOnline(empresaId, lojaId) {
  const { rows } = await query(
    `SELECT m.id, m.nome_completo AS nome, m.telefone_principal AS telefone, m.foto_url, m.online,
            r.lat, r.lng, r.capturado_em AS ultima_posicao_em,
            COALESCE(json_agg(
              json_build_object(
                'id', e.id, 'protocolo', e.protocolo, 'status', e.status, 'loja_id', e.loja_id, 'criado_em', e.criado_em,
                'pontos', (
                  SELECT COALESCE(json_agg(json_build_object('lat', ep.lat, 'lng', ep.lng, 'endereco', ep.endereco, 'ordem', ep.ordem)
                            ORDER BY ep.ordem) FILTER (WHERE ep.status <> 'entregue'), '[]'::json)
                    FROM entregas_pontos ep WHERE ep.entrega_id = e.id
                )
              ) ORDER BY e.criado_em
            ) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS corridas
       FROM motoboys m
       LEFT JOIN LATERAL (
         SELECT lat, lng, capturado_em FROM rastreamento WHERE motoboy_id = m.id ORDER BY capturado_em DESC LIMIT 1
       ) r ON true
       LEFT JOIN entregas e ON e.motoboy_id = m.id AND e.empresa_id = m.empresa_id
            AND e.status = ANY($2) AND ($3::uuid IS NULL OR e.loja_id = $3)
      WHERE ($1::uuid IS NULL OR m.empresa_id = $1)
        AND m.status = 'ativo' AND m.online = TRUE AND r.lat IS NOT NULL
      GROUP BY m.id, r.lat, r.lng, r.capturado_em`,
    [empresaId || null, STATUS_ATIVOS, lojaId || null]
  );

  const lista = rows.filter(m => !lojaId || (m.corridas && m.corridas.length));

  // Resolve a foto (selfie) de cada motoboy online — são poucos por vez.
  await Promise.all(lista.map(async (m) => { if (!m.foto_url) m.foto_url = await fotoSelfie(m.id); }));

  return lista.map(m => {
    const pos = { lat: Number(m.lat), lng: Number(m.lng) };
    const pendentes = [];
    (m.corridas || []).forEach(c => (c.pontos || []).forEach(p => {
      if (p.lat != null && p.lng != null) pendentes.push({ lat: Number(p.lat), lng: Number(p.lng), endereco: p.endereco });
    }));
    let etaConclusaoMin = null, kmRestante = null, posicaoLivre = pos;
    if (pendentes.length) {
      kmRestante = distCaminho([pos, ...pendentes]);
      etaConclusaoMin = kmParaMin(kmRestante);
      posicaoLivre = pendentes[pendentes.length - 1];
    }
    return {
      id: m.id, nome: m.nome, telefone: m.telefone, foto_url: m.foto_url || null, online: m.online,
      lat: pos.lat, lng: pos.lng, ultima_posicao_em: m.ultima_posicao_em,
      ocupado: pendentes.length > 0, entregas_ativas: (m.corridas || []).length,
      corridas: (m.corridas || []).map(c => ({ id: c.id, protocolo: c.protocolo, status: c.status, loja_id: c.loja_id, pontos_pendentes: (c.pontos || []).length })),
      km_restante: kmRestante, eta_conclusao_min: etaConclusaoMin, posicao_livre: posicaoLivre,
    };
  });
}

// Visão geral. empresaId null = super admin (todas as empresas).
async function overview({ empresaId = null, lojaId = null }) {
  const [lojas, motoboys] = await Promise.all([
    lojasComCoord(empresaId, lojaId),
    motoboysOnline(empresaId, lojaId),
  ]);
  for (const m of motoboys) {
    m.lojas_proximas = lojas.map(l => {
      const km = distKm(m.posicao_livre, l);
      return km == null ? null : { loja_id: l.id, nome: l.nome, km: +km.toFixed(2), eta_min: kmParaMin(km) };
    }).filter(Boolean).sort((a, b) => a.km - b.km).slice(0, 5);
  }
  return { lojas, motoboys, config: { vel_media_kmh: VEL_MEDIA_KMH }, escopo: lojaId ? 'loja' : (empresaId ? 'central' : 'global'), em: new Date().toISOString() };
}

module.exports = { overview, distKm, kmParaMin, VEL_MEDIA_KMH };
