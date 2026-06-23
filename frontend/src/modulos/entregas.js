import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, statusBadge } from '../core/ui.js';
import { get, post, patch, del } from '../core/api.js';
import * as auth from '../core/auth.js';

const BASE = window.LOGIX_API || '/api/v1';

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:1000' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:28px;width:460px;max-width:95vw;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px' },
      el('b', { style: 'font-size:16px;font-weight:800;color:var(--lx-tinta)' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px', onClick: () => overlay.remove() }, '✕')),
    corpo,
    el('div', { style: 'display:flex;gap:10px;margin-top:20px;justify-content:flex-end' }, ...acoes));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

// ====== COMPONENTE DE BUSCA DE ENDEREÇO ======
function campoBusca({ label, badgeTexto, badgeClasse, onConfirmar }) {
  let _timer = null;
  let _salvos = [];
  let _confirmado = null;

  const inp = el('input', { class: 'lx-input', placeholder: 'Digite o endereço ou apelido...' });
  const btnBuscar = el('button', { class: 'lx-btn lx-btn-primario', style: 'padding:8px 12px;font-size:12px' },
    el('span', { html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>` }));
  const salvosWrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;min-height:0' });
  const resultadosWrap = el('div', { style: 'display:none;border-top:1px solid var(--lx-linha);padding-top:8px;margin-top:6px' });
  const confirmadoWrap = el('div', { style: 'display:none' });

  // Busca no ORS com debounce
  inp.addEventListener('input', () => {
    clearTimeout(_timer);
    resultadosWrap.style.display = 'none';
    const q = inp.value.trim();
    if (q.length < 2) { renderSalvos([]); return; }
    // Buscar salvos imediatamente (300ms)
    _timer = setTimeout(async () => {
      try {
        const r = await get('/entregas/enderecos-salvos?q=' + encodeURIComponent(q));
        _salvos = r;
        renderSalvos(r);
      } catch {}
    }, 300);
    // Geocoding se ≥ 6 chars (800ms)
    if (q.length >= 6) {
      clearTimeout(inp._geoTimer);
      inp._geoTimer = setTimeout(async () => {
        try {
          btnBuscar.disabled = true;
          const r = await get('/entregas/geocode?q=' + encodeURIComponent(q));
          renderResultados(r.resultados || []);
        } catch {} finally { btnBuscar.disabled = false; }
      }, 800);
    }
  });

  btnBuscar.addEventListener('click', async () => {
    const q = inp.value.trim();
    if (!q) return;
    btnBuscar.disabled = true;
    try {
      const r = await get('/entregas/geocode?q=' + encodeURIComponent(q));
      renderResultados(r.resultados || []);
    } catch { toast('Erro ao buscar endereço', 'erro'); }
    finally { btnBuscar.disabled = false; }
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') btnBuscar.click(); });

  function renderSalvos(lista) {
    salvosWrap.innerHTML = '';
    if (!lista.length) return;
    lista.forEach(s => {
      const chip = el('button', {
        style: 'padding:4px 10px;border-radius:var(--lx-raio-pill);font-size:11.5px;font-weight:600;background:var(--lx-info-bg);color:var(--lx-azul-primario);border:1px solid var(--lx-azul-claro);cursor:pointer',
        onClick: () => confirmar(s)
      }, s.apelido);
      salvosWrap.append(chip);
    });
  }

  function renderResultados(lista) {
    resultadosWrap.innerHTML = '';
    if (!lista.length) { resultadosWrap.style.display = 'none'; return; }
    resultadosWrap.style.display = 'block';
    lista.forEach(r => {
      const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--lx-linha);cursor:pointer', onClick: () => abrirSalvar(r) },
        el('div', { style: 'width:28px;height:28px;border-radius:7px;background:var(--lx-info-bg);display:grid;place-items:center;flex:none', html: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--lx-azul-primario)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` }),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-size:12.5px;font-weight:700;color:var(--lx-tinta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, r.label || r.endereco),
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, [r.bairro, r.cidade, r.uf].filter(Boolean).join(' · '))),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:11px;padding:4px 9px;flex:none', onClick: e => { e.stopPropagation(); confirmar(r); } }, 'Usar'));
      resultadosWrap.append(row);
    });
  }

  function abrirSalvar(r) {
    const apelido = el('input', { class: 'lx-input', placeholder: 'Ex: Loja Pituba, CD Lauro...' });
    const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      if (!apelido.value.trim()) { confirmar(r); ov.remove(); return; }
      try {
        await post('/entregas/enderecos-salvos', { apelido: apelido.value.trim(), endereco_completo: r.label || r.endereco, lat: r.lat, lng: r.lng, bairro: r.bairro, cidade: r.cidade, uf: r.uf, cep: r.cep });
        toast('Endereço salvo como "' + apelido.value.trim() + '"', 'ok');
      } catch {}
      confirmar(r);
      ov.remove();
    } }, 'Salvar e usar');
    const ov = modal('Salvar endereço',
      el('div', {},
        el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-bottom:12px' }, r.label || r.endereco),
        el('div', { class: 'lx-field', style: 'margin-bottom:0' }, el('label', {}, 'Apelido (opcional)'), apelido)),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => { confirmar(r); ov.remove(); } }, 'Usar sem salvar'), btnSalvar]);
  }

  function confirmar(r) {
    _confirmado = r;
    inp.style.display = 'none';
    btnBuscar.style.display = 'none';
    salvosWrap.innerHTML = '';
    resultadosWrap.style.display = 'none';
    confirmadoWrap.style.display = 'block';
    confirmadoWrap.innerHTML = '';
    confirmadoWrap.append(
      el('div', { style: 'display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--lx-info-bg);border-radius:var(--lx-raio-sm)' },
        el('div', { style: 'width:30px;height:30px;border-radius:8px;background:var(--lx-azul-primario);color:#fff;display:grid;place-items:center;flex:none', html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` }),
        el('div', { style: 'flex:1;min-width:0' },
          el('b', { style: 'font-size:12.5px;color:var(--lx-azul-profundo);display:block' }, r.label || r.apelido || r.endereco || r.endereco_completo),
          el('span', { style: 'font-size:11px;color:var(--lx-azul-primario)' }, [r.bairro, r.cidade, r.uf].filter(Boolean).join(' · '))),
        el('button', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:700;cursor:pointer;background:none;border:none;flex:none', onClick: () => {
          _confirmado = null;
          inp.style.display = '';
          btnBuscar.style.display = '';
          confirmadoWrap.style.display = 'none';
          inp.value = '';
          if (onConfirmar) onConfirmar(null);
        } }, 'Trocar')
      )
    );
    if (onConfirmar) onConfirmar(r);
  }

  const wrap = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid var(--lx-linha)' },
      el('div', { style: `width:26px;height:26px;border-radius:50%;background:${badgeClasse === 'coleta' ? 'var(--lx-azul-profundo)' : 'var(--lx-azul-primario)'};color:#fff;display:grid;place-items:center;font-size:11px;font-weight:800;flex:none` }, badgeTexto),
      el('b', { style: 'font-size:12.5px;font-weight:700;color:var(--lx-tinta)' }, label)),
    el('div', { style: 'padding:11px 13px;display:flex;flex-direction:column;gap:8px' },
      el('div', { style: 'display:flex;gap:6px' }, inp, btnBuscar),
      salvosWrap,
      resultadosWrap,
      confirmadoWrap));

  // Carregar salvos iniciais ao focar
  inp.addEventListener('focus', async () => {
    if (!inp.value) {
      try {
        const r = await get('/entregas/enderecos-salvos');
        renderSalvos(r.slice(0, 6));
      } catch {}
    }
  });

  wrap.obterValor = () => _confirmado;
  return wrap;
}

// ====== MAPA LEAFLET ======
function criarMapa(container) {
  // Injetar Leaflet CSS se necessário
  if (!document.getElementById('lx-leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'lx-leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(link);
  }

  let map = null;
  let polyline = null;
  let markers = [];

  function destruir() {
    if (map) { map.remove(); map = null; }
  }

  async function iniciar() {
    if (map) return;
    if (!window.L) {
      await new Promise((res, rej) => {
        if (document.getElementById('lx-leaflet-js')) { res(); return; }
        const s = document.createElement('script');
        s.id = 'lx-leaflet-js';
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = res; s.onerror = rej;
        document.head.append(s);
      });
    }
    const L = window.L;
    map = L.map(container, { center: [-12.97, -38.5], zoom: 12, scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
  }

  function pinIcon(texto, cor) {
    return window.L.divIcon({
      className: '',
      html: `<div style="width:32px;height:32px;border-radius:50%;background:${cor};border:3px solid #fff;display:grid;place-items:center;font-weight:800;font-size:12px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)">${texto}</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16],
    });
  }

  async function renderRota(coleta, destinos) {
    await iniciar();
    const L = window.L;
    markers.forEach(m => m.remove());
    markers = [];
    if (polyline) { polyline.remove(); polyline = null; }

    if (!coleta?.lat) return;

    const pinC = L.marker([coleta.lat, coleta.lng], { icon: pinIcon('C', '#042C53') })
      .bindPopup(`<b>Coleta</b><br>${coleta.label || coleta.endereco_completo || ''}`).addTo(map);
    markers.push(pinC);

    destinos.forEach((d, i) => {
      if (!d?.lat) return;
      const pin = L.marker([d.lat, d.lng], { icon: pinIcon(String(i + 1), '#185FA5') })
        .bindPopup(`<b>Destino ${i + 1}</b><br>${d.label || d.endereco_completo || ''}`).addTo(map);
      markers.push(pin);
    });

    const todos = [coleta, ...destinos].filter(p => p?.lat);
    if (todos.length >= 2) {
      // Buscar geometria real da rota via ORS
      try {
        const token = (await import('../core/api.js')).getToken();
        const resp = await fetch(`${BASE}/entregas/geocode-rota`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ pontos: todos.map(p => ({ lat: p.lat, lng: p.lng })) }),
        });
        if (resp.ok) {
          const dados = await resp.json();
          if (dados.geom?.length) {
            polyline = L.polyline(dados.geom, { color: '#185FA5', weight: 4, dashArray: '8 12', lineCap: 'round' }).addTo(map);
            map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
            return { distanciaKm: dados.distanciaKm, duracaoMin: dados.duracaoMin };
          }
        }
      } catch {}
      // Fallback: linha reta pontilhada
      polyline = L.polyline(todos.map(p => [p.lat, p.lng]), { color: '#185FA5', weight: 3, dashArray: '6 10' }).addTo(map);
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    } else {
      map.setView([coleta.lat, coleta.lng], 14);
    }
    return null;
  }

  async function renderRotaExistente(entregaId) {
    await iniciar();
    const L = window.L;
    markers.forEach(m => m.remove()); markers = [];
    if (polyline) { polyline.remove(); polyline = null; }
    try {
      const r = await get('/entregas/' + entregaId + '/rota');
      if (r.coleta?.lat) {
        const pinC = L.marker([r.coleta.lat, r.coleta.lng], { icon: pinIcon('C', '#042C53') })
          .bindPopup(`<b>Coleta</b><br>${r.coleta.endereco || ''}`).addTo(map);
        markers.push(pinC);
      }
      (r.pontos || []).forEach((p, i) => {
        if (!p.lat) return;
        const pin = L.marker([p.lat, p.lng], { icon: pinIcon(String(i + 1), '#185FA5') })
          .bindPopup(`<b>Destino ${i + 1}</b><br>${p.endereco || ''}`).addTo(map);
        markers.push(pin);
      });
      if (r.coords?.length) {
        polyline = L.polyline(r.coords, { color: '#185FA5', weight: 4, dashArray: '8 12', lineCap: 'round' }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      }
      return r;
    } catch { return null; }
  }

  return { iniciar, renderRota, renderRotaExistente, destruir };
}

// ====== ADICIONAR ENDPOINT DE GEOMETRIA DE ROTA ======
// Endpoint simples no backend para calcular a geometria via ORS
// POST /entregas/geocode-rota — usado pelo mapa de lançamento

// ====== FORMULÁRIO DE LANÇAMENTO ======
function formularioLancamento(motoboys, aoCriar) {
  const campoColeta = campoBusca({ label: 'Ponto de coleta', badgeTexto: 'C', badgeClasse: 'coleta', onConfirmar: atualizarMapa });
  const campoDestino = campoBusca({ label: 'Destino 1', badgeTexto: '1', badgeClasse: 'destino', onConfirmar: atualizarMapa });

  const modoAuto = { val: true };
  const motoboyId = { val: null };

  const btnAuto = el('div', {
    style: 'flex:1;border:1.5px solid var(--lx-azul-vivo);background:var(--lx-info-bg);border-radius:var(--lx-raio-sm);padding:12px;cursor:pointer',
    onClick: () => { modoAuto.val = true; btnAuto.style.borderColor = 'var(--lx-azul-vivo)'; btnAuto.style.background = 'var(--lx-info-bg)'; btnManual.style.borderColor = 'var(--lx-linha)'; btnManual.style.background = ''; listaMB.style.display = 'none'; }
  }, el('b', { style: 'font-size:13px;display:block' }, 'Automático'), el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, 'Motoboy mais próximo (GPS)'));

  const listaMB = el('div', { style: 'display:none;margin-top:10px;display:none;flex-direction:column;gap:6px' });
  const btnManual = el('div', {
    style: 'flex:1;border:1.5px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:12px;cursor:pointer',
    onClick: () => { modoAuto.val = false; btnManual.style.borderColor = 'var(--lx-azul-vivo)'; btnManual.style.background = 'var(--lx-info-bg)'; btnAuto.style.borderColor = 'var(--lx-linha)'; btnAuto.style.background = ''; listaMB.style.display = 'flex'; }
  }, el('b', { style: 'font-size:13px;display:block' }, 'Manual'), el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, 'Escolher da lista'));

  // Lista de motoboys disponíveis
  const CORES_MB = ['#185FA5', '#0F6E56', '#534AB7', '#854F0B', '#993C1D'];
  motoboys.filter(m => m.online && m.status !== 'inativo').forEach((m, i) => {
    const cor = CORES_MB[i % CORES_MB.length];
    const iniciais = m.nome_completo.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const row = el('div', {
      style: `display:flex;align-items:center;gap:10px;padding:9px 11px;border:1.5px solid var(--lx-linha);border-radius:9px;cursor:pointer`,
      onClick: () => {
        motoboyId.val = m.id;
        listaMB.querySelectorAll('[data-mb]').forEach(r => { r.style.borderColor = 'var(--lx-linha)'; r.style.background = ''; });
        row.style.borderColor = 'var(--lx-azul-primario)';
        row.style.background = 'var(--lx-info-bg)';
      }
    },
      el('div', { style: `width:30px;height:30px;border-radius:50%;background:${cor};color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none` }, iniciais),
      el('div', { style: 'flex:1' },
        el('b', { style: 'font-size:12.5px;font-weight:700;display:block' }, m.nome_completo),
        el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `Online · ${m.carga || 0} entrega(s)`)),
      el('span', { style: 'font-size:11.5px;color:var(--lx-azul-primario);font-weight:700' }, m.distancia_km ? m.distancia_km.toFixed(1) + ' km' : ''));
    row.setAttribute('data-mb', m.id);
    listaMB.append(row);
  });

  if (!motoboys.filter(m => m.online).length) {
    listaMB.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:12.5px;padding:8px 0' }, 'Nenhum motoboy online no momento.'));
  }

  // Mapa
  const mapDiv = el('div', { style: 'height:100%;min-height:320px' });
  const mapWrap = el('div', { class: 'lx-card', style: 'overflow:hidden;display:flex;flex-direction:column;height:100%' },
    el('div', { style: 'padding:10px 14px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between' },
      el('b', { style: 'font-size:13px;font-weight:700' }, 'Rota no mapa'),
      el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'OpenStreetMap · ORS')),
    el('div', { style: 'flex:1;position:relative' }, mapDiv),
    el('div', { style: 'display:flex;border-top:1px solid var(--lx-linha)' },
      el('div', { style: 'flex:1;padding:11px;text-align:center;border-right:1px solid var(--lx-linha)' },
        el('div', { style: 'color:var(--lx-tinta-2);font-size:11px;margin-bottom:2px' }, 'Distância'),
        el('b', { id: 'lx-mapa-dist', style: 'font-size:17px;font-weight:700' }, '—')),
      el('div', { style: 'flex:1;padding:11px;text-align:center;border-right:1px solid var(--lx-linha)' },
        el('div', { style: 'color:var(--lx-tinta-2);font-size:11px;margin-bottom:2px' }, 'Tempo est.'),
        el('b', { id: 'lx-mapa-tempo', style: 'font-size:17px;font-weight:700' }, '—')),
      el('div', { style: 'flex:1;padding:11px;text-align:center' },
        el('div', { style: 'color:var(--lx-tinta-2);font-size:11px;margin-bottom:2px' }, 'Paradas'),
        el('b', { id: 'lx-mapa-paradas', style: 'font-size:17px;font-weight:700' }, '1'))));

  const mapa = criarMapa(mapDiv);

  // Atualizar mapa quando endereços mudam
  let _atualizarTimer = null;
  async function atualizarMapa() {
    clearTimeout(_atualizarTimer);
    _atualizarTimer = setTimeout(async () => {
      const coleta = campoColeta.obterValor();
      const destino = campoDestino.obterValor();
      if (!coleta && !destino) return;
      await mapa.iniciar();
      const r = await mapa.renderRota(coleta, destino ? [destino] : []);
      if (r) {
        const distEl = document.getElementById('lx-mapa-dist');
        const tempoEl = document.getElementById('lx-mapa-tempo');
        if (distEl) distEl.textContent = r.distanciaKm + ' km';
        if (tempoEl) tempoEl.textContent = r.duracaoMin + ' min';
      }
    }, 400);
  }

  // Botão criar
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const btnCriar = el('button', { class: 'lx-btn lx-btn-primario', style: 'width:100%;justify-content:center;padding:12px', onClick: criar },
    el('span', { html: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>` }),
    'Criar entrega');

  async function criar() {
    const coleta = campoColeta.obterValor();
    const destino = campoDestino.obterValor();
    if (!coleta || !destino) { msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Confirme os endereços de coleta e destino.'; return; }
    if (!modoAuto.val && !motoboyId.val) { msg.style.color = 'var(--lx-erro)'; msg.textContent = 'Selecione um motoboy ou escolha atribuição automática.'; return; }
    btnCriar.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Criando…';
    try {
      const corpo = {
        coleta: { endereco: coleta.label || coleta.endereco_completo, lat: coleta.lat, lng: coleta.lng },
        destinos: [{ endereco: destino.label || destino.endereco_completo, lat: destino.lat, lng: destino.lng }],
        motoboy_id: !modoAuto.val ? motoboyId.val : undefined,
      };
      const r = await post('/entregas', corpo);
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Entrega criada: ' + (r.protocolo || '');
      aoCriar();
    } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; }
    finally { btnCriar.disabled = false; }
  }

  const form = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:14px;align-items:start' },
    // Coluna endereços
    el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      campoColeta, campoDestino,
      el('div', { style: 'border:1.5px dashed var(--lx-linha);border-radius:var(--lx-raio-sm);padding:10px 13px;display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--lx-tinta-2);font-size:12.5px' },
        el('span', { html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>` }),
        'Adicionar destino')),
    // Coluna motoboy
    el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      el('div', { class: 'lx-card lx-card-pad' },
        el('b', { style: 'font-size:13px;font-weight:700;display:block;margin-bottom:12px' }, 'Atribuir motoboy'),
        el('div', { style: 'display:flex;gap:8px' }, btnAuto, btnManual),
        listaMB),
      btnCriar, msg),
    // Mapa
    mapWrap);

  // Iniciar mapa após render
  setTimeout(() => mapa.iniciar(), 100);

  return form;
}

// ====== TELA PRINCIPAL ======
export async function montar(container) {
  const filtro = { val: 'todas' };
  let _entregas = [];

  const tabTodas     = el('button', { class: 'lx-chip lx-chip-on', onClick: () => setFiltro('todas') }, 'Todas');
  const tabAtivas    = el('button', { class: 'lx-chip', onClick: () => setFiltro('ativas') }, 'Em andamento');
  const tabFila      = el('button', { class: 'lx-chip', onClick: () => setFiltro('fila') }, 'Na fila');
  const tabConcluidas = el('button', { class: 'lx-chip', onClick: () => setFiltro('concluidas') }, 'Concluídas');
  const tabCanceladas = el('button', { class: 'lx-chip', onClick: () => setFiltro('canceladas') }, 'Canceladas');
  const resumoEl = el('span', { style: 'margin-left:auto;font-size:12px;color:var(--lx-tinta-2)' }, '');

  function setFiltro(f) {
    filtro.val = f;
    [tabTodas, tabAtivas, tabFila, tabConcluidas, tabCanceladas].forEach(t => t.classList.remove('lx-chip-on'));
    ({ todas: tabTodas, ativas: tabAtivas, fila: tabFila, concluidas: tabConcluidas, canceladas: tabCanceladas })[f].classList.add('lx-chip-on');
    renderTabela();
  }

  const tabBody = el('div', { style: 'padding:4px 6px' });

  function renderTabela() {
    tabBody.innerHTML = '';
    let linhas = _entregas;
    if (filtro.val === 'ativas')     linhas = linhas.filter(e => ['aguardando_coleta','em_coleta','em_rota'].includes(e.status));
    if (filtro.val === 'fila')       linhas = linhas.filter(e => e.status === 'aguardando_atribuicao');
    if (filtro.val === 'concluidas') linhas = linhas.filter(e => e.status === 'entregue');
    if (filtro.val === 'canceladas') linhas = linhas.filter(e => e.status === 'cancelada');

    if (!linhas.length) {
      tabBody.append(el('div', { style: 'padding:32px;text-align:center' },
        estadoVazio('entregas', 'Nenhuma entrega nesta categoria', '')));
      return;
    }

    const tbody = el('tbody');
    linhas.forEach(e => tbody.append(linhaEntrega(e)));
    tabBody.append(el('table', { class: 'lx-table' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Protocolo'),
        el('th', {}, 'Status'),
        el('th', {}, 'Coleta'),
        el('th', {}, 'Destino'),
        el('th', {}, 'Motoboy'),
        el('th', {}, 'Km'),
        el('th', {}, 'Criada'),
        el('th', { style: 'text-align:right' }, 'Ações'))),
      tbody));
  }

  function linhaEntrega(e) {
    const podeCancelar = !['entregue', 'cancelada'].includes(e.status);
    const podeAcompanhar = ['aguardando_coleta','em_coleta','em_rota'].includes(e.status);
    const acoes = el('div', { style: 'display:inline-flex;gap:6px;justify-content:flex-end' });

    if (podeAcompanhar) {
      acoes.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:11.5px', onClick: () => abrirAcompanhamento(e) }, 'Acompanhar'));
    } else {
      acoes.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:11.5px', onClick: () => abrirAcompanhamento(e) }, 'Detalhes'));
    }
    if (auth.pode('entregas.criar') && podeCancelar) {
      acoes.append(el('button', { class: 'lx-btn', style: 'font-size:11.5px;background:var(--lx-erro-bg);color:var(--lx-erro)', onClick: () => confirmarCancelar(e) }, 'Cancelar'));
    }

    return el('tr', {},
      el('td', {}, el('b', {}, e.protocolo || '—')),
      el('td', {}, statusBadge(e.status)),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, e.coleta_endereco?.split(',')[0] || '—'),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, e.destino_endereco?.split(',')[0] || '—'),
      el('td', { style: 'font-size:12.5px' }, e.motoboy_nome || el('span', { style: 'color:var(--lx-tinta-3)' }, 'Sem motoboy')),
      el('td', { style: 'font-size:12px' }, e.distancia_km != null ? Number(e.distancia_km).toFixed(1) : '—'),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtData(e.criado_em)),
      el('td', { style: 'text-align:right' }, acoes));
  }

  function abrirAcompanhamento(e) {
    const mapDiv = el('div', { style: 'height:360px;border-radius:var(--lx-raio);overflow:hidden' });
    const mapa = criarMapa(mapDiv);
    const info = el('div', { style: 'color:var(--lx-tinta-2);font-size:12.5px;padding:4px 0' }, 'Carregando rota…');

    const overlay = modal(e.protocolo + ' · Acompanhamento',
      el('div', {},
        el('div', { style: 'display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap' },
          el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Status'), el('div', {}, statusBadge(e.status))),
          el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Motoboy'), el('div', { style: 'font-size:13px;font-weight:700' }, e.motoboy_nome || '—')),
          el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Criada'), el('div', { style: 'font-size:13px' }, fmtData(e.criado_em)))),
        info, mapDiv),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => { mapa.destruir(); overlay.remove(); } }, 'Fechar')]);

    setTimeout(async () => {
      const r = await mapa.renderRotaExistente(e.id);
      if (r) {
        info.innerHTML = '';
        if (r.distanciaKm) info.append(el('span', {}, r.distanciaKm + ' km · ' + r.duracaoMin + ' min estimados'));
      } else { info.textContent = ''; }
    }, 100);
  }

  function confirmarCancelar(e) {
    const motivo = el('textarea', { class: 'lx-input', style: 'min-height:72px;resize:vertical', placeholder: 'Motivo do cancelamento (opcional)' });
    const btn = el('button', { class: 'lx-btn', style: 'background:var(--lx-erro);color:#fff', onClick: async () => {
      btn.disabled = true;
      try {
        await patch('/entregas/' + e.id + '/cancelar', { motivo: motivo.value.trim() || undefined });
        overlay.remove(); toast('Entrega cancelada.', 'ok'); carregar();
      } catch (err) { toast(err.message, 'erro'); btn.disabled = false; }
    }}, 'Cancelar entrega');
    const overlay = modal('Cancelar ' + e.protocolo,
      el('div', {},
        el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;margin-bottom:12px' }, 'Esta ação não pode ser desfeita.'),
        el('div', { class: 'lx-field' }, el('label', {}, 'Motivo (opcional)'), motivo)),
      [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => overlay.remove() }, 'Manter'), btn]);
  }

  async function carregar() {
    tabBody.innerHTML = '';
    tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px;text-align:center' }, 'Carregando…'));
    try {
      _entregas = await get('/entregas');
      const ativas     = _entregas.filter(e => ['aguardando_coleta','em_coleta','em_rota'].includes(e.status)).length;
      const fila       = _entregas.filter(e => e.status === 'aguardando_atribuicao').length;
      const concluidas = _entregas.filter(e => e.status === 'entregue').length;
      resumoEl.textContent = `${ativas} em andamento · ${fila} na fila · ${concluidas} concluídas`;
      tabAtivas.textContent    = `Em andamento · ${ativas}`;
      tabFila.textContent      = `Na fila · ${fila}`;
      tabConcluidas.textContent = `Concluídas · ${concluidas}`;
      renderTabela();
    } catch (err) {
      tabBody.innerHTML = '';
      tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro: ' + err.message));
    }
  }

  // Carregar motoboys disponíveis para o formulário
  let motoboys = [];
  try { motoboys = await get('/motoboys?online=true').catch(() => []); } catch {}

  const podeLancar = auth.pode('entregas.criar');

  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'padding:12px 16px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' },
      tabTodas, tabAtivas, tabFila, tabConcluidas, tabCanceladas, resumoEl),
    tabBody);

  const filhos = [];
  if (podeLancar) {
    filhos.push(
      secHeader('Lançar nova entrega'),
      el('div', { class: 'lx-card lx-card-pad' }, formularioLancamento(motoboys, carregar))
    );
  }
  filhos.push(secHeader('Histórico de entregas'), lista);

  container.append(casca('Entregas', el('div', {}, ...filhos),
    'Cadastre a coleta e os destinos — a rota é otimizada automaticamente'));

  carregar();
}
