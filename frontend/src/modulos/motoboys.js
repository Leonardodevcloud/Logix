import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, patch } from '../core/api.js';
import * as auth from '../core/auth.js';

function fmtCpf(c) {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '—');
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M';
}

const COR_AV = ['var(--lx-azul-vivo)', 'var(--lx-azul-primario)', 'var(--lx-navy-700)', 'var(--lx-ok)', '#6b4fc9'];

export async function montar(container) {
  const podeGerenciar = auth.pode('motoboys.gerenciar');

  // KPIs
  const kpiTotal = el('div', { class: 'k-val', style: 'font-size:28px' }, '…');
  const kpiOnline = el('div', { class: 'k-val', style: 'font-size:28px' }, '…');
  const kpiAtivos = el('div', { class: 'k-val', style: 'font-size:28px' }, '…');
  const kpiInativos = el('div', { class: 'k-val', style: 'font-size:28px' }, '…');

  const gradeKpi = el('div', { class: 'lx-grid-kpi' },
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', html: icones.motoboys })),
      kpiTotal, el('div', { class: 'k-lbl' }, 'Total cadastrados')),
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', style: 'background:var(--lx-ok-bg);color:var(--lx-ok)', html: icones.motoboys })),
      kpiOnline, el('div', { class: 'k-lbl' }, 'Online agora')),
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', html: icones.equipe })),
      kpiAtivos, el('div', { class: 'k-lbl' }, 'Ativos')),
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', style: 'background:var(--lx-erro-bg);color:var(--lx-erro)', html: icones.equipe })),
      kpiInativos, el('div', { class: 'k-lbl' }, 'Inativos')),
  );

  // Filtros
  const filtroAtivo = { val: 'todos' };
  const tabTodos = el('button', { class: 'lx-chip lx-chip-on', onClick: () => setFiltro('todos') }, 'Todos');
  const tabOnline = el('button', { class: 'lx-chip', onClick: () => setFiltro('online') }, 'Online');
  const tabOffline = el('button', { class: 'lx-chip', onClick: () => setFiltro('offline') }, 'Offline');

  function setFiltro(f) {
    filtroAtivo.val = f;
    [tabTodos, tabOnline, tabOffline].forEach(t => t.classList.remove('lx-chip-on'));
    ({ todos: tabTodos, online: tabOnline, offline: tabOffline })[f].classList.add('lx-chip-on');
    renderTabela();
  }

  const tabBody = el('div', { style: 'padding:6px 8px' });
  let _motoboys = [];

  function renderTabela() {
    tabBody.innerHTML = '';
    let linhas = _motoboys;
    if (filtroAtivo.val === 'online') linhas = linhas.filter(m => m.online);
    if (filtroAtivo.val === 'offline') linhas = linhas.filter(m => !m.online);
    if (!linhas.length) {
      tabBody.append(el('div', { style: 'padding:32px;text-align:center' },
        estadoVazio('motoboys', 'Nenhum motoboy nesta categoria', '')));
      return;
    }
    const tbody = el('tbody');
    linhas.forEach((m, i) => tbody.append(linhaMotoboy(m, i, carregar)));
    tabBody.append(el('table', { class: 'lx-table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Motoboy'),
        el('th', {}, 'CPF'),
        el('th', {}, 'Telefone'),
        el('th', {}, 'Status'),
        el('th', { style: 'text-align:right' }, 'Ações'))),
      tbody));
  }

  function linhaMotoboy(m, i, recarregar) {
    const cor = COR_AV[i % COR_AV.length];
    return el('tr', {},
      el('td', {},
        el('div', { style: 'display:flex;align-items:center;gap:11px' },
          el('div', { style: `width:34px;height:34px;border-radius:50%;background:${cor};color:#fff;display:grid;place-items:center;font-weight:800;font-size:12px;flex:none` },
            iniciais(m.nome_completo)),
          el('div', {},
            el('div', { style: 'font-weight:700;color:var(--lx-tinta)' }, m.nome_completo),
            el('div', { style: 'color:var(--lx-tinta-2);font-size:11.5px' }, 'Salvador · BA')))),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtCpf(m.cpf)),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, m.telefone_principal || '—'),
      el('td', {},
        el('span', { class: 'lx-status ' + (m.online ? 'lx-status-entregue' : 'lx-status-aguardando') },
          m.online ? 'Online' : 'Offline')),
      el('td', { style: 'text-align:right' },
        podeGerenciar
          ? el('button', { class: 'lx-btn lx-btn-secundario', onClick: async () => {
              try { await patch('/motoboys/' + m.id + '/online', { online: !m.online }); recarregar(); }
              catch (e) { notif(e.message, 'erro'); }
            } }, m.online ? 'Marcar offline' : 'Marcar online')
          : el('span', {}))
    );
  }

  async function carregar() {
    tabBody.innerHTML = '';
    tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px;text-align:center' }, 'Carregando…'));
    try {
      _motoboys = await get('/motoboys');
      const online = _motoboys.filter(m => m.online).length;
      const inativos = _motoboys.filter(m => m.ativo === false).length;
      kpiTotal.textContent = _motoboys.length;
      kpiOnline.textContent = online;
      kpiAtivos.textContent = _motoboys.length - inativos;
      kpiInativos.textContent = inativos;
      tabTodos.textContent = `Todos · ${_motoboys.length}`;
      tabOnline.textContent = `Online · ${online}`;
      tabOffline.textContent = `Offline · ${_motoboys.length - online}`;
      renderTabela();
    } catch (e) {
      tabBody.innerHTML = '';
      tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro: ' + e.message));
    }
  }

  // toast inline
  const toast = el('div', { style: 'display:none;padding:10px 14px;border-radius:10px;font-size:12.5px;font-weight:600;margin-bottom:12px' });
  function notif(msg, tipo) {
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.background = tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)';
    toast.style.color = tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'padding:12px 16px;display:flex;gap:9px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' },
      tabTodos, tabOnline, tabOffline),
    tabBody);

  const filhos = [gradeKpi, toast];
  if (podeGerenciar) filhos.push(secHeader('Novo motoboy'), formNovo(carregar, notif));
  filhos.push(secHeader('Profissionais'), lista);

  container.append(casca('Motoboys', el('div', {}, ...filhos), 'Sua frota de entregadores'));
  carregar();
}

function formNovo(aoCriar, notif) {
  const nome = el('input', { class: 'lx-input', placeholder: 'Nome completo' });
  const cpf = el('input', { class: 'lx-input', placeholder: '000.000.000-00' });
  const tel = el('input', { class: 'lx-input', placeholder: '(71) 90000-0000' });
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.motoboys }), 'Cadastrar motoboy');

  async function criar() {
    if (!nome.value.trim() || !cpf.value.trim()) {
      msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Preencha nome e CPF.'; return;
    }
    botao.disabled = true;
    msg.style.color = 'var(--lx-tinta-2)';
    msg.textContent = 'Cadastrando…';
    try {
      await post('/motoboys', { nome_completo: nome.value.trim(), cpf: cpf.value.trim(), telefone_principal: tel.value.trim() || undefined });
      msg.style.color = 'var(--lx-ok)';
      msg.textContent = 'Motoboy cadastrado.';
      nome.value = cpf.value = tel.value = '';
      aoCriar();
    } catch (e) {
      msg.style.color = 'var(--lx-erro)';
      msg.textContent = e.message;
    } finally { botao.disabled = false; }
  }

  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px' },
      campo('Nome completo', nome), campo('CPF', cpf), campo('Telefone', tel)),
    el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:4px' }, botao, msg));
}
