import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, patch, put } from '../core/api.js';
import * as auth from '../core/auth.js';

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'U';
}

const CORES = ['var(--lx-azul-vivo)', 'var(--lx-azul-primario)', 'var(--lx-ok)', '#6b4fc9', 'var(--lx-atencao)'];

export async function montar(container) {
  const area = el('div', {});
  container.append(casca('Equipe', area, 'Gerencie usuários e defina o que cada um pode acessar'));

  let papeis = [];
  try { papeis = await get('/equipe/papeis'); } catch { papeis = []; }

  const toast = el('div', { style: 'display:none;padding:10px 14px;border-radius:10px;font-size:12.5px;font-weight:600;margin-bottom:12px' });
  function notif(msg, tipo) {
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.background = tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)';
    toast.style.color = tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'padding:16px 18px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));

  area.append(secHeader('Novo membro'), formNovo(papeis, carregar, notif), toast, secHeader('Usuários'), lista);

  async function recarregarPapeis() {
    try { papeis = await get('/equipe/papeis'); } catch {}
    carregar();
  }

  async function carregar() {
    lista.innerHTML = '';
    lista.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px;text-align:center' }, 'Carregando…'));
    try {
      const membros = await get('/equipe');
      lista.innerHTML = '';
      if (!membros.length) {
        lista.append(el('div', { style: 'padding:32px' }, estadoVazio('equipe', 'Nenhum usuário ainda', 'Cadastre o primeiro membro da equipe acima.')));
        return;
      }
      const tbody = el('tbody');
      membros.forEach((m, i) => tbody.append(linhaMembro(m, papeis, carregar, notif, i)));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Membro'),
          el('th', {}, 'E-mail'),
          el('th', {}, 'Papel'),
          el('th', {}, 'Status'),
          el('th', { style: 'text-align:right' }, 'Ações'))),
        tbody));
    } catch (e) {
      lista.innerHTML = '';
      lista.append(el('div', { style: 'padding:16px;color:var(--lx-erro);font-size:13px' }, 'Erro: ' + e.message));
    }
  }
  carregar();
}

function linhaMembro(m, papeis, recarregar, notif, idx) {
  const ehEu = m.id === (auth.usuarioAtual() || {}).id;
  const cor = CORES[idx % CORES.length];

  const sel = el('select', { class: 'lx-input', style: 'width:150px;font-size:12px;padding:7px 10px' });
  papeis.forEach(p => {
    const o = el('option', { value: p.id }, p.nome);
    if (p.id === m.papel_id) o.selected = true;
    sel.append(o);
  });
  sel.addEventListener('change', async () => {
    try { await patch('/equipe/' + m.id, { papel_id: sel.value }); notif('Papel atualizado.', 'ok'); }
    catch (e) { notif(e.message, 'erro'); recarregar(); }
  });

  const toggle = el('button', {
    class: 'lx-btn lx-btn-secundario',
    onClick: async () => {
      try { await patch('/equipe/' + m.id, { ativo: !m.ativo }); recarregar(); }
      catch (e) { notif(e.message, 'erro'); }
    }
  }, m.ativo ? 'Desativar' : 'Ativar');
  if (ehEu) toggle.disabled = true;

  const btnPerm = el('button', { class: 'lx-btn lx-btn-secundario', style: 'color:var(--lx-azul-primario)', onClick: () => editarPermissoesUsuario(m, notif) }, 'Permissões');

  return el('tr', {},
    el('td', {},
      el('div', { style: 'display:flex;align-items:center;gap:11px' },
        el('div', { style: `width:34px;height:34px;border-radius:50%;background:${cor};color:#fff;display:grid;place-items:center;font-weight:800;font-size:12px;flex:none` },
          iniciais(m.nome)),
        el('div', {},
          el('div', { style: 'font-weight:700;color:var(--lx-tinta)' },
            m.nome,
            ehEu ? el('span', { style: 'font-size:11px;font-weight:500;color:var(--lx-tinta-3);margin-left:6px' }, '(você)') : el('span', {}))))),
    el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, m.email || '—'),
    el('td', {}, sel),
    el('td', {},
      el('span', { class: 'lx-status ' + (m.ativo ? 'lx-status-entregue' : 'lx-status-aguardando') },
        m.ativo ? 'Ativo' : 'Inativo')),
    el('td', { style: 'text-align:right;white-space:nowrap' }, btnPerm, el('span', { style: 'display:inline-block;width:6px' }), toggle)
  );
}

