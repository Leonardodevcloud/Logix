// Sessão do usuário + acesso efetivo (módulos contratados e permissões do papel).
import * as api from './api.js';

const CHAVE        = 'logix_usuario';
const CHAVE_MASTER = 'logix_master_token'; // token do master salvo durante impersonação

let usuario = null;
let acesso  = { perfil: null, modulos: [], permissoes: [] };

export function usuarioAtual()     { return usuario; }
export function estaLogado()       { return !!usuario; }
export function acessoAtual()      { return acesso; }
export function estaImpersonando() { return !!sessionStorage.getItem(CHAVE_MASTER); }

export function pode(permissao) {
  if (acesso.permissoes.includes('*')) return true;
  return acesso.permissoes.includes(permissao);
}

export function temModulo(codigo) {
  if (acesso.perfil === 'super_admin') return true;
  return acesso.modulos.includes(codigo);
}

async function carregarAcesso() {
  try { acesso = await api.get('/permissoes/eu'); }
  catch { acesso = { perfil: usuario ? usuario.perfil : null, modulos: [], permissoes: [] }; }
}

export async function login(email, senha) {
  const r = await api.post('/auth/login', { email, senha });
  api.setToken(r.accessToken);
  usuario = r.usuario;
  sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
  await carregarAcesso();
  document.dispatchEvent(new CustomEvent('logix:login'));
  return usuario;
}

export async function logout() {
  if (estaImpersonando()) {
    sessionStorage.removeItem(CHAVE_MASTER);
    api.bloquearRefresh(false);
  } else {
    try { await api.post('/auth/logout', {}); } catch { /* ignora */ }
  }
  api.setToken(null);
  usuario = null;
  acesso = { perfil: null, modulos: [], permissoes: [] };
  sessionStorage.removeItem(CHAVE);
  document.dispatchEvent(new CustomEvent('logix:logout'));
}

// Entra como cliente — salva token master, ativa bloqueio de refresh, troca sessão
export async function iniciarImpersonacao(tokenCliente, usuarioCliente) {
  // Guarda token atual do master
  sessionStorage.setItem(CHAVE_MASTER, api.getToken());
  // Bloqueia refresh para o cookie do master não destruir a sessão do cliente
  api.bloquearRefresh(true);
  // Troca para o token do cliente
  api.setToken(tokenCliente);
  usuario = usuarioCliente;
  sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
  await carregarAcesso();
  document.dispatchEvent(new CustomEvent('logix:impersonar'));
}

// Volta a ser master
export async function encerrarImpersonacao() {
  const tokenMaster = sessionStorage.getItem(CHAVE_MASTER);
  if (!tokenMaster) return;
  sessionStorage.removeItem(CHAVE_MASTER);
  api.bloquearRefresh(false);
  api.setToken(tokenMaster);
  // Renova o token master (agora pode — cookie é do master)
  try {
    const r = await api.post('/auth/refresh', {});
    if (r.accessToken) api.setToken(r.accessToken);
    const eu = await api.get('/auth/eu');
    usuario = eu.usuario;
  } catch { /* usa o token salvo */ }
  await carregarAcesso();
  sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
  document.dispatchEvent(new CustomEvent('logix:voltar'));
}

// Boot: restaura sessão. Se impersonando, usa token salvo sem chamar refresh.
export async function restaurar() {
  const guardado = sessionStorage.getItem(CHAVE);
  if (guardado) {
    try { usuario = JSON.parse(guardado); } catch { usuario = null; }
  }

  if (estaImpersonando()) {
    // Sessão de impersonação: token já está no api via setToken anterior,
    // mas pode ter sido perdido (F5). Não temos como renovar sem o cookie do cliente,
    // então encerramos a impersonação automaticamente e voltamos para o master.
    const tokenMaster = sessionStorage.getItem(CHAVE_MASTER);
    if (tokenMaster) {
      api.setToken(tokenMaster);
      sessionStorage.removeItem(CHAVE_MASTER);
      api.bloquearRefresh(false);
    }
    // Agora segue o fluxo normal de restaurar como master
  }

  try {
    const r = await api.post('/auth/refresh', {});
    if (r.accessToken) {
      api.setToken(r.accessToken);
      const eu = await api.get('/auth/eu');
      usuario = eu.usuario;
      sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
      await carregarAcesso();
      return true;
    }
  } catch { /* sessão expirada */ }

  usuario = null;
  return false;
}
