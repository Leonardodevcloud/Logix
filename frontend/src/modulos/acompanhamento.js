import { casca } from '../core/layout.js';
import { el, statusBadge, campo } from '../core/ui.js';
import { get, post, put, patch, getToken } from '../core/api.js';
import * as auth from '../core/auth.js';

const LS_KEY = 'logix_acomp_filtros';

async function garantirLeaflet() {
  if (window.L) return;
  if (!document.getElementById('lx-leaflet-css')) {
    const l = document.createElement('link');
    l.id = 'lx-leaflet-css'; l.rel = 'stylesheet';
    l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(l);
  }
  if (!document.getElementById('lx-seq-css')) {
    const st = document.createElement('style');
    st.id = 'lx-seq-css';
    st.textContent = '.lx-seq-tip{background:#185FA5;color:#fff;border:none;border-radius:50%;width:22px;height:22px;line-height:22px;text-align:center;font-weight:800;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.3);padding:0}.lx-seq-tip::before{display:none}';
    document.head.append(st);
  }
  if (!document.getElementById('lx-leaflet-js')) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.id = 'lx-leaflet-js';
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = res; s.onerror = rej;
      document.head.append(s);
    });
  } else {
    // Script já está no DOM mas pode ainda não ter terminado de carregar.
    let tentativas = 0;
    while (!window.L && tentativas < 100) { await new Promise(r => setTimeout(r, 50)); tentativas++; }
  }
}

function toast(msg, tipo) {
  const longa = (msg || '').length > 60;
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:13px 18px;border-radius:12px;font-size:13px;font-weight:600;line-height:1.45;max-width:${longa ? '420px' : '320px'};background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  // Mensagens longas (ex.: explicação do funil de disparo) ficam mais tempo.
  setTimeout(() => t.remove(), longa ? 7000 : 3000);
}
function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:1000' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:26px;width:500px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:18px' },
      el('b', { style: 'font-size:16px;font-weight:800;color:var(--lx-tinta)' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px', onClick: () => overlay.remove() }, '✕')),
    corpo, el('div', { style: 'display:flex;gap:10px;margin-top:18px;justify-content:flex-end' }, ...acoes));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}
const fmtHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }) : '—';

// Calcula o rumo (bearing) de A para B em graus (0=N, 90=L, 180=S, 270=O).
function calcularRumo(latA, lngA, latB, lngB) {
  const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  const dLng = toRad(lngB - lngA);
  const y = Math.sin(dLng) * Math.cos(toRad(latB));
  const x = Math.cos(toRad(latA)) * Math.sin(toRad(latB)) - Math.sin(toRad(latA)) * Math.cos(toRad(latB)) * Math.cos(dLng);
  let g = toDeg(Math.atan2(y, x));
  return (g + 360) % 360;
}
function rumoCardeal(g) {
  // Nomes por extenso (como no sistema antigo): Norte, Nordeste, Leste...
  const dirs = ['Norte', 'Nordeste', 'Leste', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'];
  return dirs[Math.round(g / 45) % 8];
}
// Bússola: seta apontando para o grau + nome da região por extenso + grau.
function bussola(latA, lngA, latB, lngB) {
  if (latA == null || latB == null) return el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, '—');
  const g = calcularRumo(Number(latA), Number(lngA), Number(latB), Number(lngB));
  const card = rumoCardeal(g);
  const wrap = el('div', { style: 'display:flex;align-items:center;gap:8px' });
  const circ = el('span', { style: 'position:relative;width:30px;height:30px;border-radius:50%;border:1.5px solid var(--lx-linha);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--lx-superficie-2)' });
  const seta = el('span', { style: `position:absolute;transform:rotate(${g}deg);transition:transform .3s` });
  seta.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--lx-azul-primario)" stroke="var(--lx-azul-primario)" stroke-width="1"><path d="M12 2 L7 14 L12 11 L17 14 Z"/></svg>';
  circ.append(seta);
  wrap.append(circ, el('div', { style: 'display:flex;flex-direction:column;line-height:1.2' },
    el('span', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta)' }, card),
    el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `${Math.round(g)}°`)));
  return wrap;
}

const fmtHaQuanto = iso => {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60 ? ' ' + (min % 60) + 'm' : ''}`;
};
function svgIcone(p, size = 15) { const s = el('span', { style: `display:inline-flex;vertical-align:-3px` }); s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`; return s; }
const P = {
  filtro: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  busca: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  moto: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-5l-2-5h9l-2 5z"/><path d="M5.5 17.5 9 9h3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checkCirc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  mapa: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  troca: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  add: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  x2: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  rota: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  reabrir: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  logs: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
};

function carregarFiltros() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY)); if (j) { if (!j.categorias) j.categorias = []; return j; } } catch {}
  return { periodo: 'hoje', de: '', ate: '', lojas: [], cidades: [], categorias: [] };
}
function salvarFiltros(f) { try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch {} }

