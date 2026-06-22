import * as auth from '../core/auth.js';
import { el } from '../core/ui.js';
import { navegar } from '../core/router.js';

export async function montar(container) {
  const erro = el('div', { style: 'color:var(--lx-erro);min-height:18px;font-size:13px' });
  const email = el('input', { class: 'lx-input', type: 'email', placeholder: 'E-mail' });
  const senha = el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha' });

  async function entrar() {
    erro.textContent = '';
    try { await auth.login(email.value.trim(), senha.value); navegar('/'); }
    catch (e) { erro.textContent = e.message; }
  }
  senha.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar(); });

  container.append(el('div', { style: 'min-height:100vh;display:grid;place-items:center;background:var(--lx-fundo)' },
    el('div', { class: 'lx-card lx-card-pad', style: 'width:340px;display:flex;flex-direction:column;gap:12px' },
      el('h1', { 'data-lx-nome': '', style: 'margin:0;font-size:22px' }, 'Logix'),
      el('div', { class: 'lx-muted' }, 'Entre para continuar'),
      email, senha,
      el('button', { class: 'lx-btn lx-btn-primario', onClick: entrar }, 'Entrar'),
      erro)));
}
