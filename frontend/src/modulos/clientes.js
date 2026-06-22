import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post } from '../core/api.js';
import { navegar } from '../core/router.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, 'Carregando...');
  const form = formNovoCliente(carregar);
  container.append(casca('Clientes', el('div', { style: 'display:flex;flex-direction:column;gap:16px' }, form, lista)));

  async function carregar() {
    lista.innerHTML = 'Carregando...';
    try {
      const empresas = await get('/empresas');
      lista.innerHTML = '';
      if (!empresas.length) { lista.append(el('div', { class: 'lx-muted' }, 'Nenhum cliente ainda.')); return; }
      empresas.forEach((c) => lista.append(linha(c)));
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Erro: ' + e.message)); }
  }
  carregar();
}

function linha(c) {
  return el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--lx-linha)' },
    el('div', {},
      el('b', {}, c.razao_social),
      el('div', { class: 'lx-muted', style: 'font-size:12px' }, 'CNPJ ' + (c.cnpj || '—') + ' · ' + (c.total_motoboys ?? 0) + ' motoboys')),
    el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => navegar('/clientes/' + c.id + '/modulos') }, 'Módulos'));
}

function formNovoCliente(aoCriar) {
  const campos = {
    razao_social: el('input', { class: 'lx-input', placeholder: 'Razão social' }),
    cnpj: el('input', { class: 'lx-input', placeholder: 'CNPJ (14 dígitos)' }),
    responsavel: el('input', { class: 'lx-input', placeholder: 'Responsável' }),
    email: el('input', { class: 'lx-input', type: 'email', placeholder: 'E-mail de acesso' }),
    senha: el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha inicial' }),
  };
  const msg = el('div', { style: 'font-size:12px;min-height:16px' });
  async function criar() {
    msg.textContent = ''; msg.style.color = 'var(--lx-erro)';
    try {
      const corpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.value.trim()]));
      await post('/empresas', corpo);
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Cliente criado.';
      Object.values(campos).forEach((i) => { i.value = ''; });
      aoCriar();
    } catch (e) { msg.textContent = e.message; }
  }
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'font-weight:700;margin-bottom:10px' }, 'Novo cliente'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, ...Object.values(campos)),
    el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:10px', onClick: criar }, 'Criar cliente'),
    msg);
}
