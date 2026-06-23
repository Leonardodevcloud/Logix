import { casca } from '../core/layout.js';
import { el, icones, statusBadge } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…'));
  const filhos = [];
  if (auth.pode('entregas.criar')) {
    filhos.push(el('div', { class: 'lx-sec-h' }, el('h2', {}, 'Lançar entrega')), formNova(carregar));
  }
  filhos.push(el('div', { class: 'lx-sec-h' }, el('h2', {}, 'Entregas')), lista);
  container.append(casca('Entregas', el('div', {}, ...filhos)));

  async function carregar() {
    lista.innerHTML = '';
    lista.append(el('div', { class: 'lx-muted' }, 'Carregando…'));
    try {
      const es = await get('/entregas');
      lista.innerHTML = '';
      if (!es.length) { lista.append(vazio()); return; }
      const tbody = el('tbody');
      es.forEach((e) => tbody.append(el('tr', {},
        el('td', {}, el('b', {}, e.protocolo || '—')),
        el('td', {}, statusBadge(e.status)),
        el('td', { class: 'lx-muted' }, e.distancia_km != null ? Number(e.distancia_km).toFixed(1) + ' km' : '—'),
        el('td', { class: 'lx-muted' }, fmtData(e.criado_em)))));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Protocolo'), el('th', {}, 'Status'), el('th', {}, 'Distância'), el('th', {}, 'Criada'))), tbody));
    } catch (err) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Não foi possível carregar: ' + err.message)); }
  }
  carregar();
}

function vazio() {
  return el('div', { class: 'lx-vazio' },
    el('div', { class: 'ic', html: icones.entregas }),
    el('b', {}, 'Nenhuma entrega ainda'),
    el('div', {}, 'Lance a primeira entrega no formulário acima.'));
}

function formNova(aoCriar) {
  const coleta = el('input', { class: 'lx-input', placeholder: 'Rua, número, bairro — cidade' });
  const destino = el('input', { class: 'lx-input', placeholder: 'Rua, número, bairro — cidade' });
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.entregas }), 'Lançar entrega');

  async function criar() {
    if (!coleta.value.trim() || !destino.value.trim()) {
      msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Preencha os endereços de coleta e destino.'; return;
    }
    botao.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Geocodificando endereços…';
    try {
      const r = await post('/entregas', {
        coleta: { endereco: coleta.value.trim() },
        destinos: [{ endereco: destino.value.trim() }],
      });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Entrega lançada: ' + (r.protocolo || '');
      coleta.value = destino.value = '';
      aoCriar();
    } catch (e) {
      msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message;
    } finally { botao.disabled = false; }
  }

  const campoColeta = el('div', { class: 'lx-field' },
    el('label', {}, el('span', { class: 'lx-stop-num coleta', style: 'display:inline-grid;margin-right:8px;vertical-align:middle' }, 'C'), 'Coleta'),
    coleta);
  const campoDestino = el('div', { class: 'lx-field' },
    el('label', {}, el('span', { class: 'lx-stop-num', style: 'display:inline-grid;margin-right:8px;vertical-align:middle' }, '1'), 'Destino'),
    destino);

  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' }, campoColeta, campoDestino),
    el('div', { style: 'display:flex;align-items:center;gap:14px' }, botao, msg));
}
