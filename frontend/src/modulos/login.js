import * as auth from '../core/auth.js';
import { el } from '../core/ui.js';
import { navegar } from '../core/router.js';

export async function montar(container) {
  const erro = el('div', { style: 'color:var(--lx-erro);min-height:18px;font-size:13px;font-weight:600' });
  const email = el('input', { class: 'lx-input', type: 'email', placeholder: 'email@empresa.com' });
  const senha = el('input', { class: 'lx-input', type: 'password', placeholder: 'Sua senha' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', style: 'width:100%;justify-content:center;margin-top:6px', onClick: entrar }, 'Entrar');

  async function entrar() {
    erro.textContent = ''; botao.disabled = true;
    try { await auth.login(email.value.trim(), senha.value); navegar('/'); }
    catch (e) { erro.textContent = e.message; } finally { botao.disabled = false; }
  }
  senha.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar(); });

  const hero = el('div', { class: 'lx-login-hero' },
    el('div', {},
      el('div', { style: 'display:flex;align-items:center;gap:12px' },
        el('div', { class: 'lx-mono' }, 'LX'),
        el('b', { 'data-lx-nome': '', style: 'color:#fff;font-weight:800;font-size:18px' }, 'logix')),
      el('span', { class: 'lx-speed', style: 'display:flex;margin-top:20px' }, el('i'), el('i'), el('i')),
      el('h2', {}, 'Inteligência em cada rota.'),
      el('p', {}, 'Gestão de entregas, roteirização e rastreamento em tempo real para a sua operação.')),
    el('div', { class: 'feats' },
      el('div', {}, '● Multiempresa'), el('div', {}, '● Tempo real'), el('div', {}, '● White-label')));

  const form = el('div', { class: 'lx-login-form' },
    el('h3', {}, 'Entrar'),
    el('div', { class: 'lead' }, 'Acesse o painel da sua operação.'),
    el('div', { class: 'lx-field' }, el('label', {}, 'E-mail'), email),
    el('div', { class: 'lx-field' }, el('label', {}, 'Senha'), senha),
    botao, erro);

  container.append(el('div', { class: 'lx-login' }, hero, form));
}
