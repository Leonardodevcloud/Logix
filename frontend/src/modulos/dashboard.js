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

  // ---- barra de filtros ----
  const presets = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['custom', 'Personalizado']];
  const btns = presets.map(([id, rot]) => el('button', {
    class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px;padding:7px 13px',
    onClick: () => { estado.preset = id; estado.de = null; estado.ate = null; sinc(); recarregar(); },
  }, rot));
  btns.forEach((b, i) => (b.dataset.preset = presets[i][0]));
  function sinc() {
    btns.forEach((b) => {
      const on = b.dataset.preset === estado.preset;
      b.classList.toggle('lx-btn-primario', on);
      b.classList.toggle('lx-btn-secundario', !on);
    });
    caixaCustom.style.display = estado.preset === 'custom' ? 'flex' : 'none';
  }

  const inDe = el('input', { type: 'date', class: 'lx-input', style: 'font-size:12.5px' });
  const inAte = el('input', { type: 'date', class: 'lx-input', style: 'font-size:12.5px' });
  const caixaCustom = el('div', { style: 'display:none;gap:8px;align-items:center' },
    inDe, el('span', { style: 'color:var(--lx-tinta-3);font-size:12px' }, 'até'), inAte,
    el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12.5px',
      onClick: () => { estado.de = inDe.value || null; estado.ate = inAte.value || null; recarregar(); } }, 'Aplicar'));

  const selLoja = el('select', { class: 'lx-input', style: 'font-size:12.5px',
    onChange: async () => { estado.loja_id = selLoja.value; estado.centro_id = ''; await carregarCentros(); recarregar(); } },
    el('option', { value: '' }, 'Todas as lojas'));
  const selCentro = el('select', { class: 'lx-input', style: 'font-size:12.5px',
    onChange: () => { estado.centro_id = selCentro.value; recarregar(); } },
    el('option', { value: '' }, 'Todos os centros'));
  selCentro.disabled = true;

  async function carregarCentros() {
    selCentro.innerHTML = '';
    selCentro.append(el('option', { value: '' }, 'Todos os centros'));
    if (!estado.loja_id) { selCentro.disabled = true; return; }
    try {
      const centros = await get('/clientehub/' + estado.loja_id + '/contexto/centros');
      (centros || []).forEach((c) => selCentro.append(el('option', { value: c.id }, c.nome || c.codigo || c.id)));
      selCentro.disabled = false;
    } catch { selCentro.disabled = true; }
  }

  const barra = el('div', { class: 'lx-card lx-card-pad', style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px' },
    el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, ...btns), caixaCustom);
  if (ehCentral) barra.append(el('div', { style: 'flex:1;min-width:12px' }), selLoja, selCentro);
  content.append(barra);

  // ---- grades ----
  const gradeAgora = el('div', { class: 'lx-grid-kpi' });
  const gradePeriodo = el('div', { class: 'lx-grid-kpi' });
  const slaBox = el('div', { class: 'lx-card lx-card-pad', style: 'margin:14px 0' });
  const listaAtivas = el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;padding:8px 0' }, 'Carregando…');
  const lateralAtivas = el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' },
      el('b', { style: 'font-size:14px' }, 'Entregas ativas'),
      el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, '…')),
    listaAtivas);

  content.append(secHeader('Agora'), gradeAgora, secHeader('No período'), gradePeriodo, slaBox, secHeader('Em andamento'), lateralAtivas);

  const kpi = (val, lbl, cor) => el('div', { class: 'lx-card lx-kpi' },
    el('div', { class: 'k-val', style: 'font-size:26px' + (cor ? ';color:' + cor : '') }, String(val)),
    el('div', { class: 'k-lbl' }, lbl));

  async function carregarAtivas() {
    try {
      const q = estado.loja_id ? '?loja_id=' + estado.loja_id : '';
      const entregas = auth.temModulo('entregas') ? await get('/entregas' + q).catch(() => []) : [];
      const ativas = entregas.filter((e) => ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status));
      lateralAtivas.querySelector('span').textContent = ativas.length + ' ativas';
      listaAtivas.innerHTML = '';
      if (!ativas.length) { listaAtivas.append(estadoVazio('entregas', 'Nenhuma entrega em andamento', '')); return; }
      ativas.slice(0, 10).forEach((e) => listaAtivas.append(
        el('div', { style: 'display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid var(--lx-linha)' },
          el('b', { style: 'font-size:13px;color:var(--lx-tinta);flex:1' }, e.protocolo || '-'),
          el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, e.motoboy_nome || '-'),
          statusBadge(e.status))));
    } catch (err) {}
  }

  async function recarregar() {
    gradeAgora.innerHTML = ''; gradePeriodo.innerHTML = ''; slaBox.innerHTML = '';
    const qs = new URLSearchParams();
    if (estado.preset === '7d' || estado.preset === '30d') {
      const dias = estado.preset === '7d' ? 6 : 29;
      const hoje = new Date(); const de = new Date(); de.setDate(hoje.getDate() - dias);
      qs.set('de', de.toISOString().slice(0, 10)); qs.set('ate', hoje.toISOString().slice(0, 10));
    } else {
      if (estado.de) qs.set('de', estado.de);
      if (estado.ate) qs.set('ate', estado.ate);
    }
    if (estado.loja_id) qs.set('loja_id', estado.loja_id);
    if (estado.centro_id) qs.set('centro_id', estado.centro_id);

    let d = {};
    try { d = await get('/entregas/dashboard' + (qs.toString() ? '?' + qs.toString() : '')); }
    catch { gradeAgora.append(el('div', { style: 'color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar.')); return; }

    let online = '-', total = '-';
    if (auth.temModulo('motoboys')) {
      try { const mb = await get('/motoboys'); total = mb.length; online = mb.filter((m) => m.online).length; } catch {}
    }

    const ag = d.agora || {}, pe = d.periodo || {};
    gradeAgora.append(kpi(ag.em_andamento || 0, 'Em andamento'), kpi(ag.na_fila || 0, 'Na fila'));
    if (auth.temModulo('motoboys')) gradeAgora.append(kpi(online + '/' + total, 'Motoboys online'));

    gradePeriodo.append(
      kpi(pe.concluidas || 0, 'Concluídas'),
      kpi(pe.no_prazo || 0, 'No prazo', 'var(--lx-ok)'),
      kpi(pe.fora_prazo || 0, 'Fora do prazo', (pe.fora_prazo ? 'var(--lx-erro)' : '')),
      kpi(pe.canceladas || 0, 'Canceladas'),
      kpi((pe.km_total || 0).toLocaleString('pt-BR') + ' km', 'Distância'),
      kpi((pe.tempo_medio_min || 0) + ' min', 'Tempo médio'));

    const perc = pe.sla_perc;
    if (perc == null) {
      slaBox.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Sem entregas concluídas no período para calcular o SLA.'));
    } else {
      const corPerc = perc >= 90 ? 'var(--lx-ok)' : (perc >= 70 ? 'var(--lx-atencao,#C98A1A)' : 'var(--lx-erro)');
      slaBox.append(
        el('div', { style: 'display:flex;justify-content:space-between;margin-bottom:8px' },
          el('b', { style: 'font-size:14px' }, 'Cumprimento de SLA'),
          el('b', { style: 'font-size:14px;color:' + corPerc }, perc + '%')),
        el('div', { style: 'height:12px;border-radius:8px;overflow:hidden;background:var(--lx-linha);display:flex' },
          el('div', { style: 'width:' + perc + '%;background:var(--lx-ok)' }),
          el('div', { style: 'flex:1;background:var(--lx-erro)' })),
        el('div', { style: 'display:flex;justify-content:space-between;margin-top:6px;font-size:11.5px;color:var(--lx-tinta-2)' },
          el('span', {}, (pe.no_prazo || 0) + ' no prazo'),
          el('span', {}, (pe.fora_prazo || 0) + ' fora do prazo')));
    }

    carregarAtivas();
  }

  if (ehCentral) {
    try { const lojas = await get('/lojas'); (lojas || []).forEach((l) => selLoja.append(el('option', { value: l.id }, l.nome_fantasia || l.nome || l.id))); } catch {}
  }
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
