import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  container.append(casca('Clientes', lista));
  try {
    const empresas = await get('/empresas');
    lista.innerHTML = '';
    if (!empresas.length) { lista.append(el('div', { class: 'lx-muted' }, 'Nenhum cliente cadastrado.')); return; }
    empresas.forEach((c) => lista.append(el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)',
    }, el('b', {}, c.razao_social), el('span', { class: 'lx-muted' }, (c.total_motoboys ?? 0) + ' motoboys'))));
  } catch (err) {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + err.message));
  }
}
