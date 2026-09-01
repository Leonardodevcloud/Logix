import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import { aplicarBasemap } from '../core/mapa-tiles.js';

const TZ = 'America/Bahia';
const CORES = ['#185FA5', '#6B4FC9', '#1F9D6B', '#C98A1A', '#D0584F', '#378ADD'];

function dt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return '—'; }
}
function horaCompleta(iso) {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch (e) { return '—'; }
}

async function garantirLeaflet() {
  if (window.L) return;
  if (!document.getElementById('lx-leaflet-css')) {
    const l = document.createElement('link');
    l.id = 'lx-leaflet-css'; l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(l);
  }
  await new Promise((res) => {
    if (document.getElementById('lx-leaflet-js')) {
      const t = setInterval(() => { if (window.L) { clearInterval(t); res(); } }, 50);
      return;
    }
    const s = document.createElement('script');
    s.id = 'lx-leaflet-js';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => res();
    document.body.append(s);
  });
}

function bearing(a, b) {
  const r = (d) => d * Math.PI / 180;
  const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function setaIcon(cor, ang) {
  return window.L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7],
    html: `<div style="transform:rotate(${ang}deg);color:${cor};font-size:14px;line-height:14px;text-shadow:0 0 3px #fff,0 0 3px #fff">\u25b2</div>` });
}
function rotuloIcon(cor, texto) {
  return window.L.divIcon({ className: '', iconSize: [1, 1], iconAnchor: [0, 0],
    html: `<div style="transform:translate(-50%,-115%);white-space:nowrap;background:${cor};color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:14px;box-shadow:0 3px 8px rgba(0,0,0,.35);position:relative">${texto}<span style="position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${cor}"></span></div>` });
}

