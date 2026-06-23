import { casca } from '../core/layout.js';
import { el, secHeader, campo } from '../core/ui.js';
import { get, put } from '../core/api.js';
import * as auth from '../core/auth.js';

const PADRAO = { cor_primaria: '#185FA5', cor_secundaria: '#042C53', cor_destaque: '#378ADD', cor_clara: '#B5D4F4' };

export async function montar(container) {
  const podeEditar = auth.pode('marca.editar');
  const area = el('div', {}, el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Carregando…')));
  container.append(casca('Marca', area, 'Personalize a aparência do painel da sua empresa (white-label)'));

  let dados;
  try { dados = (await get('/branding/completo').catch(() => null)) || {}; }
  catch (e) { area.innerHTML = ''; area.append(el('div', { class: 'lx-card lx-card-pad' }, el('div', { class: 'lx-muted' }, 'Erro: ' + e.message))); return; }

  const valores = {
    cor_primaria: dados.cor_primaria || PADRAO.cor_primaria,
    cor_secundaria: dados.cor_secundaria || PADRAO.cor_secundaria,
    cor_destaque: dados.cor_destaque || PADRAO.cor_destaque,
    cor_clara: dados.cor_clara || PADRAO.cor_clara,
  };
  const nome = el('input', { class: 'lx-input', value: dados.nome_exibicao || '', placeholder: 'Nome exibido no painel' });
  const logo = el('input', { class: 'lx-input', value: dados.logo_url || '', placeholder: 'https://…/logo.svg' });

  const preview = el('div', { class: 'lx-card', style: 'overflow:hidden' });
  function pintarPreview() {
    preview.innerHTML = '';
    const side = el('div', { style: `width:118px;padding:16px 12px;background:linear-gradient(185deg,${valores.cor_secundaria},#04203D);display:flex;flex-direction:column;gap:9px` },
      el('div', { style: `width:30px;height:30px;border-radius:8px;background:${valores.cor_destaque};color:#fff;display:grid;place-items:center;font-weight:900;font-size:12px` }, 'LX'),
      el('div', { style: `margin-top:6px;height:8px;border-radius:4px;background:${valores.cor_destaque};opacity:.9;width:72%` }),
      el('div', { style: 'height:8px;border-radius:4px;background:rgba(181,212,244,.35);width:90%' }),
      el('div', { style: 'height:8px;border-radius:4px;background:rgba(181,212,244,.22);width:60%' }));
    const corpo = el('div', { style: 'flex:1;padding:18px;background:#fff' },
      el('div', { style: `font-weight:800;color:${valores.cor_secundaria}` }, nome.value.trim() || 'Painel'),
      el('div', { style: 'height:1px;background:var(--lx-linha);margin:14px 0' }),
      el('span', { style: `display:inline-flex;padding:9px 16px;border-radius:10px;background:${valores.cor_primaria};color:#fff;font-weight:700;font-size:13px` }, 'Botão de ação'),
      el('span', { style: `display:inline-flex;margin-left:8px;padding:6px 12px;border-radius:999px;background:${valores.cor_clara};color:${valores.cor_secundaria};font-weight:700;font-size:11px` }, 'Etiqueta'));
    preview.append(el('div', { style: 'display:flex;min-height:170px' }, side, corpo));
  }
  nome.addEventListener('input', pintarPreview);
  pintarPreview();

  function pickerCor(rotulo, chave) {
    const inp = el('input', { type: 'color', value: valores[chave], style: 'width:46px;height:38px;border:1px solid var(--lx-linha);border-radius:8px;background:#fff;cursor:pointer;padding:2px' });
    const hex = el('input', { class: 'lx-input', value: valores[chave], style: 'flex:1' });
    inp.addEventListener('input', () => { valores[chave] = inp.value; hex.value = inp.value; pintarPreview(); });
    hex.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { valores[chave] = hex.value; inp.value = hex.value; pintarPreview(); } });
    return el('div', { class: 'lx-field' }, el('label', {}, rotulo), el('div', { style: 'display:flex;gap:8px;align-items:center' }, inp, hex));
  }

  const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
  const salvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
    salvar.disabled = true; msg.style.color = 'var(--lx-tinta-2)'; msg.textContent = 'Salvando…';
    try {
      await put('/branding/', { ...valores, nome_exibicao: nome.value.trim() || undefined, logo_url: logo.value.trim() || undefined });
      msg.style.color = 'var(--lx-ok)'; msg.textContent = 'Marca salva. As cores valem no próximo carregamento do painel do cliente.';
    } catch (e) { msg.style.color = 'var(--lx-erro)'; msg.textContent = e.message; } finally { salvar.disabled = false; }
  } }, 'Salvar marca');

  const formCard = el('div', { class: 'lx-card lx-card-pad' },
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' },
      campo('Nome de exibição', nome), campo('URL do logo', logo),
      pickerCor('Cor primária (botões/ações)', 'cor_primaria'),
      pickerCor('Cor secundária (fundo escuro)', 'cor_secundaria'),
      pickerCor('Cor de destaque', 'cor_destaque'),
      pickerCor('Cor clara (etiquetas)', 'cor_clara')),
    podeEditar ? el('div', { style: 'display:flex;align-items:center;gap:14px' }, salvar, msg)
               : el('div', { class: 'lx-muted' }, 'Você não tem permissão para editar a marca.'));

  area.innerHTML = '';
  area.append(secHeader('Identidade visual'), formCard, secHeader('Pré-visualização'), preview);
}
