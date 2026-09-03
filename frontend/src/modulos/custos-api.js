// Custos de API — exclusivo do Super Admin (Logix master).
// Uso das APIs externas (ORS + Google geocoding) por cliente, com cache
// reaproveitado e custo estimado da fatura do mês (desconta franquia, ignora cache).
import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, put } from '../core/api.js';

const PROV = { ors: 'ORS', google: 'Google' };
const OPS = { geocoding: 'Geocoding', optimization: 'Otimização', directions: 'Direções' };
const PRESETS = [['hoje', 'Hoje'], ['7dias', '7 dias'], ['30dias', '30 dias'], ['mes', 'Este mês']];
// Catálogo fixo: sempre mostra estas operações, mesmo com uso zero.
const CATALOGO = [['ors', 'geocoding'], ['ors', 'optimization'], ['ors', 'directions'], ['google', 'geocoding']];
const COLS = [
  ['ors', 'geocoding', 'ORS geocode'],
  ['ors', 'optimization', 'ORS otim.'],
  ['ors', 'directions', 'ORS direções'],
  ['google', 'geocoding', 'Google geo'],
];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const TH = 'padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3,#8AA2BE);background:var(--lx-superficie-2,#F4F8FD)';
const INP = 'width:84px;border:1px solid var(--lx-linha,#e6edf5);border-radius:7px;padding:6px 9px;font:inherit;font-size:12.5px;text-align:right';

