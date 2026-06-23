import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, statusBadge, campo } from '../core/ui.js';
import { get, post, patch } from '../core/api.js';
import * as auth from '../core/auth.js';

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
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:28px;width:420px;max-width:95vw;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
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

function miniMapa() {
  return el('div', { style: 'position:relative;border-radius:var(--lx-raio);overflow:hidden;background:linear-gradient(135deg,#eaf2fb,#dbe9f7);height:100%;min-height:360px' },
    el('div', { html: `<svg viewBox="0 0 600 460" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%;position:absolute;top:0;left:0">
      <rect width="600" height="460" fill="#e3eefb"/>
      <g stroke="#cfe0f3" stroke-width="2"><path d="M0 120 H600 M0 260 H600 M0 370 H600 M150 0 V460 M330 0 V460 M470 0 V460"/></g>
      <g fill="#d4e4f6"><rect x="60" y="40" width="120" height="60" rx="5"/><rect x="360" y="150" width="130" height="80" rx="5"/><rect x="180" y="300" width="110" height="60" rx="5"/></g>
      <path d="M110 90 C200 140 230 200 330 200 S470 260 470 320 460 400 250 400" fill="none" stroke="var(--lx-azul-primario)" stroke-width="4" stroke-dasharray="1 10" stroke-linecap="round"/>
      <g><circle cx="110" cy="90" r="16" fill="var(--lx-azul-profundo)"/><text x="110" y="96" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">C</text></g>
      <g><circle cx="330" cy="200" r="15" fill="var(--lx-azul-primario)"/><text x="330" y="205" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">1</text></g>
      <g><circle cx="250" cy="400" r="15" fill="var(--lx-azul-primario)"/><text x="250" y="405" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">2</text></g>
    </svg>` }),
    el('div', { style: 'position:absolute;left:14px;bottom:14px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border:1px solid var(--lx-linha);border-radius:11px;padding:10px 13px;font-size:11.5px;display:flex;flex-direction:column;gap:7px;box-shadow:var(--lx-sombra-sm)' },
      el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
        el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-azul-profundo);display:inline-block' }), 'Coleta'),
      el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
        el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-azul-primario);display:inline-block' }), 'Destinos')));
}

