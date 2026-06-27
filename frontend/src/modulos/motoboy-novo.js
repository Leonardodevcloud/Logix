import { el } from '../core/ui.js';
import { get, post } from '../core/api.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;max-width:380px;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 4000);
}

const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie / Foto' },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais' },
];

// Lê um File como data URI base64.
function lerArquivo(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── Aba "Novo motoboy": cadastro completo pelo admin (nada obrigatório) ──
export function abaNovoMotoboy(aoCriar) {
  const wrap = el('div', {});
  let _etapa = 0;
  const form = {
    nome_completo: '', cpf: '', data_nascimento: '', telefone_principal: '', telefone_emergencia: '',
    email: '', senha: '',
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    modalidade_interesse_id: '',
  };
  const docs = {}; // tipo -> dataUri
  let modalidades = [];

  const nav = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:20px' });
  const painel = el('div', {});
  const rodape = el('div', { style: 'display:flex;justify-content:space-between;margin-top:20px;gap:10px' });
  wrap.append(
    el('div', { class: 'lx-card', style: 'padding:22px;max-width:760px' },
      el('div', { style: 'font-size:16px;font-weight:800;margin-bottom:4px' }, 'Novo motoboy'),
      el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0 0 18px' }, 'Cadastro completo pela central. Nenhum campo é obrigatório — você pode salvar incompleto e completar depois.'),
      nav, painel, rodape));

  const ETAPAS = ['Dados', 'Endereço', 'Documentos'];
  function renderNav() {
    nav.innerHTML = '';
    ETAPAS.forEach((t, i) => {
      const on = i === _etapa;
      nav.append(el('button', {
        style: `background:none;border:none;padding:11px 16px;font-size:13.5px;font-weight:700;cursor:pointer;border-bottom:2px solid ${on?'var(--lx-azul-primario)':'transparent'};color:${on?'var(--lx-azul-primario)':'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _etapa = i; render(); },
      }, `${i + 1}. ${t}`));
    });
  }

  const inp = (label, key, tipo = 'text') => {
    const i = el('input', { class: 'lx-input', type: tipo, value: form[key] || '' });
    i.addEventListener('input', () => { form[key] = i.value; });
    return el('div', { class: 'lx-field', style: 'margin-bottom:12px' }, el('label', {}, label), i);
  };
  const grid2 = (...itens) => el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, ...itens);

  function etapaDados() {
    const selMod = el('select', { class: 'lx-input' },
      el('option', { value: '' }, 'Sem modalidade'),
      ...modalidades.map(m => el('option', { value: m.id, ...(form.modalidade_interesse_id === m.id ? { selected: true } : {}) }, m.nome)));
    selMod.addEventListener('change', () => { form.modalidade_interesse_id = selMod.value; });
    return el('div', {},
      inp('Nome completo', 'nome_completo'),
      grid2(inp('CPF', 'cpf'), inp('Data de nascimento', 'data_nascimento', 'date')),
      grid2(inp('Telefone (WhatsApp)', 'telefone_principal'), inp('Telefone de emergência', 'telefone_emergencia')),
      grid2(inp('E-mail (login)', 'email', 'email'), inp('Senha', 'senha')),
      el('div', { class: 'lx-field', style: 'margin-bottom:12px' }, el('label', {}, 'Modalidade de interesse'), selMod));
  }

  function etapaEndereco() {
    const cepField = inp('CEP', 'cep');
    const cepInput = cepField.querySelector('input');
    cepInput.addEventListener('blur', async () => {
      const cep = (form.cep || '').replace(/\D/g, '');
      if (cep.length !== 8) return;
      try {
        const r = await get('/motoboys/cadastro/cep/' + cep);
        form.logradouro = r.logradouro || form.logradouro;
        form.bairro = r.bairro || form.bairro;
        form.cidade = r.cidade || form.cidade;
        form.estado = r.uf || form.estado;
        render();
      } catch { /* preenche manual */ }
    });
    return el('div', {},
      cepField,
      inp('Logradouro', 'logradouro'),
      grid2(inp('Número', 'numero'), inp('Complemento', 'complemento')),
      inp('Bairro', 'bairro'),
      grid2(inp('Cidade', 'cidade'), inp('Estado (UF)', 'estado')));
  }

  function etapaDocs() {
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' });
    DOCS.forEach(({ tipo, rotulo }) => {
      const temDoc = !!docs[tipo];
      const card = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:12px;overflow:hidden' });
      const head = el('div', { style: 'padding:10px 12px;font-size:12.5px;font-weight:700;border-bottom:1px solid var(--lx-linha)' }, rotulo);
      const corpo = el('div', { style: 'padding:12px' });
      if (temDoc) {
        const ehImg = docs[tipo].startsWith('data:image/');
        corpo.append(ehImg
          ? el('img', { src: docs[tipo], style: 'width:100%;height:130px;object-fit:cover;border-radius:8px' })
          : el('div', { style: 'height:130px;display:flex;align-items:center;justify-content:center;color:var(--lx-azul-primario)' }, '📄 Arquivo carregado'));
      } else {
        corpo.append(el('div', { style: 'height:130px;display:flex;align-items:center;justify-content:center;color:var(--lx-tinta-3);font-size:12.5px;border:1px dashed var(--lx-linha);border-radius:8px' }, 'Nenhum arquivo'));
      }
      const inputFile = el('input', { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' });
      inputFile.addEventListener('change', async () => {
        const f = inputFile.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { toast('Arquivo muito grande (máx 8MB)', 'erro'); return; }
        try { docs[tipo] = await lerArquivo(f); render(); } catch { toast('Erro ao ler arquivo', 'erro'); }
      });
      const btn = el('button', { class: 'lx-btn lx-btn-secundario', style: 'width:100%;margin-top:10px;font-size:12.5px', onClick: () => inputFile.click() }, temDoc ? 'Trocar arquivo' : 'Selecionar arquivo');
      corpo.append(btn, inputFile);
      card.append(head, corpo);
      grid.append(card);
    });
    return el('div', {},
      el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0 0 14px' }, 'Envie os documentos do motoboy (opcional). Aceita imagens ou PDF.'),
      grid);
  }

  function render() {
    renderNav();
    painel.innerHTML = '';
    if (_etapa === 0) painel.append(etapaDados());
    else if (_etapa === 1) painel.append(etapaEndereco());
    else painel.append(etapaDocs());

    rodape.innerHTML = '';
    rodape.append(
      _etapa > 0 ? el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => { _etapa--; render(); } }, '‹ Voltar') : el('span', {}),
      el('div', { style: 'display:flex;gap:10px' },
        el('button', { class: 'lx-btn lx-btn-secundario', onClick: salvar }, 'Salvar agora'),
        _etapa < 2 ? el('button', { class: 'lx-btn lx-btn-primario', onClick: () => { _etapa++; render(); } }, 'Continuar ›') : el('button', { class: 'lx-btn lx-btn-primario', onClick: salvar }, 'Cadastrar motoboy')));
  }

  async function salvar() {
    if (!form.nome_completo.trim()) { toast('Informe ao menos o nome', 'erro'); _etapa = 0; render(); return; }
    try {
      await post('/motoboys/cadastros', { ...form, documentos: docs });
      toast('Motoboy cadastrado');
      aoCriar && aoCriar();
    } catch (e) { toast(e.message || 'Erro ao cadastrar', 'erro'); }
  }

  // Carrega modalidades para o select e inicia.
  get('/motoboys/modalidades-interesse').then(r => { modalidades = r.modalidades || []; render(); }).catch(() => render());
  return wrap;
}
