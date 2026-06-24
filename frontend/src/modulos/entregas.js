import { casca } from '../core/layout.js';
import { el, statusBadge } from '../core/ui.js';
import { get, post, patch, getToken } from '../core/api.js';
import * as auth from '../core/auth.js';

const BASE = window.LOGIX_API || '/api/v1';

// ── Cache de geocoding (evita requisições repetidas) ──────────────────────────
const _geoCache = new Map();
async function geocode(q) {
  const k = q.trim().toLowerCase();
  if (_geoCache.has(k)) return _geoCache.get(k);
  const r = await get('/entregas/geocode?q=' + encodeURIComponent(q));
  const resultado = r.resultados || [];
  _geoCache.set(k, resultado);
  return resultado;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function getComp(componentes, tipo) {
  return (componentes || []).find(c => c.types?.includes(tipo))?.long_name || '';
}
function getCompShort(componentes, tipo) {
  return (componentes || []).find(c => c.types?.includes(tipo))?.short_name || '';
}

// ── MAPA ──────────────────────────────────────────────────────────────────────
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

function pinIcon(txt, cor) {
  return window.L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${cor};border:3px solid #fff;display:grid;place-items:center;font-weight:800;font-size:12px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${txt}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

function criarMapa(div) {
  let map = null, poly = null, markers = [];

  async function init() {
    if (map) return;
    await garantirLeaflet();
    map = window.L.map(div, { center: [-12.97, -38.5], zoom: 13, scrollWheelZoom: true });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
  }

  function limpar() {
    markers.forEach(m => m.remove()); markers = [];
    if (poly) { poly.remove(); poly = null; }
  }

  async function renderizar(coleta, destinos) {
    await init();
    limpar();
    const L = window.L;
    const todos = [coleta, ...destinos].filter(p => p?.lat);
    if (!todos.length) return null;
    if (coleta?.lat) markers.push(L.marker([coleta.lat, coleta.lng], { icon: pinIcon('C', '#042C53') }).bindPopup(`<b>Coleta</b>`).addTo(map));
    destinos.forEach((d, i) => { if (d?.lat) markers.push(L.marker([d.lat, d.lng], { icon: pinIcon(i+1, '#185FA5') }).bindPopup(`<b>Destino ${i+1}</b>`).addTo(map)); });
    try {
      const r = await fetch(`${BASE}/entregas/geocode-rota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ pontos: todos.map(p => ({ lat: p.lat, lng: p.lng })) }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.geom?.length) {
          poly = L.polyline(d.geom, { color: '#185FA5', weight: 5, dashArray: '6 10', lineCap: 'round' }).addTo(map);
          map.fitBounds(poly.getBounds(), { padding: [40, 40] });
          return d;
        }
      }
    } catch {}
    if (todos.length > 1) { poly = L.polyline(todos.map(p => [p.lat, p.lng]), { color: '#185FA5', weight: 4, dashArray: '6 10' }).addTo(map); if (poly) map.fitBounds(poly.getBounds(), { padding: [40, 40] }); }
    else map.setView([todos[0].lat, todos[0].lng], 15);
    return null;
  }

  async function renderizarExistente(id) {
    await init(); limpar();
    try {
      const r = await get('/entregas/' + id + '/rota');
      if (r.coleta?.lat) markers.push(window.L.marker([r.coleta.lat, r.coleta.lng], { icon: pinIcon('C', '#042C53') }).addTo(map));
      (r.pontos||[]).forEach((p,i) => { if (p.lat) markers.push(window.L.marker([p.lat, p.lng], { icon: pinIcon(i+1,'#185FA5') }).addTo(map)); });
      if (r.coords?.length) { poly = window.L.polyline(r.coords, { color:'#185FA5', weight:5, dashArray:'6 10', lineCap:'round' }).addTo(map); map.fitBounds(poly.getBounds(), { padding:[40,40] }); }
      return r;
    } catch { return null; }
  }

  function invalidar() { if (map) setTimeout(() => map.invalidateSize(), 50); }
  function destruir() { if (map) { map.remove(); map = null; } }
  return { init, renderizar, renderizarExistente, limpar, invalidar, destruir };
}

// ── MODAL: NÚMERO OBRIGATÓRIO ─────────────────────────────────────────────────
function modalNumero(sugestao, onConfirmar) {
  const inp = el('input', {
    style: 'width:100%;padding:10px 13px;border:1.5px solid var(--lx-azul-primario);border-radius:9px;font-size:15px;font-weight:700;letter-spacing:.04em;text-align:center;outline:none',
    placeholder: '123',
    type: 'text',
  });
  const btnSN = el('button', { style: 'padding:8px 14px;border-radius:8px;border:1px solid var(--lx-linha);background:none;cursor:pointer;font-size:12px;color:var(--lx-tinta-2)', onClick: () => { inp.value = 'S/N'; confirmar(); }}, 'S/N (sem número)');
  const btnOk = el('button', { style: 'padding:9px 20px;border-radius:8px;background:var(--lx-azul-primario);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700', onClick: confirmar }, 'Confirmar');
  const msg = el('div', { style: 'font-size:12px;color:var(--lx-erro);min-height:16px;text-align:center;margin-top:4px' });

  async function confirmar() {
    const num = inp.value.trim();
    if (!num) { msg.textContent = 'Informe o número ou clique em S/N'; return; }
    btnOk.disabled = true; btnOk.textContent = 'Buscando…';
    try {
      // Re-buscar com número para coordenadas precisas
      const comp = sugestao.componentes || [];
      const rua = getComp(comp, 'route') || (sugestao.endereco || '').split(/[-,]/)[0].trim();
      const cidade = getComp(comp, 'administrative_area_level_2') || sugestao.cidade || '';
      const busca = num === 'S/N' ? sugestao.endereco : `${rua} ${num} ${cidade}`;
      const resultados = await geocode(busca);
      if (resultados.length) {
        const r = resultados[0];
        ov.remove();
        onConfirmar({
          ...r,
          numero: getComp(r.componentes, 'street_number') || num,
          endereco_completo: r.endereco || r.label,
        });
      } else {
        // Fallback: usar sugestão original com número manual no texto
        ov.remove();
        onConfirmar({ ...sugestao, numero: num, endereco_completo: sugestao.endereco + ', ' + num });
      }
    } catch {
      ov.remove();
      onConfirmar({ ...sugestao, numero: num });
    }
  }

  inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar(); });

  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.5);z-index:2000;display:flex;align-items:center;justify-content:center' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:26px;width:360px;box-shadow:0 24px 60px -15px rgba(4,44,83,.45)' },
    el('b', { style: 'font-size:15px;color:var(--lx-tinta);display:block;margin-bottom:5px' }, 'Informe o número'),
    el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-bottom:16px' }, sugestao.endereco || sugestao.label),
    inp, msg,
    el('div', { style: 'display:flex;gap:8px;margin-top:14px;justify-content:space-between;align-items:center' }, btnSN, btnOk));
  ov.append(box);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov);
  setTimeout(() => inp.focus(), 50);
}

// ── MODAL: AJUSTAR POSIÇÃO NO MAPA ────────────────────────────────────────────
async function modalAjusteMapa(enderecoInicial, onConfirmar, onPular) {
  await garantirLeaflet();
  const L = window.L;

  const mapDiv = el('div', { style: 'width:100%;height:300px;border-radius:9px;overflow:hidden' });
  const enderecoEl = el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);min-height:18px;text-align:center;margin-top:6px' }, enderecoInicial.endereco || enderecoInicial.label || '');

  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.5);z-index:2000;display:flex;align-items:center;justify-content:center' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:22px;width:500px;max-width:96vw;box-shadow:0 24px 60px -15px rgba(4,44,83,.45)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px' },
      el('b', { style: 'font-size:15px;color:var(--lx-tinta)' }, 'Confirmar posição no mapa'),
      el('button', { style: 'font-size:20px;background:none;border:none;cursor:pointer;color:var(--lx-tinta-2)', onClick: () => { ov.remove(); if (onPular) onPular(); }}, '×')),
    el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-bottom:10px' }, 'Arraste o marcador para ajustar a posição exata.'),
    mapDiv, enderecoEl,
    el('div', { style: 'display:flex;gap:8px;margin-top:14px;justify-content:flex-end' },
      el('button', { style: 'padding:9px 16px;border:0.5px solid var(--lx-linha);border-radius:8px;background:none;cursor:pointer;font-size:13px', onClick: () => { ov.remove(); if (onPular) onPular(); }}, 'Usar sem ajustar'),
      el('button', { id: 'lx-ajuste-confirmar', style: 'padding:9px 18px;background:var(--lx-azul-primario);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer' }, 'Confirmar posição')));

  ov.append(box);
  document.body.append(ov);

  // Iniciar mapa
  const map = L.map(mapDiv, { center: [enderecoInicial.lat, enderecoInicial.lng], zoom: 17, scrollWheelZoom: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);

  const marker = L.marker([enderecoInicial.lat, enderecoInicial.lng], { draggable: true }).addTo(map);
  let posAtual = { lat: enderecoInicial.lat, lng: enderecoInicial.lng };

  marker.on('dragend', async () => {
    const pos = marker.getLatLng();
    posAtual = { lat: pos.lat, lng: pos.lng };
    // Geocode reverso para mostrar o endereço
    try {
      const r = await geocode(`${pos.lat},${pos.lng}`);
      if (r.length) enderecoEl.textContent = r[0].endereco || r[0].label || '';
    } catch {}
  });

  document.getElementById('lx-ajuste-confirmar').addEventListener('click', () => {
    ov.remove(); map.remove();
    onConfirmar({ ...enderecoInicial, lat: posAtual.lat, lng: posAtual.lng });
  });
}

// ── PAINEL LATERAL ENDEREÇOS SALVOS ──────────────────────────────────────────
function PainelSalvos({ onSelecionar, onFechar }) {
  const filtro = el('input', { style: 'width:100%;padding:9px 12px;border:0.5px solid var(--lx-linha);border-radius:8px;font-size:13px;background:var(--lx-superficie)', placeholder: 'Filtrar endereços...' });
  const lista = el('div', { style: 'display:flex;flex-direction:column;overflow-y:auto;flex:1' });

  async function carregar(q) {
    lista.innerHTML = '';
    lista.append(el('div', { style: 'padding:12px;font-size:12px;color:var(--lx-tinta-2)' }, 'Carregando…'));
    try {
      const r = await get('/entregas/enderecos-salvos' + (q ? '?q=' + encodeURIComponent(q) : ''));
      lista.innerHTML = '';
      if (!r.length) { lista.append(el('div', { style: 'padding:20px;text-align:center;font-size:13px;color:var(--lx-tinta-2)' }, 'Nenhum endereço salvo.')); return; }
      r.forEach(s => {
        const row = el('div', { style: 'display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-bottom:0.5px solid var(--lx-linha);cursor:pointer' });
        row.addEventListener('mouseenter', () => row.style.background = 'var(--lx-superficie-2)');
        row.addEventListener('mouseleave', () => row.style.background = '');
        row.addEventListener('click', () => { onSelecionar(s); onFechar(); });
        row.append(
          el('div', { style: `width:36px;height:36px;border-radius:9px;background:${s.is_coleta_padrao?'var(--lx-azul-profundo)':'var(--lx-info-bg)'};display:grid;place-items:center;flex:none;color:${s.is_coleta_padrao?'#fff':'var(--lx-azul-primario)'}`, html: s.is_coleta_padrao ? '<i class="ti ti-home-check" style="font-size:17px"></i>' : '<i class="ti ti-bookmark" style="font-size:16px"></i>' }),
          el('div', { style: 'flex:1;min-width:0' },
            el('b', { style: 'font-size:13px;font-weight:700;color:var(--lx-tinta);display:flex;align-items:center;gap:6px' },
              s.apelido,
              s.is_coleta_padrao ? el('span', { style: 'font-size:10px;background:var(--lx-azul-profundo);color:#fff;padding:2px 6px;border-radius:4px;font-weight:600' }, 'PADRÃO') : el('span', {})),
            el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, s.endereco_completo || ''),
            el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:1px' }, [s.bairro, s.cidade, s.uf].filter(Boolean).join(' · '))),
          el('span', { style: 'font-size:10px;color:var(--lx-tinta-3);white-space:nowrap;margin-top:2px' }, s.uso_count + 'x'));
        lista.append(row);
      });
    } catch {}
  }

  let _t = null;
  filtro.addEventListener('input', () => { clearTimeout(_t); _t = setTimeout(() => carregar(filtro.value.trim()), 300); });

  if (!document.getElementById('lx-slide-style')) {
    const s = document.createElement('style'); s.id = 'lx-slide-style';
    s.textContent = '@keyframes lx-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}';
    document.head.append(s);
  }

  const painel = el('div', { style: 'position:fixed;top:0;right:0;bottom:0;width:360px;background:var(--lx-superficie);border-left:1px solid var(--lx-linha);z-index:500;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(4,44,83,.15);animation:lx-slide-in .2s ease-out' },
    el('div', { style: 'padding:16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between;flex:none' },
      el('b', { style: 'font-size:15px;font-weight:700;color:var(--lx-tinta)' }, 'Meus endereços'),
      el('button', { style: 'font-size:22px;color:var(--lx-tinta-2);background:none;border:none;cursor:pointer', onClick: onFechar }, '×')),
    el('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--lx-linha);flex:none' }, filtro),
    lista);

  const overlay = el('div', { style: 'position:fixed;inset:0;z-index:499', onClick: onFechar });
  document.body.append(overlay, painel);
  carregar('');
  return { destruir: () => { painel.remove(); overlay.remove(); } };
}

// ── MODAL: CONFIRMAR CANCELAR ─────────────────────────────────────────────────
function confirmarCancelar(e, onConfirmado) {
  const motivo = el('textarea', { style: 'width:100%;padding:9px 11px;border:0.5px solid var(--lx-linha);border-radius:8px;font-size:13px;resize:none;min-height:64px', placeholder: 'Motivo (opcional)' });
  const btnSim = el('button', { style: 'padding:9px 18px;background:var(--lx-erro);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer', onClick: async () => {
    btnSim.disabled = true; btnSim.textContent = 'Cancelando…';
    try {
      await patch('/entregas/' + e.id + '/cancelar', { motivo: motivo.value.trim() || undefined });
      toast('Entrega ' + e.protocolo + ' cancelada.', 'ok');
      ov.remove(); if (onConfirmado) onConfirmado();
    } catch (err) { toast(err.message, 'erro'); btnSim.disabled = false; btnSim.textContent = 'Confirmar cancelamento'; }
  }}, 'Confirmar cancelamento');
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);z-index:1000;display:flex;align-items:center;justify-content:center' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:24px;width:400px;max-width:95vw;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('b', { style: 'font-size:15px;color:var(--lx-tinta);display:block;margin-bottom:6px' }, 'Cancelar ' + (e.protocolo||'entrega') + '?'),
    el('div', { style: 'font-size:13px;color:var(--lx-tinta-2);margin-bottom:14px' }, 'Esta ação não pode ser desfeita.'),
    motivo,
    el('div', { style: 'display:flex;gap:8px;margin-top:14px;justify-content:flex-end' },
      el('button', { style: 'padding:9px 16px;border:0.5px solid var(--lx-linha);border-radius:8px;background:none;cursor:pointer;font-size:13px', onClick: () => ov.remove() }, 'Manter entrega'),
      btnSim));
  ov.append(box);
  ov.addEventListener('click', ev => { if (ev.target === ov) ov.remove(); });
  document.body.append(ov);
}

// ── CAMPO DE BUSCA DE ENDEREÇO ────────────────────────────────────────────────
function CampoBusca({ onConfirmar, onLimpar }) {
  let _confirmado = null;
  let _timerSalvos = null;
  let _timerGeo = null;

  const inp = el('input', {
    style: 'flex:1;min-width:0;background:transparent;border:none;outline:none;font-size:13px;color:var(--lx-tinta)',
    placeholder: 'Digite apelido ou endereço...'
  });

  // FIX VISUAL: botões sempre flex:none, nunca quebram linha
  const btnBuscar = el('button', {
    style: 'width:30px;height:30px;border-radius:7px;background:var(--lx-azul-primario);color:#fff;border:none;cursor:pointer;display:grid;place-items:center;flex:none;flex-shrink:0',
    title: 'Buscar endereço',
    html: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`
  });
  const btnFav = el('button', {
    style: 'width:30px;height:30px;border-radius:7px;background:var(--lx-info-bg);color:var(--lx-azul-primario);border:0.5px solid var(--lx-azul-claro);cursor:pointer;display:grid;place-items:center;flex:none;flex-shrink:0;font-size:15px',
    title: 'Endereços salvos',
    html: '<i class="ti ti-bookmark" style="font-size:14px"></i>'
  });

  const dropSalvos = el('div', { style: 'display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);z-index:200;max-height:240px;overflow-y:auto;box-shadow:var(--lx-sombra)' });
  const dropGeo = el('div', { style: 'display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);z-index:200;max-height:240px;overflow-y:auto;box-shadow:var(--lx-sombra)' });
  const confirmadoWrap = el('div', { style: 'display:none' });

  function fecharDrops() { dropSalvos.style.display = 'none'; dropGeo.style.display = 'none'; }

  function rowItem(ico, titulo, sub, onClick) {
    const row = el('div', { style: 'display:flex;align-items:center;gap:9px;padding:9px 12px;cursor:pointer;border-bottom:0.5px solid var(--lx-linha)' });
    row.addEventListener('mouseenter', () => row.style.background = 'var(--lx-superficie-2)');
    row.addEventListener('mouseleave', () => row.style.background = '');
    row.addEventListener('click', onClick);
    // ico pode ser HTML string (ícone Tabler) — usar innerHTML
    const icoEl = document.createElement('span');
    icoEl.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;flex:none;color:var(--lx-tinta-3)';
    icoEl.innerHTML = ico;
    row.append(
      icoEl,
      el('div', { style: 'flex:1;min-width:0' },
        el('b', { style: 'font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--lx-tinta)' }, titulo),
        el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, sub)));
    return row;
  }

  async function buscarSalvos(q) {
    if (!q || q.length < 1) { dropSalvos.style.display = 'none'; return; }
    try {
      const r = await get('/entregas/enderecos-salvos?q=' + encodeURIComponent(q));
      dropSalvos.innerHTML = '';
      if (!r.length) { dropSalvos.style.display = 'none'; return; }
      r.forEach(s => dropSalvos.append(rowItem('<i class="ti ti-bookmark" style="font-size:13px"></i>', s.apelido, (s.endereco_completo||'').slice(0,50), () => confirmar(s))));
      dropGeo.style.display = 'none';
      dropSalvos.style.display = 'block';
    } catch {}
  }

  // Busca geocoding com número obrigatório se não vier do Google
  async function buscarGeo(q) {
    if (q.length < 5) return;
    btnBuscar.disabled = true;
    try {
      const resultados = await geocode(q);
      dropGeo.innerHTML = '';
      if (!resultados.length) { dropGeo.style.display = 'none'; btnBuscar.disabled = false; return; }
      resultados.forEach(r => {
        dropGeo.append(rowItem('<i class="ti ti-map-pin" style="font-size:13px"></i>', r.label || r.endereco, [r.bairro, r.cidade, r.uf].filter(Boolean).join(' · '), () => {
          fecharDrops();
          if (!r.tem_numero) {
            // Número obrigatório — pede antes de confirmar
            modalNumero(r, enderecoFinal => {
              confirmar(enderecoFinal);
              modalAjusteMapa(enderecoFinal, ajustado => confirmar(ajustado), () => {});
            });
          } else {
            confirmar(r);
            modalAjusteMapa(r, ajustado => confirmar(ajustado), () => {});
          }
        }));
      });
      dropSalvos.style.display = 'none';
      dropGeo.style.display = 'block';
    } catch {}
    btnBuscar.disabled = false;
  }

  function confirmar(r) {
    _confirmado = r;
    fecharDrops();
    inpRow.style.display = 'none';
    confirmadoWrap.style.display = 'block';
    confirmadoWrap.innerHTML = '';
    confirmadoWrap.append(
      el('div', { style: 'display:flex;align-items:flex-start;gap:8px;padding:9px 11px;background:var(--lx-info-bg);border-radius:var(--lx-raio-sm)' },
        el('i', { class: 'ti ti-map-pin', style: 'font-size:16px;flex:none;margin-top:1px;color:var(--lx-azul-primario)' }),
        el('div', { style: 'flex:1;min-width:0' },
          el('b', { style: 'font-size:12.5px;color:var(--lx-azul-profundo);display:block' }, r.apelido || r.label || r.endereco_completo || '—'),
          r.numero ? el('div', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:600' }, 'Nº ' + r.numero) : el('span', {}),
          el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, [r.bairro, r.cidade, r.uf].filter(Boolean).join(' · '))),
        el('button', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:700;cursor:pointer;background:none;border:none;white-space:nowrap;flex:none', onClick: () => {
          _confirmado = null;
          inpRow.style.display = '';
          confirmadoWrap.style.display = 'none';
          inp.value = '';
          if (onLimpar) onLimpar();
        }}, 'Trocar')));
    if (onConfirmar) onConfirmar(r);
  }

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    clearTimeout(_timerSalvos); clearTimeout(_timerGeo);
    if (!q) { fecharDrops(); return; }
    _timerSalvos = setTimeout(() => buscarSalvos(q), 300);
    if (q.length >= 5) _timerGeo = setTimeout(() => buscarGeo(q), 800);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { buscarGeo(inp.value.trim()); } if (e.key === 'Escape') fecharDrops(); });
  btnBuscar.addEventListener('click', () => buscarGeo(inp.value.trim()));
  btnFav.addEventListener('click', () => { const p = PainelSalvos({ onSelecionar: r => confirmar(r), onFechar: () => p.destruir() }); });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) fecharDrops(); }, true);

  // FIX VISUAL: inpRow com nowrap e gap fixo
  const inpRow = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);background:var(--lx-superficie);min-height:40px;flex-wrap:nowrap' },
    inp,
    el('div', { style: 'display:flex;gap:5px;align-items:center;flex:none;flex-shrink:0' }, btnBuscar, btnFav));

  const wrap = el('div', { style: 'position:relative' }, inpRow, dropSalvos, dropGeo, confirmadoWrap);
  wrap.obterValor = () => _confirmado;
  wrap._confirmarExterno = r => confirmar(r);
  wrap.resetar = () => {
    _confirmado = null; inp.value = '';
    inpRow.style.display = ''; confirmadoWrap.style.display = 'none'; confirmadoWrap.innerHTML = '';
    fecharDrops(); if (onLimpar) onLimpar();
  };
  wrap.resetarSemLimpar = () => {
    _confirmado = null; inp.value = '';
    inpRow.style.display = ''; confirmadoWrap.style.display = 'none'; confirmadoWrap.innerHTML = '';
    fecharDrops();
  };
  return wrap;
}

