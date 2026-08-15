import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';

const LS_PERIODO = 'logix_fin_periodo';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

// R$ a partir de centavos.
function reais(cent) { return 'R$ ' + (Number(cent || 0) / 100).toFixed(2).replace('.', ','); }
function dataBR(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); }

// Período padrão: mês corrente.
function periodoPadrao() {
  try { const j = JSON.parse(localStorage.getItem(LS_PERIODO)); if (j && j.de) return j; } catch {}
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fmt = d => d.toISOString().slice(0, 10);
  return { de: fmt(ini), ate: fmt(hoje) };
}

export async function montar(container) {
  let _aba = 'cliente';
  const periodo = periodoPadrao();

  // ── Barra de período ────────────────────────────────────────────
  const inpDe = el('input', { class: 'lx-input', type: 'date', value: periodo.de, style: 'width:160px' });
  const inpAte = el('input', { class: 'lx-input', type: 'date', value: periodo.ate, style: 'width:160px' });
  const btnAplicar = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: aplicar }, 'Aplicar');

  const atalho = (rotulo, calc) => el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px;padding:7px 12px', onClick: () => { const [d, a] = calc(); inpDe.value = d; inpAte.value = a; aplicar(); } }, rotulo);
  const fmt = d => d.toISOString().slice(0, 10);
  const hoje = () => new Date();
  const atalhos = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
    atalho('Hoje', () => { const d = fmt(hoje()); return [d, d]; }),
    atalho('7 dias', () => { const a = hoje(); const d = new Date(a); d.setDate(d.getDate() - 6); return [fmt(d), fmt(a)]; }),
    atalho('Este mês', () => { const a = hoje(); return [fmt(new Date(a.getFullYear(), a.getMonth(), 1)), fmt(a)]; }),
    atalho('Mês passado', () => { const a = hoje(); const ini = new Date(a.getFullYear(), a.getMonth() - 1, 1); const fim = new Date(a.getFullYear(), a.getMonth(), 0); return [fmt(ini), fmt(fim)]; }));

  const barraPeriodo = el('div', { style: 'display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;padding:16px;background:var(--lx-superficie-2);border-radius:var(--lx-raio-lg);margin-bottom:16px' },
    el('div', { class: 'lx-field' }, el('label', {}, 'De'), inpDe),
    el('div', { class: 'lx-field' }, el('label', {}, 'Até'), inpAte),
    btnAplicar,
    el('div', { style: 'flex:1' }),
    atalhos);

  // ── Navegação de abas ───────────────────────────────────────────
  const ABAS = [{ id: 'cliente', rotulo: 'Faturamento Cliente' }, { id: 'motoboy', rotulo: 'Motoboys (saldo)' }, { id: 'fechamentos', rotulo: 'Fechamentos' }, { id: 'categorias', rotulo: 'Categorias' }];
  const nav = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:18px' });
  const painel = el('div', {});

  function renderNav() {
    nav.innerHTML = '';
    ABAS.forEach(a => {
      const on = a.id === _aba;
      nav.append(el('button', {
        style: `background:none;border:none;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _aba = a.id; renderNav(); render(); },
      }, a.rotulo));
    });
  }
  function aplicar() {
    periodo.de = inpDe.value; periodo.ate = inpAte.value;
    localStorage.setItem(LS_PERIODO, JSON.stringify(periodo));
    render();
  }
  function render() {
    painel.innerHTML = '';
    if (_aba === 'cliente') painel.append(abaCliente(periodo));
    else if (_aba === 'motoboy') painel.append(abaMotoboy(periodo));
    else if (_aba === 'fechamentos') painel.append(abaFechamentos(periodo));
    else painel.append(abaCategorias());
  }

  const conteudo = el('div', {}, barraPeriodo, nav, painel);
  container.append(casca('Financeiro', conteudo, 'Faturamento de clientes e motoboys — corridas concluídas no período.'));
  renderNav();
  render();
}

// Cartão de total (topo de cada aba).
function cartaoTotal(rotulo, valorCent, sub) {
  return el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:linear-gradient(135deg,var(--lx-azul-primario),var(--lx-azul-profundo));color:#fff;border-radius:var(--lx-raio-lg);margin-bottom:16px' },
    el('div', {},
      el('div', { style: 'font-size:12.5px;opacity:.85;text-transform:uppercase;letter-spacing:.04em;font-weight:700' }, rotulo),
      sub ? el('div', { style: 'font-size:12px;opacity:.8;margin-top:2px' }, sub) : el('span', {})),
    el('div', { style: 'font-size:28px;font-weight:800' }, reais(valorCent)));
}

function vazio(txt) { return el('div', { style: 'text-align:center;padding:48px 20px;color:var(--lx-tinta-3);font-size:14px' }, txt); }

// ── Aba: Faturamento Cliente ──────────────────────────────────────
function abaCliente(periodo) {
  const wrap = el('div', {});
  const topo = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  wrap.append(topo, lista);

  const expandido = new Set(); // lojaIds expandidos

  async function carregar() {
    lista.innerHTML = '<div style="padding:24px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try {
      const r = await get(`/financeiro/cliente?de=${periodo.de}&ate=${periodo.ate}`);
      topo.innerHTML = '';
      topo.append(cartaoTotal('Total a faturar (clientes)', r.total_geral_cent, `${r.clientes.length} cliente(s) com corridas no período`));
      render(r.clientes);
    } catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro ao carregar')); }
  }

  function render(clientes) {
    lista.innerHTML = '';
    if (!clientes.length) { lista.append(vazio('Nenhuma corrida concluída no período.')); return; }
    // Cabeçalho
    lista.append(el('div', { style: 'display:grid;grid-template-columns:1fr 120px 160px 40px;gap:12px;padding:8px 16px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase' },
      el('div', {}, 'Cliente'), el('div', { style: 'text-align:right' }, 'Corridas'), el('div', { style: 'text-align:right' }, 'Total'), el('div', {})));
    clientes.forEach(c => {
      const aberto = expandido.has(c.loja_id);
      const seta = el('span', { style: `font-size:13px;color:var(--lx-tinta-3);transition:transform .15s;transform:rotate(${aberto ? 90 : 0}deg)` }, '▶');
      const linha = el('div', { style: 'display:grid;grid-template-columns:1fr 120px 160px 40px;gap:12px;padding:13px 16px;align-items:center;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);cursor:pointer;background:var(--lx-superficie)', onClick: () => toggle(c, bloco, seta) },
        el('div', { style: 'font-weight:700;font-size:14px' }, c.loja_nome),
        el('div', { style: 'text-align:right;font-size:13px;color:var(--lx-tinta-2)' }, c.qtd_corridas),
        el('div', { style: 'text-align:right;font-weight:800;font-size:15px;color:var(--lx-azul-primario)' }, reais(c.total_cliente_cent)),
        el('div', { style: 'text-align:center' }, seta));
      const detalhe = el('div', { style: 'padding:6px 10px 10px 24px;display:none' });
      const bloco = el('div', {}, linha, detalhe);
      bloco._detalhe = detalhe; bloco._carregado = false; bloco._c = c;
      lista.append(bloco);
    });
  }

  async function toggle(c, bloco, seta) {
    const detalhe = bloco._detalhe;
    const abrir = detalhe.style.display === 'none';
    detalhe.style.display = abrir ? 'block' : 'none';
    seta.style.transform = `rotate(${abrir ? 90 : 0}deg)`;
    if (abrir) expandido.add(c.loja_id); else expandido.delete(c.loja_id);
    if (abrir && !bloco._carregado) {
      bloco._carregado = true;
      detalhe.innerHTML = '<div style="padding:10px;color:var(--lx-tinta-3);font-size:12.5px">Carregando centros de custo…</div>';
      try {
        const r = await get(`/financeiro/cliente/${c.loja_id}/centros?de=${periodo.de}&ate=${periodo.ate}`);
        renderCentros(c, detalhe, r.centros);
      } catch (e) { detalhe.innerHTML = `<div style="padding:10px;color:var(--lx-erro);font-size:12.5px">${e.message || 'Erro'}</div>`; }
    }
  }

  function renderCentros(cliente, detalhe, centros) {
    detalhe.innerHTML = '';
    if (!centros.length) { detalhe.append(el('div', { style: 'padding:10px;color:var(--lx-tinta-3);font-size:12.5px' }, 'Sem centros de custo.')); return; }
    centros.forEach(cc => {
      const seta = el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, '▶');
      const linha = el('div', { style: 'display:grid;grid-template-columns:1fr 100px 140px 30px;gap:10px;padding:10px 14px;align-items:center;border-left:3px solid var(--lx-azul-claro);background:var(--lx-superficie-2);border-radius:6px;cursor:pointer;margin-bottom:6px', onClick: () => toggleCentro(cliente, cc, det, seta) },
        el('div', { style: 'font-weight:700;font-size:13px' }, cc.centro_nome),
        el('div', { style: 'text-align:right;font-size:12px;color:var(--lx-tinta-2)' }, cc.qtd_corridas + ' corr.'),
        el('div', { style: 'text-align:right;font-weight:700;font-size:13.5px;color:var(--lx-azul-primario)' }, reais(cc.total_cliente_cent)),
        el('div', { style: 'text-align:center' }, seta));
      const det = el('div', { style: 'display:none;padding:4px 8px 8px 16px' });
      det._carregado = false;
      detalhe.append(el('div', {}, linha, det));
    });
  }

  async function toggleCentro(cliente, cc, det, seta) {
    const abrir = det.style.display === 'none';
    det.style.display = abrir ? 'block' : 'none';
    seta.textContent = abrir ? '▼' : '▶';
    if (abrir && !det._carregado) {
      det._carregado = true;
      det.innerHTML = '<div style="padding:8px;color:var(--lx-tinta-3);font-size:12px">Carregando corridas…</div>';
      try {
        const semCentro = cc.centro_id == null;
        const q = semCentro ? `sem_centro=1` : `centro_id=${cc.centro_id}`;
        const r = await get(`/financeiro/cliente/${cliente.loja_id}/corridas?${q}&de=${periodo.de}&ate=${periodo.ate}`);
        renderCorridas(det, r.corridas, 'cliente');
      } catch (e) { det.innerHTML = `<div style="padding:8px;color:var(--lx-erro);font-size:12px">${e.message || 'Erro'}</div>`; }
    }
  }

  carregar();
  return wrap;
}

// ── Aba: Faturamento Motoboy ──────────────────────────────────────
function abaMotoboy(periodo) {
  const wrap = el('div', {});
  const topo = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const barraAcoes = el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' },
    el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2)' }, 'Lance crédito (bônus, diária…) ou abatimento (adiantamento, multa…) para qualquer motoboy.'),
    el('div', { style: 'flex:1' }),
    el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => formLancamento(null, 'credito', () => carregar()) }, '+ Novo lançamento'));
  wrap.append(topo, barraAcoes, lista);
  const expandido = new Set();

  async function carregar() {
    lista.innerHTML = '<div style="padding:24px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try {
      const r = await get(`/financeiro/motoboy?de=${periodo.de}&ate=${periodo.ate}`);
      topo.innerHTML = '';
      topo.append(cartaoTotal('Saldo a repassar (em aberto)', r.total_geral_cent, `${r.motoboys.length} motoboy(s) no período`));
      render(r.motoboys);
    } catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro ao carregar')); }
  }

  const COLS = '1fr 130px 100px 100px 120px 30px';
  function render(motoboys) {
    lista.innerHTML = '';
    if (!motoboys.length) { lista.append(vazio('Nada em aberto no período.')); return; }
    lista.append(el('div', { style: `display:grid;grid-template-columns:${COLS};gap:10px;padding:8px 16px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase` },
      el('div', {}, 'Motoboy'),
      el('div', { style: 'text-align:right' }, 'Corridas'),
      el('div', { style: 'text-align:right' }, 'Créditos'),
      el('div', { style: 'text-align:right' }, 'Abatim.'),
      el('div', { style: 'text-align:right' }, 'Saldo'),
      el('div', {})));
    motoboys.forEach(m => {
      const seta = el('span', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, expandido.has(m.motoboy_id) ? '▼' : '▶');
      const linha = el('div', { style: `display:grid;grid-template-columns:${COLS};gap:10px;padding:13px 16px;align-items:center;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);cursor:pointer;background:var(--lx-superficie)`, onClick: () => toggle(m, bloco) },
        el('div', { style: 'display:flex;align-items:center;gap:10px;min-width:0' },
          el('span', { style: 'font-weight:800;color:var(--lx-azul-primario);font-size:12px' }, String(m.motoboy_codigo || 0)),
          el('span', { style: 'font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, m.motoboy_nome || '—')),
        el('div', { style: 'text-align:right;font-size:12.5px;color:var(--lx-tinta-2)' }, reais(m.total_corridas_cent) + ` (${m.qtd_corridas})`),
        el('div', { style: 'text-align:right;font-weight:700;color:var(--lx-ok)' }, m.creditos_cent ? '+ ' + reais(m.creditos_cent) : '—'),
        el('div', { style: 'text-align:right;font-weight:700;color:var(--lx-erro)' }, m.abatimentos_cent ? '− ' + reais(m.abatimentos_cent) : '—'),
        el('div', { style: 'text-align:right;font-weight:800;font-size:14px' }, reais(m.saldo_cent)),
        el('div', { style: 'text-align:center' }, seta));
      const detalhe = el('div', { style: 'padding:8px 6px 14px 12px;display:none' });
      const bloco = el('div', {}, linha, detalhe);
      bloco._detalhe = detalhe; bloco._seta = seta;
      if (expandido.has(m.motoboy_id)) { detalhe.style.display = 'block'; carregarExtrato(m, detalhe); }
      lista.append(bloco);
    });
  }

  async function toggle(m, bloco) {
    const detalhe = bloco._detalhe;
    const abrir = detalhe.style.display === 'none';
    detalhe.style.display = abrir ? 'block' : 'none';
    bloco._seta.textContent = abrir ? '▼' : '▶';
    if (abrir) { expandido.add(m.motoboy_id); await carregarExtrato(m, detalhe); }
    else expandido.delete(m.motoboy_id);
  }

  async function carregarExtrato(m, detalhe) {
    detalhe.innerHTML = '<div style="padding:10px;color:var(--lx-tinta-3);font-size:12.5px">Carregando extrato…</div>';
    try {
      const r = await get(`/financeiro/motoboy/${m.motoboy_id}/extrato?de=${periodo.de}&ate=${periodo.ate}`);
      const recarrega = () => { carregarExtrato(m, detalhe); carregar(); };
      detalhe.innerHTML = '';
      const acoes = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' },
        el('button', { class: 'lx-btn', style: 'background:var(--lx-ok);color:#fff;font-size:12.5px;padding:7px 12px;border:none', onClick: () => formLancamento(m, 'credito', recarrega) }, '+ Crédito'),
        el('button', { class: 'lx-btn', style: 'background:var(--lx-erro);color:#fff;font-size:12.5px;padding:7px 12px;border:none', onClick: () => formLancamento(m, 'abatimento', recarrega) }, '− Abatimento'),
        el('div', { style: 'flex:1' }),
        el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12.5px;padding:7px 12px', onClick: () => formFechar(m, r.totais, periodo, recarrega) }, 'Fechar período'));
      const t = r.totais;
      const resumo = el('div', { style: 'display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;font-size:12.5px;color:var(--lx-tinta-2)' },
        el('div', {}, el('b', { style: 'color:var(--lx-tinta)' }, reais(t.corridas_cent)), ` em corridas (${t.qtd_corridas})`),
        el('div', { style: 'color:var(--lx-ok)' }, '+ ' + reais(t.creditos_cent)),
        el('div', { style: 'color:var(--lx-erro)' }, '− ' + reais(t.abatimentos_cent)),
        el('div', {}, 'Saldo: ', el('b', { style: 'color:var(--lx-tinta)' }, reais(t.saldo_cent))));
      const itens = el('div', { style: 'display:flex;flex-direction:column;border:1px solid var(--lx-linha);border-radius:10px;overflow:hidden' });
      r.lancamentos.forEach(l => itens.append(linhaExtrato({
        titulo: l.categoria_nome || (l.tipo === 'credito' ? 'Crédito' : 'Abatimento'),
        sub: [l.descricao, dataDia(l.competencia)].filter(Boolean).join(' · '),
        tipo: l.tipo, valor: l.valor_cent, cor: l.categoria_cor,
        onDel: () => { if (confirm('Excluir este lançamento?')) del(`/financeiro/lancamentos/${l.id}`).then(() => { toast('Excluído'); recarrega(); }).catch(e => toast(e.message || 'Erro', 'erro')); },
      })));
      r.corridas_por_dia.forEach(c => itens.append(linhaExtrato({
        titulo: 'Corridas de ' + dataDia(c.dia), sub: c.qtd + ' entrega(s) concluída(s)', tipo: 'corrida', valor: c.total_cent,
      })));
      if (!r.lancamentos.length && !r.corridas_por_dia.length) itens.append(el('div', { style: 'padding:16px;color:var(--lx-tinta-3);font-size:12.5px;text-align:center' }, 'Sem movimento em aberto no período.'));
      detalhe.append(acoes, resumo, itens);
    } catch (e) { detalhe.innerHTML = `<div style="padding:10px;color:var(--lx-erro);font-size:12.5px">${e.message || 'Erro'}</div>`; }
  }

  carregar();
  return wrap;
}

// Tabela de corridas (usada no detalhe de cliente e de motoboy).
function renderCorridas(container, corridas, tipo) {
  container.innerHTML = '';
  if (!corridas.length) { container.append(el('div', { style: 'padding:10px;color:var(--lx-tinta-3);font-size:12px' }, 'Nenhuma corrida.')); return; }
  const valorCampo = tipo === 'cliente' ? 'valor_cliente_cent' : 'valor_motoboy_cent';
  const tabela = el('div', { style: 'display:flex;flex-direction:column;gap:0;border:1px solid var(--lx-linha);border-radius:8px;overflow:hidden' });
  tabela.append(el('div', { style: 'display:grid;grid-template-columns:90px 1fr 70px 110px 100px;gap:10px;padding:7px 12px;font-size:10.5px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;background:var(--lx-superficie-2)' },
    el('div', {}, 'Protocolo'), el('div', {}, tipo === 'cliente' ? 'Motoboy' : 'Cliente'), el('div', { style: 'text-align:right' }, 'Km'), el('div', {}, 'Concluída'), el('div', { style: 'text-align:right' }, 'Valor')));
  corridas.forEach(c => {
    const ref = tipo === 'cliente'
      ? (c.motoboy_nome ? `${c.motoboy_nome}${c.motoboy_codigo ? ' #' + String(c.motoboy_codigo) : ''}` : '—')
      : (c.loja_nome || '—');
    tabela.append(el('div', { style: 'display:grid;grid-template-columns:90px 1fr 70px 110px 100px;gap:10px;padding:8px 12px;align-items:center;font-size:12px;border-top:0.5px solid var(--lx-linha)' },
      el('div', { style: 'font-weight:700;color:var(--lx-azul-primario)' }, c.protocolo),
      el('div', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, ref),
      el('div', { style: 'text-align:right;color:var(--lx-tinta-2)' }, c.distancia_km != null ? Number(c.distancia_km).toFixed(1) : '—'),
      el('div', { style: 'color:var(--lx-tinta-2);font-size:11.5px' }, dataBR(c.concluida_em)),
      el('div', { style: 'text-align:right;font-weight:700' }, reais(c[valorCampo]))));
  });
  container.append(tabela);
}


// ── Extrato: linha (corrida agregada ou lançamento) ───────────────
function dataDia(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' });
}
function linhaExtrato({ titulo, sub, tipo, valor, cor, onDel }) {
  const sinal = tipo === 'credito' ? '+' : (tipo === 'abatimento' ? '−' : '');
  const corVal = tipo === 'credito' ? 'var(--lx-ok)' : (tipo === 'abatimento' ? 'var(--lx-erro)' : 'var(--lx-tinta)');
  const fundoIco = cor || (tipo === 'corrida' ? '#8ba5bc' : corVal);
  return el('div', { style: 'display:flex;align-items:center;gap:11px;padding:10px 12px;border-top:0.5px solid var(--lx-linha)' },
    el('div', { style: `width:30px;height:30px;border-radius:8px;flex:none;display:grid;place-items:center;font-weight:800;color:#fff;font-size:14px;background:${fundoIco}` }, tipo === 'corrida' ? '•' : sinal),
    el('div', { style: 'min-width:0' },
      el('div', { style: 'font-weight:700;font-size:13px' }, titulo),
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, sub || '')),
    el('div', { style: `margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums;color:${corVal}` }, (sinal ? sinal + ' ' : '') + reais(valor)),
    onDel ? el('button', { style: 'background:none;border:none;color:var(--lx-tinta-3);cursor:pointer;font-size:17px;padding:0 4px', title: 'Excluir', onClick: onDel }, '×') : el('span', {}));
}

// Modal local (o Financeiro não tinha um).
function miniModal(titulo, corpo, acoes) {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:2500', onClick: (e) => { if (e.target === ov) ov.remove(); } });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:24px;width:440px;max-width:94vw;max-height:88vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'font-weight:800;font-size:17px;margin-bottom:16px' }, titulo),
    corpo,
    el('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:20px' }, ...acoes));
  ov.append(box); document.body.append(ov);
  return ov;
}
function campoF(lbl, node) { return el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:5px' }, lbl), node); }
function parseValor(txt) {
  if (!txt) return 0;
  const n = String(txt).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const v = Math.round(parseFloat(n) * 100);
  return isNaN(v) ? 0 : v;
}

// ── Form: novo lançamento (crédito/abatimento) ────────────────────
async function formLancamento(m, tipoInicial, aoSalvar) {
  let cats = [];
  try { cats = (await get('/financeiro/categorias')).categorias || []; } catch {}
  let tipo = tipoInicial, catId = null;
  let motoboyId = m ? m.motoboy_id : null;
  let motoboyNome = m ? (m.motoboy_nome || '') : '';
  const hoje = new Date().toISOString().slice(0, 10);

  // Seletor de motoboy — só quando o lançamento não é de um motoboy fixo.
  let seletorMb = null;
  if (!m) {
    const sel = el('select', { class: 'lx-input', style: 'width:100%' });
    sel.append(el('option', { value: '' }, 'Escolha o motoboy…'));
    try {
      const arr = (await get('/financeiro/motoboys-lista')).motoboys || [];
      arr.forEach(mb => sel.append(el('option', { value: mb.motoboy_id }, String(mb.motoboy_codigo || 0) + ' · ' + mb.motoboy_nome)));
    } catch {}
    sel.addEventListener('change', () => { motoboyId = sel.value || null; motoboyNome = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : ''; });
    seletorMb = campoF('Motoboy', sel);
  }

  const segCred = el('button', {}, 'Crédito (soma)');
  const segAbat = el('button', {}, 'Abatimento (subtrai)');
  const seg = el('div', { style: 'display:flex;background:var(--lx-superficie-2);border-radius:10px;padding:4px;gap:4px' }, segCred, segAbat);
  const catWrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:7px' });
  const valor = el('input', { class: 'lx-input', placeholder: 'R$ 0,00', style: 'width:100%' });
  const comp = el('input', { class: 'lx-input', type: 'date', value: hoje, style: 'width:100%' });
  const desc = el('input', { class: 'lx-input', placeholder: 'Ex: Diária de sábado', style: 'width:100%' });
  function pintaSeg() {
    segCred.style.cssText = `flex:1;border:none;border-radius:8px;padding:9px;font-weight:700;font-size:13px;cursor:pointer;${tipo === 'credito' ? 'background:var(--lx-ok);color:#fff' : 'background:none;color:var(--lx-tinta-2)'}`;
    segAbat.style.cssText = `flex:1;border:none;border-radius:8px;padding:9px;font-weight:700;font-size:13px;cursor:pointer;${tipo === 'abatimento' ? 'background:var(--lx-erro);color:#fff' : 'background:none;color:var(--lx-tinta-2)'}`;
  }
  function pintaCats() {
    catWrap.innerHTML = '';
    const uteis = cats.filter(c => c.tipo === tipo || c.tipo === 'ambos');
    if (!uteis.length) { catWrap.append(el('span', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, 'Sem categoria (opcional)')); return; }
    uteis.forEach(c => {
      const sel = c.id === catId;
      catWrap.append(el('span', { style: `border:1px solid ${sel ? 'var(--lx-ok)' : 'var(--lx-linha)'};background:${sel ? 'var(--lx-ok-bg)' : '#fff'};color:${sel ? 'var(--lx-ok)' : 'var(--lx-tinta-2)'};border-radius:99px;padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer`, onClick: () => { catId = sel ? null : c.id; pintaCats(); } },
        el('span', { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.cor};margin-right:6px;vertical-align:middle` }), c.nome));
    });
  }
  segCred.onclick = () => { tipo = 'credito'; catId = null; pintaSeg(); pintaCats(); };
  segAbat.onclick = () => { tipo = 'abatimento'; catId = null; pintaSeg(); pintaCats(); };
  pintaSeg(); pintaCats();
  const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Lançar');
  const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:14px' });
  if (seletorMb) corpo.append(seletorMb);
  corpo.append(
    campoF('Tipo', seg), campoF('Categoria', catWrap),
    el('div', { style: 'display:flex;gap:12px' }, el('div', { style: 'flex:1' }, campoF('Valor', valor)), el('div', { style: 'flex:1' }, campoF('Competência', comp))),
    campoF('Descrição (opcional)', desc));
  const ov = miniModal(m ? `Novo lançamento — ${motoboyNome}` : 'Novo lançamento',
    corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
  btn.onclick = async () => {
    if (!motoboyId) { toast('Escolha o motoboy', 'erro'); return; }
    const cent = parseValor(valor.value);
    if (!cent) { toast('Informe um valor', 'erro'); return; }
    try { btn.disabled = true;
      await post(`/financeiro/motoboy/${motoboyId}/lancamentos`, { tipo, categoria_id: catId, valor_cent: cent, descricao: desc.value.trim() || null, competencia: comp.value || null });
      ov.remove(); toast('Lançado'); aoSalvar && aoSalvar();
    } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
  };
}

// ── Form: fechar período ──────────────────────────────────────────
function linhaResumo(lbl, val, cor, bold) {
  return el('div', { style: 'display:flex;justify-content:space-between' },
    el('span', { style: `color:${bold ? 'var(--lx-tinta);font-weight:800' : 'var(--lx-tinta-2)'}` }, lbl),
    el('span', { style: `font-weight:${bold ? 800 : 700};color:${cor || 'var(--lx-tinta)'}` }, val));
}
function formFechar(m, totais, periodo, aoSalvar) {
  const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Fechar e registrar');
  const ov = miniModal(`Fechar período — ${m.motoboy_nome || ''}`,
    el('div', {},
      el('p', { style: 'font-size:13px;color:var(--lx-tinta-2);margin:0 0 14px' }, 'Congela as corridas e lançamentos em aberto deste período e cria um repasse. Depois de fechado, os itens não podem mais ser editados.'),
      el('div', { style: 'background:var(--lx-superficie-2);border-radius:10px;padding:14px;font-size:13px;display:flex;flex-direction:column;gap:7px' },
        linhaResumo('Corridas', reais(totais.corridas_cent) + ` (${totais.qtd_corridas})`),
        linhaResumo('Créditos', '+ ' + reais(totais.creditos_cent), 'var(--lx-ok)'),
        linhaResumo('Abatimentos', '− ' + reais(totais.abatimentos_cent), 'var(--lx-erro)'),
        el('div', { style: 'border-top:1px solid var(--lx-linha);margin-top:3px;padding-top:9px' }, linhaResumo('Saldo a repassar', reais(totais.saldo_cent), 'var(--lx-tinta)', true)))),
    [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
  btn.onclick = async () => {
    try { btn.disabled = true; await post(`/financeiro/motoboy/${m.motoboy_id}/fechar`, { de: periodo.de, ate: periodo.ate }); ov.remove(); toast('Período fechado'); aoSalvar && aoSalvar(); }
    catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
  };
}

// ── Aba: Fechamentos (histórico de repasses) ──────────────────────
function abaFechamentos() {
  const wrap = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  wrap.append(lista);
  async function carregar() {
    lista.innerHTML = '<div style="padding:16px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try { render((await get('/financeiro/fechamentos')).fechamentos); }
    catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro')); }
  }
  function render(fs) {
    lista.innerHTML = '';
    if (!fs.length) { lista.append(vazio('Nenhum fechamento ainda. Feche um período na aba Motoboys.')); return; }
    fs.forEach(f => {
      const pago = f.status === 'pago';
      const badge = el('span', { style: `font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;color:${pago ? 'var(--lx-ok)' : '#b45309'};background:${pago ? 'var(--lx-ok-bg)' : '#fff7e6'}` }, pago ? 'Pago' : 'Em aberto');
      const acoes = el('div', { style: 'display:flex;gap:6px' });
      if (!pago) {
        acoes.append(el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12px;padding:6px 11px', onClick: () => formPago(f, carregar) }, 'Marcar pago'));
        acoes.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:6px 9px;color:var(--lx-erro)', onClick: () => { if (confirm('Estornar este fechamento? Os itens voltam a ficar em aberto.')) del(`/financeiro/fechamentos/${f.id}`).then(() => { toast('Estornado'); carregar(); }).catch(e => toast(e.message || 'Erro', 'erro')); } }, 'Estornar'));
      }
      lista.append(el('div', { style: 'display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);background:var(--lx-superficie);flex-wrap:wrap' },
        el('div', { style: 'min-width:180px' },
          el('div', { style: 'font-weight:700;font-size:14px' }, String(f.motoboy_codigo || 0) + ' ' + f.motoboy_nome),
          el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, dataDia(f.periodo_de) + ' a ' + dataDia(f.periodo_ate) + ` · ${f.qtd_corridas} corridas`)),
        el('div', { style: 'font-weight:800;font-size:16px' }, reais(f.saldo_liquido_cent)),
        badge,
        (pago && f.forma_pagamento) ? el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, f.forma_pagamento + (f.pago_em ? ' · ' + dataDia(f.pago_em) : '')) : el('span', {}),
        el('div', { style: 'flex:1' }),
        acoes));
    });
  }
  carregar();
  return wrap;
}
function formPago(f, aoSalvar) {
  const formas = ['PIX', 'Dinheiro', 'Transferência', 'Outro'];
  let forma = 'PIX';
  const segs = formas.map(x => el('button', { onClick: () => { forma = x; pinta(); } }, x));
  const seg = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, ...segs);
  function pinta() { segs.forEach((b, i) => { b.style.cssText = `border:1px solid ${forma === formas[i] ? 'var(--lx-azul-primario)' : 'var(--lx-linha)'};background:${forma === formas[i] ? 'var(--lx-azul-primario)' : '#fff'};color:${forma === formas[i] ? '#fff' : 'var(--lx-tinta-2)'};border-radius:99px;padding:7px 13px;font-size:12.5px;font-weight:700;cursor:pointer`; }); }
  pinta();
  const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Confirmar pagamento');
  const ov = miniModal(`Registrar pagamento — ${reais(f.saldo_liquido_cent)}`,
    el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:8px' }, 'Forma de pagamento'), seg),
    [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
  btn.onclick = async () => {
    try { btn.disabled = true; await patch(`/financeiro/fechamentos/${f.id}/pago`, { forma_pagamento: forma }); ov.remove(); toast('Pagamento registrado'); aoSalvar && aoSalvar(); }
    catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
  };
}

// ── Aba: Categorias ───────────────────────────────────────────────
function abaCategorias() {
  const wrap = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const btnNova = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px;margin-bottom:14px', onClick: () => formCategoria(null, carregar) }, '+ Nova categoria');
  wrap.append(btnNova, lista);
  function badgeTipo(t) {
    const mapa = { credito: ['crédito', 'var(--lx-ok)', 'var(--lx-ok-bg)'], abatimento: ['abatimento', 'var(--lx-erro)', 'var(--lx-erro-bg)'], ambos: ['ambos', 'var(--lx-tinta-2)', 'var(--lx-superficie-2)'] };
    const [txt, cor, bg] = mapa[t] || mapa.credito;
    return el('span', { style: `font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;color:${cor};background:${bg}` }, txt);
  }
  async function carregar() {
    lista.innerHTML = '<div style="padding:16px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try { render((await get('/financeiro/categorias')).categorias); }
    catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro')); }
  }
  function render(cats) {
    lista.innerHTML = '';
    if (!cats.length) { lista.append(vazio('Nenhuma categoria.')); return; }
    cats.forEach(c => lista.append(
      el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);background:var(--lx-superficie)' },
        el('span', { style: `width:12px;height:12px;border-radius:50%;background:${c.cor};flex:none` }),
        el('div', { style: 'font-weight:700;font-size:14px' }, c.nome),
        badgeTipo(c.tipo),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, `${c.usos} uso(s)`),
        el('div', { style: 'flex:1' }),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:5px 10px', onClick: () => formCategoria(c, carregar) }, 'Editar'),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:5px 9px;color:var(--lx-erro)', onClick: () => { if (confirm(`Desativar "${c.nome}"?`)) del(`/financeiro/categorias/${c.id}`).then(() => { toast('Removida'); carregar(); }).catch(e => toast(e.message || 'Erro', 'erro')); } }, 'Remover'))));
  }
  carregar();
  return wrap;
}
function formCategoria(c, aoSalvar) {
  const cores = ['#1f9d6b', '#378ADD', '#dc2626', '#b45309', '#8ba5bc', '#185FA5', '#7c3aed'];
  let tipo = (c && c.tipo) || 'credito';
  let cor = (c && c.cor) || cores[0];
  const nome = el('input', { class: 'lx-input', value: (c && c.nome) || '', placeholder: 'Ex: Vale-refeição', style: 'width:100%' });
  const nomesTipo = ['credito', 'abatimento', 'ambos'];
  const segs = nomesTipo.map(t => el('button', { onClick: () => { tipo = t; pintaSeg(); } }, t === 'credito' ? 'Crédito' : t === 'abatimento' ? 'Abatimento' : 'Ambos'));
  const seg = el('div', { style: 'display:flex;background:var(--lx-superficie-2);border-radius:10px;padding:4px;gap:4px' }, ...segs);
  const corWrap = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
  function pintaSeg() { segs.forEach((b, i) => { b.style.cssText = `flex:1;border:none;border-radius:8px;padding:8px;font-weight:700;font-size:12.5px;cursor:pointer;${tipo === nomesTipo[i] ? 'background:var(--lx-azul-primario);color:#fff' : 'background:none;color:var(--lx-tinta-2)'}`; }); }
  function pintaCor() { corWrap.innerHTML = ''; cores.forEach(hex => corWrap.append(el('span', { style: `width:26px;height:26px;border-radius:50%;background:${hex};cursor:pointer;border:3px solid ${cor === hex ? 'var(--lx-tinta)' : 'transparent'}`, onClick: () => { cor = hex; pintaCor(); } }))); }
  pintaSeg(); pintaCor();
  const btn = el('button', { class: 'lx-btn lx-btn-primario' }, c ? 'Salvar' : 'Criar');
  const ov = miniModal(c ? 'Editar categoria' : 'Nova categoria',
    el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, campoF('Nome', nome), campoF('Tipo padrão', seg), campoF('Cor', corWrap)),
    [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
  btn.onclick = async () => {
    if (!nome.value.trim()) { toast('Informe o nome', 'erro'); return; }
    try { btn.disabled = true;
      if (c) await put(`/financeiro/categorias/${c.id}`, { nome: nome.value.trim(), tipo, cor });
      else await post('/financeiro/categorias', { nome: nome.value.trim(), tipo, cor });
      ov.remove(); toast('Salvo'); aoSalvar && aoSalvar();
    } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
  };
}
