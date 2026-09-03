import { el, icones } from './ui.js';
import { navegar } from './router.js';
import * as auth from './auth.js';
import { reaplicarTema } from './tema.js';
import { get as apiGet } from './api.js';

const iconeWhitelabel = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16h-1.5a2.5 2.5 0 0 0 0 4z"/></svg>';
const iconeApi = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function gruposNav() {
  const a = auth.acessoAtual();

  if (a.perfil === 'super_admin') {
    return [
      { titulo: 'Operação', itens: [
        { rota: '/', rotulo: 'Dashboard', icone: 'painel' },
      ]},
      { titulo: 'Cadastros', itens: [
        { rota: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
        { rotulo: 'Entregadores', icone: 'motoboys', filhos: [
          { rota: '/motoboys', rotulo: 'Cadastro de entregadores' },
          { rota: '/rotas', rotulo: 'Rotas traçadas' },
          { rota: '/gamificacao', rotulo: 'Gamificação' },
        ] },
        { rota: '/rastreio', rotulo: 'Rastreio', icone: 'rastreio' },
      ]},
      { titulo: 'Sistema', itens: [
        { rota: '/marca', rotulo: 'White-label', icone: '__whitelabel__' },
        { rota: '/custos-api', rotulo: 'Custos de API', icone: '__api__' },
      ]},
    ];
  }

  const central = a.perfil === 'central_admin';
  const operacao = [{ rota: '/', rotulo: 'Dashboard', icone: 'painel' }];
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
  // Relatórios: central e loja (loja vê só a própria). Gate por entregas.ver.
  if (auth.pode('entregas.ver'))
    operacao.push({ rota: '/relatorios', rotulo: 'Relatórios', icone: 'entregas' });
  // Lojas (clientes): gestão da central, quem tem permissão de lojas.
  if (central && auth.temModulo('lojas') && auth.pode('lojas.ver'))
    operacao.push({ rota: '/lojas', rotulo: 'Lojas', icone: 'clientes' });
  if (auth.temModulo('motoboys') && auth.pode('motoboys.ver'))
    operacao.push({ rotulo: 'Entregadores', icone: 'motoboys', filhos: [
      { rota: '/motoboys', rotulo: 'Cadastro de entregadores' },
      { rota: '/rotas', rotulo: 'Rotas traçadas' },
      { rota: '/gamificacao', rotulo: 'Gamificação' },
    ] });
  // Financeiro: ferramenta da central — aparece por permissão (não é módulo
  // vendável por cliente, então não depende de temModulo).
  if (central && auth.pode('financeiro.ver'))
    operacao.push({ rota: '/financeiro', rotulo: 'Financeiro', icone: 'financeiro' });

  // Chat interno — módulo vendável. Central: "Suporte"; Loja: "Mensagens".
  if (central && auth.temModulo('chat') && auth.pode('chat.ver'))
    operacao.push({ rota: '/chat', rotulo: 'Suporte', icone: 'chat' });
  else if (a.perfil === 'loja' && auth.temModulo('chat'))
    operacao.push({ rota: '/chat', rotulo: 'Mensagens', icone: 'chat' });

  const config = [];
  if (central) config.push({ rota: '/modulos', rotulo: 'Módulos', icone: 'config' });
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
    ...g.itens.map((n) => {
      if (n.filhos) {
        const aberto = n.filhos.some((f) => ativo === f.rota);
        const sub = el('div', { style: aberto ? '' : 'display:none' },
          ...n.filhos.map((f) => el('button', {
            class: 'lx-nav-i' + (ativo === f.rota ? ' on' : ''),
            style: 'padding-left:46px;font-size:13px',
            onClick: () => navegar(f.rota),
          }, f.rotulo)));
        const cab = el('button', { class: 'lx-nav-i',
          onClick: () => { sub.style.display = sub.style.display === 'none' ? '' : 'none'; } },
          el('span', { html: iconeNav(n.icone) }), n.rotulo,
          el('span', { style: 'margin-left:auto;font-size:10px;opacity:.65' }, '\u25be'));
        return el('div', {}, cab, sub);
      }
      return el('button', {
        class: 'lx-nav-i' + (ativo === n.rota ? ' on' : ''),
        ...(n.rota === '/chat' ? { 'data-chatnav': '1' } : {}),
        onClick: () => n.novaAba
          ? window.open(location.pathname + '#' + n.rota, '_blank')
          : navegar(n.rota),
      }, el('span', { html: iconeNav(n.icone) }), n.rotulo,
        n.rota === '/chat' ? el('span', { 'data-chatbadge': '', style: 'margin-left:auto;display:none;background:var(--lx-erro);color:#fff;font-size:9px;font-weight:800;border-radius:99px;min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 4px' }) : '');
    }),
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
  // Badge de não lidas no item de chat do menu (poll leve; só se o item existe).
  try {
    if (auth.temModulo('chat') && (u.perfil === 'central_admin' || u.perfil === 'loja')) {
      clearInterval(window.__lxChatBadge);
      const atualizar = async () => {
        const alvo = side.querySelector('[data-chatbadge]');
        if (!alvo) { clearInterval(window.__lxChatBadge); return; }
        try { const r = await apiGet('/chat/nao-lidas'); const t = (r && r.total) || 0; alvo.textContent = t > 9 ? '9+' : String(t); alvo.style.display = t > 0 ? '' : 'none'; } catch {}
      };
      atualizar();
      window.__lxChatBadge = setInterval(atualizar, 15000);
    }
  } catch {}
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