function formNovo(papeis, aoCriar, notif) {
  const nome = el('input', { class: 'lx-input', placeholder: 'Nome completo' });
  const email = el('input', { class: 'lx-input', type: 'email', placeholder: 'email@empresa.com' });
  const tel = el('input', { class: 'lx-input', placeholder: '(71) 90000-0000' });
  const senha = el('input', { class: 'lx-input', type: 'password', placeholder: 'Senha inicial' });
  const sel = el('select', { class: 'lx-input' });
  papeis.forEach(p => sel.append(el('option', { value: p.id }, p.nome)));
  if (!papeis.length) sel.append(el('option', { value: '' }, 'Carregando papéis…'));

  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.equipe }), 'Adicionar membro');

  async function criar() {
    if (!nome.value.trim() || !email.value.trim() || !senha.value) {
      msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Preencha nome, e-mail e senha.'; return;
    }
    botao.disabled = true;
    msg.style.color = 'var(--lx-tinta-2)';
    msg.textContent = 'Adicionando…';
    try {
      await post('/equipe', {
        nome: nome.value.trim(),
        email: email.value.trim(),
        telefone: tel.value.trim() || undefined,
        senha: senha.value,
        papel_id: sel.value || undefined,
      });
      msg.style.color = 'var(--lx-ok)';
      msg.textContent = 'Membro adicionado. Ele já pode entrar com esse e-mail e senha.';
      nome.value = email.value = tel.value = senha.value = '';
      aoCriar();
    } catch (e) {
      msg.style.color = 'var(--lx-erro)';
      msg.textContent = e.message;
    } finally { botao.disabled = false; }
  }

  return el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' },
      campo('Nome', nome),
      campo('E-mail de acesso', email),
      campo('Telefone', tel),
      campo('Senha inicial', senha),
      campo('Papel', sel)),
    el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:4px' }, botao, msg));
}

// Editor de permissões DE UM USUÁRIO — abre no contexto do usuário, mostra todas
// as micro-ações do catálogo agrupadas por módulo, marca as que o usuário já tem,
// e salva o conjunto exato. Atalhos de template preenchem de uma vez.
async function editarPermissoesUsuario(m, notif) {
  let catalogo = [], atuais = [], templates = [];
  try {
    [catalogo, atuais, templates] = await Promise.all([
      get('/equipe/catalogo'),
      get('/equipe/' + m.id + '/permissoes').then(r => r.permissoes || []),
      get('/equipe/papeis').catch(() => []),
    ]);
  } catch { notif('Não foi possível carregar as permissões.', 'erro'); return; }

  const marcados = new Set(atuais);
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,20,40,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:1000;overflow:auto' });
  function fechar() { try { document.body.removeChild(overlay); } catch {} }

  function sincronizarChecks() {
    overlay.querySelectorAll('input[data-perm]').forEach((x) => { x.checked = marcados.has(x.getAttribute('data-perm')); });
  }

  const grupos = catalogo.map((mod) => {
    const linhas = mod.acoes.map((a) => {
      const cb = el('input', { type: 'checkbox' });
      cb.setAttribute('data-perm', a.codigo);
      cb.setAttribute('data-mod', mod.modulo);
      cb.checked = marcados.has(a.codigo);
      cb.onchange = () => { cb.checked ? marcados.add(a.codigo) : marcados.delete(a.codigo); };
      return el('label', { style: 'display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;font-size:13px' },
        cb, el('div', {},
          el('div', { style: 'font-weight:600;color:var(--lx-tinta)' }, a.rotulo),
          a.desc ? el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, a.desc) : null));
    });
    const alternar = el('button', { type: 'button', class: 'lx-btn lx-btn-secundario', style: 'font-size:11px;padding:3px 10px', onClick: () => {
      const alvo = mod.acoes.map((a) => a.codigo);
      const jaTodos = alvo.every((c) => marcados.has(c));
      alvo.forEach((c) => jaTodos ? marcados.delete(c) : marcados.add(c));
      sincronizarChecks();
    } }, 'Alternar todos');
    return el('div', { style: 'border:1px solid var(--lx-linha);border-radius:10px;padding:12px 14px;margin-bottom:10px' },
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
        el('div', { style: 'font-weight:700;font-size:12.5px;color:var(--lx-tinta)' }, mod.nome), alternar),
      ...linhas);
  });

  // Atalhos: aplicam um template (papel) de uma vez, sem obrigar a usá-lo.
  const atalhos = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px' });
  (templates || []).forEach((t) => {
    if (!Array.isArray(t.permissoes)) return;
    atalhos.append(el('button', { type: 'button', class: 'lx-btn lx-btn-secundario', style: 'font-size:11.5px;padding:4px 10px', onClick: () => {
      marcados.clear(); t.permissoes.forEach((p) => marcados.add(p)); sincronizarChecks();
    } }, 'Aplicar: ' + t.nome));
  });
  atalhos.append(el('button', { type: 'button', class: 'lx-btn lx-btn-secundario', style: 'font-size:11.5px;padding:4px 10px', onClick: () => { marcados.clear(); sincronizarChecks(); } }, 'Limpar tudo'));

  async function salvar() {
    try {
      await put('/equipe/' + m.id + '/permissoes', { permissoes: [...marcados] });
      notif('Permissões de ' + m.nome + ' atualizadas.', 'ok');
      fechar();
    } catch (e) { notif('Erro: ' + e.message, 'erro'); }
  }

  const card = el('div', { class: 'lx-card', style: 'max-width:600px;width:100%;padding:20px 22px' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
      el('h3', { style: 'margin:0;font-size:16px' }, 'Permissões — ' + m.nome),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:16px;padding:2px 10px', onClick: fechar }, '×')),
    el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0 0 14px' }, 'Marque exatamente o que este usuário pode fazer. Cada item é uma ação do sistema.'),
    el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:6px' }, 'Atalhos'),
    atalhos,
    el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Permissões'),
    ...grupos,
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;position:sticky;bottom:0;background:var(--lx-superficie);padding-top:10px' },
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:13px', onClick: fechar }, 'Cancelar'),
      el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: salvar }, 'Salvar permissões')));
  overlay.append(card);
  document.body.append(overlay);
}
