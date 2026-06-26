import { casca } from '../core/layout.js';
import { el, icones, statusBadge, campo } from '../core/ui.js';
import { get, post, put, patch } from '../core/api.js';
import * as auth from '../core/auth.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:1000' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:26px;width:500px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:18px' },
      el('b', { style: 'font-size:16px;font-weight:800;color:var(--lx-tinta)' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px', onClick: () => overlay.remove() }, '✕')),
    corpo,
    el('div', { style: 'display:flex;gap:10px;margin-top:18px;justify-content:flex-end' }, ...acoes));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

const fmtHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtHaQuanto = iso => {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60 ? ' ' + (min % 60) + 'm' : ''}`;
};

const ICO = {
  filtro: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
  busca: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  alerta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  moto: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-5l-2-5h9l-2 5z"/><path d="M5.5 17.5 9 9h3"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
};
function ic(svg) { const s = el('span', { style: 'display:inline-flex;vertical-align:-3px' }); s.innerHTML = svg; return s; }

export async function montar(container) {
  const podeGerenciar = auth.pode('filas.gerenciar');
  const podeEditar = auth.pode('entregas.editar');

  let _dados = { semAssociacao: [], emAndamento: [], concluidas: [], totais: {} };
  let _lojas = [], _motoboys = [];
  let _aba = 'sem';
  const filtros = { loja_id: '', q: '', regiao: '', periodo: 'hoje' };

  // ── Filtros (recolhíveis) ───────────────────────────────────────
  const selLoja = el('select', { class: 'lx-input', style: 'height:34px;min-width:150px', onChange: () => { filtros.loja_id = selLoja.value; carregar(); } });
  const selPeriodo = el('select', { class: 'lx-input', style: 'height:34px;min-width:120px', onChange: () => { filtros.periodo = selPeriodo.value; carregar(); } },
    el('option', { value: 'hoje' }, 'Hoje'),
    el('option', { value: '7d' }, 'Últimos 7 dias'),
    el('option', { value: '30d' }, 'Últimos 30 dias'),
    el('option', { value: 'tudo' }, 'Tudo'));
  const inpRegiao = el('input', { class: 'lx-input', placeholder: 'Região / bairro', style: 'height:34px;width:150px' });
  const inpBusca = el('input', { class: 'lx-input', placeholder: 'Pesquisar protocolo, NF, endereço…', style: 'height:34px;width:100%;padding-left:34px' });
  let _debounce;
  const debounced = () => { clearTimeout(_debounce); _debounce = setTimeout(() => { filtros.q = inpBusca.value.trim(); filtros.regiao = inpRegiao.value.trim(); carregar(); }, 400); };
  inpBusca.addEventListener('input', debounced);
  inpRegiao.addEventListener('input', debounced);

  const filtrosExtra = el('div', { style: 'display:none;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px' },
    selPeriodo, selLoja, inpRegiao);

  let _filtrosAbertos = false;
  const btnFiltros = el('button', { class: 'lx-btn lx-btn-secundario', style: 'height:34px;display:inline-flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap', onClick: () => {
    _filtrosAbertos = !_filtrosAbertos;
    filtrosExtra.style.display = _filtrosAbertos ? 'flex' : 'none';
    btnFiltros.style.background = _filtrosAbertos ? 'var(--lx-azul-suave, var(--lx-superficie-2))' : '';
  } }, ic(ICO.filtro), 'Filtros');

  const buscaWrap = el('span', { style: 'position:relative;display:flex;align-items:center;flex:1;min-width:180px' });
  const buscaIcone = el('span', { style: 'position:absolute;left:11px;display:inline-flex;color:var(--lx-tinta-3)' }); buscaIcone.innerHTML = ICO.busca;
  buscaWrap.append(buscaIcone, inpBusca);

  const barraTopo = el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:12px' }, buscaWrap, btnFiltros);
  const barraFiltros = el('div', {}, barraTopo, filtrosExtra);

  // ── Abas ────────────────────────────────────────────────────────
  const cntSem = el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-erro-bg);color:var(--lx-erro)' }, '0');
  const cntAnd = el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-superficie-2);color:var(--lx-tinta-2)' }, '0');
  const cntCon = el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-superficie-2);color:var(--lx-tinta-2)' }, '0');

  function abaEl(id, iconeSvg, rotulo, cnt, cor) {
    const a = el('button', { style: 'display:flex;align-items:center;gap:7px;padding:9px 16px;font-size:13px;font-weight:600;background:none;border:none;border-bottom:2.5px solid transparent;cursor:pointer;color:var(--lx-tinta-2);white-space:nowrap', onClick: () => setAba(id) },
      ic(iconeSvg), rotulo, cnt);
    a._cor = cor; a._id = id;
    return a;
  }
  const abaSem = abaEl('sem', ICO.alerta, 'Sem associação', cntSem, 'var(--lx-erro)');
  const abaAnd = abaEl('and', ICO.moto, 'Em andamento', cntAnd, 'var(--lx-azul-primario)');
  const abaCon = abaEl('con', ICO.check, 'Concluídas', cntCon, 'var(--lx-ok)');
  const abas = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha)' }, abaSem, abaAnd, abaCon);

  function setAba(id) {
    _aba = id;
    [abaSem, abaAnd, abaCon].forEach(a => {
      const ativo = a._id === id;
      a.style.color = ativo ? a._cor : 'var(--lx-tinta-2)';
      a.style.borderBottomColor = ativo ? a._cor : 'transparent';
    });
    renderTabela();
  }

  const tabelaWrap = el('div', { style: 'border:0.5px solid var(--lx-linha);border-top:none;border-radius:0 0 var(--lx-raio-lg) var(--lx-raio-lg);overflow:hidden' });

  // ── Ações ───────────────────────────────────────────────────────
  async function carregarMotoboys() {
    if (_motoboys.length) return;
    try { _motoboys = await get('/filas/motoboys-ativos'); } catch { toast('Erro ao carregar motoboys', 'erro'); }
  }
  async function abrirAtribuir(c, troca = false) {
    await carregarMotoboys();
    const sel = el('select', { class: 'lx-input' }, ..._motoboys.map(m => el('option', { value: m.id }, `${m.nome_completo} ${m.online ? '🟢' : '⚪'} (${m.carga} ativas)`)));
    const corpo = el('div', {}, campo(troca ? 'Novo motoboy' : 'Motoboy', sel), el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:8px 0 0' }, '🟢 online · ⚪ offline'));
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, troca ? 'Trocar' : 'Atribuir');
    const ov = modal(troca ? `Trocar motoboy — ${c.protocolo}` : `Atribuir — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    btn.onclick = async () => {
      try { btn.disabled = true; await post(`/filas/${c.id}/${troca ? 'reatribuir' : 'atribuir'}`, { motoboy_id: sel.value }); ov.remove(); toast(troca ? 'Motoboy trocado' : 'Motoboy atribuído'); carregar(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  async function atribuirAuto(c) {
    try { await post(`/filas/${c.id}/atribuir-auto`, {}); toast('Atribuído automaticamente'); carregar(); }
    catch (e) { toast(e.message || 'Sem motoboy disponível', 'erro'); }
  }
  function abrirCancelar(c) {
    const motivo = el('textarea', { class: 'lx-input', rows: 3, placeholder: 'Motivo (opcional)' });
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-erro)' }, 'Cancelar corrida');
    const ov = modal(`Cancelar — ${c.protocolo}`, el('div', {}, campo('Motivo', motivo)), [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => { try { btn.disabled = true; await patch(`/entregas/${c.id}/cancelar`, { motivo: motivo.value.trim() || null }); ov.remove(); toast('Cancelada'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }
  function abrirFinalizar(c) {
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-ok)' }, 'Finalizar');
    const ov = modal('Finalizar corrida', el('p', { style: 'font-size:14px' }, `Finalizar ${c.protocolo} manualmente? Todos os pontos serão marcados como entregues.`), [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => { try { btn.disabled = true; await patch(`/entregas/${c.id}/finalizar`, {}); ov.remove(); toast('Finalizada'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }
  async function abrirEditar(c) {
    let d; try { d = await get('/entregas/' + c.id + '/detalhe'); } catch { toast('Erro ao carregar', 'erro'); return; }
    const inpColeta = el('input', { class: 'lx-input', value: d.coleta_endereco || '' });
    const pIn = (d.pontos || []).map(p => ({ id: p.id, input: el('input', { class: 'lx-input', value: p.endereco || '' }) }));
    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, campo('Endereço de coleta', inpColeta), ...pIn.map((pi, i) => campo(`Destino ${i + 1}`, pi.input)), el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:0' }, 'Endereços alterados são re-geocodificados.'));
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar');
    const ov = modal(`Editar — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    btn.onclick = async () => { try { btn.disabled = true; await put(`/entregas/${c.id}/enderecos`, { coleta: { endereco: inpColeta.value.trim() }, pontos: pIn.map(pi => ({ id: pi.id, endereco: pi.input.value.trim() })) }); ov.remove(); toast('Atualizado'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }
  function abrirProtocolo(c) { const base = window.LOGIX_API || '/api/v1'; window.open(`${base}/entregas/${c.id}/protocolo`, '_blank'); }

  function botaoIcone(svg, titulo, onClick, cor) {
    const b = el('button', { class: 'lx-btn lx-btn-secundario', style: `padding:5px 7px;${cor ? 'color:' + cor : ''}`, title: titulo, 'aria-label': titulo, onClick });
    b.innerHTML = svg; return b;
  }
  const SVG = {
    bolt: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    mapa: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    troca: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    add: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
  };

  function acoes(c) {
    const w = el('div', { style: 'display:flex;gap:4px;justify-content:flex-end;align-items:center;flex-wrap:wrap' });
    if (_aba === 'sem') {
      if (podeGerenciar) {
        const bAtr = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px;color:var(--lx-azul-primario);display:inline-flex;align-items:center;gap:4px', onClick: () => abrirAtribuir(c) });
        bAtr.innerHTML = SVG.add + '<span>atribuir</span>'; w.append(bAtr);
        w.append(botaoIcone(SVG.bolt, 'Atribuição automática', () => atribuirAuto(c)));
      }
      if (podeEditar) w.append(botaoIcone(SVG.edit, 'Editar endereços', () => abrirEditar(c)));
      w.append(botaoIcone(SVG.x, 'Cancelar', () => abrirCancelar(c), 'var(--lx-erro)'));
    } else if (_aba === 'and') {
      w.append(botaoIcone(SVG.mapa, 'Rastrear', () => { location.hash = '/rastreio'; }));
      if (podeGerenciar) w.append(botaoIcone(SVG.troca, 'Trocar motoboy', () => abrirAtribuir(c, true)));
      if (podeEditar) {
        w.append(botaoIcone(SVG.edit, 'Editar endereços', () => abrirEditar(c)));
        w.append(botaoIcone(SVG.check, 'Finalizar', () => abrirFinalizar(c), 'var(--lx-ok)'));
      }
      w.append(botaoIcone(SVG.x, 'Cancelar', () => abrirCancelar(c), 'var(--lx-erro)'));
    } else {
      w.append(botaoIcone(SVG.file, 'Ver protocolo', () => abrirProtocolo(c)));
    }
    return w;
  }

  function linha(c) {
    const cols = _aba === 'sem' ? '92px 1.2fr 1.3fr 80px 230px'
      : _aba === 'and' ? '92px 1.2fr 120px 80px 230px'
      : '92px 1.2fr 90px 60px 120px';
    const meio = _aba === 'sem'
      ? [el('div', { style: 'min-width:0' }, el('div', { style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.coleta_endereco || '—')),
         el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.destino_endereco || '—')]
      : _aba === 'and'
      ? [el('div', { style: 'min-width:0' }, el('div', { style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.motoboy_nome ? '🏍 ' + c.motoboy_nome : 'sem motoboy')),
         statusBadge(c.status)]
      : [el('div', { style: 'min-width:0' }, el('div', { style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.motoboy_nome || '—')),
         el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, fmtHora(c.concluida_em))];
    const fim = _aba === 'con'
      ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, c.distancia_km && parseFloat(c.distancia_km) > 0 ? parseFloat(c.distancia_km).toFixed(1) : '—')
      : el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, fmtHaQuanto(c.criado_em));
    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:8px;padding:10px 14px;align-items:center;border-bottom:0.5px solid var(--lx-linha);background:var(--lx-superficie)` },
      el('div', { style: 'font-weight:700;font-size:13px;color:var(--lx-azul-primario)' }, c.protocolo),
      ...meio, fim, acoes(c));
  }

  function cabecalho() {
    const cols = _aba === 'sem' ? '92px 1.2fr 1.3fr 80px 230px'
      : _aba === 'and' ? '92px 1.2fr 120px 80px 230px'
      : '92px 1.2fr 90px 60px 120px';
    const labels = _aba === 'sem' ? ['Protocolo', 'Loja / coleta', 'Destino', 'Criada', 'Ações']
      : _aba === 'and' ? ['Protocolo', 'Loja / motoboy', 'Status', 'Tempo', 'Ações']
      : ['Protocolo', 'Loja / motoboy', 'Concluída', 'KM', 'Ações'];
    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:8px;padding:8px 14px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;background:var(--lx-superficie-2);border-bottom:0.5px solid var(--lx-linha)` },
      ...labels.map((l, i) => el('div', { style: i === labels.length - 1 ? 'text-align:right' : '' }, l)));
  }

  function listaDaAba() {
    return _aba === 'sem' ? _dados.semAssociacao : _aba === 'and' ? _dados.emAndamento : _dados.concluidas;
  }
  function renderTabela() {
    tabelaWrap.innerHTML = '';
    tabelaWrap.append(cabecalho());
    const lista = listaDaAba();
    if (!lista.length) {
      tabelaWrap.append(el('div', { style: 'padding:36px;text-align:center;color:var(--lx-tinta-2);font-size:13px;background:var(--lx-superficie)' }, 'Nenhuma corrida nesta seção.'));
      return;
    }
    lista.forEach(c => tabelaWrap.append(linha(c)));
  }

  function render() {
    cntSem.textContent = String(_dados.totais.semAssociacao || 0);
    cntAnd.textContent = String(_dados.totais.emAndamento || 0);
    cntCon.textContent = String(_dados.totais.concluidas || 0);
    renderTabela();
  }

  function periodoParaDatas() {
    const agora = new Date();
    if (filtros.periodo === 'tudo') return {};
    if (filtros.periodo === 'hoje') { const de = new Date(agora); de.setHours(0, 0, 0, 0); return { de: de.toISOString() }; }
    const dias = filtros.periodo === '7d' ? 7 : 30;
    return { de: new Date(agora.getTime() - dias * 86400000).toISOString() };
  }
  async function carregar() {
    const params = new URLSearchParams();
    const { de, ate } = periodoParaDatas();
    if (de) params.set('de', de);
    if (ate) params.set('ate', ate);
    if (filtros.loja_id) params.set('loja_id', filtros.loja_id);
    if (filtros.q) params.set('q', filtros.q);
    if (filtros.regiao) params.set('regiao', filtros.regiao);
    try { _dados = await get('/entregas/acompanhamento?' + params.toString()); render(); }
    catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); }
  }

  try {
    _lojas = await get('/lojas?ativo=true');
    selLoja.append(el('option', { value: '' }, 'Todas as lojas'));
    _lojas.forEach(l => selLoja.append(el('option', { value: l.id }, l.nome_fantasia)));
  } catch { selLoja.append(el('option', { value: '' }, 'Todas as lojas')); }

  const conteudo = el('div', {}, barraFiltros, abas, tabelaWrap);
  container.append(casca('Acompanhamento', conteudo, 'Todas as corridas, todas as lojas'));
  setAba('sem');
  carregar();

  const timer = setInterval(carregar, 30000);
  const obs = new MutationObserver(() => { if (!document.body.contains(container)) { clearInterval(timer); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
