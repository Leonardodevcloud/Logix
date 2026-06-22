import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  container.append(casca('Entregas', lista));
  try {
    const u = auth.usuarioAtual() || {};
    const opts = (u.perfil === 'super_admin' && u.empresaId) ? { empresaId: u.empresaId } : {};
    const entregas = await get('/entregas', opts);
    lista.innerHTML = '';
    if (!entregas.length) { lista.append(el('div', { class: 'lx-muted' }, 'Nenhuma entrega ainda.')); return; }
    entregas.forEach((e) => lista.append(el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)',
    }, el('b', {}, e.protocolo), el('span', { class: 'lx-status lx-status-rota' }, e.status))));
  } catch (err) {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + err.message));
  }
}
