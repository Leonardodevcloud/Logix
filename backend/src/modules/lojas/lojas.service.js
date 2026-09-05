const { pool, query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { AUDIT_CATEGORIES, PERFIS } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { apenasDigitos, obrigatorios } = require('../../shared/validators');
const authService = require('../auth').service;

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
         complemento, bairro, cidade, estado, responsavel, email, telefone, config_sla, codigo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         (SELECT COALESCE(MAX(codigo),0)+1 FROM lojas WHERE empresa_id = $1)) RETURNING *`,
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
      const permissoesService = require('../permissoes').service;
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

  // SET dinâmico: altera apenas os campos ENVIADOS no corpo. Assim um campo em
  // branco ('' → null) realmente LIMPA o dado — o COALESCE antigo mantinha o valor
  // antigo quando recebia null, impedindo apagar (ex.: limpar o endereço).
  const set = []; const params = [id, empresaId];
  const add = (col, val) => { params.push(val); set.push(`${col} = $${params.length}`); };
  const enviado = (k) => Object.prototype.hasOwnProperty.call(dados || {}, k);

  if (enviado('nome_fantasia') && dados.nome_fantasia) add('nome_fantasia', dados.nome_fantasia);
  if (enviado('razao_social')) add('razao_social', dados.razao_social || null);
  if (enviado('cnpj')) add('cnpj', dados.cnpj ? apenasDigitos(dados.cnpj) : null);
  if (enviado('cep')) add('cep', dados.cep ? apenasDigitos(dados.cep) : null);
  if (enviado('logradouro')) add('logradouro', dados.logradouro || null);
  if (enviado('numero')) add('numero', dados.numero || null);
  if (enviado('complemento')) add('complemento', dados.complemento || null);
  if (enviado('bairro')) add('bairro', dados.bairro || null);
  if (enviado('cidade')) add('cidade', dados.cidade || null);
  if (enviado('estado')) add('estado', dados.estado || null);
  if (enviado('responsavel')) add('responsavel', dados.responsavel || null);
  if (enviado('email')) add('email', dados.email || null);
  if (enviado('telefone')) add('telefone', dados.telefone || null);
  if (enviado('config_sla')) add('config_sla', JSON.stringify(dados.config_sla));
  if (enviado('ativo')) add('ativo', dados.ativo);
  if (enviado('permite_automatico')) add('permite_automatico', !!dados.permite_automatico);
  if (enviado('permite_manual')) add('permite_manual', !!dados.permite_manual);
  if (enviado('modo_padrao')) add('modo_padrao', dados.modo_padrao || 'auto');
  // Se o endereço de cadastro mudou/limpou, zera o cache de coordenadas para o
  // mapa recalcular a posição (ou não mostrar pin, se o endereço ficou vazio).
  const mexeuEndereco = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'].some(enviado);
  if (mexeuEndereco) { add('lat', null); add('lng', null); }
  set.push('atualizado_em = now()');

  const { rows } = await query(
    `UPDATE lojas SET ${set.join(', ')} WHERE id = $1 AND empresa_id = $2 RETURNING *`,
    params
  );

  // Propaga e-mail/senha para o usuário de acesso da loja (tabela `usuarios`).
  // Sem isto, editar a loja NÃO alterava o login: o UPDATE acima toca só na tabela
  // `lojas`, e o campo `senha` era descartado em silêncio — por isso a loja não
  // conseguia entrar com a senha nova. O login usa usuarios.email + usuarios.senha_hash.
  if (dados.email || dados.senha) {
    const { hashSenha } = require('../auth');
    // Cobre tanto o perfil atual ('loja') quanto o legado ('cliente').
    const { rows: us } = await query(
      `SELECT id FROM usuarios WHERE loja_id = $1 AND perfil = ANY($2::text[]) ORDER BY criado_em LIMIT 1`,
      [id, [PERFIS.LOJA, PERFIS.CLIENTE]]
    );
    if (us[0]) {
      const userId = us[0].id;
      if (dados.email) {
        const { rows: dup } = await query(`SELECT id FROM usuarios WHERE email = $1 AND id <> $2`, [dados.email, userId]);
        if (dup.length) throw AppError.conflito('E-mail já em uso por outro usuário');
        await query(`UPDATE usuarios SET email = $1 WHERE id = $2`, [dados.email, userId]);
      }
      if (dados.senha) {
        const senhaHash = await hashSenha(dados.senha);
        await query(`UPDATE usuarios SET senha_hash = $1 WHERE id = $2`, [senhaHash, userId]);
      }
    } else if (dados.email && dados.senha) {
      // Loja ainda sem login: cria o usuário de acesso agora (mesma lógica do criar()).
      const permissoesService = require('../permissoes').service;
      let papelId = null;
      try { papelId = await permissoesService.idDoTemplate('Loja'); } catch {}
      if (!papelId) { try { papelId = await permissoesService.idDoTemplate('Administrador'); } catch {} }
      await authService.criarUsuario({
        empresaId, lojaId: id, perfil: PERFIS.LOJA,
        nome: dados.responsavel || rows[0].nome_fantasia, email: dados.email,
        telefone: dados.telefone || null, senha: dados.senha, papelId,
      });
    }
  }

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
