const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { ERRO_MSGS, AUDIT_CATEGORIES, PERFIS } = require('../../shared/constants');
const { registrarAuditoria } = require('../../shared/auditLogger');
const sh = require('./auth.shared');

function publico(u) {
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, empresaId: u.empresa_id, lojaId: u.loja_id || null };
}

// Emite access + refresh e persiste o hash do refresh.
async function emitirSessao(usuario) {
  const accessToken = sh.gerarAccessToken(usuario);
  const refresh = sh.gerarRefreshToken();
  await query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em) VALUES ($1, $2, $3)`,
    [usuario.id, refresh.hash, refresh.expiraEm]
  );
  return { accessToken, refreshToken: refresh.bruto };
}

async function autenticar({ email, senha, ip }) {
  const { rows } = await query(
    `SELECT id, empresa_id, loja_id, perfil, nome, email, senha_hash, ativo FROM usuarios WHERE email = $1`,
    [email]
  );
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) throw AppError.naoAutorizado(ERRO_MSGS.CREDENCIAIS_INVALIDAS);
  if (!(await sh.conferirSenha(senha, usuario.senha_hash))) {
    throw AppError.naoAutorizado(ERRO_MSGS.CREDENCIAIS_INVALIDAS);
  }
  const tokens = await emitirSessao(usuario);
  await query(`UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1`, [usuario.id]);
  await registrarAuditoria({
    empresaId: usuario.empresa_id, usuarioId: usuario.id,
    categoria: AUDIT_CATEGORIES.AUTENTICACAO, acao: 'login', ip,
  });
  return { usuario: publico(usuario), ...tokens };
}

// Renovação com rotação: revoga o refresh atual e emite um novo.
async function renovar({ refreshToken }) {
  if (!refreshToken) throw AppError.naoAutorizado(ERRO_MSGS.TOKEN_AUSENTE);
  const hash = sh.hashRefresh(refreshToken);
  const { rows } = await query(
    `SELECT rt.id, rt.revogado, rt.expira_em, u.id AS usuario_id, u.empresa_id, u.loja_id, u.perfil, u.nome
       FROM refresh_tokens rt JOIN usuarios u ON u.id = rt.usuario_id
      WHERE rt.token_hash = $1`,
    [hash]
  );
  const reg = rows[0];
  if (!reg || reg.revogado || new Date(reg.expira_em) < new Date()) {
    throw AppError.naoAutorizado(ERRO_MSGS.TOKEN_INVALIDO);
  }
  await query(`UPDATE refresh_tokens SET revogado = TRUE WHERE id = $1`, [reg.id]);
  return emitirSessao({ id: reg.usuario_id, empresa_id: reg.empresa_id, loja_id: reg.loja_id, perfil: reg.perfil, nome: reg.nome });
}

async function encerrar({ refreshToken }) {
  if (!refreshToken) return;
  await query(`UPDATE refresh_tokens SET revogado = TRUE WHERE token_hash = $1`, [sh.hashRefresh(refreshToken)]);
}

// Super admin entra como cliente/motoboy sem senha.
async function impersonar({ adminId, usuarioAlvoId, ip }) {
  const { rows } = await query(
    `SELECT id, empresa_id, loja_id, perfil, nome FROM usuarios WHERE id = $1 AND ativo = TRUE`,
    [usuarioAlvoId]
  );
  const alvo = rows[0];
  if (!alvo) throw AppError.naoEncontrado('Usuário alvo não encontrado');
  if (alvo.perfil === PERFIS.SUPER_ADMIN) throw AppError.proibido('Não é possível impersonar outro administrador');
  await registrarAuditoria({
    empresaId: alvo.empresa_id, usuarioId: adminId,
    categoria: AUDIT_CATEGORIES.IMPERSONACAO, acao: 'entrar_como', detalhe: { alvo: alvo.id }, ip,
  });
  return emitirSessao(alvo);
}

// Cria usuário (usado no cadastro de empresa/cliente e de motoboy).
async function criarUsuario({ empresaId = null, lojaId = null, perfil, nome, email, telefone = null, senha, papelId = null, executor = query }) {
  const senhaHash = await sh.hashSenha(senha);
  // `executor` permite executar dentro de uma transação aberta (ex.: criação de empresa),
  // garantindo que a FK usuarios.empresa_id enxergue a empresa ainda não commitada.
  const { rows } = await executor(
    `INSERT INTO usuarios (empresa_id, loja_id, perfil, nome, email, telefone, senha_hash, papel_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, empresa_id, loja_id, perfil, nome, email`,
    [empresaId, lojaId, perfil, nome, email, telefone, senhaHash, papelId]
  );
  return publico(rows[0]);
}

module.exports = { autenticar, renovar, encerrar, impersonar, criarUsuario, emitirSessao, publico };
