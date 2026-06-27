import { el } from '../core/ui.js';
import { get, post, put, del } from '../core/api.js';

function fmtCpf(c) { if (!c) return '—'; const n = String(c).replace(/\D/g, ''); return n.length === 11 ? `${n.slice(0,3)}.${n.slice(3,6)}.${n.slice(6,9)}-${n.slice(9)}` : c; }
function fmtTel(t) { if (!t) return '—'; const n = String(t).replace(/\D/g, ''); if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; return t; }
function dataBR(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric' }); }
function iniciais(nome) { return (nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(); }

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;max-width:380px;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 4000);
}
function modal(titulo, corpo, acoes, larguraMax = '560px') {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,16,32,.55);z-index:2500;display:flex;align-items:center;justify-content:center;padding:20px' });
  const card = el('div', { style: `background:var(--lx-superficie);border-radius:var(--lx-raio-lg);max-width:${larguraMax};width:100%;max-height:90vh;overflow:auto;box-shadow:var(--lx-sombra-lg)` },
    el('div', { style: 'padding:18px 22px;border-bottom:1px solid var(--lx-linha);font-size:16px;font-weight:800' }, titulo),
    el('div', { style: 'padding:22px' }, corpo),
    el('div', { style: 'padding:16px 22px;border-top:1px solid var(--lx-linha);display:flex;gap:10px;justify-content:flex-end' }, ...acoes));
  ov.append(card); ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov); return ov;
}

// Status de exibição combinado (vem pronto do backend em status_exibicao).
const STATUS = {
  pendente: { rotulo: 'Pendente', cor: '#b45309', bg: '#fef3c7' },
  reenvio: { rotulo: 'Aguardando reenvio', cor: '#7c2d12', bg: '#ffedd5' },
  ativo: { rotulo: 'Ativo', cor: '#15803d', bg: '#dcfce7' },
  inativo: { rotulo: 'Inativo', cor: '#475569', bg: '#e2e8f0' },
  recusado: { rotulo: 'Recusado', cor: '#b91c1c', bg: '#fee2e2' },
};
const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie' },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais' },
];

