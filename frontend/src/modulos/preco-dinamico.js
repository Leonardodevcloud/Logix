import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import * as auth from '../core/auth.js';

const TIPOS = [
  { id: 'horario',         rotulo: 'Dia / horário' },
  { id: 'volume_cliente',  rotulo: 'Volume do cliente (nota)' },
  { id: 'volume_motoboy',  rotulo: 'Volume do motoboy (pedido)' },
  { id: 'raio',            rotulo: 'Raio no mapa (área)' },
];
const DIAS = [['Dom',0],['Seg',1],['Ter',2],['Qua',3],['Qui',4],['Sex',5],['Sáb',6]];
const RESET = [['Dia','dia'],['Semana','semana'],['Mês','mes']];

const rotuloTipo = (t) => (TIPOS.find(x => x.id === t) || {}).rotulo || t;
const reais = (cent) => 'R$ ' + ((cent || 0) / 100).toFixed(2).replace('.', ',');
const paraCent = (v) => Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100);

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

// Aba principal — lista de regras + botão nova.
export function abaPrecoDinamico() {
  const podeGerenciar = auth.pode('precos.gerenciar');
  const wrap = el('div', { class: 'lx-card', style: 'padding:20px 22px' });
  const head = el('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px' },
    el('div', {},
      el('h3', { style: 'font-size:16px;font-weight:800;margin:0 0 2px' }, 'Preço dinâmico'),
      el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0' }, 'Regras que somam um valor ao preço da corrida no lançamento. Uma regra não pode se sobrepor a outra ativa.')),
    podeGerenciar ? el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px;white-space:nowrap', onClick: () => abrirEditor(null, recarregar) }, '+ Nova regra') : null);
  const lista = el('div', {});
  wrap.append(head, lista);

  async function recarregar() {
    lista.innerHTML = '';
    lista.append(el('div', { style: 'padding:24px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));
    let regras = [];
    try { regras = await get('/precos'); } catch { lista.innerHTML = ''; lista.append(el('div', { style: 'padding:20px;color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar.')); return; }
    lista.innerHTML = '';
    if (!regras.length) { lista.append(el('div', { style: 'padding:28px;text-align:center;color:var(--lx-tinta-3);font-size:13px' }, 'Nenhuma regra ainda. Crie a primeira acima.')); return; }
    regras.forEach(r => lista.append(linhaRegra(r, recarregar, podeGerenciar)));
  }
  recarregar();
  return wrap;
}

function linhaRegra(r, recarregar, podeGerenciar) {
  const badge = el('span', { style: `flex:none;font-size:10px;font-weight:800;letter-spacing:.3px;padding:3px 8px;border-radius:5px;text-transform:uppercase;color:#fff;background:${r.ativo ? 'var(--lx-ok)' : 'var(--lx-tinta-3)'}` }, r.ativo ? 'Ativa' : 'Inativa');
  const valores = el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' },
    'Cliente: ' + reais(r.add_cliente_cent) + '  ·  Motoboy: ' + reais(r.add_motoboy_cent));

  const acoes = el('div', { style: 'display:flex;gap:6px;align-items:center;flex:none' });
  if (podeGerenciar) {
    const tg = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: async () => {
      try { await patch('/precos/' + r.id + '/ativo', { ativo: !r.ativo }); recarregar(); }
      catch (e) { alert(e.message); }
    } }, r.ativo ? 'Desativar' : 'Ativar');
    const ed = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => abrirEditor(r, recarregar) }, 'Editar');
    const rm = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;color:var(--lx-erro)', onClick: async () => {
      if (!confirm('Excluir a regra "' + r.nome + '"?')) return;
      try { await del('/precos/' + r.id); recarregar(); } catch (e) { alert(e.message); }
    } }, 'Excluir');
    acoes.append(tg, ed, rm);
  }

  return el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:0.5px solid var(--lx-linha)' },
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:2px' },
        el('span', { style: 'font-weight:700;font-size:13.5px;color:var(--lx-tinta)' }, r.nome), badge,
        el('span', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:700;background:var(--lx-azul-suave,#eaf2fb);padding:2px 8px;border-radius:5px' }, rotuloTipo(r.tipo))),
      valores),
    acoes);
}

