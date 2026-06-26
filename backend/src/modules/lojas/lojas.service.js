const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, PERFIS } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { apenasDigitos, obrigatorios } = require('../../shared/validators');
const authService = require('../auth/auth.service');

// Lista as lojas de uma empresa (com contagem de entregas e usuários).
async function listar({ empresaId, ativo }) {
  const cond = ['l.empresa_id = $1']; const params = [empresaId];
  if (ativo !== undefined) { params.push(ativo); cond.push(`l.ativo = $${params.length}`); }
  const { rows } = await query(
    `SELECT l.*,
       (SELECT count(*)::int FROM entregas e WHERE e.loja_id = l.id) AS total_entregas,
       (SELECT count(*)::int FROM usuarios u WHERE u.loja_id = l.id AND u.ativo) AS total_usuarios,
       (SELECT count(*)::int FROM enderecos_salvos es WHERE es.loja_id = l.id) AS total_enderecos
     FROM lojas l
     WHERE ${cond.join(' AND ')}
     ORDER BY l.nome_fantasia`,
    params
  );
  return rows;
}

async function obter({ empresaId, id }) {
  const { rows } = await query(
    `SELECT * FROM lojas WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!rows[0]) throw AppError.naoEncontrado('Loja não encontrada');
  return rows[0];
}

// Cria uma loja e, opcionalmente, o primeiro usuário de acesso dela (perfil 'loja').
async function criar({ empresaId, dados, usuarioId, ip }) {
  const faltando = obrigatorios(dados, ['nome_fantasia']);
  if (faltando.length) throw AppError.validacao('Campos obrigatórios', { faltando });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO lojas (empresa_id, nome_fantasia, razao_social, cnpj, cep, logradouro, numero,
         complemento, bairro, cidade, estado, responsavel, email, telefone, config_sla)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, dados.nome_fantasia, dados.razao_social || null,
       dados.cnpj ? apenasDigitos(dados.cnpj) : null, dados.cep ? apenasDigitos(dados.cep) : null,
       dados.logradouro || null, dados.numero || null, dados.complemento || null,
       dados.bairro || null, dados.cidade || null, dados.estado || null,
       dados.responsavel || null, dados.email || null, dados.telefone || null,
       dados.config_sla ? JSON.stringify(dados.config_sla) : '{}']
    );
    const loja = rows[0];

    // Cria usuário de acesso da loja, se vier email + senha.
    let usuarioLoja = null;
    if (dados.email && dados.senha) {
      const permissoesService = require('../permissoes/permissoes.service');
      // Papel "Loja" (template de loja) ou cai para Administrador da empresa, se não existir.
      let papelId = null;
      try { papelId = await permissoesService.idDoTemplate('Loja'); } catch {}
      if (!papelId) { try { papelId = await permissoesService.idDoTemplate('Administrador'); } catch {} }
      usuarioLoja = await authService.criarUsuario({
        empresaId, lojaId: loja.id, perfil: PERFIS.LOJA,
        nome: dados.responsavel || dados.nome_fantasia, email: dados.email,
        telefone: dados.telefone, senha: dados.senha, papelId,
        executor: (sql, params) => cliente.query(sql, params),
      });
    }

    await cliente.query('COMMIT');
    await registrarAuditoria({
      empresaId, usuarioId, categoria: AUDIT_CATEGORIES.LOJA, acao: 'criar',
      detalhe: { loja: loja.id, nome: loja.nome_fantasia }, ip,
    });
    return { loja, usuario: usuarioLoja };
  } catch (e) {
    await cliente.query('ROLLBACK');
    if (e.code === '23505') throw AppError.conflito('CNPJ ou e-mail já cadastrado nesta empresa');
    throw e;
  } finally {
    cliente.release();
  }
}

async function atualizar({ empresaId, id, dados, usuarioId, ip }) {
  await obter({ empresaId, id });
  const { rows } = await query(
    `UPDATE lojas SET
       nome_fantasia = COALESCE($3, nome_fantasia),
       razao_social  = COALESCE($4, razao_social),
       cnpj          = COALESCE($5, cnpj),
       cep           = COALESCE($6, cep),
       logradouro    = COALESCE($7, logradouro),
       numero        = COALESCE($8, numero),
       complemento   = COALESCE($9, complemento),
       bairro        = COALESCE($10, bairro),
       cidade        = COALESCE($11, cidade),
       estado        = COALESCE($12, estado),
       responsavel   = COALESCE($13, responsavel),
       email         = COALESCE($14, email),
       telefone      = COALESCE($15, telefone),
       config_sla    = COALESCE($16, config_sla),
       ativo         = COALESCE($17, ativo),
       atualizado_em = now()
     WHERE id = $1 AND empresa_id = $2 RETURNING *`,
    [id, empresaId, dados.nome_fantasia, dados.razao_social,
     dados.cnpj ? apenasDigitos(dados.cnpj) : undefined,
     dados.cep ? apenasDigitos(dados.cep) : undefined,
     dados.logradouro, dados.numero, dados.complemento, dados.bairro, dados.cidade,
     dados.estado, dados.responsavel, dados.email, dados.telefone,
     dados.config_sla !== undefined ? JSON.stringify(dados.config_sla) : undefined,
     dados.ativo]
  );
  await registrarAuditoria({
    empresaId, usuarioId, categoria: AUDIT_CATEGORIES.LOJA, acao: 'atualizar',
    detalhe: { loja: id }, ip,
  });
  return rows[0];
}

// Desativa (soft delete) — preserva histórico de entregas.
async function desativar({ empresaId, id, usuarioId, ip }) {
  await obter({ empresaId, id });
  await query(`UPDATE lojas SET ativo = FALSE, atualizado_em = now() WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  // Desativa usuários da loja junto.
  await query(`UPDATE usuarios SET ativo = FALSE WHERE loja_id = $1`, [id]);
  await registrarAuditoria({
    empresaId, usuarioId, categoria: AUDIT_CATEGORIES.LOJA, acao: 'desativar',
    detalhe: { loja: id }, ip,
  });
  return { ok: true };
}

// Endereços de coleta vinculados a uma loja.
async function listarEnderecos({ empresaId, lojaId }) {
  await obter({ empresaId, id: lojaId });
  const { rows } = await query(
    `SELECT * FROM enderecos_salvos WHERE loja_id = $1 ORDER BY is_coleta_padrao DESC, apelido`,
    [lojaId]
  );
  return rows;
}

async function adicionarEndereco({ empresaId, lojaId, dados, usuarioId, ip }) {
  await obter({ empresaId, id: lojaId });
  const faltando = obrigatorios(dados, ['apelido', 'endereco_completo']);
  if (faltando.length) throw AppError.validacao('Campos obrigatórios', { faltando });

  // Se marcado como padrão, desmarca os outros da mesma loja.
  if (dados.is_coleta_padrao) {
    await query(`UPDATE enderecos_salvos SET is_coleta_padrao = FALSE WHERE loja_id = $1`, [lojaId]);
  }
  const { rows } = await query(
    `INSERT INTO enderecos_salvos (empresa_id, loja_id, apelido, endereco_completo, lat, lng,
       bairro, cidade, uf, cep, is_coleta_padrao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [empresaId, lojaId, dados.apelido, dados.endereco_completo, dados.lat || null, dados.lng || null,
     dados.bairro || null, dados.cidade || null, dados.uf || null, dados.cep || null,
     dados.is_coleta_padrao || false]
  );
  await registrarAuditoria({
    empresaId, usuarioId, categoria: AUDIT_CATEGORIES.LOJA, acao: 'add_endereco',
    detalhe: { loja: lojaId, endereco: rows[0].id }, ip,
  });
  return rows[0];
}

async function removerEndereco({ empresaId, lojaId, enderecoId }) {
  await obter({ empresaId, id: lojaId });
  await query(`DELETE FROM enderecos_salvos WHERE id = $1 AND loja_id = $2`, [enderecoId, lojaId]);
  return { ok: true };
}

module.exports = {
  listar, obter, criar, atualizar, desativar,
  listarEnderecos, adicionarEndereco, removerEndereco,
};
