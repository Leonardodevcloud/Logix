// Mapa em tempo real — página de tela cheia (abre em aba dedicada).
// Mostra lojas e motoboys online; ao clicar mostra ETAs calculados por
// distância (haversine) + velocidade média — sem chamadas de API externas.
// O escopo (central vê tudo / loja vê só ela e seus motoboys) vem do backend.
import { get, getToken } from '../core/api.js';
import { el } from '../core/ui.js';

const COR = {
  navy: '#042C53', azul: '#185FA5', azulC: '#B5D4F4',
  verde: '#1f9d6b', vermelho: '#e23b3b', amarelo: '#FACC15', cinza: '#8ba5bc',
  tinta: '#0e2138', linha: '#dde9f5', fundo: '#eef4fb', branco: '#fff',
};

let VEL = 25; // km/h (vem do backend em config.vel_media_kmh)

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

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const kmMin = km => km == null ? null : Math.max(1, Math.round((km / VEL) * 60));
const fmtMin = m => m == null ? '—' : (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`);
const fmtKm = k => k == null ? '—' : `${k.toFixed(1)} km`;
function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M';
}

// Avatar do motoboy (foto com borda colorida; iniciais como fallback).
function avatarEl(m, size) {
  const cor = m.ocupado ? COR.vermelho : COR.verde;
  const box = el('div', { style: `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2.5px solid ${cor};background:${cor};color:#fff;font-weight:800;font-size:${Math.round(size * 0.34)}px;display:grid;place-items:center;flex-shrink:0` });
  if (m.foto_url) {
    const img = el('img', { src: m.foto_url, style: 'width:100%;height:100%;object-fit:cover' });
    img.onerror = () => { box.textContent = iniciais(m.nome); };
    box.append(img);
  } else {
    box.textContent = iniciais(m.nome);
  }
  return box;
}

