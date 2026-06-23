import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  const filhos = [];
  if (auth.pode('entregas.criar')) filhos.push(formNova(carregar));
  filhos.push(lista);
  container.append(casca('Entregas', el('div', { style: 'display:flex;flex-direction:column;gap:16px' }, ...filhos)));

  async function carregar() {
    lista.innerHTML = 'Carregando...';
    try {
      const es = await get('/entregas');
      lista.innerHTML = '';
      if (!es.length) { lista.append(el('div', { class: 'lx-muted' }, 'Nenhuma entrega ainda.')); return; }
      es.forEach((e) => lista.append(linha(e)));
    } catch (err) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + err.message)); }
  }
  carregar();
}

function linha(e) {
  return el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)' },
    el('b', {}, e.protocolo || '—'),
    el('span', { class: 'lx-status lx-status-rota' }, e.status || ''));
}

function formNova(aoCriar) {
  const coleta = el('input', { class: 'lx-input', placeholder: 'Endereço de coleta' });
  const destino = el('input', { class: 'lx-input', placeholder: 'Endereço de destino' });
  const msg = el('div', { style: 'font-size:12px;min-height:16px' });
  async function criar() {
    msg.textContent = ''; msg.style.color = 'var(--lx-erro)';
    try {
      const r = await post('/entregas', {
        coleta: { endereco: coleta.value.trim() },
        destinos: [{ endereco: destino.value.trim() }],
      });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Entrega lançada: ' + (r.protocolo || '');
      coleta.value = destino.value = '';
      aoCriar();
    } catch (e) {
      msg.textContent = e.message + ' — confira se a ORS_API_KEY está configurada (geocoding do endereço).';
    }
  }
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'font-weight:700;margin-bottom:10px' }, 'Lançar entrega'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, coleta, destino),
    el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:10px', onClick: criar }, 'Lançar'),
    msg);
}
