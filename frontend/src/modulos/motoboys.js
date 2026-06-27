import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import * as auth from '../core/auth.js';
import { abaCadastros } from './motoboy-cadastros.js';
import { abaNovoMotoboy } from './motoboy-novo.js';
import { abaConfigCadastro, abaModalidadesInteresse } from './motoboy-config.js';

function fmtCpf(c) {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '—');
}
function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M';
}
const CORES = ['#185FA5','#534AB7','#0F6E56','#854F0B','#993C1D','#6b4fc9'];

// Avatar do motoboy: usa a selfie (foto_url) quando houver; senão, iniciais coloridas.
export function avatarMotoboy(m, tam = 34, esmaecido = false) {
  const cor = CORES[(m.nome_completo || '').length % CORES.length];
  const base = `width:${tam}px;height:${tam}px;border-radius:50%;flex:none;opacity:${esmaecido ? '0.45' : '1'}`;
  if (m.foto_url) {
    return el('img', { src: m.foto_url, alt: m.nome_completo || '', style: `${base};object-fit:cover`, onerror: function () { this.style.display = 'none'; } });
  }
  return el('div', { style: `${base};background:${cor};color:#fff;display:grid;place-items:center;font-weight:800;font-size:${Math.round(tam * 0.36)}px` }, iniciais(m.nome_completo));
}

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:1000' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:28px;width:460px;max-width:95vw;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px' },
      el('b', { style: 'font-size:16px;font-weight:800;color:var(--lx-tinta)' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px', onClick: () => overlay.remove() }, '✕')),
    corpo,
    el('div', { style: 'display:flex;gap:10px;margin-top:20px;justify-content:flex-end' }, ...acoes));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

export async function montar(container) {
  const podeGerenciar = auth.pode('motoboys.gerenciar');
  const filtro = { val: 'ativos' };
  let _motoboys = [];

  const resumo = el('span', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-left:auto' }, '');
  const tabAtivos   = el('button', { class: 'lx-chip lx-chip-on', onClick: () => setFiltro('ativos') }, 'Ativos');
  const tabInativos = el('button', { class: 'lx-chip', onClick: () => setFiltro('inativos') }, 'Inativos');
  const tabOnline   = el('button', { class: 'lx-chip', onClick: () => setFiltro('online') }, 'Online');
  const tabTodos    = el('button', { class: 'lx-chip', onClick: () => setFiltro('todos') }, 'Todos');

  function setFiltro(f) {
    filtro.val = f;
    [tabAtivos, tabInativos, tabOnline, tabTodos].forEach(t => t.classList.remove('lx-chip-on'));
    ({ ativos: tabAtivos, inativos: tabInativos, online: tabOnline, todos: tabTodos })[f].classList.add('lx-chip-on');
    renderTabela();
  }

  const tabBody = el('div', { style: 'padding:6px 8px' });

  function renderTabela() {
    tabBody.innerHTML = '';
    let linhas = _motoboys;
    if (filtro.val === 'ativos')   linhas = linhas.filter(m => m.status !== 'inativo');
    if (filtro.val === 'inativos') linhas = linhas.filter(m => m.status === 'inativo');
    if (filtro.val === 'online')   linhas = linhas.filter(m => m.online);
    if (!linhas.length) {
      tabBody.append(el('div', { style: 'padding:32px;text-align:center' },
        estadoVazio('motoboys', 'Nenhum motoboy nesta categoria', '')));
      return;
    }
    const tbody = el('tbody');
    linhas.forEach((m, i) => tbody.append(linhaMotoboy(m, i)));
    tabBody.append(el('table', { class: 'lx-table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Motoboy'), el('th', {}, 'CPF'), el('th', {}, 'Telefone'),
        el('th', {}, 'Disponibilidade'), el('th', {}, 'Status'),
        el('th', { style: 'text-align:right' }, 'Ações'))),
      tbody));
  }

  function linhaMotoboy(m, i) {
    const inativo = m.status === 'inativo';
    const cor = CORES[i % CORES.length];
    return el('tr', {},
      el('td', {},
        el('div', { style: 'display:flex;align-items:center;gap:11px' },
          avatarMotoboy(m, 34, inativo),
          el('div', {},
            el('div', { style: `font-weight:700;color:var(--lx-tinta);${inativo?'opacity:.5':''}` }, m.nome_completo),
            el('div', { style: 'color:var(--lx-tinta-2);font-size:11.5px' }, m.endereco ? m.endereco.split(',')[0] : '—')))),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtCpf(m.cpf)),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, m.telefone_principal || '—'),
      el('td', {},
        el('span', { class: 'lx-status ' + (m.online ? 'lx-status-entregue' : 'lx-status-aguardando') },
          m.online ? 'Online' : 'Offline')),
      el('td', {},
        el('span', { class: 'lx-status ' + (inativo ? 'lx-status-cancelada' : 'lx-status-rota') },
          inativo ? 'Inativo' : 'Ativo')),
      el('td', { style: 'text-align:right' },
        podeGerenciar
          ? el('div', { style: 'display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' },
              el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => abrirEdicao(m) }, 'Editar'),
              el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => definirPIN(m) }, 'Definir PIN'),
              el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: async () => {
                try {
                  await patch('/motoboys/' + m.id + '/online', { online: !m.online });
                  carregar();
                } catch (e) { toast(e.message, 'erro'); }
              }}, m.online ? 'Marcar offline' : 'Marcar online'),
              inativo
                ? el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12px', onClick: async () => {
                    try { await patch('/motoboys/' + m.id + '/reativar', {}); toast('Motoboy reativado.', 'ok'); carregar(); }
                    catch (e) { toast(e.message, 'erro'); }
                  }}, 'Reativar')
                : el('button', { class: 'lx-btn', style: 'font-size:12px;background:var(--lx-erro-bg);color:var(--lx-erro)', onClick: () => confirmarDesativar(m) }, 'Desativar'))
          : el('span', {}))
    );
  }

  function abrirEdicao(m) {
    const nome = el('input', { class: 'lx-input', value: m.nome_completo || '' });
    const tel  = el('input', { class: 'lx-input', value: m.telefone_principal || '' });
    const tel2 = el('input', { class: 'lx-input', value: m.telefone_emergencia || '' });
    const end  = el('input', { class: 'lx-input', value: m.endereco || '' });
    const obs  = el('textarea', { class: 'lx-input', style: 'min-height:72px;resize:vertical', value: m.observacoes || '' });
    const msg  = el('div', { style: 'font-size:12px;color:var(--lx-erro);min-height:16px' });
    const btn  = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      btn.disabled = true;
      try {
        await put('/motoboys/' + m.id, {
          nome_completo: nome.value.trim() || undefined,
          telefone_principal: tel.value.trim() || undefined,
          telefone_emergencia: tel2.value.trim() || undefined,
          endereco: end.value.trim() || undefined,
          observacoes: obs.value.trim() || undefined,
        });
        overlay.remove(); toast('Motoboy atualizado.', 'ok'); carregar();
      } catch (e) { msg.textContent = e.message; btn.disabled = false; }
    }}, 'Salvar alterações');

    const overlay = modal('Editar motoboy',
      el('div', {},
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' },
          campo('Nome completo', nome),
          campo('Telefone principal', tel),
          campo('Telefone emergência', tel2),
          campo('Endereço', end)),
        campo('Observações', obs), msg),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => overlay.remove() }, 'Cancelar'), btn]);
  }

  function definirPIN(m) {
    const pinInp = el('input', { class: 'lx-input', type: 'password', placeholder: 'Ex: 123456 (mín. 4 dígitos)', maxlength: '8', style: 'letter-spacing:.2em;font-size:18px;text-align:center' });
    const msg = el('div', { style: 'font-size:12px;min-height:16px;margin-top:4px' });
    const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const pin = pinInp.value.trim();
      if (pin.length < 4) { msg.style.color = 'var(--lx-erro)'; msg.textContent = 'PIN deve ter ao menos 4 dígitos.'; return; }
      btnSalvar.disabled = true;
      try {
        await post('/motoboys/' + m.id + '/pin', { pin });
        msg.style.color = 'var(--lx-ok)';
        msg.textContent = 'PIN definido com sucesso!';
        setTimeout(() => ov.remove(), 1200);
      } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; btnSalvar.disabled = false; }
    }}, 'Salvar PIN');
    const ov = modal('Definir PIN — ' + m.nome_completo,
      el('div', {},
        el('div', { style: 'font-size:13px;color:var(--lx-tinta-2);margin-bottom:12px' },
          'O motoboy usará este PIN para entrar no app junto com o telefone cadastrado (' + (m.telefone_principal || '—') + ').'),
        pinInp, msg),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btnSalvar]);
    setTimeout(() => pinInp.focus(), 100);
  }

  function confirmarDesativar(m) {
    const btn = el('button', { class: 'lx-btn', style: 'background:var(--lx-erro);color:#fff', onClick: async () => {
      try { await del('/motoboys/' + m.id); overlay.remove(); toast('Motoboy desativado.', 'ok'); carregar(); }
      catch (e) { toast(e.message, 'erro'); }
    }}, 'Desativar');
    const overlay = modal('Desativar motoboy',
      el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' },
        `Deseja desativar "${m.nome_completo}"? Ele não aparecerá mais na distribuição de entregas. Você pode reativá-lo depois.`),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => overlay.remove() }, 'Cancelar'), btn]);
  }

  async function carregar() {
    tabBody.innerHTML = '';
    tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px;text-align:center' }, 'Carregando…'));
    try {
      _motoboys = await get('/motoboys');
      const ativos   = _motoboys.filter(m => m.status !== 'inativo').length;
      const inativos = _motoboys.filter(m => m.status === 'inativo').length;
      const online   = _motoboys.filter(m => m.online).length;
      resumo.textContent = `${ativos} ativos · ${online} online · ${inativos} inativos`;
      tabAtivos.textContent   = `Ativos · ${ativos}`;
      tabInativos.textContent = `Inativos · ${inativos}`;
      tabOnline.textContent   = `Online · ${online}`;
      tabTodos.textContent    = `Todos · ${_motoboys.length}`;
      renderTabela();
    } catch (e) {
      tabBody.innerHTML = '';
      tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro: ' + e.message));
    }
  }

  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'padding:12px 16px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' },
      tabAtivos, tabInativos, tabOnline, tabTodos, resumo),
    tabBody);

  // ── Navegação de abas do módulo ──────────────────────────────────
  const ABAS = [
    { id: 'cadastros', rotulo: 'Cadastros' },
    { id: 'novo', rotulo: 'Novo motoboy' },
    { id: 'modalidades', rotulo: 'Modalidades de interesse' },
    { id: 'config', rotulo: 'Config de cadastro' },
  ];
  let _aba = 'cadastros';
  const nav = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:18px;flex-wrap:wrap' });
  const painel = el('div', {});

  function renderNav() {
    nav.innerHTML = '';
    ABAS.forEach(a => {
      const on = a.id === _aba;
      nav.append(el('button', {
        style: `background:none;border:none;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;border-bottom:2px solid ${on?'var(--lx-azul-primario)':'transparent'};color:${on?'var(--lx-azul-primario)':'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _aba = a.id; renderNav(); renderPainel(); },
      }, a.rotulo));
    });
  }
  function renderPainel() {
    painel.innerHTML = '';
    if (_aba === 'cadastros') painel.append(abaCadastros());
    else if (_aba === 'novo') painel.append(abaNovoMotoboy(() => { _aba = 'cadastros'; renderNav(); renderPainel(); }));
    else if (_aba === 'modalidades') painel.append(abaModalidadesInteresse());
    else if (_aba === 'config') painel.append(abaConfigCadastro());
  }

  container.append(casca('Motoboys', el('div', {}, nav, painel), 'Sua frota de entregadores e cadastros'));
  renderNav();
  renderPainel();
}

function formNovo(aoCriar) {
  const nome = el('input', { class: 'lx-input', placeholder: 'Nome completo' });
  const cpf  = el('input', { class: 'lx-input', placeholder: '000.000.000-00' });
  const tel  = el('input', { class: 'lx-input', placeholder: '(71) 90000-0000' });
  const msg  = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.motoboys }), 'Cadastrar motoboy');

  async function criar() {
    if (!nome.value.trim() || !cpf.value.trim()) {
      msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Preencha nome e CPF.'; return;
    }
    botao.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Cadastrando…';
    try {
      await post('/motoboys', { nome_completo: nome.value.trim(), cpf: cpf.value.trim(), telefone_principal: tel.value.trim() || undefined });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Motoboy cadastrado.';
      nome.value = cpf.value = tel.value = '';
      aoCriar();
    } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; }
    finally { botao.disabled = false; }
  }

  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px' },
      campo('Nome completo', nome), campo('CPF', cpf), campo('Telefone', tel)),
    el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:4px' }, botao, msg));
}
