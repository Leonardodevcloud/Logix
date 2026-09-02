import { casca } from '../core/layout.js';
import { el, icones } from '../core/ui.js';
import { get, post, put, del } from '../core/api.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;max-width:380px;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
function modal(titulo, corpo, acoes, larguraMax = '620px') {
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,16,32,.55);z-index:2500;display:flex;align-items:center;justify-content:center;padding:20px' });
  const card = el('div', { style: `background:var(--lx-superficie);border-radius:var(--lx-raio-lg);max-width:${larguraMax};width:100%;max-height:90vh;overflow:auto;box-shadow:var(--lx-sombra-lg)` },
    el('div', { style: 'padding:18px 22px;border-bottom:1px solid var(--lx-linha);font-size:16px;font-weight:800' }, titulo),
    el('div', { style: 'padding:22px' }, corpo),
    el('div', { style: 'padding:16px 22px;border-top:1px solid var(--lx-linha);display:flex;gap:10px;justify-content:flex-end' }, ...acoes));
  ov.append(card); ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov); return ov;
}
const ic = (k, cor) => el('span', { style: `display:inline-flex;color:${cor || 'var(--lx-tinta-2)'}`, html: icones[k] || '' });
const reais = (c) => 'R$ ' + (Number(c || 0) / 100).toFixed(2).replace('.', ',');
const centDe = (v) => { const s = String(v).replace(/[^\d,]/g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : Math.round(n * 100); };
const ST = {
  ativa: ['Ativa', 'var(--lx-ok)', 'var(--lx-ok-bg)'],
  rascunho: ['Rascunho', 'var(--lx-tinta-2)', '#eef2f7'],
  pausada: ['Pausada', 'var(--lx-atencao)', 'var(--lx-atencao-bg)'],
  encerrada: ['Encerrada', 'var(--lx-tinta-3)', '#eef2f7'],
};

const ABAS = [
  { id: 'metricas', rotulo: 'Métricas e pontos' },
  { id: 'niveis', rotulo: 'Níveis' },
  { id: 'campanhas', rotulo: 'Campanhas' },
  { id: 'premios', rotulo: 'Prêmios' },
  { id: 'config', rotulo: 'Config' },
];

export async function montar(container) {
  let cfg = { metricas: {}, niveis: [] };
  try { cfg = await get('/score/config'); } catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); }
  // Listas para os alvos (carregadas sob demanda).
  let lojas = null, motoboys = null;
  async function carregarListas() {
    if (!lojas) { try { const r = await get('/lojas'); lojas = (r.lojas || r || []).map(l => ({ id: l.id, nome: l.nome_fantasia || l.nome || l.razao_social || '—' })); } catch { lojas = []; } }
    if (!motoboys) { try { const r = await get('/motoboys'); motoboys = (r.motoboys || r || []).map(m => ({ id: m.id, nome: m.nome_completo || '—', codigo: m.codigo })); } catch { motoboys = []; } }
  }

  let aba = 'metricas';
  const painel = el('div', {});
  const nav = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:18px;flex-wrap:wrap' });
  function renderNav() {
    nav.innerHTML = '';
    ABAS.forEach((a) => {
      const on = a.id === aba;
      nav.append(el('button', {
        style: `background:none;border:none;padding:11px 15px;font-size:13px;font-weight:700;cursor:pointer;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px;display:flex;align-items:center;gap:7px`,
        onClick: () => { aba = a.id; render(); },
      }, a.rotulo, a.breve ? el('span', { style: 'font-size:9.5px;font-weight:800;background:#eef2f7;color:var(--lx-tinta-3);border-radius:99px;padding:2px 6px' }, 'em breve') : ''));
    });
  }

  // ───────────────── Métricas e pontos ─────────────────
  function abaMetricas() {
    const wrap = el('div', {});
    wrap.append(el('div', { style: 'display:flex;gap:9px;align-items:flex-start;background:var(--lx-info-bg);border:1px solid #cfe3fb;border-radius:11px;padding:11px 13px;font-size:12px;color:#1f4b78;margin-bottom:16px' },
      ic('sc_info', 'var(--lx-azul-primario)'),
      el('div', { html: 'Valores <b>padrão desta empresa</b>. As campanhas herdam daqui. Métricas com <b>⚡ em vigor</b> já entram no cálculo atual.' })));
    const linhas = {};
    function grupo(titulo, iconeKey, cor, chaves) {
      const box = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:12px;overflow:hidden;margin-bottom:16px' });
      box.append(el('div', { style: `display:flex;align-items:center;gap:7px;padding:10px 14px;background:var(--lx-superficie-2);font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:${cor}` }, ic(iconeKey, cor), titulo));
      chaves.forEach((k, i) => {
        const met = cfg.metricas[k] || {};
        const inp = el('input', { class: 'lx-input', value: (met.pontos != null ? met.pontos : ''), style: 'width:88px;text-align:center;font-weight:800' });
        const sw = el('input', { type: 'checkbox', ...(met.ativo !== false ? { checked: true } : {}) });
        linhas[k] = { inp, sw };
        box.append(el('div', { style: `display:grid;grid-template-columns:28px 1fr 96px 60px;align-items:center;gap:12px;padding:11px 14px;${i < chaves.length - 1 ? 'border-bottom:1px solid var(--lx-linha)' : ''}` },
          ic(met.icone || 'sc_check', 'var(--lx-tinta-2)'),
          el('div', {}, el('div', { style: 'font-size:13px;font-weight:700' }, met.rotulo || k, met.emVigor ? el('span', { style: 'font-size:9.5px;font-weight:800;color:var(--lx-ok);background:var(--lx-ok-bg);border-radius:6px;padding:2px 6px;margin-left:8px' }, '⚡ em vigor') : '')),
          inp, el('div', { style: 'display:flex;justify-content:flex-end' }, sw)));
      });
      return box;
    }
    const ganha = Object.keys(cfg.metricas).filter((k) => (cfg.metricas[k].grupo || 'ganha') === 'ganha');
    const perde = Object.keys(cfg.metricas).filter((k) => cfg.metricas[k].grupo === 'perde');
    wrap.append(grupo('Ganha pontos', 'sc_up', 'var(--lx-ok)', ganha), grupo('Perde pontos', 'sc_down', 'var(--lx-erro)', perde));
    wrap.append(el('div', { style: 'display:flex;gap:8px;align-items:flex-start;background:var(--lx-atencao-bg);border:1px solid #f0dca6;border-radius:9px;padding:9px 12px;font-size:11px;color:#8a5a00;margin-bottom:16px' },
      ic('sc_shield', 'var(--lx-atencao)'), el('div', {}, 'Guardrail fixo: nunca pontuar por velocidade — só pontualidade dentro do SLA.')));
    const btn = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const metricas = { ...cfg.metricas };
      for (const [k, { inp, sw }] of Object.entries(linhas)) metricas[k] = { ...metricas[k], pontos: parseInt(inp.value, 10) || 0, ativo: sw.checked };
      try { btn.disabled = true; await put('/score/config', { metricas, niveis: cfg.niveis }); cfg.metricas = metricas; toast('Métricas salvas'); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); } finally { btn.disabled = false; }
    } }, 'Salvar métricas e pontos');
    wrap.append(btn);
    return wrap;
  }

  // ───────────────── Níveis ─────────────────
  function abaNiveis() {
    const wrap = el('div', {});
    wrap.append(el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0 0 14px' }, 'Níveis e pontuação mínima de cada um (janela de 30 dias).'));
    const lista = el('div', {});
    let niveis = (cfg.niveis || []).map((n) => ({ ...n }));
    function renderNiveis() {
      lista.innerHTML = '';
      niveis.forEach((n, idx) => {
        const inNome = el('input', { class: 'lx-input', value: n.nome || '', style: 'flex:1' });
        const inMin = el('input', { class: 'lx-input', value: (n.min != null ? n.min : 0), style: 'width:120px;text-align:center' });
        inNome.addEventListener('input', () => n.nome = inNome.value);
        inMin.addEventListener('input', () => n.min = parseInt(inMin.value, 10) || 0);
        const rem = el('button', { class: 'lx-btn lx-btn-secundario', style: 'color:var(--lx-erro);padding:8px 12px', onClick: () => { niveis.splice(idx, 1); renderNiveis(); } }, '×');
        lista.append(el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:10px' }, ic('sc_medal', 'var(--lx-azul-primario)'), inNome, el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-3)' }, 'a partir de'), inMin, el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-3)' }, 'pts'), rem));
      });
    }
    renderNiveis();
    const add = el('button', { class: 'lx-btn lx-btn-secundario', style: 'margin-bottom:16px', onClick: () => { niveis.push({ nome: 'Novo nível', min: 0 }); renderNiveis(); } }, '+ Adicionar nível');
    const salvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const limpos = niveis.filter((n) => (n.nome || '').trim()).sort((a, b) => (a.min || 0) - (b.min || 0));
      try { salvar.disabled = true; await put('/score/config', { metricas: cfg.metricas, niveis: limpos }); cfg.niveis = limpos; toast('Níveis salvos'); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); } finally { salvar.disabled = false; }
    } }, 'Salvar níveis');
    wrap.append(lista, add, el('div', {}, salvar));
    return wrap;
  }

  // ───────────────── Campanhas ─────────────────
  function chipsAlvo(alvo) {
    const c = [];
    if (alvo.todos) c.push('Todos');
    if (alvo.novatos_dias) c.push('Novatos < ' + alvo.novatos_dias + 'd');
    if (Array.isArray(alvo.clientes) && alvo.clientes.length) c.push(alvo.clientes.length + ' cliente(s)');
    if (Array.isArray(alvo.motoboys) && alvo.motoboys.length) c.push(alvo.motoboys.length + ' entregador(es)');
    if (!c.length) c.push('Sem alvo');
    return c;
  }
  async function abaCampanhas() {
    const wrap = el('div', {});
    const topo = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px' },
      el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0' }, 'Missões com meta e bônus em R$. Rodam em paralelo; o alvo define quem participa.'),
      el('button', { class: 'lx-btn lx-btn-primario', onClick: () => abrirBuilder(null) }, '+ Nova campanha'));
    const lista = el('div', {});
    wrap.append(topo, lista);
    try {
      const r = await get('/score/campanhas');
      const cs = r.campanhas || [];
      if (!cs.length) lista.append(el('div', { style: 'text-align:center;padding:36px;color:var(--lx-tinta-3);font-size:13px' }, 'Nenhuma campanha ainda.'));
      cs.forEach((c) => {
        const s = ST[c.status] || ST.rascunho;
        const chips = chipsAlvo(c.alvo || {}).map(t => el('span', { style: 'font-size:11px;font-weight:700;background:var(--lx-superficie-2);border:1px solid var(--lx-linha);border-radius:8px;padding:3px 9px;color:var(--lx-tinta-2)' }, t));
        lista.append(el('div', { style: 'border:1px solid var(--lx-linha);border-radius:13px;padding:13px 15px;margin-bottom:11px' },
          el('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:8px' },
            el('span', { style: 'font-size:14px;font-weight:800' }, c.nome),
            el('span', { style: `margin-left:auto;font-size:10px;font-weight:800;border-radius:99px;padding:3px 9px;background:${s[2]};color:${s[1]}` }, s[0])),
          el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px' }, ...chips,
            el('span', { style: 'font-size:11px;font-weight:700;background:#eaf3fc;border:1px solid #cfe3fb;border-radius:8px;padding:3px 9px;color:var(--lx-azul-primario)' }, 'Meta ' + (c.meta && c.meta.qtd) + ' · ' + reais(c.premio && c.premio.valor_cent))),
          el('div', { style: 'display:flex;gap:8px' },
            el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:7px 12px', onClick: () => abrirBuilder(c) }, 'Editar'),
            el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:7px 12px', onClick: () => { aba = 'premios'; render(); setTimeout(() => selecionarPremio(c.id), 60); } }, 'Prêmios'),
            el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:7px 12px;color:var(--lx-erro)', onClick: async () => { if (!confirm('Excluir esta campanha?')) return; try { await del('/score/campanhas/' + c.id); toast('Excluída'); render(); } catch (e) { toast(e.message, 'erro'); } } }, 'Excluir'))));
      });
    } catch (e) { lista.append(el('div', { style: 'color:var(--lx-erro);font-size:13px' }, e.message || 'Erro ao carregar')); }
    return wrap;
  }

  async function abrirBuilder(existente) {
    await carregarListas();
    const d = existente || { alvo: { todos: true }, meta: { qtd: 30, sucesso_min: 0 }, premio: { valor_cent: 4000 }, status: 'rascunho' };
    const alvo = { todos: !!(d.alvo && d.alvo.todos), novatos_dias: (d.alvo && d.alvo.novatos_dias) || '', clientes: new Set((d.alvo && d.alvo.clientes) || []), motoboys: new Set((d.alvo && d.alvo.motoboys) || []) };

    const inNome = el('input', { class: 'lx-input', value: d.nome || '' });
    const selStatus = el('select', { class: 'lx-input' }, ...['rascunho', 'ativa', 'pausada', 'encerrada'].map(s => el('option', { value: s, ...(d.status === s ? { selected: true } : {}) }, ST[s][0])));
    const inQtd = el('input', { class: 'lx-input', value: (d.meta && d.meta.qtd) || 30, style: 'width:120px;text-align:center' });
    const inSuc = el('input', { class: 'lx-input', value: (d.meta && d.meta.sucesso_min) || 0, style: 'width:120px;text-align:center' });
    const inPremio = el('input', { class: 'lx-input', value: ((d.premio && d.premio.valor_cent || 0) / 100).toFixed(2).replace('.', ','), style: 'width:140px' });
    const inIni = el('input', { class: 'lx-input', type: 'date', value: d.inicio ? String(d.inicio).slice(0, 10) : '' });
    const inFim = el('input', { class: 'lx-input', type: 'date', value: d.fim ? String(d.fim).slice(0, 10) : '' });
    const chkExcl = el('input', { type: 'checkbox', ...(d.exclusivo ? { checked: true } : {}) });

    // Alvo
    const previaTxt = el('span', { style: 'font-size:12px;font-weight:700;color:var(--lx-azul-primario)' }, '');
    const rTodos = el('input', { type: 'radio', name: 'alvo', ...(alvo.todos ? { checked: true } : {}) });
    const rFiltrar = el('input', { type: 'radio', name: 'alvo', ...(!alvo.todos ? { checked: true } : {}) });
    const filtroBox = el('div', { style: 'border:1px dashed var(--lx-linha);border-radius:12px;padding:12px;margin-top:8px;' + (alvo.todos ? 'display:none' : '') });
    const inNov = el('input', { class: 'lx-input', value: alvo.novatos_dias, placeholder: 'ex: 30', style: 'width:120px' });
    const listaCli = el('div', { style: 'max-height:120px;overflow:auto;border:1px solid var(--lx-linha);border-radius:8px;padding:6px' });
    (lojas || []).forEach(l => { const cb = el('input', { type: 'checkbox', ...(alvo.clientes.has(l.id) ? { checked: true } : {}) }); cb.addEventListener('change', () => cb.checked ? alvo.clientes.add(l.id) : alvo.clientes.delete(l.id)); listaCli.append(el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:12.5px;padding:4px' }, cb, l.nome)); });
    const listaMb = el('div', { style: 'max-height:120px;overflow:auto;border:1px solid var(--lx-linha);border-radius:8px;padding:6px' });
    (motoboys || []).forEach(m => { const cb = el('input', { type: 'checkbox', ...(alvo.motoboys.has(m.id) ? { checked: true } : {}) }); cb.addEventListener('change', () => cb.checked ? alvo.motoboys.add(m.id) : alvo.motoboys.delete(m.id)); listaMb.append(el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:12.5px;padding:4px' }, cb, (m.codigo != null ? '#' + m.codigo + ' ' : '') + m.nome)); });
    inNov.addEventListener('input', () => alvo.novatos_dias = inNov.value);
    filtroBox.append(
      el('div', { style: 'font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:4px' }, 'Novatos (cadastro há até X dias)'), inNov,
      el('div', { style: 'font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin:10px 0 4px' }, 'Clientes (filtra as entregas que contam)'), listaCli,
      el('div', { style: 'font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin:10px 0 4px' }, 'Entregadores específicos'), listaMb);
    rTodos.addEventListener('change', () => { alvo.todos = true; filtroBox.style.display = 'none'; });
    rFiltrar.addEventListener('change', () => { alvo.todos = false; filtroBox.style.display = ''; });

    const montarAlvo = () => ({ todos: alvo.todos, novatos_dias: alvo.novatos_dias ? parseInt(alvo.novatos_dias, 10) : null, clientes: [...alvo.clientes], motoboys: [...alvo.motoboys] });
    const btnPrevia = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: async () => { try { const r = await post('/score/campanhas/previa', { alvo: montarAlvo() }); previaTxt.textContent = 'Atinge ' + r.total + ' entregador(es)'; } catch (e) { toast(e.message, 'erro'); } } }, 'Ver quantos atinge');

    const campo = (rot, node) => el('div', { style: 'margin-bottom:12px' }, el('label', { style: 'display:block;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:5px' }, rot), node);
    const corpo = el('div', {},
      campo('Nome da campanha', inNome),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, campo('Status', selStatus), campo('Prêmio (R$)', inPremio)),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, campo('Meta (nº de entregas)', inQtd), campo('Sucesso mínimo (%)', inSuc)),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, campo('Início', inIni), campo('Fim', inFim)),
      el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:12.5px;margin-bottom:12px' }, chkExcl, 'Grupo exclusivo (não soma com outras — vale a de maior prioridade)'),
      el('div', { style: 'font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--lx-tinta-3);margin-bottom:8px' }, 'Quem participa'),
      el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:6px' }, rTodos, 'Todos os entregadores'),
      el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px' }, rFiltrar, 'Filtrar'),
      filtroBox,
      el('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:10px' }, btnPrevia, previaTxt));

    const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario' }, existente ? 'Salvar' : 'Criar campanha');
    const ov = modal(existente ? 'Editar campanha' : 'Nova campanha', corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btnSalvar]);
    btnSalvar.onclick = async () => {
      const dados = { nome: inNome.value, status: selStatus.value, alvo: montarAlvo(), meta: { qtd: parseInt(inQtd.value, 10) || 1, sucesso_min: parseInt(inSuc.value, 10) || 0 }, premio: { valor_cent: centDe(inPremio.value) }, inicio: inIni.value || null, fim: inFim.value || null, exclusivo: chkExcl.checked };
      try { btnSalvar.disabled = true; if (existente) await put('/score/campanhas/' + existente.id, dados); else await post('/score/campanhas', dados); toast('Campanha salva'); ov.remove(); render(); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); btnSalvar.disabled = false; }
    };
  }

  // ───────────────── Prêmios ─────────────────
  let premioSel = null;
  function selecionarPremio(id) { premioSel = id; if (aba === 'premios') render(); }
  async function abaPremios() {
    const wrap = el('div', {});
    let campanhas = [];
    try { campanhas = (await get('/score/campanhas')).campanhas || []; } catch (e) { wrap.append(el('div', { style: 'color:var(--lx-erro)' }, e.message)); return wrap; }
    const missoes = campanhas.filter(c => c.tipo === 'missao');
    if (!missoes.length) { wrap.append(el('div', { style: 'text-align:center;padding:36px;color:var(--lx-tinta-3);font-size:13px' }, 'Crie uma campanha na aba Campanhas primeiro.')); return wrap; }
    if (!premioSel || !missoes.find(m => m.id === premioSel)) premioSel = missoes[0].id;

    const sel = el('select', { class: 'lx-input', style: 'max-width:360px', onChange: (e) => { premioSel = e.target.value; render(); } },
      ...missoes.map(m => el('option', { value: m.id, ...(m.id === premioSel ? { selected: true } : {}) }, m.nome + ' · ' + (ST[m.status] ? ST[m.status][0] : m.status))));
    wrap.append(el('div', { style: 'margin-bottom:16px' }, el('label', { style: 'display:block;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:5px' }, 'Campanha'), sel));

    const alvoBox = el('div', {});
    wrap.append(alvoBox);
    try {
      const r = await get('/score/campanhas/' + premioSel + '/avaliar');
      alvoBox.append(el('div', { style: 'display:flex;gap:9px;align-items:center;background:var(--lx-info-bg);border:1px solid #cfe3fb;border-radius:11px;padding:11px 13px;font-size:12px;color:#1f4b78;margin-bottom:14px' },
        ic('sc_info', 'var(--lx-azul-primario)'),
        el('div', { html: `Meta: <b>${r.campanha.meta.qtd}</b> entregas · bônus <b>${reais(r.valor_cent)}</b>. Pagar cria um crédito no Financeiro (não paga duas vezes).` })));
      if (!r.candidatos.length) { alvoBox.append(el('div', { style: 'text-align:center;padding:24px;color:var(--lx-tinta-3)' }, 'Nenhum entregador no alvo desta campanha.')); return wrap; }
      const tbl = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:12px;overflow:hidden' });
      tbl.append(el('div', { style: 'display:grid;grid-template-columns:1fr 90px 120px;gap:10px;padding:10px 14px;background:var(--lx-superficie-2);font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--lx-tinta-3)' }, el('span', {}, 'Entregador'), el('span', { style: 'text-align:center' }, 'Progresso'), el('span', { style: 'text-align:right' }, 'Bônus')));
      r.candidatos.forEach((c, i) => {
        let acao;
        if (c.jaPago) acao = el('span', { style: 'font-size:11px;font-weight:800;color:var(--lx-ok);text-align:right' }, '✓ pago');
        else if (c.completo) {
          const b = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12px;padding:7px 12px' }, 'Pagar');
          b.onclick = async () => { if (!confirm(`Pagar ${reais(r.valor_cent)} para ${c.nome}?`)) return; try { b.disabled = true; await post('/score/campanhas/' + premioSel + '/liberar', { motoboy_id: c.motoboy_id }); toast('Bônus liberado'); render(); } catch (e) { toast(e.message || 'Erro', 'erro'); b.disabled = false; } };
          acao = b;
        } else acao = el('span', { style: 'font-size:11px;color:var(--lx-tinta-3);text-align:right' }, 'faltam ' + Math.max(0, c.meta - c.entregues));
        tbl.append(el('div', { style: `display:grid;grid-template-columns:1fr 90px 120px;gap:10px;align-items:center;padding:11px 14px;${i < r.candidatos.length - 1 ? 'border-bottom:1px solid var(--lx-linha)' : ''}` },
          el('div', { style: 'font-size:13px;font-weight:700' }, (c.codigo != null ? '#' + c.codigo + ' ' : '') + c.nome),
          el('div', { style: `text-align:center;font-size:12.5px;font-weight:800;color:${c.completo ? 'var(--lx-ok)' : 'var(--lx-tinta-2)'}` }, c.entregues + '/' + c.meta),
          el('div', { style: 'display:flex;justify-content:flex-end' }, acao)));
      });
      alvoBox.append(tbl);
    } catch (e) { alvoBox.append(el('div', { style: 'color:var(--lx-erro)' }, e.message || 'Erro ao avaliar')); }
    return wrap;
  }

  function abaConfig() {
    const c = cfg.config || {};
    const wrap = el('div', {});
    const inNome = el('input', { class: 'lx-input', value: c.nome_programa || '', placeholder: 'Ex.: Clube do Entregador' });
    const inJanela = el('input', { class: 'lx-input', value: (c.janela_dias != null ? c.janela_dias : 30), style: 'width:120px;text-align:center' });
    const chkRank = el('input', { type: 'checkbox', ...(c.ranking_ativo !== false ? { checked: true } : {}) });
    const chkAtivo = el('input', { type: 'checkbox', ...(c.gamificacao_ativa !== false ? { checked: true } : {}) });
    const campo = (rot, node, dica) => el('div', { style: 'margin-bottom:16px' },
      el('label', { style: 'display:block;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:5px' }, rot),
      node, dica ? el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:4px' }, dica) : '');
    wrap.append(
      campo('Nome do programa (opcional)', inNome, 'Aparece pro entregador. Deixe vazio para "Score e metas".'),
      campo('Janela do score (dias)', inJanela, 'Período que conta para o nível e os pontos (padrão 30 dias).'),
      el('label', { style: 'display:flex;gap:9px;align-items:center;font-size:13px;margin-bottom:12px' }, chkRank, 'Mostrar o ranking semanal para o entregador'),
      el('label', { style: 'display:flex;gap:9px;align-items:center;font-size:13px;margin-bottom:18px' }, chkAtivo, 'Gamificação ativa nesta empresa'));
    const btn = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const config = { nome_programa: inNome.value.trim(), janela_dias: parseInt(inJanela.value, 10) || 30, ranking_ativo: chkRank.checked, gamificacao_ativa: chkAtivo.checked };
      try { btn.disabled = true; await put('/score/config', { metricas: cfg.metricas, niveis: cfg.niveis, config }); cfg.config = config; toast('Config salva'); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); } finally { btn.disabled = false; }
    } }, 'Salvar config');
    wrap.append(btn);
    return wrap;
  }

  function abaBreve(nome) {
    return el('div', { style: 'text-align:center;padding:48px 20px;color:var(--lx-tinta-3)' },
      el('div', { style: 'display:inline-flex;color:var(--lx-tinta-3);margin-bottom:10px', html: icones.gamificacao }),
      el('div', { style: 'font-size:15px;font-weight:700;color:var(--lx-tinta-2)' }, nome + ' — em breve'),
      el('p', { style: 'font-size:12.5px;max-width:420px;margin:8px auto 0;line-height:1.5' }, 'Ranking/ligas + prioridade na fila chegam na Fase 3.'));
  }

  async function render() {
    renderNav();
    painel.innerHTML = '';
    if (aba === 'metricas') painel.append(abaMetricas());
    else if (aba === 'niveis') painel.append(abaNiveis());
    else if (aba === 'campanhas') painel.append(await abaCampanhas());
    else if (aba === 'premios') painel.append(await abaPremios());
    else painel.append(abaConfig());
  }
  await render();

  const conteudo = el('div', { class: 'lx-card', style: 'padding:22px;max-width:860px' }, nav, painel);
  container.append(casca('Gamificação', conteudo, 'Score, níveis, campanhas e prêmios — configuração desta operação.'));
}
