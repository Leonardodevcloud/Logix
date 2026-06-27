import { el } from '../core/ui.js';

// Converte centavos (inteiro) → string em reais "12.50" para input.
function centToReais(c) { return c == null ? '' : (Number(c) / 100).toFixed(2); }
// Converte o valor digitado em reais → centavos (inteiro).
function reaisToCent(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : 0; }

// Editor reutilizável da tabela de valores. Cada faixa tem: até X km,
// valor do cliente (R$) e valor do motoboy (R$). Devolve .obterValor()/.preencher().
export function EditorValores({ aoMudar } = {}) {
  let _faixas = [];

  const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });

  function cabecalho() {
    return el('div', { style: 'display:grid;grid-template-columns:130px 1fr 1fr 80px;gap:10px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;padding:0 2px' },
      el('div', {}, 'Até (km)'), el('div', {}, 'Cliente (R$)'), el('div', {}, 'Motoboy (R$)'), el('div', {}));
  }

  function linha(faixa, idx) {
    const ateKm = el('input', { class: 'lx-input', type: 'number', min: '0.5', step: '0.5', value: faixa.ate_km ?? '' });
    const vCli = el('input', { class: 'lx-input', type: 'number', min: '0', step: '0.01', value: centToReais(faixa.valor_cliente_cent) });
    const vMb = el('input', { class: 'lx-input', type: 'number', min: '0', step: '0.01', value: centToReais(faixa.valor_motoboy_cent) });
    ateKm.addEventListener('input', () => { _faixas[idx].ate_km = Number(ateKm.value); if (aoMudar) aoMudar(); });
    vCli.addEventListener('input', () => { _faixas[idx].valor_cliente_cent = reaisToCent(vCli.value); if (aoMudar) aoMudar(); });
    vMb.addEventListener('input', () => { _faixas[idx].valor_motoboy_cent = reaisToCent(vMb.value); if (aoMudar) aoMudar(); });
    const btnRem = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 8px;font-size:12px;color:var(--lx-erro)', onClick: () => { _faixas.splice(idx, 1); render(); if (aoMudar) aoMudar(); } }, '✕');
    return el('div', { style: 'display:grid;grid-template-columns:130px 1fr 1fr 80px;gap:10px;align-items:center' }, ateKm, vCli, vMb, btnRem);
  }

  function render() {
    corpo.innerHTML = '';
    corpo.append(cabecalho());
    if (!_faixas.length) {
      corpo.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-3);padding:8px 0' }, 'Nenhuma faixa. Adicione faixas crescentes de km com os valores.'));
    } else {
      _faixas.forEach((f, i) => corpo.append(linha(f, i)));
    }
  }

  const btnAdd = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px;align-self:flex-start;margin-top:4px', onClick: () => {
    const ultimo = _faixas.length ? Math.max(..._faixas.map(f => f.ate_km || 0)) : 0;
    _faixas.push({ ate_km: ultimo + 5, valor_cliente_cent: 0, valor_motoboy_cent: 0 });
    render(); if (aoMudar) aoMudar();
  } }, '+ Adicionar faixa');

  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
    el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:0 0 8px' }, 'O valor da corrida é definido pela faixa de km da distância coleta→entrega. Use faixas crescentes; a última cobre tudo acima (ex: até 9999 km).'),
    corpo, btnAdd);

  wrap.preencher = (faixas) => {
    _faixas = Array.isArray(faixas) ? faixas.map(f => ({
      ate_km: Number(f.ate_km),
      valor_cliente_cent: Number(f.valor_cliente_cent) || 0,
      valor_motoboy_cent: Number(f.valor_motoboy_cent) || 0,
    })) : [];
    render();
  };
  wrap.obterValor = () => _faixas
    .filter(f => f.ate_km > 0)
    .sort((a, b) => a.ate_km - b.ate_km);
  wrap.setHabilitado = (on) => {
    wrap.style.opacity = on ? '1' : '0.5';
    wrap.style.pointerEvents = on ? 'auto' : 'none';
  };

  render();
  return wrap;
}
