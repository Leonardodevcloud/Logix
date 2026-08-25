import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, baixar } from '../core/api.js';
import * as auth from '../core/auth.js';

const TZ = 'America/Bahia';
function dt(v, seg) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('pt-BR', {
      timeZone: TZ, day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', ...(seg ? { second: '2-digit' } : {}),
    });
  } catch { return ''; }
}
function dtCompleto(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}
function money(v) { return v == null ? '—' : 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function coords(la, ln) { return (la != null && ln != null) ? Number(la).toFixed(6) + ', ' + Number(ln).toFixed(6) : ''; }

export async function montar(container) {
  const perfil = auth.acessoAtual().perfil;
  const ehAdmin = perfil === 'super_admin' || perfil === 'central_admin';
  const content = el('div', {});
  container.append(casca('Relatórios', content, 'Gere o relatório da operação e exporte para Excel ou PDF.'));

  const estado = {
    de: '', ate: '', base: 'criacao', enderecos: 'com',
    loja_id: '', centro_id: '', motoboy_busca: '', status: '',
    categoria_id: '', sla: '', exibir: ehAdmin ? 'ambos' : 'cliente', ordenar: 'data', limite: '100', todos: false,
  };

  // ---------- filtros ----------
  const campo = (label, elemento, adm) => el('div', { style: 'display:flex;flex-direction:column' },
    el('label', { style: 'font-size:11.5px;font-weight:600;color:var(--lx-tinta-2);margin-bottom:4px' },
      label, adm ? el('span', { style: 'font-size:9px;font-weight:800;color:#6B4FC9;background:#EEEDFE;padding:1px 6px;border-radius:5px;margin-left:5px' }, 'só admin') : ''),
    elemento);
  const inpEstilo = 'font-size:12.5px;color:var(--lx-tinta);background:#fff;border:1px solid var(--lx-linha);border-radius:8px;padding:8px 10px;width:100%';
  const selDe = (arr, val, on) => { const s = el('select', { style: inpEstilo, onChange: on }); arr.forEach(([v, t]) => s.append(el('option', { value: v, ...(v === val ? { selected: '' } : {}) }, t))); return s; };
  const grade = (n) => 'display:grid;grid-template-columns:repeat(' + n + ',1fr);gap:12px;margin-bottom:14px';
  const bloco = (titulo) => el('div', { style: 'font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-azul,#185FA5);margin:2px 0 10px' }, titulo);

  const inDe = el('input', { type: 'date', style: inpEstilo, onChange: (e) => estado.de = e.target.value });
  const inAte = el('input', { type: 'date', style: inpEstilo, onChange: (e) => estado.ate = e.target.value });
  const selBase = selDe([['criacao', 'Criação'], ['finalizacao', 'Finalização'], ['coleta', 'Coleta']], 'criacao', (e) => estado.base = e.target.value);
  const selEnd = selDe([['com', 'Com endereços'], ['sem', 'Sem endereços']], 'com', (e) => estado.enderecos = e.target.value);

  const selLoja = el('select', { style: inpEstilo, onChange: async (e) => { estado.loja_id = e.target.value; estado.centro_id = ''; await carregarCentros(); } }, el('option', { value: '' }, 'Todas as lojas'));
  const selCentro = el('select', { style: inpEstilo, onChange: (e) => estado.centro_id = e.target.value }, el('option', { value: '' }, 'Todos os centros'));
  selCentro.disabled = true;
  const inMotoboy = el('input', { type: 'text', placeholder: 'Nome ou código', style: inpEstilo, onInput: (e) => estado.motoboy_busca = e.target.value.trim() });
  const selStatus = selDe([['', 'Todos'], ['entregue', 'Concluído'], ['cancelada', 'Cancelado']], '', (e) => estado.status = e.target.value);
  const selCat = el('select', { style: inpEstilo, onChange: (e) => estado.categoria_id = e.target.value }, el('option', { value: '' }, 'Todas'));
  const selSla = selDe([['', 'Todos'], ['no_prazo', 'No prazo'], ['fora_prazo', 'Fora do prazo']], '', (e) => estado.sla = e.target.value);
  const selExibir = selDe(ehAdmin ? [['ambos', 'Cliente e motoboy'], ['cliente', 'Só cliente'], ['nenhum', 'Nenhum']] : [['cliente', 'Cliente'], ['nenhum', 'Nenhum']], ehAdmin ? 'ambos' : 'cliente', (e) => estado.exibir = e.target.value);
  const selOrd = selDe([['data', 'Data (mais recente)'], ['protocolo', 'Serviço'], ['loja', 'Loja']], 'data', (e) => estado.ordenar = e.target.value);
  const selLim = selDe([['100', '100'], ['250', '250'], ['500', '500'], ['todos', 'Tudo']], '100', (e) => estado.limite = e.target.value);

  const b1 = el('div', { style: grade(4) }, campo('Data inicial', inDe), campo('Data final', inAte), campo('Buscar pela data de', selBase), campo('Endereços', selEnd));
  const escopoCampos = [];
  if (ehAdmin) escopoCampos.push(campo('Loja / cliente', selLoja, true), campo('Centro de custo', selCentro), campo('Motoboy (nome ou código)', inMotoboy, true), campo('Status', selStatus));
  else escopoCampos.push(campo('Status', selStatus));
  const b2 = el('div', { style: grade(ehAdmin ? 4 : 2) }, ...escopoCampos);
  const b3 = el('div', { style: grade(4) }, campo('Modal de entrega', selCat), campo('SLA', selSla), campo('Exibir valores', selExibir), campo('Ordenar por', selOrd));
  const b3b = el('div', { style: grade(4) }, campo('Registros por página', selLim));

  const btnBuscar = el('button', { class: 'lx-btn lx-btn-primario', onClick: buscar }, 'Buscar dados');
  const btnXls = el('button', { class: 'lx-btn lx-btn-secundario', style: 'background:#E4F5EE;color:#0F6E56;border-color:#B7E3D0', onClick: () => exportar('xls') }, 'Excel (.xls)');
  const btnCsv = el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => exportar('csv') }, 'CSV');
  const btnPdf = el('button', { class: 'lx-btn lx-btn-secundario', style: 'background:#FBE8E6;color:#B23B32;border-color:#F1C9C4', onClick: () => window.print() }, 'PDF (imprimir)');
  const acoes = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--lx-linha);padding-top:14px;margin-top:2px' },
    btnBuscar, btnXls, btnCsv, btnPdf,
    el('span', { style: 'flex:1' }), el('span', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, '1 linha por serviço · pontos empilhados'));

  const filtrosCard = el('div', { class: 'lx-card lx-card-pad', style: 'margin-bottom:14px' },
    el('div', { style: 'font-size:14px;font-weight:800;color:var(--lx-navy,#042C53);margin-bottom:14px' }, 'Filtros'),
    bloco('Período'), b1, bloco('Escopo'), b2, bloco('Modal, SLA, valores e ordenação'), b3, b3b, acoes);
  content.append(filtrosCard);

  // ---------- resultado ----------
  const resultado = el('div', {});
  content.append(resultado);

  async function carregarCentros() {
    selCentro.innerHTML = ''; selCentro.append(el('option', { value: '' }, 'Todos os centros'));
    if (!estado.loja_id) { selCentro.disabled = true; return; }
    try {
      const c = await get('/clientes/' + estado.loja_id + '/contexto/centros');
      (c || []).forEach((x) => selCentro.append(el('option', { value: x.id }, x.nome || x.codigo || x.id)));
      selCentro.disabled = false;
    } catch { selCentro.disabled = true; }
  }

  function qs() {
    const p = new URLSearchParams();
    if (estado.de) p.set('de', estado.de);
    if (estado.ate) p.set('ate', estado.ate);
    if (estado.base) p.set('base', estado.base);
    if (estado.enderecos) p.set('enderecos', estado.enderecos);
    if (estado.loja_id) p.set('loja_id', estado.loja_id);
    if (estado.centro_id) p.set('centro_id', estado.centro_id);
    if (estado.motoboy_busca) p.set('motoboy_busca', estado.motoboy_busca);
    if (estado.status) p.set('status', estado.status);
    if (estado.categoria_id) p.set('categoria_id', estado.categoria_id);
    if (estado.exibir) p.set('exibir_valores', estado.exibir);
    if (estado.sla) p.set('sla', estado.sla);
    if (estado.ordenar) p.set('ordenar', estado.ordenar);
    if (estado.limite === 'todos') p.set('todos', '1'); else p.set('limite', estado.limite);
    return p;
  }

  function pill(txt, cor, bg) { return el('span', { style: 'font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;background:' + bg + ';color:' + cor }, txt); }
  function celulaPontos(l, comEnd) {
    const box = el('div', {});
    // Ponto 1 = coleta (fica na própria entrega)
    const c = el('div', { style: 'margin-bottom:8px' },
      el('div', { style: 'font-weight:800;color:var(--lx-navy,#042C53);font-size:11.5px' }, 'Ponto 1 · Coleta'),
      comEnd ? el('div', { style: 'font-size:11.5px' }, l.coleta_endereco || '—') : '',
      comEnd && (l.coleta_lat != null) ? el('div', { style: 'font-size:10.5px;color:var(--lx-tinta-3)' }, coords(l.coleta_lat, l.coleta_lng)) : '',
      el('div', { style: 'font-size:10.5px;color:var(--lx-tinta-2)' }, 'Chegada ' + (dt(l.chegada_coleta_em, true) || '—')));
    box.append(c);
    (l.pontos || []).forEach((p, i) => {
      const extra = [];
      if (p.numero_nf) extra.push('NF ' + p.numero_nf);
      if (p.recebedor) extra.push('Receb.: ' + p.recebedor);
      box.append(el('div', { style: 'margin-bottom:8px' },
        el('div', { style: 'font-weight:800;color:var(--lx-navy,#042C53);font-size:11.5px' }, 'Ponto ' + (i + 2) + ' · Entrega'),
        comEnd ? el('div', { style: 'font-size:11.5px' }, (p.endereco || '—') + (extra.length ? ' · ' + extra.join(' · ') : '')) : el('div', { style: 'font-size:11.5px' }, extra.join(' · ') || '—'),
        comEnd && (p.lat != null) ? el('div', { style: 'font-size:10.5px;color:var(--lx-tinta-3)' }, coords(p.lat, p.lng)) : '',
        el('div', { style: 'font-size:10.5px;color:var(--lx-tinta-2)' }, 'Chegada ' + (dt(p.chegou_em, true) || '—') + ' · Saída ' + (dt(p.entregue_em || p.finalizado_em, true) || '—'))));
    });
    return box;
  }

  async function buscar() {
    resultado.innerHTML = '';
    resultado.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));
    let d;
    try { d = await get('/relatorios?' + qs().toString()); }
    catch (e) { resultado.innerHTML = ''; resultado.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar o relatório.')); return; }
    const r = d.resumo || {}, linhas = d.linhas || [], verMb = d.ver_motoboy, comEnd = d.com_enderecos !== false;

    resultado.innerHTML = '';
    const resumo = el('div', { class: 'lx-card', style: 'margin-bottom:12px' },
      el('div', { style: 'display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;color:var(--lx-tinta-2);padding:12px 18px' },
        el('span', {}, 'Serviços: ', el('b', { style: 'color:var(--lx-navy,#042C53);font-size:15px' }, String(r.servicos || 0))),
        el('span', {}, 'Concluídos: ', el('b', { style: 'color:var(--lx-navy,#042C53);font-size:15px' }, String(r.concluidos || 0))),
        el('span', {}, 'Cancelados: ', el('b', { style: 'color:var(--lx-navy,#042C53);font-size:15px' }, String(r.cancelados || 0))),
        el('span', {}, 'No prazo: ', el('b', { style: 'color:var(--lx-ok,#1F9D6B);font-size:15px' }, String(r.no_prazo || 0))),
        el('span', {}, 'Fora: ', el('b', { style: 'color:var(--lx-erro,#D0584F);font-size:15px' }, String(r.fora_prazo || 0))),
        el('span', {}, 'Km: ', el('b', { style: 'color:var(--lx-navy,#042C53);font-size:15px' }, (r.km || 0).toLocaleString('pt-BR'))),
        el('span', {}, 'Cliente: ', el('b', { style: 'color:var(--lx-navy,#042C53);font-size:15px' }, money(r.valor_cliente))),
        (verMb && estado.exibir === 'ambos') ? el('span', {}, 'Motoboy: ', el('b', { style: 'color:var(--lx-navy,#042C53);font-size:15px' }, money(r.valor_motoboy))) : ''));
    resultado.append(resumo);

    if (!linhas.length) { resultado.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Nenhum serviço encontrado com esses filtros.')); return; }

    const mostrarCli = estado.exibir !== 'nenhum';
    const mostrarProf = verMb && estado.exibir === 'ambos';
    const cabValor = mostrarProf ? 'Valor cli / prof' : mostrarCli ? 'Valor cliente' : 'Valor';
    const cols = ['Serviço', 'Cliente', 'Endereço (pontos)', 'Distância', 'Profissional', 'Criação', 'Modal', cabValor, 'SLA', 'Status', 'Finalização'];
    const thead = el('tr', {}, ...cols.map((c) => el('th', { style: 'background:var(--lx-navy,#042C53);color:#cfe0f2;text-align:left;font-size:10.5px;font-weight:800;padding:10px 12px;white-space:nowrap;vertical-align:top' }, c)));
    const tbody = el('tbody', {});
    linhas.forEach((l) => {
      const tdBase = 'padding:11px 12px;border-bottom:1px solid var(--lx-linha);vertical-align:top;font-size:12px';
      const slaPill = l.sla === 'no_prazo' ? pill('No prazo', 'var(--lx-ok,#1F9D6B)', '#E4F5EE') : l.sla === 'fora_prazo' ? pill('Fora do prazo', 'var(--lx-erro,#D0584F)', '#FBE8E6') : el('span', { style: 'color:var(--lx-tinta-3)' }, '—');
      const stPill = l.status === 'entregue' ? pill('Concluído', 'var(--lx-ok,#1F9D6B)', '#E4F5EE') : l.status === 'cancelada' ? pill('Cancelado', 'var(--lx-erro,#D0584F)', '#FBE8E6') : pill(l.status || '—', 'var(--lx-tinta-2)', '#EEF3F9');
      tbody.append(el('tr', {},
        el('td', { style: tdBase + ';font-weight:800;color:var(--lx-azul,#185FA5)' }, l.protocolo || '—'),
        el('td', { style: tdBase + ';max-width:150px' }, l.loja_nome || '—'),
        el('td', { style: tdBase + ';min-width:300px' }, celulaPontos(l, comEnd)),
        el('td', { style: tdBase }, l.distancia_km != null ? Number(l.distancia_km).toFixed(1) + ' km' : '—'),
        el('td', { style: tdBase }, (l.mb_codigo != null ? l.mb_codigo + ' - ' : '') + (l.mb_nome || '—')),
        el('td', { style: tdBase }, dtCompleto(l.criado_em)),
        el('td', { style: tdBase }, l.categoria_nome || '—'),
        el('td', { style: tdBase }, mostrarCli ? el('b', {}, money(l.valor_cliente)) : el('span', { style: 'color:var(--lx-tinta-3)' }, '—'), mostrarProf ? el('div', { style: 'color:var(--lx-tinta-2)' }, money(l.valor_motoboy)) : ''),
        el('td', { style: tdBase }, slaPill),
        el('td', { style: tdBase }, stPill),
        el('td', { style: tdBase }, dtCompleto(l.concluida_em) || '—')));
    });
    const tabela = el('div', { class: 'lx-card', style: 'overflow-x:auto' }, el('table', { style: 'border-collapse:collapse;width:100%;min-width:1250px' }, el('thead', {}, thead), tbody));
    resultado.append(tabela);
  }

  async function exportar(formato) {
    if (!estado.de || !estado.ate) { alert('Informe a data inicial e a data final.'); return; }
    const p = qs(); p.set('formato', formato); p.set('todos', '1'); p.delete('limite');
    try { await baixar('/relatorios/export?' + p.toString()); }
    catch (e) { alert('Não foi possível exportar. Tente novamente.'); }
  }

  // ---------- carga inicial dos dropdowns ----------
  try {
    const op = await get('/relatorios/opcoes');
    (op.categorias || []).forEach((c) => selCat.append(el('option', { value: c.id }, c.nome)));
    if (ehAdmin && op.lojas) op.lojas.forEach((l) => selLoja.append(el('option', { value: l.id }, l.nome)));
  } catch {}
}