// ── Aba de cadastros (lista todos: pendentes, ativos, inativos, recusados) ──
export function abaCadastros() {
  const wrap = el('div', {});
  let _filtro = '';
  let _busca = '';
  let _criadoDe = '', _criadoAte = '', _ativadoDe = '', _ativadoAte = '';

  const chips = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px' });
  const busca = el('input', { class: 'lx-input', placeholder: 'Buscar por nome, CPF ou e-mail…', style: 'max-width:320px' });
  busca.addEventListener('input', () => { _busca = busca.value; carregar(); });

  // Filtros de data (cadastro e ativação).
  const dataInput = (ph) => el('input', { class: 'lx-input', type: 'date', style: 'max-width:160px', title: ph });
  const fCriadoDe = dataInput('Cadastro de'), fCriadoAte = dataInput('Cadastro até');
  const fAtivadoDe = dataInput('Ativação de'), fAtivadoAte = dataInput('Ativação até');
  [fCriadoDe, fCriadoAte, fAtivadoDe, fAtivadoAte].forEach(i => i.addEventListener('change', () => {
    _criadoDe = fCriadoDe.value; _criadoAte = fCriadoAte.value; _ativadoDe = fAtivadoDe.value; _ativadoAte = fAtivadoAte.value; carregar();
  }));
  const filtrosData = el('details', { style: 'margin-bottom:14px' },
    el('summary', { style: 'cursor:pointer;font-size:12.5px;color:var(--lx-tinta-2);font-weight:700;padding:6px 0' }, 'Filtrar por data'),
    el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;padding:12px;background:var(--lx-superficie-2);border-radius:10px' },
      el('div', {}, el('label', { style: 'font-size:11px;color:var(--lx-tinta-2);display:block;margin-bottom:4px' }, 'Cadastro: de / até'),
        el('div', { style: 'display:flex;gap:6px' }, fCriadoDe, fCriadoAte)),
      el('div', {}, el('label', { style: 'font-size:11px;color:var(--lx-tinta-2);display:block;margin-bottom:4px' }, 'Ativação: de / até'),
        el('div', { style: 'display:flex;gap:6px' }, fAtivadoDe, fAtivadoAte))));

  const lista = el('div', {});
  wrap.append(chips, el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap' }, busca), filtrosData, lista);

  const FILTROS = [
    { id: '', rotulo: 'Todos', chave: 'todos' },
    { id: 'pendente', rotulo: 'Pendentes', chave: 'pendente' },
    { id: 'ativo', rotulo: 'Ativos', chave: 'ativo' },
    { id: 'inativo', rotulo: 'Inativos', chave: 'inativo' },
    { id: 'recusado', rotulo: 'Recusados', chave: 'recusado' },
  ];

  function renderChips(contadores = {}) {
    chips.innerHTML = '';
    FILTROS.forEach(f => {
      const n = contadores[f.chave] || 0;
      const on = _filtro === f.id;
      chips.append(el('button', {
        class: 'lx-chip' + (on ? ' lx-chip-on' : ''),
        onClick: () => { _filtro = f.id; carregar(); },
      }, `${f.rotulo}${n ? ` (${n})` : ''}`));
    });
  }

  async function carregar() {
    lista.innerHTML = '<div style="padding:24px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try {
      const q = new URLSearchParams();
      if (_filtro) q.set('situacao', _filtro);
      if (_busca) q.set('busca', _busca);
      if (_criadoDe) q.set('criado_de', _criadoDe);
      if (_criadoAte) q.set('criado_ate', _criadoAte + 'T23:59:59');
      if (_ativadoDe) q.set('ativado_de', _ativadoDe);
      if (_ativadoAte) q.set('ativado_ate', _ativadoAte + 'T23:59:59');
      const r = await get('/motoboys/cadastros?' + q.toString());
      renderChips(r.contadores);
      render(r.cadastros);
    } catch (e) { lista.innerHTML = ''; lista.append(el('div', { style: 'padding:24px;color:var(--lx-erro)' }, e.message || 'Erro')); }
  }

  function render(cadastros) {
    lista.innerHTML = '';
    if (!cadastros.length) {
      lista.append(el('div', { style: 'padding:40px;text-align:center;color:var(--lx-tinta-3);font-size:14px' }, 'Nenhum motoboy nesta categoria.'));
      return;
    }
    cadastros.forEach(c => {
      const s = STATUS[c.status_exibicao] || STATUS.pendente;
      const av = c.foto_url
        ? el('img', { src: c.foto_url, style: 'width:46px;height:46px;border-radius:50%;object-fit:cover;flex:none' })
        : el('div', { style: 'width:46px;height:46px;border-radius:50%;background:var(--lx-azul-primario);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex:none' }, iniciais(c.nome_completo));

      // Ações conforme o status.
      const acoes = el('div', { style: 'display:flex;gap:8px;align-items:center' });
      const aprovado = c.situacao_cadastro === 'aprovado';
      // Botão principal: "Editar" se aprovado, "Verificar" se pendente/reenvio/recusado.
      acoes.append(el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12.5px;padding:8px 14px', onClick: () => abrirRevisao(c.id, carregar) }, aprovado ? 'Editar' : 'Verificar'));
      // Toggle ativar/desativar (só para aprovados).
      if (aprovado) {
        const ativo = c.status_exibicao === 'ativo';
        acoes.append(el('button', {
          class: 'lx-btn lx-btn-secundario', style: `font-size:12.5px;padding:8px 12px;color:${ativo ? 'var(--lx-erro)' : 'var(--lx-ok)'}`,
          onClick: async () => {
            try { await post(`/motoboys/cadastros/${c.id}/${ativo ? 'desativar' : 'ativar'}`, {}); toast(ativo ? 'Motoboy desativado' : 'Motoboy ativado'); carregar(); }
            catch (e) { toast(e.message || 'Erro', 'erro'); }
          },
        }, ativo ? 'Desativar' : 'Ativar'));
      }

      const card = el('div', { style: 'display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);margin-bottom:8px;background:var(--lx-superficie)' },
        av,
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:700;font-size:14px' }, c.nome_completo),
          el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' },
            `${fmtCpf(c.cpf)} · ${c.email || 'sem e-mail'}${c.modalidade_nome ? ' · ' + c.modalidade_nome : ''}`),
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:3px' },
            `Cadastro: ${dataBR(c.criado_em)}${c.ativado_em ? ' · Ativação: ' + dataBR(c.ativado_em) : ''} · ${c.qtd_documentos} doc(s)`)),
        el('div', { style: 'text-align:right;min-width:90px' },
          el('span', { style: `display:inline-block;padding:4px 10px;border-radius:99px;font-size:11.5px;font-weight:700;background:${s.bg};color:${s.cor}` }, s.rotulo)),
        acoes);
      lista.append(card);
    });
  }

  carregar();
  return wrap;
}

