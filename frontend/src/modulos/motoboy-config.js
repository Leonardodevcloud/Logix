import { el } from '../core/ui.js';
import { get, post, put, del } from '../core/api.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3000);
}
function modal(titulo, corpo, acoes) {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,16,32,.55);z-index:2500;display:flex;align-items:center;justify-content:center;padding:20px' });
  const card = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);max-width:520px;width:100%;max-height:90vh;overflow:auto;box-shadow:var(--lx-sombra-lg)' },
    el('div', { style: 'padding:18px 22px;border-bottom:1px solid var(--lx-linha);font-size:16px;font-weight:800' }, titulo),
    el('div', { style: 'padding:22px' }, corpo),
    el('div', { style: 'padding:16px 22px;border-top:1px solid var(--lx-linha);display:flex;gap:10px;justify-content:flex-end' }, ...acoes));
  ov.append(card); ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov); return ov;
}

// Campos configuráveis (rótulo + se pode ser tornado opcional).
const CAMPOS_TEXTO = [
  { key: 'nome_completo', rotulo: 'Nome completo', travado: true },
  { key: 'cpf', rotulo: 'CPF', travado: true },
  { key: 'data_nascimento', rotulo: 'Data de nascimento' },
  { key: 'telefone_principal', rotulo: 'Telefone (WhatsApp)', travado: true },
  { key: 'email', rotulo: 'E-mail (login)', travado: true },
  { key: 'senha', rotulo: 'Senha', travado: true },
  { key: 'telefone_emergencia', rotulo: 'Telefone de emergência' },
  { key: 'cep', rotulo: 'CEP' },
  { key: 'logradouro', rotulo: 'Logradouro' },
  { key: 'numero', rotulo: 'Número' },
  { key: 'complemento', rotulo: 'Complemento' },
  { key: 'bairro', rotulo: 'Bairro' },
  { key: 'cidade', rotulo: 'Cidade' },
  { key: 'estado', rotulo: 'Estado (UF)' },
];
const CAMPOS_DOC = [
  { key: 'doc_selfie', rotulo: 'Selfie (só câmera)' },
  { key: 'doc_habilitacao', rotulo: 'Habilitação (CNH)' },
  { key: 'doc_comprovante_endereco', rotulo: 'Comprovante de endereço' },
  { key: 'doc_antecedentes', rotulo: 'Antecedentes criminais' },
];

