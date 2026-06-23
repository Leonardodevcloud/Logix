import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, statusBadge, campo } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Mini-mapa vetorial de rota (coleta → destino)
function miniMapa() {
  return el('div', { style: `
    border-radius:var(--lx-raio);overflow:hidden;
    background:linear-gradient(135deg,#eaf2fb,#dbe9f7);
    height:100%;min-height:400px;display:flex;align-items:center;justify-content:center;
    position:relative
  ` },
    el('div', { html: `<svg viewBox="0 0 600 460" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%;position:absolute;top:0;left:0">
      <rect width="600" height="460" fill="#e3eefb"/>
      <g stroke="#cfe0f3" stroke-width="2">
        <path d="M0 120 H600 M0 260 H600 M0 370 H600 M150 0 V460 M330 0 V460 M470 0 V460"/>
      </g>
      <g fill="#d4e4f6">
        <rect x="60" y="40" width="120" height="60" rx="5"/>
        <rect x="360" y="150" width="130" height="80" rx="5"/>
        <rect x="180" y="300" width="110" height="60" rx="5"/>
      </g>
      <path d="M110 90 C200 140 230 200 330 200 S470 260 470 320 460 400 250 400"
        fill="none" stroke="var(--lx-azul-primario)" stroke-width="4" stroke-dasharray="1 10" stroke-linecap="round"/>
      <g><circle cx="110" cy="90" r="16" fill="var(--lx-azul-profundo)"/>
        <text x="110" y="96" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">C</text></g>
      <g><circle cx="330" cy="200" r="15" fill="var(--lx-azul-primario)"/>
        <text x="330" y="205" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">1</text></g>
      <g><circle cx="470" cy="320" r="15" fill="var(--lx-azul-primario)"/>
        <text x="470" y="325" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">2</text></g>
      <g><circle cx="250" cy="400" r="15" fill="var(--lx-azul-primario)"/>
        <text x="250" y="405" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">3</text></g>
    </svg>` }),
    // legenda
    el('div', { style: `
      position:absolute;left:14px;bottom:14px;
      background:rgba(255,255,255,.92);backdrop-filter:blur(6px);
      border:1px solid var(--lx-linha);border-radius:11px;
      padding:10px 13px;font-size:11.5px;
      display:flex;flex-direction:column;gap:7px;
      box-shadow:var(--lx-sombra-sm)
    ` },
      el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
        el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-azul-profundo);display:inline-block' }), 'Coleta'),
      el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
        el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-azul-primario);display:inline-block' }), 'Destinos (na ordem)'))
  );
}

