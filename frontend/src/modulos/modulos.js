import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, put } from '../core/api.js';
import * as auth from '../core/auth.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
const sw = (on, onTgl) => { const s = el('div', { style: `width:44px;height:25px;border-radius:99px;position:relative;cursor:pointer;background:${on ? 'var(--lx-ok)' : '#cbd5e1'}` }); s.append(el('div', { style: `position:absolute;top:3px;${on ? 'right:3px' : 'left:3px'};width:19px;height:19px;border-radius:50%;background:#fff` })); s.onclick = onTgl; return s; };

// Catálogo de exibição (descrição + se tem config). Só mostra o que a empresa tem.
const CATALOGO = [
  { cod: 'chat', nome: 'Chat interno', desc: 'O entregador conversa pelo app: com o Suporte (sua central) em qualquer corrida e direto com a loja solicitante — texto, foto, link e localização. Histórico permanente.', config: 'chat' },
  { cod: 'rastreamento', nome: 'Rastreio ao vivo', desc: 'Acompanhamento das corridas no mapa em tempo real, com a posição do entregador.' },
  { cod: 'bi', nome: 'Relatórios', desc: 'Indicadores e exportações da operação.' },
  { cod: 'entregas', nome: 'Entregas', desc: 'Cadastro, distribuição e acompanhamento das corridas.' },
  { cod: 'filas', nome: 'Filas', desc: 'Fila de entregas aguardando atribuição.' },
  { cod: 'financeiro', nome: 'Financeiro', desc: 'Repasses, extras e fechamento dos entregadores.' },
  { cod: 'motoboys', nome: 'Entregadores', desc: 'Cadastro e gestão dos entregadores.' },
  { cod: 'lojas', nome: 'Lojas (Clientes)', desc: 'Gestão dos clientes/lojas da operação.' },
  { cod: 'marca', nome: 'Marca', desc: 'Personalização de marca (white-label).' },
];