export function abaConfigCadastro() {
  const wrap = el('div', {});
  let _campos = {};

  const corpo = el('div', {});
  wrap.append(corpo);

  // Todos os campos (dados + documentos) num só conjunto, com flag de seção.
  const TODOS = [...CAMPOS_TEXTO.map(c => ({ ...c, grupo: 'dados' })), ...CAMPOS_DOC.map(c => ({ ...c, grupo: 'doc' }))];

  const ehObrigatorio = (key) => _campos[key] !== false;

  // Um chip de campo (move de coluna ao clicar).
  function chip(c, obrigatorio) {
    const podeMover = !c.travado;
    const icone = c.travado
      ? 'lx-cadeado'
      : (obrigatorio ? 'seta-dir' : 'seta-esq');
    const setaSvg = c.travado
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
      : (obrigatorio
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 5l7 7-7 7M21 12H3"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 19l-7-7 7-7M3 12h18"/></svg>');

    const seta = el('span', { style: `display:inline-flex;color:var(--lx-tinta-3);${c.travado ? '' : 'opacity:.7'}` });
    seta.innerHTML = setaSvg;

    const grupoTag = c.grupo === 'doc'
      ? el('span', { style: 'font-size:10px;font-weight:700;color:var(--lx-tinta-3);background:var(--lx-superficie-2);padding:1px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em' }, 'doc')
      : null;

    const conteudo = obrigatorio
      ? [el('span', { style: 'flex:1' }, c.rotulo), grupoTag, seta]
      : [seta, el('span', { style: 'flex:1' }, c.rotulo), grupoTag];

    const chipEl = el('div', {
      style: `display:flex;align-items:center;gap:9px;font-size:13px;padding:9px 12px;background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:9px;${podeMover ? 'cursor:pointer' : 'cursor:default;opacity:.7'};${obrigatorio ? '' : 'color:var(--lx-tinta-2)'}`,
      onClick: podeMover ? () => { _campos[c.key] = !obrigatorio; render(); } : undefined,
      onmouseenter: podeMover ? function () { this.style.borderColor = 'var(--lx-azul-primario)'; } : undefined,
      onmouseleave: podeMover ? function () { this.style.borderColor = 'var(--lx-linha)'; } : undefined,
    }, ...conteudo.filter(Boolean));
    return chipEl;
  }

  function coluna(titulo, iconeSvg, corBorda, corIcone, campos, vazioMsg) {
    const ic = el('span', { style: `display:inline-flex;color:${corIcone}` }); ic.innerHTML = iconeSvg;
    const lista = campos.length
      ? el('div', { style: 'display:flex;flex-direction:column;gap:7px' }, ...campos)
      : el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-3);text-align:center;padding:20px 10px' }, vazioMsg);
    return el('div', { style: `background:var(--lx-superficie-2, var(--lx-superficie));border:1px solid var(--lx-linha);border-top:2px solid ${corBorda};border-radius:12px;padding:14px` },
      el('div', { style: 'display:flex;align-items:center;gap:7px;margin-bottom:12px' },
        ic, el('span', { style: 'font-size:13px;font-weight:700' }, titulo),
        el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-left:auto' }, campos.length + (campos.length === 1 ? ' campo' : ' campos'))),
      lista);
  }

  function render() {
    corpo.innerHTML = '';
    const obrigatorios = TODOS.filter(c => ehObrigatorio(c.key)).map(c => chip(c, true));
    const opcionais = TODOS.filter(c => !ehObrigatorio(c.key)).map(c => chip(c, false));

    const ASTERISCO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M5.6 6.5l12.8 11M18.4 6.5l-12.8 11"/></svg>';
    const TRACEJADO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"><circle cx="12" cy="12" r="9"/></svg>';

    corpo.append(
      el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0 0 18px;line-height:1.5' },
        'Defina o que o motoboy precisa preencher no cadastro pelo app. Clique em um campo para movê-lo entre obrigatório e opcional. Campos com cadeado são sempre obrigatórios.'),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' },
        coluna('Obrigatórios', ASTERISCO, 'var(--lx-ok)', 'var(--lx-ok)', obrigatorios, 'Nenhum campo obrigatório'),
        coluna('Opcionais', TRACEJADO, 'var(--lx-tinta-3)', 'var(--lx-tinta-3)', opcionais, 'Tudo é obrigatório')),
      el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:20px', onClick: salvar }, 'Salvar configuração'));
  }

  async function carregar() {
    try { const r = await get('/motoboys/cadastro-config'); _campos = r.campos || {}; render(); }
    catch (e) { corpo.innerHTML = ''; corpo.append(el('div', { style: 'padding:20px;color:var(--lx-erro)' }, e.message || 'Erro')); }
  }
  async function salvar() {
    try { await put('/motoboys/cadastro-config', { campos: _campos }); toast('Configuração salva'); }
    catch (e) { toast(e.message || 'Erro', 'erro'); }
  }
  carregar();
  return wrap;
}

