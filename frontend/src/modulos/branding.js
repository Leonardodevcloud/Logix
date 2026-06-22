import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';

// Stub: a tela completa de white-label (com preview ao vivo) está no protótipo e será portada aqui.
export async function montar(container) {
  container.append(casca('Marca (white-label)', el('div', { class: 'lx-card lx-card-pad' },
    el('p', { class: 'lx-muted' }, 'Configuração de marca por cliente — a portar do protótipo (cores, logo, domínio, preview ao vivo).'))));
}
