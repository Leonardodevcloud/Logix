// Saúde do sistema — exclusivo do Super Admin (plataforma).
// Réplicas, latência, GPS, banco, arquivos e erros. Fonte: GET /saude/resumo
// (amostras por minuto de cada réplica + consultas ao banco). Auto-atualiza a cada 30 s.
import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';

const PERIODOS = [['1h', '1 h'], ['6h', '6 h'], ['24h', '24 h'], ['7d', '7 dias']];
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const ms = (n) => (n >= 1000 ? (n / 1000).toFixed(2).replace('.', ',') + ' s' : Math.round(n) + ' ms');
const bytes = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : Math.round(b / 1024) + ' KB');
const dur = (s) => { s = Number(s || 0); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const hm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const ICO = {
  req: '<path d="M4 12h4l3-7 4 14 3-7h2"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alerta: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  pino: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  externo: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
};
const svg = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg>`;

const CSS = `
#lx-saude .strip{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
#lx-saude .st{display:flex;align-items:center;gap:12px;padding:12px 14px}
#lx-saude .st .dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--lx-ok);box-shadow:0 0 0 4px var(--lx-ok-bg)}
#lx-saude .st.warn .dot{background:var(--lx-atencao);box-shadow:0 0 0 4px var(--lx-atencao-bg)}
#lx-saude .st.err .dot{background:var(--lx-erro);box-shadow:0 0 0 4px var(--lx-erro-bg)}
#lx-saude .st.off .dot{background:var(--lx-tinta-3);box-shadow:0 0 0 4px var(--lx-superficie-2)}
#lx-saude .st .t{font-size:12px;color:var(--lx-tinta-2);font-weight:600}#lx-saude .st .v{font-size:13.5px;font-weight:800;margin-top:2px}
#lx-saude .k-delta{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:var(--lx-raio-pill)}
#lx-saude .up{background:var(--lx-ok-bg);color:var(--lx-ok)}#lx-saude .down{background:var(--lx-erro-bg);color:var(--lx-erro)}#lx-saude .flat{background:var(--lx-superficie-2);color:var(--lx-tinta-2)}
#lx-saude .seg{display:inline-flex;border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);overflow:hidden}
#lx-saude .seg button{border:0;background:var(--lx-superficie);padding:6px 12px;font:inherit;font-size:12px;font-weight:600;color:var(--lx-tinta-2);cursor:pointer}
#lx-saude .seg button.on{background:var(--lx-azul-primario);color:#fff}
#lx-saude .grid2{display:grid;grid-template-columns:3fr 2fr;gap:18px}#lx-saude .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
#lx-saude .hd{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--lx-linha)}
#lx-saude .hd h3{margin:0;font-size:13px;font-weight:700}#lx-saude .bd{padding:16px 18px}
#lx-saude .muted{color:var(--lx-tinta-3);font-size:12px}
#lx-saude .leg{display:flex;gap:16px;font-size:11.5px;color:var(--lx-tinta-2);font-weight:600}#lx-saude .leg i{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
#lx-saude .bar{display:grid;grid-template-columns:190px 1fr 70px;align-items:center;gap:12px;font-size:12.5px;padding:6px 0}
#lx-saude .bar .r{color:var(--lx-tinta-2);font-family:ui-monospace,Menlo,monospace;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lx-saude .bar .tr{height:8px;background:var(--lx-superficie-2);border-radius:4px;overflow:hidden}#lx-saude .bar .tr i{display:block;height:100%;background:var(--lx-azul-vivo);border-radius:4px}
#lx-saude .bar .tr i.slow{background:var(--lx-atencao)}#lx-saude .bar .n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
#lx-saude .kv{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px dashed var(--lx-linha);font-size:13px}#lx-saude .kv:last-child{border-bottom:0}#lx-saude .kv b{font-weight:800;font-variant-numeric:tabular-nums}
#lx-saude .tag{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:var(--lx-raio-pill);font-size:11px;font-weight:700}
#lx-saude .tag.ok{background:var(--lx-ok-bg);color:var(--lx-ok)}#lx-saude .tag.warn{background:var(--lx-atencao-bg);color:var(--lx-atencao)}#lx-saude .tag.err{background:var(--lx-erro-bg);color:var(--lx-erro)}#lx-saude .tag.info{background:var(--lx-info-bg);color:var(--lx-info)}
#lx-saude .gauge{height:8px;background:var(--lx-superficie-2);border-radius:4px;overflow:hidden;margin:-2px 0 8px}#lx-saude .gauge i{display:block;height:100%;background:var(--lx-azul-primario);border-radius:4px}
#lx-saude table{width:100%;border-collapse:collapse}
#lx-saude th{padding:11px 16px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3);background:var(--lx-superficie-2);text-align:left;font-weight:700}
#lx-saude td{padding:11px 16px;border-top:1px solid var(--lx-linha);font-size:13px;vertical-align:middle}
#lx-saude .mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--lx-tinta-2)}
@media (max-width:1200px){#lx-saude .strip{grid-template-columns:repeat(3,1fr)}#lx-saude .grid2,#lx-saude .grid3{grid-template-columns:1fr}}
`;

export async function montar(container) {
  const estado = { periodo: '6h', dados: null, timer: null, atualizadoEm: null };
  const wrap = el('div', { id: 'lx-saude', style: 'display:flex;flex-direction:column;gap:18px' });
  if (!document.getElementById('lx-saude-css')) document.head.append(el('style', { id: 'lx-saude-css', html: CSS }));

  const seg = el('div', { class: 'seg' });
  const pill = el('span', { class: 'lx-role-pill', style: 'margin-left:0' }, 'Carregando');
  const cabecalhoExtra = el('div', { style: 'display:flex;align-items:center;gap:14px' }, seg, pill);
  container.append(casca('Saúde do sistema', wrap, 'Réplicas, latência, GPS, banco e arquivos — ao vivo'));
  // Coloca o seletor de período + "atualizado há" na topbar (ao lado do título).
  const topbar = container.querySelector('.lx-topbar');
  if (topbar) topbar.insertBefore(cabecalhoExtra, topbar.querySelector('.lx-role-pill'));

  function renderSeg() {
    seg.innerHTML = '';
    PERIODOS.forEach(([k, r]) => seg.append(el('button', { class: k === estado.periodo ? 'on' : '', onClick: () => { estado.periodo = k; carregar(); } }, r)));
  }

  async function carregar(silencioso = false) {
    if (!silencioso) wrap.innerHTML = '<div style="padding:48px;text-align:center;color:var(--lx-tinta-3)">Carregando</div>';
    try {
      estado.dados = await get('/saude/resumo?periodo=' + estado.periodo);
      estado.atualizadoEm = Date.now();
      render();
    } catch (e) {
      wrap.innerHTML = `<div style="padding:24px;color:var(--lx-erro)">Erro ao carregar: ${String(e.message).replace(/</g, '&lt;')}</div>`;
    }
  }

  function tickPill() {
    if (!estado.atualizadoEm) return;
    const s = Math.round((Date.now() - estado.atualizadoEm) / 1000);
    pill.textContent = s < 5 ? 'Atualizado agora' : `Atualizado há ${s} s`;
  }

  function card(titulo, direita, corpo) {
    return el('div', { class: 'lx-card' }, el('div', { class: 'hd' }, el('h3', {}, titulo), direita || ''), corpo);
  }

  function render() {
    const d = estado.dados; const S = d.status, K = d.kpis;
    renderSeg();
    wrap.innerHTML = '';

    // ── Faixa de status
    const st = (cls, t, v) => el('div', { class: `lx-card st ${cls}` }, el('span', { class: 'dot' }), el('div', {}, el('div', { class: 't' }, t), el('div', { class: 'v' }, v)));
    const pool = S.banco.pool || {};
    wrap.append(el('div', { class: 'strip' },
      st(S.api.replicas ? 'ok' : 'err', 'API', S.api.replicas ? `${S.api.replicas} réplica${S.api.replicas > 1 ? 's' : ''} ativa${S.api.replicas > 1 ? 's' : ''}` : 'sem amostras'),
      st(pool.aguardando > 0 ? 'warn' : 'ok', 'Postgres', `pool ${pool.total}/${pool.max}${pool.aguardando ? ` · ${pool.aguardando} esperando` : ''}`),
      st(!S.redis.configurado ? 'off' : S.redis.conectado ? 'ok' : 'err', 'Redis', !S.redis.configurado ? 'não configurado (1 réplica)' : S.redis.conectado ? (S.redis.pubsub ? 'conectado · pub/sub' : 'conectado') : 'desconectado'),
      st(S.storage.configurado ? 'ok' : 'err', 'Storage', S.storage.configurado ? 'configurado' : 'NÃO configurado'),
      st(!S.rls.ativo ? 'off' : S.rls.efetivo ? 'ok' : 'err', 'Isolamento (RLS)', !S.rls.ativo ? 'desligado' : S.rls.efetivo ? 'efetivo' : 'ATIVO MAS INEFETIVO'),
      st(S.erros_hora > 0 ? 'warn' : 'ok', 'Erros 5xx (1 h)', S.erros_hora ? `${S.erros_hora} na última hora` : 'nenhum'),
    ));

    // ── KPIs
    const delta = (v, inv) => v == null ? el('span', { class: 'k-delta flat' }, 'sem base') : el('span', { class: 'k-delta ' + (v === 0 ? 'flat' : ((v > 0) !== !!inv ? 'up' : 'down')) }, `${v > 0 ? '+' : ''}${v}% vs período anterior`);
    const kpi = (ico, valor, rotulo, direita, cor) => el('div', { class: 'lx-card lx-kpi' },
      el('div', { class: 'k-top' }, el('div', { class: 'k-ico', style: cor || '', html: svg(ico) }), direita),
      el('div', { class: 'k-val', html: valor }), el('div', { class: 'k-lbl' }, rotulo));
    const errDelta = K.err_pct_ant == null ? null : Math.round((K.err_pct - K.err_pct_ant) * 100) / 100;
    wrap.append(el('div', { class: 'lx-grid-kpi' },
      kpi('req', num(K.req_min), 'Requisições / min', delta(K.req_delta_pct)),
      kpi('relogio', `${num(K.p95_ms)} <span style="font-size:16px;color:var(--lx-tinta-3)">ms</span>`, 'Latência p95', el('span', { class: 'k-delta ' + (K.p95_ms > 1000 ? 'down' : 'flat') }, K.p95_ms > 1000 ? 'acima de 1 s' : 'ok')),
      kpi('alerta', `${String(K.err_pct).replace('.', ',')}<span style="font-size:16px;color:var(--lx-tinta-3)">%</span>`, `Erros 5xx · ${num(K.err_total)} no período`,
        errDelta == null ? el('span', { class: 'k-delta flat' }, 'sem base') : el('span', { class: 'k-delta ' + (errDelta <= 0 ? 'up' : 'down') }, `${errDelta > 0 ? '+' : ''}${String(errDelta).replace('.', ',')} p.p.`),
        'background:var(--lx-erro-bg);color:var(--lx-erro)'),
      kpi('pino', num(K.gps_min), `Pontos GPS / min · ${K.ws_motoboys} motoboys conectados`, el('span', { class: 'k-delta ' + (K.gps_lote_pct >= 50 ? 'up' : 'flat') }, `${K.gps_lote_pct}% em lote`), 'background:var(--lx-ok-bg);color:var(--lx-ok)'),
    ));

    // ── Gráfico + rotas
    wrap.append(el('div', { class: 'grid2' },
      card('Requisições e erros', el('div', { class: 'leg' }, el('span', { html: '<i style="background:var(--lx-azul-vivo)"></i>Requisições/min' }), el('span', { html: '<i style="background:var(--lx-erro)"></i>Erros 5xx' })),
        el('div', { class: 'bd' }, grafico(d.serie, d.bucket_min))),
      card('Latência p95 por rota', el('span', { class: 'muted' }, `top ${d.rotas.length} · ${PERIODOS.find((p) => p[0] === d.periodo)[1]}`),
        el('div', { class: 'bd' },
          ...(d.rotas.length ? d.rotas.map((r) => { const max = d.rotas[0].p95_ms || 1; return el('div', { class: 'bar' },
            el('span', { class: 'r', title: `${r.rota} · ${num(r.n)} req · ${num(r.err)} erros` }, r.rota.replace('/api/v1', '')),
            el('div', { class: 'tr' }, el('i', { class: r.p95_ms > 1000 ? 'slow' : '', style: `width:${Math.max(2, Math.round(100 * r.p95_ms / max))}%` })),
            el('span', { class: 'n' }, ms(r.p95_ms))); }) : [el('div', { class: 'muted' }, 'Sem tráfego suficiente no período.')]),
          el('div', { class: 'muted', style: 'margin-top:10px' }, 'Laranja: acima de 1 s. Mediana dos p95 por minuto.'))),
    ));

    // ── Tempo real / Banco / Arquivos
    const kv = (a, b) => el('div', { class: 'kv' }, el('span', {}, a), el('b', {}, b));
    const T = d.tempo_real, B = d.banco, A = d.arquivos;
    const upTotal = A.up_direto + A.up_legado; const pctDireto = upTotal ? Math.round(100 * A.up_direto / upTotal) : 100;
    wrap.append(el('div', { class: 'grid3' },
      card('Tempo real', el('span', { class: 'tag ' + (S.redis.pubsub ? 'ok' : 'info') }, S.redis.pubsub ? 'pub/sub ativo' : 'entrega local'), el('div', { class: 'bd' },
        kv('Motoboys conectados (WS)', num(K.ws_motoboys)), kv('Painéis conectados (WS)', num(K.ws_painel)),
        kv('Ofertas aguardando aceite', num(T.ofertas_abertas)), kv('Oferta mais antiga esperando', T.oferta_mais_antiga_s != null ? dur(T.oferta_mais_antiga_s) : '—'))),
      card('Banco de dados', el('span', { class: 'tag info' }, `${B.migrations_aplicadas ?? '?'} migrations`), el('div', { class: 'bd' },
        kv('Pool de conexões', `${B.pool.total} / ${B.pool.max}`), el('div', { class: 'gauge' }, el('i', { style: `width:${Math.round(100 * B.pool.total / B.pool.max)}%` })),
        kv('Requisições esperando conexão', num(B.pool.aguardando)),
        kv('Partições de GPS', el('span', {}, `${num(B.particoes_gps)} `, el('span', { class: 'muted' }, `· retenção ${B.retencao_gps_dias} d`))),
        kv('Histórico GPS', `${num(B.gps_pontos)} pontos · ${bytes(B.gps_bytes)}`))),
      card('Arquivos', el('span', { class: 'tag ' + (A.up_legado ? 'warn' : 'ok') }, A.up_legado ? 'base64 ainda em uso' : 'direto ao storage'), el('div', { class: 'bd' },
        kv('Uploads no período', num(upTotal)), kv('Direto ao R2 (URL assinada)', `${pctDireto}%`), el('div', { class: 'gauge' }, el('i', { style: `width:${pctDireto}%;background:var(--lx-ok)` })),
        kv('Ainda em base64 (clientes antigos)', el('span', {}, `${num(A.up_legado)} `, upTotal ? el('span', { class: 'tag ' + (A.up_legado ? 'warn' : 'ok') }, `${100 - pctDireto}%`) : '')),
        kv('Fotos legadas no banco', el('span', {}, `${num(A.fotos_legadas)} `, el('span', { class: 'muted' }, `· ${bytes(A.fotos_legadas_bytes)}`))),
        el('div', { class: 'muted', style: 'margin-top:8px' }, A.fotos_legadas ? 'Rode npm run fotos:migrar para mover ao storage.' : 'Quando base64 ficar em 0 por 7 dias, o suporte pode ser removido.'))),
    ));

    // ── Réplicas
    const tabela = (cols, linhas, vazio) => el('table', {}, el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', {}, c)))),
      el('tbody', {}, ...(linhas.length ? linhas : [el('tr', {}, el('td', { colspan: cols.length, class: 'muted', style: 'text-align:center;padding:22px' }, vazio))])));
    wrap.append(card('Réplicas da API', el('span', { class: 'muted' }, 'cada linha é um processo; o Railway distribui o tráfego'),
      tabela(['Instância', 'Versão', 'Uptime', 'Memória', 'Event-loop p99', 'WS', 'Req/min', 'Estado'],
        d.replicas.map((r) => { const lenta = r.el_p99_ms > 200 || r.mem_rss_mb > 900; return el('tr', {},
          el('td', { class: 'mono' }, r.instancia), el('td', {}, `${r.versao || S.versao}${r.commit ? ' · ' + r.commit : ''}`), el('td', {}, dur(r.uptime_s)),
          el('td', {}, `${num(r.mem_rss_mb)} MB`), el('td', {}, `${num(r.el_p99_ms)} ms`), el('td', {}, num(r.ws)), el('td', {}, num(r.req_min)),
          el('td', {}, el('span', { class: 'tag ' + (lenta ? 'warn' : 'ok') }, lenta ? 'atenção' : 'saudável'))); }), 'Nenhuma réplica enviou amostra nos últimos 2 minutos.')));

    // ── Erros
    const btnSentry = S.sentry ? el('a', { class: 'lx-btn lx-btn-secundario', href: 'https://sentry.io', target: '_blank', rel: 'noopener', html: svg('externo', 14) + ' Abrir no Sentry' }) : el('span', { class: 'muted' }, 'Sentry não configurado');
    wrap.append(card('Últimos erros (5xx)', btnSentry,
      tabela(['Quando', 'Rota', 'Código', 'Empresa', 'reqId', 'Mensagem'],
        d.erros.map((e) => el('tr', {}, el('td', {}, hora(e.em)), el('td', { class: 'mono' }, (e.rota || '').replace('/api/v1', '')), el('td', {}, el('span', { class: 'tag err' }, e.status)),
          el('td', {}, e.empresa || '—'), el('td', { class: 'mono', title: e.reqId || '' }, e.reqId ? e.reqId.slice(0, 8) + '…' + e.reqId.slice(-4) : '—'), el('td', {}, e.mensagem || ''))), 'Nenhum erro 5xx registrado nos últimos 7 dias.')));
  }

  // Gráfico SVG: área de requisições/min + linha de erros. Sem dependência externa.
  function grafico(serie, bucketMin) {
    if (!serie || serie.length < 2) return el('div', { class: 'muted', style: 'padding:40px;text-align:center' }, 'Aguardando amostras (1 por minuto por réplica).');
    const W = 720, H = 200, L = 44, R = 8, T = 12, Bm = 26;
    const reqMin = serie.map((p) => p.req / bucketMin), erros = serie.map((p) => p.err);
    const maxR = Math.max(10, ...reqMin), maxE = Math.max(1, ...erros);
    const x = (i) => L + (i * (W - L - R)) / (serie.length - 1);
    const yR = (v) => T + (H - T - Bm) * (1 - v / maxR), yE = (v) => T + (H - T - Bm) * (1 - v / maxE);
    const linha = serie.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yR(reqMin[i]).toFixed(1)}`).join(' ');
    const area = `${linha} L${x(serie.length - 1).toFixed(1)} ${H - Bm} L${L} ${H - Bm} Z`;
    const linhaE = serie.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yE(erros[i]).toFixed(1)}`).join(' ');
    const grade = [0, .25, .5, .75, 1].map((f) => { const y = T + (H - T - Bm) * f; return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--lx-linha)"/><text x="4" y="${y + 4}" fill="var(--lx-tinta-3)" font-size="10">${Math.round(maxR * (1 - f))}</text>`; }).join('');
    const nRot = Math.min(6, serie.length); const passo = Math.max(1, Math.floor((serie.length - 1) / (nRot - 1)));
    const rotulos = serie.map((p, i) => (i % passo === 0 || i === serie.length - 1) ? `<text x="${x(i)}" y="${H - 6}" fill="var(--lx-tinta-3)" font-size="10" text-anchor="middle">${hm(p.t)}</text>` : '').join('');
    const pontosE = serie.map((p, i) => p.err ? `<circle cx="${x(i)}" cy="${yE(p.err)}" r="3.5" fill="var(--lx-erro)"><title>${p.err} erro(s) às ${hm(p.t)}</title></circle>` : '').join('');
    return el('div', { html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;font-family:inherit">
      <defs><linearGradient id="lx-saude-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#378ADD" stop-opacity=".28"/><stop offset="1" stop-color="#378ADD" stop-opacity="0"/></linearGradient></defs>
      ${grade}${rotulos}
      <path d="${area}" fill="url(#lx-saude-g)"/>
      <path d="${linha}" fill="none" stroke="var(--lx-azul-vivo)" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="${linhaE}" fill="none" stroke="var(--lx-erro)" stroke-width="2" stroke-linejoin="round"/>${pontosE}
    </svg>` });
  }

  await carregar();
  estado.timer = setInterval(() => { if (!document.getElementById('lx-saude')) { clearInterval(estado.timer); return; } tickPill(); }, 1000);
  const auto = setInterval(() => { if (!document.getElementById('lx-saude')) { clearInterval(auto); return; } carregar(true); }, 30_000);
}
