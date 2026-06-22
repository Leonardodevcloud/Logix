import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, put } from '../core/api.js';
import { navegar } from '../core/router.js';

export async function montar(container, params) {
  const empresaId = params.id;
  const corpo = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  container.append(casca('Módulos do cliente', el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
    el('a', { class: 'lx-muted', style: 'cursor:pointer', onClick: () => navegar('/clientes') }, '← voltar para clientes'),
    corpo)));

  let modulos;
  try { modulos = await get('/permissoes/empresas/' + empresaId + '/modulos'); }
  catch (e) { corpo.innerHTML = ''; corpo.append(el('div', { class: 'lx-muted' }, 'Erro: ' + e.message)); return; }

  const estado = new Map(modulos.map((m) => [m.codigo, m.ativo]));
  corpo.innerHTML = '';
  modulos.forEach((m) => {
    const chk = el('input', { type: 'checkbox' });
    chk.checked = m.ativo;
    chk.addEventListener('change', () => estado.set(m.codigo, chk.checked));
    corpo.append(el('label', { style: 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--lx-linha);cursor:pointer' },
      chk, el('div', {}, el('b', {}, m.nome), el('span', { class: 'lx-muted', style: 'font-size:12px' }, '  · ' + (m.categoria || '')))));
  });

  const msg = el('div', { style: 'font-size:12px;min-height:16px;margin-top:8px' });
  async function salvar() {
    msg.textContent = ''; msg.style.color = 'var(--lx-erro)';
    const ativos = [...estado.entries()].filter(([, v]) => v).map(([k]) => k);
    try {
      await put('/permissoes/empresas/' + empresaId + '/modulos', { modulos: ativos });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Módulos atualizados.';
    } catch (e) { msg.textContent = e.message; }
  }
  corpo.append(el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:12px', onClick: salvar }, 'Salvar'), msg);
}