export async function montar(container) {
  const estado = { preset: '7dias', dados: null, precos: [] };
  const wrap = el('div');
  wrap.id = 'lx-custos';
  container.append(casca('Custos de API', wrap, 'Uso das APIs externas por cliente'));

  const precoDe = (p, o) => { const x = estado.precos.find((r) => r.provedor === p && r.operacao === o); return x ? Number(x.preco_por_mil) : 0; };
  const franquiaDe = (p, o) => { const x = estado.precos.find((r) => r.provedor === p && r.operacao === o); return x ? Number(x.franquia_gratis || 0) : 0; };

  async function carregar() {
    wrap.innerHTML = '<div style="padding:48px;text-align:center;color:var(--lx-tinta-3,#8AA2BE)">Carregando</div>';
    try {
      const d = await get('/api-uso/resumo?preset=' + encodeURIComponent(estado.preset));
      estado.dados = d; estado.precos = d.precos || [];
      render();
    } catch (e) {
      wrap.innerHTML = '<div style="padding:24px;color:var(--lx-erro,#dc2626)">Erro ao carregar: ' + esc(e.message) + '</div>';
    }
  }

  function render() {
    const d = estado.dados;
    const porOp = d.porOperacao || [];
    const porCli = d.porCliente || [];
    const mesAtual = d.mesAtual || [];

    const usoDe = (p, o) => porOp.find((r) => r.provedor === p && r.operacao === o) || { chamadas: 0, cache: 0 };
    const realMesDe = (p, o) => { const r = mesAtual.find((x) => x.provedor === p && x.operacao === o); return r ? Number(r.chamadas) : 0; };
    const custoMes = (p, o) => (Math.max(0, realMesDe(p, o) - franquiaDe(p, o)) / 1000) * precoDe(p, o);
    const custoBrutoPeriodo = (real, p, o) => (Number(real || 0) / 1000) * precoDe(p, o);

    // Lista de operações = catálogo fixo + qualquer operação observada fora dele.
    const ops = CATALOGO.map((x) => x.slice());
    porOp.forEach((r) => { if (!ops.some(([p, o]) => p === r.provedor && o === r.operacao)) ops.push([r.provedor, r.operacao]); });

    const totalReal = porOp.reduce((s, r) => s + Number(r.chamadas), 0);
    const totalCache = porOp.reduce((s, r) => s + Number(r.cache), 0);
    const orsReal = porOp.filter((r) => r.provedor === 'ors').reduce((s, r) => s + Number(r.chamadas), 0);
    const gReal = porOp.filter((r) => r.provedor === 'google').reduce((s, r) => s + Number(r.chamadas), 0);
    const custoFatura = ops.reduce((s, [p, o]) => s + custoMes(p, o), 0);
    const taxaCache = totalReal + totalCache ? Math.round((totalCache / (totalReal + totalCache)) * 100) : 0;

    const mapa = new Map();
    porCli.forEach((r) => {
      if (!mapa.has(r.empresa_id)) mapa.set(r.empresa_id, { nome: r.nome, cells: {}, cache: 0, real: 0, custo: 0 });
      const o = mapa.get(r.empresa_id);
      o.cells[r.provedor + ':' + r.operacao] = Number(r.chamadas);
      o.cache += Number(r.cache); o.real += Number(r.chamadas);
      o.custo += custoBrutoPeriodo(r.chamadas, r.provedor, r.operacao);
    });
    const clientes = [...mapa.values()].sort((a, b) => b.custo - a.custo);
    const maxCusto = Math.max(1, ...clientes.map((c) => c.custo));

    const seg = PRESETS.map(([v, l]) =>
      `<button data-preset="${v}" style="border:0;background:${v === estado.preset ? 'var(--lx-azul-primario,#185FA5)' : 'none'};color:${v === estado.preset ? '#fff' : 'var(--lx-tinta-2,#5c7189)'};font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:7px;cursor:pointer">${l}</button>`).join('');

    const kpi = (n, l, sub, bg, cor, ic) =>
      `<div class="lx-card" style="padding:16px 18px">
        <div style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;margin-bottom:10px;background:${bg};color:${cor}">${ic}</div>
        <div style="font-size:26px;font-weight:900;line-height:1;color:var(--lx-navy,#042C53)">${n}</div>
        <div style="font-size:12px;color:var(--lx-tinta-2,#5c7189);margin-top:4px">${l}</div>
        <div style="font-size:11px;color:var(--lx-tinta-3,#8AA2BE);margin-top:2px">${sub}</div>
      </div>`;

    const linhasProv = ops.map(([p, o]) => {
      const u = usoDe(p, o);
      const total = Number(u.chamadas) + Number(u.cache);
      const taxa = total ? Math.round((Number(u.cache) / total) * 100) : 0;
      return `<tr>
        <td style="text-align:left"><b>${PROV[p] || p}</b> · ${OPS[o] || o}</td>
        <td>${num(u.chamadas)}</td>
        <td style="color:var(--lx-ok,#1D9E75)">${num(u.cache)} <span style="color:var(--lx-tinta-3,#8AA2BE);font-size:11px">(${taxa}%)</span></td>
        <td><input data-prov="${p}" data-op="${o}" data-campo="franq" value="${franquiaDe(p, o)}" style="${INP}"></td>
        <td><input data-prov="${p}" data-op="${o}" data-campo="preco" value="${String(precoDe(p, o)).replace('.', ',')}" style="${INP}"></td>
        <td><b>${money(custoMes(p, o))}</b></td>
      </tr>`;
    }).join('');

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
      </div>`).join('') || '<div style="color:var(--lx-tinta-3,#8AA2BE);font-size:13px">Sem dados.</div>';

    wrap.innerHTML = `
      <style>
        #lx-custos table{border-collapse:collapse;width:100%}
        #lx-custos td{padding:12px 16px;font-size:13px}
        #lx-custos tbody tr{border-top:1px solid var(--lx-linha,#e6edf5)}
        #lx-custos td:first-child,#lx-custos th:first-child{padding-left:18px}
        #lx-custos td:last-child,#lx-custos th:last-child{padding-right:20px}
      </style>

      <div style="display:inline-flex;background:#fff;border:1px solid var(--lx-linha,#e6edf5);border-radius:10px;padding:4px;gap:3px;margin-bottom:16px">${seg}</div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px">
        ${kpi(num(totalReal), 'Chamadas reais no período', 'todos os provedores', 'var(--lx-info-bg,#E4EEF9)', 'var(--lx-azul-primario,#185FA5)', svgLinhas())}
        ${kpi(num(totalCache) + ' <span style=\'font-size:14px;color:var(--lx-tinta-3,#8AA2BE);font-weight:700\'>(' + taxaCache + '%)</span>', 'Servidas do cache', 'economia, custo zero', '#E7F6EF', 'var(--lx-ok,#1D9E75)', svgRaio())}
        ${kpi(num(orsReal) + ' <span style=\'font-size:13px;color:var(--lx-tinta-3,#8AA2BE);font-weight:700\'>ORS</span> · ' + num(gReal) + ' <span style=\'font-size:13px;color:var(--lx-tinta-3,#8AA2BE);font-weight:700\'>Google</span>', 'Por provedor', 'chamadas reais no período', '#FDF0DE', 'var(--lx-alerta,#BA7517)', svgApi())}
        ${kpi(money(custoFatura), 'Custo estimado (mês atual)', 'franquia descontada, cache fora', '#EAF2FC', 'var(--lx-navy,#042C53)', svgMoeda())}
      </div>

      <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:14px;margin-bottom:16px">
        <div class="lx-card" style="overflow:hidden">
          <div style="padding:14px 18px;border-bottom:1px solid var(--lx-linha,#e6edf5);display:flex;align-items:center;justify-content:space-between">
            <b style="font-size:14px">Por provedor / operação</b>
            <button id="lx-salvar-precos" style="border:0;background:var(--lx-azul-primario,#185FA5);color:#fff;font:inherit;font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer">Salvar preços</button>
          </div>
          <table style="text-align:right">
            <thead><tr>
              <th style="text-align:left;${TH}">Provedor / operação</th>
              <th style="${TH}">Reais</th>
              <th style="${TH}">Cache</th>
              <th style="${TH}">Franquia/mês</th>
              <th style="${TH}">R$/1.000</th>
              <th style="${TH}">Custo mês</th>
            </tr></thead>
            <tbody>${linhasProv}</tbody>
          </table>
          <div style="padding:12px 18px;font-size:11.5px;color:var(--lx-tinta-3,#8AA2BE);line-height:1.55">O Custo mês usa as chamadas reais do mês corrente, desconta a franquia grátis e ignora o cache. As colunas Reais e Cache seguem o período selecionado.</div>
        </div>

        <div class="lx-card" style="overflow:hidden">
          <div style="padding:14px 18px;border-bottom:1px solid var(--lx-linha,#e6edf5)"><b style="font-size:14px">Top clientes por custo</b> <span style="font-size:11px;color:var(--lx-tinta-3,#8AA2BE)">(bruto, período)</span></div>
          <div style="padding:14px 18px">${topCli}</div>
        </div>
      </div>

      <div class="lx-card" style="overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid var(--lx-linha,#e6edf5)"><b style="font-size:14px">Detalhe por cliente</b></div>
        <table style="text-align:right">
          <thead><tr>
            <th style="text-align:left;${TH}">Cliente</th>
            ${COLS.map(([, , l]) => `<th style="${TH}">${l}</th>`).join('')}
            <th style="${TH}">Cache</th>
            <th style="${TH}">Total</th>
            <th style="${TH}">Custo bruto</th>
          </tr></thead>
          <tbody>${linhasCli}</tbody>
        </table>
        <div style="padding:12px 18px;font-size:11.5px;color:var(--lx-tinta-3,#8AA2BE);line-height:1.55">Custo por cliente é bruto (sem franquia). A franquia grátis é da conta inteira, então entra só no Custo estimado do mês.</div>
      </div>`;

    wrap.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { estado.preset = b.getAttribute('data-preset'); carregar(); }));

    const btn = wrap.querySelector('#lx-salvar-precos');
    if (btn) btn.addEventListener('click', async () => {
      const acc = {};
      wrap.querySelectorAll('input[data-prov]').forEach((i) => {
        const k = i.getAttribute('data-prov') + ':' + i.getAttribute('data-op');
        acc[k] = acc[k] || { provedor: i.getAttribute('data-prov'), operacao: i.getAttribute('data-op'), preco_por_mil: 0, franquia_gratis: 0 };
        if (i.getAttribute('data-campo') === 'preco') acc[k].preco_por_mil = Number(String(i.value).replace(',', '.')) || 0;
        else acc[k].franquia_gratis = Number(String(i.value).replace(/\D/g, '')) || 0;
      });
      btn.textContent = 'Salvando'; btn.disabled = true;
      try { await put('/api-uso/precos', Object.values(acc)); await carregar(); }
      catch (e) { btn.textContent = 'Erro'; btn.disabled = false; }
    });
  }

  await carregar();
}

function svgLinhas() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>'; }
function svgRaio() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>'; }
function svgApi() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8 0h3a2 2 0 002-2v-3m0-8V5a2 2 0 00-2-2h-3"/><circle cx="12" cy="12" r="2.5"/></svg>'; }
function svgMoeda() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'; }
