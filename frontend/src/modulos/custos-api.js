// Custos de API — exclusivo do Super Admin (Logix master).
// Mostra uso das APIs externas (ORS + Google geocoding) por cliente, com
// reaproveitamento de cache e custo estimado (preço por 1.000, editável).
import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, put } from '../core/api.js';

const PROV = { ors: 'ORS', google: 'Google' };
const OPS = { geocoding: 'Geocoding', optimization: 'Otimização', directions: 'Direções' };
const PRESETS = [['hoje', 'Hoje'], ['7dias', '7 dias'], ['30dias', '30 dias'], ['mes', 'Este mês']];
// Colunas fixas da tabela por cliente (provedor:operação)
const COLS = [
  ['ors', 'geocoding', 'ORS geocode'],
  ['ors', 'optimization', 'ORS otim.'],
  ['ors', 'directions', 'ORS direções'],
  ['google', 'geocoding', 'Google geo'],
];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

export async function montar(container) {
  const estado = { preset: '7dias', dados: null, precos: [] };
  const wrap = el('div');
  container.append(casca('Custos de API', wrap, 'Uso das APIs externas por cliente — visível só para o admin Logix'));

  const precoDe = (prov, op) => {
    const p = estado.precos.find((x) => x.provedor === prov && x.operacao === op);
    return p ? Number(p.preco_por_mil) : 0;
  };
  const custoDe = (real, prov, op) => (Number(real || 0) / 1000) * precoDe(prov, op);

  async function carregar() {
    wrap.innerHTML = '<div style="padding:48px;text-align:center;color:var(--lx-tinta-3,#8AA2BE)">Carregando…</div>';
    try {
      const d = await get('/api-uso/resumo?preset=' + encodeURIComponent(estado.preset));
      estado.dados = d;
      estado.precos = d.precos || [];
      render();
    } catch (e) {
      wrap.innerHTML = '<div style="padding:24px;color:var(--lx-erro,#dc2626)">Erro ao carregar: ' + esc(e.message) + '</div>';
    }
  }

  function render() {
    const d = estado.dados;
    const porOp = d.porOperacao || [];
    const porCli = d.porCliente || [];

    const totalReal = porOp.reduce((s, r) => s + Number(r.chamadas), 0);
    const totalCache = porOp.reduce((s, r) => s + Number(r.cache), 0);
    const orsReal = porOp.filter((r) => r.provedor === 'ors').reduce((s, r) => s + Number(r.chamadas), 0);
    const gReal = porOp.filter((r) => r.provedor === 'google').reduce((s, r) => s + Number(r.chamadas), 0);
    const custoTotal = porOp.reduce((s, r) => s + custoDe(r.chamadas, r.provedor, r.operacao), 0);
    const taxaCache = totalReal + totalCache ? Math.round((totalCache / (totalReal + totalCache)) * 100) : 0;

    // Pivot por cliente
    const mapa = new Map();
    porCli.forEach((r) => {
      if (!mapa.has(r.empresa_id)) mapa.set(r.empresa_id, { nome: r.nome, cells: {}, cache: 0, real: 0, custo: 0 });
      const o = mapa.get(r.empresa_id);
      o.cells[r.provedor + ':' + r.operacao] = Number(r.chamadas);
      o.cache += Number(r.cache);
      o.real += Number(r.chamadas);
      o.custo += custoDe(r.chamadas, r.provedor, r.operacao);
    });
    const clientes = [...mapa.values()].sort((a, b) => b.custo - a.custo);
    const maxCusto = Math.max(1, ...clientes.map((c) => c.custo));

    const seg = PRESETS.map(([v, l]) =>
      `<button data-preset="${v}" style="border:0;background:${v === estado.preset ? 'var(--lx-azul-primario,#185FA5)' : 'none'};color:${v === estado.preset ? '#fff' : 'var(--lx-tinta-2,#5c7189)'};font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:7px;cursor:pointer">${l}</button>`
    ).join('');

    const kpi = (n, l, sub, bg, cor, ic) =>
      `<div class="lx-card" style="padding:16px 18px">
        <div style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;margin-bottom:10px;background:${bg};color:${cor}">${ic}</div>
        <div style="font-size:26px;font-weight:900;line-height:1;color:var(--lx-navy,#042C53)">${n}</div>
        <div style="font-size:12px;color:var(--lx-tinta-2,#5c7189);margin-top:4px">${l}</div>
        <div style="font-size:11px;color:var(--lx-tinta-3,#8AA2BE);margin-top:2px">${sub}</div>
      </div>`;

    const linhasProv = porOp.length ? porOp.map((r) => {
      const total = Number(r.chamadas) + Number(r.cache);
      const taxa = total ? Math.round((Number(r.cache) / total) * 100) : 0;
      return `<tr>
        <td style="text-align:left"><b>${PROV[r.provedor] || r.provedor}</b> · ${OPS[r.operacao] || r.operacao}</td>
        <td>${num(r.chamadas)}</td>
        <td style="color:var(--lx-ok,#1D9E75)">${num(r.cache)} <span style="color:var(--lx-tinta-3,#8AA2BE);font-size:11px">(${taxa}%)</span></td>
        <td><input data-prov="${r.provedor}" data-op="${r.operacao}" value="${String(precoDe(r.provedor, r.operacao)).replace('.', ',')}" style="width:70px;border:1px solid var(--lx-linha,#e6edf5);border-radius:7px;padding:5px 8px;font:inherit;font-size:12.5px;text-align:right"></td>
        <td><b>${money(custoDe(r.chamadas, r.provedor, r.operacao))}</b></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--lx-tinta-3,#8AA2BE);padding:24px">Sem uso registrado no período.</td></tr>';

    const linhasCli = clientes.length ? clientes.map((c) => {
      const cels = COLS.map(([p, o]) => `<td>${num(c.cells[p + ':' + o] || 0)}</td>`).join('');
      return `<tr>
        <td style="text-align:left"><b style="color:var(--lx-navy,#042C53)">${esc(c.nome)}</b></td>
        ${cels}
        <td style="color:var(--lx-ok,#1D9E75)">${num(c.cache)}</td>
        <td><b>${num(c.real)}</b></td>
        <td><b>${money(c.custo)}</b></td>
      </tr>`;
    }).join('') : '<tr><td colspan="' + (COLS.length + 4) + '" style="text-align:center;color:var(--lx-tinta-3,#8AA2BE);padding:24px">Sem uso por cliente no período.</td></tr>';

    const topCli = clientes.slice(0, 5).map((c) =>
      `<div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;font-size:13px"><b>${esc(c.nome)}</b><span style="color:var(--lx-tinta-2,#5c7189)">${money(c.custo)}</span></div>
        <div style="height:8px;border-radius:5px;background:var(--lx-superficie-2,#F4F8FD);overflow:hidden;margin-top:5px"><span style="display:block;height:100%;border-radius:5px;background:var(--lx-azul-primario,#185FA5);width:${Math.round((c.custo / maxCusto) * 100)}%"></span></div>
      </div>`
    ).join('') || '<div style="color:var(--lx-tinta-3,#8AA2BE);font-size:13px">Sem dados.</div>';

    wrap.innerHTML = `
      <div style="display:inline-flex;background:#fff;border:1px solid var(--lx-linha,#e6edf5);border-radius:10px;padding:4px;gap:3px;margin-bottom:16px">${seg}</div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px">
        ${kpi(num(totalReal), 'Chamadas reais no período', 'todos os provedores', 'var(--lx-info-bg,#E4EEF9)', 'var(--lx-azul-primario,#185FA5)', svgLinhas())}
        ${kpi(num(totalCache) + ' <span style=\'font-size:14px;color:var(--lx-tinta-3,#8AA2BE);font-weight:700\'>(' + taxaCache + '%)</span>', 'Servidas do cache', 'economia — custo zero', '#E7F6EF', 'var(--lx-ok,#1D9E75)', svgRaio())}
        ${kpi(num(orsReal) + ' <span style=\'font-size:13px;color:var(--lx-tinta-3,#8AA2BE);font-weight:700\'>ORS</span> · ' + num(gReal) + ' <span style=\'font-size:13px;color:var(--lx-tinta-3,#8AA2BE);font-weight:700\'>Google</span>', 'Por provedor', 'chamadas reais', '#FDF0DE', 'var(--lx-alerta,#BA7517)', svgApi())}
        ${kpi(money(custoTotal), 'Custo estimado', 'no período', '#EAF2FC', 'var(--lx-navy,#042C53)', svgMoeda())}
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;margin-bottom:16px">
        <div class="lx-card" style="overflow:hidden">
          <div style="padding:14px 18px;border-bottom:1px solid var(--lx-linha,#e6edf5);display:flex;align-items:center;justify-content:space-between">
            <b style="font-size:14px">Por provedor / operação</b>
            <button id="lx-salvar-precos" style="border:0;background:var(--lx-azul-primario,#185FA5);color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer">Salvar preços</button>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr>
              <th style="text-align:left;padding:9px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Provedor / operação</th>
              <th style="text-align:right;padding:9px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Reais</th>
              <th style="text-align:right;padding:9px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Cache</th>
              <th style="text-align:right;padding:9px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">R$/1.000</th>
              <th style="text-align:right;padding:9px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Custo est.</th>
            </tr></thead>
            <tbody style="text-align:right">${linhasProv}</tbody>
          </table>
          <div style="padding:11px 18px;font-size:11.5px;color:var(--lx-tinta-3,#8AA2BE);line-height:1.5">Cache tem custo zero. Preços são por 1.000 chamadas reais — ajuste e clique em “Salvar preços”.</div>
        </div>

        <div class="lx-card" style="overflow:hidden">
          <div style="padding:14px 18px;border-bottom:1px solid var(--lx-linha,#e6edf5)"><b style="font-size:14px">Top clientes por custo</b></div>
          <div style="padding:14px 18px">${topCli}</div>
        </div>
      </div>

      <div class="lx-card" style="overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid var(--lx-linha,#e6edf5)"><b style="font-size:14px">Detalhe por cliente</b></div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:right">
          <thead><tr>
            <th style="text-align:left;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Cliente</th>
            ${COLS.map(([, , l]) => `<th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">${l}</th>`).join('')}
            <th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Cache</th>
            <th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Total</th>
            <th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)">Custo est.</th>
          </tr></thead>
          <tbody>${linhasCli}</tbody>
        </table>
        <div style="padding:11px 18px;font-size:11.5px;color:var(--lx-tinta-3,#8AA2BE);line-height:1.5">ORS é medido com exatidão no servidor. Google Maps (tiles do painel) roda no navegador e não entra aqui; o que aparece de Google é o <b>geocoding</b> do painel. “Sistema / sem cliente” = chamadas fora de um contexto de cliente.</div>
      </div>`;

    // Eventos: filtro de período
    wrap.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      estado.preset = b.getAttribute('data-preset');
      carregar();
    }));
    // Salvar preços
    const btn = wrap.querySelector('#lx-salvar-precos');
    if (btn) btn.addEventListener('click', async () => {
      const lista = [...wrap.querySelectorAll('input[data-prov]')].map((i) => ({
        provedor: i.getAttribute('data-prov'),
        operacao: i.getAttribute('data-op'),
        preco_por_mil: Number(String(i.value).replace(',', '.')) || 0,
      }));
      btn.textContent = 'Salvando…'; btn.disabled = true;
      try { await put('/api-uso/precos', lista); await carregar(); }
      catch (e) { btn.textContent = 'Erro'; btn.disabled = false; }
    });
  }

  await carregar();
}

// ─── ícones (SVG stroke, currentColor) ───
function svgLinhas() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>'; }
function svgRaio() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>'; }
function svgApi() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8 0h3a2 2 0 002-2v-3m0-8V5a2 2 0 00-2-2h-3"/><circle cx="12" cy="12" r="2.5"/></svg>'; }
function svgMoeda() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'; }