// Dropdown multi-select com busca interna. Escala para muitos itens.
// itens: [{ valor, rotulo }]. selecionados: array de valores. onMudar(novoArray).
function dropMulti(titulo, itens, selecionados, onMudar) {
  let abertos = false;
  const sel = new Set(selecionados);

  const rotuloBtn = el('span', { style: 'flex:1;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' });
  const seta = el('span', { style: 'display:inline-flex;color:var(--lx-tinta-3)' });
  seta.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const btn = el('button', { class: 'lx-btn lx-btn-secundario', style: 'height:36px;width:100%;display:flex;align-items:center;gap:8px;font-size:13px;justify-content:space-between' }, rotuloBtn, seta);

  const lista = el('div', { style: 'max-height:200px;overflow:auto;padding:4px' });
  const busca = el('input', { class: 'lx-input', placeholder: 'Filtrar…', style: 'height:32px;font-size:12px;margin-bottom:6px' });
  const painelDrop = el('div', { style: 'display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:50;background:var(--lx-superficie);border:0.5px solid var(--lx-linha);border-radius:var(--lx-raio);box-shadow:0 12px 32px -8px rgba(4,44,83,.25);padding:8px' }, busca, lista);
  const wrap = el('div', { style: 'position:relative;min-width:0' }, btn, painelDrop);

  function atualizarRotulo() {
    if (sel.size === 0) rotuloBtn.textContent = titulo;
    else if (sel.size === 1) { const it = itens.find(i => i.valor === [...sel][0]); rotuloBtn.textContent = it ? it.rotulo : `1 selecionado`; }
    else rotuloBtn.textContent = `${sel.size} selecionados`;
    rotuloBtn.style.color = sel.size ? 'var(--lx-tinta)' : 'var(--lx-tinta-3)';
    rotuloBtn.style.fontWeight = sel.size ? '600' : '400';
  }
  function renderLista(filtro = '') {
    lista.innerHTML = '';
    const f = filtro.toLowerCase();
    const vis = itens.filter(i => i.rotulo.toLowerCase().includes(f));
    if (!vis.length) { lista.append(el('div', { style: 'padding:10px;text-align:center;font-size:12px;color:var(--lx-tinta-2)' }, 'Nada encontrado.')); return; }
    vis.forEach(it => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = sel.has(it.valor);
      const row = el('label', { style: 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px' }, cb, el('span', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, it.rotulo));
      row.onmouseenter = () => row.style.background = 'var(--lx-superficie-2)';
      row.onmouseleave = () => row.style.background = 'transparent';
      cb.onchange = () => { if (cb.checked) sel.add(it.valor); else sel.delete(it.valor); atualizarRotulo(); onMudar([...sel]); };
      lista.append(row);
    });
  }
  busca.addEventListener('input', () => renderLista(busca.value));
  btn.onclick = (e) => { e.stopPropagation(); abertos = !abertos; painelDrop.style.display = abertos ? 'block' : 'none'; if (abertos) { busca.value = ''; renderLista(); busca.focus(); } };
  document.addEventListener('click', (e) => { if (abertos && !wrap.contains(e.target)) { abertos = false; painelDrop.style.display = 'none'; } });

  atualizarRotulo(); renderLista();
  wrap._setItens = (novos) => { itens = novos; renderLista(busca.value); atualizarRotulo(); };
  wrap._setSel = (arr) => { sel.clear(); arr.forEach(v => sel.add(v)); atualizarRotulo(); renderLista(busca.value); };
  return wrap;
}

export async function montar(container) {
  const podeGerenciar = auth.pode('filas.gerenciar');
  const podeEditar = auth.pode('entregas.editar');
  const _acesso = auth.acessoAtual();
  const _ehCentral = _acesso.perfil === 'super_admin' || _acesso.perfil === 'central_admin';

  let _dados = { semAssociacao: [], emAndamento: [], concluidas: [], canceladas: [], totais: {}, buscando: false };
  let _lojas = [], _cidades = [], _categorias = [], _motoboys = [];
  let _aba = 'sem';
  let _busca = '';
  let _sel = new Set(); // IDs das corridas selecionadas (lote)
  const filtros = carregarFiltros();
  _aba = filtros.aba || 'sem';

  // ── Busca (sempre visível) ──────────────────────────────────────
  const inpBusca = el('input', { class: 'lx-input', placeholder: 'Pesquisar protocolo, NF, endereço ou motoboy…', style: 'height:34px;width:100%;padding-left:34px' });
  let _debounce;
  inpBusca.addEventListener('input', () => { clearTimeout(_debounce); _debounce = setTimeout(() => { _busca = inpBusca.value.trim(); carregar(); avisoBusca(); }, 400); });
  const buscaWrap = el('span', { style: 'position:relative;display:flex;align-items:center;flex:1;min-width:180px' });
  const bIcon = el('span', { style: 'position:absolute;left:11px;display:inline-flex;color:var(--lx-tinta-3)' }); bIcon.append(svgIcone(P.busca));
  buscaWrap.append(bIcon, inpBusca);

  // ── Botão Filtros (recolhível) ──────────────────────────────────
  const badgeAtivos = el('span', { style: 'display:none;font-size:11px;background:var(--lx-azul-primario);color:#fff;border-radius:9px;padding:1px 7px;margin-left:2px' }, '0');
  const btnFiltros = el('button', { class: 'lx-btn lx-btn-secundario', style: 'height:34px;display:inline-flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap' },
    svgIcone(P.filtro), 'Filtros', badgeAtivos);

  // Painel de filtros (popover simples abaixo da barra)
  const painel = el('div', { style: 'display:none;background:var(--lx-superficie);border:0.5px solid var(--lx-linha);border-radius:var(--lx-raio-lg);padding:16px;margin-bottom:12px' });
  let _aberto = false;
  btnFiltros.onclick = () => { _aberto = !_aberto; painel.style.display = _aberto ? 'block' : 'none'; };

  // Período
  const selPeriodo = el('select', { class: 'lx-input', style: 'height:36px;line-height:1.4;padding-top:0;padding-bottom:0' },
    el('option', { value: 'hoje' }, 'Hoje'),
    el('option', { value: '7d' }, 'Últimos 7 dias'),
    el('option', { value: '30d' }, 'Últimos 30 dias'),
    el('option', { value: 'mes' }, 'Este mês'),
    el('option', { value: 'custom' }, 'Personalizado'),
    el('option', { value: 'tudo' }, 'Tudo'));
  selPeriodo.value = filtros.periodo || 'hoje';
  const inpDe = el('input', { class: 'lx-input', type: 'date', style: 'height:34px', value: filtros.de || '' });
  const inpAte = el('input', { class: 'lx-input', type: 'date', style: 'height:34px', value: filtros.ate || '' });
  const customWrap = el('div', { style: `display:${filtros.periodo === 'custom' ? 'flex' : 'none'};gap:8px;align-items:center;margin-top:8px` },
    el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'De'), inpDe,
    el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'até'), inpAte);
  selPeriodo.onchange = () => { customWrap.style.display = selPeriodo.value === 'custom' ? 'flex' : 'none'; };

  // Dropdowns multi-select de loja, cidade e categoria (escaláveis).
  const dropLojas = dropMulti('Todas as lojas', [], filtros.lojas, arr => { filtros.lojas = arr; });
  const dropCidades = dropMulti('Todas as regiões', [], filtros.cidades, arr => { filtros.cidades = arr; });
  const dropCategorias = dropMulti('Todas as categorias', [], filtros.categorias || [], arr => { filtros.categorias = arr; });

  function aplicarFiltros() {
    filtros.periodo = selPeriodo.value;
    filtros.de = inpDe.value; filtros.ate = inpAte.value;
    salvarFiltros(filtros);
    atualizarBadge();
    carregar();
  }
  function limparFiltros() {
    filtros.periodo = 'hoje'; filtros.de = ''; filtros.ate = ''; filtros.lojas = []; filtros.cidades = []; filtros.categorias = [];
    selPeriodo.value = 'hoje'; inpDe.value = ''; inpAte.value = ''; customWrap.style.display = 'none';
    dropLojas._setSel([]); dropCidades._setSel([]); dropCategorias._setSel([]);
    salvarFiltros(filtros); atualizarBadge(); carregar();
  }
  const btnAplicar = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => { aplicarFiltros(); _aberto = false; painel.style.display = 'none'; } }, 'Aplicar');
  const btnLimpar = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:13px', onClick: limparFiltros }, 'Limpar');

  const colPeriodo = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Período'), selPeriodo, customWrap);
  const colLojas = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Lojas'), dropLojas);
  const colCidades = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Regiões'), dropCidades);
  const colCategorias = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Categorias'), dropCategorias);

  painel.append(
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;align-items:start;margin-bottom:16px' }, colPeriodo, colLojas, colCidades, colCategorias),
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, btnLimpar, btnAplicar));

  function preencherDrops() {
    dropLojas._setItens(_lojas.map(l => ({ valor: l.id, rotulo: l.nome_fantasia })));
    dropCidades._setItens(_cidades.map(c => ({ valor: c.cidade, rotulo: c.estado ? `${c.cidade}/${c.estado}` : c.cidade })));
    dropCategorias._setItens(_categorias.map(c => ({ valor: c.id, rotulo: c.nome })));
    dropLojas._setSel(filtros.lojas); dropCidades._setSel(filtros.cidades); dropCategorias._setSel(filtros.categorias || []);
  }
  function atualizarBadge() {
    let n = 0;
    if (filtros.periodo && filtros.periodo !== 'hoje') n++;
    n += filtros.lojas.length + filtros.cidades.length + ((filtros.categorias && filtros.categorias.length) || 0);
    badgeAtivos.textContent = String(n);
    badgeAtivos.style.display = n ? 'inline' : 'none';
  }

  const barraTopo = el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:12px' }, buscaWrap, btnFiltros);

  // Aviso de busca ativa (override)
  const avisoEl = el('div', { style: 'display:none;font-size:12px;color:var(--lx-azul-primario);background:var(--lx-superficie-2);border-radius:8px;padding:8px 12px;margin-bottom:12px;align-items:center;gap:8px' });
  function avisoBusca() {
    if (_busca) {
      avisoEl.style.display = 'flex'; avisoEl.innerHTML = '';
      avisoEl.append(el('span', {}, `Busca ativa por "${_busca}" — os filtros estão temporariamente ignorados.`),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:3px 9px;font-size:12px;margin-left:auto', onClick: () => { inpBusca.value = ''; _busca = ''; avisoBusca(); carregar(); } }, 'limpar busca'));
    } else avisoEl.style.display = 'none';
  }

  // ── Abas ────────────────────────────────────────────────────────
  const cnt = { sem: el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-erro-bg);color:var(--lx-erro)' }, '0'),
                and: el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-superficie-2);color:var(--lx-tinta-2)' }, '0'),
                con: el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-superficie-2);color:var(--lx-tinta-2)' }, '0'),
                can: el('span', { style: 'font-size:11px;padding:1px 7px;border-radius:9px;background:var(--lx-superficie-2);color:var(--lx-tinta-2)' }, '0') };
  function abaEl(id, pIcon, rotulo, cor) {
    const a = el('button', { style: 'display:flex;align-items:center;gap:7px;padding:9px 16px;font-size:13px;font-weight:600;background:none;border:none;border-bottom:2.5px solid transparent;cursor:pointer;color:var(--lx-tinta-2);white-space:nowrap', onClick: () => setAba(id) }, svgIcone(pIcon, 16), rotulo, cnt[id]);
    a._cor = cor; a._id = id; return a;
  }
  const abaSem = abaEl('sem', P.alerta, 'Sem associação', 'var(--lx-erro)');
  const abaAnd = abaEl('and', P.moto, 'Em andamento', 'var(--lx-azul-primario)');
  const abaCon = abaEl('con', P.checkCirc, 'Concluídas', 'var(--lx-ok)');
  const abaCan = abaEl('can', P.x2, 'Canceladas', 'var(--lx-tinta-2)');
  const abas = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' }, abaSem, abaAnd, abaCon, abaCan);
  // Restaura o destaque da aba salva (sem zerar nada além do visual).
  [abaSem, abaAnd, abaCon, abaCan].forEach(a => { const at = a._id === _aba; a.style.color = at ? a._cor : 'var(--lx-tinta-2)'; a.style.borderBottomColor = at ? a._cor : 'transparent'; });
  function setAba(id) {
    _aba = id;
    filtros.aba = id; salvarFiltros(filtros);
    _sel.clear(); // troca de aba zera a seleção em lote
    [abaSem, abaAnd, abaCon, abaCan].forEach(a => { const at = a._id === id; a.style.color = at ? a._cor : 'var(--lx-tinta-2)'; a.style.borderBottomColor = at ? a._cor : 'transparent'; });
    renderTabela();
    atualizarBarraSel();
  }
  const tabelaWrap = el('div', { style: 'border:0.5px solid var(--lx-linha);border-top:none;border-radius:0 0 var(--lx-raio-lg) var(--lx-raio-lg);overflow-x:auto;overflow-y:hidden' });

  // ── Ações ───────────────────────────────────────────────────────
  async function carregarMotoboys() { if (_motoboys.length) return; try { _motoboys = await get('/filas/motoboys-ativos'); } catch { toast('Erro ao carregar motoboys', 'erro'); } }
  async function abrirAtribuir(c, troca = false) {
    await carregarMotoboys();
    const fmtCod = m => '#' + String(m.codigo || 0).padStart(3, '0');
    let escolhido = null;

    const busca = el('input', { class: 'lx-input', placeholder: 'Buscar por nº (#001) ou nome…', style: 'margin-bottom:8px' });
    const lista = el('div', { style: 'max-height:260px;overflow:auto;border:0.5px solid var(--lx-linha);border-radius:var(--lx-raio)' });

    function renderLista(filtro = '') {
      lista.innerHTML = '';
      const f = filtro.toLowerCase().replace('#', '').trim();
      if (!f) {
        lista.append(el('div', { style: 'padding:18px;text-align:center;font-size:12px;color:var(--lx-tinta-3)' }, 'Digite o nº ou nome do motoboy para buscar.'));
        return;
      }
      const vis = _motoboys.filter(m => {
        const cod = String(m.codigo || '').padStart(3, '0');
        return cod.includes(f) || String(m.codigo || '') === f || (m.nome_completo || '').toLowerCase().includes(f);
      });
      if (!vis.length) { lista.append(el('div', { style: 'padding:16px;text-align:center;font-size:12px;color:var(--lx-tinta-2)' }, 'Nenhum motoboy encontrado.')); return; }
      vis.forEach(m => {
        const sel = escolhido === m.id;
        const item = el('div', { style: `display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:0.5px solid var(--lx-linha);${sel ? 'background:var(--lx-superficie-2)' : ''}`, onClick: () => { escolhido = m.id; renderLista(busca.value); } },
          el('span', { style: 'font-size:12px;font-weight:800;color:var(--lx-azul-primario);min-width:42px' }, fmtCod(m)),
          el('span', { style: 'flex:1;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, m.nome_completo),
          el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `${m.online ? '🟢' : '⚪'} ${m.carga} ativas`),
          sel ? el('span', { style: 'color:var(--lx-ok);font-weight:800' }, '✓') : el('span', {}));
        lista.append(item);
      });
    }
    busca.addEventListener('input', () => renderLista(busca.value));
    renderLista();

    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, troca ? 'Trocar' : 'Atribuir');
    const corpo = el('div', {}, el('label', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;display:block;margin-bottom:6px' }, troca ? 'Novo motoboy' : 'Motoboy'), busca, lista, el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:8px 0 0' }, '🟢 online · ⚪ offline · busca por nº ou nome'));

    // Quando já há motoboy, oferece "deixar sem motoboy" (volta à fila + nova oferta).
    const acoes = [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar')];
    if (troca) {
      acoes.push(el('button', { class: 'lx-btn lx-btn-secundario', style: 'color:var(--lx-erro);border-color:var(--lx-erro)', onClick: async () => {
        try { await post(`/filas/${c.id}/desatribuir`, {}); ov.remove(); toast('Motoboy removido — corrida voltou à fila e nova oferta foi disparada'); carregar(); }
        catch (e) { toast(e.message || 'Erro', 'erro'); }
      } }, 'Deixar sem motoboy'));
    }
    acoes.push(btn);
    const ov = modal(troca ? `Trocar motoboy — ${c.protocolo}` : `Atribuir — ${c.protocolo}`, corpo, acoes);
    btn.onclick = async () => {
      if (!escolhido) { toast('Selecione um motoboy', 'erro'); return; }
      try { btn.disabled = true; await post(`/filas/${c.id}/${troca ? 'reatribuir' : 'atribuir'}`, { motoboy_id: escolhido }); ov.remove(); toast(troca ? 'Motoboy trocado' : 'Atribuído'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  async function dispararOferta(c) {
    try {
      const r = await post(`/filas/${c.id}/disparar`, {});
      toast(`Disparado para ${r.candidatos} motoboy(s) no raio de ${r.raioKm} km — primeiro a aceitar leva`);
      carregar();
    } catch (e) { toast(e.message || 'Não foi possível disparar', 'erro'); }
  }
  function abrirCancelar(c) {
    const motivo = el('textarea', { class: 'lx-input', rows: 3, placeholder: 'Motivo (opcional)' });
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-erro)' }, 'Cancelar corrida');
    const ov = modal(`Cancelar — ${c.protocolo}`, el('div', {}, campo('Motivo', motivo)), [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => { try { btn.disabled = true; await patch(`/entregas/${c.id}/cancelar`, { motivo: motivo.value.trim() || null }); ov.remove(); toast('Cancelada'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }
  function abrirFinalizar(c) {
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-ok)' }, 'Finalizar');
    const ov = modal('Finalizar corrida', el('p', { style: 'font-size:14px' }, `Finalizar ${c.protocolo} manualmente? Todos os pontos serão marcados como entregues.`), [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => { try { btn.disabled = true; await patch(`/entregas/${c.id}/finalizar`, {}); ov.remove(); toast('Finalizada'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }
  function abrirReabrir(c) {
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Reabrir corrida');
    const ov = modal('Reabrir corrida', el('p', { style: 'font-size:14px' }, `Reabrir ${c.protocolo}? A corrida volta para “Sem associação”, o motoboy${c.motoboy_nome ? ' ' + c.motoboy_nome : ''} será removido e ela ficará disponível para nova atribuição.`), [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => { try { btn.disabled = true; await patch(`/entregas/${c.id}/reabrir`, {}); ov.remove(); toast('Corrida reaberta — voltou para Sem associação'); setAba('sem'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }

  // Editar valores (cliente/motoboy) de uma corrida — só central.
  function abrirEditarValores(c) {
    const toReais = cent => cent == null ? '' : (Number(cent) / 100).toFixed(2);
    const inpCli = el('input', { class: 'lx-input', type: 'number', min: '0', step: '0.01', value: toReais(c.valor_cliente_cent) });
    const inpMb = el('input', { class: 'lx-input', type: 'number', min: '0', step: '0.01', value: toReais(c.valor_motoboy_cent) });
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar valores');
    const ov = modal(`Editar valores — ${c.protocolo}`, el('div', { style: 'display:flex;flex-direction:column;gap:14px' },
      el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0' }, 'Ajuste manualmente os valores desta corrida. A alteração fica registrada no histórico.'),
      campo('Valor do cliente (R$)', inpCli),
      campo('Valor do motoboy (R$)', inpMb)), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => {
      const cli = inpCli.value === '' ? null : Math.round(Number(String(inpCli.value).replace(',', '.')) * 100);
      const mb = inpMb.value === '' ? null : Math.round(Number(String(inpMb.value).replace(',', '.')) * 100);
      if (cli == null && mb == null) { toast('Informe ao menos um valor', 'erro'); return; }
      try {
        btn.disabled = true;
        await patch(`/entregas/${c.id}/valores`, { valor_cliente_cent: cli, valor_motoboy_cent: mb });
        ov.remove(); toast('Valores atualizados'); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }

  // Modal de logs: timeline completa da corrida.
  async function abrirLogs(c) {
    const corpo = el('div', { style: 'min-height:120px' }, el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'Carregando histórico…'));
    const ov = modal(`Histórico — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Fechar')]);
    const box = ov.querySelector('div'); if (box) box.style.width = '560px';
    let dados;
    try { dados = await get(`/entregas/${c.id}/logs`); } catch { corpo.innerHTML = ''; corpo.append(el('div', { style: 'font-size:13px;color:var(--lx-erro)' }, 'Erro ao carregar o histórico.')); return; }

    const fmt = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
    const corEvento = t => {
      if (['criada'].includes(t)) return 'var(--lx-azul-primario)';
      if (['atribuir', 'atribuir-lote', 'reatribuir', 'disparar-oferta', 'oferta_vista'].includes(t)) return '#0891b2';
      if (['desatribuir'].includes(t)) return '#ea580c';
      if (['iniciada', 'ponto_entregue', 'concluida'].includes(t)) return 'var(--lx-ok)';
      if (['cancelar', 'cancelada', 'ponto_insucesso'].includes(t)) return 'var(--lx-erro)';
      if (['reabrir'].includes(t)) return '#9333ea';
      if (['editar_enderecos'].includes(t)) return '#a16207';
      if (['editar_valores'].includes(t)) return '#15803d';
      return 'var(--lx-tinta-2)';
    };
    const origemTag = o => o === 'app'
      ? el('span', { style: 'font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--lx-info-bg);color:var(--lx-azul-primario)' }, '🏍 App')
      : el('span', { style: 'font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--lx-superficie-2);color:var(--lx-tinta-2)' }, '🖥 Central');

    corpo.innerHTML = '';
    if (!dados.eventos || !dados.eventos.length) { corpo.append(el('div', { style: 'font-size:13px;color:var(--lx-tinta-2)' }, 'Sem registros para esta corrida.')); return; }
    const lista = el('div', { style: 'display:flex;flex-direction:column;gap:0;max-height:62vh;overflow:auto' });
    dados.eventos.forEach((ev, i) => {
      const ultimo = i === dados.eventos.length - 1;
      const cor = corEvento(ev.tipo);
      const linha = el('div', { style: 'display:flex;gap:12px;align-items:stretch' });
      // coluna do marcador + linha vertical
      const trilho = el('div', { style: 'display:flex;flex-direction:column;align-items:center;width:14px;flex-shrink:0' },
        el('span', { style: `width:11px;height:11px;border-radius:50%;background:${cor};margin-top:5px;flex-shrink:0` }),
        ultimo ? el('span', {}) : el('span', { style: 'flex:1;width:2px;background:var(--lx-linha);margin:2px 0' }));

      const conteudo = el('div', { style: 'padding-bottom:16px;min-width:0;flex:1' },
        el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' },
          el('span', { style: `font-size:13.5px;font-weight:700;color:${cor}` }, ev.titulo),
          origemTag(ev.origem)),
        // data + autor
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin-top:3px' }, `${fmt(ev.em)} · ${ev.autor || 'Sistema'}`));

      // linhas de detalhe (motoboy, motivo, raio, endereço, recebedor…)
      if (Array.isArray(ev.linhas) && ev.linhas.length) {
        const box = el('div', { style: 'margin-top:6px;padding:8px 10px;background:var(--lx-superficie-2);border-radius:8px;display:flex;flex-direction:column;gap:3px' });
        ev.linhas.forEach(l => {
          const idx = l.indexOf(':');
          if (idx > 0) {
            box.append(el('div', { style: 'font-size:11.5px;display:flex;gap:6px' },
              el('span', { style: 'color:var(--lx-tinta-3);font-weight:700;min-width:0' }, l.slice(0, idx + 1)),
              el('span', { style: 'color:var(--lx-tinta);font-weight:600' }, l.slice(idx + 1).trim())));
          } else {
            box.append(el('div', { style: 'font-size:11.5px;color:var(--lx-tinta)' }, l));
          }
        });
        conteudo.append(box);
      }
      linha.append(trilho, conteudo);
      lista.append(linha);
    });
    corpo.append(lista);
  }
  // Campo de endereço com autocomplete via /entregas/geocode.
  // Retorna { wrap, getValor } — getValor() devolve { endereco, lat, lng } do escolhido (ou texto digitado).
  function campoGeo(rotulo, valorInicial) {
    let escolhido = valorInicial && valorInicial.lat != null ? { ...valorInicial } : null;
    const inp = el('input', { class: 'lx-input', value: (valorInicial && valorInicial.endereco) || '', placeholder: 'Digite e escolha o endereço…' });
    const drop = el('div', { style: 'display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:60;background:var(--lx-superficie);border:0.5px solid var(--lx-linha);border-radius:var(--lx-raio);box-shadow:0 12px 32px -8px rgba(4,44,83,.25);max-height:220px;overflow:auto' });
    const status = el('div', { style: 'font-size:11px;margin-top:3px;min-height:14px' });
    function setStatus(txt, ok) { status.textContent = txt; status.style.color = ok ? 'var(--lx-ok)' : 'var(--lx-tinta-2)'; }
    if (escolhido) setStatus('✓ endereço geocodificado', true);

    let timer;
    inp.addEventListener('input', () => {
      escolhido = null; setStatus('');
      clearTimeout(timer);
      const q = inp.value.trim();
      if (q.length < 4) { drop.style.display = 'none'; return; }
      timer = setTimeout(async () => {
        setStatus('buscando…');
        try {
          const r = await get('/entregas/geocode?q=' + encodeURIComponent(q));
          const resultados = r.resultados || [];
          drop.innerHTML = '';
          if (!resultados.length) { drop.style.display = 'none'; setStatus('nenhum resultado'); return; }
          resultados.forEach(res => {
            const item = el('div', { style: 'padding:9px 12px;cursor:pointer;border-bottom:0.5px solid var(--lx-linha);font-size:12.5px', onClick: () => {
              escolhido = { endereco: res.label || res.endereco || inp.value, lat: res.lat, lng: res.lng };
              inp.value = escolhido.endereco;
              drop.style.display = 'none';
              setStatus('✓ endereço geocodificado', true);
            } });
            item.onmouseenter = () => item.style.background = 'var(--lx-superficie-2)';
            item.onmouseleave = () => item.style.background = '';
            item.append(el('b', { style: 'display:block;color:var(--lx-tinta)' }, res.label || res.endereco || '—'),
              el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, [res.bairro, res.cidade, res.uf].filter(Boolean).join(' · ')));
            drop.append(item);
          });
          drop.style.display = 'block';
          setStatus('');
        } catch { setStatus('erro na busca'); drop.style.display = 'none'; }
      }, 400);
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) drop.style.display = 'none'; });
    const wrap = el('div', {},
      el('label', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;display:block;margin-bottom:5px' }, rotulo),
      el('div', { style: 'position:relative' }, inp, drop), status);
    return { wrap, getValor: () => escolhido || { endereco: inp.value.trim() } };
  }

  async function abrirEditar(c) {
    let d; try { d = await get('/entregas/' + c.id + '/detalhe'); } catch { toast('Erro ao carregar', 'erro'); return; }

    const campoColeta = campoGeo('Endereço de coleta', { endereco: d.coleta_endereco, lat: d.coleta_lat, lng: d.coleta_lng });

    // Estado dos pontos: cada item { id?, campo, entregue, eh_retorno, removido, novo }
    const pontos = (d.pontos || []).map((p) => ({
      id: p.id, entregue: p.status === 'entregue', eh_retorno: p.eh_retorno,
      campo: campoGeo('', { endereco: p.endereco, lat: p.lat, lng: p.lng }),
      removido: false, novo: false,
    }));

    const listaPontos = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    const painelValor = el('div', { style: 'display:none;background:var(--lx-superficie-2);border-radius:var(--lx-raio);padding:14px 16px;margin-top:4px' });
    let valoresConfirmados = null;

    function renderPontos() {
      listaPontos.innerHTML = '';
      let n = 0;
      pontos.forEach((pt) => {
        if (pt.removido) return;
        n++;
        const numero = n;
        const linha = el('div', { style: `display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border:0.5px solid ${pt.eh_retorno ? 'var(--lx-erro)' : 'var(--lx-linha)'};border-radius:10px;background:${pt.eh_retorno ? 'var(--lx-erro-bg)' : 'var(--lx-superficie)'}` });
        const badge = el('div', { style: `width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;background:${pt.eh_retorno ? 'var(--lx-erro)' : 'var(--lx-azul-primario)'};margin-top:1px` }, pt.eh_retorno ? '↩' : String(numero));
        // Reaproveita o campo geo; injeta um rótulo dinâmico.
        const wrapCampo = el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:4px' }, pt.eh_retorno ? 'Retorno à coleta' : `Destino ${numero}${pt.entregue ? ' · já entregue' : ''}`),
          pt.campo.wrap);
        const acaoRemover = pt.entregue
          ? el('span', { style: 'font-size:10px;color:var(--lx-tinta-3);margin-top:4px', title: 'Ponto já entregue não pode ser removido' }, '🔒')
          : el('button', { style: 'background:none;border:none;cursor:pointer;color:var(--lx-erro);font-size:16px;margin-top:2px', title: 'Remover ponto', onClick: () => { pt.removido = true; renderPontos(); painelValor.style.display = 'none'; valoresConfirmados = null; } }, '🗑');
        linha.append(badge, wrapCampo, acaoRemover);
        listaPontos.append(linha);
      });
    }
    renderPontos();

    const btnAddPonto = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px', onClick: () => {
      pontos.push({ novo: true, campo: campoGeo('', { endereco: '' }), removido: false, eh_retorno: false, entregue: false });
      renderPontos(); painelValor.style.display = 'none'; valoresConfirmados = null;
    } }, '+ Adicionar ponto');
    const btnAddRetorno = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px', onClick: () => {
      pontos.push({ novo: true, eh_retorno: true, campo: campoGeo('', { endereco: d.coleta_endereco, lat: d.coleta_lat, lng: d.coleta_lng }), removido: false, entregue: false });
      renderPontos(); painelValor.style.display = 'none'; valoresConfirmados = null;
    } }, '↩ Adicionar retorno à coleta');

    function montarPayloadPontos() {
      return pontos.filter(pt => !(pt.novo && pt.removido)).map(pt => {
        const v = pt.campo.getValor();
        if (pt.removido) return { id: pt.id, _remover: true, endereco: v.endereco };
        if (pt.novo) return { _novo: true, eh_retorno: pt.eh_retorno, endereco: v.endereco, lat: v.lat, lng: v.lng };
        return { id: pt.id, endereco: v.endereco, lat: v.lat, lng: v.lng };
      });
    }

    const btnRecalcular = el('button', { class: 'lx-btn lx-btn-secundario', onClick: async () => {
      try {
        btnRecalcular.disabled = true; btnRecalcular.textContent = 'Calculando…';
        const col = campoColeta.getValor();
        const prev = await post(`/entregas/${c.id}/preview-edicao`, {
          coleta: { endereco: col.endereco, lat: col.lat, lng: col.lng },
          pontos: montarPayloadPontos(),
        });
        valoresConfirmados = prev.novo;
        const reais = cent => 'R$ ' + ((cent || 0) / 100).toFixed(2).replace('.', ',');
        const km = v => v != null ? Number(v).toFixed(1) + ' km' : '—';
        painelValor.innerHTML = '';
        painelValor.append(
          el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' },
            el('span', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2)' }, 'Pré-visualização do recálculo'),
            prev.mudou_distancia ? el('span', { style: 'font-size:10px;font-weight:800;color:#854f0b;background:#faeeda;padding:3px 9px;border-radius:5px' }, 'DISTÂNCIA ALTEROU') : el('span', {})),
          el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px' },
            el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, 'Distância'), el('div', { style: 'font-size:14px;font-weight:700;color:var(--lx-tinta)' }, `${km(prev.atual.distancia_km)} → `, el('span', { style: 'color:var(--lx-azul-primario)' }, km(prev.novo.distancia_km)))),
            el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, 'Valor cliente'), el('div', { style: 'font-size:14px;font-weight:700;color:var(--lx-tinta)' }, `${reais(prev.atual.valor_cliente_cent)} → `, el('span', { style: 'color:var(--lx-ok)' }, reais(prev.novo.valor_cliente_cent)))),
            el('div', {}, el('div', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, 'Valor motoboy'), el('div', { style: 'font-size:14px;font-weight:700;color:var(--lx-tinta)' }, `${reais(prev.atual.valor_motoboy_cent)} → `, el('span', { style: 'color:var(--lx-ok)' }, reais(prev.novo.valor_motoboy_cent))))),
          el('p', { style: 'font-size:11px;color:var(--lx-tinta-3);margin:10px 0 0' }, 'Valores sugeridos pela tabela de km do cliente. Confirme em “Salvar e recalcular”.'));
        painelValor.style.display = 'block';
      } catch (e) { toast(e.message || 'Erro ao calcular', 'erro'); }
      finally { btnRecalcular.disabled = false; btnRecalcular.textContent = 'Recalcular valor'; }
    } }, 'Recalcular valor');

    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:14px' },
      el('div', {}, el('label', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;display:block;margin-bottom:5px' }, 'Coleta'), campoColeta.wrap),
      el('div', {}, el('label', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;display:block;margin-bottom:8px' }, 'Pontos de entrega'), listaPontos),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btnAddPonto, btnAddRetorno, btnRecalcular),
      painelValor,
      el('p', { style: 'font-size:11px;color:var(--lx-tinta-3);margin:0' }, '🕘 Toda edição fica registrada nos logs da corrida.'));

    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar e recalcular');
    const ov = modal(`Editar corrida — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    const box = ov.querySelector('div'); if (box) box.style.width = '640px';
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        const col = campoColeta.getValor();
        await put(`/entregas/${c.id}/enderecos`, {
          coleta: { endereco: col.endereco, lat: col.lat, lng: col.lng },
          pontos: montarPayloadPontos(),
          aplicarValores: valoresConfirmados || undefined,
        });
        ov.remove(); toast(valoresConfirmados ? 'Atualizado e valor recalculado' : 'Atualizado'); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  function abrirProtocolo(c) { const base = window.LOGIX_API || '/api/v1'; window.open(`${base}/entregas/${c.id}/protocolo`, '_blank'); }
  async function abrirRota(c) {
    const mapaDiv = el('div', { style: 'height:60vh;min-height:340px;border-radius:var(--lx-raio);overflow:hidden;background:var(--lx-superficie-2)' });
    const info = el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:10px' }, 'Carregando trajeto…');
    const ov = modal(`Rota — ${c.protocolo}`, el('div', {}, mapaDiv, info), [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Fechar')]);
    const box = ov.querySelector('div'); if (box) box.style.width = '760px';
    let dados;
    try { dados = await get(`/entregas/${c.id}/trajeto`); } catch { info.textContent = 'Erro ao carregar a rota.'; return; }
    try { await garantirLeaflet(); } catch { info.textContent = 'Não foi possível carregar o mapa.'; return; }
    const L = window.L;
    const centro = dados.coleta || dados.trajeto[0] || dados.destinos[0];
    if (!centro) { info.textContent = 'Sem coordenadas registradas para esta corrida.'; return; }
    const mapa = L.map(mapaDiv, { center: [centro.lat, centro.lng], zoom: 14, scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapa);
    setTimeout(() => mapa.invalidateSize(), 120);
    const bounds = [];
    const pin = (lat, lng, cor, titulo) => { const m = L.circleMarker([lat, lng], { radius: 8, color: cor, fillColor: cor, fillOpacity: 0.9, weight: 2 }).addTo(mapa); if (titulo) m.bindPopup(titulo); bounds.push([lat, lng]); };
    if (dados.coleta) pin(dados.coleta.lat, dados.coleta.lng, '#7c3aed', 'Coleta: ' + (dados.coleta.endereco || ''));
    dados.destinos.forEach((d, i) => pin(d.lat, d.lng, '#0ea5e9', `Destino ${i + 1}: ${d.endereco || ''}`));

    // Rota planejada pelas ruas (coleta -> destinos), em azul tracejado.
    const temRota = dados.rota && Array.isArray(dados.rota.coordenadas) && dados.rota.coordenadas.length >= 2;
    if (temRota) {
      L.polyline(dados.rota.coordenadas, { color: '#185FA5', weight: 4, opacity: 0.65, dashArray: '6 6' }).addTo(mapa);
      dados.rota.coordenadas.forEach(p => bounds.push(p));
    }

    // Trajeto real do GPS (verde), por cima, quando existir.
    const temGps = dados.trajeto.length >= 2;
    if (temGps) {
      const linhaGps = dados.trajeto.map(t => [t.lat, t.lng]);
      L.polyline(linhaGps, { color: '#16a34a', weight: 4, opacity: 0.85 }).addTo(mapa);
      linhaGps.forEach(p => bounds.push(p));
    }

    // Legenda/info conforme o que foi desenhado.
    const partes = [];
    if (temRota) partes.push(`<span style="color:#185FA5">━ rota planejada${dados.rota.distanciaKm ? ' (' + dados.rota.distanciaKm + ' km)' : ''}</span>`);
    if (temGps) partes.push(`<span style="color:#16a34a">━ trajeto GPS (${dados.trajeto.length} pts)</span>`);
    if (partes.length) info.innerHTML = partes.join(' &nbsp;·&nbsp; ') + (dados.entrega.motoboy_nome ? ' · ' + dados.entrega.motoboy_nome : '');
    else if (dados.entrega.status === 'entregue') info.innerHTML = 'Sem trajeto registrado para esta corrida.';
    else info.innerHTML = 'Mostrando coleta e destinos. A rota e o trajeto aparecem conforme disponíveis.';

    if (bounds.length) mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }
  function botaoIcone(pIcon, titulo, onClick, cor) {
    const b = el('button', { class: 'lx-btn lx-btn-secundario', style: `padding:5px 7px;${cor ? 'color:' + cor : ''}`, title: titulo, 'aria-label': titulo, onClick });
    b.append(svgIcone(pIcon)); return b;
  }
  function acoes(c) {
    const w = el('div', { style: 'display:flex;gap:4px;justify-content:flex-end;align-items:center;flex-wrap:nowrap' });
    if (_aba === 'sem') {
      if (podeGerenciar) {
        const bAtr = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px;color:var(--lx-azul-primario);display:inline-flex;align-items:center;gap:4px', onClick: () => abrirAtribuir(c) }, svgIcone(P.add, 14), el('span', {}, 'atribuir'));
        w.append(bAtr, botaoIcone(P.bolt, 'Disparar oferta (raio)', () => dispararOferta(c)));
      }
      if (podeEditar) w.append(botaoIcone(P.edit, 'Editar endereços', () => abrirEditar(c)));
      w.append(botaoIcone(P.rota, 'Ver rota no mapa', () => abrirRota(c)));
      w.append(botaoIcone(P.logs, 'Histórico da corrida', () => abrirLogs(c)));
      w.append(botaoIcone(P.x, 'Cancelar', () => abrirCancelar(c), 'var(--lx-erro)'));
    } else if (_aba === 'and') {
      w.append(botaoIcone(P.rota, 'Ver rota no mapa', () => abrirRota(c)));
      w.append(botaoIcone(P.mapa, 'Rastreio ao vivo (nova guia)', () => { window.open(location.origin + location.pathname + '#/rastreio', '_blank'); }));
      if (podeGerenciar) w.append(botaoIcone(P.troca, 'Trocar motoboy', () => abrirAtribuir(c, true)));
      if (podeEditar) { w.append(botaoIcone(P.edit, 'Editar', () => abrirEditar(c)), botaoIcone(P.check, 'Finalizar', () => abrirFinalizar(c), 'var(--lx-ok)')); }
      w.append(botaoIcone(P.logs, 'Histórico da corrida', () => abrirLogs(c)));
      w.append(botaoIcone(P.x, 'Cancelar', () => abrirCancelar(c), 'var(--lx-erro)'));
    } else if (_aba === 'con') {
      w.append(botaoIcone(P.rota, 'Ver rota do GPS', () => abrirRota(c)));
      w.append(botaoIcone(P.file, 'Ver protocolo', () => abrirProtocolo(c)));
      w.append(botaoIcone(P.logs, 'Histórico da corrida', () => abrirLogs(c)));
      if (podeEditar) w.append(botaoIcone(P.reabrir, 'Reabrir corrida', () => abrirReabrir(c), 'var(--lx-azul-primario)'));
    } else { // canceladas
      w.append(botaoIcone(P.rota, 'Ver rota', () => abrirRota(c)));
      w.append(botaoIcone(P.file, 'Ver detalhes', () => abrirProtocolo(c)));
      w.append(botaoIcone(P.logs, 'Histórico da corrida', () => abrirLogs(c)));
      if (podeEditar) w.append(botaoIcone(P.reabrir, 'Reabrir corrida', () => abrirReabrir(c), 'var(--lx-azul-primario)'));
    }
    return w;
  }
  // Coleta e destino empilhados (um abaixo do outro), endereço completo.
  function enderecoEmpilhado(c) {
    const ponto = (cor, rotulo, texto, extra) => el('div', { style: 'display:flex;align-items:flex-start;gap:7px;min-width:0' },
      el('span', { style: `width:7px;height:7px;border-radius:2px;background:${cor};flex-shrink:0;margin-top:5px` }),
      el('span', { style: 'font-size:11px;color:var(--lx-tinta-3);font-weight:700;flex-shrink:0;width:50px;margin-top:1px' }, rotulo),
      el('div', { style: 'min-width:0' },
        el('span', { style: 'font-size:12px;color:var(--lx-tinta);line-height:1.4' }, texto || '—'),
        extra || el('span', {})));

    const total = c.total_pontos != null ? Number(c.total_pontos) : 1;
    const rotuloEntrega = total > 1 ? `Entrega 1 de ${total}` : 'Entrega';
    // se há mais de 1 ponto, mostra um link para ver todos os pontos + detalhes
    const verTodos = total > 1
      ? el('button', { style: 'display:inline-flex;align-items:center;gap:4px;margin-top:2px;background:none;border:none;padding:0;cursor:pointer;color:var(--lx-azul-primario);font-size:11px;font-weight:700', onClick: (e) => { e.stopPropagation(); abrirPontos(c); } }, `+${total - 1} ponto${total - 1 > 1 ? 's' : ''} · ver todos`)
      : null;

    return el('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' },
      el('div', { style: 'display:flex;align-items:center;gap:6px;min-width:0;margin-bottom:1px' },
        el('span', { style: 'font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'),
        c.tem_retorno
          ? el('span', { style: 'flex-shrink:0;display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:800;letter-spacing:.3px;color:#b45309;background:#fef3c7;padding:2px 7px;border-radius:5px', title: 'Esta corrida teve uma ocorrência de retorno à coleta' }, '↩ COM RETORNO')
          : null,
        c.liberacao_pendente
          ? el('span', { style: 'flex-shrink:0;display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:800;letter-spacing:.3px;color:#fff;background:#ea580c;padding:2px 7px;border-radius:5px;cursor:pointer', title: 'Um motoboy solicitou liberação de ponto — clique para aprovar', onClick: (e) => { e.stopPropagation(); abrirPontos(c); } }, '🔓 LIBERAÇÃO PEDIDA')
          : (c.tem_liberado
            ? el('span', { style: 'flex-shrink:0;display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:800;letter-spacing:.3px;color:#fff;background:var(--lx-ok);padding:2px 7px;border-radius:5px', title: 'Ponto liberado pela central' }, '🔓 LIBERADO')
            : null)),
      ponto('var(--lx-azul-primario)', 'Coleta', c.coleta_endereco),
      ponto('var(--lx-ok)', rotuloEntrega, c.destino_endereco, verTodos ? el('div', {}, verTodos) : null));
  }

  // Modal: todos os pontos da corrida com detalhes ricos (razão social, tel, nota, obs).
  async function abrirPontos(c) {
    const corpo = el('div', { style: 'min-height:120px' }, el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'Carregando pontos…'));
    const ov = modal(`Pontos da corrida — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => { window.__lxPontosAberto = null; ov.remove(); } }, 'Fechar')]);
    const box = ov.querySelector('div'); if (box) box.style.width = '600px';

    async function liberar(pontoId, btn) {
      if (btn) { btn.disabled = true; btn.textContent = 'Liberando…'; }
      try { await post(`/entregas/${c.id}/pontos/${pontoId}/liberar`, {}); toast('Ponto liberado'); render(); }
      catch (e) { toast(e.message || 'Erro ao liberar', 'erro'); if (btn) { btn.disabled = false; btn.textContent = 'Liberar ponto'; } }
    }

    async function render() {
      let dados;
      try { dados = await get(`/entregas/${c.id}/pontos`); }
      catch { corpo.innerHTML = ''; corpo.append(el('div', { style: 'font-size:13px;color:var(--lx-erro)' }, 'Erro ao carregar os pontos.')); return; }

      corpo.innerHTML = '';
      const lista = el('div', { style: 'display:flex;flex-direction:column;gap:0;max-height:62vh;overflow:auto' });

      // Coleta
      lista.append(cartaoPonto({
        cor: 'var(--lx-azul-primario)', etiqueta: 'COLETA', titulo: dados.loja_nome || dados.coleta.nome || 'Ponto de coleta',
        endereco: dados.coleta.endereco,
      }, false, null));

      // Entregas
      (dados.pontos || []).forEach((p, i) => {
        lista.append(cartaoPonto({
          cor: 'var(--lx-ok)', etiqueta: `ENTREGA ${i + 1}`,
          titulo: p.nome_fantasia || p.nome || `Destino ${p.ordem}`,
          endereco: p.endereco, complemento: p.complemento, telefone: p.telefone,
          numero_nf: p.numero_nf, observacoes: p.observacoes,
          status: p.status, recebedor: p.recebedor, entregue_em: p.entregue_em,
          id: p.id, liberado: p.liberado, liberacao_solicitada_em: p.liberacao_solicitada_em,
          liberacao_motivo: p.liberacao_motivo, liberado_em: p.liberado_em,
        }, i < dados.pontos.length - 1, liberar));
      });
      corpo.append(lista);
    }

    // Permite que o WS recarregue este modal quando chega/aprova liberação.
    window.__lxPontosAberto = { entregaId: c.id, recarregar: render };
    const obsModal = new MutationObserver(() => { if (!document.body.contains(ov)) { window.__lxPontosAberto = null; obsModal.disconnect(); } });
    obsModal.observe(document.body, { childList: true, subtree: true });

    await render();
  }

  // Cartão de um ponto, com os dados ricos inline embaixo do endereço.
  function cartaoPonto(p, temProximo, onLiberar) {
    const linhaInfo = (rotulo, valor) => valor ? el('div', { style: 'display:flex;gap:6px;font-size:11.5px;margin-top:2px' },
      el('span', { style: 'color:var(--lx-tinta-3);font-weight:700;min-width:78px' }, rotulo),
      el('span', { style: 'color:var(--lx-tinta);min-width:0' }, valor)) : null;

    const trilho = el('div', { style: 'display:flex;flex-direction:column;align-items:center;width:14px;flex-shrink:0' },
      el('span', { style: `width:11px;height:11px;border-radius:50%;background:${p.cor};margin-top:4px;flex-shrink:0` }),
      temProximo ? el('span', { style: 'flex:1;width:2px;background:var(--lx-linha);margin:2px 0' }) : el('span', {}));

    const solicitou = p.liberacao_solicitada_em && !p.liberado;
    const entregue = p.status === 'entregue' || p.status === 'insucesso';

    const badges = el('div', { style: 'display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap' },
      p.status === 'entregue' ? el('span', { style: 'font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--lx-ok-bg);color:var(--lx-ok)' }, '✓ entregue') : el('span', {}),
      solicitou ? el('span', { style: 'font-size:10px;font-weight:800;padding:1px 7px;border-radius:999px;background:#ffedd5;color:#c2410c' }, '⚠ liberação solicitada') : el('span', {}),
      p.liberado ? el('span', { style: 'font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:#ede9fe;color:#6d28d9' }, '🔓 liberado') : el('span', {}));

    const corpo = el('div', { style: 'padding-bottom:16px;min-width:0;flex:1' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px' },
        el('span', { style: `font-size:10px;font-weight:800;letter-spacing:.04em;padding:1px 7px;border-radius:999px;background:${p.cor}1a;color:${p.cor}` }, p.etiqueta),
        p.titulo ? el('span', { style: 'font-size:13px;font-weight:700' }, p.titulo) : el('span', {}),
        badges),
      el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);line-height:1.4' }, p.endereco || '—'));

    [
      linhaInfo('Complemento', p.complemento),
      linhaInfo('Telefone', p.telefone),
      linhaInfo('Nº da nota', p.numero_nf),
      linhaInfo('Observações', p.observacoes),
      linhaInfo('Recebedor', p.recebedor),
      solicitou && p.liberacao_motivo ? linhaInfo('Motivo', p.liberacao_motivo) : null,
    ].filter(Boolean).forEach(x => corpo.append(x));

    // Botão "Liberar ponto" — nativo por ponto (aprova solicitação ou libera preventivo).
    if (onLiberar && p.id && !p.liberado && !entregue) {
      const btn = el('button', {
        class: 'lx-btn',
        style: `margin-top:10px;height:32px;font-size:12.5px;padding:0 14px;${solicitou ? 'background:#ea580c;border-color:#ea580c;color:#fff' : ''}`,
        onClick: () => onLiberar(p.id, btn),
      }, solicitou ? 'Aprovar liberação' : 'Liberar ponto');
      corpo.append(btn);
    }

    return el('div', { style: 'display:flex;gap:12px;align-items:stretch' }, trilho, corpo);
  }

  // Badge de status SLA (No prazo / Atenção / Atraso iminente / Fora do prazo).
  function slaBadge(sla) {
    if (!sla) return el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, '—');
    const cores = {
      no_prazo:   { bg: 'var(--lx-ok-bg)',    cor: 'var(--lx-ok)' },
      atencao:    { bg: '#fef9c3',             cor: '#a16207' },
      iminente:   { bg: '#ffedd5',             cor: '#c2410c' },
      fora_prazo: { bg: 'var(--lx-erro-bg)',   cor: 'var(--lx-erro)' },
    };
    const c = cores[sla.nivel] || cores.no_prazo;
    const min = sla.minutosRestantes;
    let sub;
    if (sla.final) {
      // veredito de corrida concluída: "X min antes" / "X min depois"
      if (min == null) sub = '';
      else if (min >= 0) sub = `${min} min antes`;
      else sub = `${Math.abs(min)} min depois`;
    } else {
      sub = sla.nivel === 'fora_prazo' ? `há ${Math.abs(min)} min` : (min != null ? `faltam ${min} min` : '');
    }
    return el('div', { style: 'display:flex;flex-direction:column;gap:2px;align-items:flex-start' },
      el('span', { style: `font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:${c.bg};color:${c.cor};white-space:nowrap` }, sla.rotulo),
      sub ? el('span', { style: 'font-size:10px;color:var(--lx-tinta-3)' }, sub) : el('span', {}));
  }

  // Célula de motoboy (código + nome) para as abas que não são 'sem'.
  function celulaMotoboy(c) {
    if (!c.motoboy_nome) return el('div', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, 'sem motoboy');
    return el('div', { style: 'display:flex;flex-direction:column;line-height:1.3;min-width:0' },
      el('span', { style: 'font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.motoboy_nome),
      c.motoboy_codigo ? el('span', { style: 'font-size:11px;color:var(--lx-azul-primario);font-weight:700' }, '#' + String(c.motoboy_codigo).padStart(3, '0')) : el('span', {}));
  }

  // Badge da categoria de frete (modalidade) da corrida.
  function celulaCategoria(c) {
    if (!c.categoria_nome) return el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3)' }, '—');
    const cor = c.categoria_cor || '#7c3aed';
    return el('div', { style: `display:inline-flex;align-items:center;gap:5px;min-width:0` },
      el('span', { style: `width:9px;height:9px;border-radius:3px;background:${cor};flex:none` }),
      el('span', { style: 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.categoria_nome));
  }

  // Valor cliente / motoboy (R$). Clicável para editar (só admin da central).
  function celulaValor(c) {
    const fmt = cent => (cent == null ? '—' : 'R$ ' + (Number(cent) / 100).toFixed(2).replace('.', ','));
    const semValor = c.valor_cliente_cent == null && c.valor_motoboy_cent == null;
    const box = el('div', { style: `display:flex;flex-direction:column;line-height:1.35;min-width:0;cursor:${_ehCentral ? 'pointer' : 'default'};border-radius:6px;padding:2px 4px`, title: _ehCentral ? 'Clique para editar os valores' : '' },
      el('span', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta);white-space:nowrap' }, fmt(c.valor_cliente_cent)),
      el('span', { style: 'font-size:11px;color:var(--lx-tinta-2);white-space:nowrap' }, fmt(c.valor_motoboy_cent)));
    if (_ehCentral) {
      box.addEventListener('mouseenter', () => box.style.background = 'var(--lx-info-bg)');
      box.addEventListener('mouseleave', () => box.style.background = '');
      box.addEventListener('click', () => abrirEditarValores(c));
    }
    return box;
  }

  function linha(c) {
    // Colunas por aba. Todas têm Categoria, Valor e Direção (após Trajeto).
    const cols = _aba === 'sem' ? '40px 90px 1.4fr 130px 120px 90px 140px 150px 230px'
      : _aba === 'and' ? '90px 1.4fr 130px 120px 90px 150px 140px 150px 200px'
      : _aba === 'con' ? '90px 1.4fr 130px 120px 90px 150px 140px 140px 150px 150px'
      : '90px 1.4fr 130px 120px 90px 150px 140px 140px 150px'; // canceladas
    const dataHora = iso => { if (!iso) return el('div', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, '—'); const d = new Date(iso); return el('div', { style: 'display:flex;flex-direction:column;line-height:1.3' }, el('span', { style: 'font-size:12px;color:var(--lx-tinta);font-weight:600' }, d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: '2-digit' })), el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }))); };

    const celulas = [];
    if (_aba === 'sem') {
      const chk = el('input', { type: 'checkbox', style: 'width:16px;height:16px;cursor:pointer;accent-color:var(--lx-azul-primario)' });
      chk.checked = _sel.has(c.id);
      chk.onchange = () => { if (chk.checked) _sel.add(c.id); else _sel.delete(c.id); atualizarBarraSel(); };
      celulas.push(el('div', { style: 'display:flex;justify-content:center' }, chk));
    }
    celulas.push(el('div', { style: 'font-weight:700;font-size:13px;color:var(--lx-azul-primario)' }, c.protocolo));
    celulas.push(enderecoEmpilhado(c)); // Trajeto
    celulas.push(celulaCategoria(c));   // Categoria
    celulas.push(celulaValor(c));       // Valor
    celulas.push(bussola(c.coleta_lat, c.coleta_lng, c.destino_lat, c.destino_lng)); // Direção (TODAS as abas)

    if (_aba === 'sem') {
      celulas.push(dataHora(c.criado_em));  // Solicitação
      celulas.push(slaBadge(c.sla));        // Status
    } else if (_aba === 'and') {
      celulas.push(celulaMotoboy(c));       // Motoboy
      celulas.push(dataHora(c.criado_em));  // Solicitação
      celulas.push(slaBadge(c.sla));        // Status
    } else if (_aba === 'con') {
      celulas.push(celulaMotoboy(c));       // Motoboy
      celulas.push(dataHora(c.criado_em));  // Solicitação
      celulas.push(dataHora(c.concluida_em)); // Concluída
      celulas.push(slaBadge(c.sla));        // Status (veredito final)
    } else { // canceladas
      celulas.push(celulaMotoboy(c));       // Motoboy
      celulas.push(dataHora(c.criado_em));  // Solicitação
      celulas.push(dataHora(c.cancelada_em || c.criado_em)); // Cancelada
    }
    celulas.push(acoes(c));

    const destaque = _aba === 'sem' && _sel.has(c.id) ? 'background:var(--lx-info-bg)' : 'background:var(--lx-superficie)';
    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:12px;padding:11px 16px;align-items:center;border-bottom:0.5px solid var(--lx-linha);min-width:1200px;${destaque}` }, ...celulas);
  }
  function cabecalho() {
    const cols = _aba === 'sem' ? '40px 90px 1.4fr 130px 120px 90px 140px 150px 230px'
      : _aba === 'and' ? '90px 1.4fr 130px 120px 90px 150px 140px 150px 200px'
      : _aba === 'con' ? '90px 1.4fr 130px 120px 90px 150px 140px 140px 150px 150px'
      : '90px 1.4fr 130px 120px 90px 150px 140px 140px 150px';
    const labels = _aba === 'sem' ? ['', 'Protocolo', 'Trajeto', 'Categoria', 'Valor', 'Direção', 'Solicitação', 'Status', 'Ações']
      : _aba === 'and' ? ['Protocolo', 'Trajeto', 'Categoria', 'Valor', 'Direção', 'Motoboy', 'Solicitação', 'Status', 'Ações']
      : _aba === 'con' ? ['Protocolo', 'Trajeto', 'Categoria', 'Valor', 'Direção', 'Motoboy', 'Solicitação', 'Concluída', 'Status', 'Ações']
      : ['Protocolo', 'Trajeto', 'Categoria', 'Valor', 'Direção', 'Motoboy', 'Solicitação', 'Cancelada', 'Ações'];
    const cels = labels.map((l, i) => el('div', { style: i === labels.length - 1 ? 'text-align:right' : '' }, l));
    if (_aba === 'sem') {
      const todas = el('input', { type: 'checkbox', style: 'width:16px;height:16px;cursor:pointer;accent-color:var(--lx-azul-primario)' });
      const lista = listaDaAba();
      todas.checked = lista.length > 0 && lista.every(c => _sel.has(c.id));
      todas.onchange = () => { if (todas.checked) lista.forEach(c => _sel.add(c.id)); else _sel.clear(); renderTabela(); atualizarBarraSel(); };
      cels[0] = el('div', { style: 'display:flex;justify-content:center' }, todas);
    }
    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:12px;padding:8px 16px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;background:var(--lx-superficie-2);border-bottom:0.5px solid var(--lx-linha);min-width:1200px` }, ...cels);
  }
  function listaDaAba() { return _aba === 'sem' ? _dados.semAssociacao : _aba === 'and' ? _dados.emAndamento : _aba === 'con' ? _dados.concluidas : _dados.canceladas; }

  // Barra flutuante que aparece quando há corridas selecionadas (lote).
  const barraSel = el('div', { style: 'display:none;position:sticky;top:0;z-index:30;align-items:center;gap:12px;padding:10px 16px;margin-bottom:0;background:var(--lx-azul-primario);color:#fff;border-radius:var(--lx-raio) var(--lx-raio) 0 0;box-shadow:0 4px 16px -6px rgba(4,44,83,.4)' });
  const barraSelTxt = el('span', { style: 'font-size:13px;font-weight:700' }, '');
  function atualizarBarraSel() {
    const n = _sel.size;
    if (!n || _aba !== 'sem') { barraSel.style.display = 'none'; return; }
    barraSel.style.display = 'flex';
    barraSelTxt.textContent = `${n} corrida${n > 1 ? 's' : ''} selecionada${n > 1 ? 's' : ''}`;
  }
  const btnVerRotaLote = el('button', { class: 'lx-btn', style: 'background:#fff;color:var(--lx-azul-primario);font-weight:700;padding:6px 14px;font-size:13px', onClick: () => abrirRotaLote() }, 'Ver rota otimizada');
  const btnLimparSel = el('button', { class: 'lx-btn', style: 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:6px 12px;font-size:13px', onClick: () => { _sel.clear(); renderTabela(); atualizarBarraSel(); } }, 'Limpar');
  barraSel.append(barraSelTxt, el('div', { style: 'flex:1' }), btnVerRotaLote, btnLimparSel);

  // Modal: rotas AGRUPADAS (cada grupo = uma cor) + drag&drop entre grupos + despacho por grupo.
  async function abrirRotaLote() {
    const idsIniciais = [..._sel];
    if (!idsIniciais.length) return;
    let retornar = false;
    let mapa = null;
    let dados = null;
    // override manual: { entregaId -> indiceGrupo }. null = automatico.
    let override = null;
    // ids ainda no modal (vao saindo conforme despacha)
    let idsAtivos = [...idsIniciais];

    const mapaDiv = el('div', { style: 'height:42vh;min-height:260px;border-radius:var(--lx-raio);overflow:hidden;background:var(--lx-superficie-2)' });
    const info = el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:8px 0' }, 'Agrupando rotas...');
    const gruposWrap = el('div', { style: 'display:flex;flex-direction:column;gap:12px;max-height:340px;overflow:auto' });

    const chkRetorno = el('input', { type: 'checkbox', style: 'width:15px;height:15px;accent-color:var(--lx-azul-primario)' });
    const lblRetorno = el('label', { style: 'display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--lx-tinta);cursor:pointer;user-select:none' }, chkRetorno, el('span', {}, 'Motoboy volta ao ponto de coleta no fim'));
    chkRetorno.onchange = () => { retornar = chkRetorno.checked; recarregar(); };
    const btnAuto = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:5px 10px', onClick: () => { override = null; recarregar(); } }, 'Reagrupar automatico');

    const dica = el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin:2px 0 8px' }, 'Dica: arraste uma corrida e solte sobre outro grupo para reagrupar.');
    const corpo = el('div', {},
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:10px;flex-wrap:wrap' }, lblRetorno, btnAuto),
      mapaDiv, info, dica,
      el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin:6px 0 6px' }, 'Grupos de rota'), gruposWrap);
    const ov = modal(`Rota otimizada - ${idsIniciais.length} corridas`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Fechar')]);
    const box = ov.querySelector('div'); if (box) box.style.width = '860px';

    try { await garantirLeaflet(); } catch { info.textContent = 'Nao foi possivel carregar o mapa.'; return; }
    await carregarMotoboys();
    const L = window.L;

    function gruposManualPayload() {
      if (!override) return null;
      const m = {};
      Object.entries(override).forEach(([entregaId, gi]) => { if (idsAtivos.includes(entregaId)) (m[gi] = m[gi] || []).push(entregaId); });
      return Object.values(m).filter(g => g.length);
    }

    async function recarregar() {
      info.textContent = 'Otimizando...';
      if (!idsAtivos.length) { info.textContent = 'Todas as corridas foram despachadas.'; gruposWrap.innerHTML = ''; if (mapa) { mapa.remove(); mapa = null; } return; }
      const body = { ids: idsAtivos, retornar };
      const gm = gruposManualPayload();
      if (gm && gm.length) body.grupos_manual = gm;
      try { dados = await post('/entregas/acompanhamento/rota-lote', body); } catch { info.textContent = 'Erro ao otimizar.'; return; }
      desenhar();
    }

    function desenhar() {
      if (mapa) { mapa.remove(); mapa = null; }
      const centro = dados.coleta || (dados.grupos[0] && dados.grupos[0].destinos[0]);
      if (!centro) { info.textContent = 'Sem coordenadas para montar a rota.'; return; }
      mapa = L.map(mapaDiv, { center: [centro.lat, centro.lng], zoom: 12, scrollWheelZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '(c) OpenStreetMap', maxZoom: 19 }).addTo(mapa);
      setTimeout(() => mapa && mapa.invalidateSize(), 120);
      const bounds = [];
      if (dados.coleta) { L.circleMarker([dados.coleta.lat, dados.coleta.lng], { radius: 9, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: .95, weight: 2 }).addTo(mapa).bindPopup('Coleta'); bounds.push([dados.coleta.lat, dados.coleta.lng]); }
      dados.grupos.forEach((g, gi) => {
        if (g.rota && g.rota.coordenadas && g.rota.coordenadas.length >= 2) {
          L.polyline(g.rota.coordenadas, { color: g.cor, weight: 4, opacity: .75 }).addTo(mapa);
          g.rota.coordenadas.forEach(p => bounds.push(p));
        }
        g.destinos.forEach(d => {
          const ico = L.divIcon({ className: '', html: `<div style="background:${g.cor};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${d.sequencia}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
          L.marker([d.lat, d.lng], { icon: ico }).addTo(mapa).bindPopup(`<b style="color:${g.cor}">Rota ${gi + 1}</b> - ${d.sequencia}o<br>${d.protocolo}<br>${d.endereco || ''}`);
          bounds.push([d.lat, d.lng]);
        });
      });
      if (bounds.length) mapa.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
      const totalKm = dados.grupos.reduce((s, g) => s + (g.rota.distanciaKm || 0), 0);
      info.innerHTML = `<b style="color:var(--lx-azul-primario)">${dados.grupos.length} rota(s)</b> - ${dados.grupos.reduce((s,g)=>s+g.destinos.length,0)} paradas - ${totalKm.toFixed(1)} km${retornar ? ' - com retorno' : ''}`;
      gruposWrap.innerHTML = '';
      dados.grupos.forEach((g, gi) => gruposWrap.append(cartaoGrupo(g, gi)));
      if (dados.semCoordenada && dados.semCoordenada.length) {
        gruposWrap.append(el('div', { style: 'font-size:11px;color:var(--lx-erro);padding:6px 10px' }, `${dados.semCoordenada.length} corrida(s) sem coordenada ficaram de fora: ${dados.semCoordenada.map(s => s.protocolo).join(', ')}`));
      }
    }

    // garante que override esteja inicializado com o agrupamento atual
    function garantirOverride() {
      if (override) return;
      override = {};
      dados.grupos.forEach((g, gi) => g.destinos.forEach(d => { override[d.id] = gi; }));
    }

    function cartaoGrupo(g, gi) {
      const card = el('div', { 'data-grupo': String(gi), style: `border:1px solid ${g.cor}40;border-left:4px solid ${g.cor};border-radius:var(--lx-raio);padding:10px 12px;background:var(--lx-superficie);transition:background .15s` });
      // permitir soltar uma corrida neste grupo
      card.addEventListener('dragover', e => { e.preventDefault(); card.style.background = g.cor + '14'; });
      card.addEventListener('dragleave', () => { card.style.background = 'var(--lx-superficie)'; });
      card.addEventListener('drop', e => {
        e.preventDefault(); card.style.background = 'var(--lx-superficie)';
        const entregaId = e.dataTransfer.getData('text/plain');
        if (!entregaId) return;
        garantirOverride();
        if (override[entregaId] === gi) return; // ja esta aqui
        override[entregaId] = gi;
        recarregar();
      });

      card.append(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px' },
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          el('span', { style: `width:11px;height:11px;border-radius:50%;background:${g.cor}` }),
          el('b', { style: 'font-size:13px' }, `Rota ${gi + 1}`),
          el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `${g.destinos.length} parada(s) - ${(g.rota.distanciaKm || 0).toFixed(1)} km`))));

      g.destinos.forEach(d => {
        const item = el('div', { draggable: 'true', style: 'display:flex;align-items:center;gap:8px;padding:6px 4px;border-top:0.5px solid var(--lx-linha);cursor:grab' },
          el('span', { style: 'color:var(--lx-tinta-3);font-size:13px;cursor:grab' }, '\u2630'),
          el('span', { style: `font-weight:800;color:${g.cor};min-width:22px` }, d.sequencia + 'o'),
          el('span', { style: 'font-weight:700;font-size:12px;min-width:78px' }, d.protocolo),
          el('span', { style: 'flex:1;font-size:11.5px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, d.endereco || ''));
        item.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; item.style.opacity = '.4'; });
        item.addEventListener('dragend', () => { item.style.opacity = '1'; });
        card.append(item);
      });

      // despacho do grupo
      const buscaMb = el('input', { class: 'lx-input', placeholder: 'Motoboy (no ou nome)...', style: 'flex:1;font-size:12px' });
      const listaMb = el('div', { style: 'display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:70;background:var(--lx-superficie);border:0.5px solid var(--lx-linha);border-radius:var(--lx-raio);max-height:150px;overflow:auto;box-shadow:0 8px 24px -8px rgba(4,44,83,.25)' });
      let mbEscolhido = null;
      buscaMb.addEventListener('input', () => {
        mbEscolhido = null;
        const f = buscaMb.value.toLowerCase().replace('#', '').trim();
        listaMb.innerHTML = '';
        if (!f) { listaMb.style.display = 'none'; return; }
        const vis = _motoboys.filter(m => { const cod = String(m.codigo || '').padStart(3, '0'); return cod.includes(f) || (m.nome_completo || '').toLowerCase().includes(f); });
        if (!vis.length) { listaMb.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--lx-tinta-2)">Nenhum motoboy</div>'; listaMb.style.display = 'block'; return; }
        vis.forEach(m => listaMb.append(el('div', { style: 'display:flex;align-items:center;gap:7px;padding:7px 10px;cursor:pointer;border-bottom:0.5px solid var(--lx-linha)', onClick: () => { mbEscolhido = m; buscaMb.value = `#${String(m.codigo||0).padStart(3,'0')} ${m.nome_completo}`; listaMb.style.display = 'none'; } },
          el('span', { style: 'font-weight:800;color:var(--lx-azul-primario);font-size:12px' }, '#' + String(m.codigo||0).padStart(3,'0')),
          el('span', { style: 'flex:1;font-size:12px' }, m.nome_completo),
          el('span', { style: 'font-size:11px' }, m.online ? '\ud83d\udfe2' : '\u26aa'))));
        listaMb.style.display = 'block';
      });
      const btnDesp = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12px;padding:7px 12px', onClick: async () => {
        if (!mbEscolhido) { toast('Escolha um motoboy', 'erro'); return; }
        const lote = g.destinos.map(d => d.id);
        try {
          btnDesp.disabled = true;
          const r = await post('/filas/atribuir-lote', { motoboy_id: mbEscolhido.id, entrega_ids: lote });
          toast(`Rota ${gi + 1}: ${r.atribuidas} corrida(s) -> ${r.motoboy_nome}`);
          // remove as despachadas do estado local e da selecao global
          lote.forEach(id => { _sel.delete(id); const k = idsAtivos.indexOf(id); if (k >= 0) idsAtivos.splice(k, 1); if (override) delete override[id]; });
          carregar(); // atualiza a tabela de fundo
          if (!idsAtivos.length) { ov.remove(); return; } // acabou: fecha
          await recarregar(); // sobra: reotimiza so o que restou
        } catch (e) { toast(e.message || 'Erro', 'erro'); btnDesp.disabled = false; }
      } }, `Despachar Rota ${gi + 1}`);
      card.append(el('div', { style: 'display:flex;gap:8px;align-items:stretch;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--lx-linha)' },
        el('div', { style: 'position:relative;flex:1' }, buscaMb, listaMb), btnDesp));
      return card;
    }

    await recarregar();
  }
  function renderTabela() {
    tabelaWrap.innerHTML = ''; tabelaWrap.append(cabecalho());
    const lista = listaDaAba();
    if (!lista.length) { tabelaWrap.append(el('div', { style: 'padding:36px;text-align:center;color:var(--lx-tinta-2);font-size:13px;background:var(--lx-superficie)' }, 'Nenhuma corrida nesta seção.')); return; }
    lista.forEach(c => tabelaWrap.append(linha(c)));
  }
  function render() {
    cnt.sem.textContent = String(_dados.totais.semAssociacao || 0);
    cnt.and.textContent = String(_dados.totais.emAndamento || 0);
    cnt.con.textContent = String(_dados.totais.concluidas || 0);
    cnt.can.textContent = String(_dados.totais.canceladas || 0);
    // Remove da seleção corridas que não estão mais em "sem associação".
    const idsAtuais = new Set(_dados.semAssociacao.map(c => c.id));
    [..._sel].forEach(id => { if (!idsAtuais.has(id)) _sel.delete(id); });
    renderTabela();
    atualizarBarraSel();
  }

  function periodoParaDatas() {
    if (_busca) return {};
    const agora = new Date();
    if (filtros.periodo === 'tudo') return {};
    if (filtros.periodo === 'custom') return { de: filtros.de ? new Date(filtros.de).toISOString() : null, ate: filtros.ate ? new Date(filtros.ate + 'T23:59:59').toISOString() : null };
    if (filtros.periodo === 'hoje') { const de = new Date(agora); de.setHours(0, 0, 0, 0); return { de: de.toISOString() }; }
    if (filtros.periodo === 'mes') { const de = new Date(agora.getFullYear(), agora.getMonth(), 1); return { de: de.toISOString() }; }
    const dias = filtros.periodo === '7d' ? 7 : 30;
    return { de: new Date(agora.getTime() - dias * 86400000).toISOString() };
  }
  async function carregar() {
    const params = new URLSearchParams();
    if (_busca) { params.set('q', _busca); }
    else {
      const { de, ate } = periodoParaDatas();
      if (de) params.set('de', de);
      if (ate) params.set('ate', ate);
      if (filtros.lojas.length) params.set('loja_ids', filtros.lojas.join(','));
      if (filtros.cidades.length) params.set('cidades', filtros.cidades.join(','));
      if (filtros.categorias && filtros.categorias.length) params.set('categoria_ids', filtros.categorias.join(','));
    }
    try { _dados = await get('/entregas/acompanhamento?' + params.toString()); render(); }
    catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); }
  }

  // Monta a casca IMEDIATAMENTE (transição suave, sem esperar a API).
  const conteudo = el('div', {}, barraTopo, painel, avisoEl, abas, barraSel, tabelaWrap);
  container.append(casca('Acompanhamento', conteudo, 'Todas as corridas, todas as lojas'));
  setAba('sem');
  carregar();

  // Lojas e cidades para os checkboxes — carregadas em background (não bloqueiam a tela).
  (async () => {
    try { _lojas = await get('/lojas?ativo=true'); } catch { _lojas = []; }
    try { _cidades = await get('/entregas/acompanhamento/cidades'); } catch { _cidades = []; }
    try { _categorias = await get('/entregas/acompanhamento/categorias'); } catch { _categorias = []; }
    preencherDrops(); atualizarBadge();
  })();

  const timer = setInterval(carregar, 30000);

  // WebSocket: sinalização em tempo real de liberação de ponto.
  let _ws = null;
  try {
    const token = getToken();
    if (token) {
      const base = (window.LOGIX_API || '/api/v1');
      const httpBase = base.startsWith('http') ? base : (location.origin + base);
      const wsUrl = httpBase.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
      _ws = new WebSocket(wsUrl);
      _ws.onmessage = (ev) => {
        try {
          const { evento, dados: d } = JSON.parse(ev.data);
          if (evento === 'ponto.liberacao_solicitada') {
            toast('⚠ Um motoboy solicitou liberação de ponto', 'erro');
          }
          // Qualquer um desses eventos muda a lista/badges — recarrega ao vivo.
          if ([
            'ponto.liberacao_solicitada', 'ponto.liberado', 'entrega.status',
            'entrega.concluida', 'entrega.retorno', 'entrega.atribuida',
            'entrega.criada', 'entrega.cancelada', 'oferta.disparada', 'motoboy.status',
          ].includes(evento)) {
            carregar();
            if (window.__lxPontosAberto && (window.__lxPontosAberto.entregaId === d?.entregaId || window.__lxPontosAberto.entregaId === d?.id)) {
              window.__lxPontosAberto.recarregar();
            }
          }
        } catch {}
      };
    }
  } catch {}

  const obs = new MutationObserver(() => { if (!document.body.contains(container)) { clearInterval(timer); try { _ws?.close(); } catch {} obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
