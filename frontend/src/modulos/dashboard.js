import { casca } from '../core/layout.js';
import { el, icones, secHeader, statusBadge } from '../core/ui.js';
import { get } from '../core/api.js';
import * as auth from '../core/auth.js';

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function kpi(iconeKey, valor, rotulo, delta, deltaUp) {
  const top = el('div', { class: 'k-top' },
    el('span', { class: 'k-ico', html: icones[iconeKey] || '' }));
  const filhos = [top, el('div', { class: 'k-val' }, String(valor)), el('div', { class: 'k-lbl' }, rotulo)];
  if (delta) filhos.push(el('div', { class: 'k-delta ' + (deltaUp ? 'up' : 'down') }, delta));
  return el('div', { class: 'lx-card lx-kpi' }, ...filhos);
}

// Mapa vetorial estilizado (on-brand, sem lib externa)
function mapaVetorial(motoboysOnline) {
  const svg = `<svg viewBox="0 0 800 340" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%">
    <rect width="800" height="340" fill="#e3eefb"/>
    <g stroke="#cfe0f3" stroke-width="2">
      <path d="M0 90 H800 M0 200 H800 M0 280 H800 M120 0 V340 M320 0 V340 M520 0 V340 M680 0 V340"/>
    </g>
    <g fill="#d4e4f6">
      <rect x="140" y="20" width="150" height="55" rx="5"/>
      <rect x="350" y="110" width="140" height="70" rx="5"/>
      <rect x="560" y="30" width="100" height="140" rx="5"/>
      <rect x="160" y="220" width="120" height="50" rx="5"/>
      <rect x="400" y="240" width="100" height="60" rx="5"/>
    </g>
    <path d="M90 250 Q220 230 300 150 T560 120 T700 70" fill="none" stroke="var(--lx-azul-vivo)" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>
    <path d="M120 280 Q260 280 340 210 T620 230" fill="none" stroke="var(--lx-azul-primario)" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>
    <g>
      <circle cx="300" cy="150" r="12" fill="var(--lx-azul-primario)"/>
      <circle cx="300" cy="150" r="12" fill="none" stroke="#fff" stroke-width="2.5"/>
      <circle cx="560" cy="120" r="12" fill="var(--lx-azul-vivo)"/>
      <circle cx="560" cy="120" r="12" fill="none" stroke="#fff" stroke-width="2.5"/>
      <circle cx="340" cy="210" r="12" fill="var(--lx-ok)"/>
      <circle cx="340" cy="210" r="12" fill="none" stroke="#fff" stroke-width="2.5"/>
      <circle cx="200" cy="120" r="9" fill="var(--lx-azul-primario)" opacity=".7"/>
      <circle cx="640" cy="250" r="9" fill="var(--lx-azul-vivo)" opacity=".7"/>
      <circle cx="450" cy="90" r="9" fill="var(--lx-ok)" opacity=".7"/>
    </g>
    <g fill="var(--lx-azul-profundo)">
      <path d="M700 58 l9 9 -9 9 -9 -9z"/>
      <path d="M620 218 l9 9 -9 9 -9 -9z"/>
    </g>
  </svg>`;

  const pill = el('div', { style: `
    position:absolute;top:14px;left:14px;
    background:rgba(255,255,255,.92);backdrop-filter:blur(6px);
    border:1px solid var(--lx-linha);border-radius:var(--lx-raio-pill);
    padding:6px 13px;font-size:11.5px;font-weight:700;
    color:var(--lx-ok);display:flex;align-items:center;gap:7px;
    box-shadow:var(--lx-sombra-sm)
  ` },
    el('span', { style: `
      width:8px;height:8px;border-radius:50%;background:var(--lx-ok);
      animation:lx-pulse 1.8s infinite;display:inline-block
    ` }),
    `Ao vivo · ${motoboysOnline} motoboys`
  );

  const legenda = el('div', { style: `
    position:absolute;left:14px;bottom:14px;
    background:rgba(255,255,255,.92);backdrop-filter:blur(6px);
    border:1px solid var(--lx-linha);border-radius:11px;
    padding:10px 13px;font-size:11.5px;
    display:flex;flex-direction:column;gap:7px;
    box-shadow:var(--lx-sombra-sm)
  ` },
    el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
      el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-azul-primario);display:inline-block' }), 'Em rota'),
    el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
      el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-ok);display:inline-block' }), 'Disponível'),
    el('span', { style: 'display:inline-flex;align-items:center;gap:8px;color:var(--lx-tinta-2);font-weight:600' },
      el('b', { style: 'width:10px;height:10px;border-radius:3px;background:var(--lx-azul-profundo);transform:rotate(45deg);display:inline-block' }), 'Destino')
  );

  return el('div', { style: `
    position:relative;border-radius:var(--lx-raio);overflow:hidden;
    height:340px;background:linear-gradient(135deg,#eaf2fb,#dbe9f7)
  ` },
    el('div', { html: svg, style: 'height:100%' }),
    pill, legenda
  );
}

