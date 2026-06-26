import { casca } from '../core/layout.js';
import { el, icones, statusBadge, estadoVazio, campo } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import * as auth from '../core/auth.js';

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
    corpo,
    el('div', { style: 'display:flex;gap:10px;margin-top:18px;justify-content:flex-end' }, ...acoes));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

const fmtHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtHaQuanto = iso => {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 ? ' ' + (min % 60) + 'min' : ''}`;
};

export async function montar(container) {
  const podeGerenciar = auth.pode('filas.gerenciar');
  const podeEditar = auth.pode('entregas.editar');

  let _dados = { semAssociacao: [], emAndamento: [], concluidas: [], totais: {} };
  let _lojas = [];
  let _motoboys = [];
  const filtros = { loja_id: '', q: '', regiao: '', periodo: 'hoje' };

  // ── Filtros ─────────────────────────────────────────────────────
  const selLoja = el('select', { class: 'lx-input', style: 'min-width:150px', onChange: () => { filtros.loja_id = selLoja.value; carregar(); } });
  const selPeriodo = el('select', { class: 'lx-input', style: 'min-width:120px', onChange: () => { filtros.periodo = selPeriodo.value; carregar(); } },
    el('option', { value: 'hoje' }, 'Hoje'),
    el('option', { value: '7d' }, 'Últimos 7 dias'),
    el('option', { value: '30d' }, 'Últimos 30 dias'),
    el('option', { value: 'tudo' }, 'Tudo'));
  const inpRegiao = el('input', { class: 'lx-input', placeholder: 'Região / bairro', style: 'min-width:130px' });
  const inpBusca = el('input', { class: 'lx-input', placeholder: 'Protocolo, NF…', style: 'min-width:150px' });
  let _debounce;
  const debounced = () => { clearTimeout(_debounce); _debounce = setTimeout(() => { filtros.q = inpBusca.value.trim(); filtros.regiao = inpRegiao.value.trim(); carregar(); }, 400); };
  inpBusca.addEventListener('input', debounced);
  inpRegiao.addEventListener('input', debounced);

  const barraFiltros = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:10px 12px;margin-bottom:14px' },
    selPeriodo,
    el('span', { style: 'display:flex;align-items:center;gap:5px' }, inpRegiao),
    selLoja,
    el('span', { style: 'flex:1' }),
    inpBusca);

  // ── KPIs ────────────────────────────────────────────────────────
  const kpiSem = el('div', { style: 'font-size:24px;font-weight:700;color:var(--lx-erro)' }, '0');
  const kpiAnd = el('div', { style: 'font-size:24px;font-weight:700;color:var(--lx-azul-primario)' }, '0');
  const kpiCon = el('div', { style: 'font-size:24px;font-weight:700;color:var(--lx-ok)' }, '0');
  function kpiCard(label, valEl) {
    return el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio);padding:12px 14px;flex:1;min-width:130px' },
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, label), valEl);
  }
  const kpis = el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px' },
    kpiCard('Sem associação', kpiSem), kpiCard('Em andamento', kpiAnd), kpiCard('Concluídas', kpiCon));

  // ── Containers das seções ───────────────────────────────────────
  const secSem = el('div', {});
  const secAnd = el('div', {});
  const secCon = el('div', {});

  // ── Ações ───────────────────────────────────────────────────────
  async function abrirAtribuir(corrida, troca = false) {
    if (!_motoboys.length) {
      try { _motoboys = await get('/filas/motoboys-ativos'); } catch { toast('Erro ao carregar motoboys', 'erro'); return; }
    }
    const sel = el('select', { class: 'lx-input' },
      ..._motoboys.map(m => el('option', { value: m.id }, `${m.nome_completo} ${m.online ? '🟢' : '⚪'} (${m.carga} ativas)`)));
    const corpo = el('div', {}, campo(troca ? 'Novo motoboy' : 'Motoboy', sel),
      el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:8px 0 0' }, '🟢 online · ⚪ offline'));
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, troca ? 'Trocar' : 'Atribuir');
    const ov = modal(troca ? `Trocar motoboy — ${corrida.protocolo}` : `Atribuir — ${corrida.protocolo}`, corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        const rota = troca ? `/filas/${corrida.id}/reatribuir` : `/filas/${corrida.id}/atribuir`;
        await post(rota, { motoboy_id: sel.value });
        ov.remove(); toast(troca ? 'Motoboy trocado' : 'Motoboy atribuído'); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }

  async function atribuirAuto(corrida) {
    try { await post(`/filas/${corrida.id}/atribuir-auto`, {}); toast('Atribuído automaticamente'); carregar(); }
    catch (e) { toast(e.message || 'Sem motoboy disponível', 'erro'); }
  }

  function abrirCancelar(corrida) {
    const motivo = el('textarea', { class: 'lx-input', rows: 3, placeholder: 'Motivo do cancelamento (opcional)' });
    const corpo = el('div', {}, campo('Motivo', motivo));
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-erro)' }, 'Cancelar corrida');
    const ov = modal(`Cancelar — ${corrida.protocolo}`, corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => {
      try { btn.disabled = true; await patch(`/entregas/${corrida.id}/cancelar`, { motivo: motivo.value.trim() || null }); ov.remove(); toast('Corrida cancelada'); carregar(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }

  function abrirFinalizar(corrida) {
    const corpo = el('div', {}, el('p', { style: 'font-size:14px;color:var(--lx-tinta)' }, `Finalizar a corrida ${corrida.protocolo} manualmente? Todos os pontos serão marcados como entregues.`));
    const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-ok)' }, 'Finalizar');
    const ov = modal('Finalizar corrida', corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Voltar'), btn]);
    btn.onclick = async () => {
      try { btn.disabled = true; await patch(`/entregas/${corrida.id}/finalizar`, {}); ov.remove(); toast('Corrida finalizada'); carregar(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }

  async function abrirEditar(corrida) {
    let detalhe;
    try { detalhe = await get('/entregas/' + corrida.id + '/detalhe'); }
    catch { toast('Erro ao carregar a corrida', 'erro'); return; }
    const inpColeta = el('input', { class: 'lx-input', value: detalhe.coleta_endereco || '' });
    const pontoInputs = (detalhe.pontos || []).map(p => ({ id: p.id, input: el('input', { class: 'lx-input', value: p.endereco || '' }) }));
    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      campo('Endereço de coleta', inpColeta),
      ...pontoInputs.map((pi, i) => campo(`Destino ${i + 1}`, pi.input)),
      el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:0' }, 'Os endereços alterados serão re-geocodificados automaticamente.'));
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar');
    const ov = modal(`Editar endereços — ${corrida.protocolo}`, corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn]);
    btn.onclick = async () => {
      try {
        btn.disabled = true;
        await put(`/entregas/${corrida.id}/enderecos`, {
          coleta: { endereco: inpColeta.value.trim() },
          pontos: pontoInputs.map(pi => ({ id: pi.id, endereco: pi.input.value.trim() })),
        });
        ov.remove(); toast('Endereços atualizados'); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }

  function abrirProtocolo(corrida) {
    const base = window.LOGIX_API || '/api/v1';
    window.open(`${base}/entregas/${corrida.id}/protocolo`, '_blank');
  }
  function rastrear(corrida) {
    location.hash = '/rastreio';
  }

  // Menu de ações (dropdown simples via modal de opções)
  function menuAcoes(corrida, seq) {
    const opcoes = [];
    if (seq === 'sem' && podeGerenciar) {
      opcoes.push(['Atribuir motoboy', 'user-plus', () => abrirAtribuir(corrida)]);
      opcoes.push(['Atribuição automática', 'bolt', () => atribuirAuto(corrida)]);
    }
    if (seq === 'and' && podeGerenciar) {
      opcoes.push(['Trocar motoboy', 'switch', () => abrirAtribuir(corrida, true)]);
    }
    if (seq !== 'con' && podeEditar) {
      opcoes.push(['Editar endereços', 'edit', () => abrirEditar(corrida)]);
      opcoes.push(['Finalizar manualmente', 'check', () => abrirFinalizar(corrida)]);
    }
    opcoes.push(['Imprimir protocolo', 'file', () => abrirProtocolo(corrida)]);
    if (seq !== 'con') opcoes.push(['Cancelar corrida', 'x', () => abrirCancelar(corrida), true]);

    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      ...opcoes.map(([rotulo, , fn, perigo]) =>
        el('button', { class: 'lx-btn lx-btn-secundario', style: `justify-content:flex-start;${perigo ? 'color:var(--lx-erro)' : ''}`, onClick: () => { ov.remove(); fn(); } }, rotulo)));
    const ov = modal(corrida.protocolo, corpo, []);
  }

  // ── Render de linha ─────────────────────────────────────────────
  function linha(c, seq) {
    const cols = seq === 'sem'
      ? '90px 1fr 1fr 110px 130px'
      : seq === 'and' ? '90px 1fr 110px 90px 110px' : '90px 1fr 90px 70px 110px';

    const acoesEl = el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' });
    if (seq === 'sem' && podeGerenciar)
      acoesEl.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px;color:var(--lx-azul-primario)', onClick: () => abrirAtribuir(c) }, 'atribuir'));
    if (seq === 'and')
      acoesEl.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 8px;font-size:12px', onClick: () => rastrear(c), title: 'Rastrear' }, '📍'));
    if (seq === 'con')
      acoesEl.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 8px;font-size:12px', onClick: () => abrirProtocolo(c), title: 'Protocolo' }, '📄'));
    acoesEl.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 8px;font-size:12px', onClick: () => menuAcoes(c, seq), title: 'Mais ações' }, '⋯'));

    const colMeio = seq === 'sem'
      ? [el('div', {}, el('div', { style: 'font-size:13px;font-weight:700' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, c.coleta_endereco || '—')),
         el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, c.destino_endereco || '—')]
      : [el('div', {}, el('div', { style: 'font-size:13px;font-weight:700' }, c.loja_nome || '—'), el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, c.motoboy_nome ? '🏍 ' + c.motoboy_nome : 'sem motoboy')),
         seq === 'and' ? statusBadge(c.status) : el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, fmtHora(c.concluida_em))];

    const colFim = seq === 'sem'
      ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, fmtHaQuanto(c.criado_em))
      : seq === 'and' ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, fmtHaQuanto(c.criado_em))
      : el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, c.distancia_km && parseFloat(c.distancia_km) > 0 ? parseFloat(c.distancia_km).toFixed(1) : '—');

    return el('div', { style: `display:grid;grid-template-columns:${cols};gap:10px;padding:11px 14px;align-items:center;border-bottom:0.5px solid var(--lx-linha)` },
      el('div', { style: 'font-weight:700;font-size:13px' }, c.protocolo),
      ...colMeio, colFim, acoesEl);
  }

  function renderSecao(container, lista, seq, titulo, cor, iconeChar) {
    container.innerHTML = '';
    const head = el('div', { style: 'display:flex;align-items:center;gap:8px;margin:0 0 10px' },
      el('span', { style: `font-size:18px` }, iconeChar),
      el('b', { style: 'font-size:15px' }, titulo),
      el('span', { style: `font-size:12px;color:${cor};background:var(--lx-superficie-2);padding:2px 8px;border-radius:10px` }, String(lista.length)));
    container.append(head);
    if (!lista.length) {
      container.append(el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:30px;text-align:center;color:var(--lx-tinta-2);font-size:13px;margin-bottom:20px' }, 'Nenhuma corrida nesta seção.'));
      return;
    }
    const tabela = el('div', { style: `background:var(--lx-superficie);border:0.5px solid ${seq === 'sem' ? 'var(--lx-erro)' : 'var(--lx-linha)'};border-radius:var(--lx-raio-lg);overflow:hidden;margin-bottom:20px` });
    lista.forEach(c => tabela.append(linha(c, seq)));
    container.append(tabela);
  }

  function render() {
    kpiSem.textContent = String(_dados.totais.semAssociacao || 0);
    kpiAnd.textContent = String(_dados.totais.emAndamento || 0);
    kpiCon.textContent = String(_dados.totais.concluidas || 0);
    renderSecao(secSem, _dados.semAssociacao, 'sem', 'Sem associação', 'var(--lx-erro)', '⚠️');
    renderSecao(secAnd, _dados.emAndamento, 'and', 'Em andamento', 'var(--lx-azul-primario)', '🏍');
    renderSecao(secCon, _dados.concluidas, 'con', 'Concluídas', 'var(--lx-ok)', '✓');
  }

  // ── Carregamento ────────────────────────────────────────────────
  function periodoParaDatas() {
    const agora = new Date();
    if (filtros.periodo === 'tudo') return {};
    if (filtros.periodo === 'hoje') {
      const de = new Date(agora); de.setHours(0, 0, 0, 0);
      return { de: de.toISOString() };
    }
    const dias = filtros.periodo === '7d' ? 7 : 30;
    const de = new Date(agora.getTime() - dias * 86400000);
    return { de: de.toISOString() };
  }

  async function carregar() {
    const params = new URLSearchParams();
    const { de, ate } = periodoParaDatas();
    if (de) params.set('de', de);
    if (ate) params.set('ate', ate);
    if (filtros.loja_id) params.set('loja_id', filtros.loja_id);
    if (filtros.q) params.set('q', filtros.q);
    if (filtros.regiao) params.set('regiao', filtros.regiao);
    try {
      _dados = await get('/entregas/acompanhamento?' + params.toString());
      render();
    } catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); }
  }

  // Carrega lojas para o filtro (só central enxerga várias).
  try {
    _lojas = await get('/lojas?ativo=true');
    selLoja.append(el('option', { value: '' }, 'Todas as lojas'));
    _lojas.forEach(l => selLoja.append(el('option', { value: l.id }, l.nome_fantasia)));
  } catch { selLoja.append(el('option', { value: '' }, 'Todas as lojas')); }

  const conteudo = el('div', {}, barraFiltros, kpis, secSem, secAnd, secCon);
  container.append(casca('Acompanhamento', conteudo, 'Todas as corridas, todas as lojas — em tempo real'));
  carregar();

  // Auto-refresh a cada 30s
  const timer = setInterval(carregar, 30000);
  // Limpa o timer quando o container sai do DOM (troca de rota)
  const obs = new MutationObserver(() => { if (!document.body.contains(container)) { clearInterval(timer); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
