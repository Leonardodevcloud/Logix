const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { registrarAuditoria } = require('../../shared/auditLogger');

// ── Categorias de Frete ──────────────────────────────────────────────

// Lista as categorias da empresa, cada uma com os clientes (lojas) vinculados.
async function listarCategorias({ empresaId, incluirInativas = true }) {
  const cond = ['c.empresa_id = $1'];
  const params = [empresaId];
  if (!incluirInativas) cond.push('c.ativo = TRUE');

  const { rows } = await query(
    `SELECT c.id, c.nome, c.cor, c.descricao, c.ativo, c.criado_em,
            COALESCE(
              (SELECT json_agg(json_build_object('id', l.id, 'nome', l.nome_fantasia) ORDER BY l.nome_fantasia)
                 FROM frete_categoria_lojas fcl
                 JOIN lojas l ON l.id = fcl.loja_id
                WHERE fcl.categoria_id = c.id),
              '[]'::json
            ) AS lojas
       FROM frete_categorias c
      WHERE ${cond.join(' AND ')}
      ORDER BY c.ativo DESC, c.nome ASC`,
    params
  );
  return rows;
}

async function obterCategoria({ empresaId, id }) {
  const { rows } = await query(
    `SELECT id, nome, cor, descricao, ativo, criado_em FROM frete_categorias WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  const { rows: lojas } = await query(
    `SELECT l.id, l.nome_fantasia AS nome FROM frete_categoria_lojas fcl
       JOIN lojas l ON l.id = fcl.loja_id
      WHERE fcl.categoria_id = $1 ORDER BY l.nome_fantasia`,
    [id]
  );
  return { ...rows[0], lojas };
}

// Cria uma categoria. lojaIds (opcional) = clientes vinculados.
async function criarCategoria({ empresaId, nome, cor, descricao, lojaIds = [], usuarioId, ip }) {
  if (!nome || !nome.trim()) throw AppError.validacao('Informe o nome da categoria');
  const corFinal = (cor && /^#[0-9a-fA-F]{6}$/.test(cor)) ? cor : '#7c3aed';

  let row;
  try {
    const r = await query(
      `INSERT INTO frete_categorias (empresa_id, nome, cor, descricao)
       VALUES ($1, $2, $3, $4) RETURNING id, nome, cor, descricao, ativo, criado_em`,
      [empresaId, nome.trim(), corFinal, descricao || null]
    );
    row = r.rows[0];
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Já existe uma categoria com esse nome');
    throw e;
  }

  await vincularLojas(empresaId, row.id, lojaIds);
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'criar_categoria_frete', detalhe: { id: row.id, nome: row.nome }, ip }).catch(() => {});
  return obterCategoria({ empresaId, id: row.id });
}

// Atualiza nome/cor/descrição e, se vier lojaIds, redefine os clientes vinculados.
async function atualizarCategoria({ empresaId, id, nome, cor, descricao, lojaIds, usuarioId, ip }) {
  const { rows: existe } = await query(`SELECT id FROM frete_categorias WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!existe[0]) throw AppError.naoEncontrado('Categoria não encontrada');

  const sets = [], params = [];
  if (nome != null) { if (!nome.trim()) throw AppError.validacao('Nome inválido'); params.push(nome.trim()); sets.push(`nome = $${params.length}`); }
  if (cor != null) { const c = /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#7c3aed'; params.push(c); sets.push(`cor = $${params.length}`); }
  if (descricao !== undefined) { params.push(descricao || null); sets.push(`descricao = $${params.length}`); }
  if (sets.length) {
    sets.push(`atualizado_em = now()`);
    params.push(id, empresaId);
    try {
      await query(`UPDATE frete_categorias SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND empresa_id = $${params.length}`, params);
    } catch (e) {
      if (e.code === '23505') throw AppError.conflito('Já existe uma categoria com esse nome');
      throw e;
    }
  }

  if (Array.isArray(lojaIds)) {
    await query(`DELETE FROM frete_categoria_lojas WHERE categoria_id = $1`, [id]);
    await vincularLojas(empresaId, id, lojaIds);
  }
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'editar_categoria_frete', detalhe: { id }, ip }).catch(() => {});
  return obterCategoria({ empresaId, id });
}

// Ativa/desativa.
async function alternarCategoria({ empresaId, id, ativo, usuarioId, ip }) {
  const { rows } = await query(
    `UPDATE frete_categorias SET ativo = $3, atualizado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING id, ativo`,
    [id, empresaId, !!ativo]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'alternar_categoria_frete', detalhe: { id, ativo: !!ativo }, ip }).catch(() => {});
  return rows[0];
}

async function excluirCategoria({ empresaId, id, usuarioId, ip }) {
  const { rows } = await query(`DELETE FROM frete_categorias WHERE id = $1 AND empresa_id = $2 RETURNING id`, [id, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Categoria não encontrada');
  registrarAuditoria({ empresaId, usuarioId, categoria: 'config', acao: 'excluir_categoria_frete', detalhe: { id }, ip }).catch(() => {});
  return { ok: true };
}

// Vincula uma lista de lojas a uma categoria (valida que as lojas são da empresa).
async function vincularLojas(empresaId, categoriaId, lojaIds) {
  if (!Array.isArray(lojaIds) || !lojaIds.length) return;
  // Filtra apenas lojas que pertencem à empresa.
  const { rows: validas } = await query(
    `SELECT id FROM lojas WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
    [empresaId, lojaIds]
  );
  for (const l of validas) {
    await query(
      `INSERT INTO frete_categoria_lojas (categoria_id, loja_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [categoriaId, l.id]
    );
  }
}

module.exports = {
  listarCategorias, obterCategoria, criarCategoria, atualizarCategoria,
  alternarCategoria, excluirCategoria,
};
