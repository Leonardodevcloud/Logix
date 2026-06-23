// Sessão do usuário + acesso efetivo (módulos contratados e permissões do papel).
import * as api from './api.js';

const CHAVE = 'logix_usuario';
const CHAVE_MASTER = 'logix_master_token'; // token original do master durante impersonação

let usuario = null;
let acesso = { perfil: null, modulos: [], permissoes: [] };

export function usuarioAtual() { return usuario; }
export function estaLogado() { return !!usuario; }
export function acessoAtual() { return acesso; }
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
  return usuario;
}

export async function logout() {
  try { await api.post('/auth/logout', {}); } catch { /* ignora */ }
  api.setToken(null);
  usuario = null;
  acesso = { perfil: null, modulos: [], permissoes: [] };
  sessionStorage.removeItem(CHAVE);
  sessionStorage.removeItem(CHAVE_MASTER); // limpa impersonação se houver
}

// Entra como cliente: salva token do master e troca para o token do cliente
export async function iniciarImpersonacao(tokenCliente, usuarioCliente) {
  // Guarda o token atual do master
  sessionStorage.setItem(CHAVE_MASTER, api.getToken());
  // Troca para o token do cliente
  api.setToken(tokenCliente);
  usuario = usuarioCliente;
  sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
  await carregarAcesso();
}

// Volta a ser master
export async function encerrarImpersonacao() {
  const tokenMaster = sessionStorage.getItem(CHAVE_MASTER);
  if (!tokenMaster) return;
  sessionStorage.removeItem(CHAVE_MASTER);
  api.setToken(tokenMaster);
  // Recarrega dados do master
  try {
    const r = await api.post('/auth/refresh', {});
    if (r.accessToken) api.setToken(r.accessToken);
    const eu = await api.get('/auth/eu');
    usuario = eu.usuario;
  } catch { /* usa o token salvo mesmo */ }
  await carregarAcesso();
  sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
}

export async function restaurar() {
  const guardado = sessionStorage.getItem(CHAVE);
  if (guardado) usuario = JSON.parse(guardado);
  try {
    // Se estiver impersonando, usa o token salvo direto (não faz refresh que quebraria)
    if (estaImpersonando()) {
      await carregarAcesso();
      return true;
    }
    const r = await api.post('/auth/refresh', {});
    if (r.accessToken) {
      api.setToken(r.accessToken);
      const eu = await api.get('/auth/eu');
      usuario = eu.usuario;
      await carregarAcesso();
      return true;
    }
  } catch { /* sessão expirada */ }
  usuario = null;
  return false;
}
