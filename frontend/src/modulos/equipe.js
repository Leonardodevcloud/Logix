import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, patch } from '../core/api.js';
import * as auth from '../core/auth.js';

export async function montar(container) {
  const area = el('div', {});
  container.append(casca('Equipe', area, 'Cadastre usuários e defina o que cada um pode acessar'));

  let papeis = [];
  try { papeis = await get('/equipe/papeis'); } catch { papeis = []; }

  const lista = el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…'));
  area.append(secHeader('Novo membro'), formNovo(papeis, carregar), secHeader('Usuários'), lista);

  async function carregar() {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Carregando…'));
    try {
      const membros = await get('/equipe');
      lista.innerHTML = '';
      if (!membros.length) { lista.append(estadoVazio('equipe', 'Nenhum usuário ainda', 'Cadastre o primeiro membro da equipe acima.')); return; }
      const tbody = el('tbody');
      membros.forEach((m) => tbody.append(linha(m, papeis, carregar)));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Nome'), el('th', {}, 'E-mail'), el('th', {}, 'Papel'), el('th', {}, 'Status'), el('th', { style: 'text-align:right' }, 'Ações'))), tbody));
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Não foi possível carregar: ' + e.message)); }
  }
  carregar();
}

function linha(m, papeis, recarregar) {
  const ehEu = m.id === (auth.usuarioAtual() || {}).id;
  const sel = el('select', { class: 'lx-input', style: 'width:160px;display:inline-block' });
  papeis.forEach((p) => { const o = el('option', { value: p.id }, p.nome); if (p.id === m.papel_id) o.selected = true; sel.append(o); });
  sel.addEventListener('change', async () => { try { await patch('/equipe/' + m.id, { papel_id: sel.value }); } catch (e) { alert(e.message); recarregar(); } });

  const toggle = el('button', { class: 'lx-btn lx-btn-secundario', onClick: async () => {
    try { await patch('/equipe/' + m.id, { ativo: !m.ativo }); recarregar(); } catch (e) { alert(e.message); }
  } }, m.ativo ? 'Desativar' : 'Ativar');
  if (ehEu) toggle.disabled = true;

  return el('tr', {},
    el('td', {}, el('b', {}, m.nome), ehEu ? el('span', { class: 'lx-muted', style: 'font-size:11px;margin-left:6px' }, '(você)') : el('span', {})),
    el('td', { class: 'lx-muted' }, m.email || '—'),
    el('td', {}, sel),
    el('td', {}, el('span', { class: 'lx-status ' + (m.ativo ? 'lx-status-entregue' : 'lx-status-aguardando') }, m.ativo ? 'Ativo' : 'Inativo')),
    el('td', { style: 'text-align:right' }, toggle));
}

function formNovo(papeis, aoCriar) {
  const nome = el('input', { class: 'lx-input', placeholder: 'Nome completo' });
  const email = el('input', { class: 'lx-input', type: 'email', placeholder: 'email@empresa.com' });
  const tel = el('input', { class: 'lx-input', placeholder: '(71) 90000-0000' });
  const senha = el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha inicial' });
  const sel = el('select', { class: 'lx-input' });
  papeis.forEach((p) => sel.append(el('option', { value: p.id }, p.nome)));
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar }, el('span', { html: icones.equipe }), 'Adicionar membro');

  async function criar() {
    if (!nome.value.trim() || !email.value.trim() || !senha.value) { msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Preencha nome, e-mail e senha.'; return; }
    botao.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Adicionando…';
    try {
      await post('/equipe', { nome: nome.value.trim(), email: email.value.trim(), telefone: tel.value.trim() || undefined, senha: senha.value, papel_id: sel.value || undefined });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Membro adicionado. Ele já pode entrar com esse e-mail e senha.';
      nome.value = email.value = tel.value = senha.value = '';
      aoCriar();
    } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; } finally { botao.disabled = false; }
  }

  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' },
      campo('Nome', nome), campo('E-mail de acesso', email),
      campo('Telefone', tel), campo('Senha inicial', senha), campo('Papel', sel)),
    el('div', { style: 'display:flex;align-items:center;gap:14px' }, botao, msg));
}
