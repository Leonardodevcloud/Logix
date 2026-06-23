import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, patch } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  const filhos = [];
  if (auth.pode('motoboys.gerenciar')) filhos.push(formNovo(carregar));
  filhos.push(lista);
  container.append(casca('Motoboys', el('div', { style: 'display:flex;flex-direction:column;gap:16px' }, ...filhos)));

  async function carregar() {
    lista.innerHTML = 'Carregando...';
    try {
      const ms = await get('/motoboys');
      lista.innerHTML = '';
      if (!ms.length) { lista.append(el('div', { class: 'lx-muted' }, 'Nenhum motoboy cadastrado.')); return; }
      ms.forEach((m) => lista.append(linha(m, carregar)));
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + e.message)); }
  }
  carregar();
}

function linha(m, recarregar) {
  const status = el('span', { class: m.online ? 'lx-status lx-status-entregue' : 'lx-status lx-status-aguardando' }, m.online ? 'Online' : 'Offline');
  const acao = auth.pode('motoboys.gerenciar')
    ? el('button', { class: 'lx-btn lx-btn-secundario', onClick: async () => {
        try { await patch('/motoboys/' + m.id + '/online', { online: !m.online }); recarregar(); } catch (e) { alert(e.message); }
      } }, m.online ? 'Marcar offline' : 'Marcar online')
    : el('span', {});
  return el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)' },
    el('div', {}, el('b', {}, m.nome_completo), el('div', { class: 'lx-muted', style: 'font-size:12px' }, 'CPF ' + (m.cpf || '—'))),
    el('div', { style: 'display:flex;gap:10px;align-items:center' }, status, acao));
}

function formNovo(aoCriar) {
  const nome = el('input', { class: 'lx-input', placeholder: 'Nome completo' });
  const cpf = el('input', { class: 'lx-input', placeholder: 'CPF (11 dígitos)' });
  const tel = el('input', { class: 'lx-input', placeholder: 'Telefone (opcional)' });
  const msg = el('div', { style: 'font-size:12px;min-height:16px' });
  async function criar() {
    msg.textContent = ''; msg.style.color = 'var(--lx-erro)';
    try {
      await post('/motoboys', { nome_completo: nome.value.trim(), cpf: cpf.value.trim(), telefone_principal: tel.value.trim() || undefined });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Motoboy cadastrado.';
      nome.value = cpf.value = tel.value = '';
      aoCriar();
    } catch (e) { msg.textContent = e.message; }
  }
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'font-weight:700;margin-bottom:10px' }, 'Novo motoboy'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px' }, nome, cpf, tel),
    el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:10px', onClick: criar }, 'Cadastrar'),
    msg);
}
