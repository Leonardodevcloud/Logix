import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import { aplicarBasemap } from '../core/mapa-tiles.js';
import * as auth from '../core/auth.js';

// Coordenadas reais (lat/lng) das principais cidades brasileiras
const CIDADES_COORDS = {
  'salvador':          [-12.9714, -38.5014],
  'feira de santana':  [-12.2664, -38.9663],
  'são paulo':         [-23.5505, -46.6333],
  'campinas':          [-22.9056, -47.0608],
  'rio de janeiro':    [-22.9068, -43.1729],
  'belo horizonte':    [-19.9167, -43.9345],
  'recife':            [-8.0578,  -34.8829],
  'fortaleza':         [-3.7172,  -38.5433],
  'manaus':            [-3.1019,  -60.0250],
  'belém':             [-1.4558,  -48.5044],
  'porto alegre':      [-30.0346, -51.2177],
  'curitiba':          [-25.4284, -49.2733],
  'florianópolis':     [-27.5954, -48.5480],
  'goiânia':           [-16.6869, -49.2648],
  'brasília':          [-15.7801, -47.9292],
  'natal':             [-5.7945,  -35.2110],
  'joão pessoa':       [-7.1195,  -34.8450],
  'maceió':            [-9.6658,  -35.7350],
  'aracaju':           [-10.9472, -37.0731],
  'teresina':          [-5.0920,  -42.8038],
  'são luís':          [-2.5297,  -44.3028],
  'palmas':            [-10.1837, -48.3336],
  'porto velho':       [-8.7612,  -63.9004],
  'rio branco':        [-9.9754,  -67.8249],
  'boa vista':         [2.8235,   -60.6758],
  'macapá':            [0.0349,   -51.0694],
  'campo grande':      [-20.4697, -54.6201],
  'cuiabá':            [-15.5989, -56.0949],
  'vitória':           [-20.3155, -40.3128],
  'camaçari':          [-12.6997, -38.3247],
  'lauro de freitas':  [-12.8975, -38.3303],
};

