import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import * as auth from '../core/auth.js';

// Coordenadas aproximadas das capitais/cidades principais no viewBox 500x480 do mapa
const CIDADES_COORDS = {
  'salvador':        { x: 328, y: 255 },
  'feira de santana':{ x: 316, y: 248 },
  'são paulo':       { x: 274, y: 348 },
  'campinas':        { x: 268, y: 342 },
  'rio de janeiro':  { x: 304, y: 342 },
  'belo horizonte':  { x: 286, y: 326 },
  'recife':          { x: 358, y: 226 },
  'fortaleza':       { x: 348, y: 198 },
  'manaus':          { x: 175, y: 110 },
  'belém':           { x: 270, y: 120 },
  'porto alegre':    { x: 218, y: 413 },
  'curitiba':        { x: 248, y: 390 },
  'florianópolis':   { x: 255, y: 400 },
  'goiânia':         { x: 248, y: 278 },
  'brasília':        { x: 262, y: 262 },
  'natal':           { x: 368, y: 210 },
  'joão pessoa':     { x: 362, y: 218 },
  'maceió':          { x: 348, y: 242 },
  'aracaju':         { x: 338, y: 248 },
  'teresina':        { x: 318, y: 188 },
  'são luís':        { x: 288, y: 162 },
  'palmas':          { x: 268, y: 200 },
  'porto velho':     { x: 155, y: 168 },
  'rio branco':      { x: 138, y: 188 },
  'boa vista':       { x: 205, y: 68 },
  'macapá':          { x: 268, y: 85 },
  'campo grande':    { x: 232, y: 320 },
  'cuiabá':          { x: 215, y: 280 },
  'vitória':         { x: 316, y: 318 },
};

