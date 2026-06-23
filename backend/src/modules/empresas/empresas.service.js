const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, ERRO_MSGS, PERFIS } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { apenasDigitos, ehCnpj, obrigatorios } = require('../../shared/validators');
const authService = require('../auth/auth.service');

async function listar({ ativo }) {
  const cond = []; const params = [];
  if (ativo !== undefined) { params.push(ativo); cond.push(`e.ativo = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT e.*,
       (SELECT count(*)::int FROM motoboys m WHERE m.empresa_id = e.id) AS total_motoboys,
       (SELECT u.id FROM usuarios u WHERE u.empresa_id = e.id AND u.perfil = 'cliente' ORDER BY u.criado_em LIMIT 1) AS responsavel_usuario_id,
       (SELECT u.email FROM usuarios u WHERE u.empresa_id = e.id AND u.perfil = 'cliente' ORDER BY u.criado_em LIMIT 1) AS email_acesso
     FROM empresas e ${where} ORDER BY e.razao_social`,
    params
  );
  return rows;
}

async function obter(id) {
  const { rows } = await query(`SELECT * FROM empresas WHERE id = $1`, [id]);
  if (!rows[0]) throw AppError.naoEncontrado(ERRO_MSGS.EMPRESA_NAO_ENCONTRADA);
  return rows[0];
}

async function criar(dados, { adminId, ip }) {
  const faltando = obrigatorios(dados, ['razao_social', 'cnpj', 'email', 'senha']);
  if (faltando.length) throw AppError.validacao('Campos obrigatórios', { faltando });
  if (!ehCnpj(dados.cnpj)) throw AppError.validacao('CNPJ inválido');

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO empresas (razao_social, nome_fantasia, cnpj, cep, logradouro, numero, complemento,
         bairro, cidade, estado, responsavel, email, telefone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [dados.razao_social, dados.nome_fantasia || null, apenasDigitos(dados.cnpj), apenasDigitos(dados.cep),
       dados.logradouro || null, dados.numero || null, dados.complemento || null, dados.bairro || null,
       dados.cidade || null, dados.estado || null, dados.responsavel || null, dados.email, dados.telefone || null]
    );
    const empresa = rows[0];
    const permissoesService = require('../permissoes/permissoes.service');
    await permissoesService.habilitarModulosPadrao(empresa.id, (sql, params) => cliente.query(sql, params));
    const papelAdminId = await permissoesService.idDoTemplate('Administrador');
    const usuario = await authService.criarUsuario({
      empresaId: empresa.id, perfil: PERFIS.CLIENTE,
      nome: dados.responsavel || dados.razao_social, email: dados.email,
      telefone: dados.telefone, senha: dados.senha, papelId: papelAdminId,
      executor: (sql, params) => cliente.query(sql, params),
    });
    await cliente.query('COMMIT');
    await registrarAuditoria({
      empresaId: empresa.id, usuarioId: adminId,
      categoria: AUDIT_CATEGORIES.EMPRESA, acao: 'criar', detalhe: { cnpj: empresa.cnpj }, ip,
    });
    return { empresa, usuario };
  } catch (e) {
    await cliente.query('ROLLBACK');
    if (e.code === '23505') throw AppError.conflito('CNPJ ou e-mail já cadastrado');
    throw e;
  } finally {
    cliente.release();
  }
}

async function atualizar(id, dados, { adminId, ip }) {
  await obter(id);
  const { rows } = await query(
    `UPDATE empresas SET
       razao_social = COALESCE($2, razao_social),
       nome_fantasia = COALESCE($3, nome_fantasia),
       cep = COALESCE($4, cep), logradouro = COALESCE($5, logradouro),
       numero = COALESCE($6, numero), complemento = COALESCE($7, complemento),
       bairro = COALESCE($8, bairro), cidade = COALESCE($9, cidade), estado = COALESCE($10, estado),
       responsavel = COALESCE($11, responsavel), telefone = COALESCE($12, telefone),
       ativo = COALESCE($13, ativo), atualizado_em = now()
     WHERE id = $1 RETURNING *`,
    [id, dados.razao_social, dados.nome_fantasia, dados.cep, dados.logradouro, dados.numero,
     dados.complemento, dados.bairro, dados.cidade, dados.estado, dados.responsavel,
     dados.telefone, dados.ativo]
  );
  await registrarAuditoria({
    empresaId: id, usuarioId: adminId, categoria: AUDIT_CATEGORIES.EMPRESA, acao: 'atualizar', ip,
  });
  return rows[0];
}

// Atualiza email e/ou senha do usuário responsável do cliente
async function atualizarCredenciais(empresaId, dados, { adminId, ip }) {
  await obter(empresaId);
  const { rows: users } = await query(
    `SELECT id FROM usuarios WHERE empresa_id = $1 AND perfil = 'cliente' ORDER BY criado_em LIMIT 1`,
    [empresaId]
  );
  if (!users[0]) throw AppError.naoEncontrado('Usuário responsável não encontrado');
  const userId = users[0].id;

  if (!dados.email && !dados.senha) throw AppError.validacao('Informe o novo e-mail ou a nova senha');

  if (dados.email) {
    const { rows: exist } = await query(`SELECT id FROM usuarios WHERE email = $1 AND id != $2`, [dados.email, userId]);
    if (exist.length) throw AppError.conflito('E-mail já em uso por outro usuário');
    await query(`UPDATE usuarios SET email = $1, atualizado_em = now() WHERE id = $2`, [dados.email, userId]);
  }
  if (dados.senha) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(dados.senha, 12);
    await query(`UPDATE usuarios SET senha_hash = $1, atualizado_em = now() WHERE id = $2`, [hash, userId]);
  }

  await registrarAuditoria({
    empresaId, usuarioId: adminId, categoria: AUDIT_CATEGORIES.EMPRESA,
    acao: 'atualizar_credenciais', detalhe: { campos: Object.keys(dados) }, ip,
  });
  return { ok: true };
}

// Exclusão lógica: desativa empresa e anonimiza e-mail para liberar o endereço
async function excluir(id, { adminId, ip }) {
  await obter(id);
  const ts = Date.now();
  await query(
    `UPDATE empresas SET ativo = false, email = email || '_excluido_${ts}', atualizado_em = now() WHERE id = $1`,
    [id]
  );
  await query(
    `UPDATE usuarios SET ativo = false, email = email || '_excluido_${ts}', atualizado_em = now()
     WHERE empresa_id = $1`,
    [id]
  );
  await registrarAuditoria({
    empresaId: id, usuarioId: adminId, categoria: AUDIT_CATEGORIES.EMPRESA, acao: 'excluir', ip,
  });
}

// Impersonação: gera token JWT como o responsável do cliente
async function impersonarResponsavel(empresaId, { adminId, ip }) {
  await obter(empresaId);
  const { rows } = await query(
    `SELECT id FROM usuarios WHERE empresa_id = $1 AND perfil = 'cliente' AND ativo = true ORDER BY criado_em LIMIT 1`,
    [empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Nenhum usuário ativo neste cliente');
  return authService.impersonar({ adminId, usuarioAlvoId: rows[0].id, ip });
}

module.exports = { listar, obter, criar, atualizar, atualizarCredenciais, excluir, impersonarResponsavel };
