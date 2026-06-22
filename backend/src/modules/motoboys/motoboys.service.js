const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, ERRO_MSGS } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { apenasDigitos, ehCpf, obrigatorios } = require('../../shared/validators');

async function listar({ empresaId, status, online }) {
  const cond = ['empresa_id = $1']; const params = [empresaId];
  if (status) { params.push(status); cond.push(`status = $${params.length}`); }
  if (online !== undefined) { params.push(online); cond.push(`online = $${params.length}`); }
  const { rows } = await query(
    `SELECT id, nome_completo, cpf, telefone_principal, status, online, foto_url, criado_em
       FROM motoboys WHERE ${cond.join(' AND ')} ORDER BY nome_completo`,
    params
  );
  return rows;
}

async function obter({ empresaId, id }) {
  const { rows } = await query(`SELECT * FROM motoboys WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado(ERRO_MSGS.MOTOBOY_NAO_ENCONTRADO);
  return rows[0];
}

async function criar({ empresaId, dados, usuarioId, ip }) {
  const faltando = obrigatorios(dados, ['nome_completo', 'cpf']);
  if (faltando.length) throw AppError.validacao('Campos obrigatórios', { faltando });
  if (!ehCpf(dados.cpf)) throw AppError.validacao('CPF inválido');
  try {
    const { rows } = await query(
      `INSERT INTO motoboys (empresa_id, nome_completo, cpf, rg, data_nascimento, telefone_principal,
         telefone_emergencia, cep, endereco, foto_url, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [empresaId, dados.nome_completo, apenasDigitos(dados.cpf), dados.rg || null,
       dados.data_nascimento || null, dados.telefone_principal || null, dados.telefone_emergencia || null,
       apenasDigitos(dados.cep), dados.endereco || null, dados.foto_url || null, dados.observacoes || null]
    );
    await registrarAuditoria({
      empresaId, usuarioId, categoria: AUDIT_CATEGORIES.MOTOBOY, acao: 'criar', detalhe: { id: rows[0].id }, ip,
    });
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Já existe um motoboy com este CPF nesta empresa');
    throw e;
  }
}

async function atualizar({ empresaId, id, dados, usuarioId, ip }) {
  await obter({ empresaId, id });
  const { rows } = await query(
    `UPDATE motoboys SET
       nome_completo = COALESCE($3, nome_completo),
       rg = COALESCE($4, rg), data_nascimento = COALESCE($5, data_nascimento),
       telefone_principal = COALESCE($6, telefone_principal),
       telefone_emergencia = COALESCE($7, telefone_emergencia),
       cep = COALESCE($8, cep), endereco = COALESCE($9, endereco),
       foto_url = COALESCE($10, foto_url), status = COALESCE($11, status),
       observacoes = COALESCE($12, observacoes)
     WHERE id = $1 AND empresa_id = $2 RETURNING *`,
    [id, empresaId, dados.nome_completo, dados.rg, dados.data_nascimento, dados.telefone_principal,
     dados.telefone_emergencia, dados.cep, dados.endereco, dados.foto_url, dados.status, dados.observacoes]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.MOTOBOY, acao: 'atualizar', detalhe: { id }, ip });
  return rows[0];
}

// Liga/desliga o status online (chamado pelo app).
async function definirOnline({ empresaId, id, online }) {
  const { rows } = await query(
    `UPDATE motoboys SET online = $3 WHERE id = $1 AND empresa_id = $2 RETURNING id, online`,
    [id, empresaId, !!online]
  );
  if (!rows[0]) throw AppError.naoEncontrado(ERRO_MSGS.MOTOBOY_NAO_ENCONTRADO);
  return rows[0];
}

module.exports = { listar, obter, criar, atualizar, definirOnline };