function coordsParaCliente(c) {
  const cidade = (c.cidade || c.razao_social || '').toLowerCase().trim();
  for (const [key, coords] of Object.entries(CIDADES_COORDS)) {
    if (cidade.includes(key)) return coords;
  }
  // fallback: posição aleatória mas dentro do Brasil
  return { x: 220 + Math.random() * 80, y: 220 + Math.random() * 80 };
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

const CORES_AV = [
  { bg: '#E6F1FB', cor: '#185FA5' },
  { bg: '#EEEDFE', cor: '#534AB7' },
  { bg: '#E1F5EE', cor: '#0F6E56' },
  { bg: '#FAEEDA', cor: '#854F0B' },
  { bg: '#FAECE7', cor: '#993C1D' },
  { bg: '#E1F5EE', cor: '#0F6E56' },
];

// ---- Dashboard Super Admin ----
async function dashAdmin(content) {
  // Estrutura base
  const countEl = el('div', { style: 'font-size:26px;font-weight:500;color:var(--lx-tinta);line-height:1' }, '…');
  const lblEl = el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:3px' }, 'clientes ativos');

  const pill = el('div', { style: `
    display:inline-flex;align-items:center;gap:6px;
    font-size:11px;font-weight:600;color:var(--lx-ok);
    background:var(--lx-ok-bg);padding:4px 10px;
    border-radius:var(--lx-raio-pill)
  ` },
    el('span', { style: 'width:7px;height:7px;border-radius:50%;background:var(--lx-ok);animation:lx-pulse 1.8s infinite;display:inline-block' }),
    'Ao vivo');

  const svgWrap = el('div', { style: 'position:relative' });
  const tooltip = el('div', { style: `
    position:absolute;background:var(--lx-superficie);
    border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);
    padding:10px 13px;font-size:12px;pointer-events:none;
    display:none;z-index:10;min-width:160px;
    box-shadow:var(--lx-sombra-sm)
  ` });
  svgWrap.append(tooltip);

  const listaWrap = el('div', { style: 'display:flex;flex-direction:column;overflow-y:auto;flex:1' });

  const mapaCard = el('div', { class: 'lx-card', style: 'flex:1;overflow:hidden' },
    el('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between' },
      el('div', { style: 'display:flex;align-items:baseline;gap:12px' }, countEl, lblEl),
      pill),
    svgWrap);

  const lateralCard = el('div', { class: 'lx-card', style: 'width:240px;display:flex;flex-direction:column;overflow:hidden' },
    el('div', { style: 'padding:12px 14px;border-bottom:1px solid var(--lx-linha);font-size:13px;font-weight:700;color:var(--lx-tinta)' }, 'Clientes ativos'),
    listaWrap);

  content.append(
    el('div', { style: 'display:flex;gap:14px;align-items:stretch' }, mapaCard, lateralCard)
  );

  // Carregar dados
  try {
    const empresas = await get('/empresas').catch(() => []);
    const ativos = empresas.filter(e => e.ativo !== false);
    countEl.textContent = ativos.length;

    // Montar SVG do mapa
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 500 480');
    svg.style.cssText = 'width:100%;height:380px;display:block;background:#EAF3DE';

    // Silhueta Brasil
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M180 30 L220 25 L260 30 L290 45 L310 60 L330 55 L350 70 L360 90 L370 110 L375 135 L370 160 L355 180 L360 200 L375 220 L385 245 L390 270 L380 295 L365 315 L350 330 L340 350 L330 370 L315 385 L295 395 L275 405 L255 415 L235 420 L215 415 L195 405 L175 395 L160 380 L145 360 L135 340 L128 318 L125 295 L130 270 L140 248 L148 225 L145 200 L135 178 L125 158 L118 135 L115 110 L118 88 L130 68 L150 50 Z');
    path.setAttribute('fill', '#C0DD97');
    path.setAttribute('stroke', '#639922');
    path.setAttribute('stroke-width', '1.2');
    svg.append(path);

    // Linhas divisórias de região
    [
      'M118 135 L375 135',
      'M148 225 L385 245',
      'M128 318 L380 295',
      'M160 380 L315 385',
    ].forEach(d => {
      const l = document.createElementNS(ns, 'path');
      l.setAttribute('d', d);
      l.setAttribute('stroke', '#97C459');
      l.setAttribute('stroke-width', '0.5');
      l.setAttribute('stroke-dasharray', '4 4');
      l.setAttribute('opacity', '0.5');
      l.setAttribute('fill', 'none');
      svg.append(l);
    });

    // Labels de região
    [
      { x: 230, y: 105, t: 'Norte' },
      { x: 338, y: 210, t: 'Nordeste' },
      { x: 245, y: 278, t: 'Centro-Oeste' },
      { x: 292, y: 348, t: 'Sudeste' },
      { x: 202, y: 408, t: 'Sul' },
    ].forEach(({ x, y, t }) => {
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', x); txt.setAttribute('y', y);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '9.5');
      txt.setAttribute('fill', '#3B6D11');
      txt.setAttribute('opacity', '0.6');
      txt.setAttribute('font-family', 'Inter, sans-serif');
      txt.textContent = t;
      svg.append(txt);
    });

    // Legenda
    const legRect = document.createElementNS(ns, 'rect');
    legRect.setAttribute('x', '14'); legRect.setAttribute('y', '334');
    legRect.setAttribute('width', '122'); legRect.setAttribute('height', '58');
    legRect.setAttribute('rx', '8'); legRect.setAttribute('fill', 'white');
    legRect.setAttribute('opacity', '0.9'); legRect.setAttribute('stroke', '#B5D4F4');
    legRect.setAttribute('stroke-width', '0.5');
    svg.append(legRect);
    [
      { y: 350, fill: '#185FA5', t: 'Ativo · operando' },
      { y: 368, fill: '#1D9E75', t: 'Ativo · em crescimento' },
      { y: 383, fill: '#BA7517', t: 'Atenção · baixo volume' },
    ].forEach(({ y, fill, t }) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', '26'); c.setAttribute('cy', y); c.setAttribute('r', '5');
      c.setAttribute('fill', fill); svg.append(c);
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', '36'); tx.setAttribute('y', y + 4);
      tx.setAttribute('font-size', '10'); tx.setAttribute('fill', '#042C53');
      tx.setAttribute('font-family', 'Inter, sans-serif');
      tx.textContent = t; svg.append(tx);
    });

    // Pins dos clientes
    ativos.forEach((c, i) => {
      const coords = coordsParaCliente(c);
      const cor = c.total_motoboys > 10 ? '#1D9E75' : c.total_motoboys > 0 ? '#185FA5' : '#BA7517';
      const r = Math.min(8, Math.max(4, 4 + (c.total_motoboys || 0) * 0.3));

      const anel = document.createElementNS(ns, 'circle');
      anel.setAttribute('cx', coords.x); anel.setAttribute('cy', coords.y);
      anel.setAttribute('r', r + 5); anel.setAttribute('fill', cor);
      anel.setAttribute('opacity', '0.15'); svg.append(anel);

      const pin = document.createElementNS(ns, 'circle');
      pin.setAttribute('cx', coords.x); pin.setAttribute('cy', coords.y);
      pin.setAttribute('r', r); pin.setAttribute('fill', cor);
      pin.setAttribute('stroke', '#fff'); pin.setAttribute('stroke-width', '2');
      pin.style.cursor = 'pointer';

      pin.addEventListener('mouseenter', () => {
        const wr = svgWrap.getBoundingClientRect();
        const pr = pin.getBoundingClientRect();
        tooltip.innerHTML = `
          <div style="font-weight:700;font-size:13px;color:var(--lx-tinta);margin-bottom:3px">${c.razao_social || c.nome_fantasia || '—'}</div>
          <div style="font-size:11px;color:var(--lx-tinta-2);margin-bottom:8px">${c.cidade || 'Brasil'}</div>
          <div style="display:flex;gap:14px">
            <div>
              <div style="font-size:10px;color:var(--lx-tinta-3)">Motoboys</div>
              <div style="font-size:16px;font-weight:700;color:var(--lx-tinta)">${c.total_motoboys || 0}</div>
            </div>
          </div>`;
        tooltip.style.display = 'block';
        tooltip.style.left = (pr.left - wr.left + 12) + 'px';
        tooltip.style.top = (pr.top - wr.top - 90) + 'px';
      });
      pin.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
      svg.append(pin);
    });

    svgWrap.append(svg);

    // Lista lateral
    listaWrap.innerHTML = '';
    ativos.forEach((c, i) => {
      const { bg, cor } = CORES_AV[i % CORES_AV.length];
      const mb = c.total_motoboys || 0;
      const uf = c.uf || (c.cidade ? c.cidade.split('·')[1]?.trim() : '') || '';
      listaWrap.append(el('div', { style: `
        display:flex;align-items:center;gap:10px;padding:10px 14px;
        border-bottom:1px solid var(--lx-linha);cursor:pointer;
        transition:background .12s
      `,
        onMouseenter: function() { this.style.background = 'var(--lx-superficie-2)'; },
        onMouseleave: function() { this.style.background = ''; },
      },
        el('div', { style: `width:28px;height:28px;border-radius:7px;background:${bg};color:${cor};display:grid;place-items:center;font-size:11px;font-weight:700;flex:none` },
          iniciais(c.razao_social || c.nome_fantasia)),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
            c.razao_social || c.nome_fantasia || '—'),
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-2)' }, `${mb} motoboys`)),
        uf ? el('span', { style: `font-size:10px;font-weight:700;padding:3px 7px;border-radius:var(--lx-raio-pill);background:var(--lx-info-bg);color:var(--lx-azul-primario)` }, uf) : el('span', {})
      ));
    });

    if (!ativos.length) {
      listaWrap.append(el('div', { style: 'padding:24px;text-align:center;color:var(--lx-tinta-2);font-size:13px' },
        'Nenhum cliente cadastrado ainda.'));
    }

  } catch {
    svgWrap.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px' }, 'Erro ao carregar dados.'));
  }
}