function coordsParaCliente(c) {
  const texto = (c.cidade || c.razao_social || c.nome_fantasia || '').toLowerCase();
  for (const [key, coords] of Object.entries(CIDADES_COORDS)) {
    if (texto.includes(key)) return coords;
  }
  // fallback: centro do Brasil com pequeno offset aleatório
  return [-14 + (Math.random() - 0.5) * 8, -50 + (Math.random() - 0.5) * 10];
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

const CORES_AV = [
  { bg: '#E6F1FB', cor: '#185FA5' },
  { bg: '#EEEDFE', cor: '#534AB7' },
  { bg: '#E1F5EE', cor: '#0F6E56' },
  { bg: '#FAEEDA', cor: '#854F0B' },
  { bg: '#FAECE7', cor: '#993C1D' },
  { bg: '#ede9fb', cor: '#6b4fc9' },
];

async function dashAdmin(content) {
  const countEl = el('div', { style: 'font-size:26px;font-weight:800;color:var(--lx-tinta);line-height:1' }, '…');
  const lblEl = el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:3px' }, 'clientes ativos');

  const pill = el('div', { style: `
    display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;
    color:var(--lx-ok);background:var(--lx-ok-bg);padding:4px 12px;border-radius:var(--lx-raio-pill)
  ` },
    el('span', { id: 'lx-live-dot', style: 'width:7px;height:7px;border-radius:50%;background:var(--lx-ok);display:inline-block' }),
    'Ao vivo');

  const mapDiv = el('div', { id: 'lx-mapa-brasil', style: 'width:100%;height:420px' });

  const mapaCard = el('div', { class: 'lx-card', style: 'flex:1;overflow:hidden;min-width:0' },
    el('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between' },
      el('div', { style: 'display:flex;align-items:baseline;gap:10px' }, countEl, lblEl),
      pill),
    mapDiv);

  const listaWrap = el('div', { style: 'display:flex;flex-direction:column;overflow-y:auto;max-height:420px' });

  const lateralCard = el('div', { class: 'lx-card', style: 'width:240px;flex:none;display:flex;flex-direction:column;overflow:hidden' },
    el('div', { style: 'padding:12px 14px;border-bottom:1px solid var(--lx-linha);font-size:13px;font-weight:800;color:var(--lx-tinta)' }, 'Clientes ativos'),
    listaWrap);

  content.append(
    el('div', { style: 'display:flex;gap:14px;align-items:stretch' }, mapaCard, lateralCard)
  );

  // Injetar CSS do Leaflet
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(link);
  }

  // Carregar dados e Leaflet em paralelo
  const [empresas] = await Promise.all([
    get('/empresas').catch(() => []),
    new Promise((resolve, reject) => {
      if (window.L) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.append(s);
    }),
  ]);

  const ativos = empresas.filter(e => e.ativo !== false);
  countEl.textContent = ativos.length;

  // Montar lista lateral
  listaWrap.innerHTML = '';
  ativos.forEach((c, i) => {
    const { bg, cor } = CORES_AV[i % CORES_AV.length];
    listaWrap.append(el('div', { style: `
      display:flex;align-items:center;gap:10px;padding:10px 14px;
      border-bottom:1px solid var(--lx-linha);cursor:pointer
    ` },
      el('div', { style: `width:28px;height:28px;border-radius:7px;background:${bg};color:${cor};display:grid;place-items:center;font-size:11px;font-weight:800;flex:none` },
        iniciais(c.razao_social || c.nome_fantasia)),
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
          c.razao_social || c.nome_fantasia || '—'),
        el('div', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `${c.total_motoboys || 0} motoboys`))));
  });

  if (!ativos.length) {
    listaWrap.append(el('div', { style: 'padding:24px;text-align:center;color:var(--lx-tinta-2);font-size:13px' },
      'Nenhum cliente cadastrado ainda.'));
  }

  // Inicializar mapa Leaflet
  const L = window.L;
  const map = L.map('lx-mapa-brasil', {
    center: [-14.235, -51.9253],
    zoom: 4,
    zoomControl: true,
    scrollWheelZoom: false,
  });

  aplicarBasemap(map);

  // Pins dos clientes
  ativos.forEach((c, i) => {
    const coords = coordsParaCliente(c);
    const mb = c.total_motoboys || 0;
    const corPin = mb > 10 ? '#1D9E75' : mb > 0 ? '#185FA5' : '#BA7517';
    const r = Math.min(14, Math.max(8, 8 + mb * 0.4));

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:${r * 2}px;height:${r * 2}px;border-radius:50%;
        background:${corPin};border:2.5px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.25);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
      "></div>`,
      iconSize: [r * 2, r * 2],
      iconAnchor: [r, r],
    });

    const nome = c.razao_social || c.nome_fantasia || '—';
    const cidade = c.cidade || '';

    L.marker(coords, { icon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:140px">
          <div style="font-weight:700;font-size:13px;color:#0F2740;margin-bottom:3px">${nome}</div>
          ${cidade ? `<div style="font-size:11px;color:#486485;margin-bottom:6px">${cidade}</div>` : ''}
          <div style="display:flex;gap:12px">
            <div>
              <div style="font-size:10px;color:#8AA2BE">Motoboys</div>
              <div style="font-size:16px;font-weight:700;color:#0F2740">${mb}</div>
            </div>
          </div>
        </div>`, { maxWidth: 200 });
  });

  // Animação do dot ao vivo
  if (!document.getElementById('lx-pulse-style')) {
    const s = document.createElement('style');
    s.id = 'lx-pulse-style';
    s.textContent = `@keyframes lx-pulse{0%,100%{opacity:1}50%{opacity:.3}}#lx-live-dot{animation:lx-pulse 1.8s infinite}`;
    document.head.append(s);
  }
}

