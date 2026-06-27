const bcrypt = require('bcryptjs');
const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const storage = require('../../shared/storage');
let emitirParaEmpresa = () => {};
try { emitirParaEmpresa = require('../../realtime/ws').emitirParaEmpresa; } catch {}
let emitirParaMotoboy = () => {};
try { emitirParaMotoboy = require('../../realtime/ws').emitirParaMotoboy; } catch {}

const TIPOS_DOC = ['selfie', 'habilitacao', 'comprovante_endereco', 'antecedentes'];

// ── Config de cadastro (campos obrigatórios) ──────────────────────
const CONFIG_PADRAO = {
  nome_completo: true, cpf: true, data_nascimento: true, telefone_principal: true,
  email: true, senha: true, telefone_emergencia: false,
  cep: true, logradouro: true, numero: true, complemento: false, bairro: true, cidade: true, estado: true,
  doc_selfie: true, doc_habilitacao: true, doc_comprovante_endereco: true, doc_antecedentes: true,
};

async function obterConfigCadastro(empresaId) {
  const { rows } = await query(`SELECT campos FROM motoboy_cadastro_config WHERE empresa_id = $1`, [empresaId]);
  return { ...CONFIG_PADRAO, ...(rows[0]?.campos || {}) };
}

async function salvarConfigCadastro({ empresaId, campos, usuarioId }) {
  const merge = { ...CONFIG_PADRAO, ...(campos || {}) };
  await query(
    `INSERT INTO motoboy_cadastro_config (empresa_id, campos, atualizado_em)
     VALUES ($1, $2, now())
     ON CONFLICT (empresa_id) DO UPDATE SET campos = $2, atualizado_em = now()`,
    [empresaId, JSON.stringify(merge)]
  );
  return { ok: true, campos: merge };
}

// ── Modalidades de interesse (aparecem no app) ────────────────────
async function listarModalidadesInteresse({ empresaId, somenteAtivas = false }) {
  const cond = somenteAtivas ? 'AND ativo = TRUE' : '';
  const { rows } = await query(
    `SELECT id, nome, descricao, cor, ordem, ativo FROM motoboy_modalidades_interesse
      WHERE empresa_id = $1 ${cond} ORDER BY ordem, nome`,
    [empresaId]
  );
  return rows;
}

