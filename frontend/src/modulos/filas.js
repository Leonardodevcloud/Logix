import { casca } from '../core/layout.js';
import { el, secHeader, estadoVazio } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const podeGerenciar = auth.pode('filas.gerenciar');
  const lista = el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…'));
  const acao = podeGerenciar ? el('button', { class: 'lx-btn lx-btn-primario', onClick: distribuirTudo }, 'Distribuir tudo (auto)') : null;
  container.append(casca('Filas', el('div', {}, secHeader('Aguardando atribuição', acao), lista),
    'Distribua as entregas da fila para os motoboys'));

  let disponiveis = [];
  async function carregar() {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Carregando…'));
    try {
      disponiveis = podeGerenciar ? await get('/filas/disponiveis').catch(() => []) : [];
      const fila = await get('/filas');
      lista.innerHTML = '';
      if (!fila.length) { lista.append(estadoVazio('filas', 'Fila vazia', 'Nenhuma entrega aguardando atribuição no momento.')); return; }
      const tbody = el('tbody');
      fila.forEach((e) => tbody.append(el('tr', {},
        el('td', {}, el('b', {}, e.protocolo)),
        el('td', { class: 'lx-muted' }, e.coleta_endereco || '—'),
        el('td', { style: 'text-align:right' }, podeGerenciar ? acoesLinha(e) : el('span', {})))));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Protocolo'), el('th', {}, 'Coleta'), el('th', { style: 'text-align:right' }, 'Atribuir'))), tbody));
    } catch (err) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Não foi possível carregar: ' + err.message)); }
  }
  function acoesLinha(e) {
    const sel = el('select', { class: 'lx-input', style: 'width:190px;display:inline-block' },
      el('option', { value: '' }, disponiveis.length ? 'Escolher motoboy…' : 'Nenhum online'));
    disponiveis.forEach((m) => sel.append(el('option', { value: m.id }, m.nome_completo + ' (' + m.carga + ')')));
    return el('div', { style: 'display:inline-flex;gap:8px;align-items:center;justify-content:flex-end' },
      sel,
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => { if (sel.value) executar('/filas/' + e.id + '/atribuir', { motoboy_id: sel.value }); } }, 'Atribuir'),
      el('button', { class: 'lx-btn lx-btn-primario', onClick: () => executar('/filas/' + e.id + '/atribuir-auto') }, 'Auto'));
  }
  async function executar(url, corpo) { try { await post(url, corpo || {}); carregar(); } catch (e) { alert(e.message); } }
  async function distribuirTudo() { try { const r = await post('/filas/distribuir', {}); alert('Atribuídas: ' + r.atribuidas + ' · Sem motoboy: ' + r.semMotoboy); carregar(); } catch (e) { alert(e.message); } }
  carregar();
}
