// Sessão do usuário: login/logout e restauração via refresh cookie no boot.
import * as api from './api.js';

const CHAVE = 'logix_usuario';
let usuario = null;

export function usuarioAtual() { return usuario; }
export function estaLogado() { return !!usuario; }

export async function login(email, senha) {
  const r = await api.post('/auth/login', { email, senha });
  api.setToken(r.accessToken);
  usuario = r.usuario;
  sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
  return usuario;
}

export async function logout() {
  try { await api.post('/auth/logout', {}); } catch { /* ignora */ }
  api.setToken(null);
  usuario = null;
  sessionStorage.removeItem(CHAVE);
}

// Tenta restaurar a sessão usando o refresh cookie httpOnly.
export async function restaurar() {
  const guardado = sessionStorage.getItem(CHAVE);
  if (guardado) usuario = JSON.parse(guardado);
  try {
    const r = await api.post('/auth/refresh', {});
    if (r.accessToken) {
      api.setToken(r.accessToken);
      const eu = await api.get('/auth/eu');
      usuario = eu.usuario;
      return true;
    }
  } catch { /* sessão expirada */ }
  return estaLogado();
}