export function montar(container) {
  const estado = { protocolo: '', entregador: '', data: '', hora_ini: '', hora_fim: '' };
  const selecionadas = new Set();
  let _corridas = [];

  const inpEstilo = 'width:100%;font-size:12.5px;border:1px solid var(--lx-linha);border-radius:8px;padding:8px 10px;background:#fff;color:var(--lx-tinta)';
  const campo = (rot, node) => el('div', {}, el('label', { style: 'display:block;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:4px' }, rot), node);

  const inProt = el('input', { style: inpEstilo, placeholder: 'nº do protocolo', onInput: (e) => estado.protocolo = e.target.value.trim() });
  // Autocomplete de entregador: dropdown que busca conforme a digitação.
  const acWrap = el('div', { style: 'position:relative' });
  const inEnt = el('input', { style: inpEstilo, placeholder: 'nome ou código', autocomplete: 'off' });
  const acLista = el('div', { style: 'position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--lx-linha);border-top:none;border-radius:0 0 8px 8px;box-shadow:0 10px 24px rgba(4,44,83,.14);z-index:40;max-height:230px;overflow:auto;display:none' });
  acWrap.append(inEnt, acLista);
  let acTimer = null;
  inEnt.addEventListener('input', () => {
    estado.entregador = inEnt.value.trim();
    clearTimeout(acTimer);
    const q = inEnt.value.trim();
    if (!q) { acLista.style.display = 'none'; return; }
    acTimer = setTimeout(async () => {
      try {
        const r = await get('/rotas/entregadores?q=' + encodeURIComponent(q));
        const itens = r.entregadores || [];
        acLista.innerHTML = '';
        if (!itens.length) { acLista.style.display = 'none'; return; }
        itens.forEach((m) => {
          const rot = (m.codigo != null ? m.codigo + ' - ' : '') + (m.nome_completo || '');
          const opt = el('div', { style: 'padding:9px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--lx-fundo)' }, rot);
          opt.addEventListener('mouseenter', () => opt.style.background = 'var(--lx-fundo)');
          opt.addEventListener('mouseleave', () => opt.style.background = '');
          opt.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            inEnt.value = rot;
            estado.entregador = m.codigo != null ? String(m.codigo) : (m.nome_completo || '');
            acLista.style.display = 'none';
          });
          acLista.append(opt);
        });
        acLista.style.display = 'block';
      } catch (e) { acLista.style.display = 'none'; }
    }, 250);
  });
  inEnt.addEventListener('blur', () => setTimeout(() => { acLista.style.display = 'none'; }, 150));
  const inData = el('input', { style: inpEstilo, type: 'date', onInput: (e) => estado.data = e.target.value });
  const inHi = el('input', { style: inpEstilo, type: 'time', onInput: (e) => estado.hora_ini = e.target.value });
  const inHf = el('input', { style: inpEstilo, type: 'time', onInput: (e) => estado.hora_fim = e.target.value });

  const filtros = el('div', { class: 'lx-card', style: 'padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:14px' },
    campo('Protocolo', inProt),
    campo('Entregador (nome ou código)', acWrap),
    campo('Data', inData),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, campo('Hora início', inHi), campo('Hora fim', inHf)));

  const btnBuscar = el('button', { class: 'lx-btn lx-btn-primario', onClick: () => buscar() }, 'Buscar rotas');

  const lote = el('span', { style: 'display:none;background:#E4EEF9;color:var(--lx-azul);font-weight:800;font-size:12px;padding:4px 10px;border-radius:20px' });
  const btnLote = el('button', { class: 'lx-btn', style: 'display:none;font-size:12.5px;background:var(--lx-navy,#042C53);color:#fff;border:none', onClick: () => verRota([...selecionadas]) }, 'Ver rota das selecionadas (em lote)');
  const info = el('span', { style: 'margin-left:auto;font-size:12px;color:var(--lx-tinta-2)' });
  const barra = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--lx-linha)' }, btnBuscar, lote, btnLote, info);

  const tabela = el('div', {});
  const cardLista = el('div', { class: 'lx-card' }, barra, tabela);

  function atualizarLote() {
    const n = selecionadas.size;
    lote.textContent = n + ' selecionada' + (n > 1 ? 's' : '');
    lote.style.display = n ? 'inline-block' : 'none';
    btnLote.style.display = n ? 'inline-block' : 'none';
  }

  async function buscar() {
    selecionadas.clear(); atualizarLote();
    tabela.innerHTML = '<div style="padding:24px;color:var(--lx-tinta-3);font-size:13px">Carregando…</div>';
    const p = new URLSearchParams();
    if (estado.protocolo) p.set('protocolo', estado.protocolo);
    if (estado.entregador) p.set('entregador', estado.entregador);
    if (estado.data) p.set('data', estado.data);
    if (estado.hora_ini) p.set('hora_ini', estado.hora_ini);
    if (estado.hora_fim) p.set('hora_fim', estado.hora_fim);
    try {
      const r = await get('/rotas?' + p.toString());
      _corridas = r.corridas || [];
      render();
    } catch (e) {
      tabela.innerHTML = '';
      tabela.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, e.message || 'Erro ao buscar'));
    }
  }

  function render() {
    tabela.innerHTML = '';
    info.textContent = _corridas.length + ' corrida' + (_corridas.length !== 1 ? 's' : '');
    if (!_corridas.length) {
      tabela.append(el('div', { style: 'padding:28px;text-align:center;color:var(--lx-tinta-3);font-size:13px' }, 'Nenhuma corrida encontrada com esses filtros.'));
      return;
    }
    const th = (t, s) => el('th', { style: 'background:#F5F8FC;text-align:left;font-size:10.5px;font-weight:800;color:var(--lx-tinta-2);text-transform:uppercase;padding:9px 14px;border-bottom:1px solid var(--lx-linha);' + (s || '') }, t);
    const thead = el('tr', {}, th('', 'width:34px'), th('Protocolo'), th('Endereço de entrega'), th('Criação'), th('Conclusão'), th('GPS'), th(''));
    const tbody = el('tbody', {});
    _corridas.forEach((c) => {
      const chk = el('input', { type: 'checkbox', onChange: (e) => { if (e.target.checked) selecionadas.add(c.id); else selecionadas.delete(c.id); atualizarLote(); } });
      const td = 'padding:11px 14px;border-bottom:1px solid var(--lx-fundo);font-size:12.5px;vertical-align:top';
      const semGps = !c.pontos_gps;
      tbody.append(el('tr', {},
        el('td', { style: td }, chk),
        el('td', { style: td + ';font-weight:800;color:var(--lx-azul)' }, c.protocolo || '—'),
        el('td', { style: td + ';max-width:280px' }, c.destino || '—'),
        el('td', { style: td }, dt(c.criado_em)),
        el('td', { style: td }, dt(c.concluida_em)),
        el('td', { style: td + ';color:var(--lx-tinta-3)' }, (c.pontos_gps || 0) + ' pts'),
        el('td', { style: td },
          semGps
            ? el('span', { style: 'color:var(--lx-tinta-3);font-size:12px' }, 'sem GPS')
            : el('span', { style: 'color:var(--lx-azul);font-weight:700;cursor:pointer;font-size:12px', onClick: () => verRota([c.id]) }, 'Ver rota ▸'))));
    });
    tabela.append(el('table', { style: 'border-collapse:collapse;width:100%' }, el('thead', {}, thead), tbody));
  }

  // ── Modal do mapa ────────────────────────────────────────────────
  async function verRota(ids) {
    if (!ids.length) return;
    const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,20,40,.55);display:flex;align-items:center;justify-content:center;z-index:9999' });
    const mapDiv = el('div', { style: 'height:440px' });
    const rodape = el('div', { style: 'display:flex;gap:18px;padding:12px 18px;border-top:1px solid var(--lx-linha);font-size:12px;color:var(--lx-tinta-2);flex-wrap:wrap' });
    const titulo = el('b', { style: 'font-size:15px' }, ids.length > 1 ? 'Rotas — ' + ids.length + ' corridas' : 'Rota');
    const fechar = el('span', { style: 'margin-left:auto;font-size:22px;color:#8ba5bc;cursor:pointer', onClick: () => overlay.remove() }, '×');
    const box = el('div', { style: 'width:860px;max-width:94%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4)' },
      el('div', { style: 'display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--lx-linha)' }, titulo, fechar),
      mapDiv, rodape);
    overlay.append(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.append(overlay);

    rodape.append(el('span', {}, 'Carregando trajeto…'));
    let dados;
    try { dados = await get('/rotas/pontos?ids=' + ids.join(',')); }
    catch (e) { rodape.innerHTML = ''; rodape.append(el('span', { style: 'color:var(--lx-erro)' }, e.message || 'Erro')); return; }

    const rotas = (dados.rotas || []).filter(r => r.pontos && r.pontos.length);
    if (!rotas.length) { rodape.innerHTML = ''; rodape.append(el('span', {}, 'Sem pontos de GPS para essas corridas.')); return; }

    await garantirLeaflet();
    const mapa = window.L.map(mapDiv, { zoomControl: true });
    try { aplicarBasemap(mapa); } catch (e) { window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd' }).addTo(mapa); }

    const todosPts = [];
    rotas.forEach((r, idx) => {
      const cor = CORES[idx % CORES.length];
      const pts = r.pontos;
      const latlngs = pts.map(p => [p.lat, p.lng]);
      latlngs.forEach(ll => todosPts.push(ll));

      // Traçado: linha grossa
      window.L.polyline(latlngs, { color: cor, weight: 5, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(mapa);

      // Setas de direção ao longo do trajeto (uma a cada ~14 pontos)
      const passo = Math.max(1, Math.floor(pts.length / 14));
      for (let i = passo; i < pts.length; i += passo) {
        const ang = bearing(pts[i - 1], pts[i]);
        window.L.marker([pts[i].lat, pts[i].lng], { icon: setaIcon(cor, ang), interactive: false, zIndexOffset: 200 }).addTo(mapa);
      }

      // Pontos intermediários: bolinhas leves, clicáveis pra ver a hora
      pts.forEach((p, i) => {
        if (i === 0 || i === pts.length - 1) return;
        window.L.circleMarker([p.lat, p.lng], { radius: 3.5, color: '#fff', weight: 1, fillColor: cor, fillOpacity: 0.95 })
          .addTo(mapa)
          .bindPopup(`<b>Hora:</b> ${horaCompleta(p.hora)}<br><span style="color:#8ba5bc">Posição${ids.length > 1 ? ' · ' + r.protocolo : ''}</span>`);
      });

      // Início (verde) e Fim (azul) com rótulo
      const ini = pts[0], fim = pts[pts.length - 1];
      window.L.marker([ini.lat, ini.lng], { icon: rotuloIcon('#1F9D6B', 'Início'), zIndexOffset: 600 }).addTo(mapa)
        .bindPopup(`<b>Início</b> · ${horaCompleta(ini.hora)}${ids.length > 1 ? '<br>' + r.protocolo : ''}`);
      window.L.marker([fim.lat, fim.lng], { icon: rotuloIcon('#042C53', 'Fim'), zIndexOffset: 600 }).addTo(mapa)
        .bindPopup(`<b>Fim</b> · ${horaCompleta(fim.hora)}${ids.length > 1 ? '<br>' + r.protocolo : ''}`);
    });

    if (todosPts.length) mapa.fitBounds(todosPts, { padding: [30, 30] });
    setTimeout(() => mapa.invalidateSize(), 50);

    // Rodapé com resumo
    rodape.innerHTML = '';
    if (rotas.length === 1) {
      const r = rotas[0];
      rodape.append(
        el('span', {}, 'Início: ', el('b', { style: 'color:var(--lx-tinta)' }, horaCompleta(r.pontos[0].hora))),
        el('span', {}, 'Fim: ', el('b', { style: 'color:var(--lx-tinta)' }, horaCompleta(r.pontos[r.pontos.length - 1].hora))),
        el('span', {}, r.pontos.length + ' pontos de GPS'),
        el('span', { style: 'margin-left:auto' },
          el('span', { style: 'color:#1F9D6B;font-weight:700' }, '● início'), '  ',
          el('span', { style: 'color:#042C53;font-weight:700' }, '● fim'), '  ',
          el('span', { style: 'color:#D0584F;font-weight:700' }, '● posições')));
    } else {
      rodape.append(el('span', {}, rotas.length + ' corridas · ' + rotas.reduce((s, r) => s + r.pontos.length, 0) + ' pontos'),
        el('span', { style: 'margin-left:auto;color:var(--lx-tinta-3)' }, 'Cada cor é uma corrida · clique num ponto para a hora'));
    }
  }

  const conteudo = el('div', {}, filtros, cardLista);
  container.append(casca('Rotas traçadas', conteudo, 'Trajeto real percorrido pelo entregador, a partir do GPS enviado durante a corrida.'));
}
