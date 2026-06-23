import * as auth from '../core/auth.js';
import { el } from '../core/ui.js';
import { navegar } from '../core/router.js';

export async function montar(container) {
  const erro = el('div', { style: 'color:var(--lx-erro);min-height:18px;font-size:13px;font-weight:600' });
  const email = el('input', { class: 'lx-input', type: 'email', placeholder: 'carlos@logix.com.br' });
  const senha = el('input', { class: 'lx-input', type: 'password', placeholder: '••••••••••' });
  const botao = el('button', {
    class: 'lx-btn lx-btn-primario',
    style: 'width:100%;justify-content:center;padding:13px;margin-top:8px',
    onClick: entrar
  }, 'Entrar',
    el('span', { html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>` }));

  async function entrar() {
    erro.textContent = '';
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try { await auth.login(email.value.trim(), senha.value); navegar('/'); }
    catch (e) { erro.textContent = e.message; }
    finally {
      botao.disabled = false;
      botao.innerHTML = '';
      botao.append(
        document.createTextNode('Entrar '),
        Object.assign(document.createElement('span'), { innerHTML: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>` })
      );
    }
  }
  senha.addEventListener('keydown', ev => { if (ev.key === 'Enter') entrar(); });

  const hero = el('div', { class: 'lx-login-hero' },
    // decoração
    el('div', { style: 'position:absolute;top:46px;right:46px;display:flex;flex-direction:column;gap:9px;align-items:flex-end;opacity:.5' },
      el('i', { style: 'height:3px;width:78px;background:var(--lx-azul-vivo);border-radius:2px;display:block' }),
      el('i', { style: 'height:3px;width:120px;background:var(--lx-azul-vivo);border-radius:2px;display:block' }),
      el('i', { style: 'height:3px;width:54px;background:var(--lx-azul-vivo);border-radius:2px;display:block' })),
    // diamante fantasma
    el('div', { html: `<svg style="position:absolute;right:-90px;bottom:-90px;opacity:.08" width="360" height="360" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="22" fill="none" stroke="var(--lx-azul-vivo)" stroke-width="6"/></svg>` }),
    // logo
    el('div', { style: 'display:flex;align-items:center;gap:14px;position:relative;z-index:2' },
      el('div', { class: 'lx-speed', style: 'display:flex;flex-direction:column;gap:5px' },
        el('i'), el('i'), el('i')),
      el('div', { class: 'lx-mono' }, 'LX'),
      el('div', { style: 'color:#fff;line-height:1' },
        el('b', { style: 'font-size:21px;font-weight:800;display:block', 'data-lx-nome': '' }, 'logix'),
        el('div', { style: 'font-size:9.5px;letter-spacing:.18em;color:var(--lx-azul-claro);text-transform:uppercase;margin-top:3px' },
          'Inteligência em cada rota'))),
    // headline
    el('div', { style: 'position:relative;z-index:2;margin-top:auto' },
      el('h2', { style: 'color:#fff;font-size:34px;font-weight:800;line-height:1.12;letter-spacing:-.02em;max-width:380px' },
        'Sua entrega, na velocidade certa.'),
      el('p', { style: 'color:var(--lx-azul-claro);font-size:15px;margin-top:16px;max-width:340px;line-height:1.6;font-weight:500' },
        'Plataforma multiempresa de gestão de entregas, roteirização inteligente e rastreamento em tempo real.')),
    // features
    el('div', { class: 'feats' },
      el('div', {}, '● Tempo real'),
      el('div', {}, '● Rotas otimizadas'),
      el('div', {}, '● Multi-tenant'))
  );

  const form = el('div', { class: 'lx-login-form' },
    el('h3', {}, 'Entrar na sua conta'),
    el('p', { class: 'lead' }, 'Acesse o painel administrativo ou o portal do cliente.'),
    el('div', { class: 'lx-field' }, el('label', {}, 'E-mail'), email),
    el('div', { class: 'lx-field' }, el('label', {}, 'Senha'), senha),
    el('div', { style: 'text-align:right;font-size:12px;color:var(--lx-azul-primario);font-weight:700;margin-top:-6px;margin-bottom:6px;cursor:pointer' }, 'Esqueci minha senha'),
    botao,
    erro,
    el('p', { style: 'text-align:center;color:var(--lx-tinta-2);font-size:12.5px;margin-top:18px' },
      'Problemas para acessar? ',
      el('a', { style: 'color:var(--lx-azul-primario);font-weight:700;text-decoration:none;cursor:pointer' }, 'Falar com o suporte'))
  );

  container.append(el('div', { class: 'lx-login' }, hero, form));
}
