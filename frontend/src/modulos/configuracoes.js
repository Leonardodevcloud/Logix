import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import { EditorSla } from './sla-editor.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:1000' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:28px;width:560px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px' },
      el('h2', { style: 'font-size:18px;font-weight:800;margin:0' }, titulo),
      el('button', { style: 'background:none;border:none;font-size:22px;cursor:pointer;color:var(--lx-tinta-3);line-height:1', onClick: () => overlay.remove() }, '×')),
    corpo,
    acoes ? el('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:24px' }, ...acoes) : el('span', {}));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

// Paleta de cores para as etiquetas das categorias.
const PALETA = ['#7c3aed', '#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#dc2626', '#db2777', '#475569'];

export async function montar(container) {
  const conteudo = el('div', {});

  // ── Sub-abas do módulo ──────────────────────────────────────────
  const ABAS = [
    { id: 'fretes', rotulo: 'Categorias de Frete' },
    { id: 'sla', rotulo: 'SLA Global' },
  ];
  let _aba = 'fretes';

  const navAbas = el('div', { style: 'display:flex;gap:4px;border-bottom:1px solid var(--lx-linha);margin-bottom:20px' });
  const painel = el('div', {});

  function renderNav() {
    navAbas.innerHTML = '';
    ABAS.forEach(a => {
      const ativo = a.id === _aba;
      navAbas.append(el('button', {
        style: `background:none;border:none;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer;border-bottom:2px solid ${ativo ? 'var(--lx-azul-primario)' : 'transparent'};color:${ativo ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _aba = a.id; renderNav(); renderPainel(); },
      }, a.rotulo));
    });
  }
  function renderPainel() {
    painel.innerHTML = '';
    if (_aba === 'fretes') painel.append(abaCategoriasFrete());
    else if (_aba === 'sla') painel.append(abaSlaGlobal());
  }

  conteudo.append(navAbas, painel);
  renderNav();
  renderPainel();
  container.append(casca('Configurações', conteudo, 'Regras e parâmetros da operação'));
}

// ── Aba: Categorias de Frete ──────────────────────────────────────
function abaCategoriasFrete() {
  const wrap = el('div', {});
  let _categorias = [];

  const header = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap' },
    el('div', {},
      el('h3', { style: 'font-size:16px;font-weight:800;margin:0 0 2px' }, 'Categorias de Frete'),
      el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0' }, 'Crie categorias para organizar sua operação. A modalidade de cada cliente é definida em outra seção.')),
    el('button', { class: 'lx-btn lx-btn-primario', style: 'white-space:nowrap', onClick: () => abrirForm() }, '+ Nova categoria'));

  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  wrap.append(header, lista);

  async function carregar() {
    lista.innerHTML = '<div style="font-size:13px;color:var(--lx-tinta-2);padding:20px;text-align:center">Carregando…</div>';
    try {
      _categorias = await get('/config/frete-categorias');
      render();
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { style: 'font-size:13px;color:var(--lx-erro);padding:20px;text-align:center' }, e.message || 'Erro ao carregar')); }
  }

  function render() {
    lista.innerHTML = '';
    if (!_categorias.length) {
      lista.append(el('div', { style: 'text-align:center;padding:48px 20px;color:var(--lx-tinta-2)' },
        el('div', { style: 'font-size:15px;font-weight:700;margin-bottom:4px' }, 'Nenhuma categoria ainda'),
        el('div', { style: 'font-size:13px' }, 'Crie sua primeira categoria de frete para começar.')));
      return;
    }
    _categorias.forEach(c => lista.append(cartao(c)));
  }

  function cartao(c) {
    const toggle = el('label', { style: 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--lx-tinta-2);user-select:none' });
    const chk = el('input', { type: 'checkbox', style: 'width:15px;height:15px;accent-color:var(--lx-ok);cursor:pointer' });
    chk.checked = c.ativo;
    chk.onchange = async () => {
      try { await patch(`/config/frete-categorias/${c.id}/ativo`, { ativo: chk.checked }); c.ativo = chk.checked; toast(chk.checked ? 'Categoria ativada' : 'Categoria desativada'); render(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); chk.checked = !chk.checked; }
    };
    toggle.append(chk, el('span', {}, chk.checked ? 'Ativa' : 'Inativa'));

    return el('div', { style: `border:1px solid var(--lx-linha);border-left:4px solid ${c.cor};border-radius:var(--lx-raio);padding:14px 16px;background:var(--lx-superficie);${c.ativo ? '' : 'opacity:.6'}` },
      el('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px' },
        el('div', { style: 'min-width:0;flex:1' },
          el('div', { style: 'display:flex;align-items:center;gap:9px' },
            el('span', { style: `width:13px;height:13px;border-radius:4px;background:${c.cor};flex-shrink:0` }),
            el('span', { style: 'font-size:15px;font-weight:800' }, c.nome)),
          c.descricao ? el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-top:3px' }, c.descricao) : el('span', {})),
        el('div', { style: 'display:flex;align-items:center;gap:10px;flex-shrink:0' },
          toggle,
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 12px;font-size:12px', onClick: () => abrirForm(c) }, 'Editar'),
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:12px;color:var(--lx-erro)', onClick: () => excluir(c) }, 'Excluir'))));
  }

  // Formulário de criação/edição.
  function abrirForm(cat) {
    const ehEdicao = !!cat;
    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:16px' });

    // Nome
    const inpNome = el('input', { class: 'lx-input', placeholder: 'Ex: Express, Econômico, Agendado…', value: cat?.nome || '' });
    corpo.append(el('div', { class: 'lx-field' }, el('label', {}, 'Nome da categoria'), inpNome));

    // Descrição
    const inpDesc = el('input', { class: 'lx-input', placeholder: 'Opcional', value: cat?.descricao || '' });
    corpo.append(el('div', { class: 'lx-field' }, el('label', {}, 'Descrição'), inpDesc));

    // Cor / etiqueta
    let corSel = cat?.cor || PALETA[0];
    const paletaWrap = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
    function renderPaleta() {
      paletaWrap.innerHTML = '';
      PALETA.forEach(cor => {
        const sel = cor === corSel;
        paletaWrap.append(el('button', {
          style: `width:30px;height:30px;border-radius:8px;background:${cor};cursor:pointer;border:3px solid ${sel ? 'var(--lx-tinta)' : 'transparent'};box-shadow:${sel ? '0 0 0 2px ' + cor : 'none'}`,
          title: cor, onClick: () => { corSel = cor; renderPaleta(); },
        }));
      });
    }
    renderPaleta();
    corpo.append(el('div', { class: 'lx-field' }, el('label', {}, 'Cor da etiqueta'), paletaWrap));

    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, ehEdicao ? 'Salvar' : 'Criar categoria');
    const ov = modal(ehEdicao ? 'Editar categoria' : 'Nova categoria', corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => {
      const nome = inpNome.value.trim();
      if (!nome) { toast('Informe o nome', 'erro'); return; }
      const payload = { nome, descricao: inpDesc.value.trim() || null, cor: corSel };
      try {
        btn.disabled = true;
        if (ehEdicao) await put(`/config/frete-categorias/${cat.id}`, payload);
        else await post('/config/frete-categorias', payload);
        ov.remove(); toast(ehEdicao ? 'Categoria atualizada' : 'Categoria criada'); carregar();
      } catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); btn.disabled = false; }
    };
  }

  function excluir(c) {
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-erro)' }, 'Excluir');
    const ov = modal('Excluir categoria', el('p', { style: 'font-size:14px' }, `Excluir a categoria “${c.nome}”? Os vínculos com clientes serão removidos. Esta ação não pode ser desfeita.`), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => { try { btn.disabled = true; await del(`/config/frete-categorias/${c.id}`); ov.remove(); toast('Categoria excluída'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }

  carregar();
  return wrap;
}

// ── Aba: SLA Global ───────────────────────────────────────────────
function abaSlaGlobal() {
  const wrap = el('div', {});
  wrap.append(
    el('div', { style: 'margin-bottom:18px' },
      el('h3', { style: 'font-size:16px;font-weight:800;margin:0 0 2px' }, 'SLA Global'),
      el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0' }, 'Prazos padrão de entrega por distância. Vale para todos os clientes — exceto os que tiverem um SLA próprio configurado em “Gerir cliente → SLA”.')));

  const editor = EditorSla();
  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:22px', onClick: salvar }, 'Salvar SLA global');
  wrap.append(editor, btnSalvar);

  async function carregar() {
    try { const r = await get('/config/sla'); editor.preencher(r); }
    catch (e) { toast(e.message || 'Erro ao carregar SLA', 'erro'); }
  }
  async function salvar() {
    const v = editor.obterValor();
    if (!v.faixas.length) { toast('Adicione ao menos uma faixa', 'erro'); return; }
    try { btnSalvar.disabled = true; await put('/config/sla', v); toast('SLA global salvo'); }
    catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btnSalvar.disabled = false; }
  }
  carregar();
  return wrap;
}
