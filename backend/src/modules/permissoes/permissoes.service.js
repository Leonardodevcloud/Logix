const { query, pool } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { MODULOS, TODAS_PERMISSOES, MODULOS_PADRAO } = require('./permissoes.shared');

const CODIGOS_MODULO = new Set(MODULOS.map((m) => m.codigo));

// ---------- Camada 1: módulos por cliente (master) ----------

async function listarModulos() {
  const { rows } = await query(`SELECT codigo, nome, categoria, descricao, ordem FROM modulos ORDER BY ordem`);
  return rows;
}

async function modulosDaEmpresa(empresaId) {
  const { rows } = await query(
    `SELECT m.codigo, m.nome, m.categoria, m.ordem, COALESCE(em.ativo, FALSE) AS ativo
       FROM modulos m
       LEFT JOIN empresa_modulos em ON em.modulo_codigo = m.codigo AND em.empresa_id = $1
      ORDER BY m.ordem`,
    [empresaId]
  );
  return rows;
}

async function modulosAtivos(empresaId) {
  const { rows } = await query(
    `SELECT modulo_codigo FROM empresa_modulos WHERE empresa_id = $1 AND ativo = TRUE`, [empresaId]
  );
  return new Set(rows.map((r) => r.modulo_codigo));
}

async function empresaTemModulo(empresaId, codigo) {
  if (!empresaId) return false;
  if (!CODIGOS_MODULO.has(codigo)) return true; // permissões base (ex.: usuarios) não são gated por módulo
  const { rows } = await query(
    `SELECT 1 FROM empresa_modulos WHERE empresa_id = $1 AND modulo_codigo = $2 AND ativo = TRUE`,
    [empresaId, codigo]
  );
  return rows.length > 0;
}

async function definirModulosDaEmpresa(empresaId, codigosAtivos = []) {
  const ativos = new Set(codigosAtivos.filter((c) => CODIGOS_MODULO.has(c)));
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const m of MODULOS) {
      await cliente.query(
        `INSERT INTO empresa_modulos (empresa_id, modulo_codigo, ativo) VALUES ($1, $2, $3)
         ON CONFLICT (empresa_id, modulo_codigo) DO UPDATE SET ativo = EXCLUDED.ativo`,
        [empresaId, m.codigo, ativos.has(m.codigo)]
      );
    }
    await cliente.query('COMMIT');
  } catch (e) { await cliente.query('ROLLBACK'); throw e; } finally { cliente.release(); }
  return modulosDaEmpresa(empresaId);
}

// Habilita os módulos padrão ao criar um cliente (aceita executor de transação).
async function habilitarModulosPadrao(empresaId, executor = query) {
  for (const codigo of MODULOS_PADRAO) {
    await executor(
      `INSERT INTO empresa_modulos (empresa_id, modulo_codigo, ativo) VALUES ($1, $2, TRUE)
       ON CONFLICT (empresa_id, modulo_codigo) DO NOTHING`,
      [empresaId, codigo]
    );
  }
}

// ---------- Camada 2: papéis e permissões (cliente) ----------

async function listarPapeis(empresaId) {
  const { rows } = await query(
    `SELECT p.id, p.nome, p.descricao, p.sistema, (p.empresa_id IS NULL) AS template,
            COALESCE(array_agg(pp.permissao) FILTER (WHERE pp.permissao IS NOT NULL), '{}') AS permissoes
       FROM papeis p
       LEFT JOIN papel_permissoes pp ON pp.papel_id = p.id
      WHERE p.empresa_id IS NULL OR p.empresa_id = $1
      GROUP BY p.id
      ORDER BY p.sistema DESC, p.nome`,
    [empresaId]
  );
  return rows;
}

async function obterPapel(id) {
  const { rows } = await query(
    `SELECT p.id, p.empresa_id, p.nome, p.descricao, p.sistema,
            COALESCE(array_agg(pp.permissao) FILTER (WHERE pp.permissao IS NOT NULL), '{}') AS permissoes
       FROM papeis p LEFT JOIN papel_permissoes pp ON pp.papel_id = p.id
      WHERE p.id = $1 GROUP BY p.id`,
    [id]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Papel não encontrado');
  return rows[0];
}

async function criarPapel({ empresaId, nome, descricao, permissoes = [] }) {
  if (!nome) throw AppError.validacao('Nome do papel é obrigatório');
  const validas = [...new Set(permissoes)].filter((p) => TODAS_PERMISSOES.includes(p));
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO papeis (empresa_id, nome, descricao, sistema) VALUES ($1, $2, $3, FALSE) RETURNING id`,
      [empresaId, nome, descricao || null]
    );
    const papelId = rows[0].id;
    for (const perm of validas) {
      await cliente.query(`INSERT INTO papel_permissoes (papel_id, permissao) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [papelId, perm]);
    }
    await cliente.query('COMMIT');
    return obterPapel(papelId);
  } catch (e) {
    await cliente.query('ROLLBACK');
    if (e.code === '23505') throw AppError.conflito('Já existe um papel com esse nome');
    throw e;
  } finally { cliente.release(); }
}

async function idDoTemplate(nome) {
  const { rows } = await query(`SELECT id FROM papeis WHERE empresa_id IS NULL AND lower(nome) = lower($1)`, [nome]);
  return rows[0] ? rows[0].id : null;
}

async function permissoesDoUsuario(usuarioId) {
  const { rows } = await query(
    `SELECT pp.permissao FROM usuarios u JOIN papel_permissoes pp ON pp.papel_id = u.papel_id WHERE u.id = $1`,
    [usuarioId]
  );
  return new Set(rows.map((r) => r.permissao));
}

async function atribuirPapel({ empresaId, usuarioId, papelId }) {
  const papel = await obterPapel(papelId);
  if (papel.empresa_id && papel.empresa_id !== empresaId) throw AppError.proibido('Papel pertence a outro cliente');
  const { rowCount } = await query(
    `UPDATE usuarios SET papel_id = $1 WHERE id = $2 AND empresa_id = $3`, [papelId, usuarioId, empresaId]
  );
  if (!rowCount) throw AppError.naoEncontrado('Usuário não encontrado neste cliente');
  return { ok: true };
}

// Acesso efetivo do usuário logado (consumido pelo frontend para montar a navegação).
async function permissoesEfetivas(usuario) {
  if (usuario.perfil === 'super_admin') {
    return { perfil: 'super_admin', modulos: MODULOS.map((m) => m.codigo), permissoes: ['*'] };
  }
  if (usuario.perfil === 'motoboy') {
    return { perfil: 'motoboy', modulos: [], permissoes: [] };
  }
  const ativos = await modulosAtivos(usuario.empresaId);
  const doPapel = await permissoesDoUsuario(usuario.id);
  const permissoes = [...doPapel].filter((p) => {
    const codigo = p.split('.')[0];
    return !CODIGOS_MODULO.has(codigo) || ativos.has(codigo);
  });
  // Retorna o perfil REAL (central_admin / loja / cliente legado), não um valor fixo —
  // o frontend usa o perfil para decidir o menu (ex.: 'Lojas' só para central_admin).
  return { perfil: usuario.perfil || 'loja', modulos: [...ativos], permissoes, lojaId: usuario.lojaId || null };
}

module.exports = {
  listarModulos, modulosDaEmpresa, modulosAtivos, empresaTemModulo, definirModulosDaEmpresa,
  habilitarModulosPadrao, listarPapeis, obterPapel, criarPapel, idDoTemplate,
  permissoesDoUsuario, atribuirPapel, permissoesEfetivas,
};