function formNova(aoCriar) {
  const coleta  = el('input', { class: 'lx-input', placeholder: 'Rua, número, bairro — cidade' });
  const destino = el('input', { class: 'lx-input', placeholder: 'Rua, número, bairro — cidade' });
  const modoAuto = { val: true };
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.entregas }), 'Criar entrega');

  const btnAuto = el('div', { style: 'flex:1;border:1.5px solid var(--lx-azul-vivo);background:var(--lx-info-bg);border-radius:11px;padding:12px;cursor:pointer', onClick: () => { modoAuto.val = true; btnAuto.style.borderColor='var(--lx-azul-vivo)'; btnAuto.style.background='var(--lx-info-bg)'; btnManual.style.borderColor='var(--lx-linha)'; btnManual.style.background=''; } },
    el('b', { style: 'font-size:13px' }, 'Automático'),
    el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:4px' }, 'Motoboy mais próximo'));
  const btnManual = el('div', { style: 'flex:1;border:1.5px solid var(--lx-linha);border-radius:11px;padding:12px;cursor:pointer', onClick: () => { modoAuto.val = false; btnManual.style.borderColor='var(--lx-azul-vivo)'; btnManual.style.background='var(--lx-info-bg)'; btnAuto.style.borderColor='var(--lx-linha)'; btnAuto.style.background=''; } },
    el('b', { style: 'font-size:13px' }, 'Manual'),
    el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:4px' }, 'Atribuir depois'));

  async function criar() {
    if (!coleta.value.trim() || !destino.value.trim()) { msg.style.color='var(--lx-erro)'; msg.textContent='Preencha coleta e destino.'; return; }
    botao.disabled = true; msg.style.color='var(--lx-tinta-2)'; msg.textContent='Geocodificando…';
    try {
      const r = await post('/entregas', { coleta: { endereco: coleta.value.trim() }, destinos: [{ endereco: destino.value.trim() }] });
      msg.style.color='var(--lx-ok)'; msg.textContent='Entrega lançada: ' + (r.protocolo || '');
      coleta.value = destino.value = '';
      aoCriar();
    } catch (e) { msg.style.color='var(--lx-erro)'; msg.textContent=e.message; }
    finally { botao.disabled = false; }
  }

  return el('div', { style: 'display:flex;gap:18px;align-items:stretch' },
    el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:14px' },
      el('div', { class: 'lx-card lx-card-pad' },
        el('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:12px' },
          el('div', { class: 'lx-stop-num coleta' }, 'C'), el('b', {}, 'Ponto de coleta')),
        campo('Endereço', coleta)),
      el('div', { class: 'lx-card lx-card-pad' },
        el('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:12px' },
          el('div', { class: 'lx-stop-num' }, '1'), el('b', {}, 'Destino')),
        campo('Endereço', destino)),
      el('div', { class: 'lx-card lx-card-pad' },
        el('b', { style: 'display:block;margin-bottom:12px' }, 'Atribuir motoboy'),
        el('div', { style: 'display:flex;gap:10px;margin-bottom:14px' }, btnAuto, btnManual),
        botao, el('div', { style: 'margin-top:8px' }, msg))),
    el('div', { style: 'flex:1.1;min-width:0' },
      el('div', { class: 'lx-card', style: 'overflow:hidden;height:100%;display:flex;flex-direction:column' },
        el('div', { style: 'padding:13px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between' },
          el('b', { style: 'font-size:13px' }, 'Rota sugerida'),
          el('span', { class: 'lx-chip lx-chip-on', style: 'font-size:12px' }, 'Menor tempo')),
        el('div', { style: 'flex:1' }, miniMapa()),
        el('div', { style: 'display:flex;border-top:1px solid var(--lx-linha)' },
          el('div', { style: 'flex:1;padding:13px;text-align:center;border-right:1px solid var(--lx-linha)' },
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Distância'), el('div', { style: 'font-weight:700;font-size:18px' }, '—')),
          el('div', { style: 'flex:1;padding:13px;text-align:center;border-right:1px solid var(--lx-linha)' },
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Tempo est.'), el('div', { style: 'font-weight:700;font-size:18px' }, '—')),
          el('div', { style: 'flex:1;padding:13px;text-align:center' },
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Paradas'), el('div', { style: 'font-weight:700;font-size:18px' }, '1'))))));
}

function podeCancelar(status) {
  return !['entregue', 'cancelada'].includes(status);
}

export async function montar(container) {
  const filtro = { val: 'todas' };
  let _entregas = [];

  const resumo = el('span', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-left:auto' }, '');
  const tabTodas    = el('button', { class: 'lx-chip lx-chip-on', onClick: () => setFiltro('todas') }, 'Todas');
  const tabAtivas   = el('button', { class: 'lx-chip', onClick: () => setFiltro('ativas') }, 'Em andamento');
  const tabFila     = el('button', { class: 'lx-chip', onClick: () => setFiltro('fila') }, 'Na fila');
  const tabConcluidas = el('button', { class: 'lx-chip', onClick: () => setFiltro('concluidas') }, 'Concluídas');
  const tabCanceladas = el('button', { class: 'lx-chip', onClick: () => setFiltro('canceladas') }, 'Canceladas');

  function setFiltro(f) {
    filtro.val = f;
    [tabTodas, tabAtivas, tabFila, tabConcluidas, tabCanceladas].forEach(t => t.classList.remove('lx-chip-on'));
    ({ todas: tabTodas, ativas: tabAtivas, fila: tabFila, concluidas: tabConcluidas, canceladas: tabCanceladas })[f].classList.add('lx-chip-on');
    renderTabela();
  }

  const tabBody = el('div', { style: 'padding:6px 8px' });

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
        el('th', {}, 'Protocolo'), el('th', {}, 'Status'), el('th', {}, 'Motoboy'),
        el('th', {}, 'Distância'), el('th', {}, 'Criada'), el('th', { style: 'text-align:right' }, 'Ações'))),
      tbody));
  }

  function linhaEntrega(e) {
    const acoes = [];
    if (auth.pode('entregas.criar') && podeCancelar(e.status)) {
      acoes.push(el('button', { class: 'lx-btn', style: 'font-size:12px;background:var(--lx-erro-bg);color:var(--lx-erro)', onClick: () => confirmarCancelar(e) }, 'Cancelar'));
    }
    return el('tr', {},
      el('td', {}, el('b', { style: 'font-size:13px' }, e.protocolo || '—')),
      el('td', {}, statusBadge(e.status)),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, e.motoboy_nome || el('span', { style: 'color:var(--lx-tinta-3)' }, 'Sem motoboy')),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, e.distancia_km != null ? Number(e.distancia_km).toFixed(1) + ' km' : '—'),
      el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtData(e.criado_em)),
      el('td', { style: 'text-align:right' }, ...acoes));
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
    const overlay = modal('Cancelar entrega',
      el('div', {},
        el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;margin-bottom:12px' },
          `Cancelar a entrega ${e.protocolo}? Esta ação não pode ser desfeita.`),
        campo('Motivo (opcional)', motivo)),
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
      resumo.textContent = `${ativas} em andamento · ${fila} na fila · ${concluidas} concluídas`;
      tabAtivas.textContent    = `Em andamento · ${ativas}`;
      tabFila.textContent      = `Na fila · ${fila}`;
      tabConcluidas.textContent = `Concluídas · ${concluidas}`;
      renderTabela();
    } catch (err) {
      tabBody.innerHTML = '';
      tabBody.append(el('div', { style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro: ' + err.message));
    }
  }

  const lista = el('div', { class: 'lx-card', style: 'overflow:hidden' },
    el('div', { style: 'padding:12px 16px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--lx-linha);flex-wrap:wrap' },
      tabTodas, tabAtivas, tabFila, tabConcluidas, tabCanceladas, resumo),
    tabBody);

  const filhos = [];
  if (auth.pode('entregas.criar')) filhos.push(secHeader('Lançar nova entrega'), formNova(carregar));
  filhos.push(secHeader('Histórico'), lista);

  container.append(casca('Entregas', el('div', {}, ...filhos),
    'Cadastre a coleta e os destinos — a rota é otimizada automaticamente'));
  carregar();
}
