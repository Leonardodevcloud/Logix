import { el, icones } from './ui.js';
import { navegar } from './router.js';
import * as auth from './auth.js';

const iconeWhitelabel = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16h-1.5a2.5 2.5 0 0 0 0 4z"/></svg>';

function gruposNav() {
  const a = auth.acessoAtual();

  if (a.perfil === 'super_admin') {
    return [
      { titulo: 'Operação', itens: [
        { rota: '/', rotulo: 'Painel', icone: 'painel' },
      ]},
      { titulo: 'Cadastros', itens: [
        { rota: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
        { rota: '/motoboys', rotulo: 'Motoboys', icone: 'motoboys' },
        { rota: '/filas', rotulo: 'Filas', icone: 'filas' },
      ]},
      { titulo: 'Sistema', itens: [
        { rota: '/marca', rotulo: 'White-label', icone: '__whitelabel__' },
      ]},
    ];
  }

  const operacao = [{ rota: '/', rotulo: 'Painel', icone: 'painel' }];
  if (auth.temModulo('entregas') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/entregas', rotulo: 'Entregas', icone: 'entregas' });
  if (auth.temModulo('motoboys') && auth.pode('motoboys.ver'))
    operacao.push({ rota: '/motoboys', rotulo: 'Motoboys', icone: 'motoboys' });
  if (auth.temModulo('filas') && auth.pode('filas.ver'))
    operacao.push({ rota: '/filas', rotulo: 'Filas', icone: 'filas' });

  const config = [];
  if (auth.pode('usuarios.gerenciar'))
    config.push({ rota: '/equipe', rotulo: 'Equipe', icone: 'equipe' });

  const grupos = [{ titulo: 'Operação', itens: operacao }];
  if (config.length) grupos.push({ titulo: 'Configuração', itens: config });
  return grupos;
}

function iconeNav(key) {
  if (key === '__whitelabel__') return iconeWhitelabel;
  return icones[key] || '';
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'U';
}
function perfilRotulo(p) {
  return { super_admin: 'Administrador master', cliente: 'Cliente', motoboy: 'Motoboy' }[p] || '';
}

// Banner de impersonação — aparece quando o master está dentro de um cliente
function bannerImpersonacao(u) {
  if (!auth.estaImpersonando()) return null;
  return el('div', { style: `
    background:var(--lx-azul-profundo);color:#fff;
    padding:10px 24px;display:flex;align-items:center;gap:14px;
    font-size:13px;font-weight:600;
  ` },
    el('span', { style: 'flex:1' },
      '👁 Você está visualizando como ',
      el('b', {}, u.empresa_nome || u.nome || 'cliente'),
      ' — suas ações são reais.'),
    el('button', {
      style: `
        background:#fff;color:var(--lx-azul-profundo);
        border:none;border-radius:8px;padding:7px 16px;
        font-size:12px;font-weight:800;cursor:pointer
      `,
      onClick: async () => {
        await auth.encerrarImpersonacao();
        navegar('/clientes');
      }
    }, '← Voltar ao master')
  );
}

export function casca(titulo, conteudo, subtitulo) {
  const u = auth.usuarioAtual() || {};
  const ativo = location.hash.slice(1) || '/';

  const grupos = gruposNav().map((g) => el('div', {},
    el('div', { class: 'lx-nav-lbl' }, g.titulo),
    ...g.itens.map((n) => el('button', {
      class: 'lx-nav-i' + (ativo === n.rota ? ' on' : ''),
      onClick: () => navegar(n.rota),
    }, el('span', { html: iconeNav(n.icone) }), n.rotulo)),
  ));

  const side = el('aside', { class: 'lx-side' },
    el('div', { class: 'lx-side-logo' },
      el('div', { class: 'lx-mono' }, 'LX'),
      el('div', { class: 'wm' },
        el('b', { 'data-lx-nome': '' }, 'logix'),
        el('span', {}, 'Inteligência em cada rota'))),
    ...grupos,
    el('div', { class: 'lx-side-user' },
      el('div', { class: 'av' }, iniciais(u.nome)),
      el('div', { style: 'min-width:0' },
        el('b', {}, u.nome || '—'),
        el('small', {}, u.empresa_nome || perfilRotulo(u.perfil))),
      el('button', { class: 'lx-sair', onClick: async () => { await auth.logout(); navegar('/login'); } }, 'Sair')));

  const sub = subtitulo || (u.empresa_nome ? u.empresa_nome : perfilRotulo(u.perfil));
  const main = el('div', { class: 'lx-main' },
    bannerImpersonacao(u),  // banner só aparece quando impersonando
    el('div', { class: 'lx-topbar' },
      el('div', {}, el('h1', {}, titulo), sub ? el('div', { class: 'sub' }, sub) : el('span', {})),
      el('span', { class: 'lx-role-pill' }, perfilRotulo(u.perfil))),
    el('div', { class: 'lx-content' }, conteudo));

  return el('div', { class: 'lx-app' }, side, main);
}