async function criarModalidadeInteresse({ empresaId, nome, descricao, cor, ordem }) {
  if (!nome) throw AppError.validacao('Nome obrigatório');
  const { rows } = await query(
    `INSERT INTO motoboy_modalidades_interesse (empresa_id, nome, descricao, cor, ordem)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [empresaId, nome, descricao || null, cor || '#7c3aed', ordem || 0]
  );
  return rows[0];
}

async function atualizarModalidadeInteresse({ empresaId, id, nome, descricao, cor, ordem, ativo }) {
  const { rows } = await query(
    `UPDATE motoboy_modalidades_interesse
        SET nome = COALESCE($3, nome), descricao = $4, cor = COALESCE($5, cor),
            ordem = COALESCE($6, ordem), ativo = COALESCE($7, ativo)
      WHERE id = $2 AND empresa_id = $1 RETURNING *`,
    [empresaId, id, nome ?? null, descricao ?? null, cor ?? null, ordem ?? null, ativo ?? null]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Modalidade não encontrada');
  return rows[0];
}

async function excluirModalidadeInteresse({ empresaId, id }) {
  await query(`DELETE FROM motoboy_modalidades_interesse WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  return { ok: true };
}

// ── Cadastro pelo app ─────────────────────────────────────────────
// Cria um motoboy com situacao_cadastro='pendente'. Valida obrigatoriedade
// conforme a config da empresa. Sobe os documentos no storage.
async function cadastrarPeloApp({ empresaId, dados }) {
  const cfg = await obterConfigCadastro(empresaId);
  const d = dados || {};

  // Validação de campos de texto obrigatórios.
  const faltando = [];
  const checa = (campo, valor, rotulo) => { if (cfg[campo] && !String(valor || '').trim()) faltando.push(rotulo); };
  checa('nome_completo', d.nome_completo, 'Nome completo');
  checa('cpf', d.cpf, 'CPF');
  checa('data_nascimento', d.data_nascimento, 'Data de nascimento');
  checa('telefone_principal', d.telefone_principal, 'Telefone');
  checa('email', d.email, 'E-mail');
  checa('senha', d.senha, 'Senha');
  checa('telefone_emergencia', d.telefone_emergencia, 'Telefone de emergência');
  checa('cep', d.cep, 'CEP');
  checa('logradouro', d.logradouro, 'Logradouro');
  checa('numero', d.numero, 'Número');
  checa('bairro', d.bairro, 'Bairro');
  checa('cidade', d.cidade, 'Cidade');
  checa('estado', d.estado, 'Estado');
  if (faltando.length) throw AppError.validacao('Preencha os campos obrigatórios: ' + faltando.join(', '));

  const cpf = String(d.cpf || '').replace(/\D/g, '');
  const tel = String(d.telefone_principal || '').replace(/\D/g, '');
  const email = String(d.email || '').trim().toLowerCase();

  if (cfg.cpf && cpf.length !== 11) throw AppError.validacao('CPF inválido');
  if (cfg.email && !/^[^@]+@[^@]+\.[^@]+$/.test(email)) throw AppError.validacao('E-mail inválido');

  // Duplicidade
  const dup = await query(
    `SELECT id, situacao_cadastro FROM motoboys WHERE empresa_id = $1 AND (cpf = $2 OR lower(email) = $3) LIMIT 1`,
    [empresaId, cpf, email]
  );
  if (dup.rows[0]) throw AppError.conflito('Já existe um cadastro com este CPF ou e-mail. Faça login ou fale com a central.');

  const senhaHash = d.senha ? await bcrypt.hash(String(d.senha), 10) : null;

  // Validação de documentos obrigatórios (vêm como data URIs base64).
  const docs = d.documentos || {};
  const docFaltando = [];
  for (const tipo of TIPOS_DOC) {
    const flag = 'doc_' + tipo;
    if (cfg[flag] && !docs[tipo]) docFaltando.push(rotuloDoc(tipo));
  }
  if (docFaltando.length) throw AppError.validacao('Envie os documentos obrigatórios: ' + docFaltando.join(', '));

  // Cria o motoboy pendente.
  const { rows } = await query(
    `INSERT INTO motoboys (empresa_id, nome_completo, cpf, data_nascimento, telefone_principal, telefone_emergencia,
        email, senha_hash, cep, logradouro, numero, complemento, bairro, cidade, estado,
        modalidade_interesse_id, situacao_cadastro, origem_cadastro, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pendente','app','inativo')
     RETURNING id, codigo`,
    [empresaId, d.nome_completo, cpf, d.data_nascimento || null, tel, String(d.telefone_emergencia || '').replace(/\D/g, '') || null,
     email, senhaHash, String(d.cep || '').replace(/\D/g, '') || null, d.logradouro || null, d.numero || null,
     d.complemento || null, d.bairro || null, d.cidade || null, (d.estado || '').toUpperCase().slice(0, 2) || null,
     d.modalidade_interesse_id || null]
  );
  const motoboyId = rows[0].id;

  // Sobe documentos.
  for (const tipo of TIPOS_DOC) {
    if (docs[tipo]) {
      try {
        const { key, mime, tamanho } = await storage.subirBase64({ empresaId, motoboyId, tipo, dataUri: docs[tipo] });
        await query(
          `INSERT INTO motoboy_documentos (empresa_id, motoboy_id, tipo, storage_key, mime, tamanho)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (motoboy_id, tipo) DO UPDATE SET storage_key = $4, mime = $5, tamanho = $6, status = 'enviado', enviado_em = now()`,
          [empresaId, motoboyId, tipo, key, mime, tamanho]
        );
        if (tipo === 'selfie') await query(`UPDATE motoboys SET foto_url = $1 WHERE id = $2`, [await storage.urlDe(key), motoboyId]);
      } catch (e) {
        // Se o storage falhar, removemos o cadastro para não deixar lixo.
        await query(`DELETE FROM motoboys WHERE id = $1`, [motoboyId]);
        throw new Error('Falha ao salvar documentos: ' + e.message);
      }
    }
  }

  // Notifica a central (badge de cadastros pendentes).
  emitirParaEmpresa(empresaId, 'motoboy.cadastro_novo', { motoboyId });

  // Nome da modalidade escolhida (para a mensagem de confirmação).
  let modalidadeNome = null;
  if (d.modalidade_interesse_id) {
    const mod = await query(`SELECT nome FROM motoboy_modalidades_interesse WHERE id = $1`, [d.modalidade_interesse_id]);
    modalidadeNome = mod.rows[0]?.nome || null;
  }
  return { ok: true, motoboy_id: motoboyId, situacao: 'pendente', modalidade: modalidadeNome };
}

function rotuloDoc(tipo) {
  return { selfie: 'Selfie', habilitacao: 'Habilitação (CNH)', comprovante_endereco: 'Comprovante de endereço', antecedentes: 'Antecedentes criminais' }[tipo] || tipo;
}

// ── Central: listar cadastros (pendentes/aprovados) ───────────────
async function listarCadastros({ empresaId, situacao = null, busca = null }) {
  const params = [empresaId];
  const cond = ['m.empresa_id = $1'];
  if (situacao) { params.push(situacao); cond.push(`m.situacao_cadastro = $${params.length}`); }
  if (busca) { params.push('%' + busca + '%'); cond.push(`(m.nome_completo ILIKE $${params.length} OR m.cpf ILIKE $${params.length} OR m.email ILIKE $${params.length})`); }
  const { rows } = await query(
    `SELECT m.id, m.codigo, m.nome_completo, m.cpf, m.email, m.telefone_principal, m.foto_url,
            m.situacao_cadastro, m.origem_cadastro, m.criado_em, m.modalidade_interesse_id,
            mi.nome AS modalidade_nome,
            (SELECT count(*)::int FROM motoboy_documentos d WHERE d.motoboy_id = m.id) AS qtd_documentos
       FROM motoboys m
       LEFT JOIN motoboy_modalidades_interesse mi ON mi.id = m.modalidade_interesse_id
      WHERE ${cond.join(' AND ')}
      ORDER BY CASE m.situacao_cadastro WHEN 'pendente' THEN 0 WHEN 'reenvio' THEN 1 ELSE 2 END, m.criado_em DESC`,
    params
  );
  // Contadores por situação.
  const { rows: cont } = await query(
    `SELECT situacao_cadastro, count(*)::int AS qtd FROM motoboys WHERE empresa_id = $1 GROUP BY situacao_cadastro`,
    [empresaId]
  );
  const contadores = {};
  cont.forEach(c => { contadores[c.situacao_cadastro] = c.qtd; });
  return { cadastros: rows, contadores };
}

// ── Central: detalhe completo de um cadastro ──────────────────────
async function detalheCadastro({ empresaId, motoboyId }) {
  const { rows } = await query(
    `SELECT m.*, mi.nome AS modalidade_nome
       FROM motoboys m
       LEFT JOIN motoboy_modalidades_interesse mi ON mi.id = m.modalidade_interesse_id
      WHERE m.id = $1 AND m.empresa_id = $2`,
    [motoboyId, empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  const m = rows[0];
  delete m.senha_hash; delete m.pin_hash;

  const { rows: docs } = await query(
    `SELECT id, tipo, storage_key, mime, tamanho, status, enviado_em FROM motoboy_documentos WHERE motoboy_id = $1`,
    [motoboyId]
  );
  // Gera URLs assinadas para visualização.
  for (const doc of docs) {
    try { doc.url = await storage.urlDe(doc.storage_key); } catch { doc.url = null; }
  }
  return { ...m, documentos: docs };
}

// ── Central: aprovar / recusar / solicitar reenvio ────────────────
async function aprovarCadastro({ empresaId, motoboyId, usuarioId, ip }) {
  const { rows } = await query(
    `UPDATE motoboys SET situacao_cadastro = 'aprovado', status = 'ativo', motivo_reenvio = NULL,
            revisado_por = $3, revisado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING id, nome_completo`,
    [motoboyId, empresaId, usuarioId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  emitirParaMotoboy(motoboyId, 'cadastro.aprovado', {});
  return { ok: true };
}

async function recusarCadastro({ empresaId, motoboyId, motivo, usuarioId }) {
  const { rows } = await query(
    `UPDATE motoboys SET situacao_cadastro = 'recusado', status = 'inativo',
            motivo_reenvio = $3, revisado_por = $4, revisado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [motoboyId, empresaId, motivo || null, usuarioId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  emitirParaMotoboy(motoboyId, 'cadastro.recusado', { motivo });
  return { ok: true };
}

// Solicita reenvio/correção. O app deve bloquear o motoboy e redirecioná-lo.
async function solicitarReenvio({ empresaId, motoboyId, motivo, docsParaRemover = [], usuarioId }) {
  const m = await query(`SELECT id FROM motoboys WHERE id = $1 AND empresa_id = $2`, [motoboyId, empresaId]);
  if (!m.rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  if (!motivo || !String(motivo).trim()) throw AppError.validacao('Descreva o que o motoboy precisa corrigir');

  // Remove os documentos solicitados (apaga do storage e do banco).
  for (const tipo of docsParaRemover) {
    const d = await query(`SELECT storage_key FROM motoboy_documentos WHERE motoboy_id = $1 AND tipo = $2`, [motoboyId, tipo]);
    if (d.rows[0]) { await storage.removerArquivo(d.rows[0].storage_key); await query(`DELETE FROM motoboy_documentos WHERE motoboy_id = $1 AND tipo = $2`, [motoboyId, tipo]); }
  }

  await query(
    `UPDATE motoboys SET situacao_cadastro = 'reenvio', motivo_reenvio = $3, revisado_por = $4, revisado_em = now()
      WHERE id = $1 AND empresa_id = $2`,
    [motoboyId, empresaId, motivo, usuarioId]
  );
  // Popup no app → redireciona para correção.
  emitirParaMotoboy(motoboyId, 'cadastro.reenvio', { motivo });
  return { ok: true };
}

// ── Central: editar dados do cadastro (inclui senha) ──────────────
async function editarCadastro({ empresaId, motoboyId, dados, usuarioId }) {
  const d = dados || {};
  const campos = [];
  const params = [motoboyId, empresaId];
  const set = (col, val) => { params.push(val); campos.push(`${col} = $${params.length}`); };

  if (d.nome_completo !== undefined) set('nome_completo', d.nome_completo);
  if (d.cpf !== undefined) set('cpf', String(d.cpf).replace(/\D/g, ''));
  if (d.data_nascimento !== undefined) set('data_nascimento', d.data_nascimento || null);
  if (d.telefone_principal !== undefined) set('telefone_principal', String(d.telefone_principal).replace(/\D/g, ''));
  if (d.telefone_emergencia !== undefined) set('telefone_emergencia', String(d.telefone_emergencia || '').replace(/\D/g, '') || null);
  if (d.email !== undefined) set('email', String(d.email).trim().toLowerCase());
  if (d.cep !== undefined) set('cep', String(d.cep || '').replace(/\D/g, '') || null);
  if (d.logradouro !== undefined) set('logradouro', d.logradouro || null);
  if (d.numero !== undefined) set('numero', d.numero || null);
  if (d.complemento !== undefined) set('complemento', d.complemento || null);
  if (d.bairro !== undefined) set('bairro', d.bairro || null);
  if (d.cidade !== undefined) set('cidade', d.cidade || null);
  if (d.estado !== undefined) set('estado', (d.estado || '').toUpperCase().slice(0, 2) || null);
  if (d.modalidade_interesse_id !== undefined) set('modalidade_interesse_id', d.modalidade_interesse_id || null);
  if (d.senha) { const h = await bcrypt.hash(String(d.senha), 10); set('senha_hash', h); }

  if (!campos.length) return { ok: true };
  const { rows } = await query(
    `UPDATE motoboys SET ${campos.join(', ')} WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    params
  );
  if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  return { ok: true };
}

// ── Central: remover um documento específico ──────────────────────
async function removerDocumento({ empresaId, motoboyId, tipo, usuarioId }) {
  const d = await query(`SELECT storage_key FROM motoboy_documentos WHERE motoboy_id = $1 AND tipo = $2`, [motoboyId, tipo]);
  if (!d.rows[0]) throw AppError.naoEncontrado('Documento não encontrado');
  await storage.removerArquivo(d.rows[0].storage_key);
  await query(`DELETE FROM motoboy_documentos WHERE motoboy_id = $1 AND tipo = $2`, [motoboyId, tipo]);
  return { ok: true };
}

// ── App: estado do próprio cadastro (para bloqueio/redirecionamento) ──
async function meuCadastro({ empresaId, motoboyId }) {
  const { rows } = await query(
    `SELECT situacao_cadastro, motivo_reenvio FROM motoboys WHERE id = $1 AND empresa_id = $2`,
    [motoboyId, empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Motoboy não encontrado');
  const { rows: docs } = await query(`SELECT tipo, status FROM motoboy_documentos WHERE motoboy_id = $1`, [motoboyId]);
  return { situacao: rows[0].situacao_cadastro, motivo: rows[0].motivo_reenvio, documentos: docs };
}

// ── App: reenviar dados/documentos após solicitação ───────────────
async function reenviarCadastro({ empresaId, motoboyId, dados }) {
  const d = dados || {};
  // Atualiza dados de texto, se vierem.
  if (Object.keys(d).some(k => k !== 'documentos')) {
    await editarCadastro({ empresaId, motoboyId, dados: d });
  }
  // Reenvia documentos.
  const docs = d.documentos || {};
  for (const tipo of TIPOS_DOC) {
    if (docs[tipo]) {
      const { key, mime, tamanho } = await storage.subirBase64({ empresaId, motoboyId, tipo, dataUri: docs[tipo] });
      await query(
        `INSERT INTO motoboy_documentos (empresa_id, motoboy_id, tipo, storage_key, mime, tamanho)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (motoboy_id, tipo) DO UPDATE SET storage_key = $4, mime = $5, tamanho = $6, status = 'enviado', enviado_em = now()`,
        [empresaId, motoboyId, tipo, key, mime, tamanho]
      );
      if (tipo === 'selfie') await query(`UPDATE motoboys SET foto_url = $1 WHERE id = $2`, [await storage.urlDe(key), motoboyId]);
    }
  }
  // Volta para pendente (re-análise).
  await query(`UPDATE motoboys SET situacao_cadastro = 'pendente', motivo_reenvio = NULL WHERE id = $1 AND empresa_id = $2`, [motoboyId, empresaId]);
  emitirParaEmpresa(empresaId, 'motoboy.cadastro_novo', { motoboyId });
  return { ok: true, situacao: 'pendente' };
}

module.exports = {
  obterConfigCadastro, salvarConfigCadastro,
  listarModalidadesInteresse, criarModalidadeInteresse, atualizarModalidadeInteresse, excluirModalidadeInteresse,
  cadastrarPeloApp, listarCadastros, detalheCadastro,
  aprovarCadastro, recusarCadastro, solicitarReenvio, editarCadastro, removerDocumento,
  meuCadastro, reenviarCadastro,
};
