// Helpers de criação de DOM, sem framework. el('div', {class:'x', onClick:fn}, filhos...)
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) e.append(f && f.nodeType ? f : document.createTextNode(f ?? ''));
  return e;
}
export function limpar(container) { container.innerHTML = ''; }

// Ícones (stroke 1.8, 18px) usados na navegação e nos KPIs.
export const icones = {
  painel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  clientes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>',
  entregas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
  rastreio: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  motoboys: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-5l-2-6h7l2 6M9 11.5 7.5 7H5"/></svg>',
  filas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
  marca: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16h-1.5a2.5 2.5 0 0 0 0 4z"/></svg>',
  equipe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  config: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

// Vocabulário único de status de entrega (rótulo do lado do usuário + classe visual).
const STATUS_MAP = {
  aguardando_atribuicao: { rotulo: 'Na fila', classe: 'lx-status-aguardando' },
  aguardando_coleta:     { rotulo: 'Aguardando coleta', classe: 'lx-status-coleta' },
  em_coleta:             { rotulo: 'Em coleta', classe: 'lx-status-coleta' },
  em_rota:               { rotulo: 'Em rota', classe: 'lx-status-rota' },
  entregue:              { rotulo: 'Entregue', classe: 'lx-status-entregue' },
  cancelada:             { rotulo: 'Cancelada', classe: 'lx-status-cancelada' },
};
export function statusBadge(status) {
  const s = STATUS_MAP[status] || { rotulo: status || '—', classe: 'lx-status-aguardando' };
  return el('span', { class: 'lx-status ' + s.classe }, s.rotulo);
}

// Cabeçalho de seção (com faixas de velocidade ou uma ação à direita).
export function secHeader(titulo, acao) {
  return el('div', { class: 'lx-sec-h' }, el('h2', {}, titulo),
    acao || el('span', { class: 'lx-speed' }, el('i'), el('i'), el('i')));
}
// Estado vazio — convida à ação em vez de só informar.
export function estadoVazio(iconeKey, titulo, dica) {
  return el('div', { class: 'lx-vazio' },
    el('div', { class: 'ic', html: icones[iconeKey] || '' }),
    el('b', {}, titulo),
    dica ? el('div', {}, dica) : el('span', {}));
}
// Campo de formulário rotulado.
export function campo(rotulo, inputEl, marcador) {
  return el('div', { class: 'lx-field' }, el('label', {}, marcador || '', rotulo), inputEl);
}
