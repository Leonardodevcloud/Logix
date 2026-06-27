import { el } from '../core/ui.js';

// Editor reutilizável de SLA. Renderiza a tabela de faixas (km → minutos) +
// os campos de atenção/iminente/padrão. Devolve um objeto com .obterValor() e
// .preencher(dados) para integrar nas telas (global e por cliente).
export function EditorSla({ aoMudar } = {}) {
  let _faixas = [];

  const corpoFaixas = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });

  function linhaFaixa(faixa, idx) {
    const ateKm = el('input', { class: 'lx-input', type: 'number', min: '0.5', step: '0.5', value: faixa.ate_km ?? '', style: 'width:110px' });
    const minutos = el('input', { class: 'lx-input', type: 'number', min: '1', step: '1', value: faixa.minutos ?? '', style: 'width:110px' });
    ateKm.addEventListener('input', () => { _faixas[idx].ate_km = Number(ateKm.value); if (aoMudar) aoMudar(); });
    minutos.addEventListener('input', () => { _faixas[idx].minutos = Number(minutos.value); if (aoMudar) aoMudar(); });
    const btnRem = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px;font-size:12px;color:var(--lx-erro)', onClick: () => { _faixas.splice(idx, 1); render(); if (aoMudar) aoMudar(); } }, 'Remover');
    return el('div', { style: 'display:flex;align-items:center;gap:10px' },
      el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'Até'),
      ateKm,
      el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'km →'),
      minutos,
      el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'min'),
      btnRem);
  }

  function render() {
    corpoFaixas.innerHTML = '';
    if (!_faixas.length) {
      corpoFaixas.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-3);padding:8px 0' }, 'Nenhuma faixa. Adicione faixas crescentes de km (ex: até 3 km → 60 min).'));
    } else {
      // ordena visualmente por km
      _faixas.map((f, i) => ({ f, i })).forEach(({ f, i }) => corpoFaixas.append(linhaFaixa(f, i)));
    }
  }

  const btnAdd = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px;align-self:flex-start;margin-top:4px', onClick: () => {
    // sugere o próximo limite de km
    const ultimo = _faixas.length ? Math.max(..._faixas.map(f => f.ate_km || 0)) : 0;
    _faixas.push({ ate_km: ultimo + 5, minutos: 90 });
    render(); if (aoMudar) aoMudar();
  } }, '+ Adicionar faixa');

  // Campos de alerta + padrão
  const inpAtencao = el('input', { class: 'lx-input', type: 'number', min: '1', step: '1', style: 'width:100px' });
  const inpIminente = el('input', { class: 'lx-input', type: 'number', min: '1', step: '1', style: 'width:100px' });
  const inpPadrao = el('input', { class: 'lx-input', type: 'number', min: '1', step: '1', style: 'width:100px' });
  [inpAtencao, inpIminente, inpPadrao].forEach(i => i.addEventListener('input', () => { if (aoMudar) aoMudar(); }));

  const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:20px' },
    el('div', {},
      el('div', { style: 'font-size:13px;font-weight:700;margin-bottom:4px' }, 'Faixas de prazo por distância'),
      el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:0 0 12px' }, 'O prazo da corrida é definido pela faixa de km da distância coleta→entrega. Use faixas crescentes; a última cobre tudo acima (ex: até 9999 km).'),
      corpoFaixas, btnAdd),
    el('div', {},
      el('div', { style: 'font-size:13px;font-weight:700;margin-bottom:10px' }, 'Alertas e prazo padrão'),
      el('div', { style: 'display:flex;flex-wrap:wrap;gap:18px' },
        el('div', { class: 'lx-field' }, el('label', {}, 'Atenção (min antes)'), inpAtencao,
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:4px' }, 'Fica amarelo a X min do prazo')),
        el('div', { class: 'lx-field' }, el('label', {}, 'Iminente (min antes)'), inpIminente,
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:4px' }, 'Fica laranja a X min do prazo')),
        el('div', { class: 'lx-field' }, el('label', {}, 'Prazo padrão (min)'), inpPadrao,
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:4px' }, 'Quando não há faixa/distância')))));

  wrap.preencher = (dados) => {
    _faixas = Array.isArray(dados?.faixas) ? dados.faixas.map(f => ({ ate_km: Number(f.ate_km), minutos: Number(f.minutos) })) : [];
    inpAtencao.value = dados?.minutos_atencao ?? 30;
    inpIminente.value = dados?.minutos_iminente ?? 15;
    inpPadrao.value = dados?.sla_padrao_min ?? 90;
    render();
  };
  wrap.obterValor = () => ({
    faixas: _faixas.filter(f => f.ate_km > 0 && f.minutos > 0).sort((a, b) => a.ate_km - b.ate_km),
    minutos_atencao: Number(inpAtencao.value) || 30,
    minutos_iminente: Number(inpIminente.value) || 15,
    sla_padrao_min: Number(inpPadrao.value) || 90,
  });
  wrap.setHabilitado = (on) => {
    [inpAtencao, inpIminente, inpPadrao, btnAdd].forEach(i => { i.disabled = !on; i.style.opacity = on ? '1' : '0.5'; });
    corpoFaixas.querySelectorAll('input,button').forEach(i => { i.disabled = !on; i.style.opacity = on ? '1' : '0.5'; });
    corpoFaixas.style.pointerEvents = on ? 'auto' : 'none';
    btnAdd.style.pointerEvents = on ? 'auto' : 'none';
  };

  render();
  return wrap;
}
