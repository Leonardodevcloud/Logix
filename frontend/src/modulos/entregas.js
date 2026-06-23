import { casca } from '../core/layout.js';
import { el, statusBadge } from '../core/ui.js';
import { get, post, patch } from '../core/api.js';
import { getToken } from '../core/api.js';
import * as auth from '../core/auth.js';

const BASE = window.LOGIX_API || '/api/v1';

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

// ── MAPA ──────────────────────────────────────────────────────────────────────
async function garantirLeaflet() {
  if (window.L) return;
  if (!document.getElementById('lx-leaflet-css')) {
    const l = document.createElement('link');
    l.id = 'lx-leaflet-css'; l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(l);
  }
  await new Promise((res, rej) => {
    if (document.getElementById('lx-leaflet-js')) { res(); return; }
    const s = document.createElement('script');
    s.id = 'lx-leaflet-js';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = res; s.onerror = rej;
    document.head.append(s);
  });
}

function pinIcon(txt, cor) {
  return window.L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${cor};border:3px solid #fff;display:grid;place-items:center;font-weight:800;font-size:12px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${txt}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

function criarMapaInstance(div) {
  let map = null, poly = null, markers = [];

  async function init(centro) {
    if (map) return;
    await garantirLeaflet();
    map = window.L.map(div, {
      center: centro || [-12.97, -38.5], zoom: 13,
      scrollWheelZoom: true, zoomControl: true,
    });
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
    if (!todos.length) return;

    if (coleta?.lat) {
      const m = L.marker([coleta.lat, coleta.lng], { icon: pinIcon('C', '#042C53') })
        .bindPopup(`<b>Coleta</b><br>${coleta.label || ''}`).addTo(map);
      markers.push(m);
    }
    destinos.forEach((d, i) => {
      if (!d?.lat) return;
      const m = L.marker([d.lat, d.lng], { icon: pinIcon(i + 1, '#185FA5') })
        .bindPopup(`<b>Destino ${i + 1}</b><br>${d.label || ''}`).addTo(map);
      markers.push(m);
    });

    // Tentar geometria real via ORS
    try {
      const r = await fetch(`${BASE}/entregas/geocode-rota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ pontos: todos.map(p => ({ lat: p.lat, lng: p.lng })) }),
      });
      if (r.ok) {
        const dados = await r.json();
        if (dados.geom?.length) {
          poly = L.polyline(dados.geom, { color: '#185FA5', weight: 5, dashArray: '6 10', lineCap: 'round' }).addTo(map);
          map.fitBounds(poly.getBounds(), { padding: [40, 40] });
          return dados;
        }
      }
    } catch {}

    // Fallback linha reta
    poly = L.polyline(todos.map(p => [p.lat, p.lng]), { color: '#185FA5', weight: 4, dashArray: '6 10' }).addTo(map);
    map.fitBounds(poly.getBounds(), { padding: [40, 40] });
    return null;
  }

  async function renderizarExistente(entregaId) {
    await init();
    limpar();
    try {
      const r = await get('/entregas/' + entregaId + '/rota');
      if (r.coleta?.lat) {
        const m = window.L.marker([r.coleta.lat, r.coleta.lng], { icon: pinIcon('C', '#042C53') })
          .bindPopup(`<b>Coleta</b><br>${r.coleta.endereco || ''}`).addTo(map);
        markers.push(m);
      }
      (r.pontos || []).forEach((p, i) => {
        if (!p.lat) return;
        const m = window.L.marker([p.lat, p.lng], { icon: pinIcon(i + 1, '#185FA5') })
          .bindPopup(`<b>Destino ${i + 1}</b><br>${p.endereco || ''}`).addTo(map);
        markers.push(m);
      });
      if (r.coords?.length) {
        poly = window.L.polyline(r.coords, { color: '#185FA5', weight: 5, dashArray: '6 10', lineCap: 'round' }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [40, 40] });
      }
      return r;
    } catch { return null; }
  }

  function invalidar() { if (map) map.invalidateSize(); }
  function destruir() { if (map) { map.remove(); map = null; } }

  return { init, renderizar, renderizarExistente, invalidar, destruir };
}

// ── CAMPO BUSCA ENDEREÇO ──────────────────────────────────────────────────────
function CampoBusca({ onConfirmar, onLimpar }) {
  let _confirmado = null;
  let _timerSalvos = null;
  let _timerGeo = null;

  const inp = el('input', { style: 'flex:1;background:transparent;border:none;outline:none;font-size:13px;color:var(--lx-tinta)', placeholder: 'Digite apelido ou endereço...' });
  const btnPin = el('button', { style: 'width:28px;height:28px;border-radius:7px;background:var(--lx-azul-primario);color:#fff;border:none;cursor:pointer;display:grid;place-items:center;flex:none', title: 'Buscar no mapa', html: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` });
  const btnSalvos = el('button', { style: 'width:28px;height:28px;border-radius:7px;background:var(--lx-superficie-2);color:var(--lx-tinta-2);border:0.5px solid var(--lx-linha);cursor:pointer;display:grid;place-items:center;flex:none', title: 'Endereços salvos', html: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>` });

  const dropSalvos = el('div', { style: 'display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);z-index:100;max-height:280px;overflow-y:auto;box-shadow:var(--lx-sombra)' });
  const dropGeo = el('div', { style: 'display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);z-index:100;max-height:260px;overflow-y:auto;box-shadow:var(--lx-sombra)' });

  const confirmadoWrap = el('div', { style: 'display:none;padding:8px 10px;background:var(--lx-info-bg);border-radius:var(--lx-raio-sm);display:none;flex-direction:column;gap:3px' });

  function fecharDrops() { dropSalvos.style.display = 'none'; dropGeo.style.display = 'none'; }

  function confirmar(r) {
    _confirmado = r;
    fecharDrops();
    inp.style.display = 'none';
    btnPin.style.display = 'none';
    btnSalvos.style.display = 'none';
    confirmadoWrap.style.display = 'flex';
    confirmadoWrap.innerHTML = '';
    confirmadoWrap.append(
      el('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:8px' },
        el('div', { style: 'flex:1;min-width:0' },
          el('b', { style: 'font-size:12.5px;color:var(--lx-azul-profundo);display:block' }, r.apelido || r.label || r.endereco_completo || '—'),
          el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, [r.bairro, r.cidade, r.uf].filter(Boolean).join(' · '))),
        el('button', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:700;cursor:pointer;background:none;border:none;white-space:nowrap', onClick: () => {
          _confirmado = null;
          inp.style.display = '';
          btnPin.style.display = '';
          btnSalvos.style.display = '';
          confirmadoWrap.style.display = 'none';
          inp.value = '';
          if (onLimpar) onLimpar();
        }}, 'Trocar')));
    if (onConfirmar) onConfirmar(r);
  }

  async function carregarSalvos(q = '') {
    try {
      const r = await get('/entregas/enderecos-salvos' + (q ? '?q=' + encodeURIComponent(q) : ''));
      dropSalvos.innerHTML = '';
      if (!r.length) { dropSalvos.style.display = 'none'; return; }
      r.forEach(s => {
        const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--lx-linha)', onClick: () => confirmar(s) });
        row.addEventListener('mouseenter', () => row.style.background = 'var(--lx-superficie-2)');
        row.addEventListener('mouseleave', () => row.style.background = '');
        const star = el('span', { style: 'color:#f59e0b;font-size:14px' }, '★');
        row.append(star,
          el('div', { style: 'flex:1;min-width:0' },
            el('b', { style: 'font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--lx-tinta)' }, s.apelido),
            el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, (s.endereco_completo || '').slice(0, 55))),
          el('span', { style: 'font-size:10px;color:var(--lx-tinta-3)' }, s.uso_count + 'x'));
        dropSalvos.append(row);
      });
      dropGeo.style.display = 'none';
      dropSalvos.style.display = 'block';
    } catch {}
  }

  async function buscarGeo(q) {
    try {
      const r = await get('/entregas/geocode?q=' + encodeURIComponent(q));
      const lista = r.resultados || [];
      dropGeo.innerHTML = '';
      if (!lista.length) { dropGeo.style.display = 'none'; return; }
      lista.forEach(item => {
        const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--lx-linha)' });
        row.addEventListener('mouseenter', () => row.style.background = 'var(--lx-superficie-2)');
        row.addEventListener('mouseleave', () => row.style.background = '');
        row.addEventListener('click', () => abrirModalSalvar(item));
        row.append(
          el('span', { style: 'color:var(--lx-tinta-3);font-size:16px' }, '📍'),
          el('div', { style: 'flex:1;min-width:0' },
            el('b', { style: 'font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--lx-tinta)' }, item.label),
            el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, [item.bairro, item.cidade, item.uf].filter(Boolean).join(' · '))),
          el('button', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:700;cursor:pointer;background:none;border:none;white-space:nowrap', onClick: e => { e.stopPropagation(); confirmar(item); } }, 'Usar'));
        dropGeo.append(row);
      });
      dropSalvos.style.display = 'none';
      dropGeo.style.display = 'block';
    } catch {}
  }

  function abrirModalSalvar(r) {
    const apelido = el('input', { style: 'width:100%;padding:9px 12px;border:1px solid var(--lx-linha);border-radius:8px;font-size:13px;margin-top:8px', placeholder: 'Ex: Loja Pituba, CD Lauro...' });
    const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.4);z-index:200;display:flex;align-items:center;justify-content:center' });
    const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:22px;width:380px;box-shadow:0 20px 50px -15px rgba(4,44,83,.4)' },
      el('b', { style: 'font-size:14px;color:var(--lx-tinta)' }, 'Salvar endereço'),
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:6px' }, r.label),
      apelido,
      el('div', { style: 'display:flex;gap:8px;margin-top:14px;justify-content:flex-end' },
        el('button', { style: 'padding:8px 14px;border-radius:8px;border:1px solid var(--lx-linha);background:none;cursor:pointer;font-size:12.5px', onClick: () => { confirmar(r); ov.remove(); } }, 'Usar sem salvar'),
        el('button', { style: 'padding:8px 14px;border-radius:8px;background:var(--lx-azul-primario);color:#fff;border:none;cursor:pointer;font-size:12.5px;font-weight:700', onClick: async () => {
          if (apelido.value.trim()) {
            try { await post('/entregas/enderecos-salvos', { apelido: apelido.value.trim(), endereco_completo: r.label, lat: r.lat, lng: r.lng, bairro: r.bairro, cidade: r.cidade, uf: r.uf }); toast('"' + apelido.value.trim() + '" salvo!', 'ok'); } catch {}
          }
          confirmar({ ...r, apelido: apelido.value.trim() || r.label });
          ov.remove();
        }}, 'Salvar e usar')));
    ov.append(box);
    ov.addEventListener('click', e => { if (e.target === ov) { confirmar(r); ov.remove(); } });
    document.body.append(ov);
  }

  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    clearTimeout(_timerSalvos); clearTimeout(_timerGeo);
    if (!q) { fecharDrops(); return; }
    _timerSalvos = setTimeout(() => carregarSalvos(q), 300);
    if (q.length >= 5) _timerGeo = setTimeout(() => buscarGeo(q), 800);
  });

  inp.addEventListener('focus', () => { if (!inp.value) carregarSalvos(); });

  btnSalvos.addEventListener('click', () => {
    if (dropSalvos.style.display === 'block') { fecharDrops(); return; }
    carregarSalvos(inp.value.trim());
  });

  btnPin.addEventListener('click', () => { const q = inp.value.trim(); if (q) buscarGeo(q); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const q = inp.value.trim(); if (q) buscarGeo(q); } });

  document.addEventListener('click', e => { if (!wrap.contains(e.target)) fecharDrops(); }, true);

  const wrap = el('div', { style: 'position:relative' },
    el('div', { style: 'display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);background:var(--lx-superficie)' },
      inp, btnPin, btnSalvos),
    dropSalvos, dropGeo, confirmadoWrap);

  wrap.obterValor = () => _confirmado;
  return wrap;
}

// ── PONTO DE DESTINO ──────────────────────────────────────────────────────────
function PontoDestino(numero, onRemover, onAtualizar) {
  const busca = CampoBusca({
    onConfirmar: (r) => { dados.lat = r.lat; dados.lng = r.lng; dados.endereco = r.label || r.apelido || r.endereco_completo; if (onAtualizar) onAtualizar(); },
    onLimpar: () => { dados.lat = null; dados.lng = null; dados.endereco = null; if (onAtualizar) onAtualizar(); }
  });

  const dados = { lat: null, lng: null, endereco: null, nome_fantasia: null, numero_nf: null, complemento: null, observacoes: null, telefone: null };

  const campos = el('div', { style: 'display:none;flex-direction:column;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--lx-linha)' });

  function input(placeholder, key, obrigatorio) {
    const inp = el('input', { style: 'width:100%;padding:8px 10px;border:1px solid var(--lx-linha);border-radius:8px;font-size:12.5px;background:var(--lx-superficie)', placeholder: (obrigatorio ? '* ' : '') + placeholder });
    inp.addEventListener('input', () => { dados[key] = inp.value.trim() || null; });
    return el('div', {},
      el('div', { style: 'font-size:11px;color:var(--lx-tinta-2);margin-bottom:3px;font-weight:600' }, placeholder + (obrigatorio ? ' *' : '')),
      inp);
  }

  campos.append(
    input('Nome fantasia / destinatário', 'nome_fantasia', false),
    input('Nº NF / Pedido', 'numero_nf', false),
    input('Complemento', 'complemento', false),
    input('Observações p/ motoboy', 'observacoes', false),
    input('Telefone do cliente', 'telefone', false));

  const btnCampos = el('button', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:600;background:none;border:none;cursor:pointer;margin-top:4px;text-align:left', onClick: () => {
    const aberto = campos.style.display !== 'none';
    campos.style.display = aberto ? 'none' : 'flex';
    btnCampos.textContent = aberto ? '+ Adicionar detalhes' : '− Ocultar detalhes';
  }}, '+ Adicionar detalhes');

  const wrap = el('div', { style: 'background:var(--lx-superficie-2);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:11px 13px;display:flex;flex-direction:column;gap:8px' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px' },
      el('div', { style: 'display:flex;align-items:center;gap:8px' },
        el('div', { style: 'width:24px;height:24px;border-radius:50%;background:var(--lx-azul-primario);color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none' }, numero),
        el('b', { style: 'font-size:13px;color:var(--lx-tinta)' }, 'Ponto de entrega')),
      onRemover ? el('button', { style: 'color:var(--lx-erro);font-size:18px;cursor:pointer;background:none;border:none;line-height:1', onClick: onRemover }, '×') : el('span', {})),
    busca, campos, btnCampos);

  wrap.obterDados = () => ({ ...dados, ...busca.obterValor() ? {} : { lat: null } });
  wrap.obterBusca = () => busca;
  return wrap;
}

// ── TELA PRINCIPAL ──────────────────────────────────────────────────────────
export async function montar(container) {
  const abaAtiva = { val: 'nova' };
  let _entregas = [];
  let _mapa = null;
  let _pontos = [];

  // ── CSS local ──
  if (!document.getElementById('lx-ent-style')) {
    const s = document.createElement('style');
    s.id = 'lx-ent-style';
    s.textContent = `
      .lx-ent-shell { display: grid; grid-template-rows: auto 1fr; height: calc(100vh - 120px); }
      .lx-ent-abas { display: flex; gap: 2px; padding: 0 0 0 2px; background: var(--lx-superficie); border-bottom: 1px solid var(--lx-linha); }
      .lx-ent-aba { padding: 11px 18px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; background: none; color: var(--lx-tinta-2); border-bottom: 2.5px solid transparent; }
      .lx-ent-aba.on { color: var(--lx-azul-primario); border-bottom-color: var(--lx-azul-primario); }
      .lx-ent-body { display: grid; grid-template-columns: 360px 1fr; overflow: hidden; }
      .lx-ent-side { overflow-y: auto; border-right: 1px solid var(--lx-linha); background: var(--lx-superficie); display: flex; flex-direction: column; }
      .lx-ent-mapa { position: relative; }
      .lx-mapa-stats { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 1px; background: var(--lx-superficie); border-radius: 10px; overflow: hidden; border: 1px solid var(--lx-linha); box-shadow: var(--lx-sombra-sm); }
      .lx-mapa-stat { padding: 9px 18px; text-align: center; border-right: 1px solid var(--lx-linha); }
      .lx-mapa-stat:last-child { border-right: none; }
      .lx-mapa-stat label { font-size: 10px; color: var(--lx-tinta-2); display: block; }
      .lx-mapa-stat b { font-size: 16px; font-weight: 700; color: var(--lx-tinta); }
    `;
    document.head.append(s);
  }

  // ── Abas ──
  const tabs = ['nova', 'ativas', 'concluidas', 'canceladas'].map((id, i) => {
    const rotulos = { nova: '✦ Nova', ativas: 'Ativas', concluidas: 'Concluídas', canceladas: 'Canceladas' };
    const aba = el('button', { class: 'lx-ent-aba' + (id === 'nova' ? ' on' : ''), onClick: () => trocarAba(id) }, rotulos[id]);
    return { id, el: aba };
  });

  const abasEl = el('div', { class: 'lx-ent-abas' }, ...tabs.map(t => t.el));

  function trocarAba(id) {
    abaAtiva.val = id;
    tabs.forEach(t => t.el.classList.toggle('on', t.id === id));
    sideNova.style.display = id === 'nova' ? 'flex' : 'none';
    sideHistorico.style.display = id !== 'nova' ? 'block' : 'none';
    if (id !== 'nova') renderHistorico();
    if (id === 'nova' && _mapa) setTimeout(() => _mapa.invalidar(), 50);
  }

  // ── Sidebar: nova entrega ──
  const statDist = el('b', { style: 'font-size:16px;font-weight:700;color:var(--lx-tinta)' }, '—');
  const statTempo = el('b', { style: 'font-size:16px;font-weight:700;color:var(--lx-tinta)' }, '—');

  // Campo coleta
  const buscaColeta = CampoBusca({
    onConfirmar: () => atualizarMapa(),
    onLimpar: () => atualizarMapa(),
  });

  const pontosWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });

  function adicionarPonto() {
    const num = _pontos.length + 1;
    const ponto = PontoDestino(num,
      _pontos.length > 0 ? () => {
        _pontos = _pontos.filter(p => p !== ponto);
        pontosWrap.removeChild(ponto);
        atualizarMapa();
      } : null,
      atualizarMapa);
    _pontos.push(ponto);
    pontosWrap.append(ponto);
  }
  adicionarPonto(); // sempre começa com 1 destino

  const btnAddDestino = el('button', { style: 'display:flex;align-items:center;gap:7px;padding:9px 13px;border:1.5px dashed var(--lx-linha);border-radius:var(--lx-raio-sm);background:none;cursor:pointer;color:var(--lx-tinta-2);font-size:12.5px;font-weight:600;width:100%', onClick: () => { adicionarPonto(); atualizarMapa(); } },
    el('span', { style: 'font-size:18px;line-height:1;color:var(--lx-azul-primario)' }, '+'), 'Adicionar destino');

  // Seleção de motoboy
  const modoAuto = { val: true };
  const mbId = { val: null };
  const mbListaWrap = el('div', { style: 'display:none;flex-direction:column;gap:5px;margin-top:8px;max-height:180px;overflow-y:auto' });

  const btnAuto = el('div', { style: 'flex:1;border:1.5px solid var(--lx-azul-vivo);background:var(--lx-info-bg);border-radius:9px;padding:10px 12px;cursor:pointer', onClick: () => { modoAuto.val = true; btnAuto.style.borderColor='var(--lx-azul-vivo)'; btnAuto.style.background='var(--lx-info-bg)'; btnManual.style.borderColor='var(--lx-linha)'; btnManual.style.background=''; mbListaWrap.style.display='none'; } },
    el('b', { style: 'font-size:12.5px;display:block' }, 'Automático'),
    el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Motoboy mais próximo'));
  const btnManual = el('div', { style: 'flex:1;border:1.5px solid var(--lx-linha);border-radius:9px;padding:10px 12px;cursor:pointer', onClick: () => { modoAuto.val = false; btnManual.style.borderColor='var(--lx-azul-vivo)'; btnManual.style.background='var(--lx-info-bg)'; btnAuto.style.borderColor='var(--lx-linha)'; btnAuto.style.background=''; mbListaWrap.style.display='flex'; } },
    el('b', { style: 'font-size:12.5px;display:block' }, 'Manual'),
    el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, 'Escolher da lista'));

  // Carregar motoboys
  (async () => {
    try {
      const mbs = await get('/motoboys?online=true').catch(() => []);
      const CORES = ['#185FA5','#0F6E56','#534AB7','#854F0B'];
      mbs.filter(m => m.online && m.status !== 'inativo').forEach((m, i) => {
        const ini = m.nome_completo.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
        const row = el('div', { style: `display:flex;align-items:center;gap:9px;padding:8px 10px;border:1.5px solid var(--lx-linha);border-radius:8px;cursor:pointer`, onClick: () => {
          mbId.val = m.id;
          mbListaWrap.querySelectorAll('[data-mb]').forEach(r => { r.style.borderColor='var(--lx-linha)'; r.style.background=''; });
          row.style.borderColor='var(--lx-azul-primario)'; row.style.background='var(--lx-info-bg)';
        }});
        row.setAttribute('data-mb', m.id);
        row.append(
          el('div', { style: `width:28px;height:28px;border-radius:50%;background:${CORES[i%CORES.length]};color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none` }, ini),
          el('div', { style: 'flex:1' }, el('b', { style: 'font-size:12px;display:block' }, m.nome_completo), el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `Online · ${m.carga || 0} entrega(s)`)));
        mbListaWrap.append(row);
      });
      if (!mbs.filter(m => m.online).length) mbListaWrap.append(el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);padding:6px 0' }, 'Nenhum online.'));
    } catch {}
  })();

  const msgCriar = el('div', { style: 'font-size:12px;min-height:16px;font-weight:600;text-align:center' });
  const btnCriar = el('button', { style: 'width:100%;padding:13px;background:var(--lx-azul-primario);color:#fff;border:none;border-radius:var(--lx-raio-sm);font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px', onClick: criarEntrega },
    el('span', { html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>` }), 'Solicitar entrega');

  async function criarEntrega() {
    const coleta = buscaColeta.obterValor();
    if (!coleta?.lat) { toast('Confirme o endereço de coleta', 'erro'); return; }
    const destinos = _pontos.map(p => {
      const v = p.obterBusca().obterValor();
      const d = p.obterDados();
      return v ? { endereco: v.label || v.apelido || v.endereco_completo, lat: v.lat, lng: v.lng, nome_fantasia: d.nome_fantasia, numero_nf: d.numero_nf, complemento: d.complemento, observacoes: d.observacoes, telefone: d.telefone } : null;
    }).filter(Boolean);
    if (!destinos.length) { toast('Confirme ao menos um destino', 'erro'); return; }
    if (!modoAuto.val && !mbId.val) { toast('Selecione um motoboy ou modo automático', 'erro'); return; }
    btnCriar.disabled = true; msgCriar.style.color = 'var(--lx-tinta-2)'; msgCriar.textContent = 'Criando…';
    try {
      const r = await post('/entregas', { coleta: { endereco: coleta.label || coleta.apelido || coleta.endereco_completo, lat: coleta.lat, lng: coleta.lng }, destinos, motoboy_id: !modoAuto.val ? mbId.val : undefined });
      msgCriar.style.color = 'var(--lx-ok)'; msgCriar.textContent = '✓ Entrega criada: ' + (r.protocolo || '');
      toast('Entrega ' + r.protocolo + ' criada!', 'ok');
      // Trocar para aba ativas
      setTimeout(() => trocarAba('ativas'), 1500);
    } catch (e) { msgCriar.style.color = 'var(--lx-erro)'; msgCriar.textContent = e.message; }
    finally { btnCriar.disabled = false; }
  }

  const sideNova = el('div', { style: 'display:flex;flex-direction:column;gap:0;flex:1' },
    // Coleta
    el('div', { style: 'padding:14px;border-bottom:1px solid var(--lx-linha)' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px' },
        el('div', { style: 'width:26px;height:26px;border-radius:50%;background:var(--lx-azul-profundo);color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none' }, 'C'),
        el('b', { style: 'font-size:13px;color:var(--lx-tinta)' }, 'Ponto de coleta')),
      buscaColeta),
    // Destinos
    el('div', { style: 'padding:14px;border-bottom:1px solid var(--lx-linha);display:flex;flex-direction:column;gap:10px' },
      pontosWrap, btnAddDestino),
    // Motoboy
    el('div', { style: 'padding:14px;border-bottom:1px solid var(--lx-linha)' },
      el('b', { style: 'font-size:12.5px;font-weight:700;display:block;margin-bottom:10px;color:var(--lx-tinta)' }, 'Motoboy'),
      el('div', { style: 'display:flex;gap:7px' }, btnAuto, btnManual),
      mbListaWrap),
    // Botão
    el('div', { style: 'padding:14px;margin-top:auto' }, btnCriar, msgCriar));

  // ── Sidebar: histórico ──
  const sideHistorico = el('div', { style: 'display:none;overflow-y:auto;flex:1' });

  function renderHistorico() {
    sideHistorico.innerHTML = '';
    let lista = _entregas;
    if (abaAtiva.val === 'ativas') lista = lista.filter(e => ['aguardando_atribuicao','aguardando_coleta','em_coleta','em_rota'].includes(e.status));
    if (abaAtiva.val === 'concluidas') lista = lista.filter(e => e.status === 'entregue');
    if (abaAtiva.val === 'canceladas') lista = lista.filter(e => e.status === 'cancelada');

    if (!lista.length) {
      sideHistorico.append(el('div', { style: 'padding:32px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nenhuma entrega nesta categoria.'));
      return;
    }

    lista.forEach(e => {
      const card = el('div', { style: 'padding:13px 14px;border-bottom:1px solid var(--lx-linha);cursor:pointer' });
      card.addEventListener('mouseenter', () => card.style.background = 'var(--lx-superficie-2)');
      card.addEventListener('mouseleave', () => card.style.background = '');
      card.addEventListener('click', () => {
        if (_mapa) _mapa.renderizarExistente(e.id);
      });
      card.append(
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:5px' },
          el('b', { style: 'font-size:13px;color:var(--lx-tinta)' }, e.protocolo || '—'),
          statusBadge(e.status)),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
          '📍 ' + (e.coleta_endereco?.split(',')[0] || '—')),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
          '🏁 ' + (e.destino_endereco?.split(',')[0] || '—')),
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:6px' },
          el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, fmtData(e.criado_em)),
          el('div', { style: 'display:flex;gap:5px' },
            e.motoboy_nome ? el('span', { style: 'font-size:11px;color:var(--lx-tinta-2);font-weight:600' }, '🏍 ' + e.motoboy_nome.split(' ')[0]) : el('span', {}),
            auth.pode('entregas.criar') && !['entregue','cancelada'].includes(e.status)
              ? el('button', { style: 'font-size:11px;padding:3px 8px;border-radius:6px;background:var(--lx-erro-bg);color:var(--lx-erro);border:none;cursor:pointer;font-weight:700', onClick: async ev => {
                  ev.stopPropagation();
                  try { await patch('/entregas/' + e.id + '/cancelar', {}); toast('Cancelada.', 'ok'); carregar(); }
                  catch (err) { toast(err.message, 'erro'); }
                }}, 'Cancelar') : el('span', {}))));
      sideHistorico.append(card);
    });
  }

  // ── Mapa div ──
  const mapaDiv = el('div', { style: 'width:100%;height:100%' });
  const statsEl = el('div', { class: 'lx-mapa-stats', style: 'display:none' },
    el('div', { class: 'lx-mapa-stat' }, el('label', {}, 'Distância'), statDist),
    el('div', { class: 'lx-mapa-stat' }, el('label', {}, 'Tempo est.'), statTempo),
    el('div', { class: 'lx-mapa-stat' }, el('label', {}, 'Paradas'), el('b', { id: 'lx-paradas', style: 'font-size:16px;font-weight:700;color:var(--lx-tinta)' }, '1')));

  const mapaWrap = el('div', { class: 'lx-ent-mapa' }, mapaDiv, statsEl);

  // ── Layout completo ──
  const body = el('div', { class: 'lx-ent-body' },
    el('div', { class: 'lx-ent-side' }, sideNova, sideHistorico),
    mapaWrap);

  const shell = el('div', { class: 'lx-ent-shell' }, abasEl, body);
  container.append(casca('Entregas', shell, 'Coleta e destinos — rota otimizada automaticamente'));

  // Iniciar mapa
  setTimeout(async () => {
    _mapa = criarMapaInstance(mapaDiv);
    await _mapa.init();
  }, 100);

  // Atualizar mapa quando endereços mudam
  let _mapaTimer = null;
  async function atualizarMapa() {
    clearTimeout(_mapaTimer);
    _mapaTimer = setTimeout(async () => {
      if (!_mapa) return;
      const coleta = buscaColeta.obterValor();
      const destinos = _pontos.map(p => p.obterBusca().obterValor()).filter(Boolean);
      if (!coleta?.lat && !destinos.length) return;
      const r = await _mapa.renderizar(coleta, destinos);
      if (r) {
        statDist.textContent = r.distanciaKm + ' km';
        statTempo.textContent = r.duracaoMin + ' min';
        statsEl.style.display = 'flex';
        const par = document.getElementById('lx-paradas');
        if (par) par.textContent = String(destinos.length);
      }
    }, 400);
  }

  // Carregar entregas
  async function carregar() {
    try { _entregas = await get('/entregas'); renderHistorico(); }
    catch {}
  }
  carregar();
}
