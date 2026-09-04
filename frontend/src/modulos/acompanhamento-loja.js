// Acompanhamento da LOJA — Kanban somente-leitura das corridas da própria loja.
// O endpoint /entregas/acompanhamento já auto-escopa pela loja do token
// (lojaIdToken), então a loja só enxerga as próprias corridas.
import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';

// SVG stroke, currentColor (zero emoji).
const svg = (paths, size = 14) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = paths;
  return s;
};
const IC = {
  pin: '<path d="M12 21s-7-6.3-7-11a7 7 0 0114 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

// Chip de SLA (mesma lógica visual do acompanhamento da central).
function slaBadge(sla) {
  if (!sla) return el('span', {});
  const cores = {
    no_prazo: { bg: 'var(--lx-ok-bg)', cor: 'var(--lx-ok)' },
    atencao: { bg: '#fef9c3', cor: '#a16207' },
    iminente: { bg: '#ffedd5', cor: '#c2410c' },
    fora_prazo: { bg: 'var(--lx-erro-bg)', cor: 'var(--lx-erro)' },
  };
  const c = cores[sla.nivel] || cores.no_prazo;
  return el('span', { style: `font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:${c.bg};color:${c.cor};white-space:nowrap` }, sla.rotulo || '');
}

// Links públicos (não exigem permissão).
function abrirRastreio(c) {
  if (!c.rastreio_token) return;
  window.open(location.origin + '/rastreio/' + c.rastreio_token, '_blank');
}
function abrirProtocolo(c) {
  const base = window.LOGIX_API || '/api/v1';
  window.open(`${base}/entregas/${c.id}/protocolo`, '_blank');
}

const BTN = 'flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--lx-linha);background:var(--lx-superficie);border-radius:8px;padding:7px 8px;font:inherit;font-size:11.5px;font-weight:600;color:var(--lx-tinta-2);cursor:pointer';
const BTN_PRIM = 'flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--lx-azul-primario);background:var(--lx-azul-primario);border-radius:8px;padding:7px 8px;font:inherit;font-size:11.5px;font-weight:600;color:#fff;cursor:pointer';

export async function montar(container) {
  const estado = { dados: null, q: '' };
  const wrap = el('div');
  container.append(casca('Acompanhamento', wrap, 'Acompanhe as corridas da sua loja em tempo real'));

  async function carregar() {
    try {
      estado.dados = await get('/entregas/acompanhamento');
      render();
    } catch (e) {
      if (!estado.dados) wrap.innerHTML = '<div style="padding:24px;color:var(--lx-erro,#dc2626)">Erro ao carregar: ' + esc(e.message) + '</div>';
    }
  }

  function combina(c) {
    if (!estado.q) return true;
    const t = estado.q.toLowerCase();
    return String(c.protocolo || '').toLowerCase().includes(t)
      || String(c.coleta_endereco || '').toLowerCase().includes(t)
      || String(c.destino_endereco || '').toLowerCase().includes(t)
      || String(c.motoboy_nome || '').toLowerCase().includes(t)
      || String(c.motoboy_codigo || '').toLowerCase().includes(t);
  }

  function acoesCard(c, acts) {
    const w = el('div', { style: 'display:flex;gap:6px;margin-top:9px;padding-top:9px;border-top:1px solid var(--lx-linha)' });
    const soProtocolo = acts.length === 1 && acts[0] === 'protocolo';
    acts.forEach((a) => {
      if (a === 'rastreio') {
        w.append(el('button', { style: BTN_PRIM, onClick: () => abrirRastreio(c) }, svg(IC.pin), el('span', {}, 'Rastreio em tempo real')));
      } else if (a === 'protocolo') {
        w.append(el('button', { style: soProtocolo ? BTN_PRIM : BTN, onClick: () => abrirProtocolo(c) }, svg(IC.file), el('span', {}, 'Protocolo')));
      }
    });
    return w;
  }

  function card(c, fase) {
    const acts = fase === 'aguardando' || fase === 'emrota' ? ['rastreio']
      : fase === 'devolucao' ? ['rastreio', 'protocolo']
      : ['protocolo']; // concluido e cancelado: só protocolo (corrida encerrada, sem rastreio ao vivo)

    const topo = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px' },
      el('span', { style: 'font-size:14px;font-weight:800;color:var(--lx-azul-primario)' }, c.protocolo),
      slaBadge(c.sla));

    const ponto = (cor, texto) => el('div', { style: 'display:flex;gap:7px;font-size:11.5px;color:var(--lx-tinta-2);line-height:1.3' },
      el('span', { style: `width:7px;height:7px;border-radius:2px;background:${cor};flex:none;margin-top:4px` }),
      el('span', { style: 'overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical' }, texto || '—'));
    const rota = el('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px' },
      ponto('var(--lx-azul-primario)', c.coleta_endereco || c.coleta_nome),
      ponto('var(--lx-ok)', c.destino_endereco));

    const meta = el('div', { style: 'display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--lx-tinta-2);border-top:1px solid var(--lx-linha);padding-top:8px' });
    if (c.motoboy_nome) {
      meta.append(el('span', { style: 'display:flex;align-items:center;gap:6px' },
        c.motoboy_codigo != null ? el('span', { style: 'font-size:11px;font-weight:800;color:var(--lx-azul-primario);background:var(--lx-info-bg);border-radius:5px;padding:1px 6px' }, String(c.motoboy_codigo)) : el('span', {}),
        el('span', {}, c.motoboy_nome)));
    } else {
      meta.append(el('span', { style: 'color:var(--lx-tinta-3)' }, 'Sem entregador'));
    }

    const linhas = [];
    linhas.push(el('div', {}, 'Solicitada ' + (dataHora(c.criado_em) || '—')));
    if (fase === 'concluido' && c.concluida_em) linhas.push(el('div', { style: 'color:var(--lx-ok);font-weight:600' }, 'Concluída ' + dataHora(c.concluida_em)));
    if (fase === 'cancelado' && c.cancelada_em) linhas.push(el('div', { style: 'color:var(--lx-tinta-2);font-weight:600' }, 'Cancelada ' + dataHora(c.cancelada_em)));
    const datas = el('div', { style: 'font-size:10.5px;color:var(--lx-tinta-3);margin-top:6px;line-height:1.5' }, ...linhas);

    return el('div', { style: 'background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:11px;padding:11px;box-shadow:0 1px 2px rgba(15,39,64,.05)' },
      topo, rota, meta, datas, acoesCard(c, acts));
  }

  function coluna(titulo, cor, itens, fase) {
    const LIM = 60;
    const body = el('div', { style: 'padding:9px;display:flex;flex-direction:column;gap:9px;overflow-y:auto' });
    if (!itens.length) body.append(el('div', { style: 'padding:22px;text-align:center;color:var(--lx-tinta-3);font-size:12px' }, 'Nenhuma corrida.'));
    else {
      itens.slice(0, LIM).forEach((c) => body.append(card(c, fase)));
      if (itens.length > LIM) body.append(el('div', { style: 'padding:8px;text-align:center;color:var(--lx-tinta-2);font-size:12px;font-weight:600' }, '+' + (itens.length - LIM) + ' corridas'));
    }
    const hd = el('div', { style: 'padding:11px 13px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;gap:8px' },
      el('span', { style: `width:9px;height:9px;border-radius:3px;background:${cor};flex:none` }),
      el('b', { style: 'font-size:12.5px;flex:1' }, titulo),
      el('span', { style: 'font-size:11px;font-weight:800;color:var(--lx-tinta-2);background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:999px;padding:1px 8px' }, String(itens.length)));
    return el('div', { style: `flex:0 0 300px;background:var(--lx-superficie-2);border:1px solid var(--lx-linha);border-top:3px solid ${cor};border-radius:14px;display:flex;flex-direction:column;max-height:calc(100vh - 200px)` }, hd, body);
  }

  function render() {
    const d = estado.dados || {};
    const ativas = [...(d.semAssociacao || []), ...(d.emAndamento || [])].filter(combina);
    const aguardando = ativas.filter((c) => !c.tem_retorno && c.status !== 'em_rota');
    const emRota = ativas.filter((c) => !c.tem_retorno && c.status === 'em_rota');
    const devolucao = ativas.filter((c) => c.tem_retorno);
    const concluido = (d.concluidas || []).filter(combina);
    const cancelado = (d.canceladas || []).filter(combina);

    wrap.innerHTML = '';
    const busca = el('input', {
      style: 'width:100%;height:100%;border:0;background:none;font:inherit;font-size:13.5px;outline:none;color:var(--lx-tinta)',
      placeholder: 'Pesquisar protocolo, endereço ou entregador…', value: estado.q,
    });
    busca.addEventListener('input', () => { estado.q = busca.value; render(); busca.focus(); });
    const barra = el('div', { style: 'display:flex;align-items:center;gap:9px;height:42px;padding:0 14px;background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:10px;color:var(--lx-tinta-3);margin-bottom:16px;max-width:520px' },
      svg(IC.busca, 16), busca);

    const board = el('div', { style: 'display:flex;gap:13px;overflow-x:auto;padding-bottom:6px;align-items:flex-start' },
      coluna('Aguardando coleta', '#BA7517', aguardando, 'aguardando'),
      coluna('Em rota', 'var(--lx-azul-primario)', emRota, 'emrota'),
      coluna('Devolução', '#C2410C', devolucao, 'devolucao'),
      coluna('Concluído', 'var(--lx-ok)', concluido, 'concluido'),
      coluna('Cancelado', 'var(--lx-tinta-3)', cancelado, 'cancelado'));

    wrap.append(barra, board);
  }

  await carregar();
  // Atualização automática (near real-time) enquanto a tela estiver montada.
  clearInterval(window.__lxAcompLojaTimer);
  window.__lxAcompLojaTimer = setInterval(carregar, 20000);
}
