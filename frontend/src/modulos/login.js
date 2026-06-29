import * as auth from '../core/auth.js';
import { el } from '../core/ui.js';
import { navegar } from '../core/router.js';
import { reaplicarTema, temaAtual } from '../core/tema.js';

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

  // Textos do hero vêm da marca do tenant (campo extra.login); senão, padrões.
  const t = temaAtual() || {};
  const lx = (t.extra && t.extra.login) || {};
  const frase = lx.frase || 'Sua entrega, na velocidade certa.';
  const sub = lx.subtitulo || 'Gestão de entregas, roteirização inteligente e rastreamento em tempo real.';
  const difs = (Array.isArray(lx.diferenciais) && lx.diferenciais.length)
    ? lx.diferenciais : ['Tempo real', 'Rotas otimizadas', 'Protocolos digitais'];

  const hero = el('div', { class: 'lx-login-hero' },
    // speedlines animadas
    el('div', { class: 'lx-speedlines' }, el('i'), el('i'), el('i'), el('i')),
    // losango fantasma (cor de destaque do cliente)
    el('div', { class: 'lx-ghost', html: `<svg width="380" height="380" viewBox="0 0 120 120"><path d="M60 12 108 60 60 108 12 60Z" fill="none" stroke="var(--lx-azul-vivo)" stroke-width="5"/></svg>` }),
    // logo + nome (repintam pela marca)
    el('div', { class: 'lx-hero-row lx-reveal lx-d1' },
      el('div', { class: 'lx-mono lx-pop', 'data-lx-logo': '' }, 'LX'),
      el('div', { class: 'lx-hero-name' },
        el('b', { 'data-lx-nome': '' }, 'logix'),
        el('span', {}, 'Plataforma de entregas'))),
    // headline
    el('div', { style: 'position:relative;z-index:2;margin-top:auto' },
      el('h2', { class: 'lx-reveal lx-d2', style: 'color:#fff;font-size:34px;font-weight:800;line-height:1.12;letter-spacing:-.02em;max-width:14ch' }, frase),
      el('p', { class: 'lx-reveal lx-d3', style: 'color:var(--lx-azul-claro);font-size:15px;margin-top:16px;max-width:42ch;line-height:1.6;font-weight:500' }, sub),
      el('div', { class: 'feats lx-reveal lx-d4', style: 'display:flex;gap:22px;flex-wrap:wrap;margin-top:24px' },
        ...difs.map(d => el('div', { style: 'display:flex;align-items:center;gap:7px;color:#cfe2f7;font-size:13px;font-weight:500' },
          el('span', { style: 'width:7px;height:7px;border-radius:50%;background:var(--lx-azul-vivo);display:inline-block' }), d))))
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
  // Se já houver tema de cliente carregado (acesso por domínio white-label),
  // reaplica para pintar logo/nome/cores nesta tela de login.
  setTimeout(reaplicarTema, 0);
}
