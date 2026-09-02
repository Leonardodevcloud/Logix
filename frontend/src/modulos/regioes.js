import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, put, del } from '../core/api.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;max-width:380px;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
function modal(titulo, corpo, acoes, larguraMax = '640px') {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,16,32,.55);z-index:2500;display:flex;align-items:center;justify-content:center;padding:20px' });
  const card = el('div', { style: `background:var(--lx-superficie);border-radius:var(--lx-raio-lg);max-width:${larguraMax};width:100%;max-height:92vh;overflow:auto;box-shadow:var(--lx-sombra-lg)` },
    el('div', { style: 'padding:18px 22px;border-bottom:1px solid var(--lx-linha);font-size:16px;font-weight:800' }, titulo),
    el('div', { style: 'padding:22px' }, corpo),
    el('div', { style: 'padding:16px 22px;border-top:1px solid var(--lx-linha);display:flex;gap:10px;justify-content:flex-end' }, ...acoes));
  ov.append(card); ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov); return ov;
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

export async function montar(container) {
  const lista = el('div', {});
  const topo = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px' },
    el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0;max-width:560px;line-height:1.5' }, 'Desenhe áreas no mapa para usar como alvo (ex.: nas campanhas de gamificação). Uma entrega pertence à região quando a COLETA cai dentro do polígono.'),
    el('button', { class: 'lx-btn lx-btn-primario', onClick: () => abrir(null) }, '+ Nova região'));

  async function recarregar() {
    lista.innerHTML = '';
    let regioes = [];
    try { regioes = (await get('/regioes')).regioes || []; } catch (e) { lista.append(el('div', { style: 'color:var(--lx-erro)' }, e.message || 'Erro ao carregar')); return; }
    if (!regioes.length) { lista.append(el('div', { style: 'text-align:center;padding:40px;color:var(--lx-tinta-3);font-size:13px' }, 'Nenhuma região ainda. Crie a primeira desenhando no mapa.')); return; }
    regioes.forEach(r => {
      const pts = Array.isArray(r.poligono) ? r.poligono.length : 0;
      lista.append(el('div', { style: 'display:flex;align-items:center;gap:12px;border:1px solid var(--lx-linha);border-radius:12px;padding:13px 15px;margin-bottom:10px' },
        el('span', { style: `width:14px;height:14px;border-radius:4px;background:${r.cor || '#185FA5'};flex:none` }),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-size:14px;font-weight:800' }, r.nome),
          el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:2px' }, pts + ' ponto(s)' + (r.ativo ? '' : ' · inativa'))),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:7px 12px', onClick: () => abrir(r) }, 'Editar'),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:7px 12px;color:var(--lx-erro)', onClick: async () => { if (!confirm('Excluir a região "' + r.nome + '"?')) return; try { await del('/regioes/' + r.id); toast('Excluída'); recarregar(); } catch (e) { toast(e.message, 'erro'); } } }, 'Excluir')));
    });
  }

  async function abrir(reg) {
    let poligono = reg && Array.isArray(reg.poligono) ? reg.poligono.map(p => [p[0], p[1]]) : [];
    const inpNome = el('input', { class: 'lx-input', value: reg ? reg.nome : '' });
    const inpCor = el('input', { type: 'color', value: reg ? (reg.cor || '#185FA5') : '#185FA5', style: 'width:44px;height:38px;border:1px solid var(--lx-linha);border-radius:8px;padding:2px;cursor:pointer' });
    const chkAtivo = el('input', { type: 'checkbox', ...(reg ? (reg.ativo !== false ? { checked: true } : {}) : { checked: true }) });

    const mapaDiv = el('div', { style: 'height:340px;border-radius:10px;overflow:hidden;border:1px solid var(--lx-linha)' });
    const contador = el('span', { style: 'font-size:12px;color:var(--lx-tinta-3);margin-left:8px' }, '');
    const btnDesfazer = el('button', { type: 'button', class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => { poligono.pop(); redesenhar(); } }, 'Desfazer último');
    const btnLimpar = el('button', { type: 'button', class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => { poligono = []; redesenhar(); } }, 'Limpar área');

    let mapa = null, camadaPoli = null, marcadores = [];
    const iconePonto = () => window.L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;background:#185FA5;border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);cursor:move"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    function desenharForma() {
      if (camadaPoli) { mapa.removeLayer(camadaPoli); camadaPoli = null; }
      const cor = inpCor.value || '#185FA5';
      if (poligono.length >= 3) camadaPoli = window.L.polygon(poligono, { color: cor, weight: 2, fillOpacity: 0.15 }).addTo(mapa);
      else if (poligono.length === 2) camadaPoli = window.L.polyline(poligono, { color: cor, weight: 2, dashArray: '4' }).addTo(mapa);
      contador.textContent = poligono.length + ' ponto(s)' + (poligono.length < 3 ? ' — mínimo 3' : '');
    }
    function reconstruirPinos() {
      marcadores.forEach(m => mapa.removeLayer(m)); marcadores = [];
      poligono.forEach((p, i) => {
        const mk = window.L.marker(p, { draggable: true, icon: iconePonto() }).addTo(mapa);
        mk.on('drag', () => { const ll = mk.getLatLng(); poligono[i] = [ll.lat, ll.lng]; desenharForma(); });
        mk.on('contextmenu', (e) => { window.L.DomEvent.stop(e); poligono.splice(i, 1); redesenhar(); });
        marcadores.push(mk);
      });
    }
    function redesenhar() { if (!mapa || !window.L) return; reconstruirPinos(); desenharForma(); }
    inpCor.addEventListener('input', desenharForma);

    async function initMapa() {
      await garantirLeaflet();
      const centro = poligono.length ? poligono[0] : [-12.9718, -38.5011];
      mapa = window.L.map(mapaDiv).setView(centro, poligono.length ? 13 : 12);
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO' }).addTo(mapa);
      mapa.on('click', (e) => { poligono.push([e.latlng.lat, e.latlng.lng]); redesenhar(); });
      setTimeout(() => { mapa.invalidateSize(); redesenhar(); }, 80);
    }

    const corpo = el('div', {},
      el('div', { style: 'display:flex;gap:12px;align-items:flex-end;margin-bottom:14px' },
        el('div', { class: 'lx-field', style: 'flex:1' }, el('label', {}, 'Nome da região'), inpNome),
        el('div', { class: 'lx-field' }, el('label', {}, 'Cor'), inpCor)),
      el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:14px' }, chkAtivo, 'Região ativa'),
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-bottom:8px;line-height:1.5' }, 'Clique no mapa para adicionar cantos. Arraste as bolinhas para ajustar. Botão direito num ponto para remover.'),
      el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:8px' }, btnDesfazer, btnLimpar, contador),
      mapaDiv);

    const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario' }, reg ? 'Salvar' : 'Criar região');
    const ov = modal(reg ? 'Editar região' : 'Nova região', corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btnSalvar]);
    initMapa();
    btnSalvar.onclick = async () => {
      const dados = { nome: inpNome.value.trim(), cor: inpCor.value, ativo: chkAtivo.checked, poligono };
      if (!dados.nome) { toast('Informe o nome', 'erro'); return; }
      if (poligono.length < 3) { toast('Desenhe a área (mínimo 3 pontos)', 'erro'); return; }
      try { btnSalvar.disabled = true; if (reg) await put('/regioes/' + reg.id, dados); else await post('/regioes', dados); toast('Região salva'); ov.remove(); recarregar(); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); btnSalvar.disabled = false; }
    };
  }

  const conteudo = el('div', { class: 'lx-card', style: 'padding:22px;max-width:760px' }, topo, lista);
  container.append(casca('Regiões', conteudo, 'Áreas no mapa usadas como alvo de campanhas e regras.'));
  recarregar();
}
