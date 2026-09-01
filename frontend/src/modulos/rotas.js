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

function pinDiv(cor, tam) {
  return window.L.divIcon({
    className: '',
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:50%;background:${cor};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
    iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2],
  });
}

export function montar(container) {
  const estado = { protocolo: '', entregador: '', data: '', hora_ini: '', hora_fim: '' };
  const selecionadas = new Set();
  let _corridas = [];

  const inpEstilo = 'width:100%;font-size:12.5px;border:1px solid var(--lx-linha);border-radius:8px;padding:8px 10px;background:#fff;color:var(--lx-tinta)';
  const campo = (rot, node) => el('div', {}, el('label', { style: 'display:block;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:4px' }, rot), node);

  const inProt = el('input', { style: inpEstilo, placeholder: 'nº do protocolo', onInput: (e) => estado.protocolo = e.target.value.trim() });
  const inEnt = el('input', { style: inpEstilo, placeholder: 'nome ou código', onInput: (e) => estado.entregador = e.target.value.trim() });
  const inData = el('input', { style: inpEstilo, type: 'date', onInput: (e) => estado.data = e.target.value });
  const inHi = el('input', { style: inpEstilo, type: 'time', onInput: (e) => estado.hora_ini = e.target.value });
  const inHf = el('input', { style: inpEstilo, type: 'time', onInput: (e) => estado.hora_fim = e.target.value });

  const filtros = el('div', { class: 'lx-card', style: 'padding:16px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:14px' },
    campo('Protocolo', inProt),
    campo('Entregador (nome ou código)', inEnt),
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
      const latlngs = r.pontos.map(p => [p.lat, p.lng]);
      latlngs.forEach(ll => todosPts.push(ll));
      // Trajeto (linha ligando os pontos)
      window.L.polyline(latlngs, { color: cor, weight: 4, opacity: 0.85 }).addTo(mapa);
      // Posições — cada ponto mostra a hora ao clicar
      r.pontos.forEach((p, i) => {
        const primeiro = i === 0, ultimo = i === r.pontos.length - 1;
        const mk = window.L.marker([p.lat, p.lng], {
          icon: primeiro ? pinDiv('#1F9D6B', 16) : ultimo ? pinDiv('#042C53', 16) : pinDiv('#D0584F', 10),
        }).addTo(mapa);
        const rotulo = primeiro ? 'Início' : ultimo ? 'Fim' : 'Posição';
        mk.bindPopup(`<b>Hora:</b> ${horaCompleta(p.hora)}<br><span style="color:#8ba5bc">${rotulo}${ids.length > 1 ? ' · ' + r.protocolo : ''}</span>`);
      });
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