// ── PONTO DESTINO ─────────────────────────────────────────────────────────────
function PontoDestino(numero, onRemover, onAtualizar) {
  const dados = { lat: null, lng: null, endereco: null, numero: null, nome_fantasia: null, numero_nf: null, complemento: null, observacoes: null, telefone: null };

  // Painel de resumo dos extras — atualiza ao digitar
  const resumoExtras = el('div', { style: 'display:none;margin-top:5px;padding:6px 8px;background:var(--lx-superficie);border:0.5px solid var(--lx-linha);border-radius:7px' });

  function atualizarResumo() {
    const linhas = [
      dados.nome_fantasia ? ['ti-user', dados.nome_fantasia] : null,
      dados.numero_nf ? ['ti-file-text', 'NF ' + dados.numero_nf] : null,
      dados.complemento ? ['ti-building', dados.complemento] : null,
      dados.observacoes ? ['ti-message', dados.observacoes] : null,
      dados.telefone ? ['ti-phone', dados.telefone] : null,
    ].filter(Boolean);
    if (!linhas.length) { resumoExtras.style.display = 'none'; return; }
    resumoExtras.style.display = 'block';
    resumoExtras.innerHTML = '';
    linhas.forEach(([ico, txt]) => {
      const r = el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--lx-tinta-2);padding:1px 0' });
      r.append(el('i', { class: 'ti ' + ico, style: 'font-size:12px;flex:none;color:var(--lx-tinta-3)' }), document.createTextNode(txt));
      resumoExtras.append(r);
    });
  }

  const busca = CampoBusca({
    onConfirmar: r => { Object.assign(dados, { lat: r.lat, lng: r.lng, endereco: r.label || r.apelido || r.endereco_completo, numero: r.numero || null }); if (onAtualizar) onAtualizar(); },
    onLimpar: () => { dados.lat = null; dados.lng = null; if (onAtualizar) onAtualizar(); },
  });
  const extras = el('div', { style: 'display:none;flex-direction:column;gap:7px;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--lx-linha)' });
  function inp(ph, key) {
    const i = el('input', { style: 'width:100%;padding:7px 10px;border:0.5px solid var(--lx-linha);border-radius:7px;font-size:12.5px', placeholder: ph });
    i.addEventListener('input', () => { dados[key] = i.value.trim() || null; atualizarResumo(); });
    return el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-2);margin-bottom:3px;font-weight:600' }, ph), i);
  }
  extras.append(inp('Nome fantasia / destinatário', 'nome_fantasia'), inp('Nº NF / Pedido', 'numero_nf'), inp('Complemento', 'complemento'), inp('Obs. p/ motoboy', 'observacoes'), inp('Telefone do cliente', 'telefone'));
  const btnToggle = el('button', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:600;background:none;border:none;cursor:pointer;text-align:left;padding:2px 0;margin-top:2px', onClick: () => {
    const v = extras.style.display !== 'none'; extras.style.display = v ? 'none' : 'flex'; btnToggle.textContent = v ? '+ Adicionar detalhes (NF, obs.)' : '− Ocultar detalhes';
  }}, '+ Adicionar detalhes (NF, obs.)');
  const wrap = el('div', { style: 'background:var(--lx-superficie-2);border:0.5px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:11px 13px' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' },
      el('div', { style: 'display:flex;align-items:center;gap:7px' },
        el('div', { style: 'width:24px;height:24px;border-radius:50%;background:var(--lx-azul-primario);color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none' }, numero),
        el('b', { style: 'font-size:13px;color:var(--lx-tinta)' }, 'Ponto de entrega')),
      onRemover ? el('button', { style: 'color:var(--lx-tinta-3);font-size:20px;cursor:pointer;background:none;border:none;line-height:1', onClick: onRemover }, '×') : el('span', {})),
    busca, resumoExtras, extras, btnToggle);
  wrap.resetar = () => {
    Object.keys(dados).forEach(k => { dados[k] = null; });
    busca.resetar(); extras.style.display = 'none'; btnToggle.textContent = '+ Adicionar detalhes (NF, obs.)';
    extras.querySelectorAll('input').forEach(i => { i.value = ''; });
    resumoExtras.style.display = 'none'; resumoExtras.innerHTML = '';
  };
  wrap.obterDados = () => dados;
  wrap.obterBusca = () => busca;
  return wrap;
}