// ── Editor (modal) ────────────────────────────────────────────────
async function abrirEditor(regra, recarregar) {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,20,40,.55);display:flex;align-items:flex-start;justify-content:center;padding:32px 16px;z-index:1200;overflow:auto' });
  const fechar = () => { try { document.body.removeChild(ov); } catch {} };
  const r = regra || {};

  // Estado do polígono (raio).
  let poligono = Array.isArray(r.poligono) ? r.poligono.slice() : [];

  // Campos comuns
  const inpNome = el('input', { class: 'lx-input', placeholder: 'Nome da regra (ex.: Segunda à noite)', value: r.nome || '' });
  const selTipo = el('select', { class: 'lx-input', style: 'height:38px;line-height:1.4;padding-top:0;padding-bottom:0' }, ...TIPOS.map(t => el('option', { value: t.id }, t.rotulo)));
  selTipo.value = r.tipo || 'horario';
  const inpCliente = el('input', { class: 'lx-input', placeholder: '0,00', value: r.add_cliente_cent ? (r.add_cliente_cent / 100).toFixed(2).replace('.', ',') : '' });
  const inpMotoboy = el('input', { class: 'lx-input', placeholder: '0,00', value: r.add_motoboy_cent ? (r.add_motoboy_cent / 100).toFixed(2).replace('.', ',') : '' });

  // Escopo
  const selLoja = el('select', { class: 'lx-input', style: 'height:38px;line-height:1.4;padding-top:0;padding-bottom:0' }, el('option', { value: '' }, 'Todas as lojas'));
  const selCentro = el('select', { class: 'lx-input', style: 'height:38px;line-height:1.4;padding-top:0;padding-bottom:0' }, el('option', { value: '' }, 'Todos os centros'));
  const selModalidade = el('select', { class: 'lx-input', style: 'height:38px;line-height:1.4;padding-top:0;padding-bottom:0' }, el('option', { value: '' }, 'Todas as modalidades'));

  // Blocos por tipo
  const blocoHorario = el('div', {});
  const blocoVolume = el('div', {});
  const blocoRaio = el('div', {});

  // -- Horário
  const diasCbs = DIAS.map(([lbl, v]) => {
    const cb = el('input', { type: 'checkbox' });
    if (Array.isArray(r.dias_semana) && r.dias_semana.includes(v)) cb.checked = true;
    cb.setAttribute('data-dia', v);
    return el('label', { style: 'display:inline-flex;align-items:center;gap:4px;font-size:12.5px;margin-right:10px;cursor:pointer' }, cb, lbl);
  });
  const inpHoraIni = el('input', { class: 'lx-input', type: 'time', value: r.hora_inicio ? String(r.hora_inicio).slice(0,5) : '' });
  const inpHoraFim = el('input', { class: 'lx-input', type: 'time', value: r.hora_fim ? String(r.hora_fim).slice(0,5) : '' });
  const inpDataIni = el('input', { class: 'lx-input', type: 'date', value: r.data_inicio ? String(r.data_inicio).slice(0,10) : '' });
  const inpDataFim = el('input', { class: 'lx-input', type: 'date', value: r.data_fim ? String(r.data_fim).slice(0,10) : '' });
  blocoHorario.append(
    campo('Dias da semana (vazio = todos)', el('div', { style: 'padding:6px 0' }, ...diasCbs)),
    dois(campo('Hora início', inpHoraIni), campo('Hora fim', inpHoraFim)),
    dois(campo('Vigência de (opcional)', inpDataIni), campo('Vigência até (opcional)', inpDataFim)));

  // -- Volume
  const inpVolN = el('input', { class: 'lx-input', type: 'number', min: '1', placeholder: 'ex.: 10', value: r.volume_a_partir_de || '' });
  const selReset = el('select', { class: 'lx-input', style: 'height:38px;line-height:1.4;padding-top:0;padding-bottom:0' }, ...RESET.map(([lbl, v]) => el('option', { value: v }, lbl)));
  if (r.volume_reset) selReset.value = r.volume_reset;
  const rotVol = el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'A partir de qual pedido/nota aplica');
  blocoVolume.append(rotVol, dois(campo('A partir de (Nº)', inpVolN), campo('Contagem reinicia a cada', selReset)));

  // -- Raio (mapa)
  const mapaDiv = el('div', { style: 'height:320px;border-radius:10px;overflow:hidden;border:1px solid var(--lx-linha)' });
  const infoRaio = el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:6px 0' }, 'Clique no mapa para marcar os cantos da área. A dinâmica vale quando a COLETA cai dentro.');
  const btnLimpar = el('button', { type: 'button', class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: () => { poligono = []; redesenhar(); } }, 'Limpar área');
  const contadorPts = el('span', { style: 'font-size:12px;color:var(--lx-tinta-3);margin-left:8px' }, '');
  blocoRaio.append(infoRaio, el('div', { style: 'display:flex;align-items:center;margin-bottom:8px' }, btnLimpar, contadorPts), mapaDiv);

  let mapa = null, camadaPoli = null, marcadores = [];
  function redesenhar() {
    if (!mapa || !window.L) return;
    marcadores.forEach(m => mapa.removeLayer(m)); marcadores = [];
    if (camadaPoli) { mapa.removeLayer(camadaPoli); camadaPoli = null; }
    poligono.forEach((p) => {
      const mk = window.L.circleMarker(p, { radius: 5, color: '#185FA5', fillColor: '#185FA5', fillOpacity: 1 });
      mk.addTo(mapa); marcadores.push(mk);
    });
    if (poligono.length >= 3) {
      camadaPoli = window.L.polygon(poligono, { color: '#185FA5', weight: 2, fillOpacity: 0.15 }).addTo(mapa);
    } else if (poligono.length === 2) {
      camadaPoli = window.L.polyline(poligono, { color: '#185FA5', weight: 2, dashArray: '4' }).addTo(mapa);
    }
    contadorPts.textContent = poligono.length + ' ponto(s)' + (poligono.length < 3 ? ' — mínimo 3' : '');
  }
  async function initMapa() {
    await garantirLeaflet();
    const centro = poligono.length ? poligono[0] : [-12.9718, -38.5011]; // Salvador como fallback
    mapa = window.L.map(mapaDiv).setView(centro, poligono.length ? 13 : 12);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO',
    }).addTo(mapa);
    mapa.on('click', (e) => { poligono.push([e.latlng.lat, e.latlng.lng]); redesenhar(); });
    setTimeout(() => { mapa.invalidateSize(); redesenhar(); }, 60);
  }

  // Alterna blocos conforme o tipo
  function aplicarTipo() {
    const t = selTipo.value;
    blocoHorario.style.display = t === 'horario' ? 'block' : 'none';
    blocoVolume.style.display = (t === 'volume_cliente' || t === 'volume_motoboy') ? 'block' : 'none';
    blocoRaio.style.display = t === 'raio' ? 'block' : 'none';
    if (t === 'raio' && !mapa) initMapa();
  }
  selTipo.onchange = aplicarTipo;

  // Carrega escopo (lojas) e, ao escolher loja, centros + modalidades
  (async () => {
    let lojas = [];
    try { lojas = await get('/lojas?ativo=true'); } catch {}
    lojas.forEach(l => selLoja.append(el('option', { value: l.id }, l.nome_fantasia)));
    if (r.loja_id) selLoja.value = r.loja_id;
    await carregarDeps();
  })();
  selLoja.onchange = () => carregarDeps();
  async function carregarDeps() {
    selCentro.innerHTML = ''; selCentro.append(el('option', { value: '' }, 'Todos os centros'));
    selModalidade.innerHTML = ''; selModalidade.append(el('option', { value: '' }, 'Todas as modalidades'));
    if (!selLoja.value) return;
    try {
      const centros = await get('/clientes/' + selLoja.value + '/contexto/centros').catch(() => []);
      centros.forEach(c => selCentro.append(el('option', { value: c.id }, c.nome + (c.codigo ? ' (' + c.codigo + ')' : ''))));
      if (r.centro_id) selCentro.value = r.centro_id;
    } catch {}
    try {
      const mods = await get('/clientes/' + selLoja.value + '/contexto/modalidades').catch(() => []);
      mods.forEach(m => selModalidade.append(el('option', { value: m.id }, m.nome)));
      if (r.modalidade_id) selModalidade.value = r.modalidade_id;
    } catch {}
  }

  async function salvar() {
    const t = selTipo.value;
    const corpo = {
      nome: inpNome.value.trim(),
      tipo: t,
      loja_id: selLoja.value || null,
      centro_id: selCentro.value || null,
      modalidade_id: selModalidade.value || null,
      add_cliente_cent: paraCent(inpCliente.value),
      add_motoboy_cent: paraCent(inpMotoboy.value),
    };
    if (t === 'horario') {
      const dias = Array.from(ov.querySelectorAll('input[data-dia]')).filter(x => x.checked).map(x => Number(x.getAttribute('data-dia')));
      corpo.dias_semana = dias.length ? dias : null;
      corpo.hora_inicio = inpHoraIni.value || null;
      corpo.hora_fim = inpHoraFim.value || null;
      corpo.data_inicio = inpDataIni.value || null;
      corpo.data_fim = inpDataFim.value || null;
    } else if (t === 'volume_cliente' || t === 'volume_motoboy') {
      corpo.volume_a_partir_de = parseInt(inpVolN.value, 10) || null;
      corpo.volume_reset = selReset.value;
    } else if (t === 'raio') {
      corpo.poligono = poligono;
    }
    try {
      if (r.id) await put('/precos/' + r.id, corpo);
      else await post('/precos', corpo);
      fechar(); recarregar();
    } catch (e) { alert(e.message || 'Erro ao salvar'); }
  }

  const card = el('div', { class: 'lx-card', style: 'max-width:640px;width:100%;padding:22px 24px' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px' },
      el('h3', { style: 'margin:0;font-size:17px' }, r.id ? 'Editar regra' : 'Nova regra de preço dinâmico'),
      el('button', { style: 'background:none;border:none;font-size:22px;cursor:pointer;color:var(--lx-tinta-3)', onClick: fechar }, '×')),
    campo('Nome', inpNome),
    campo('Tipo de gatilho', selTipo),
    el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin:6px 0 8px' }, 'Escopo (onde aplica)'),
    campo('Loja/Cliente', selLoja),
    dois(campo('Centro de custo', selCentro), campo('Modalidade', selModalidade)),
    el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin:6px 0 8px' }, 'Valor somado (R$)'),
    dois(campo('Somar ao cliente', inpCliente), campo('Somar ao motoboy', inpMotoboy)),
    el('div', { style: 'height:8px' }),
    blocoHorario, blocoVolume, blocoRaio,
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px' },
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:13px', onClick: fechar }, 'Cancelar'),
      el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: salvar }, r.id ? 'Salvar' : 'Criar regra')));

  ov.append(card);
  document.body.append(ov);
  aplicarTipo();
}

// helpers de layout
function campo(rotulo, input) {
  return el('div', { style: 'margin-bottom:12px' },
    el('label', { style: 'display:block;font-size:12px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:4px' }, rotulo), input);
}
function dois(a, b) {
  return el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, a, b);
}