function pinLoja() {
  return window.L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:9px;background:#fff;border:2px solid ${COR.navy};display:grid;place-items:center;font-size:19px;box-shadow:0 2px 8px rgba(0,0,0,.28)">🏪</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}
function pinMotoboy(m) {
  const cor = m.ocupado ? COR.vermelho : COR.verde;
  const ini = iniciais(m.nome);
  const inner = m.foto_url
    ? `<img src="${m.foto_url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentNode.style.background='${cor}';this.parentNode.style.color='#fff';this.parentNode.style.fontWeight='800';this.parentNode.style.fontSize='12px';this.parentNode.style.display='grid';this.parentNode.style.placeItems='center';this.parentNode.textContent='${ini}'">`
    : ini;
  const badge = m.ocupado
    ? `<div style="position:absolute;top:-5px;right:-6px;background:${cor};color:#fff;border:2px solid #fff;border-radius:10px;min-width:17px;height:17px;display:grid;place-items:center;font-size:9px;font-weight:800;padding:0 3px">${m.entregas_ativas}</div>`
    : '';
  return window.L.divIcon({
    className: '',
    html: `<div style="position:relative;width:42px;height:42px">
      <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid ${cor};background:${cor};color:#fff;font-weight:800;font-size:12px;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.3)">${inner}</div>${badge}
    </div>`,
    iconSize: [42, 42], iconAnchor: [21, 21],
  });
}

export async function montar(container) {
  document.title = 'Mapa em tempo real — logix';
  await garantirLeaflet();

  // ── Layout tela cheia: mapa + painel lateral ──
  const mapaDiv = el('div', { style: 'position:absolute;inset:0' });
  const painel = el('div', { style: `position:absolute;top:0;right:0;bottom:0;width:340px;max-width:90vw;
    background:#fff;border-left:1px solid ${COR.linha};box-shadow:-4px 0 24px rgba(4,44,83,.10);
    transform:translateX(100%);transition:transform .22s ease;z-index:1000;display:flex;flex-direction:column;overflow:hidden` });
  const painelHead = el('div', { style: `padding:16px 18px;border-bottom:1px solid ${COR.linha};display:flex;align-items:center;gap:10px` });
  const painelBody = el('div', { style: 'padding:14px 18px;overflow-y:auto;flex:1' });
  const fechar = el('button', { style: 'margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#8ba5bc;line-height:1',
    onClick: () => { painel.style.transform = 'translateX(100%)'; selecionado = null; } }, '×');
  painel.append(painelHead, painelBody);

  const titulo = el('div', { style: `position:absolute;top:14px;left:14px;z-index:900;background:#fff;border:1px solid ${COR.linha};
    border-radius:12px;padding:10px 14px;box-shadow:0 2px 10px rgba(4,44,83,.08);display:flex;align-items:center;gap:10px` },
    el('div', { style: `width:30px;height:30px;border-radius:8px;background:${COR.navy};color:#fff;display:grid;place-items:center;font-weight:800;font-size:12px` }, 'LX'),
    el('div', {}, el('div', { style: 'font-weight:800;font-size:14px;color:#0e2138' }, 'Mapa em tempo real'),
      el('div', { id: 'mapa-status', style: 'font-size:11px;color:#8ba5bc' }, 'Carregando…')));

  const legenda = el('div', { style: `position:absolute;left:14px;bottom:14px;z-index:900;background:#fff;border:1px solid ${COR.linha};
    border-radius:12px;padding:10px 14px;box-shadow:0 2px 10px rgba(4,44,83,.08);font-size:11px;color:#46637f;display:flex;flex-direction:column;gap:5px` },
    el('div', { style: 'display:flex;align-items:center;gap:7px' }, el('span', { style: 'font-size:14px' }, '🏪'), 'Loja'),
    el('div', { style: 'display:flex;align-items:center;gap:7px' }, el('span', { style: `width:14px;height:14px;border-radius:50%;border:3px solid ${COR.verde};box-sizing:border-box` }), 'Motoboy livre'),
    el('div', { style: 'display:flex;align-items:center;gap:7px' }, el('span', { style: `width:14px;height:14px;border-radius:50%;border:3px solid ${COR.vermelho};box-sizing:border-box` }), 'Motoboy em corrida'));

  const wrap = el('div', { style: 'position:fixed;inset:0;background:#eef4fb' }, mapaDiv, titulo, legenda, painel);
  container.append(wrap);

  const mapa = window.L.map(mapaDiv, { center: [-12.97, -38.5], zoom: 13, zoomControl: false });
  window.L.control.zoom({ position: 'bottomright' }).addTo(mapa);
  window.L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png', {
    attribution: '© OpenStreetMap, © CARTO', maxZoom: 20,
  }).addTo(mapa);

  let dados = { lojas: [], motoboys: [] };
  let markersLoja = {}, markersMb = {};
  let selecionado = null; // { tipo:'loja'|'motoboy', id }
  let primeiraVez = true;

  // ── Painéis de detalhe ──
  function abrirPainelMotoboy(m) {
    selecionado = { tipo: 'motoboy', id: m.id };
    painelHead.innerHTML = '';
    painelHead.append(
      avatarEl(m, 38),
      el('div', { style: 'min-width:0' },
        el('div', { style: 'font-weight:800;font-size:14px;color:#0e2138;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, m.nome),
        el('div', { style: 'font-size:11px;color:#8ba5bc' }, m.ocupado ? `Em corrida · ${m.entregas_ativas} ativa(s)` : 'Disponível')),
      fechar);
    painelBody.innerHTML = '';

    if (m.ocupado) {
      painelBody.append(
        el('div', { style: `background:#f6faff;border:1px solid ${COR.linha};border-radius:12px;padding:13px 15px;margin-bottom:14px` },
          el('div', { style: 'font-size:11px;color:#8ba5bc;font-weight:700;text-transform:uppercase;letter-spacing:.04em' }, 'Conclui em ~'),
          el('div', { style: `font-size:24px;font-weight:800;color:${COR.azul};line-height:1.1;margin-top:2px` }, fmtMin(m.eta_conclusao_min)),
          el('div', { style: 'font-size:12px;color:#46637f;margin-top:2px' }, `${fmtKm(m.km_restante)} restantes · ${m.corridas.length} corrida(s)`)));
      m.corridas.forEach(c => painelBody.append(
        el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:#46637f' },
          el('b', { style: 'color:#0e2138' }, c.protocolo), el('span', {}, '·'), el('span', {}, c.status.replace(/_/g, ' ')))));
    } else {
      painelBody.append(el('div', { style: `background:#e7f6ef;border:1px solid #b9e6cf;border-radius:12px;padding:13px 15px;margin-bottom:14px;font-size:13px;color:${COR.verde};font-weight:700` },
        '✓ Livre agora — pronto para um novo serviço'));
    }

    // Lojas mais próximas a partir de onde ele fica livre.
    const origem = m.posicao_livre || { lat: m.lat, lng: m.lng };
    const prox = dados.lojas.map(l => {
      const km = haversineKm(origem, l);
      return km == null ? null : { nome: l.nome, km, min: kmMin(km) };
    }).filter(Boolean).sort((a, b) => a.km - b.km).slice(0, 6);

    painelBody.append(el('div', { style: 'font-size:11px;color:#8ba5bc;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:6px 0 8px' },
      m.ocupado ? 'Lojas mais próximas (após concluir)' : 'Lojas mais próximas'));
    if (!prox.length) painelBody.append(el('div', { style: 'font-size:12px;color:#8ba5bc' }, 'Nenhuma loja com endereço.'));
    prox.forEach(l => painelBody.append(linhaProx(l.nome, l.km, l.min)));
  }

  function abrirPainelLoja(l) {
    selecionado = { tipo: 'loja', id: l.id };
    painelHead.innerHTML = '';
    painelHead.append(
      el('div', { style: `width:38px;height:38px;border-radius:9px;background:${COR.navy};color:#fff;display:grid;place-items:center` },
        el('span', { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>' })),
      el('div', { style: 'min-width:0' },
        el('div', { style: 'font-weight:800;font-size:14px;color:#0e2138;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, l.nome),
        el('div', { style: 'font-size:11px;color:#8ba5bc' }, 'Loja')),
      fechar);
    painelBody.innerHTML = '';

    // Motoboys mais próximos da loja (usa a posição livre de cada um).
    const prox = dados.motoboys.map(m => {
      const origem = m.posicao_livre || { lat: m.lat, lng: m.lng };
      const km = haversineKm(origem, l);
      return km == null ? null : { m, km, min: kmMin(km) };
    }).filter(Boolean).sort((a, b) => a.km - b.km).slice(0, 8);

    painelBody.append(el('div', { style: 'font-size:11px;color:#8ba5bc;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:2px 0 8px' }, 'Motoboys mais próximos'));
    if (!prox.length) painelBody.append(el('div', { style: 'font-size:12px;color:#8ba5bc' }, 'Nenhum motoboy online no momento.'));
    prox.forEach(({ m, km, min }) => painelBody.append(
      el('div', { style: `display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid ${COR.linha}` },
        avatarEl(m, 30),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:700;font-size:13px;color:#0e2138;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, m.nome),
          el('div', { style: 'font-size:11px;color:#8ba5bc' }, m.ocupado ? `Livre em ~${fmtMin(m.eta_conclusao_min)}` : 'Livre agora')),
        el('div', { style: 'text-align:right;flex-shrink:0' },
          el('div', { style: `font-weight:800;font-size:13px;color:${COR.azul}` }, fmtMin(min)),
          el('div', { style: 'font-size:10px;color:#8ba5bc' }, fmtKm(km))))));
  }

  function linhaProx(nome, km, min) {
    return el('div', { style: `display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid ${COR.linha}` },
      el('div', { style: `width:26px;height:26px;border-radius:7px;background:${COR.azulC};display:grid;place-items:center;flex-shrink:0` },
        el('span', { html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#185FA5" stroke-width="2"><path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>' })),
      el('div', { style: 'flex:1;min-width:0;font-weight:700;font-size:13px;color:#0e2138;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, nome),
      el('div', { style: 'text-align:right;flex-shrink:0' },
        el('div', { style: `font-weight:800;font-size:13px;color:${COR.azul}` }, fmtMin(min)),
        el('div', { style: 'font-size:10px;color:#8ba5bc' }, fmtKm(km))));
  }

  function abrirSelecionado() {
    if (!selecionado) return;
    if (selecionado.tipo === 'motoboy') { const m = dados.motoboys.find(x => x.id === selecionado.id); if (m) abrirPainelMotoboy(m); }
    else { const l = dados.lojas.find(x => x.id === selecionado.id); if (l) abrirPainelLoja(l); }
    painel.style.transform = 'translateX(0)';
  }

  function desenhar() {
    // Lojas
    const vistasLoja = new Set();
    dados.lojas.forEach(l => {
      vistasLoja.add(l.id);
      if (markersLoja[l.id]) { markersLoja[l.id].setLatLng([l.lat, l.lng]); return; }
      const mk = window.L.marker([l.lat, l.lng], { icon: pinLoja(l.nome) }).addTo(mapa);
      mk.bindTooltip(l.nome, { direction: 'top', offset: [0, -16] });
      mk.on('click', () => { abrirPainelLoja(l); painel.style.transform = 'translateX(0)'; });
      markersLoja[l.id] = mk;
    });
    Object.keys(markersLoja).forEach(id => { if (!vistasLoja.has(id)) { markersLoja[id].remove(); delete markersLoja[id]; } });

    // Motoboys
    const vistasMb = new Set();
    dados.motoboys.forEach(m => {
      if (m.lat == null) return;
      vistasMb.add(m.id);
      if (markersMb[m.id]) { markersMb[m.id].setLatLng([m.lat, m.lng]); markersMb[m.id].setIcon(pinMotoboy(m)); }
      else {
        const mk = window.L.marker([m.lat, m.lng], { icon: pinMotoboy(m), zIndexOffset: 200 }).addTo(mapa);
        mk.bindTooltip(m.nome, { direction: 'top', offset: [0, -18] });
        mk.on('click', () => { abrirPainelMotoboy(m); painel.style.transform = 'translateX(0)'; });
        markersMb[m.id] = mk;
      }
    });
    Object.keys(markersMb).forEach(id => { if (!vistasMb.has(id)) { markersMb[id].remove(); delete markersMb[id]; } });

    // Reabre o painel do item selecionado com dados frescos.
    if (selecionado) abrirSelecionado();

    // Enquadra tudo na primeira carga.
    if (primeiraVez) {
      const pts = [...dados.lojas.map(l => [l.lat, l.lng]), ...dados.motoboys.filter(m => m.lat != null).map(m => [m.lat, m.lng])];
      if (pts.length) mapa.fitBounds(pts, { padding: [60, 60], maxZoom: 14 });
      primeiraVez = false;
    }
  }

  async function carregar() {
    try {
      const r = await get('/mapa/overview');
      VEL = r.config?.vel_media_kmh || VEL;
      dados = { lojas: r.lojas || [], motoboys: r.motoboys || [] };
      const online = dados.motoboys.length;
      document.getElementById('mapa-status').textContent =
        `${dados.lojas.length} loja(s) · ${online} motoboy(s) online · atualizado ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      desenhar();
    } catch (e) {
      const st = document.getElementById('mapa-status');
      if (st) st.textContent = e.message || 'Erro ao carregar';
    }
  }

  await carregar();
  const intervalo = setInterval(carregar, 15000);

  // WebSocket: move os motoboys em tempo real conforme reportam posição.
  let ws;
  try {
    const token = getToken();
    if (token) {
      const base = (window.LOGIX_API || '/api/v1');
      const httpBase = base.startsWith('http') ? base : (location.origin + base);
      const wsUrl = httpBase.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const { evento, dados: d } = JSON.parse(ev.data);
          if (evento === 'motoboy.posicao' && d?.motoboyId) {
            const m = dados.motoboys.find(x => x.id === d.motoboyId);
            if (m && d.lat != null) { m.lat = d.lat; m.lng = d.lng; if (markersMb[m.id]) markersMb[m.id].setLatLng([d.lat, d.lng]); }
          } else if (['entrega.atribuida', 'entrega.concluida', 'entrega.status', 'oferta.disparada'].includes(evento)) {
            carregar(); // mudança de carga: recarrega os ETAs
          }
        } catch {}
      };
    }
  } catch {}

  // Limpa quando sair da rota.
  window.addEventListener('hashchange', function limpar() {
    clearInterval(intervalo);
    try { ws?.close(); } catch {}
    window.removeEventListener('hashchange', limpar);
  });
}
