import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import { navegar } from '../core/router.js';


function fmtCnpj(c) {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (c || '—');
}
function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

// Modal genérico
function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: `
    position:fixed;inset:0;background:rgba(4,44,83,.45);
    display:flex;align-items:center;justify-content:center;z-index:1000
  ` });
  const box = el('div', { style: `
    background:var(--lx-superficie);border-radius:var(--lx-raio-lg);
    padding:28px;width:440px;max-width:95vw;
    box-shadow:0 24px 60px -20px rgba(4,44,83,.4)
  ` },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px' },
      el('b', { style: 'font-size:16px;font-weight:800;color:var(--lx-tinta)' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px', onClick: () => overlay.remove() }, '✕')),
    corpo,
    el('div', { style: 'display:flex;gap:10px;margin-top:20px;justify-content:flex-end' }, ...acoes)
  );
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

// Toast de feedback
function toast(msg, tipo) {
  const t = el('div', { style: `
    position:fixed;bottom:24px;right:24px;z-index:2000;
    padding:12px 18px;border-radius:var(--lx-raio-sm);
    font-size:13px;font-weight:700;
    background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};
    color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};
    box-shadow:var(--lx-sombra-lg)
  ` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

export async function montar(container) {
  const filtro = { val: 'ativos' };
  let _empresas = [];

  // Contadores no topo (simples, sem KPI card)
  const resumo = el('div', { style: 'font-size:13px;color:var(--lx-tinta-2);margin-bottom:4px' }, '');

  // Filtros de tab
  const tabAtivos   = el('button', { class: 'lx-chip lx-chip-on', onClick: () => setFiltro('ativos') }, 'Ativos');
  const tabInativos = el('button', { class: 'lx-chip', onClick: () => setFiltro('inativos') }, 'Inativos');
  const tabTodos    = el('button', { class: 'lx-chip', onClick: () => setFiltro('todos') }, 'Todos');

  function setFiltro(f) {
    filtro.val = f;
    [tabAtivos, tabInativos, tabTodos].forEach(t => t.classList.remove('lx-chip-on'));
    ({ ativos: tabAtivos, inativos: tabInativos, todos: tabTodos })[f].classList.add('lx-chip-on');
    renderTabela();
  }

  const tabBody = el('div', { style: 'padding:6px 8px' });

  function renderTabela() {
    tabBody.innerHTML = '';
    let linhas = _empresas;
    if (filtro.val === 'ativos')   linhas = linhas.filter(e => e.ativo !== false);
    if (filtro.val === 'inativos') linhas = linhas.filter(e => e.ativo === false);

    if (!linhas.length) {
      tabBody.append(el('div', { style: 'padding:32px;text-align:center' },
        estadoVazio('clientes', 'Nenhum cliente nesta categoria', '')));
      return;
    }

    const tbody = el('tbody');
    linhas.forEach((c, i) => tbody.append(linhaCliente(c, i)));
    tabBody.append(el('table', { class: 'lx-table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Empresa'),
        el('th', {}, 'CNPJ'),
        el('th', {}, 'E-mail de acesso'),
        el('th', {}, 'Motoboys'),
        el('th', {}, 'Status'),
        el('th', { style: 'text-align:right' }, 'Ações'))),
      tbody));
  }

  function linhaCliente(c, i) {
    const ativo = c.ativo !== false;
    const CORES = [
      { bg: '#E6F1FB', cor: '#185FA5' }, { bg: '#EEEDFE', cor: '#534AB7' },
      { bg: '#E1F5EE', cor: '#0F6E56' }, { bg: '#FAEEDA', cor: '#854F0B' },
      { bg: '#FAECE7', cor: '#993C1D' }, { bg: '#ede9fb', cor: '#6b4fc9' },
    ];
    const { bg, cor } = CORES[i % CORES.length];

    return el('tr', {},
      el('td', {},
        el('div', { style: 'display:flex;align-items:center;gap:11px' },
          el('div', { style: `width:34px;height:34px;border-radius:10px;background:${bg};color:${cor};display:grid;place-items:center;font-weight:800;font-size:13px;flex:none` },
            iniciais(c.razao_social || c.nome_fantasia)),
          el('div', {},
            el('div', { style: 'font-weight:700;color:var(--lx-tinta);font-size:13px' }, c.razao_social || c.nome_fantasia || '—'),
            el('div', { style: 'color:var(--lx-tinta-2);font-size:11.5px' }, c.cidade ? `${c.cidade} · ${c.estado || 'BA'}` : '—')))),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtCnpj(c.cnpj)),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, c.email_acesso || c.email || '—'),
      el('td', { style: 'font-weight:700' }, String(c.total_motoboys ?? 0)),
      el('td', {},
        el('span', { class: 'lx-status ' + (ativo ? 'lx-status-entregue' : 'lx-status-cancelada') },
          ativo ? 'Ativo' : 'Inativo')),
      el('td', { style: 'text-align:right' },
        el('div', { style: 'display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' },
          // Módulos
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px',
            onClick: () => navegar('/clientes/' + c.id + '/modulos') }, 'Módulos'),
          // Credenciais
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px',
            onClick: () => abrirCredenciais(c) }, 'Credenciais'),
          // Entrar como
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px',
            onClick: () => entrarComo(c) }, 'Entrar como ↗'),
          // Inativar/Ativar
          el('button', {
            class: 'lx-btn ' + (ativo ? 'lx-btn-secundario' : 'lx-btn-primario'),
            style: 'font-size:12px',
            onClick: () => toggleAtivo(c)
          }, ativo ? 'Inativar' : 'Ativar'),
          // Deletar
          el('button', { class: 'lx-btn', style: 'font-size:12px;background:var(--lx-erro-bg);color:var(--lx-erro)',
            onClick: () => confirmarExclusao(c) }, 'Excluir')
        ))
    );
  }

  // Ações
  async function toggleAtivo(c) {
    const ativo = c.ativo !== false;
    const acao = ativo ? 'inativar' : 'ativar';
    if (!confirm(`Deseja ${acao} o cliente "${c.razao_social || c.nome_fantasia}"?`)) return;
    try {
      await put('/empresas/' + c.id, { ativo: !ativo });
      toast(`Cliente ${ativo ? 'inativado' : 'ativado'}.`, 'ok');
      carregar();
    } catch (e) { toast(e.message, 'erro'); }
  }

  function confirmarExclusao(c) {
    const nome = c.razao_social || c.nome_fantasia || 'este cliente';
    const inp = el('input', { class: 'lx-input', placeholder: `Digite "${nome}" para confirmar` });
    const btn = el('button', { class: 'lx-btn', style: 'background:var(--lx-erro);color:#fff', onClick: async () => {
      if (inp.value.trim() !== nome) { toast('Nome não confere.', 'erro'); return; }
      try {
        await del('/empresas/' + c.id);
        overlay.remove();
        toast('Cliente excluído.', 'ok');
        carregar();
      } catch (e) { toast(e.message, 'erro'); }
    } }, 'Excluir definitivamente');

    const overlay = modal(
      'Excluir cliente',
      el('div', {},
        el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;margin-bottom:14px' },
          `Esta ação desativa a empresa e todos os usuários dela. Digite o nome do cliente para confirmar:`),
        inp),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => overlay.remove() }, 'Cancelar'), btn]
    );
  }

  function abrirCredenciais(c) {
    const emailInp = el('input', { class: 'lx-input', placeholder: 'Novo e-mail de acesso', value: c.email_acesso || '' });
    const senhaInp = el('input', { class: 'lx-input', type: 'password', placeholder: 'Nova senha (deixe em branco para não alterar)' });
    const msg = el('div', { style: 'font-size:12px;min-height:16px;color:var(--lx-erro)' });

    const btn = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const corpo = {};
      if (emailInp.value.trim() && emailInp.value.trim() !== (c.email_acesso || '')) corpo.email = emailInp.value.trim();
      if (senhaInp.value) corpo.senha = senhaInp.value;
      if (!Object.keys(corpo).length) { msg.textContent = 'Nenhuma alteração detectada.'; return; }
      btn.disabled = true;
      try {
        await patch('/empresas/' + c.id + '/credenciais', corpo);
        overlay.remove();
        toast('Credenciais atualizadas.', 'ok');
        carregar();
      } catch (e) { msg.textContent = e.message; btn.disabled = false; }
    } }, 'Salvar');

    const overlay = modal(
      'Credenciais de acesso',
      el('div', {},
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-bottom:14px' },
          `Altere o e-mail ou a senha do responsável de "${c.razao_social || c.nome_fantasia}".`),
        campo('E-mail de acesso', emailInp),
        campo('Nova senha', senhaInp),
        msg),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => overlay.remove() }, 'Cancelar'), btn]
    );
  }

  async function entrarComo(c) {
    try {
      const r = await post('/empresas/' + c.id + '/impersonar', {});
      if (r.accessToken) {
        const { iniciarImpersonacao } = await import('../core/auth.js');
        await iniciarImpersonacao(r.accessToken, r.usuario);
        navegar('/');
      }
    } catch (e) { toast('Erro ao entrar como cliente: ' + e.message, 'erro'); }
  }

  async function carregar() {
    tabBody.innerHTML = '';
    tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px;text-align:center' }, 'Carregando…'));
    try {
      _empresas = await get('/empresas');
      const ativos   = _empresas.filter(e => e.ativo !== false).length;
      const inativos = _empresas.filter(e => e.ativo === false).length;
      resumo.textContent = `${ativos} ativos · ${inativos} inativos · ${_empresas.length} total`;
      tabAtivos.textContent   = `Ativos · ${ativos}`;
      tabInativos.textContent = `Inativos · ${inativos}`;
      tabTodos.textContent    = `Todos · ${_empresas.length}`;
      renderTabela();
    } catch (e) {
      tabBody.innerHTML = '';
      tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro: ' + e.message));
    }
  }

  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'padding:12px 16px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' },
      tabAtivos, tabInativos, tabTodos,
      el('span', { style: 'margin-left:auto;font-size:12px;color:var(--lx-tinta-2)' }, resumo)),
    tabBody);

  container.append(casca('Clientes', el('div', {},
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
    cnpj:         el('input', { class: 'lx-input', placeholder: '00.000.000/0000-00' }),
    responsavel:  el('input', { class: 'lx-input', placeholder: 'Nome do responsável' }),
    email:        el('input', { class: 'lx-input', type: 'email', placeholder: 'email@empresa.com' }),
    senha:        el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha inicial' }),
    cidade:       el('input', { class: 'lx-input', placeholder: 'Cidade (ex: Salvador)' }),
    estado:       el('input', { class: 'lx-input', placeholder: 'UF (ex: BA)' }),
  };
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.clientes }), 'Criar cliente');

  async function criar() {
    botao.disabled = true;
    msg.style.color = 'var(--lx-tinta-2)';
    msg.textContent = 'Criando…';
    try {
      const corpo = Object.fromEntries(
        Object.entries(campos).map(([k, v]) => [k, v.value.trim()]).filter(([, v]) => v)
      );
      await post('/empresas', corpo);
      msg.style.color = 'var(--lx-ok)';
      msg.textContent = 'Cliente criado com sucesso.';
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
      campo('Senha inicial', campos.senha),
      campo('Cidade', campos.cidade),
      campo('Estado (UF)', campos.estado)),
    el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:4px' }, botao, msg));
}
