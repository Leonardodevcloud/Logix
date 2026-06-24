import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, getToken } from '../core/api.js';

const BASE = window.LOGIX_API || '/api/v1';

// SVG helpers inline (sem dependência de webfont)
const SVG = {
  pin:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  clock:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  pkg:     `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  refresh: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  route:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5c.4 0 .9-.1 1.3-.3a3.4 3.4 0 0 0 1.9-3.1V9.5A3.5 3.5 0 0 0 17.2 6H15"/><path d="M6 16V7c0-1.7 1.3-3 3-3h2.5"/><circle cx="18" cy="5" r="3"/></svg>`,
  flag:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
};

function ico(html, color) {
  const s = el('span', { style: `display:inline-flex;align-items:center;justify-content:center;${color?'color:'+color:''}` });
  s.innerHTML = html; return s;
}

function fmtAgo(iso) {
  if (!iso) return 'nunca';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'ao vivo';
  if (s < 3600) return 'há ' + Math.floor(s/60) + ' min';
  return 'há ' + Math.floor(s/3600) + 'h';
}

async function garantirLeaflet() {
  if (window.L) return;
  if (!document.getElementById('lx-leaflet-css')) {
    const l = document.createElement('link');
    l.id = 'lx-leaflet-css'; l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(l);
  }
  if (!document.getElementById('lx-leaflet-js')) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.id = 'lx-leaflet-js';
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = res; s.onerror = rej;
      document.head.append(s);
    });
  }
}