// ── Aba de modalidades de interesse ───────────────────────────────
export function abaModalidadesInteresse() {
  const wrap = el('div', {});
  const lista = el('div', {});
  const topo = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px' },
    el('div', {},
      el('div', { style: 'font-size:15px;font-weight:800' }, 'Modalidades de interesse'),
      el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:2px 0 0' }, 'Opções que o motoboy escolhe ao se cadastrar no app, com observações.')),
    el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => abrirForm(null, carregar) }, '+ Nova modalidade'));
  wrap.append(topo, lista);

  async function carregar() {
    lista.innerHTML = '<div style="padding:20px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try { const r = await get('/motoboys/modalidades-interesse'); render(r.modalidades); }
    catch (e) { lista.innerHTML = ''; lista.append(el('div', { style: 'padding:20px;color:var(--lx-erro)' }, e.message || 'Erro')); }
  }
  function render(mods) {
    lista.innerHTML = '';
    if (!mods.length) { lista.append(el('div', { style: 'padding:36px;text-align:center;color:var(--lx-tinta-3);font-size:14px' }, 'Nenhuma modalidade. Crie a primeira para aparecer no app.')); return; }
    mods.forEach(m => {
      const card = el('div', { style: 'display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid var(--lx-linha);border-left:4px solid ' + (m.cor || '#7c3aed') + ';border-radius:var(--lx-raio);margin-bottom:8px;background:var(--lx-superficie)' },
        el('div', { style: 'flex:1' },
          el('div', { style: 'display:flex;align-items:center;gap:8px' },
            el('span', { style: 'font-weight:700;font-size:14px' }, m.nome),
            m.ativo ? el('span', {}) : el('span', { style: 'font-size:11px;color:var(--lx-tinta-3);background:var(--lx-superficie-2);padding:2px 8px;border-radius:99px' }, 'Inativa')),
          m.descricao ? el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-top:4px' }, m.descricao) : el('span', {})),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:6px 12px', onClick: () => abrirForm(m, carregar) }, 'Editar'),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:6px 10px;color:var(--lx-erro)', onClick: () => excluir(m, carregar) }, 'Excluir'));
      lista.append(card);
    });
  }
  function abrirForm(m, aoSalvar) {
    const nome = el('input', { class: 'lx-input', value: m?.nome || '', placeholder: 'Ex: Moto CLT, Moto Dedicada…' });
    const desc = el('textarea', { class: 'lx-input', rows: 3, placeholder: 'Observações que o motoboy verá', value: m?.descricao || '' });
    const cor = el('input', { type: 'color', value: m?.cor || '#7c3aed', style: 'width:50px;height:38px;border:none;border-radius:8px;cursor:pointer' });
    const ativo = el('input', { type: 'checkbox', style: 'width:36px;height:20px;accent-color:var(--lx-ok)' }); ativo.checked = m ? m.ativo !== false : true;
    const b = el('button', { class: 'lx-btn lx-btn-primario' }, m ? 'Salvar' : 'Criar');
    const ov = modal(m ? 'Editar modalidade' : 'Nova modalidade', el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      el('div', { class: 'lx-field' }, el('label', {}, 'Nome'), nome),
      el('div', { class: 'lx-field' }, el('label', {}, 'Observações'), desc),
      el('div', { style: 'display:flex;align-items:center;gap:20px' },
        el('div', { style: 'display:flex;align-items:center;gap:8px' }, el('label', { style: 'font-size:13px' }, 'Cor'), cor),
        el('div', { style: 'display:flex;align-items:center;gap:8px' }, el('label', { style: 'font-size:13px' }, 'Ativa'), ativo))), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), b,
    ]);
    b.onclick = async () => {
      if (!nome.value.trim()) { toast('Informe o nome', 'erro'); return; }
      const dados = { nome: nome.value, descricao: desc.value, cor: cor.value, ativo: ativo.checked };
      try {
        b.disabled = true;
        if (m) await put('/motoboys/modalidades-interesse/' + m.id, dados);
        else await post('/motoboys/modalidades-interesse', dados);
        toast('Salvo'); ov.remove(); aoSalvar && aoSalvar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); b.disabled = false; }
    };
  }
  function excluir(m, aoExcluir) {
    const b = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-erro)' }, 'Excluir');
    const ov = modal('Excluir modalidade', el('p', { style: 'font-size:14px' }, `Excluir “${m.nome}”?`), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), b,
    ]);
    b.onclick = async () => { try { b.disabled = true; await del('/motoboys/modalidades-interesse/' + m.id); toast('Excluída'); ov.remove(); aoExcluir && aoExcluir(); } catch (e) { toast(e.message || 'Erro', 'erro'); b.disabled = false; } };
  }
  carregar();
  return wrap;
}