// ---- Dashboard Cliente ----
async function dashCliente(content) {
  const grade = el('div', { class: 'lx-grid-kpi' });
  const listaAtivas = el('div', { style: 'color:var(--lx-tinta-2);font-size:13px;padding:8px 0' }, 'Carregando…');
  const lateralAtivas = el('div', { class: 'lx-card lx-card-pad', style: 'flex:1;min-width:0' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' },
      el('b', { style: 'font-size:14px' }, 'Entregas ativas'),
      el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, '…')),
    listaAtivas);

  content.append(grade, lateralAtivas);

  try {
    const [entregas, motoboys] = await Promise.all([
      auth.temModulo('entregas') ? get('/entregas').catch(() => []) : Promise.resolve([]),
      auth.temModulo('motoboys') ? get('/motoboys').catch(() => []) : Promise.resolve([]),
    ]);
    const emAndamento = entregas.filter(e => ['aguardando_coleta','em_coleta','em_rota'].includes(e.status));
    const concluidas = entregas.filter(e => e.status === 'entregue').length;
    const naFila = entregas.filter(e => e.status === 'aguardando_atribuicao').length;
    const online = motoboys.filter(m => m.online).length;

    grade.innerHTML = '';
    [
      { val: emAndamento.length, lbl: 'Em andamento' },
      { val: concluidas, lbl: 'Concluídas hoje' },
      { val: naFila, lbl: 'Na fila' },
      { val: `${online}/${motoboys.length}`, lbl: 'Motoboys online' },
    ].forEach(({ val, lbl }) => {
      grade.append(el('div', { class: 'lx-card lx-kpi' },
        el('div', { class: 'k-val', style: 'font-size:26px' }, String(val)),
        el('div', { class: 'k-lbl' }, lbl)));
    });

    lateralAtivas.querySelector('span').textContent = `${emAndamento.length} ativas`;
    listaAtivas.innerHTML = '';
    if (!emAndamento.length) {
      listaAtivas.textContent = 'Nenhuma entrega em andamento.';
    } else {
      const { statusBadge } = await import('../core/ui.js');
      emAndamento.slice(0, 8).forEach(e => {
        listaAtivas.append(el('div', { style: 'display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid var(--lx-linha)' },
          el('b', { style: 'font-size:13px;color:var(--lx-tinta);flex:1' }, e.protocolo || '—'),
          el('span', { style: 'color:var(--lx-tinta-2);font-size:12px' }, e.motoboy_nome || '—'),
          statusBadge(e.status)));
      });
    }
  } catch {
    grade.append(el('div', { style: 'color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar.'));
  }
}

export async function montar(container) {
  if (!document.getElementById('lx-pulse-style')) {
    const s = document.createElement('style');
    s.id = 'lx-pulse-style';
    s.textContent = `@keyframes lx-pulse{0%{box-shadow:0 0 0 0 rgba(31,157,107,.5)}70%{box-shadow:0 0 0 8px rgba(31,157,107,0)}100%{box-shadow:0 0 0 0 rgba(31,157,107,0)}}`;
    document.head.append(s);
  }

  const isAdmin = auth.acessoAtual().perfil === 'super_admin';
  const content = el('div', {});
  container.append(casca('Painel', content,
    isAdmin ? 'Visão geral da plataforma' : 'Acompanhe sua operação'));

  if (isAdmin) await dashAdmin(content);
  else await dashCliente(content);
}