async function dashCliente(content) {
  const { secHeader, estadoVazio, statusBadge } = await import('../core/ui.js');
  const perfil = auth.acessoAtual().perfil;
  const ehCentral = perfil === 'super_admin' || perfil === 'central_admin';
  const estado = { preset: 'hoje', de: null, ate: null, loja_id: '', centro_id: '' };

  // ---------- helpers de gráfico (SVG puro) ----------
  function areaChart(serie) {
    const pts = (serie && serie.pontos) || [];
    const tipo = (serie && serie.tipo) || 'hora';
    let dom = [];
    if (tipo === 'hora') { const mp = {}; pts.forEach(p => mp[p.k] = p.v); for (let h = 6; h <= 22; h++) dom.push({ lbl: (h < 10 ? '0' + h : h) + 'h', v: mp[h] || 0 }); }
    else dom = pts.map(p => ({ lbl: p.k, v: p.v }));
    const box = el('div', { style: 'position:relative' });
    if (!dom.length) { box.append(el('div', { style: 'color:var(--lx-tinta-3);font-size:13px;padding:40px 0;text-align:center' }, 'Sem dados no período.')); return box; }
    const W = 640, H = 170, maxV = Math.max(1, ...dom.map(d => d.v)), n = dom.length;
    const X = i => n === 1 ? W / 2 : (i / (n - 1)) * W;
    const Y = v => H - (v / maxV) * (H - 24) - 4;
    const linha = dom.map((d, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(d.v).toFixed(1)).join(' ');
    const area = 'M' + X(0).toFixed(1) + ',' + H + ' ' + dom.map((d, i) => 'L' + X(i).toFixed(1) + ',' + Y(d.v).toFixed(1)).join(' ') + ' L' + X(n - 1).toFixed(1) + ',' + H + ' Z';
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="170" preserveAspectRatio="none" style="display:block;overflow:visible">' +
      '<defs><linearGradient id="lxar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#185FA5" stop-opacity="0.26"/><stop offset="1" stop-color="#185FA5" stop-opacity="0"/></linearGradient></defs>' +
      '<line x1="0" y1="43" x2="640" y2="43" stroke="#EEF3F9"/><line x1="0" y1="90" x2="640" y2="90" stroke="#EEF3F9"/><line x1="0" y1="137" x2="640" y2="137" stroke="#EEF3F9"/>' +
      '<path d="' + area + '" fill="url(#lxar)"/><path d="' + linha + '" fill="none" stroke="#185FA5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<line class="vg" x1="0" y1="0" x2="0" y2="' + H + '" stroke="#185FA5" stroke-width="1" stroke-dasharray="3 3" style="opacity:0"/>' +
      '<circle class="dot" r="4.5" fill="#185FA5" stroke="#fff" stroke-width="2" style="opacity:0"/></svg>' +
      '<div class="eixo" style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--lx-tinta-3);margin-top:4px"></div>' +
      '<div class="tt" style="position:absolute;pointer-events:none;background:#042C53;color:#fff;font-size:11px;font-weight:700;padding:5px 9px;border-radius:7px;transform:translate(-50%,-135%);white-space:nowrap;opacity:0;transition:opacity .08s;z-index:5"></div>';
    const eixo = box.querySelector('.eixo');
    dom.filter((_, i) => n <= 8 || i % Math.ceil(n / 8) === 0).forEach(d => eixo.append(el('span', {}, d.lbl)));
    const svg = box.querySelector('svg'), vg = box.querySelector('.vg'), dot = box.querySelector('.dot'), tt = box.querySelector('.tt');
    svg.addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const i = Math.round(ratio * (n - 1)); const d = dom[i];
      vg.setAttribute('x1', X(i)); vg.setAttribute('x2', X(i)); vg.style.opacity = '.5';
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(d.v)); dot.style.opacity = '1';
      tt.textContent = d.lbl + ' · ' + d.v + (d.v === 1 ? ' entrega' : ' entregas');
      tt.style.left = ((X(i) / W) * r.width) + 'px';
      tt.style.top = ((Y(d.v) / H) * r.height) + 'px';
      tt.style.opacity = '1';
    });
    svg.addEventListener('mouseleave', () => { vg.style.opacity = '0'; dot.style.opacity = '0'; tt.style.opacity = '0'; });
    return box;
  }
  function donut(segs, big, small) {
    const total = segs.reduce((s, x) => s + x.v, 0);
    let acc = 0;
    const arcs = total ? segs.filter(s => s.v > 0).map(s => { const len = s.v / total * 100; const c = '<circle cx="21" cy="21" r="15.9" fill="none" stroke="' + s.cor + '" stroke-width="6" stroke-dasharray="' + len.toFixed(2) + ' ' + (100 - len).toFixed(2) + '" stroke-dashoffset="' + (25 - acc).toFixed(2) + '"/>'; acc += len; return c; }).join('')
      : '<circle cx="21" cy="21" r="15.9" fill="none" stroke="#EEF3F9" stroke-width="6"/>';
    return '<div style="position:relative;width:140px;height:140px;flex:0 0 140px">' +
      '<svg width="140" height="140" viewBox="0 0 42 42">' + arcs + '</svg>' +
      '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
      '<b style="font-size:26px;font-weight:900;color:var(--lx-navy,#042C53)">' + big + '</b>' +
      '<span style="font-size:11px;color:var(--lx-tinta-2)">' + small + '</span></div></div>';
  }
  const legenda = (cor, txt, val) => el('div', { style: 'font-size:12px;margin-bottom:7px' },
    el('span', { style: 'display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px;background:' + cor }),
    txt + ' ', el('b', {}, String(val)));

  // ---------- filtros ----------
  const presets = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['custom', 'Personalizado']];
  const btns = presets.map(([id, rot]) => el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px;padding:7px 13px',
    onClick: () => { estado.preset = id; estado.de = null; estado.ate = null; sinc(); recarregar(); } }, rot));
  btns.forEach((b, i) => (b.dataset.preset = presets[i][0]));
  function sinc() { btns.forEach(b => { const on = b.dataset.preset === estado.preset; b.classList.toggle('lx-btn-primario', on); b.classList.toggle('lx-btn-secundario', !on); }); caixaCustom.style.display = estado.preset === 'custom' ? 'flex' : 'none'; }
  const inDe = el('input', { type: 'date', class: 'lx-input', style: 'font-size:12.5px' });
  const inAte = el('input', { type: 'date', class: 'lx-input', style: 'font-size:12.5px' });
  const caixaCustom = el('div', { style: 'display:none;gap:8px;align-items:center' }, inDe, el('span', { style: 'color:var(--lx-tinta-3);font-size:12px' }, 'até'), inAte,
    el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12.5px', onClick: () => { estado.de = inDe.value || null; estado.ate = inAte.value || null; recarregar(); } }, 'Aplicar'));
  const selLoja = el('select', { class: 'lx-input', style: 'font-size:12.5px', onChange: async () => { estado.loja_id = selLoja.value; estado.centro_id = ''; await carregarCentros(); recarregar(); } }, el('option', { value: '' }, 'Todas as lojas'));
  const selCentro = el('select', { class: 'lx-input', style: 'font-size:12.5px', onChange: () => { estado.centro_id = selCentro.value; recarregar(); } }, el('option', { value: '' }, 'Todos os centros'));
  selCentro.disabled = true;
  async function carregarCentros() {
    selCentro.innerHTML = ''; selCentro.append(el('option', { value: '' }, 'Todos os centros'));
    if (!estado.loja_id) { selCentro.disabled = true; return; }
    try { const c = await get('/clientehub/' + estado.loja_id + '/contexto/centros'); (c || []).forEach(x => selCentro.append(el('option', { value: x.id }, x.nome || x.codigo || x.id))); selCentro.disabled = false; } catch { selCentro.disabled = true; }
  }
  const barra = el('div', { class: 'lx-card lx-card-pad', style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px' }, el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, ...btns), caixaCustom);
  if (ehCentral) barra.append(el('div', { style: 'flex:1;min-width:12px' }), selLoja, selCentro);
  content.append(barra);

  // ---------- áreas ----------
  const gradeKpi = el('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px' });
  const linha1 = el('div', { style: 'display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px' });
  const linha2 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px' });
  const cardArea = el('div', { class: 'lx-card lx-card-pad' });
  const cardSla = el('div', { class: 'lx-card lx-card-pad' });
  const cardStatus = el('div', { class: 'lx-card lx-card-pad' });
  const cardLojas = el('div', { class: 'lx-card lx-card-pad' });
  linha1.append(cardArea, cardSla); linha2.append(cardStatus, cardLojas);
  const listaAtivas = el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;padding:8px 0' }, 'Carregando…');
  const lateralAtivas = el('div', { class: 'lx-card lx-card-pad' }, el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' }, el('b', { style: 'font-size:14px' }, 'Entregas ativas'), el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, '…')), listaAtivas);
  content.append(gradeKpi, linha1, linha2, secHeader('Em andamento'), lateralAtivas);

  function kpi(icone, iconBg, iconCor, corridas, notas, label) {
    return el('div', { class: 'lx-card', style: 'padding:14px 15px' },
      el('div', { style: 'width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;margin-bottom:9px;background:' + iconBg + ';color:' + iconCor }, icone),
      el('div', { style: 'font-size:25px;font-weight:900;color:var(--lx-navy,#042C53);line-height:1' }, String(corridas)),
      el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta);margin-top:4px' }, label),
      el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:1px' }, (notas != null ? notas + ' notas' : 'corridas')));
  }
  const cardTitulo = (t, s) => el('div', {}, el('div', { style: 'font-size:14px;font-weight:800;color:var(--lx-navy,#042C53)' }, t), el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin:2px 0 12px' }, s));

  async function carregarAtivas() {
    try {
      const q = estado.loja_id ? '?loja_id=' + estado.loja_id : '';
      const entregas = auth.temModulo('entregas') ? await get('/entregas' + q).catch(() => []) : [];
      const ativas = entregas.filter(e => ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status));
      lateralAtivas.querySelector('span').textContent = ativas.length + ' ativas';
      listaAtivas.innerHTML = '';
      if (!ativas.length) { listaAtivas.append(estadoVazio('entregas', 'Nenhuma entrega em andamento', '')); return; }
      ativas.slice(0, 10).forEach(e => listaAtivas.append(el('div', { style: 'display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid var(--lx-linha)' },
        el('b', { style: 'font-size:13px;color:var(--lx-tinta);flex:1' }, e.protocolo || '-'), el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, e.motoboy_nome || '-'), statusBadge(e.status))));
    } catch (err) {}
  }

  async function recarregar() {
    gradeKpi.innerHTML = ''; [cardArea, cardSla, cardStatus, cardLojas].forEach(c => (c.innerHTML = ''));
    const qs = new URLSearchParams();
    if (estado.preset === '7d' || estado.preset === '30d') { const dias = estado.preset === '7d' ? 6 : 29; const hoje = new Date(); const de = new Date(); de.setDate(hoje.getDate() - dias); qs.set('de', de.toISOString().slice(0, 10)); qs.set('ate', hoje.toISOString().slice(0, 10)); }
    else { if (estado.de) qs.set('de', estado.de); if (estado.ate) qs.set('ate', estado.ate); }
    if (estado.loja_id) qs.set('loja_id', estado.loja_id);
    if (estado.centro_id) qs.set('centro_id', estado.centro_id);
    let d = {};
    try { d = await get('/entregas/dashboard' + (qs.toString() ? '?' + qs.toString() : '')); }
    catch { gradeKpi.append(el('div', { style: 'color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar.')); return; }
    const ag = d.agora || {}, pe = d.periodo || {}, st = d.status || {};

    gradeKpi.append(
      kpi('▦', '#E4EEF9', 'var(--lx-azul,#185FA5)', pe.criadas || 0, pe.criadas_notas || 0, 'Criadas'),
      kpi('✓', '#E4F5EE', 'var(--lx-ok,#1F9D6B)', pe.concluidas || 0, pe.concluidas_notas || 0, 'Concluídas'),
      kpi('◴', '#FBF1DD', 'var(--lx-atencao,#C98A1A)', ag.em_andamento || 0, ag.em_andamento_notas || 0, 'Em andamento'),
      kpi('≡', '#EEEDFE', '#6B4FC9', ag.na_fila || 0, ag.na_fila_notas || 0, 'Na fila'),
      kpi('✕', '#FBE8E6', 'var(--lx-erro,#D0584F)', pe.canceladas || 0, pe.canceladas_notas || 0, 'Canceladas'));

    cardArea.append(cardTitulo('Entregas concluídas', d.serie && d.serie.tipo === 'dia' ? 'Por dia no período' : 'Por hora, hoje'), areaChart(d.serie));

    const perc = pe.sla_perc;
    cardSla.append(cardTitulo('Cumprimento de SLA', 'No prazo × fora do prazo'));
    if (perc == null) cardSla.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Sem concluídas no período para calcular.'));
    else cardSla.append(el('div', { style: 'display:flex;align-items:center;gap:16px' },
      el('div', { html: donut([{ v: pe.no_prazo, cor: '#1F9D6B' }, { v: pe.fora_prazo, cor: '#D0584F' }], perc + '%', 'no prazo') }),
      el('div', {}, legenda('#1F9D6B', 'No prazo', pe.no_prazo || 0), legenda('#D0584F', 'Fora do prazo', pe.fora_prazo || 0))));

    cardStatus.append(cardTitulo('Status das corridas', 'Distribuição atual'));
    const totSt = (st.em_rota + st.aguardando_coleta + st.em_coleta + st.na_fila + st.concluidas) || 0;
    cardStatus.append(el('div', { style: 'display:flex;align-items:center;gap:16px' },
      el('div', { html: donut([
        { v: st.em_rota, cor: '#378ADD' }, { v: st.aguardando_coleta, cor: '#6B4FC9' }, { v: st.em_coleta, cor: '#185FA5' },
        { v: st.na_fila, cor: '#C98A1A' }, { v: st.concluidas, cor: '#1F9D6B' }], String(totSt), 'corridas') }),
      el('div', {}, legenda('#378ADD', 'Em rota', st.em_rota || 0), legenda('#6B4FC9', 'Aguardando coleta', st.aguardando_coleta || 0),
        legenda('#C98A1A', 'Na fila', st.na_fila || 0), legenda('#1F9D6B', 'Concluídas', st.concluidas || 0))));

    cardLojas.append(cardTitulo('Top lojas no período', 'Corridas · notas por loja'));
    const tl = d.top_lojas || [];
    if (!tl.length) cardLojas.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Sem dados no período.'));
    else { const maxC = Math.max(1, ...tl.map(l => l.corridas)); const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:11px;margin-top:2px' });
      tl.forEach(l => wrap.append(el('div', { style: 'display:flex;align-items:center;gap:10px;font-size:12px' },
        el('span', { style: 'width:120px;color:var(--lx-tinta);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, l.nome),
        el('span', { style: 'flex:1;height:10px;border-radius:6px;background:var(--lx-superficie-2,#F4F8FD);overflow:hidden' }, el('span', { style: 'display:block;height:100%;border-radius:6px;background:var(--lx-azul,#185FA5);width:' + Math.round(l.corridas / maxC * 100) + '%' })),
        el('span', { style: 'width:70px;text-align:right;font-weight:700;color:var(--lx-navy,#042C53)' }, l.corridas + ' · ' + l.notas)))); cardLojas.append(wrap); }

    carregarAtivas();
  }

  if (ehCentral) { try { const lojas = await get('/lojas'); (lojas || []).forEach(l => selLoja.append(el('option', { value: l.id }, l.nome_fantasia || l.nome || l.id))); } catch {} }
  sinc();
  await recarregar();
}

export async function montar(container) {
  const isAdmin = auth.acessoAtual().perfil === 'super_admin';
  const content = el('div', {});
  container.append(casca('Dashboard', content,
    isAdmin ? 'Visão geral da plataforma' : 'Acompanhe sua operação'));

  if (isAdmin) await dashAdmin(content);
  else await dashCliente(content);
}
