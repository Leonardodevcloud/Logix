// Casca (sidebar + topbar) no padrão do protótipo. Navegação dinâmica por perfil/permissões.
import { el, icones } from './ui.js';
import { navegar } from './router.js';
import * as auth from './auth.js';

// Grupos de navegação conforme o acesso efetivo do usuário.
function gruposNav() {
  const a = auth.acessoAtual();
  if (a.perfil === 'super_admin') {
    return [{ titulo: 'Gestão', itens: [
      { rota: '/', rotulo: 'Painel', icone: 'painel' },
      { rota: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
    ] }];
  }
  const operacao = [{ rota: '/', rotulo: 'Painel', icone: 'painel' }];
  if (auth.temModulo('entregas') && auth.pode('entregas.ver')) operacao.push({ rota: '/entregas', rotulo: 'Entregas', icone: 'entregas' });
  if (auth.temModulo('motoboys') && auth.pode('motoboys.ver')) operacao.push({ rota: '/motoboys', rotulo: 'Motoboys', icone: 'motoboys' });
  if (auth.temModulo('filas') && auth.pode('filas.ver')) operacao.push({ rota: '/filas', rotulo: 'Filas', icone: 'filas' });

  const config = [];
  if (auth.temModulo('marca') && auth.pode('marca.ver')) config.push({ rota: '/marca', rotulo: 'Marca', icone: 'marca' });
  if (auth.pode('usuarios.gerenciar')) config.push({ rota: '/equipe', rotulo: 'Equipe', icone: 'equipe' });

  const grupos = [{ titulo: 'Operação', itens: operacao }];
  if (config.length) grupos.push({ titulo: 'Configuração', itens: config });
  return grupos;
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'U';
}
function perfilRotulo(p) {
  return { super_admin: 'Administrador master', cliente: 'Cliente', motoboy: 'Motoboy' }[p] || '';
}

export function casca(titulo, conteudo, subtitulo) {
  const u = auth.usuarioAtual() || {};
  const ativo = location.hash.slice(1) || '/';

  // ---- sidebar ----
  const grupos = gruposNav().map((g) => el('div', {},
    el('div', { class: 'lx-nav-lbl' }, g.titulo),
    ...g.itens.map((n) => el('button', {
      class: 'lx-nav-i' + (ativo === n.rota ? ' on' : ''),
      onClick: () => navegar(n.rota),
    }, el('span', { html: icones[n.icone] || '' }), n.rotulo)),
  ));

  const side = el('aside', { class: 'lx-side' },
    el('div', { class: 'lx-side-logo' },
      el('div', { class: 'lx-mono' }, 'LX'),
      el('div', { class: 'wm' }, el('b', { 'data-lx-nome': '' }, 'logix'), el('span', {}, 'Inteligência em cada rota'))),
    ...grupos,
    el('div', { class: 'lx-side-user' },
      el('div', { class: 'av' }, iniciais(u.nome)),
      el('div', { style: 'min-width:0' },
        el('b', {}, u.nome || '—'),
        el('small', {}, perfilRotulo(u.perfil))),
      el('button', { class: 'lx-sair', onClick: async () => { await auth.logout(); navegar('/login'); } }, 'Sair')));

  // ---- main ----
  const sub = subtitulo || (u.empresa_nome ? u.empresa_nome : perfilRotulo(u.perfil));
  const main = el('div', { class: 'lx-main' },
    el('div', { class: 'lx-topbar' },
      el('div', {}, el('h1', {}, titulo), sub ? el('div', { class: 'sub' }, sub) : el('span', {})),
      el('span', { class: 'lx-role-pill' }, perfilRotulo(u.perfil))),
    el('div', { class: 'lx-content' }, conteudo));

  return el('div', { class: 'lx-app' }, side, main);
}
