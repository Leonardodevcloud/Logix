import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const podeGerenciar = auth.pode('filas.gerenciar');
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  const topo = el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
    el('div', { class: 'lx-muted' }, 'Entregas aguardando atribuição'),
    podeGerenciar ? el('button', { class: 'lx-btn lx-btn-primario', onClick: distribuirTudo }, 'Distribuir tudo (auto)') : el('span', {}));
  container.append(casca('Filas', el('div', { style: 'display:flex;flex-direction:column;gap:16px' }, topo, lista)));

  let disponiveis = [];

  async function carregar() {
    lista.innerHTML = 'Carregando...';
    try {
      disponiveis = podeGerenciar ? await get('/filas/disponiveis').catch(() => []) : [];
      const fila = await get('/filas');
      lista.innerHTML = '';
      if (!fila.length) { lista.append(el('div', { class: 'lx-muted' }, 'Fila vazia — nenhuma entrega aguardando.')); return; }
      fila.forEach((e) => lista.append(linha(e)));
    } catch (err) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + err.message)); }
  }

  function linha(e) {
    const dir = el('div', { style: 'display:flex;gap:8px;align-items:center' });
    if (podeGerenciar) {
      const sel = el('select', { class: 'lx-input', style: 'width:210px' },
        el('option', { value: '' }, disponiveis.length ? 'Escolher motoboy…' : 'Nenhum online'));
      disponiveis.forEach((m) => sel.append(el('option', { value: m.id }, m.nome_completo + ' (' + m.carga + ')')));
      dir.append(sel,
        el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => { if (sel.value) acao('/filas/' + e.id + '/atribuir', { motoboy_id: sel.value }); } }, 'Atribuir'),
        el('button', { class: 'lx-btn lx-btn-primario', onClick: () => acao('/filas/' + e.id + '/atribuir-auto') }, 'Auto'));
    }
    return el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)' },
      el('div', {}, el('b', {}, e.protocolo), el('div', { class: 'lx-muted', style: 'font-size:12px' }, e.coleta_endereco || '')),
      dir);
  }

  async function acao(url, corpo) {
    try { await post(url, corpo || {}); carregar(); } catch (e) { alert(e.message); }
  }
  async function distribuirTudo() {
    try { const r = await post('/filas/distribuir', {}); alert('Atribuídas: ' + r.atribuidas + ' · Sem motoboy: ' + r.semMotoboy); carregar(); }
    catch (e) { alert(e.message); }
  }
  carregar();
}