function pinDiv(conteudo, cor, bordaCor, tamanho = 36) {
  return window.L.divIcon({
    className: '',
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:50%;background:${cor};border:3px solid ${bordaCor || '#fff'};display:grid;place-items:center;font-weight:800;font-size:${tamanho < 30 ? 9 : 11}px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);position:relative">
      ${conteudo}
    </div>`,
    iconSize: [tamanho, tamanho], iconAnchor: [tamanho/2, tamanho/2],
  });
}

function badgePin(iniciais, qtd, cor) {
  return window.L.divIcon({
    className: '',
    html: `<div style="position:relative;width:38px;height:38px">
      <div style="width:36px;height:36px;border-radius:50%;background:${cor};border:3px solid #FACC15;display:grid;place-items:center;font-weight:800;font-size:11px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${iniciais}</div>
      <div style="position:absolute;top:-6px;right:-6px;background:#FACC15;color:#3D2200;border-radius:10px;padding:1px 5px;font-size:9px;font-weight:800;white-space:nowrap">${qtd} ent.</div>
    </div>`,
    iconSize: [38, 38], iconAnchor: [19, 19],
  });
}

export async function montar(container) {
  let _motoboys = [];
  let _mapa = null;
  let _markers = {};
  let _polyRota = null;
  let _pinLoja = null;
  let _selecionado = null;
  let _autoRefresh = null;
  let _coletaPadrao = null;
  let _cardEl = null;

  // CSS do módulo
  if (!document.getElementById('lx-rastreio-style')) {
    const s = document.createElement('style'); s.id = 'lx-rastreio-style';
    s.textContent = `
      .lx-rast-shell{display:grid;grid-template-columns:300px 1fr;height:calc(100vh - 118px);overflow:hidden}
      .lx-rast-side{background:#042C53;display:flex;flex-direction:column;overflow:hidden}
      .lx-rast-top{padding:14px;border-bottom:1px solid rgba(255,255,255,.08)}
      .lx-rast-kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px}
      .lx-rast-kpi{background:rgba(255,255,255,.06);border-radius:8px;padding:8px 10px;text-align:center;border:0.5px solid rgba(255,255,255,.08)}
      .lx-rast-kpi b{font-size:22px;font-weight:800;line-height:1;display:block}
      .lx-rast-kpi span{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.45);margin-top:3px;display:block}
      .lx-rast-scroll{overflow-y:auto;flex:1;padding:8px}
      .lx-rast-sec{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#5D8DB8;padding:7px 4px 4px}
      .lx-mb-card{background:rgba(255,255,255,.05);border-radius:10px;padding:10px 11px;margin-bottom:5px;cursor:pointer;border:0.5px solid rgba(255,255,255,.07);border-left:3px solid transparent;transition:background .15s}
      .lx-mb-card:hover{background:rgba(255,255,255,.09)}
      .lx-mb-card.sel{background:rgba(255,255,255,.12);border-left-color:#378ADD}
      .lx-mb-card.livre{border-left-color:#4ADE80}
      .lx-mb-card.em-rota{border-left-color:#FACC15}
      .lx-mb-card.offline{border-left-color:#64748B;opacity:.5}
      .lx-mb-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
      .lx-mb-av{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none}
      .lx-mb-name{color:#fff;font-size:12.5px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lx-mb-sub{font-size:10.5px;color:#5D8DB8}
      .lx-pill{padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;flex:none}
      .lx-pill-livre{background:rgba(74,222,128,.15);color:#4ADE80}
      .lx-pill-rota{background:rgba(250,204,21,.15);color:#FACC15}
      .lx-pill-off{background:rgba(100,116,139,.15);color:#94A3B8}
      .lx-mb-meta{display:flex;gap:10px;font-size:11px;color:#7BA4C7}
      .lx-mb-meta span{display:flex;align-items:center;gap:3px}
      .lx-mb-entregas{background:rgba(250,204,21,.08);border-radius:6px;padding:4px 8px;margin-top:5px;font-size:11px;color:#FACC15;display:flex;align-items:center;gap:5px}
      .lx-rast-mapa{position:relative;overflow:hidden}
      .lx-rast-topbar{position:absolute;top:0;left:0;right:0;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;z-index:400;pointer-events:none}
      .lx-rast-topbar > *{pointer-events:auto}
      .lx-rast-tit{background:rgba(4,44,83,.88);color:#fff;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
      .lx-rast-btns{display:flex;gap:6px}
      .lx-rast-btn{background:rgba(255,255,255,.93);border:0.5px solid rgba(0,0,0,.12);border-radius:7px;padding:6px 11px;font-size:12px;font-weight:500;color:#042C53;cursor:pointer;display:flex;align-items:center;gap:5px}
      .lx-rast-btn.on{background:#185FA5;color:#fff;border-color:#185FA5}
      .lx-legend{position:absolute;bottom:14px;left:14px;background:rgba(255,255,255,.95);border-radius:10px;padding:10px 13px;z-index:400;border:0.5px solid rgba(0,0,0,.1)}
      .lx-leg-row{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#1e293b;padding:2px 0}
      .lx-leg-dot{width:11px;height:11px;border-radius:50%;flex:none}
      .lx-mb-detail{position:absolute;bottom:14px;right:14px;background:#fff;border-radius:12px;padding:14px 16px;z-index:400;width:230px;border:0.5px solid rgba(0,0,0,.1);display:none}
      .lx-detail-name{font-size:13.5px;font-weight:700;color:#042C53}
      .lx-detail-sub{font-size:11.5px;color:#64748B;margin-top:2px;margin-bottom:10px}
      .lx-detail-row{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;padding:4px 0;border-bottom:0.5px solid #f1f5f9}
      .lx-detail-row:last-of-type{border-bottom:none}
      .lx-detail-row span{color:#64748B}
      .lx-detail-row b{color:#042C53;text-align:right}
      .lx-detail-rota{width:100%;margin-top:10px;background:#185FA5;color:#fff;border:none;border-radius:7px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
      .lx-detail-rota:disabled{opacity:.5;cursor:wait}
      .lx-rota-info{margin-top:6px;padding:6px 8px;background:#E6F1FB;border-radius:6px;font-size:11.5px;color:#0C447C;display:none;gap:8px;text-align:center}
      .lx-pulse{animation:lx-rast-pulse 2s ease-in-out infinite}
      @keyframes lx-rast-pulse{0%,100%{opacity:1}50%{opacity:.4}}
    `;
    document.head.append(s);
  }

  // Sidebar
  const kpiLivre = el('b', { style: 'color:#4ADE80' }, '—');
  const kpiRota  = el('b', { style: 'color:#FACC15' }, '—');
  const kpiOff   = el('b', { style: 'color:#94A3B8' }, '—');

  const listaScroll = el('div', { class: 'lx-rast-scroll' });

  const sidebar = el('div', { class: 'lx-rast-side' },
    el('div', { class: 'lx-rast-top' },
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between' },
        el('b', { style: 'color:#fff;font-size:14px;font-weight:700' }, 'Rastreio de motoboys'),
        el('div', { class: 'lx-pulse', style: 'display:flex;align-items:center;gap:5px;font-size:11px;color:#4ADE80' },
          el('div', { style: 'width:7px;height:7px;border-radius:50%;background:#4ADE80' }),
          'Ao vivo')),
      el('div', { class: 'lx-rast-kpis' },
        el('div', { class: 'lx-rast-kpi' }, kpiLivre, el('span', {}, 'Livres')),
        el('div', { class: 'lx-rast-kpi' }, kpiRota, el('span', {}, 'Em rota')),
        el('div', { class: 'lx-rast-kpi' }, kpiOff, el('span', {}, 'Offline')))),
    listaScroll);

  // Mapa
  const mapaDiv = el('div', { style: 'width:100%;height:100%' });

  // Card de detalhe flutuante
  const detalheName  = el('div', { class: 'lx-detail-name' }, '—');
  const detalheSub   = el('div', { class: 'lx-detail-sub' }, '—');
  const detalheRows  = el('div', {});
  const detalheRotaInfo = el('div', { class: 'lx-rota-info' });
  const btnRota = el('button', { class: 'lx-detail-rota', onClick: renderRotaSelecionado },
    el('span', { innerHTML: SVG.route }), 'Ver rota atual');

  const cardDetalhe = el('div', { class: 'lx-mb-detail' },
    detalheName, detalheSub, detalheRows,
    btnRota, detalheRotaInfo);

  // Mapa area
  const mapaArea = el('div', { class: 'lx-rast-mapa' }, mapaDiv,
    el('div', { class: 'lx-rast-topbar' },
      el('div', { class: 'lx-rast-tit' },
        el('div', { style: 'width:8px;height:8px;border-radius:50%;background:#4ADE80', class: 'lx-pulse' }),
        'Posições em tempo real'),
      el('div', { class: 'lx-rast-btns' },
        el('button', { class: 'lx-rast-btn', onClick: () => { limparRota(); renderMapa(); } },
          el('span', { innerHTML: SVG.refresh }), 'Atualizar'))),
    el('div', { class: 'lx-legend' },
      el('div', { class: 'lx-leg-row' }, el('div', { class: 'lx-leg-dot', style: 'background:#042C53;border:2px solid #185FA5' }), 'Ponto de coleta'),
      el('div', { class: 'lx-leg-row' }, el('div', { class: 'lx-leg-dot', style: 'background:#185FA5;border:2px solid #4ADE80' }), 'Motoboy livre'),
      el('div', { class: 'lx-leg-row' }, el('div', { class: 'lx-leg-dot', style: 'background:#854F0B;border:2px solid #FACC15' }), 'Em rota (com entrega)'),
      el('div', { class: 'lx-leg-row' }, el('div', { class: 'lx-leg-dot', style: 'background:#64748B' }), 'Offline')),
    cardDetalhe);

  const shell = el('div', { class: 'lx-rast-shell' }, sidebar, mapaArea);
  container.append(casca('Rastreio de motoboys', shell, 'Posições e rotas em tempo real'));

  // Iniciar mapa
  await garantirLeaflet();
  _mapa = window.L.map(mapaDiv, { center: [-12.97, -38.5], zoom: 13, scrollWheelZoom: true, zoomControl: true });
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(_mapa);

  // Carregar ponto de coleta padrão da empresa (para mostrar no mapa)
  try {
    const salvos = await get('/entregas/enderecos-salvos').catch(() => []);
    _coletaPadrao = salvos.find(s => s.is_coleta_padrao);
    if (_coletaPadrao?.lat) {
      _pinLoja = window.L.marker([_coletaPadrao.lat, _coletaPadrao.lng], {
        icon: window.L.divIcon({
          className: '',
          html: `<div style="width:40px;height:40px;border-radius:50%;background:#042C53;border:3px solid #fff;display:grid;place-items:center;font-weight:800;font-size:10px;color:#fff;box-shadow:0 2px 12px rgba(4,44,83,.5)"><span style="font-size:8px;letter-spacing:.02em">LOJA</span></div>`,
          iconSize: [40, 40], iconAnchor: [20, 20],
        }),
        zIndexOffset: 1000,
      }).bindPopup(`<b>Ponto de coleta</b><br>${_coletaPadrao.apelido || _coletaPadrao.endereco_completo}`).addTo(_mapa);

      // Raio de cobertura
      window.L.circle([_coletaPadrao.lat, _coletaPadrao.lng], {
        radius: 2000, color: '#185FA5', weight: 1.5, dashArray: '5 5',
        fillColor: '#185FA5', fillOpacity: 0.05,
      }).addTo(_mapa);
    }
  } catch {}

  function CORES_MB(idx) {
    return ['#185FA5','#0F6E56','#534AB7','#854F0B','#993C1D','#854F0B'][idx % 6];
  }

  function iniciais(nome) {
    return nome.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function limparRota() {
    if (_polyRota) { _polyRota.forEach(p => p.remove()); _polyRota = null; }
    detalheRotaInfo.style.display = 'none';
  }

  async function renderRotaSelecionado() {
    if (!_selecionado) return;
    const m = _motoboys.find(x => x.id === _selecionado);
    if (!m || m.entregas_ativas === 0) return;

    btnRota.disabled = true;
    btnRota.childNodes[1].textContent = ' Calculando…';
    limparRota();

    try {
      const r = await fetch(`${BASE}/motoboys/${m.id}/rota-atual`, {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      if (!r.ok) throw new Error();
      const dados = await r.json();

      if (dados.geom?.length) {
        const poly = window.L.polyline(dados.geom, {
          color: '#FACC15', weight: 4, dashArray: '8 10', lineCap: 'round', opacity: 0.9
        }).addTo(_mapa);

        // Pins dos destinos pendentes
        const pinsDest = (dados.pontos || []).map((p, i) => {
          if (!p.lat || !p.lng) return null;
          return window.L.marker([p.lat, p.lng], { icon: pinDiv(i + 1, '#185FA5', '#fff', 30) })
            .bindPopup(`<b>Destino ${i+1}</b><br>${p.endereco || '—'}`)
            .addTo(_mapa);
        }).filter(Boolean);

        _polyRota = [poly, ...pinsDest];
        _mapa.fitBounds(poly.getBounds(), { padding: [60, 60] });

        detalheRotaInfo.style.display = 'flex';
        detalheRotaInfo.textContent = '';
        detalheRotaInfo.append(
          el('b', {}, dados.distanciaKm + ' km'),
          el('span', { style: 'color:#378ADD' }, '·'),
          el('b', {}, dados.duracaoMin + ' min restantes'));
      } else {
        detalheRotaInfo.style.display = 'flex';
        detalheRotaInfo.textContent = 'Posição indisponível para este motoboy.';
      }
    } catch {
      detalheRotaInfo.style.display = 'flex';
      detalheRotaInfo.textContent = 'Erro ao calcular rota.';
    }

    btnRota.disabled = false;
    btnRota.childNodes[1].textContent = ' Ver rota atual';
  }

  function selecionarMotoboy(m) {
    _selecionado = m.id;
    limparRota();

    // Highlight do card na sidebar
    document.querySelectorAll('.lx-mb-card').forEach(c => c.classList.remove('sel'));
    document.getElementById('mbcard-' + m.id)?.classList.add('sel');

    // Atualizar card de detalhe
    const dist = m.lat ? calcDist(m) : null;
    detalheName.textContent = m.nome_completo;
    detalheSub.textContent = m.status === 'ativo' && m.online ? 'Online' : 'Offline';
    detalheRows.innerHTML = '';
    const rows = [
      ['Distância da loja', dist ? dist.toFixed(1) + ' km' : '—'],
      ['Última posição', fmtAgo(m.ultima_posicao_em)],
      ['Entregas ativas', m.entregas_ativas || 0],
    ];
    rows.forEach(([l, v]) => detalheRows.append(
      el('div', { class: 'lx-detail-row' },
        el('span', {}, l), el('b', {}, String(v)))));

    // Entregas
    if (m.entregas?.length) {
      m.entregas.forEach(e => {
        detalheRows.append(el('div', { style: 'font-size:11px;color:#185FA5;padding:3px 0;display:flex;align-items:center;gap:4px' },
          el('span', { innerHTML: SVG.pkg }), e.protocolo + ' → ' + (e.destino || '—')));
      });
    }

    btnRota.style.display = m.entregas_ativas > 0 ? 'flex' : 'none';
    cardDetalhe.style.display = 'block';

    // Centralizar no motoboy
    if (m.lat && m.lng) _mapa.setView([m.lat, m.lng], 14, { animate: true });
  }

  function calcDist(m) {
    if (!_coletaPadrao?.lat || !m.lat) return null;
    const R = 6371;
    const dLat = (m.lat - _coletaPadrao.lat) * Math.PI / 180;
    const dLng = (m.lng - _coletaPadrao.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(_coletaPadrao.lat * Math.PI/180) * Math.cos(m.lat * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function renderSidebar() {
    listaScroll.innerHTML = '';
    const emRota  = _motoboys.filter(m => m.online && m.entregas_ativas > 0);
    const livres  = _motoboys.filter(m => m.online && m.entregas_ativas === 0);
    const offline = _motoboys.filter(m => !m.online);

    kpiLivre.textContent = livres.length;
    kpiRota.textContent  = emRota.length;
    kpiOff.textContent   = offline.length;

    function mkCard(m, classe, i) {
      const ini = iniciais(m.nome_completo);
      const cor = CORES_MB(i);
      const dist = calcDist(m);
      const card = el('div', { class: `lx-mb-card ${classe}`, id: 'mbcard-' + m.id, onClick: () => selecionarMotoboy(m) });
      if (_selecionado === m.id) card.classList.add('sel');

      // Pill status
      const pillClass = classe === 'livre' ? 'lx-pill-livre' : classe === 'em-rota' ? 'lx-pill-rota' : 'lx-pill-off';
      const pillLabel = classe === 'livre' ? 'Livre' : classe === 'em-rota' ? 'Em rota' : 'Offline';

      card.append(
        el('div', { class: 'lx-mb-top' },
          el('div', { class: 'lx-mb-av', style: `background:${cor}` }, ini),
          el('div', { style: 'flex:1;min-width:0' },
            el('span', { class: 'lx-mb-name' }, m.nome_completo),
            el('span', { class: 'lx-mb-sub' }, m.telefone_principal || '—')),
          el('span', { class: `lx-pill ${pillClass}` }, pillLabel)),
        el('div', { class: 'lx-mb-meta' },
          el('span', {}, ico(SVG.pin, '#7BA4C7'), dist != null ? dist.toFixed(1) + ' km da loja' : 'sem GPS'),
          el('span', {}, ico(SVG.clock, '#7BA4C7'), fmtAgo(m.ultima_posicao_em))));

      if (m.entregas_ativas > 0) {
        const nomes = (m.entregas || []).map(e => e.protocolo).join(', ');
        const entDiv = el('div', { class: 'lx-mb-entregas' },
          ico(SVG.pkg, '#FACC15'),
          `${m.entregas_ativas} entrega${m.entregas_ativas > 1 ? 's' : ''} · ${nomes}`);
        card.append(entDiv);
      }
      return card;
    }

    if (emRota.length) {
      listaScroll.append(el('div', { class: 'lx-rast-sec' }, 'Em rota'));
      emRota.forEach((m, i) => listaScroll.append(mkCard(m, 'em-rota', i)));
    }
    if (livres.length) {
      listaScroll.append(el('div', { class: 'lx-rast-sec' }, 'Disponíveis'));
      livres.forEach((m, i) => listaScroll.append(mkCard(m, 'livre', emRota.length + i)));
    }
    if (offline.length) {
      listaScroll.append(el('div', { class: 'lx-rast-sec', style: 'opacity:.4' }, 'Offline'));
      offline.forEach((m, i) => listaScroll.append(mkCard(m, 'offline', emRota.length + livres.length + i)));
    }
    if (!_motoboys.length) {
      listaScroll.append(el('div', { style: 'padding:24px;text-align:center;color:#5D8DB8;font-size:13px' }, 'Nenhum motoboy cadastrado.'));
    }
  }

  function renderMapa() {
    // Limpar markers anteriores
    Object.values(_markers).forEach(m => m.remove());
    _markers = {};

    if (!_mapa) return;

    _motoboys.forEach((m, i) => {
      if (!m.lat || !m.lng) return;
      const ini = iniciais(m.nome_completo);
      const cor = CORES_MB(i);

      let icon;
      if (!m.online) {
        icon = pinDiv(ini, '#64748B', '#94A3B8');
      } else if (m.entregas_ativas > 0) {
        icon = badgePin(ini, m.entregas_ativas, cor);
      } else {
        icon = window.L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:36px">
            <div style="width:34px;height:34px;border-radius:50%;background:#185FA5;border:3px solid #fff;display:grid;place-items:center;font-weight:800;font-size:11px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)">${ini}</div>
            <div style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:#4ADE80;border:2px solid #fff"></div>
          </div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        });
      }

      const marker = window.L.marker([m.lat, m.lng], { icon, zIndexOffset: m.online ? 100 : 0 })
        .bindPopup(`<b>${m.nome_completo}</b><br>${m.entregas_ativas > 0 ? m.entregas_ativas + ' entrega(s) ativa(s)' : 'Disponível'}`)
        .addTo(_mapa);

      marker.on('click', () => selecionarMotoboy(m));
      _markers[m.id] = marker;
    });

    // Ajustar bounds para incluir todos
    const todos = _motoboys.filter(m => m.lat && m.lng);
    if (todos.length && !_selecionado) {
      const bounds = todos.map(m => [m.lat, m.lng]);
      if (_coletaPadrao?.lat) bounds.push([_coletaPadrao.lat, _coletaPadrao.lng]);
      if (bounds.length > 1) _mapa.fitBounds(bounds, { padding: [50, 50] });
      else if (bounds.length === 1) _mapa.setView(bounds[0], 14);
    }
  }

  async function carregar() {
    try {
      _motoboys = await get('/motoboys/rastreio');
      renderSidebar();
      renderMapa();
    } catch (err) {
      listaScroll.innerHTML = '';
      listaScroll.append(el('div', { style: 'padding:20px;color:#F09595;font-size:13px' }, 'Erro ao carregar motoboys.'));
    }
  }

  // Auto-refresh a cada 30s
  carregar();
  _autoRefresh = setInterval(carregar, 30000);

  // Limpar ao sair
  const orig = container._limpeza;
  container._limpeza = () => { clearInterval(_autoRefresh); if (orig) orig(); };
}
