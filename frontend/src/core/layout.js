import { el, icones } from './ui.js';
import { navegar } from './router.js';
import * as auth from './auth.js';
import { reaplicarTema } from './tema.js';

const iconeWhitelabel = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16h-1.5a2.5 2.5 0 0 0 0 4z"/></svg>';
const iconeApi = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

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
        { rota: '/rastreio', rotulo: 'Rastreio', icone: 'rastreio' },
      ]},
      { titulo: 'Sistema', itens: [
        { rota: '/marca', rotulo: 'White-label', icone: '__whitelabel__' },
      ]},
    ];
  }

  const central = a.perfil === 'central_admin';
  const operacao = [{ rota: '/', rotulo: 'Painel', icone: 'painel' }];
  // Central tem a tela de Acompanhamento (visão de todas as lojas).
  if (central && auth.temModulo('entregas') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/acompanhamento', rotulo: 'Acompanhamento', icone: 'acompanhamento' });
  // Rastreio logo abaixo de Acompanhamento.
  if (auth.temModulo('rastreamento') && auth.pode('rastreamento.ver'))
    operacao.push({ rota: '/rastreio', rotulo: 'Rastreio', icone: 'rastreio' });
  // Mapa em tempo real logo abaixo do Rastreio (abre em aba dedicada).
  if (central && auth.temModulo('rastreamento') && auth.pode('rastreamento.ver'))
    operacao.push({ rota: '/mapa', rotulo: 'Mapa em tempo real', icone: 'mapa', novaAba: true });
  // Radar operacional: motoboys parados/sem sinal em corridas em rota.
  // Central vê tudo (+ configura); loja vê só os alertas das entregas dela.
  if ((central || a.perfil === 'loja') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/radar', rotulo: 'Radar', icone: 'acompanhamento' });
  if (auth.temModulo('entregas') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/entregas', rotulo: 'Entregas', icone: 'entregas' });
  // Lojas (clientes): gestão da central, quem tem permissão de lojas.
  if (central && auth.temModulo('lojas') && auth.pode('lojas.ver'))
    operacao.push({ rota: '/lojas', rotulo: 'Lojas', icone: 'clientes' });
  if (auth.temModulo('motoboys') && auth.pode('motoboys.ver'))
    operacao.push({ rota: '/motoboys', rotulo: 'Motoboys', icone: 'motoboys' });
  // Financeiro: ferramenta da central — aparece por permissão (não é módulo
  // vendável por cliente, então não depende de temModulo).
  if (central && auth.pode('financeiro.ver'))
    operacao.push({ rota: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro' });

  const config = [];
  if (auth.pode('usuarios.gerenciar'))
    config.push({ rota: '/equipe', rotulo: 'Equipe', icone: 'equipe' });
  // Integrações (API): ferramenta da central — aparece por permissão.
  if (central && auth.pode('integracoes.ver'))
    config.push({ rota: '/integracoes', rotulo: 'Integrações', icone: '__api__' });
  // Configurações da operação — administradores da central (gerência de usuários).
  if (central && auth.pode('usuarios.gerenciar'))
    config.push({ rota: '/configuracoes', rotulo: 'Configurações', icone: 'config' });

  const grupos = [{ titulo: 'Operação', itens: operacao }];
  if (config.length) grupos.push({ titulo: 'Configuração', itens: config });
  return grupos;
}

function iconeNav(key) {
  if (key === '__whitelabel__') return iconeWhitelabel;
  if (key === '__api__') return iconeApi;
  return icones[key] || '';
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'U';
}
function perfilRotulo(p) {
  return { super_admin: 'Administrador master', central_admin: 'Administrador da central', loja: 'Loja', cliente: 'Cliente', motoboy: 'Motoboy' }[p] || '';
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
      onClick: () => n.novaAba
        ? window.open(location.pathname + '#' + n.rota, '_blank')
        : navegar(n.rota),
    }, el('span', { html: iconeNav(n.icone) }), n.rotulo)),
  ));

  const side = el('aside', { class: 'lx-side' },
    el('div', { class: 'lx-side-logo' },
      el('div', { class: 'lx-mono', 'data-lx-logo': '' }, 'LX'),
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

  // A sidebar acabou de ser (re)criada; reaplica o tema do tenant (logo/nome/cores)
  // no próximo tick, quando este elemento já estiver na DOM.
  setTimeout(reaplicarTema, 0);
  return el('div', { class: 'lx-app' }, side, main);
}
