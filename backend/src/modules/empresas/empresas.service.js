const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, ERRO_MSGS, PERFIS } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { apenasDigitos, ehCnpj, obrigatorios } = require('../../shared/validators');
const authService = require('../auth/auth.service');

async function listar({ ativo }) {
  const cond = []; const params = [];
  if (ativo !== undefined) { params.push(ativo); cond.push(`ativo = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT e.*, (SELECT count(*)::int FROM motoboys m WHERE m.empresa_id = e.id) AS total_motoboys
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

// Cria a empresa e o usuário responsável (cliente) numa única transação.
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
    const usuario = await authService.criarUsuario({
      empresaId: empresa.id, perfil: PERFIS.CLIENTE,
      nome: dados.responsavel || dados.razao_social, email: dados.email,
      telefone: dados.telefone, senha: dados.senha,
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

module.exports = { listar, obter, criar, atualizar };