function formNova(aoCriar) {
  const coleta = el('input', { class: 'lx-input', placeholder: 'Av. Tancredo Neves, 1632 — Caminho das Árvores, Salvador/BA' });
  const destino = el('input', { class: 'lx-input', placeholder: 'Rua, número, bairro — cidade' });
  const modoAuto = { val: true };
  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const botao = el('button', { class: 'lx-btn lx-btn-primario', onClick: criar },
    el('span', { html: icones.entregas }), 'Criar rota e enviar');

  // Selector de modo
  const btnAuto = el('label', { style: `
    flex:1;border:1.5px solid var(--lx-azul-vivo);background:var(--lx-info-bg);
    border-radius:11px;padding:12px;cursor:pointer;display:block
  ` },
    el('div', { style: 'display:flex;align-items:center;gap:8px' },
      el('span', { style: 'width:16px;height:16px;border-radius:50%;border:5px solid var(--lx-azul-primario);display:inline-block' }),
      el('b', { style: 'font-size:13px' }, 'Distribuição automática')),
    el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:5px;margin-left:24px' },
      'Aloca o motoboy ideal pela proximidade'));

  const btnManual = el('label', { style: `
    flex:1;border:1.5px solid var(--lx-linha);border-radius:11px;padding:12px;cursor:pointer;display:block
  ` },
    el('div', { style: 'display:flex;align-items:center;gap:8px' },
      el('span', { style: 'width:16px;height:16px;border-radius:50%;border:2px solid var(--lx-tinta-3);display:inline-block' }),
      el('b', { style: 'font-size:13px' }, 'Escolher manualmente')),
    el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:5px;margin-left:24px' },
      'Atribuição manual após lançamento'));

  btnAuto.addEventListener('click', () => {
    modoAuto.val = true;
    btnAuto.style.border = '1.5px solid var(--lx-azul-vivo)';
    btnAuto.style.background = 'var(--lx-info-bg)';
    btnManual.style.border = '1.5px solid var(--lx-linha)';
    btnManual.style.background = '';
  });
  btnManual.addEventListener('click', () => {
    modoAuto.val = false;
    btnManual.style.border = '1.5px solid var(--lx-azul-vivo)';
    btnManual.style.background = 'var(--lx-info-bg)';
    btnAuto.style.border = '1.5px solid var(--lx-linha)';
    btnAuto.style.background = '';
  });

  async function criar() {
    if (!coleta.value.trim() || !destino.value.trim()) {
      msg.style.color = 'var(--lx-erro)';
      msg.textContent = 'Preencha os endereços de coleta e destino.';
      return;
    }
    botao.disabled = true;
    msg.style.color = 'var(--lx-tinta-2)';
    msg.textContent = 'Geocodificando endereços…';
    try {
      const r = await post('/entregas', {
        coleta: { endereco: coleta.value.trim() },
        destinos: [{ endereco: destino.value.trim() }],
      });
      msg.style.color = 'var(--lx-ok)';
      msg.textContent = 'Entrega lançada: ' + (r.protocolo || '');
      coleta.value = destino.value = '';
      aoCriar();
    } catch (e) {
      msg.style.color = 'var(--lx-erro)';
      msg.textContent = e.message;
    } finally { botao.disabled = false; }
  }

  const campoColeta = el('div', { class: 'lx-field' },
    el('label', {},
      el('span', { class: 'lx-stop-num coleta', style: 'display:inline-grid;margin-right:8px;vertical-align:middle' }, 'C'),
      'Ponto de coleta'),
    coleta);

  const campoDestino = el('div', { class: 'lx-field' },
    el('label', {},
      el('span', { class: 'lx-stop-num', style: 'display:inline-grid;margin-right:8px;vertical-align:middle' }, '1'),
      'Destino'),
    destino);

  return el('div', { style: 'display:flex;gap:18px;align-items:stretch' },
    // form
    el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:16px' },
      el('div', { class: 'lx-card lx-card-pad' },
        el('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:14px' },
          el('div', { class: 'lx-stop-num coleta' }, 'C'),
          el('b', { style: 'font-size:14px' }, 'Ponto de coleta')),
        el('div', { class: 'lx-field', style: 'margin-bottom:0' },
          el('label', {}, 'Endereço'), coleta)),
      el('div', { class: 'lx-card lx-card-pad' },
        el('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:14px' },
          el('div', { class: 'lx-stop-num' }, '1'),
          el('b', { style: 'font-size:14px' }, 'Destino')),
        el('div', { class: 'lx-field', style: 'margin-bottom:0' },
          el('label', {}, 'Endereço'), destino)),
      el('div', { class: 'lx-card lx-card-pad' },
        el('b', { style: 'font-size:14px;display:block;margin-bottom:14px' }, 'Atribuir motoboy'),
        el('div', { style: 'display:flex;gap:10px;margin-bottom:14px' }, btnAuto, btnManual),
        botao,
        el('div', { style: 'margin-top:10px' }, msg))),
    // mapa
    el('div', { style: 'flex:1.1;min-width:0' },
      el('div', { class: 'lx-card', style: 'overflow:hidden;height:100%;display:flex;flex-direction:column' },
        el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between' },
          el('b', { style: 'font-size:13px' }, 'Rota sugerida'),
          el('span', { class: 'lx-chip lx-chip-on', style: 'padding:5px 11px;font-size:12px' }, 'Menor tempo')),
        el('div', { style: 'flex:1' }, miniMapa()),
        el('div', { style: 'display:flex;border-top:1px solid var(--lx-linha)' },
          el('div', { style: 'flex:1;padding:14px;text-align:center;border-right:1px solid var(--lx-linha)' },
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Distância'),
            el('div', { style: 'font-weight:700;font-size:18px' }, '—')),
          el('div', { style: 'flex:1;padding:14px;text-align:center;border-right:1px solid var(--lx-linha)' },
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Tempo estimado'),
            el('div', { style: 'font-weight:700;font-size:18px' }, '—')),
          el('div', { style: 'flex:1;padding:14px;text-align:center' },
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Paradas'),
            el('div', { style: 'font-weight:700;font-size:18px' }, '1')))))
  );
}

export async function montar(container) {
  const lista = el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));

  const filhos = [];
  if (auth.pode('entregas.criar')) {
    filhos.push(secHeader('Lançar nova entrega'), formNova(carregar));
  }
  filhos.push(secHeader('Histórico de entregas'), lista);

  container.append(casca('Entregas', el('div', {}, ...filhos),
    'Cadastre a coleta e os destinos — a rota é otimizada automaticamente'));

  async function carregar() {
    lista.innerHTML = '';
    lista.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;text-align:center;padding:12px 0' }, 'Carregando…'));
    try {
      const es = await get('/entregas');
      lista.innerHTML = '';
      if (!es.length) {
        lista.append(estadoVazio('entregas', 'Nenhuma entrega ainda', auth.pode('entregas.criar') ? 'Lance a primeira entrega no formulário acima.' : ''));
        return;
      }
      const tbody = el('tbody');
      es.forEach(e => tbody.append(el('tr', {},
        el('td', {}, el('b', {}, e.protocolo || '—')),
        el('td', {}, statusBadge(e.status)),
        el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' },
          e.motoboy_nome || el('span', { style: 'color:var(--lx-tinta-3)' }, 'Sem motoboy')),
        el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' },
          e.distancia_km != null ? Number(e.distancia_km).toFixed(1) + ' km' : '—'),
        el('td', { style: 'color:var(--lx-tinta-2);font-size:12px' }, fmtData(e.criado_em)))));
      lista.append(el('table', { class: 'lx-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Protocolo'),
          el('th', {}, 'Status'),
          el('th', {}, 'Motoboy'),
          el('th', {}, 'Distância'),
          el('th', {}, 'Criada'))),
        tbody));
    } catch (err) {
      lista.innerHTML = '';
      lista.append(el('div', { style: 'color:var(--lx-erro);font-size:13px' }, 'Erro: ' + err.message));
    }
  }
  carregar();
}