// ── Tela de revisão de um cadastro ────────────────────────────────
async function abrirRevisao(motoboyId, aoFechar) {
  let d;
  try { d = await get('/motoboys/cadastros/' + motoboyId); }
  catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); return; }

  const s = SITUACOES[d.situacao_cadastro] || SITUACOES.pendente;

  // ── Dados pessoais (editáveis) ──
  const campos = {};
  const inp = (label, key, valor, tipo = 'text') => {
    const i = el('input', { class: 'lx-input', type: tipo, value: valor ?? '' });
    campos[key] = i;
    return el('div', { class: 'lx-field', style: 'margin-bottom:10px' }, el('label', {}, label), i);
  };
  const grid2 = (...itens) => el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, ...itens);

  const blocoDados = el('div', {},
    inp('Nome completo', 'nome_completo', d.nome_completo),
    grid2(inp('CPF', 'cpf', d.cpf), inp('Nascimento', 'data_nascimento', d.data_nascimento ? String(d.data_nascimento).slice(0, 10) : '', 'date')),
    grid2(inp('Telefone', 'telefone_principal', d.telefone_principal), inp('E-mail', 'email', d.email, 'email')),
    grid2(inp('CEP', 'cep', d.cep), inp('Cidade', 'cidade', d.cidade)),
    grid2(inp('Logradouro', 'logradouro', d.logradouro), inp('Número', 'numero', d.numero)),
    grid2(inp('Bairro', 'bairro', d.bairro), inp('Estado', 'estado', d.estado)),
    inp('Nova senha (deixe vazio para manter)', 'senha', '', 'text'));

  // ── Documentos ──
  const docsMap = {};
  (d.documentos || []).forEach(doc => { docsMap[doc.tipo] = doc; });
  const docsParaRemover = new Set();

  const blocoDocs = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' });
  DOCS.forEach(({ tipo, rotulo }) => {
    const doc = docsMap[tipo];
    const card = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:12px;overflow:hidden' });
    const head = el('div', { style: 'padding:10px 12px;font-size:12.5px;font-weight:700;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--lx-linha)' },
      el('span', {}, rotulo));
    if (doc && doc.url) {
      const ehImg = (doc.mime || '').startsWith('image/');
      const visual = ehImg
        ? el('img', { src: doc.url, style: 'width:100%;height:150px;object-fit:cover;cursor:pointer', onClick: () => abrirImagemGrande(doc.url, rotulo) })
        : el('a', { href: doc.url, target: '_blank', style: 'display:flex;align-items:center;justify-content:center;height:150px;color:var(--lx-azul-primario);font-size:13px;font-weight:700;text-decoration:none' }, '📄 Abrir documento');
      const btnRemover = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:11px;padding:4px 8px;color:var(--lx-erro)', onClick: () => {
        if (docsParaRemover.has(tipo)) { docsParaRemover.delete(tipo); btnRemover.textContent = 'Marcar p/ reenvio'; card.style.opacity = '1'; }
        else { docsParaRemover.add(tipo); btnRemover.textContent = 'Desmarcar'; card.style.opacity = '0.5'; }
      } }, 'Marcar p/ reenvio');
      head.append(btnRemover);
      card.append(head, visual);
    } else {
      card.append(head, el('div', { style: 'height:150px;display:flex;align-items:center;justify-content:center;color:var(--lx-tinta-3);font-size:12.5px' }, 'Não enviado'));
    }
    blocoDocs.append(card);
  });

  // ── Ações ──
  const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:20px' },
    el('div', { style: 'display:flex;align-items:center;gap:12px' },
      el('span', { style: `display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:${s.bg};color:${s.cor}` }, s.rotulo),
      d.modalidade_nome ? el('span', { style: 'font-size:12.5px;color:var(--lx-tinta-2)' }, 'Modalidade: ' + d.modalidade_nome) : el('span', {}),
      d.origem_cadastro === 'app' ? el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, '· via app') : el('span', {})),
    d.motivo_reenvio ? el('div', { style: 'padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12.5px;color:#7c2d12' }, 'Motivo do último reenvio: ' + d.motivo_reenvio) : el('span', {}),
    el('div', {}, el('div', { style: 'font-size:12px;font-weight:800;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px' }, 'Dados pessoais'), blocoDados),
    el('div', {}, el('div', { style: 'font-size:12px;font-weight:800;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px' }, 'Documentos'), blocoDocs));

  const btnSalvar = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Salvar alterações');
  const btnReenvio = el('button', { class: 'lx-btn lx-btn-secundario', style: 'color:#b45309' }, 'Solicitar reenvio');
  const btnRecusar = el('button', { class: 'lx-btn lx-btn-secundario', style: 'color:var(--lx-erro)' }, 'Recusar');
  const btnAprovar = el('button', { class: 'lx-btn lx-btn-primario' }, 'Aprovar cadastro');

  const ov = modal('Revisão de cadastro — ' + d.nome_completo, corpo, [btnSalvar, btnReenvio, btnRecusar, btnAprovar], '720px');

  function coletarDados() {
    const out = {};
    Object.entries(campos).forEach(([k, i]) => { if (k === 'senha') { if (i.value) out.senha = i.value; } else out[k] = i.value; });
    return out;
  }

  btnSalvar.onclick = async () => {
    try { btnSalvar.disabled = true; await put('/motoboys/cadastros/' + motoboyId, coletarDados()); toast('Dados salvos'); }
    catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btnSalvar.disabled = false; }
  };

  btnAprovar.onclick = async () => {
    try { btnAprovar.disabled = true; await post('/motoboys/cadastros/' + motoboyId + '/aprovar', {}); toast('Cadastro aprovado'); ov.remove(); aoFechar && aoFechar(); }
    catch (e) { toast(e.message || 'Erro', 'erro'); btnAprovar.disabled = false; }
  };

  btnRecusar.onclick = () => {
    const motivo = el('textarea', { class: 'lx-input', rows: 3, placeholder: 'Motivo da recusa (opcional)' });
    const b = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-erro)' }, 'Confirmar recusa');
    const ov2 = modal('Recusar cadastro', el('div', {}, el('p', { style: 'font-size:13px;margin-bottom:10px' }, 'O motoboy será marcado como recusado.'), motivo), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov2.remove() }, 'Cancelar'), b,
    ]);
    b.onclick = async () => { try { b.disabled = true; await post('/motoboys/cadastros/' + motoboyId + '/recusar', { motivo: motivo.value }); toast('Cadastro recusado'); ov2.remove(); ov.remove(); aoFechar && aoFechar(); } catch (e) { toast(e.message || 'Erro', 'erro'); b.disabled = false; } };
  };

  btnReenvio.onclick = () => {
    const motivo = el('textarea', { class: 'lx-input', rows: 3, placeholder: 'Descreva o que o motoboy precisa corrigir/reenviar' });
    const docsMarcados = [...docsParaRemover];
    const aviso = docsMarcados.length ? el('p', { style: 'font-size:12px;color:#7c2d12;margin-top:8px' }, `Documentos que serão removidos para reenvio: ${docsMarcados.map(t => DOCS.find(x => x.tipo === t).rotulo).join(', ')}`) : el('span', {});
    const b = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:#b45309' }, 'Solicitar reenvio');
    const ov2 = modal('Solicitar reenvio', el('div', {}, el('p', { style: 'font-size:13px;margin-bottom:10px' }, 'O motoboy receberá um aviso no app e ficará bloqueado até reenviar.'), motivo, aviso), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov2.remove() }, 'Cancelar'), b,
    ]);
    b.onclick = async () => {
      if (!motivo.value.trim()) { toast('Descreva o que precisa ser corrigido', 'erro'); return; }
      try { b.disabled = true; await post('/motoboys/cadastros/' + motoboyId + '/reenvio', { motivo: motivo.value, docs_para_remover: docsMarcados }); toast('Reenvio solicitado'); ov2.remove(); ov.remove(); aoFechar && aoFechar(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); b.disabled = false; }
    };
  };
}

function abrirImagemGrande(url, titulo) {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:4000;display:flex;align-items:center;justify-content:center;padding:30px;cursor:zoom-out' });
  ov.append(el('img', { src: url, style: 'max-width:95%;max-height:95%;object-fit:contain;border-radius:8px' }));
  ov.addEventListener('click', () => ov.remove());
  document.body.append(ov);
}
