const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');

// Ponto dentro de polígono (ray casting). poligono = [[lat,lng], ...].
function dentroDoPoligono(lat, lng, poligono) {
  if (!Array.isArray(poligono) || poligono.length < 3 || lat == null || lng == null) return false;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const yi = poligono[i][0], xi = poligono[i][1];
    const yj = poligono[j][0], xj = poligono[j][1];
    const intersecta = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

async function listar({ empresaId }) {
  const { rows } = await query(
    `SELECT id, nome, cor, poligono, ativo, criado_em FROM regioes WHERE empresa_id = $1 ORDER BY nome`,
    [empresaId]
  );
  return { regioes: rows };
}

function normalizarPoligono(p) {
  if (!Array.isArray(p)) return [];
  return p
    .filter(x => Array.isArray(x) && x.length === 2 && isFinite(+x[0]) && isFinite(+x[1]))
    .map(x => [Number(x[0]), Number(x[1])]);
}

async function criar({ empresaId, dados }) {
  const nome = String(dados.nome || '').trim();
  if (!nome) throw AppError.validacao('Informe o nome da região');
  const pol = normalizarPoligono(dados.poligono);
  if (pol.length < 3) throw AppError.validacao('Desenhe a área no mapa (mínimo 3 pontos)');
  const { rows } = await query(
    `INSERT INTO regioes (empresa_id, nome, cor, poligono, ativo) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id`,
    [empresaId, nome, dados.cor || '#185FA5', JSON.stringify(pol), dados.ativo !== false]
  );
  return { id: rows[0].id };
}

async function atualizar({ empresaId, id, dados }) {
  let polJson = null;
  if (dados.poligono !== undefined) {
    const pol = normalizarPoligono(dados.poligono);
    if (pol.length < 3) throw AppError.validacao('Desenhe a área no mapa (mínimo 3 pontos)');
    polJson = JSON.stringify(pol);
  }
  const { rows } = await query(
    `UPDATE regioes SET
        nome = COALESCE($3, nome),
        cor = COALESCE($4, cor),
        poligono = COALESCE($5::jsonb, poligono),
        ativo = COALESCE($6, ativo)
      WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresaId, dados.nome != null ? String(dados.nome).trim() : null, dados.cor || null, polJson, typeof dados.ativo === 'boolean' ? dados.ativo : null]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Região não encontrada');
  return { ok: true };
}

async function excluir({ empresaId, id }) {
  await query(`DELETE FROM regioes WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  return { ok: true };
}

// Polígonos (apenas ativos) das regiões pedidas — usado no filtro por ponto.
async function poligonosDe({ empresaId, ids }) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const { rows } = await query(
    `SELECT poligono FROM regioes WHERE empresa_id = $1 AND id = ANY($2::uuid[]) AND ativo = TRUE`,
    [empresaId, ids]
  );
  return rows.map(r => r.poligono).filter(p => Array.isArray(p) && p.length >= 3);
}

module.exports = { listar, criar, atualizar, excluir, poligonosDe, dentroDoPoligono };
