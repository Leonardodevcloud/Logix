import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post } from '../core/api.js';
import { navegar } from '../core/router.js';

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…'));
  container.append(casca('Clientes', el('div', {},
    secHeader('Novo cliente'), formNovoCliente(carregar),
    secHeader('Clientes'), lista), 'Empresas que usam a plataforma'));

  async function carregar() {
    lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Carregando…'));
    try {
      const empresas = await get('/empresas');
      lista.innerHTML = '';
      if (!empresas.length) { lista.append(estadoVazio('clientes', 'Nenhum cliente ainda', 'Cadastre o primeiro cliente no formulário acima.')); return; }
      const tbody = el('tbody');
      empresas.forEach((c) => tbody.append(el('tr', {},
        el('td', {}, el('b', {}, c.razao_social || c.nome_fantasia || '—')),
        el('td', { class: 'lx-muted' }, fmtCnpj(c.cnpj)),
        el('td', { class: 'lx-muted' }, (c.total_motoboys ?? 0) + ' motoboys'),
        el('td', { style: 'text-align:right' }, el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => navegar('/clientes/' + c.id + '/modulos') }, 'Módulos')))));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Cliente'), el('th', {}, 'CNPJ'), el('th', {}, 'Frota'), el('th', { style: 'text-align:right' }, 'Ações'))), tbody));
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { class: 'lx-muted' }, 'Não foi possível carregar: ' + e.message)); }
  }
  carregar();
}

function fmtCnpj(c) { const d = (c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (c || '—'); }

function formNovoCliente(aoCriar) {
  const campos = {
    razao_social: el('input', { class: 'lx-input', placeholder: 'Razão social' }),
    cnpj: el('input', { class: 'lx-input', placeholder: '00.000.000/0000-00' }),
    responsavel: el('input', { class: 'lx-input', placeholder: 'Nome do responsável' }),
    email: el('input', { class: 'lx-input', type: 'email', placeholder: 'email@cliente.com' }),
    senha: el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha inicial' }),
  };
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar }, el('span', { html: icones.clientes }), 'Criar cliente');
  async function criar() {
    botao.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Criando…';
    try {
      const corpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.value.trim()]));
      await post('/empresas', corpo);
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Cliente criado. Ele já pode entrar com o e-mail e a senha definidos.';
      Object.values(campos).forEach((i) => { i.value = ''; });
      aoCriar();
    } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; } finally { botao.disabled = false; }
  }
  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' },
      campo('Razão social', campos.razao_social), campo('CNPJ', campos.cnpj),
      campo('Responsável', campos.responsavel), campo('E-mail de acesso', campos.email),
      campo('Senha inicial', campos.senha)),
    el('div', { style: 'display:flex;align-items:center;gap:14px' }, botao, msg));
}