// ── TELA PRINCIPAL ────────────────────────────────────────────────────────────
export async function montar(container) {
  const abaAtiva = { val: 'nova' };
  let _entregas = [];
  let _mapa = null;
  let _pontos = [];
  let _mapaTimer = null;
  let _coletaPadrao = null;

  if (!document.getElementById('lx-ent-style')) {
    const s = document.createElement('style'); s.id = 'lx-ent-style';
    s.textContent = `.lx-ent-shell{display:flex;flex-direction:column;height:calc(100vh - 118px);overflow:hidden}.lx-ent-abas{display:flex;background:var(--lx-superficie);border-bottom:1px solid var(--lx-linha);padding:0 2px;flex:none}.lx-ent-aba{padding:11px 18px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;color:var(--lx-tinta-2);border-bottom:2.5px solid transparent;white-space:nowrap}.lx-ent-aba.on{color:var(--lx-azul-primario);border-bottom-color:var(--lx-azul-primario)}.lx-ent-body{display:grid;grid-template-columns:360px 1fr;flex:1;overflow:hidden}.lx-ent-side{overflow-y:auto;border-right:1px solid var(--lx-linha);background:var(--lx-superficie);display:flex;flex-direction:column}.lx-ent-mapa{position:relative;overflow:hidden}.lx-stats-pill{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);z-index:10;display:none;background:var(--lx-superficie);border-radius:10px;border:1px solid var(--lx-linha);overflow:hidden;box-shadow:var(--lx-sombra-sm);white-space:nowrap}.lx-stat-item{padding:9px 18px;text-align:center;border-right:1px solid var(--lx-linha);display:inline-block}.lx-stat-item:last-child{border-right:none}.lx-stat-item label{font-size:10px;color:var(--lx-tinta-2);display:block}.lx-stat-item b{font-size:16px;font-weight:700;color:var(--lx-tinta)}.lx-hist-card{padding:13px 14px;border-bottom:0.5px solid var(--lx-linha);cursor:pointer}.lx-hist-card:hover{background:var(--lx-superficie-2)}`;
    document.head.append(s);
  }

  // Abas
  const tabEls = {};
  const abasEl = el('div', { class: 'lx-ent-abas' });
  [{ id:'nova', label:'✦ Nova' },{ id:'ativas', label:'Ativas' },{ id:'concluidas', label:'Concluídas' },{ id:'canceladas', label:'Canceladas' }]
    .forEach(({ id, label }) => {
      const t = el('button', { class: 'lx-ent-aba' + (id==='nova'?' on':''), onClick: () => trocarAba(id) }, label);
      tabEls[id] = t; abasEl.append(t);
    });

  // Stats
  const statDist = el('b', { style: 'font-size:16px;font-weight:700;color:var(--lx-tinta)' }, '—');
  const statTempo = el('b', { style: 'font-size:16px;font-weight:700;color:var(--lx-tinta)' }, '—');
  const statParadas = el('b', { style: 'font-size:16px;font-weight:700;color:var(--lx-tinta)' }, '1');
  const statsPill = el('div', { class: 'lx-stats-pill' },
    el('div', { class: 'lx-stat-item' }, el('label', {}, 'Distância'), statDist),
    el('div', { class: 'lx-stat-item' }, el('label', {}, 'Tempo est.'), statTempo),
    el('div', { class: 'lx-stat-item' }, el('label', {}, 'Paradas'), statParadas));

  const mapaDiv = el('div', { style: 'width:100%;height:100%' });
  const mapaWrap = el('div', { class: 'lx-ent-mapa' }, mapaDiv, statsPill);

  // Coleta
  const buscaColeta = CampoBusca({
    onConfirmar: () => atualizarMapa(),
    onLimpar: () => { atualizarMapa(); },
  });

  // Carregar coleta padrão
  (async () => {
    try {
      const salvos = await get('/entregas/enderecos-salvos').catch(() => []);
      const pad = salvos.find(s => s.is_coleta_padrao);
      if (pad) { _coletaPadrao = pad; buscaColeta._confirmarExterno(pad); }
    } catch {}
  })();

  const pontosWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  function novoPonto() {
    const num = _pontos.length + 1;
    const p = PontoDestino(num,
      _pontos.length > 0 ? () => { _pontos = _pontos.filter(x => x !== p); pontosWrap.removeChild(p); atualizarMapa(); } : null,
      atualizarMapa);
    _pontos.push(p); pontosWrap.append(p);
  }
  novoPonto();

  const btnAddDest = el('button', { style: 'display:flex;align-items:center;gap:7px;padding:9px 13px;border:1.5px dashed var(--lx-linha);border-radius:var(--lx-raio-sm);background:none;cursor:pointer;color:var(--lx-tinta-2);font-size:12.5px;font-weight:600;width:100%', onClick: novoPonto },
    el('span', { style: 'font-size:18px;color:var(--lx-azul-primario);line-height:1' }, '+'), 'Adicionar destino');

  // Motoboy
  const modoAuto = { val: true };
  const mbId = { val: null };
  const mbListaWrap = el('div', { style: 'display:none;flex-direction:column;gap:5px;margin-top:8px;max-height:160px;overflow-y:auto' });
  const btnAuto = el('div', { style: 'flex:1;border:1.5px solid var(--lx-azul-vivo);background:var(--lx-info-bg);border-radius:9px;padding:10px 12px;cursor:pointer', onClick: () => { modoAuto.val=true; btnAuto.style.borderColor='var(--lx-azul-vivo)'; btnAuto.style.background='var(--lx-info-bg)'; btnManual.style.borderColor='var(--lx-linha)'; btnManual.style.background=''; mbListaWrap.style.display='none'; }},
    el('b', { style: 'font-size:12.5px;display:block' }, 'Automático'), el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Mais próximo (GPS)'));
  const btnManual = el('div', { style: 'flex:1;border:1.5px solid var(--lx-linha);border-radius:9px;padding:10px 12px;cursor:pointer', onClick: () => { modoAuto.val=false; btnManual.style.borderColor='var(--lx-azul-vivo)'; btnManual.style.background='var(--lx-info-bg)'; btnAuto.style.borderColor='var(--lx-linha)'; btnAuto.style.background=''; mbListaWrap.style.display='flex'; }},
    el('b', { style: 'font-size:12.5px;display:block' }, 'Manual'), el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Escolher da lista'));

  (async () => {
    try {
      const mbs = await get('/motoboys?online=true').catch(() => []);
      const CORES = ['#185FA5','#0F6E56','#534AB7','#854F0B'];
      mbs.filter(m => m.online && m.status!=='inativo').forEach((m,i) => {
        const ini = m.nome_completo.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
        const row = el('div', { style: 'display:flex;align-items:center;gap:9px;padding:8px 10px;border:1.5px solid var(--lx-linha);border-radius:8px;cursor:pointer', onClick: () => { mbId.val=m.id; mbListaWrap.querySelectorAll('[data-mb]').forEach(r=>{r.style.borderColor='var(--lx-linha)';r.style.background='';}); row.style.borderColor='var(--lx-azul-primario)'; row.style.background='var(--lx-info-bg)'; }});
        row.setAttribute('data-mb', m.id);
        row.append(el('div', { style: `width:28px;height:28px;border-radius:50%;background:${CORES[i%CORES.length]};color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none` }, ini), el('div', {}, el('b', { style: 'font-size:12px;display:block' }, m.nome_completo), el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `Online · ${m.carga||0}`)));
        mbListaWrap.append(row);
      });
      if (!mbs.filter(m=>m.online).length) mbListaWrap.append(el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);padding:4px 0' }, 'Nenhum online.'));
    } catch {}
  })();

  const msgCriar = el('div', { style: 'font-size:12px;min-height:16px;font-weight:600;text-align:center;margin-top:6px' });
  const btnCriar = el('button', { style: 'width:100%;padding:13px;background:var(--lx-azul-primario);color:#fff;border:none;border-radius:var(--lx-raio-sm);font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px', onClick: criarEntrega },
    el('span', { html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>` }), 'Solicitar entrega');

  const btnSalvarColeta = el('button', { style: 'font-size:11px;padding:3px 9px;border-radius:6px;border:0.5px solid var(--lx-linha);background:none;cursor:pointer;color:var(--lx-tinta-2);display:flex;align-items:center;gap:4px', onClick: async () => {
    const v = buscaColeta.obterValor();
    if (!v?.lat) { toast('Confirme um endereço de coleta primeiro', 'erro'); return; }
    try {
      await post('/entregas/enderecos-salvos', { apelido: v.apelido || v.label || v.endereco_completo, endereco_completo: v.label || v.apelido || v.endereco_completo, lat: v.lat, lng: v.lng, bairro: v.bairro, cidade: v.cidade, uf: v.uf, is_coleta_padrao: true });
      _coletaPadrao = v;
      btnSalvarColeta.textContent = '✓ Padrão salvo'; btnSalvarColeta.style.color='var(--lx-ok)'; btnSalvarColeta.style.borderColor='var(--lx-ok)';
      setTimeout(() => { btnSalvarColeta.innerHTML = 'Salvar como padrão'; btnSalvarColeta.style.color='var(--lx-tinta-2)'; btnSalvarColeta.style.borderColor='var(--lx-linha)'; }, 2000);
    } catch (e) { toast(e.message, 'erro'); }
  }}, el('i', { class: 'ti ti-bookmark', style: 'font-size:13px;margin-right:5px' }), 'Salvar como padrão');

  function reconstruirFormulario() {
    _pontos = []; pontosWrap.innerHTML = ''; novoPonto();
    buscaColeta.resetar();
    if (_coletaPadrao) setTimeout(() => buscaColeta._confirmarExterno(_coletaPadrao), 30);
    mbId.val = null; modoAuto.val = true;
    btnAuto.style.borderColor='var(--lx-azul-vivo)'; btnAuto.style.background='var(--lx-info-bg)';
    btnManual.style.borderColor='var(--lx-linha)'; btnManual.style.background='';
    mbListaWrap.style.display='none';
    mbListaWrap.querySelectorAll('[data-mb]').forEach(r => { r.style.borderColor='var(--lx-linha)'; r.style.background=''; });
  }

  async function criarEntrega() {
    const coleta = buscaColeta.obterValor();
    if (!coleta?.lat) { toast('Confirme o endereço de coleta', 'erro'); return; }
    const destinos = _pontos.map(p => {
      const v = p.obterBusca().obterValor(); const d = p.obterDados();
      if (!v?.lat) return null;
      return { endereco: v.label || v.apelido || v.endereco_completo, lat: v.lat, lng: v.lng, numero: v.numero || d.numero, nome_fantasia: d.nome_fantasia, numero_nf: d.numero_nf, complemento: d.complemento, observacoes: d.observacoes, telefone: d.telefone };
    }).filter(Boolean);
    if (!destinos.length) { toast('Confirme ao menos um destino', 'erro'); return; }
    if (!modoAuto.val && !mbId.val) { toast('Selecione um motoboy ou modo automático', 'erro'); return; }
    btnCriar.disabled = true; btnCriar.childNodes[1].textContent = ' Criando…';
    msgCriar.style.color = 'var(--lx-tinta-2)'; msgCriar.textContent = '';
    try {
      const r = await post('/entregas', { coleta: { endereco: coleta.label || coleta.apelido || coleta.endereco_completo, lat: coleta.lat, lng: coleta.lng }, destinos, motoboy_id: !modoAuto.val ? mbId.val : undefined });
      toast('✓ ' + r.protocolo + ' criada!', 'ok');
      msgCriar.style.color = 'var(--lx-ok)'; msgCriar.textContent = '✓ ' + r.protocolo + ' criada!';
      setTimeout(() => { msgCriar.textContent = ''; }, 3000);
      if (_mapa) { _mapa.limpar(); statsPill.style.display = 'none'; }
      reconstruirFormulario();
      carregar();
    } catch (e) { msgCriar.style.color = 'var(--lx-erro)'; msgCriar.textContent = e.message; }
    finally { btnCriar.disabled = false; btnCriar.childNodes[1].textContent = ' Solicitar entrega'; }
  }

  const sideNova = el('div', { style: 'display:flex;flex-direction:column;gap:0;flex:1' },
    el('div', { style: 'padding:14px;border-bottom:0.5px solid var(--lx-linha)' },
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:9px' },
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          el('div', { style: 'width:26px;height:26px;border-radius:50%;background:var(--lx-azul-profundo);color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none' }, 'C'),
          el('b', { style: 'font-size:13px;color:var(--lx-tinta)' }, 'Ponto de coleta')),
        btnSalvarColeta),
      buscaColeta),
    el('div', { style: 'padding:14px;border-bottom:0.5px solid var(--lx-linha);display:flex;flex-direction:column;gap:10px' }, pontosWrap, btnAddDest),
    el('div', { style: 'padding:14px;border-bottom:0.5px solid var(--lx-linha)' },
      el('b', { style: 'font-size:12.5px;font-weight:700;display:block;margin-bottom:9px;color:var(--lx-tinta)' }, 'Motoboy'),
      el('div', { style: 'display:flex;gap:7px' }, btnAuto, btnManual),
      mbListaWrap),
    el('div', { style: 'padding:14px;margin-top:auto' }, btnCriar, msgCriar));

  const sideHistorico = el('div', { style: 'display:none;overflow-y:auto;flex:1' });

  function renderHistorico() {
    sideHistorico.innerHTML = '';
    let lista = _entregas;
    if (abaAtiva.val==='ativas') lista = lista.filter(e => ['aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota'].includes(e.status));
    if (abaAtiva.val==='concluidas') lista = lista.filter(e => e.status==='entregue');
    if (abaAtiva.val==='canceladas') lista = lista.filter(e => e.status==='cancelada');
    if (!lista.length) { sideHistorico.append(el('div', { style: 'padding:32px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nenhuma entrega.')); return; }
    lista.forEach(e => {
      const card = el('div', { class: 'lx-hist-card' });

      // Detalhes do ponto (NF, obs, complemento) — carregados ao expandir
      const detalhesWrap = el('div', { style: 'display:none;margin-top:8px;padding:8px;background:var(--lx-superficie-2);border-radius:8px;display:none;flex-direction:column;gap:3px' });
      let detalhesCarregados = false;

      card.addEventListener('click', async () => {
        if (_mapa) _mapa.renderizarExistente(e.id);
        // Toggle detalhes
        const aberto = detalhesWrap.style.display === 'flex';
        if (aberto) { detalhesWrap.style.display = 'none'; return; }
        detalhesWrap.style.display = 'flex';
        if (!detalhesCarregados) {
          detalhesCarregados = true;
          detalhesWrap.innerHTML = '';
          detalhesWrap.append(el('div', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, 'Carregando detalhes…'));
          try {
            const r = await get('/entregas/' + e.id + '/rota');
            detalhesWrap.innerHTML = '';
            // Coleta
            detalhesWrap.append(
              el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:2px' }, el('i', { class: 'ti ti-map-pin', style: 'font-size:12px;color:var(--lx-azul-profundo);flex:none' }), 'Coleta'),
              el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);padding-left:4px;margin-bottom:6px' }, r.coleta?.endereco || '—'));
            // Pontos
            (r.pontos || []).forEach((p, i) => {
              const infos = [
                p.nome_fantasia ? ['ti-user', p.nome_fantasia] : null,
                p.numero_nf ? ['ti-file-text', 'NF ' + p.numero_nf] : null,
                p.complemento ? ['ti-building', p.complemento] : null,
                p.observacoes ? ['ti-message', p.observacoes] : null,
                p.telefone ? ['ti-phone', p.telefone] : null,
              ].filter(Boolean);
              detalhesWrap.append(
                el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:2px' }, el('i', { class: 'ti ti-flag', style: 'font-size:12px;color:var(--lx-azul-primario);flex:none' }), `Destino ${i+1}`),
                el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);padding-left:4px' }, p.endereco || '—'));
              infos.forEach(([ico, txt]) => {
                const row = el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--lx-tinta-2);padding:2px 0' });
                row.append(el('i', { class: 'ti ' + ico, style: 'font-size:11px;flex:none;color:var(--lx-tinta-3)' }), document.createTextNode(txt));
                detalhesWrap.append(row);
              });
              if (i < (r.pontos||[]).length - 1) detalhesWrap.append(el('div', { style: 'height:1px;background:var(--lx-linha);margin:5px 0' }));
            });
            if (e.motivo_cancelamento) {
              detalhesWrap.append(
                el('div', { style: 'height:1px;background:var(--lx-linha);margin:5px 0' }),
                el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--lx-erro);font-weight:600' }, el('i', { class: 'ti ti-x', style: 'font-size:12px;flex:none' }), 'Motivo: ' + e.motivo_cancelamento));
            }
          } catch { detalhesWrap.innerHTML = ''; detalhesWrap.append(el('div', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, 'Sem detalhes.')); }
        }
      });

      card.append(
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:5px' },
          el('b', { style: 'font-size:13px;color:var(--lx-tinta)' }, e.protocolo||'—'),
          statusBadge(e.status)),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px' }, el('i', { class: 'ti ti-map-pin', style: 'font-size:12px;margin-right:4px;color:var(--lx-azul-profundo)' }), (e.coleta_endereco?.split(',')[0]||'—')),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px' }, el('i', { class: 'ti ti-flag', style: 'font-size:12px;margin-right:4px;color:var(--lx-azul-primario)' }), (e.destino_endereco?.split(',')[0]||'—')),
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between' },
          el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, fmtData(e.criado_em)),
          el('div', { style: 'display:flex;gap:6px;align-items:center' },
            e.motoboy_nome ? el('span', { style: 'font-size:11px;color:var(--lx-tinta-2);font-weight:600' }, el('i', { class: 'ti ti-motorbike', style: 'font-size:12px;margin-right:3px' }), e.motoboy_nome.split(' ')[0]) : el('span', {}),
            auth.pode('entregas.criar') && !['entregue','cancelada'].includes(e.status)
              ? el('button', { style: 'font-size:11px;padding:3px 9px;border-radius:6px;background:var(--lx-erro-bg);color:var(--lx-erro);border:none;cursor:pointer;font-weight:700', onClick: ev => { ev.stopPropagation(); confirmarCancelar(e, () => carregar()); }}, 'Cancelar')
              : el('span', {}))),
        detalhesWrap);
      sideHistorico.append(card);
    });
  }

  function trocarAba(id) {
    abaAtiva.val = id;
    Object.entries(tabEls).forEach(([k,t]) => t.classList.toggle('on', k===id));
    sideNova.style.display = id==='nova' ? 'flex' : 'none';
    sideHistorico.style.display = id!=='nova' ? 'block' : 'none';
    if (id==='nova' && _mapa) { _mapa.limpar(); statsPill.style.display='none'; setTimeout(() => _mapa.invalidar(), 50); }
    if (id!=='nova') renderHistorico();
  }

  async function atualizarMapa() {
    clearTimeout(_mapaTimer);
    _mapaTimer = setTimeout(async () => {
      if (!_mapa) return;
      const coleta = buscaColeta.obterValor();
      const destinos = _pontos.map(p => p.obterBusca().obterValor()).filter(Boolean);
      if (!coleta?.lat && !destinos.length) return;
      const r = await _mapa.renderizar(coleta, destinos);
      if (r?.distanciaKm) { statDist.textContent = r.distanciaKm+' km'; statTempo.textContent = r.duracaoMin+' min'; statParadas.textContent = String(destinos.length); statsPill.style.display='block'; }
    }, 500);
  }

  async function carregar() {
    try { _entregas = await get('/entregas'); if (abaAtiva.val!=='nova') renderHistorico(); } catch {}
  }

  const body = el('div', { class: 'lx-ent-body' }, el('div', { class: 'lx-ent-side' }, sideNova, sideHistorico), mapaWrap);
  const shell = el('div', { class: 'lx-ent-shell' }, abasEl, body);
  container.append(casca('Entregas', shell, 'Coleta e destinos — rota otimizada automaticamente'));

  setTimeout(async () => { _mapa = criarMapa(mapaDiv); await _mapa.init(); }, 150);
  carregar();
}
