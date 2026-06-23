// White-label — exclusivo do Super Admin (Logix master).
// Configura a marca de CADA CLIENTE separadamente via selector no topo.
import { casca } from '../core/layout.js';
import { el, secHeader, campo } from '../core/ui.js';
import { get, put } from '../core/api.js';

const PADRAO = {
  cor_primaria: '#185FA5',
  cor_secundaria: '#042C53',
  cor_destaque: '#378ADD',
  cor_clara: '#B5D4F4',
};

export async function montar(container) {
  const area = el('div', {});
  container.append(casca('White-label', area, 'Configure a marca que cada cliente e seus motoboys verão'));

  // --- Carregar lista de clientes para o selector ---
  let empresas = [];
  try { empresas = await get('/empresas'); } catch { empresas = []; }

  if (!empresas.length) {
    area.append(el('div', { class: 'lx-card lx-card-pad' },
      el('div', { style: 'color:var(--lx-tinta-2);font-size:13px' },
        'Nenhum cliente cadastrado ainda. Cadastre um cliente primeiro em Clientes.')));
    return;
  }

  // --- Selector de cliente no topo ---
  const sel = el('select', { class: 'lx-input', style: 'width:280px' });
  empresas.forEach(e => sel.append(el('option', { value: e.id },
    e.razao_social || e.nome_fantasia || `Cliente #${e.id}`)));

  const headerSelector = el('div', { class: 'lx-card lx-card-pad', style: 'display:flex;align-items:center;gap:16px;margin-bottom:4px' },
    el('div', { style: 'font-size:13px;font-weight:700;color:var(--lx-tinta-2)' }, 'Configurando marca de:'),
    sel,
    el('div', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, 'As cores e o nome são aplicados no portal deste cliente'));

  area.append(headerSelector);

  // --- Área de edição (recarrega ao trocar cliente) ---
  const editArea = el('div', {});
  area.append(editArea);

  sel.addEventListener('change', () => carregarCliente(sel.value));
  carregarCliente(sel.value);

  async function carregarCliente(empresaId) {
    editArea.innerHTML = '';
    editArea.append(el('div', { style: 'padding:20px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));

    let dados = {};
    try {
      // O super_admin passa X-Empresa-Id via header para buscar branding de um cliente específico
      dados = await get('/branding/completo', { empresaId }).catch(() => ({}));
    } catch { dados = {}; }

    const valores = {
      cor_primaria:  dados.cor_primaria  || PADRAO.cor_primaria,
      cor_secundaria: dados.cor_secundaria || PADRAO.cor_secundaria,
      cor_destaque:  dados.cor_destaque  || PADRAO.cor_destaque,
      cor_clara:     dados.cor_clara     || PADRAO.cor_clara,
    };

    const nomeInp = el('input', { class: 'lx-input', value: dados.nome_exibicao || '', placeholder: 'Nome exibido no painel do cliente' });
    const logoInp = el('input', { class: 'lx-input', value: dados.logo_url || '', placeholder: 'https://…/logo.svg' });

    // Preview ao vivo
    const preview = el('div', { class: 'lx-card', style: 'overflow:hidden' });

    function pintarPreview() {
      preview.innerHTML = '';
      const nomeCliente = nomeInp.value.trim() ||
        (empresas.find(e => String(e.id) === String(empresaId))?.razao_social || 'Cliente');

      const side = el('div', { style: `
        width:118px;padding:16px 12px;
        background:linear-gradient(185deg,${valores.cor_secundaria},#04203D);
        display:flex;flex-direction:column;gap:9px
      ` },
        el('div', { style: `width:30px;height:30px;border-radius:8px;background:${valores.cor_destaque};color:#fff;display:grid;place-items:center;font-weight:900;font-size:12px` }, 'LX'),
        el('div', { style: `margin-top:6px;height:8px;border-radius:4px;background:${valores.cor_destaque};opacity:.9;width:72%` }),
        el('div', { style: 'height:8px;border-radius:4px;background:rgba(181,212,244,.35);width:90%' }),
        el('div', { style: 'height:8px;border-radius:4px;background:rgba(181,212,244,.22);width:60%' }));

      const corpo = el('div', { style: 'flex:1;padding:18px;background:#fff' },
        el('div', { style: `font-weight:800;color:${valores.cor_secundaria};font-size:14px` }, nomeCliente),
        el('div', { style: 'height:1px;background:var(--lx-linha);margin:14px 0' }),
        el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' },
          el('span', { style: `display:inline-flex;padding:9px 16px;border-radius:10px;background:${valores.cor_primaria};color:#fff;font-weight:700;font-size:13px` }, 'Lançar entrega'),
          el('span', { style: `display:inline-flex;padding:6px 12px;border-radius:999px;background:${valores.cor_clara};color:${valores.cor_secundaria};font-weight:700;font-size:11px` }, 'No prazo')));

      // Simulação da URL
      const urlSlug = nomeCliente.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 12);
      const urlBar = el('div', { style: `
        background:#eef1f5;padding:8px 12px;display:flex;align-items:center;gap:8px;
        border-bottom:1px solid var(--lx-linha)
      ` },
        el('span', { style: 'display:flex;gap:5px' },
          el('span', { style: 'width:9px;height:9px;border-radius:50%;background:#e1554b;display:inline-block' }),
          el('span', { style: 'width:9px;height:9px;border-radius:50%;background:#e9b13b;display:inline-block' }),
          el('span', { style: 'width:9px;height:9px;border-radius:50%;background:#4bbf72;display:inline-block' })),
        el('span', { style: `flex:1;background:#fff;border-radius:6px;font-size:11px;color:var(--lx-tinta-2);padding:4px 10px` },
          `🔒 ${urlSlug}.logix.com.br`));

      preview.append(
        el('div', { style: 'border-radius:var(--lx-raio);overflow:hidden;border:1px solid var(--lx-linha)' },
          urlBar,
          el('div', { style: 'display:flex;min-height:170px' }, side, corpo)));
    }

    nomeInp.addEventListener('input', pintarPreview);
    pintarPreview();

    function pickerCor(rotulo, chave) {
      const inp = el('input', { type: 'color', value: valores[chave], style: 'width:46px;height:38px;border:1px solid var(--lx-linha);border-radius:8px;background:#fff;cursor:pointer;padding:2px' });
      const hex = el('input', { class: 'lx-input', value: valores[chave], style: 'flex:1' });
      inp.addEventListener('input', () => { valores[chave] = inp.value; hex.value = inp.value; pintarPreview(); });
      hex.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
          valores[chave] = hex.value; inp.value = hex.value; pintarPreview();
        }
      });
      return el('div', { class: 'lx-field' },
        el('label', {}, rotulo),
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, inp, hex));
    }

    const msg = el('div', { style: 'font-size:12px;min-height:18px;font-weight:600' });
    const salvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      salvar.disabled = true;
      msg.style.color = 'var(--lx-tinta-2)';
      msg.textContent = 'Salvando…';
      try {
        await put('/branding/', {
          ...valores,
          nome_exibicao: nomeInp.value.trim() || undefined,
          logo_url: logoInp.value.trim() || undefined,
        }, { empresaId });
        msg.style.color = 'var(--lx-ok)';
        msg.textContent = 'Marca salva. Vale no próximo acesso do cliente.';
      } catch (e) {
        msg.style.color = 'var(--lx-erro)';
        msg.textContent = e.message;
      } finally { salvar.disabled = false; }
    } }, 'Salvar marca');

    const formCard = el('div', { class: 'lx-card lx-card-pad' },
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px' },
        campo('Nome de exibição', nomeInp),
        campo('URL do logo', logoInp),
        pickerCor('Cor primária (botões/ações)', 'cor_primaria'),
        pickerCor('Cor secundária (sidebar/fundo escuro)', 'cor_secundaria'),
        pickerCor('Cor de destaque', 'cor_destaque'),
        pickerCor('Cor clara (etiquetas/chips)', 'cor_clara')),
      el('div', { style: 'display:flex;align-items:center;gap:14px;margin-top:4px' }, salvar, msg));

    editArea.innerHTML = '';
    editArea.append(
      secHeader('Identidade visual'),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start' },
        formCard,
        el('div', {},
          secHeader('Pré-visualização ao vivo'),
          preview)));
  }
}
