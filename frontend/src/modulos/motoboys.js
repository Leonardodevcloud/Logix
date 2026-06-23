import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, patch } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const podeGerenciar = auth.pode('motoboys.gerenciar');
  const lista = el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…'));
  const filhos = [];
  if (podeGerenciar) filhos.push(secHeader('Novo motoboy'), formNovo(carregar));
  filhos.push(secHeader('Motoboys'), lista);
  container.append(casca('Motoboys', el('div', {}, ...filhos), 'Sua frota de entregadores'));

  async function carregar() {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Carregando…'));
    try {
      const ms = await get('/motoboys');
      lista.innerHTML = '';
      if (!ms.length) { lista.append(estadoVazio('motoboys', 'Nenhum motoboy cadastrado', podeGerenciar ? 'Cadastre o primeiro motoboy no formulário acima.' : '')); return; }
      const tbody = el('tbody');
      ms.forEach((m) => tbody.append(el('tr', {},
        el('td', {}, el('b', {}, m.nome_completo)),
        el('td', { class: 'lx-muted' }, fmtCpf(m.cpf)),
        el('td', {}, badgeOnline(m.online)),
        el('td', { style: 'text-align:right' }, podeGerenciar ? botaoToggle(m, carregar) : el('span', {})))));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Nome'), el('th', {}, 'CPF'), el('th', {}, 'Status'), el('th', { style: 'text-align:right' }, 'Ações'))), tbody));
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Não foi possível carregar: ' + e.message)); }
  }
  carregar();
}

function fmtCpf(c) { const d = (c || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '—'); }
function badgeOnline(online) { return el('span', { class: 'lx-status ' + (online ? 'lx-status-entregue' : 'lx-status-aguardando') }, online ? 'Online' : 'Offline'); }
function botaoToggle(m, recarregar) {
  return el('button', { class: 'lx-btn lx-btn-secundario', onClick: async () => {
    try { await patch('/motoboys/' + m.id + '/online', { online: !m.online }); recarregar(); } catch (e) { alert(e.message); }
  } }, m.online ? 'Marcar offline' : 'Marcar online');
}
function formNovo(aoCriar) {
  const nome = el('input', { class: 'lx-input', placeholder: 'Nome completo' });
  const cpf = el('input', { class: 'lx-input', placeholder: '000.000.000-00' });
  const tel = el('input', { class: 'lx-input', placeholder: '(71) 90000-0000' });
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar }, el('span', { html: icones.motoboys }), 'Cadastrar motoboy');
  async function criar() {
    botao.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Cadastrando…';
    try {
      await post('/motoboys', { nome_completo: nome.value.trim(), cpf: cpf.value.trim(), telefone_principal: tel.value.trim() || undefined });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Motoboy cadastrado.'; nome.value = cpf.value = tel.value = '';
      aoCriar();
    } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; } finally { botao.disabled = false; }
  }
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px' }, campo('Nome', nome), campo('CPF', cpf), campo('Telefone', tel)),
    el('div', { style: 'display:flex;align-items:center;gap:14px' }, botao, msg));
}
