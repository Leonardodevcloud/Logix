import { casca } from '../core/layout.js';
import { el, statusBadge, campo } from '../core/ui.js';
import { get, post, put, patch } from '../core/api.js';
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

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
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
};

function carregarFiltros() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY)); if (j) return j; } catch {}
  return { periodo: 'hoje', de: '', ate: '', lojas: [], cidades: [] };
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

  let _dados = { semAssociacao: [], emAndamento: [], concluidas: [], canceladas: [], totais: {}, buscando: false };
  let _lojas = [], _cidades = [], _motoboys = [];
  let _aba = 'sem';
  let _busca = '';
  const filtros = carregarFiltros();

  // ── Busca (sempre visível) ──────────────────────────────────────
  const inpBusca = el('input', { class: 'lx-input', placeholder: 'Pesquisar protocolo, NF ou endereço…', style: 'height:34px;width:100%;padding-left:34px' });
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

  // Dropdowns multi-select de loja e cidade (escaláveis).
  const dropLojas = dropMulti('Todas as lojas', [], filtros.lojas, arr => { filtros.lojas = arr; });
  const dropCidades = dropMulti('Todas as regiões', [], filtros.cidades, arr => { filtros.cidades = arr; });

  function aplicarFiltros() {
    filtros.periodo = selPeriodo.value;
    filtros.de = inpDe.value; filtros.ate = inpAte.value;
    salvarFiltros(filtros);
    atualizarBadge();
    carregar();
  }
  function limparFiltros() {
    filtros.periodo = 'hoje'; filtros.de = ''; filtros.ate = ''; filtros.lojas = []; filtros.cidades = [];
    selPeriodo.value = 'hoje'; inpDe.value = ''; inpAte.value = ''; customWrap.style.display = 'none';
    dropLojas._setSel([]); dropCidades._setSel([]);
    salvarFiltros(filtros); atualizarBadge(); carregar();
  }
  const btnAplicar = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => { aplicarFiltros(); _aberto = false; painel.style.display = 'none'; } }, 'Aplicar');
  const btnLimpar = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:13px', onClick: limparFiltros }, 'Limpar');

  const colPeriodo = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Período'), selPeriodo, customWrap);
  const colLojas = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Lojas'), dropLojas);
  const colCidades = el('div', {}, el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:8px' }, 'Regiões'), dropCidades);

  painel.append(
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;align-items:start;margin-bottom:16px' }, colPeriodo, colLojas, colCidades),
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, btnLimpar, btnAplicar));

  function preencherDrops() {
    dropLojas._setItens(_lojas.map(l => ({ valor: l.id, rotulo: l.nome_fantasia })));
    dropCidades._setItens(_cidades.map(c => ({ valor: c.cidade, rotulo: c.estado ? `${c.cidade}/${c.estado}` : c.cidade })));
    dropLojas._setSel(filtros.lojas); dropCidades._setSel(filtros.cidades);
  }
  function atualizarBadge() {
    let n = 0;
    if (filtros.periodo && filtros.periodo !== 'hoje') n++;
    n += filtros.lojas.length + filtros.cidades.length;
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
  function setAba(id) {
    _aba = id;
    [abaSem, abaAnd, abaCon, abaCan].forEach(a => { const at = a._id === id; a.style.color = at ? a._cor : 'var(--lx-tinta-2)'; a.style.borderBottomColor = at ? a._cor : 'transparent'; });
    renderTabela();
  }
  const tabelaWrap = el('div', { style: 'border:0.5px solid var(--lx-linha);border-top:none;border-radius:0 0 var(--lx-raio-lg) var(--lx-raio-lg);overflow:hidden' });

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
    const ov = modal(troca ? `Trocar motoboy — ${c.protocolo}` : `Atribuir — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    btn.onclick = async () => {
      if (!escolhido) { toast('Selecione um motoboy', 'erro'); return; }
      try { btn.disabled = true; await post(`/filas/${c.id}/${troca ? 'reatribuir' : 'atribuir'}`, { motoboy_id: escolhido }); ov.remove(); toast(troca ? 'Motoboy trocado' : 'Atribuído'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  async function atribuirAuto(c) { try { await post(`/filas/${c.id}/atribuir-auto`, {}); toast('Atribuído'); carregar(); } catch (e) { toast(e.message || 'Sem motoboy', 'erro'); } }
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
    const pCampos = (d.pontos || []).map((p, i) => ({ id: p.id, campo: campoGeo(`Destino ${i + 1}`, { endereco: p.endereco, lat: p.lat, lng: p.lng }) }));
    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, campoColeta.wrap, ...pCampos.map(pc => pc.campo.wrap), el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:0' }, 'Digite e selecione um endereço da lista para geocodificar. Se não selecionar, o texto é re-geocodificado ao salvar.'));
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar');
    const ov = modal(`Editar — ${c.protocolo}`, corpo, [el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        const col = campoColeta.getValor();
        await put(`/entregas/${c.id}/enderecos`, {
          coleta: { endereco: col.endereco, lat: col.lat, lng: col.lng },
          pontos: pCampos.map(pc => { const v = pc.campo.getValor(); return { id: pc.id, endereco: v.endereco, lat: v.lat, lng: v.lng }; }),
        });
        ov.remove(); toast('Atualizado'); carregar();
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
        w.append(bAtr, botaoIcone(P.bolt, 'Atribuição automática', () => atribuirAuto(c)));
      }
      if (podeEditar) w.append(botaoIcone(P.edit, 'Editar endereços', () => abrirEditar(c)));
      w.append(botaoIcone(P.rota, 'Ver rota no mapa', () => abrirRota(c)));
      w.append(botaoIcone(P.x, 'Cancelar', () => abrirCancelar(c), 'var(--lx-erro)'));
    } else if (_aba === 'and') {
      w.append(botaoIcone(P.rota, 'Ver rota no mapa', () => abrirRota(c)));
      w.append(botaoIcone(P.mapa, 'Rastreio ao vivo', () => { location.hash = '/rastreio'; }));
      if (podeGerenciar) w.append(botaoIcone(P.troca, 'Trocar motoboy', () => abrirAtribuir(c, true)));
      if (podeEditar) { w.append(botaoIcone(P.edit, 'Editar', () => abrirEditar(c)), botaoIcone(P.check, 'Finalizar', () => abrirFinalizar(c), 'var(--lx-ok)')); }
      w.append(botaoIcone(P.x, 'Cancelar', () => abrirCancelar(c), 'var(--lx-erro)'));
    } else if (_aba === 'con') {
      w.append(botaoIcone(P.rota, 'Ver rota do GPS', () => abrirRota(c)));
      w.append(botaoIcone(P.file, 'Ver protocolo', () => abrirProtocolo(c)));
    } else {
      w.append(botaoIcone(P.rota, 'Ver rota', () => abrirRota(c)));
      w.append(botaoIcone(P.file, 'Ver detalhes', () => abrirProtocolo(c)));
    }
    return w;
  }
  // Coleta e destino empilhados (um abaixo do outro), endereço completo.
  function enderecoEmpilhado(c) {
    const ponto = (cor, rotulo, texto) => el('div', { style: 'display:flex;align-items:flex-start;gap:6px;min-width:0' },
      el('span', { style: `width:7px;height:7px;border-radius:2px;background:${cor};flex-shrink:0;margin-top:5px` }),
      el('span', { style: 'font-size:11px;color:var(--lx-tinta-3);font-weight:700;flex-shrink:0;width:14px;margin-top:1px' }, rotulo),
      el('span', { style: 'font-size:12px;color:var(--lx-tinta);line-height:1.4' }, texto || '—'));
    return el('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' },
      el('div', { style: 'font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px' }, c.loja_nome || '—'),
      ponto('var(--lx-azul-primario)', 'C', c.coleta_endereco),
      ponto('var(--lx-ok)', 'E', c.destino_endereco));
  }

  function linha(c) {
    const cols = _aba === 'sem' ? '88px 1.5fr 130px 130px 168px' : _aba === 'and' ? '88px 1.2fr 120px 80px 200px' : _aba === 'con' ? '88px 1.2fr 130px 60px 110px' : '88px 1.2fr 1.2fr 130px 90px';
    const dataHora = iso => { if (!iso) return '—'; const d = new Date(iso); return el('div', { style: 'display:flex;flex-direction:column;line-height:1.3' }, el('span', { style: 'font-size:12px;color:var(--lx-tinta);font-weight:600' }, d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: '2-digit' })), el('span', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }))); };
    const meio = _aba === 'sem'
      ? [enderecoEmpilhado(c), bussola(c.coleta_lat, c.coleta_lng, c.destino_lat, c.destino_lng), dataHora(c.criado_em)]
      : _aba === 'and'
      ? [el('div', { style: 'min-width:0' }, el('div', { style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.motoboy_nome ? '🏍 ' + (c.motoboy_codigo ? '#' + String(c.motoboy_codigo).padStart(3,'0') + ' ' : '') + c.motoboy_nome : 'sem motoboy')), statusBadge(c.status)]
      : _aba === 'con'
      ? [el('div', { style: 'min-width:0' }, el('div', { style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.motoboy_nome || '—')), dataHora(c.concluida_em)]
      : [el('div', { style: 'min-width:0' }, el('div', { style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.motoboy_nome || 'sem motoboy')),
         el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.coleta_endereco || '—')];
    const fim = _aba === 'con'
      ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, c.distancia_km && parseFloat(c.distancia_km) > 0 ? parseFloat(c.distancia_km).toFixed(1) : '—')
      : _aba === 'can'
      ? dataHora(c.criado_em)
      : _aba === 'sem' ? null  // 'sem' já tem dataHora no meio
      : dataHora(c.criado_em);
    const celulas = [el('div', { style: 'font-weight:700;font-size:13px;color:var(--lx-azul-primario)' }, c.protocolo), ...meio];
    if (fim) celulas.push(fim);
    celulas.push(acoes(c));
    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:10px;padding:11px 14px;align-items:center;border-bottom:0.5px solid var(--lx-linha);background:var(--lx-superficie)` }, ...celulas);
  }
  function cabecalho() {
    const cols = _aba === 'sem' ? '88px 1.5fr 130px 130px 168px' : _aba === 'and' ? '88px 1.2fr 120px 80px 200px' : _aba === 'con' ? '88px 1.2fr 130px 60px 110px' : '88px 1.2fr 1.2fr 130px 90px';
    const labels = _aba === 'sem' ? ['Protocolo', 'Trajeto', 'Direção', 'Solicitação', 'Ações'] : _aba === 'and' ? ['Protocolo', 'Loja / motoboy', 'Status', 'Tempo', 'Ações'] : _aba === 'con' ? ['Protocolo', 'Loja / motoboy', 'Concluída', 'KM', 'Ações'] : ['Protocolo', 'Loja / motoboy', 'Coleta', 'Cancelada', 'Ações'];
    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:10px;padding:8px 14px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;background:var(--lx-superficie-2);border-bottom:0.5px solid var(--lx-linha)` }, ...labels.map((l, i) => el('div', { style: i === labels.length - 1 ? 'text-align:right' : '' }, l)));
  }
  function listaDaAba() { return _aba === 'sem' ? _dados.semAssociacao : _aba === 'and' ? _dados.emAndamento : _aba === 'con' ? _dados.concluidas : _dados.canceladas; }
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
    renderTabela();
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
    }
    try { _dados = await get('/entregas/acompanhamento?' + params.toString()); render(); }
    catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); }
  }

  // Carrega lojas e cidades para os checkboxes.
  try { _lojas = await get('/lojas?ativo=true'); } catch { _lojas = []; }
  try { _cidades = await get('/entregas/acompanhamento/cidades'); } catch { _cidades = []; }
  preencherDrops(); atualizarBadge();

  const conteudo = el('div', {}, barraTopo, painel, avisoEl, abas, tabelaWrap);
  container.append(casca('Acompanhamento', conteudo, 'Todas as corridas, todas as lojas'));
  setAba('sem');
  carregar();

  const timer = setInterval(carregar, 30000);
  const obs = new MutationObserver(() => { if (!document.body.contains(container)) { clearInterval(timer); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