export async function montar(container) {
  const painel = el('div', {});
  const meus = CATALOGO.filter(m => auth.temModulo(m.cod));

  function verLista() {
    painel.innerHTML = '';
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' });
    meus.forEach(m => {
      grid.append(el('div', {
        class: 'lx-card', style: 'padding:14px;cursor:pointer', onClick: () => verModulo(m),
      },
        el('div', { style: 'font-size:14px;font-weight:800' }, m.nome),
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px;line-height:1.45' }, m.desc.length > 90 ? m.desc.slice(0, 90) + '…' : m.desc),
        el('div', { style: 'display:flex;gap:6px;margin-top:9px' },
          el('span', { style: 'font-size:9.5px;font-weight:800;background:var(--lx-ok-bg);color:#0f6e56;border-radius:6px;padding:2px 7px' }, 'ativo'),
          m.config ? el('span', { style: 'font-size:9.5px;font-weight:800;background:#e4eef9;color:var(--lx-azul-primario);border-radius:6px;padding:2px 7px' }, 'configurável') : '')));
    });
    if (!meus.length) grid.append(el('div', { style: 'color:var(--lx-tinta-3)' }, 'Nenhum módulo ativo.'));
    painel.append(grid);
  }

  async function verModulo(m) {
    painel.innerHTML = '';
    painel.append(el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;margin-bottom:12px', onClick: verLista }, '‹ Voltar aos módulos'));
    painel.append(el('div', { style: 'font-size:17px;font-weight:800' }, m.nome));
    painel.append(el('div', { style: 'font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--lx-tinta-3);margin:14px 0 6px' }, 'Descrição'));
    painel.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);line-height:1.6;background:var(--lx-superficie-2);border:1px solid var(--lx-linha);border-radius:10px;padding:12px' }, m.desc));

    if (m.config !== 'chat') {
      painel.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-3);margin-top:14px' }, 'Este módulo não tem configuração por loja — está ativo para toda a operação.'));
      return;
    }

    // Config do chat: lojas + centros (herança).
    painel.append(el('div', { style: 'font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--lx-tinta-3);margin:16px 0 6px' }, 'Chat direto com a loja'));
    painel.append(el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-bottom:8px' }, 'O Suporte (central) já funciona para todos. Aqui você libera o chat DIRETO com cada loja (e ajusta por centro de custo).'));
    const busca = el('input', { class: 'lx-input', placeholder: 'Buscar loja…', style: 'margin-bottom:10px' });
    const lista = el('div', {});
    painel.append(busca, lista);

    let lojas = [];
    try { lojas = (await get('/chat/config/lojas')).lojas || []; } catch (e) { lista.append(el('div', { style: 'color:var(--lx-erro)' }, e.message)); return; }

    function render(filtro) {
      lista.innerHTML = '';
      const f = (filtro || '').toLowerCase();
      const vis = lojas.filter(l => !f || (l.nome || '').toLowerCase().includes(f));
      if (!vis.length) { lista.append(el('div', { style: 'color:var(--lx-tinta-3);font-size:12.5px;padding:8px' }, 'Nenhuma loja.')); return; }
      vis.forEach(l => {
        const box = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:12px;margin-bottom:10px;overflow:hidden' });
        const centrosWrap = el('div', { style: 'padding:6px 13px 8px 30px;display:none' });
        const seta = el('span', { style: 'color:var(--lx-tinta-3);font-weight:800' }, l.centros ? '▼' : '');
        let aberto = false, carregou = false;
        async function toggleExpand() {
          if (!l.centros) return;
          aberto = !aberto; centrosWrap.style.display = aberto ? 'block' : 'none'; seta.textContent = aberto ? '▲' : '▼';
          if (aberto && !carregou) { carregou = true; await carregarCentros(l, centrosWrap); }
        }
        const hd = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:12px 13px;background:var(--lx-superficie-2)' },
          el('div', { style: 'cursor:pointer;flex:1;display:flex;align-items:center;gap:10px', onClick: toggleExpand },
            el('span', { style: 'font-size:13.5px;font-weight:800' }, l.nome),
            el('span', { style: 'font-size:10.5px;color:var(--lx-tinta-3)' }, l.centros ? `${l.centros} centro(s)${l.forcados ? ' · ' + l.forcados + ' forçado(s)' : ''}` : 'sem centros'),
            seta),
          sw(l.ativo, async () => { l.ativo = !l.ativo; try { await put('/chat/config/lojas/' + l.id, { ativo: l.ativo }); render(busca.value); } catch (e) { l.ativo = !l.ativo; toast(e.message, 'erro'); } }));
        box.append(hd, centrosWrap);
        lista.append(box);
      });
    }
    async function carregarCentros(l, wrap) {
      wrap.innerHTML = '<div style="font-size:12px;color:var(--lx-tinta-3);padding:6px">carregando…</div>';
      let centros = [];
      try { centros = (await get('/chat/config/lojas/' + l.id + '/centros')).centros || []; } catch { wrap.innerHTML = ''; return; }
      wrap.innerHTML = '';
      if (!centros.length) { wrap.append(el('div', { style: 'font-size:12px;color:var(--lx-tinta-3);padding:6px' }, 'Sem centros de custo.')); return; }
      centros.forEach(c => {
        const tri = el('div', { style: 'display:flex;gap:4px;margin-left:auto' });
        ['herda', 'ligado', 'desligado'].forEach(est => {
          const on = c.estado === est;
          const cor = est === 'ligado' ? ['#b6e3ce', 'var(--lx-ok-bg)', '#0f6e56'] : est === 'desligado' ? ['#f2c4be', '#fbe8e6', '#a23c34'] : ['var(--lx-azul-vivo)', '#eaf3fc', 'var(--lx-azul-primario)'];
          tri.append(el('b', {
            style: `font-size:10px;font-weight:800;padding:4px 9px;border-radius:7px;cursor:pointer;border:1px solid ${on ? cor[0] : 'var(--lx-linha)'};background:${on ? cor[1] : 'var(--lx-superficie)'};color:${on ? cor[2] : 'var(--lx-tinta-3)'}`,
            onClick: async () => { const ant = c.estado; c.estado = est; try { await put('/chat/config/centros/' + c.id, { estado: est }); await carregarCentros(l, wrap); } catch (e) { c.estado = ant; toast(e.message, 'erro'); } },
          }, est === 'herda' ? 'Herda' : est === 'ligado' ? 'Ligado' : 'Desligado'));
        });
        wrap.append(el('div', { style: 'display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--lx-linha)' },
          el('span', { style: 'font-size:12.5px;font-weight:700' }, c.nome), tri));
      });
    }
    busca.addEventListener('input', () => render(busca.value));
    render('');
  }

  verLista();
  container.append(casca('Módulos', el('div', { class: 'lx-card', style: 'padding:22px;max-width:820px' }, painel), 'Os módulos ativos na sua operação. Entre num módulo para ver a descrição e a configuração.'));
}
