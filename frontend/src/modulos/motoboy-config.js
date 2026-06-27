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

  function linhaToggle(key, rotulo, travado) {
    const sw = el('input', { type: 'checkbox', checked: _campos[key] !== false, disabled: !!travado, style: `width:36px;height:20px;cursor:${travado?'not-allowed':'pointer'};accent-color:var(--lx-ok);flex:none` });
    sw.checked = _campos[key] !== false;
    sw.onchange = () => { _campos[key] = sw.checked; };
    return el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 14px;border-bottom:1px solid var(--lx-linha)' },
      el('div', {},
        el('span', { style: 'font-size:13.5px;font-weight:600' }, rotulo),
        travado ? el('span', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-left:8px' }, '(sempre obrigatório)') : el('span', {})),
      el('div', { style: 'display:flex;align-items:center;gap:8px' },
        el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, 'Obrigatório'),
        sw));
  }

  function render() {
    corpo.innerHTML = '';
    corpo.append(
      el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0 0 16px' }, 'Defina quais campos e documentos são obrigatórios no cadastro pelo app. Campos não obrigatórios podem ficar em branco.'),
      el('div', { style: 'font-size:12px;font-weight:800;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px' }, 'Dados'),
      el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);overflow:hidden;margin-bottom:20px' },
        ...CAMPOS_TEXTO.map(c => linhaToggle(c.key, c.rotulo, c.travado))),
      el('div', { style: 'font-size:12px;font-weight:800;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px' }, 'Documentos'),
      el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);overflow:hidden' },
        ...CAMPOS_DOC.map(c => linhaToggle(c.key, c.rotulo, c.travado))));
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:18px', onClick: salvar }, 'Salvar configuração');
    corpo.append(btn);
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
