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
         telefone_emergencia, cep, endereco, foto_url, observacoes, codigo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         (SELECT COALESCE(MAX(codigo),0)+1 FROM motoboys WHERE empresa_id = $1))
       RETURNING *`,
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

// Para a LOJA: só os motoboys atribuídos a ela (exclusivos, tela "Atribuição de
// motos"), e disponíveis para receber corrida = online OU "ao vivo" (posição
// recente). O campo `online` na resposta reflete essa disponibilidade — o app às
// vezes não marca o flag online mas segue enviando GPS (aparece no rastreio).
async function listarDisponiveisParaLoja({ empresaId, lojaId }) {
  const { rows } = await query(
    `SELECT DISTINCT m.id, m.nome_completo, m.cpf, m.telefone_principal, m.status, m.foto_url,
            m.online,
            (r.capturado_em > now() - interval '15 minutes') AS ao_vivo,
            (m.online = TRUE OR r.capturado_em > now() - interval '15 minutes') AS disponivel
       FROM cliente_motoboys cm
       JOIN motoboys m ON m.id = cm.motoboy_id
       LEFT JOIN LATERAL (
         SELECT capturado_em FROM rastreamento WHERE motoboy_id = m.id ORDER BY capturado_em DESC LIMIT 1
       ) r ON true
      WHERE cm.loja_id = $1 AND m.empresa_id = $2 AND m.status = 'ativo'
      ORDER BY disponivel DESC, m.nome_completo`,
    [lojaId, empresaId]
  );
  return rows;
}

module.exports = { listar, listarDisponiveisParaLoja, obter, criar, atualizar, definirOnline, desativar, reativar };

// Desativação lógica (não apaga do banco)
async function desativar({ empresaId, id, usuarioId, ip }) {
  await obter({ empresaId, id });
  const { rows } = await query(
    `UPDATE motoboys SET status = 'inativo', online = false WHERE id = $1 AND empresa_id = $2 RETURNING id, status`,
    [id, empresaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.MOTOBOY, acao: 'desativar', detalhe: { id }, ip });
  return rows[0];
}

// Reativar motoboy
async function reativar({ empresaId, id, usuarioId, ip }) {
  await obter({ empresaId, id });
  const { rows } = await query(
    `UPDATE motoboys SET status = 'ativo' WHERE id = $1 AND empresa_id = $2 RETURNING id, status`,
    [id, empresaId]
  );
  await registrarAuditoria({ empresaId, usuarioId, categoria: AUDIT_CATEGORIES.MOTOBOY, acao: 'reativar', detalhe: { id }, ip });
  return rows[0];
}