function entregaAtiva(e) {
  const iniciais = (nome) => {
    const p = (nome || '').trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'M';
  };
  const av = el('div', { style: `
    width:32px;height:32px;border-radius:9px;
    background:var(--lx-azul-primario);color:#fff;
    display:grid;place-items:center;font-weight:800;font-size:12px;flex:none
  ` }, iniciais(e.motoboy_nome || 'M'));

  return el('div', { style: `
    display:flex;align-items:center;gap:11px;
    padding:11px 4px;border-bottom:1px solid var(--lx-linha)
  ` },
    av,
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { style: 'font-weight:700;font-size:13px;color:var(--lx-tinta)' }, e.protocolo || '—'),
      el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:1px' },
        e.motoboy_nome ? e.motoboy_nome : 'Sem motoboy')),
    statusBadge(e.status)
  );
}

// Dashboard do super_admin
async function dashAdmin(content) {
  const grade = el('div', { class: 'lx-grid-kpi' },
    el('div', { class: 'lx-card lx-kpi' }, el('div', { class: 'k-val', style: 'font-size:24px' }, '…'), el('div', { class: 'k-lbl' }, 'Clientes ativos')),
    el('div', { class: 'lx-card lx-kpi' }, el('div', { class: 'k-val', style: 'font-size:24px' }, '…'), el('div', { class: 'k-lbl' }, 'Motoboys na rede')),
    el('div', { class: 'lx-card lx-kpi' }, el('div', { class: 'k-val', style: 'font-size:24px' }, '…'), el('div', { class: 'k-lbl' }, 'Entregas hoje')),
    el('div', { class: 'lx-card lx-kpi' }, el('div', { class: 'k-val', style: 'font-size:24px' }, '…'), el('div', { class: 'k-lbl' }, 'Online agora')),
  );

  const listaAtivas = el('div', { style: 'display:flex;flex-direction:column;gap:0' },
    el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;padding:12px 4px' }, 'Carregando…'));

  const mapaWrap = el('div', { class: 'lx-card', style: 'flex:1.6;overflow:hidden' });
  const lateralAtivas = el('div', { class: 'lx-card lx-card-pad', style: 'flex:1;min-width:0' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
      el('b', { style: 'font-size:14px' }, 'Entregas ativas'),
      el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'carregando…')),
    listaAtivas
  );

  content.append(
    grade,
    secHeader('Mapa em tempo real'),
    el('div', { style: 'display:flex;gap:18px;align-items:stretch' }, mapaWrap, lateralAtivas)
  );

  try {
    const [empresas, motoboysAll] = await Promise.all([
      get('/empresas').catch(() => []),
      get('/motoboys').catch(() => []),
    ]);

    const frota = empresas.reduce((s, e) => s + (e.total_motoboys || 0), 0);
    const online = motoboysAll.filter(m => m.online).length;

    grade.innerHTML = '';
    grade.append(
      kpi('clientes', empresas.filter(e => e.ativo !== false).length, 'Clientes ativos', null),
      kpi('motoboys', frota, 'Motoboys na rede', null),
      kpi('entregas', '—', 'Entregas hoje', null),
      kpi('motoboys', `${online}`, 'Online agora', `${Math.round(online / Math.max(frota, 1) * 100)}% da base`, true),
    );

    mapaWrap.append(mapaVetorial(online));

    // Lista de ativas (busca por empresa para ter dados reais)
    const todas = [];
    for (const emp of empresas.slice(0, 5)) {
      // Não temos endpoint de entregas com empresa_id no super_admin sem impersonação,
      // então mostramos um estado representativo
    }

    lateralAtivas.querySelector('span').textContent = `${frota} motoboys`;
    listaAtivas.innerHTML = '';

    if (!empresas.length) {
      listaAtivas.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;padding:8px 0' }, 'Nenhum cliente cadastrado ainda.'));
    } else {
      empresas.slice(0, 5).forEach(c => {
        listaAtivas.append(el('div', { style: 'display:flex;align-items:center;gap:11px;padding:11px 4px;border-bottom:1px solid var(--lx-linha)' },
          el('div', { style: 'width:32px;height:32px;border-radius:9px;background:var(--lx-info-bg);color:var(--lx-azul-primario);display:grid;place-items:center;font-weight:800;font-size:11px;flex:none' },
            ((c.razao_social || c.nome_fantasia || '?')[0]).toUpperCase()),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-weight:700;font-size:13px;color:var(--lx-tinta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.razao_social || c.nome_fantasia || '—'),
            el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:1px' }, `${c.total_motoboys || 0} motoboys`)),
          el('span', { class: 'lx-status lx-status-entregue' }, 'Ativo')
        ));
      });
    }
  } catch {
    grade.innerHTML = '';
    grade.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Erro ao carregar dados.'));
  }
}

