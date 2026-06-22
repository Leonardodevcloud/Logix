import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';

export async function montar(container) {
  container.append(casca('Equipe', el('div', { class: 'lx-card lx-card-pad' },
    el('p', { class: 'lx-muted' }, 'Gestão de funcionários e papéis — em construção. Aqui o administrador do cliente vai cadastrar usuários e atribuir os papéis (Administrador, Operador, Financeiro).'))));
}
