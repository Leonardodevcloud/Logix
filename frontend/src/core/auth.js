// Sessão do usuário + acesso efetivo (módulos contratados e permissões do papel).
import * as api from './api.js';

const CHAVE = 'logix_usuario';
let usuario = null;
let acesso = { perfil: null, modulos: [], permissoes: [] };

export function usuarioAtual() { return usuario; }
export function estaLogado() { return !!usuario; }
export function acessoAtual() { return acesso; }

// Verifica se o usuário pode executar uma ação (ex.: 'entregas.criar').
export function pode(permissao) {
  if (acesso.permissoes.includes('*')) return true;
  return acesso.permissoes.includes(permissao);
}

// Verifica se o cliente tem um módulo contratado (super admin sempre tem).
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
}

// Restaura a sessão via refresh cookie httpOnly no boot.
export async function restaurar() {
  const guardado = sessionStorage.getItem(CHAVE);
  if (guardado) usuario = JSON.parse(guardado);
  try {
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
