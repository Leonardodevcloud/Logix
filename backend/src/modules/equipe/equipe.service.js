const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const authService = require('../auth/auth.service');
const permissoesService = require('../permissoes/permissoes.service');

// Usuários (perfil cliente) do tenant, com o nome do papel.
async function listarEquipe(empresaId) {
  const { rows } = await query(
    `SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.papel_id, p.nome AS papel_nome
       FROM usuarios u LEFT JOIN papeis p ON p.id = u.papel_id
      WHERE u.empresa_id = $1 AND u.perfil = 'cliente'
      ORDER BY u.ativo DESC, u.nome`,
    [empresaId]
  );
  return rows;
}

function listarPapeis(empresaId) { return permissoesService.listarPapeis(empresaId); }

async function validarPapel(empresaId, papelId) {
  if (!papelId) return;
  const { rows } = await query(
    `SELECT id FROM papeis WHERE id = $1 AND (empresa_id IS NULL OR empresa_id = $2)`, [papelId, empresaId]
  );
  if (!rows[0]) throw AppError.validacao('Papel inválido para este cliente');
}

async function criarMembro({ empresaId, nome, email, telefone, senha, papelId, usuarioId, ip }) {
  if (!nome || !email || !senha) throw AppError.validacao('Nome, e-mail e senha são obrigatórios');
  await validarPapel(empresaId, papelId);
  let novo;
  try {
    novo = await authService.criarUsuario({ empresaId, perfil: 'cliente', nome, email, telefone: telefone || null, senha, papelId: papelId || null });
  } catch (e) {
    if (e && e.code === '23505') throw AppError.validacao('Já existe um usuário com este e-mail');
    throw e;
  }
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.USUARIO, acao: 'criar', detalhe: { membroId: novo.id, papelId }, ip });
  return novo;
}

async function atualizarMembro({ empresaId, membroId, papelId, ativo, usuarioId, ip }) {
  const alvo = await query(`SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 AND perfil = 'cliente'`, [membroId, empresaId]);
  if (!alvo.rows[0]) throw AppError.naoEncontrado('Membro não encontrado');
  if (ativo === false && membroId === usuarioId) throw AppError.validacao('Você não pode desativar a si mesmo');

  if (papelId !== undefined) { await validarPapel(empresaId, papelId); await permissoesService.atribuirPapel({ empresaId, usuarioId: membroId, papelId }); }
  if (ativo !== undefined) { await query(`UPDATE usuarios SET ativo = $1 WHERE id = $2 AND empresa_id = $3`, [!!ativo, membroId, empresaId]); }

  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.USUARIO, acao: 'atualizar', detalhe: { membroId, papelId, ativo }, ip });
  return { ok: true };
}

module.exports = { listarEquipe, listarPapeis, criarMembro, atualizarMembro, removerMembro };

async function removerMembro({ empresaId, membroId, usuarioId, ip }) {
  // Não permite se for o próprio usuário
  if (String(membroId) === String(usuarioId)) throw AppError.validacao('Você não pode remover a si mesmo');
  const { rows } = await query(
    `UPDATE usuarios SET ativo = false, atualizado_em = now()
     WHERE id = $1 AND empresa_id = $2 AND perfil != 'super_admin' RETURNING id`,
    [membroId, empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Membro não encontrado');
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.USUARIO, acao: 'remover_membro', detalhe: { membroId }, ip });
  return { ok: true };
}
