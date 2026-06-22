// Casca da aplicação (sidebar + topbar). Os módulos renderizam o conteúdo dentro dela.
import { el } from './ui.js';
import { navegar } from './router.js';
import * as auth from './auth.js';

const NAV = [
  { rota: '/', rotulo: 'Painel' },
  { rota: '/entregas', rotulo: 'Entregas' },
  { rota: '/motoboys', rotulo: 'Motoboys' },
  { rota: '/clientes', rotulo: 'Clientes' },
  { rota: '/marca', rotulo: 'Marca' },
];

export function casca(titulo, conteudo) {
  const u = auth.usuarioAtual() || {};
  const ativo = location.hash.slice(1) || '/';

  const links = NAV.map((n) => el('a', {
    style: `display:block;padding:10px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13.5px;`
      + `color:${ativo === n.rota ? '#fff' : '#b9d2ee'};background:${ativo === n.rota ? 'rgba(55,138,221,.2)' : 'transparent'}`,
    onClick: () => navegar(n.rota),
  }, n.rotulo));

  const side = el('aside', { style: 'width:240px;background:linear-gradient(185deg,#042C53,#031f3b);padding:20px 14px;display:flex;flex-direction:column;gap:6px' },
    el('div', { 'data-lx-nome': '', style: 'color:#fff;font-weight:800;font-size:18px;padding:6px 10px 18px' }, 'Logix'),
    ...links,
    el('div', { style: 'margin-top:auto;padding:10px' },
      el('div', { style: 'color:#fff;font-weight:700;font-size:13px' }, u.nome || ''),
      el('a', { style: 'cursor:pointer;color:#9cbbdd;font-size:12px', onClick: async () => { await auth.logout(); navegar('/login'); } }, 'Sair')));

  const main = el('div', { style: 'flex:1;display:flex;flex-direction:column;min-width:0' },
    el('div', { style: 'background:#fff;border-bottom:1px solid var(--lx-linha);padding:16px 24px' },
      el('h1', { style: 'margin:0;font-size:18px;font-weight:800;color:var(--lx-tinta)' }, titulo)),
    el('div', { style: 'padding:24px;overflow:auto' }, conteudo));

  return el('div', { style: 'display:flex;min-height:100vh;background:var(--lx-fundo)' }, side, main);
}
