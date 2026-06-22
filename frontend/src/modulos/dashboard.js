import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';

function card(titulo, valor) {
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'font-size:28px;font-weight:800;color:var(--lx-azul-primario)' }, String(valor)),
    el('div', { class: 'lx-muted' }, titulo));
}

export async function montar(container) {
  const grade = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px' });
  container.append(casca('Painel', grade));
  try {
    const d = await get('/relatorios/dashboard');           // existirá quando o módulo de relatórios entrar
    Object.entries(d).forEach(([k, v]) => grade.append(card(k, v)));
  } catch {
    ['Entregas hoje', 'Em rota', 'Motoboys online', 'Clientes'].forEach((t) => grade.append(card(t, '—')));
  }
}
