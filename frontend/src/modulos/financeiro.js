import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';

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
  const ABAS = [{ id: 'cliente', rotulo: 'Faturamento Cliente' }, { id: 'motoboy', rotulo: 'Faturamento Motoboy' }];
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
    else painel.append(abaMotoboy(periodo));
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
  wrap.append(topo, lista);

  const expandido = new Set();

  async function carregar() {
    lista.innerHTML = '<div style="padding:24px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    try {
      const r = await get(`/financeiro/motoboy?de=${periodo.de}&ate=${periodo.ate}`);
      topo.innerHTML = '';
      topo.append(cartaoTotal('Total a pagar (motoboys)', r.total_geral_cent, `${r.motoboys.length} motoboy(s) com corridas no período`));
      render(r.motoboys);
    } catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro ao carregar')); }
  }

  function render(motoboys) {
    lista.innerHTML = '';
    if (!motoboys.length) { lista.append(vazio('Nenhuma corrida concluída no período.')); return; }
    lista.append(el('div', { style: 'display:grid;grid-template-columns:1fr 120px 160px 40px;gap:12px;padding:8px 16px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase' },
      el('div', {}, 'Motoboy'), el('div', { style: 'text-align:right' }, 'Corridas'), el('div', { style: 'text-align:right' }, 'Total'), el('div', {})));
    motoboys.forEach(m => {
      const aberto = expandido.has(m.motoboy_id);
      const seta = el('span', { style: `font-size:13px;color:var(--lx-tinta-3);transform:rotate(${aberto ? 90 : 0}deg)` }, '▶');
      const linha = el('div', { style: 'display:grid;grid-template-columns:1fr 120px 160px 40px;gap:12px;padding:13px 16px;align-items:center;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);cursor:pointer;background:var(--lx-superficie)', onClick: () => toggle(m, bloco, seta) },
        el('div', { style: 'display:flex;align-items:center;gap:10px' },
          el('span', { style: 'font-weight:800;color:var(--lx-azul-primario);font-size:12.5px' }, '#' + String(m.motoboy_codigo || 0).padStart(3, '0')),
          el('span', { style: 'font-weight:700;font-size:14px' }, m.motoboy_nome)),
        el('div', { style: 'text-align:right;font-size:13px;color:var(--lx-tinta-2)' }, m.qtd_corridas),
        el('div', { style: 'text-align:right;font-weight:800;font-size:15px;color:var(--lx-ok)' }, reais(m.total_motoboy_cent)),
        el('div', { style: 'text-align:center' }, seta));
      const detalhe = el('div', { style: 'padding:6px 10px 10px 24px;display:none' });
      const bloco = el('div', {}, linha, detalhe);
      bloco._detalhe = detalhe; bloco._carregado = false;
      lista.append(bloco);
    });
  }

  async function toggle(m, bloco, seta) {
    const detalhe = bloco._detalhe;
    const abrir = detalhe.style.display === 'none';
    detalhe.style.display = abrir ? 'block' : 'none';
    seta.style.transform = `rotate(${abrir ? 90 : 0}deg)`;
    if (abrir) expandido.add(m.motoboy_id); else expandido.delete(m.motoboy_id);
    if (abrir && !bloco._carregado) {
      bloco._carregado = true;
      detalhe.innerHTML = '<div style="padding:10px;color:var(--lx-tinta-3);font-size:12.5px">Carregando corridas…</div>';
      try {
        const r = await get(`/financeiro/motoboy/${m.motoboy_id}/corridas?de=${periodo.de}&ate=${periodo.ate}`);
        renderCorridas(detalhe, r.corridas, 'motoboy');
      } catch (e) { detalhe.innerHTML = `<div style="padding:10px;color:var(--lx-erro);font-size:12.5px">${e.message || 'Erro'}</div>`; }
    }
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
      ? (c.motoboy_nome ? `${c.motoboy_nome}${c.motoboy_codigo ? ' #' + String(c.motoboy_codigo).padStart(3, '0') : ''}` : '—')
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
