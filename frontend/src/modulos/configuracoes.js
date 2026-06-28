import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import { EditorSla } from './sla-editor.js';
import { EditorValores } from './valores-editor.js';

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
    { id: 'valores', rotulo: 'Tabela de Valores Global' },
    { id: 'ocorrencias', rotulo: 'Ocorrências de marcação' },
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
    else if (_aba === 'valores') painel.append(abaValoresGlobal());
    else if (_aba === 'ocorrencias') painel.append(abaOcorrencias());
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

// ── Aba: Tabela de Valores Global ─────────────────────────────────
function abaValoresGlobal() {
  const wrap = el('div', {});
  wrap.append(
    el('div', { style: 'margin-bottom:18px' },
      el('h3', { style: 'font-size:16px;font-weight:800;margin:0 0 2px' }, 'Tabela de Valores Global'),
      el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0' }, 'Valores cobrados do cliente e pagos ao motoboy por faixa de distância. Vale para todos os clientes — exceto os que tiverem uma tabela própria em “Gerir cliente → Valores”.')));

  const editor = EditorValores();
  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:20px', onClick: salvar }, 'Salvar tabela global');
  wrap.append(editor, btnSalvar);

  async function carregar() {
    try { const r = await get('/config/valores'); editor.preencher(r.faixas); }
    catch (e) { toast(e.message || 'Erro ao carregar valores', 'erro'); }
  }
  async function salvar() {
    const faixas = editor.obterValor();
    if (!faixas.length) { toast('Adicione ao menos uma faixa', 'erro'); return; }
    try { btnSalvar.disabled = true; await put('/config/valores', { faixas }); toast('Tabela de valores salva'); }
    catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btnSalvar.disabled = false; }
  }
  carregar();
  return wrap;
}

// ── Aba: Ocorrências de marcação ──────────────────────────────────
// Motivos que o motoboy escolhe ao finalizar um ponto.
// Sucesso → finaliza. Insucesso → finaliza ou gera retorno à coleta.
function abaOcorrencias() {
  const wrap = el('div', {});
  wrap.append(
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
      el('div', {},
        el('h3', { style: 'font-size:16px;font-weight:800;margin:0 0 2px' }, 'Ocorrências de marcação'),
        el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0;max-width:560px' },
          'Motivos que o motoboy escolhe ao finalizar cada ponto. Sucesso finaliza a entrega; insucesso pode encerrar ou gerar um retorno automático à coleta.')),
      el('button', { class: 'lx-btn-primario', style: 'white-space:nowrap', onClick: () => abrirForm() }, '+ Nova ocorrência')));

  const lista = el('div', { style: 'margin-top:18px;display:flex;flex-direction:column;gap:8px' });
  wrap.append(lista);

  async function carregar() {
    lista.innerHTML = '';
    let dados = [];
    try { dados = await get('/config/ocorrencias'); }
    catch (e) { lista.append(el('p', { style: 'color:var(--lx-erro)' }, e.message || 'Erro ao carregar')); return; }
    if (!dados.length) {
      lista.append(el('p', { style: 'font-size:13px;color:var(--lx-tinta-3);padding:20px;text-align:center' }, 'Nenhuma ocorrência cadastrada ainda.'));
      return;
    }
    dados.forEach(o => lista.append(linha(o)));
  }

  function badge(o) {
    const insucesso = o.tipo === 'insucesso';
    const retorno = o.comportamento === 'retorno';
    const cor = insucesso ? 'var(--lx-erro)' : 'var(--lx-ok)';
    const bg = insucesso ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)';
    const rotulo = retorno ? 'RETORNO' : (insucesso ? 'INSUCESSO' : 'SUCESSO');
    return el('span', { style: `font-size:10px;font-weight:800;letter-spacing:.4px;color:${cor};background:${bg};padding:3px 9px;border-radius:6px` }, rotulo);
  }

  function linha(o) {
    const insucesso = o.tipo === 'insucesso';
    const desc = insucesso
      ? (o.comportamento === 'retorno' ? 'Insucesso · gera retorno à coleta' : 'Insucesso · finaliza sem retorno')
      : 'Sucesso · finaliza a entrega';
    return el('div', { style: 'display:flex;align-items:center;gap:12px;padding:13px 14px;border:1px solid var(--lx-linha);border-radius:12px;background:var(--lx-superficie)' },
      el('div', { style: `width:10px;height:10px;border-radius:50%;background:${insucesso ? 'var(--lx-erro)' : 'var(--lx-ok)'};flex-shrink:0` }),
      el('div', { style: 'flex:1' },
        el('div', { style: 'font-size:14px;font-weight:700;color:var(--lx-tinta)' }, o.nome),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, desc)),
      badge(o),
      el('button', { style: 'background:none;border:none;cursor:pointer;color:var(--lx-azul-primario);font-size:13px;font-weight:700;padding:6px', onClick: () => abrirForm(o) }, 'Editar'),
      el('button', { style: 'background:none;border:none;cursor:pointer;color:var(--lx-erro);font-size:13px;font-weight:700;padding:6px', onClick: () => excluir(o) }, 'Excluir'));
  }

  function abrirForm(o) {
    const editando = !!o;
    const inputNome = el('input', { class: 'lx-input', value: o?.nome || '', placeholder: 'Ex: Produto incorreto' });

    const selTipo = el('select', { class: 'lx-input' },
      el('option', { value: 'sucesso' }, 'Sucesso'),
      el('option', { value: 'insucesso' }, 'Insucesso'));
    selTipo.value = o?.tipo || 'sucesso';

    const selComp = el('select', { class: 'lx-input' },
      el('option', { value: 'finalizar' }, 'Finalizar a entrega'),
      el('option', { value: 'retorno' }, 'Gerar retorno à coleta'));
    selComp.value = o?.comportamento || 'finalizar';

    const linhaComp = el('div', { style: 'margin-top:14px' },
      el('label', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);display:block;margin-bottom:5px' }, 'Comportamento'),
      selComp);

    // Sucesso sempre finaliza: trava o comportamento.
    function syncTipo() {
      if (selTipo.value === 'sucesso') {
        selComp.value = 'finalizar';
        selComp.disabled = true;
        linhaComp.style.opacity = '.5';
      } else {
        selComp.disabled = false;
        linhaComp.style.opacity = '1';
      }
    }
    selTipo.addEventListener('change', syncTipo);
    syncTipo();

    const corpo = el('div', {},
      el('div', {},
        el('label', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);display:block;margin-bottom:5px' }, 'Nome da ocorrência'),
        inputNome),
      el('div', { style: 'margin-top:14px' },
        el('label', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);display:block;margin-bottom:5px' }, 'Tipo'),
        selTipo),
      linhaComp);

    const btnSalvar = el('button', { class: 'lx-btn-primario', onClick: salvar }, editando ? 'Salvar' : 'Cadastrar');
    const ov = modal(editando ? 'Editar ocorrência' : 'Nova ocorrência', corpo, [
      el('button', { class: 'lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'),
      btnSalvar,
    ]);

    async function salvar() {
      const nome = inputNome.value.trim();
      if (!nome) { toast('Informe o nome', 'erro'); return; }
      const payload = { nome, tipo: selTipo.value, comportamento: selComp.value };
      try {
        btnSalvar.disabled = true;
        if (editando) await put(`/config/ocorrencias/${o.id}`, payload);
        else await post('/config/ocorrencias', payload);
        toast(editando ? 'Ocorrência atualizada' : 'Ocorrência cadastrada');
        ov.remove();
        carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btnSalvar.disabled = false; }
    }
  }

  async function excluir(o) {
    const ov = modal('Excluir ocorrência', el('p', { style: 'font-size:14px;color:var(--lx-tinta-2)' }, `Remover "${o.nome}"? Esta ação não pode ser desfeita.`), [
      el('button', { class: 'lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'),
      el('button', { class: 'lx-btn-primario', style: 'background:var(--lx-erro)', onClick: async () => {
        try { await del(`/config/ocorrencias/${o.id}`); toast('Ocorrência removida'); ov.remove(); carregar(); }
        catch (e) { toast(e.message || 'Erro', 'erro'); }
      } }, 'Excluir'),
    ]);
  }

  carregar();
  return wrap;
}
