import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  container.append(casca('Motoboys', lista));
  try {
    const u = auth.usuarioAtual() || {};
    const opts = (u.perfil === 'super_admin' && u.empresaId) ? { empresaId: u.empresaId } : {};
    const motoboys = await get('/motoboys', opts);
    lista.innerHTML = '';
    if (!motoboys.length) { lista.append(el('div', { class: 'lx-muted' }, 'Nenhum motoboy cadastrado.')); return; }
    motoboys.forEach((m) => lista.append(el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)',
    }, el('b', {}, m.nome_completo), el('span', { class: m.online ? 'lx-status lx-status-entregue' : 'lx-status lx-status-aguardando' }, m.online ? 'Online' : 'Offline'))));
  } catch (err) {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + err.message));
  }
}
