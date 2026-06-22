import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import * as auth from '../core/auth.js';

function card(valor, titulo) {
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'font-size:28px;font-weight:800;color:var(--lx-azul-primario)' }, String(valor)),
    el('div', { class: 'lx-muted' }, titulo));
}

export async function montar(container) {
  const u = auth.usuarioAtual() || {};
  const grade = el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:16px' });
  container.append(casca('Painel', el('div', {},
    el('p', { style: 'margin:0 0 18px;color:var(--lx-tinta-2)' }, 'Olá, ' + (u.nome || '') + '.'),
    grade)));
  try {
    if (auth.acessoAtual().perfil === 'super_admin') {
      const empresas = await get('/empresas').catch(() => []);
      grade.append(card(empresas.length, 'Clientes ativos'));
    } else {
      if (auth.temModulo('entregas')) grade.append(card((await get('/entregas').catch(() => [])).length, 'Entregas'));
      if (auth.temModulo('motoboys')) grade.append(card((await get('/motoboys').catch(() => [])).length, 'Motoboys'));
    }
  } catch { /* silencioso */ }
}
