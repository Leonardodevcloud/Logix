import { casca } from '../core/layout.js';
import { el, secHeader, estadoVazio } from '../core/ui.js';

export async function montar(container) {
  container.append(casca('Equipe', el('div', {},
    secHeader('Usuários e papéis'),
    el('div', { class: 'lx-card lx-card-pad' },
      estadoVazio('equipe', 'Gestão de equipe em breve',
        'Aqui o administrador cadastra usuários e atribui papéis — Administrador, Operador e Financeiro — controlando o que cada um acessa.'))),
    'Cadastre usuários e defina o que cada um pode acessar'));
}