// Dashboard do cliente
async function dashCliente(content) {
  const grade = el('div', { class: 'lx-grid-kpi' });
  const mapaWrap = el('div', { class: 'lx-card', style: 'flex:1.5;overflow:hidden' });
  const listaAtivas = el('div', { style: 'display:flex;flex-direction:column;gap:2px' },
    el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;padding:8px 0' }, 'Carregando…'));

  const lateralAtivas = el('div', { class: 'lx-card lx-card-pad', style: 'flex:1;min-width:0' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
      el('b', { style: 'font-size:14px' }, 'Entregas ativas'),
      el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, '…')),
    listaAtivas
  );

  // KPIs menores abaixo
  const grade2 = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:18px' });

  content.append(
    grade,
    secHeader('Acompanhamento em tempo real'),
    el('div', { style: 'display:flex;gap:18px;align-items:stretch' }, mapaWrap, lateralAtivas),
    grade2
  );

  try {
    const [entregas, motoboys] = await Promise.all([
      auth.temModulo('entregas') ? get('/entregas').catch(() => []) : Promise.resolve([]),
      auth.temModulo('motoboys') ? get('/motoboys').catch(() => []) : Promise.resolve([]),
    ]);

    const naFila = entregas.filter(e => e.status === 'aguardando_atribuicao').length;
    const emAndamento = entregas.filter(e => ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status));
    const concluidas = entregas.filter(e => e.status === 'entregue').length;
    const online = motoboys.filter(m => m.online).length;

    grade.innerHTML = '';
    grade.append(
      kpi('entregas', emAndamento.length, 'Em andamento', null),
      kpi('entregas', concluidas, 'Concluídas hoje', null),
      kpi('filas', naFila, 'Na fila', null),
      kpi('motoboys', `${online}/${motoboys.length}`, 'Motoboys online', online > 0 ? `${Math.round(online / Math.max(motoboys.length, 1) * 100)}% disponíveis` : '—', true),
    );

    const motoboysOnline = online;
    mapaWrap.append(mapaVetorial(motoboysOnline));

    lateralAtivas.querySelector('span').textContent = `${emAndamento.length} ativas`;
    listaAtivas.innerHTML = '';

    if (!emAndamento.length) {
      listaAtivas.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;text-align:center;padding:20px 0' }, 'Nenhuma entrega em andamento.'));
    } else {
      emAndamento.slice(0, 6).forEach(e => listaAtivas.append(entregaAtiva(e)));
    }

    grade2.append(
      kpi('clientes', entregas.length, 'Total de entregas', null),
      kpi('motoboys', motoboys.length, 'Motoboys cadastrados', null),
      el('div', { class: 'lx-card lx-kpi' }, el('div', { class: 'k-val', style: 'font-size:24px' }, '—'), el('div', { class: 'k-lbl' }, 'Tempo médio')),
      el('div', { class: 'lx-card lx-kpi' }, el('div', { class: 'k-val', style: 'font-size:24px' }, concluidas > 0 ? Math.round(concluidas / Math.max(entregas.length, 1) * 100) + '%' : '—'), el('div', { class: 'k-lbl' }, 'Taxa de conclusão')),
    );

  } catch {
    grade.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Erro ao carregar.'));
  }
}

export async function montar(container) {
  // Injetar keyframe de pulse se não existir
  if (!document.getElementById('lx-pulse-style')) {
    const s = document.createElement('style');
    s.id = 'lx-pulse-style';
    s.textContent = `@keyframes lx-pulse{0%{box-shadow:0 0 0 0 rgba(31,157,107,.5)}70%{box-shadow:0 0 0 8px rgba(31,157,107,0)}100%{box-shadow:0 0 0 0 rgba(31,157,107,0)}}`;
    document.head.append(s);
  }

  const content = el('div', {});
  const isAdmin = auth.acessoAtual().perfil === 'super_admin';
  container.append(casca('Painel', content, isAdmin ? 'Visão em tempo real de todas as operações' : 'Acompanhe sua operação'));

  if (isAdmin) {
    await dashAdmin(content);
  } else {
    await dashCliente(content);
  }
}
