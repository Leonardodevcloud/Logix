import { casca } from '../core/layout.js';
import { el, secHeader } from '../core/ui.js';
import { get, put } from '../core/api.js';
import { navegar } from '../core/router.js';

export async function montar(container, params) {
  const empresaId = params.id;
  const corpo = el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…'));
  const voltar = el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => navegar('/clientes') }, '← Voltar');
  container.append(casca('Módulos do cliente', el('div', {},
    secHeader('Plano contratado', voltar), corpo), 'Defina quais módulos este cliente pode usar'));

  let modulos;
  try { modulos = await get('/permissoes/empresas/' + empresaId + '/modulos'); }
  catch (e) { corpo.innerHTML = ''; corpo.append(el('div', { class: 'lx-muted' }, 'Erro: ' + e.message)); return; }

  const estado = new Map(modulos.map((m) => [m.codigo, m.ativo]));
  corpo.innerHTML = '';
  modulos.forEach((m) => {
    const chk = el('input', { type: 'checkbox', style: 'width:18px;height:18px;accent-color:var(--lx-azul-primario)' });
    chk.checked = m.ativo;
    chk.addEventListener('change', () => estado.set(m.codigo, chk.checked));
    corpo.append(el('label', { style: 'display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--lx-linha);cursor:pointer' },
      chk, el('div', { style: 'flex:1' }, el('b', {}, m.nome), el('div', { class: 'lx-muted', style: 'font-size:12px' }, m.categoria || ''))));
  });

  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const salvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
    salvar.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Salvando…';
    const ativos = [...estado.entries()].filter(([, v]) => v).map(([k]) => k);
    try { await put('/permissoes/empresas/' + empresaId + '/modulos', { modulos: ativos }); msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Plano atualizado.'; }
    catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; } finally { salvar.disabled = false; }
  } }, 'Salvar plano');
  corpo.append(el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:16px' }, salvar, msg));
}
