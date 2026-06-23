import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post } from '../core/api.js';
import { navegar } from '../core/router.js';

function fmtCnpj(c) {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (c || '—');
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

export async function montar(container) {
  // KPIs no topo
  const kpiAtivos = el('div', { class: 'k-val', style: 'font-size:24px' }, '…');
  const kpiInativos = el('div', { class: 'k-val', style: 'font-size:24px' }, '…');
  const kpiMotoboys = el('div', { class: 'k-val', style: 'font-size:24px' }, '…');

  const gradeKpi = el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:4px' },
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', html: icones.clientes })),
      kpiAtivos, el('div', { class: 'k-lbl' }, 'Clientes ativos')),
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', style: 'background:var(--lx-erro-bg);color:var(--lx-erro)', html: icones.clientes })),
      kpiInativos, el('div', { class: 'k-lbl' }, 'Clientes inativos')),
    el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('span', { class: 'k-ico', html: icones.motoboys })),
      kpiMotoboys, el('div', { class: 'k-lbl' }, 'Motoboys na rede')),
  );

  // Filtros de tab
  const filtroAtivo = { val: 'ativos' };
  const tabAtivos = el('button', { class: 'lx-chip lx-chip-on', onClick: () => setFiltro('ativos') }, 'Ativos');
  const tabInativos = el('button', { class: 'lx-chip', onClick: () => setFiltro('inativos') }, 'Inativos');
  const tabTodos = el('button', { class: 'lx-chip', onClick: () => setFiltro('todos') }, 'Todos');

  function setFiltro(f) {
    filtroAtivo.val = f;
    [tabAtivos, tabInativos, tabTodos].forEach(t => t.classList.remove('lx-chip-on'));
    ({ ativos: tabAtivos, inativos: tabInativos, todos: tabTodos })[f].classList.add('lx-chip-on');
    renderTabela();
  }

  const filtros = el('div', { style: 'padding:12px 16px;display:flex;gap:9px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' },
    tabAtivos, tabInativos, tabTodos);

  const tabBody = el('div', { style: 'padding:6px 8px' });
  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' }, filtros, tabBody);

  let _empresas = [];

  function renderTabela() {
    tabBody.innerHTML = '';
    let linhas = _empresas;
    if (filtroAtivo.val === 'ativos') linhas = linhas.filter(e => e.ativo !== false);
    if (filtroAtivo.val === 'inativos') linhas = linhas.filter(e => e.ativo === false);
    if (!linhas.length) {
      tabBody.append(el('div', { style: 'padding:32px;text-align:center' },
        estadoVazio('clientes', 'Nenhum cliente nesta categoria', 'Altere o filtro ou cadastre um novo cliente.')));
      return;
    }
    const tbody = el('tbody');
    linhas.forEach(c => tbody.append(linhaCliente(c)));
    tabBody.append(el('table', { class: 'lx-table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Empresa'),
        el('th', {}, 'CNPJ'),
        el('th', {}, 'Responsável'),
        el('th', {}, 'Motoboys'),
        el('th', {}, 'Status'),
        el('th', { style: 'text-align:right' }, 'Ações'))),
      tbody));
  }

  function linhaCliente(c) {
    const ativo = c.ativo !== false;
    return el('tr', {},
      el('td', {},
        el('div', { style: 'display:flex;align-items:center;gap:11px' },
          el('div', { style: `width:34px;height:34px;border-radius:10px;background:var(--lx-info-bg);color:var(--lx-azul-primario);display:grid;place-items:center;font-weight:800;font-size:13px;flex:none` },
            iniciais(c.razao_social || c.nome_fantasia)),
          el('div', {},
            el('div', { style: 'font-weight:700;color:var(--lx-tinta);font-size:13px' }, c.razao_social || c.nome_fantasia || '—'),
            el('div', { style: 'color:var(--lx-tinta-2);font-size:11.5px' }, c.cidade ? `${c.cidade} · BA` : 'Salvador · BA')))),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtCnpj(c.cnpj)),
      el('td', {}, c.responsavel || '—'),
      el('td', { style: 'font-weight:700' }, String(c.total_motoboys ?? 0)),
      el('td', {},
        el('span', { class: 'lx-status ' + (ativo ? 'lx-status-entregue' : 'lx-status-cancelada') },
          ativo ? 'Ativo' : 'Inativo')),
      el('td', { style: 'text-align:right' },
        el('div', { style: 'display:inline-flex;gap:8px' },
          el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => navegar('/clientes/' + c.id + '/modulos') }, 'Módulos'),
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => {/* impersonação futura */} }, 'Entrar como ↗')
        ))
    );
  }

  async function carregar() {
    tabBody.innerHTML = '';
    tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px;text-align:center' }, 'Carregando…'));
    try {
      _empresas = await get('/empresas');
      const ativos = _empresas.filter(e => e.ativo !== false).length;
      const inativos = _empresas.filter(e => e.ativo === false).length;
      const frota = _empresas.reduce((s, e) => s + (e.total_motoboys || 0), 0);
      kpiAtivos.textContent = ativos;
      kpiInativos.textContent = inativos;
      kpiMotoboys.textContent = frota;
      // atualizar rótulos dos tabs
      tabAtivos.textContent = `Ativos · ${ativos}`;
      tabInativos.textContent = `Inativos · ${inativos}`;
      tabTodos.textContent = `Todos · ${_empresas.length}`;
      renderTabela();
    } catch (e) {
      tabBody.innerHTML = '';
      tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar: ' + e.message));
    }
  }

  container.append(casca('Clientes', el('div', {},
    gradeKpi,
    secHeader('Novo cliente'),
    formNovoCliente(carregar),
    secHeader('Empresas na plataforma'),
    lista
  ), 'Empresas que usam a plataforma'));

  carregar();
}

function formNovoCliente(aoCriar) {
  const campos = {
    razao_social: el('input', { class: 'lx-input', placeholder: 'Razão social da empresa' }),
    cnpj: el('input', { class: 'lx-input', placeholder: '00.000.000/0000-00' }),
    responsavel: el('input', { class: 'lx-input', placeholder: 'Nome do responsável' }),
    email: el('input', { class: 'lx-input', type: 'email', placeholder: 'email@empresa.com' }),
    senha: el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha inicial' }),
  };
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.clientes }), 'Criar cliente');

  async function criar() {
    botao.disabled = true;
    msg.style.color = 'var(--lx-tinta-2)';
    msg.textContent = 'Criando…';
    try {
      const corpo = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.value.trim()]));
      await post('/empresas', corpo);
      msg.style.color = 'var(--lx-ok)';
      msg.textContent = 'Cliente criado. Ele já pode entrar com o e-mail e a senha definidos.';
      Object.values(campos).forEach(i => { i.value = ''; });
      aoCriar();
    } catch (e) {
      msg.style.color = 'var(--lx-erro)';
      msg.textContent = e.message;
    } finally { botao.disabled = false; }
  }

  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' },
      campo('Razão social', campos.razao_social),
      campo('CNPJ', campos.cnpj),
      campo('Responsável', campos.responsavel),
      campo('E-mail de acesso', campos.email),
      campo('Senha inicial', campos.senha)),
    el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:4px' }, botao, msg));
}
