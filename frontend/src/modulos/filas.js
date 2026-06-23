import { casca } from '../core/layout.js';
import { el, secHeader, estadoVazio, statusBadge } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

// Coluna kanban de uma fase
function coluna(titulo, corTitulo, count, cards) {
  const badge = el('span', { style: `
    display:inline-flex;align-items:center;padding:3px 9px;
    border-radius:var(--lx-raio-pill);font-size:11px;font-weight:700;
    background:var(--lx-superficie-2);border:1px solid var(--lx-linha);color:var(--lx-tinta-2)
  ` }, String(count));

  const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  cards.forEach(c => corpo.append(c));

  return el('div', {},
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:0 4px 12px' },
      el('b', { style: `font-size:13px;color:${corTitulo}` }, titulo),
      badge),
    corpo
  );
}

function cardEntrega(e, acao) {
  const filhos = [
    el('div', { style: 'font-weight:700;font-size:12.5px;color:var(--lx-tinta)' }, e.protocolo || '—'),
    e.motoboy_nome
      ? el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:3px' }, e.motoboy_nome)
      : el('div', { style: 'color:var(--lx-tinta-2);font-size:12px;margin-top:3px' },
          (e.coleta_endereco || '').split(',')[0] || '—'),
  ];
  if (acao) filhos.push(el('div', { style: 'margin-top:10px' }, acao));
  return el('div', { class: 'lx-card lx-card-pad', style: 'padding:13px' }, ...filhos);
}

export async function montar(container) {
  const podeGerenciar = auth.pode('filas.gerenciar');

  const btnDistribuir = podeGerenciar
    ? el('button', { class: 'lx-btn lx-btn-primario', onClick: distribuirTudo }, 'Distribuir tudo (auto)')
    : null;

  const boardWrap = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start' });
  const erroMsg = el('div', { style: 'display:none;color:var(--lx-erro);font-size:13px;padding:8px 0' });

  container.append(casca('Filas de entrega',
    el('div', {},
      secHeader('Distribuição e progresso em tempo real', btnDistribuir),
      erroMsg,
      boardWrap),
    'Distribua as entregas da fila para os motoboys'));

  let _disponiveis = [];

  function acoesLinha(e) {
    if (!podeGerenciar) return null;
    const sel = el('select', { class: 'lx-input', style: 'font-size:12px;padding:7px 10px;margin-bottom:6px' },
      el('option', { value: '' }, _disponiveis.length ? 'Escolher motoboy…' : 'Nenhum online'));
    _disponiveis.forEach(m => sel.append(el('option', { value: m.id }, `${m.nome_completo} (${m.carga})`)));

    return el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      sel,
      el('div', { style: 'display:flex;gap:6px' },
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'flex:1;font-size:12px', onClick: () => {
          if (sel.value) executar('/filas/' + e.id + '/atribuir', { motoboy_id: sel.value });
        } }, 'Atribuir'),
        el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12px', onClick: () => executar('/filas/' + e.id + '/atribuir-auto') }, 'Auto')));
  }

  async function carregar() {
    boardWrap.innerHTML = '';
    boardWrap.append(
      ...['', '', '', ''].map(() =>
        el('div', { style: 'height:80px;border-radius:var(--lx-raio);background:var(--lx-superficie-2);animation:lx-shimmer 1.4s infinite' })));

    try {
      [_disponiveis] = await Promise.all([
        podeGerenciar ? get('/filas/disponiveis').catch(() => []) : Promise.resolve([]),
      ]);
      const fila = await get('/filas');

      const aguardando = fila.filter(e => e.status === 'aguardando_atribuicao');
      const emColeta = fila.filter(e => ['aguardando_coleta', 'em_coleta'].includes(e.status));
      const emRota = fila.filter(e => e.status === 'em_rota');
      const concluidas = fila.filter(e => e.status === 'entregue');

      boardWrap.innerHTML = '';
      boardWrap.append(
        coluna('Aguardando atribuição', 'var(--lx-atencao)', aguardando.length,
          aguardando.length
            ? aguardando.map(e => cardEntrega(e, acoesLinha(e)))
            : [el('div', { style: 'text-align:center;padding:20px;color:var(--lx-tinta-2);font-size:12px' }, 'Fila vazia')]),
        coluna('Em coleta', '#6b4fc9', emColeta.length,
          emColeta.length
            ? emColeta.map(e => cardEntrega(e, null))
            : [el('div', { style: 'text-align:center;padding:20px;color:var(--lx-tinta-2);font-size:12px' }, '—')]),
        coluna('Em rota', 'var(--lx-azul-primario)', emRota.length,
          emRota.length
            ? emRota.map(e => cardEntrega(e, null))
            : [el('div', { style: 'text-align:center;padding:20px;color:var(--lx-tinta-2);font-size:12px' }, '—')]),
        coluna('Concluídas hoje', 'var(--lx-ok)', concluidas.length,
          concluidas.slice(0, 3).map(e => cardEntrega(e, null))
            .concat(concluidas.length === 0 ? [el('div', { style: 'text-align:center;padding:20px;color:var(--lx-tinta-2);font-size:12px' }, '—')] : []))
      );
    } catch (err) {
      boardWrap.innerHTML = '';
      erroMsg.style.display = 'block';
      erroMsg.textContent = 'Erro ao carregar filas: ' + err.message;
    }
  }

  async function executar(url, corpo) {
    try { await post(url, corpo || {}); carregar(); }
    catch (e) { erroMsg.style.display = 'block'; erroMsg.textContent = e.message; setTimeout(() => erroMsg.style.display = 'none', 3000); }
  }

  async function distribuirTudo() {
    try {
      const r = await post('/filas/distribuir', {});
      erroMsg.style.color = 'var(--lx-ok)';
      erroMsg.style.display = 'block';
      erroMsg.textContent = `✓ Atribuídas: ${r.atribuidas} · Sem motoboy: ${r.semMotoboy}`;
      setTimeout(() => { erroMsg.style.display = 'none'; erroMsg.style.color = 'var(--lx-erro)'; }, 3000);
      carregar();
    } catch (e) {
      erroMsg.style.display = 'block';
      erroMsg.textContent = e.message;
    }
  }

  // Shimmer CSS
  if (!document.getElementById('lx-shimmer-style')) {
    const s = document.createElement('style');
    s.id = 'lx-shimmer-style';
    s.textContent = `@keyframes lx-shimmer{0%,100%{opacity:.5}50%{opacity:1}}`;
    document.head.append(s);
  }

  carregar();
}
