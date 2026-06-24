import { el, statusBadge } from '../core/ui.js';
import { get } from '../core/api.js';

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}
function fmtHora(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

// ── Modal lightbox de fotos ───────────────────────────────────────────────────
function abrirFotos(fotos, idx) {
  let atual = idx;
  const img = el('img', { style: 'max-height:80vh;max-width:90vw;object-fit:contain;border-radius:10px;display:block' });
  const contador = el('div', { style: 'color:rgba(255,255,255,.7);font-size:13px;text-align:center;margin-top:8px' });
  function atualizar() {
    const f = fotos[atual];
    img.src = typeof f === 'string' ? f : (f?.url || f?.link || '');
    contador.textContent = `${atual + 1} / ${fotos.length}`;
  }
  const btnPrev = el('button', { style: 'position:absolute;left:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center', onClick: () => { if (atual > 0) { atual--; atualizar(); } }}, el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' }));
  const btnNext = el('button', { style: 'position:absolute;right:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center', onClick: () => { if (atual < fotos.length - 1) { atual++; atualizar(); } }}, el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' }));
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:3000;display:flex;align-items:center;justify-content:center;flex-direction:column' },
    el('button', { style: 'position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:28px;cursor:pointer', onClick: () => ov.remove() }, el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' })),
    btnPrev, img, contador, btnNext);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov);
  atualizar();
}

// ── Linha expandida com detalhes de uma entrega ───────────────────────────────
async function linhaDetalhe(e) {
  const wrap = el('div', { style: 'padding:16px 20px;background:var(--lx-superficie-2);border-top:0.5px solid var(--lx-linha)' });
  wrap.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Carregando detalhes…'));

  try {
    const d = await get('/entregas/' + e.id + '/detalhe');

    // Header: motoboy
    const header = el('div', { style: 'display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--lx-superficie);border-radius:var(--lx-raio-sm);border:0.5px solid var(--lx-linha);margin-bottom:12px' });
    if (d.motoboy_foto) {
      header.append(el('img', { style: 'width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;border:2px solid var(--lx-linha)', src: d.motoboy_foto }));
    } else {
      header.append(el('div', { style: 'width:52px;height:52px;border-radius:50%;background:var(--lx-info-bg);display:grid;place-items:center;flex:none', html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h1l3 5M5.5 14H11l4-8h2"/><path d="M9 14l2-8"/></svg>' }));
    }
    const metas = [
      d.motoboy_nome || 'Sem motoboy',
      d.motoboy_telefone ? d.motoboy_telefone : null,
      d.distancia_km ? d.distancia_km + ' km' : null,
      d.total_pontos ? d.total_pontos + ' pontos' : null,
    ].filter(Boolean);
    header.append(el('div', {},
      el('b', { style: 'font-size:13.5px;color:var(--lx-tinta);display:block' }, metas[0]),
      el('div', { style: 'display:flex;gap:14px;margin-top:4px;flex-wrap:wrap' },
        ...metas.slice(1).map(m => el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, m)))));
    if (d.motivo_cancelamento) {
      header.append(el('div', { style: 'margin-left:auto;padding:6px 12px;background:var(--lx-erro-bg);color:var(--lx-erro);border-radius:7px;font-size:12px;font-weight:600' },
        el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' }), d.motivo_cancelamento));
    }

    // Pontos
    const pontosWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    (d.pontos || []).forEach((p, i) => {
      const isColeta = i === 0;
      const fotos = (() => {
        try { return Array.isArray(p.fotos) ? p.fotos : (p.fotos ? JSON.parse(p.fotos) : []); } catch { return []; }
      })();

      const corBorda = isColeta ? 'var(--lx-azul-profundo)' : 'var(--lx-azul-primario)';
      const bgPonto = isColeta ? '#EFF6FF' : 'var(--lx-superficie)';

      const ponto = el('div', { style: `border:1.5px solid ${corBorda};border-radius:var(--lx-raio-sm);overflow:hidden;background:${bgPonto}` });

      // Header do ponto
      const ph = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:10px 14px' });
      ph.append(
        el('div', { style: `width:28px;height:28px;border-radius:50%;background:${corBorda};color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none` }, isColeta ? 'C' : String(i)),
        el('div', { style: 'flex:1;min-width:0' },
          el('b', { style: `font-size:11px;font-weight:700;color:${corBorda};text-transform:uppercase;letter-spacing:.06em` }, isColeta ? 'Coleta' : 'Entrega ' + i),
          el('div', { style: 'font-size:12.5px;color:var(--lx-tinta);margin-top:1px' }, p.endereco || '—')));

      // Status do ponto
      const statusPonto = p.status || 'pendente';
      const statusCores = { entregue: ['var(--lx-ok-bg)', 'var(--lx-ok)'], pendente: ['var(--lx-superficie-2)', 'var(--lx-tinta-2)'], falha: ['var(--lx-erro-bg)', 'var(--lx-erro)'] };
      const [bg, fg] = statusCores[statusPonto] || statusCores.pendente;
      ph.append(el('span', { style: `margin-left:auto;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600;background:${bg};color:${fg}` }, statusPonto));
      ponto.append(ph);

      // Body do ponto (extras + fotos + horários)
      const extras = [
        p.nome_fantasia ? ['ti-user', p.nome_fantasia] : null,
        p.numero_nf ? ['ti-file-text', 'NF ' + p.numero_nf] : null,
        p.complemento ? ['ti-building', p.complemento] : null,
        p.observacoes ? ['ti-message', p.observacoes] : null,
        p.telefone ? ['ti-phone', p.telefone] : null,
      ].filter(Boolean);

      const horarios = [
        p.entregue_em ? ['Entregue', fmtHora(p.entregue_em), 'var(--lx-ok)'] : null,
      ].filter(Boolean);

      const temBody = extras.length || fotos.length || horarios.length || p.recebedor;
      if (temBody) {
        const body = el('div', { style: 'padding:8px 14px 12px;border-top:0.5px solid var(--lx-linha);display:flex;flex-direction:column;gap:6px' });

        if (extras.length) {
          const row = el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
          extras.forEach(([ico, txt]) => {
            const item = el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' });
            item.append(el('i', { class: 'ti ' + ico, style: 'font-size:12px;color:var(--lx-tinta-3);flex:none' }), document.createTextNode(txt));
            row.append(item);
          });
          body.append(row);
        }

        if (p.recebedor) {
          const r = el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' });
          r.append(el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--lx-tinta-3);', html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l9-9m0 0 4 4L21 9m-9 5-4-4"/><path d="M3 19h4"/></svg>' }), document.createTextNode('Recebedor: ' + p.recebedor));
          body.append(r);
        }

        // Fotos de protocolo
        if (fotos.length) {
          const fotoSection = el('div', {});
          fotoSection.append(
            el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--lx-tinta-3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em' },
              el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' }), 'Fotos de protocolo'));
          const grid = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
          fotos.forEach((foto, fi) => {
            const url = typeof foto === 'string' ? foto : (foto?.url || foto?.link || '');
            const thumb = el('div', { style: 'width:64px;height:64px;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid var(--lx-linha);position:relative', onClick: () => abrirFotos(fotos, fi) });
            thumb.append(el('img', { src: url, style: 'width:100%;height:100%;object-fit:cover' }));
            grid.append(thumb);
          });
          fotoSection.append(grid);
          body.append(fotoSection);
        }

        // Horários
        if (horarios.length) {
          const hr = el('div', { style: 'display:flex;gap:14px;padding-top:6px;border-top:0.5px solid var(--lx-linha)' });
          horarios.forEach(([label, hora, cor]) => {
            hr.append(el('div', { style: `display:flex;align-items:center;gap:4px;font-size:11px;color:${cor}` },
              el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
              document.createTextNode(label + ': ' + hora)));
          });
          body.append(hr);
        }

        ponto.append(body);
      }

      pontosWrap.append(ponto);
    });

    wrap.innerHTML = '';
    wrap.append(header, pontosWrap);

  } catch (err) {
    wrap.innerHTML = '';
    wrap.append(el('div', { style: 'color:var(--lx-erro);font-size:12px' }, 'Erro ao carregar detalhes.'));
  }

  return wrap;
}

// ── Tela principal de concluídas ──────────────────────────────────────────────
export async function montarConcluidas(container, filtroInicial) {
  let _lista = [];
  let _filtro = filtroInicial || 'todas';
  let _expandida = null;
  let _detalheEl = null;

  // KPIs
  const kpiEntregues = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');
  const kpiCanceladas = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');
  const kpiKm = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');

  const kpisEl = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px 20px;background:var(--lx-superficie);border-bottom:0.5px solid var(--lx-linha)' },
    el('div', { style: 'background:linear-gradient(135deg,#0F6E56,#1D9E75);border-radius:12px;padding:16px' },
      kpiEntregues, el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Entregues')),
    el('div', { style: 'background:linear-gradient(135deg,#A32D2D,#E24B4A);border-radius:12px;padding:16px' },
      kpiCanceladas, el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Canceladas')),
    el('div', { style: 'background:linear-gradient(135deg,#042C53,#185FA5);border-radius:12px;padding:16px' },
      kpiKm, el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Km total')));

  // Filtros
  const tabFiltros = el('div', { style: 'display:flex;gap:6px;padding:12px 20px;background:var(--lx-superficie);border-bottom:0.5px solid var(--lx-linha);align-items:center' });
  const tabEls = {};
  [['todas','Todas'],['entregue','Entregues'],['cancelada','Canceladas']].forEach(([id,label]) => {
    const t = el('button', { style: `padding:5px 14px;border-radius:999px;font-size:12.5px;font-weight:600;border:0.5px solid var(--lx-linha);cursor:pointer;background:${id===_filtro?'var(--lx-azul-primario)':'none'};color:${id===_filtro?'#fff':'var(--lx-tinta-2)'}`, onClick: () => setFiltro(id) }, label);
    tabEls[id] = t;
    tabFiltros.append(t);
  });
  const btnAtualizar = el('button', { style: 'margin-left:auto;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:0.5px solid var(--lx-linha);background:none;cursor:pointer;font-size:12px;color:var(--lx-tinta-2)', onClick: () => carregar() },
    el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' }), 'Atualizar');
  tabFiltros.append(btnAtualizar);

  // Tabela
  const tbody = el('tbody');
  const tabelaWrap = el('div', { style: 'overflow-y:auto;flex:1' },
    el('table', { style: 'width:100%;border-collapse:collapse;font-size:12.5px' },
      el('thead', { style: 'position:sticky;top:0;background:var(--lx-superficie-2);z-index:1' },
        el('tr', {},
          el('th', { style: 'width:36px;padding:9px 8px' }),
          el('th', { style: 'width:40px;padding:9px 8px' }),
          el('th', { style: 'text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'Protocolo'),
          el('th', { style: 'text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'NF'),
          el('th', { style: 'text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'Status'),
          el('th', { style: 'text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'Data'),
          el('th', { style: 'text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'Motoboy'),
          el('th', { style: 'text-align:center;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'Pontos'),
          el('th', { style: 'text-align:left;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)' }, 'Km'))),
      tbody));

  function setFiltro(f) {
    _filtro = f;
    Object.entries(tabEls).forEach(([k,t]) => {
      t.style.background = k===f ? 'var(--lx-azul-primario)' : 'none';
      t.style.color = k===f ? '#fff' : 'var(--lx-tinta-2)';
    });
    renderTabela();
  }

  function renderTabela() {
    tbody.innerHTML = '';
    const lista = _lista.filter(e =>
      _filtro === 'todas' ||
      (_filtro === 'entregue' && e.status === 'entregue') ||
      (_filtro === 'cancelada' && e.status === 'cancelada'));

    if (!lista.length) {
      const tr = el('tr', {}, el('td', { colSpan: 9, style: 'padding:40px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nenhuma entrega nesta categoria.'));
      tbody.append(tr);
      return;
    }

    lista.forEach(e => {
      const isEntregue = e.status === 'entregue';
      const tr = el('tr', { style: 'border-bottom:0.5px solid var(--lx-linha);cursor:pointer' });
      tr.addEventListener('mouseenter', () => tr.style.background = 'var(--lx-superficie-2)');
      tr.addEventListener('mouseleave', () => { if (_expandida !== e.id) tr.style.background = ''; });

      // Botão expandir
      const btnExp = el('div', { style: 'width:26px;height:26px;border-radius:7px;background:var(--lx-superficie-2);border:0.5px solid var(--lx-linha);display:grid;place-items:center;cursor:pointer;color:var(--lx-tinta-2);transition:all .15s' });
      btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

      // Foto motoboy
      const foto = e.motoboy_foto
        ? el('img', { src: e.motoboy_foto, style: 'width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid var(--lx-linha);display:block;margin:0 auto' })
        : el('div', { style: 'width:32px;height:32px;border-radius:50%;background:var(--lx-info-bg);display:grid;place-items:center;margin:0 auto', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h1l3 5M5.5 14H11l4-8h2"/><path d="M9 14l2-8"/></svg>' });

      tr.append(
        el('td', { style: 'padding:10px 8px;text-align:center' }, btnExp),
        el('td', { style: 'padding:10px 8px;text-align:center' }, foto),
        el('td', { style: 'padding:10px 12px;font-weight:700;color:var(--lx-tinta)' }, e.protocolo || '—'),
        el('td', { style: 'padding:10px 12px' },
          e.primeira_nf
            ? el('span', { style: 'display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-ok);font-weight:600' }, el('span', { style: 'display:inline-flex;align-items:center;justify-content:center;flex:none;', html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' }), e.primeira_nf)
            : el('span', { style: 'color:var(--lx-tinta-3)' }, '—')),
        el('td', { style: 'padding:10px 12px' }, statusBadge(e.status)),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta-2)' }, fmtData(e.criado_em)),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta)' }, e.motoboy_nome || el('span', { style: 'color:var(--lx-tinta-3)' }, '—')),
        el('td', { style: 'padding:10px 12px;text-align:center;color:var(--lx-tinta-2)' }, e.total_pontos || '—'),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta-2)' }, e.distancia_km ? Number(e.distancia_km).toFixed(1) + ' km' : '—'));

      // Linha de detalhe
      const trDetalhe = el('tr', { style: 'display:none' });
      const tdDetalhe = el('td', { colSpan: 9 });
      trDetalhe.append(tdDetalhe);

      tr.addEventListener('click', async () => {
        if (_expandida === e.id) {
          // Fechar
          _expandida = null;
          _detalheEl = null;
          trDetalhe.style.display = 'none';
          tr.style.background = '';
          btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          btnExp.style.background = 'var(--lx-superficie-2)';
          btnExp.style.color = 'var(--lx-tinta-2)';
        } else {
          // Fechar anterior
          if (_detalheEl) _detalheEl.style.display = 'none';
          // Abrir este
          _expandida = e.id;
          tr.style.background = 'var(--lx-info-bg)';
          btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          btnExp.style.background = 'var(--lx-azul-primario)';
          btnExp.style.color = '#fff';
          trDetalhe.style.display = '';
          _detalheEl = trDetalhe;
          if (!tdDetalhe._carregado) {
            tdDetalhe._carregado = true;
            const det = await linhaDetalhe(e);
            tdDetalhe.innerHTML = '';
            tdDetalhe.append(det);
          }
        }
      });

      tbody.append(tr, trDetalhe);
    });
  }

  async function carregar() {
    tbody.innerHTML = '';
    const tr = el('tr', {}, el('td', { colSpan: 9, style: 'padding:32px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));
    tbody.append(tr);
    try {
      _lista = await get('/entregas/concluidas');
      // Atualizar KPIs
      const entregues = _lista.filter(e => e.status === 'entregue');
      const canceladas = _lista.filter(e => e.status === 'cancelada');
      const km = entregues.reduce((s, e) => s + parseFloat(e.distancia_km || 0), 0);
      kpiEntregues.textContent = entregues.length;
      kpiCanceladas.textContent = canceladas.length;
      kpiKm.textContent = km.toFixed(1) + ' km';
      renderTabela();
    } catch {
      tbody.innerHTML = '';
      tbody.append(el('tr', {}, el('td', { colSpan: 9, style: 'padding:24px;color:var(--lx-erro);font-size:13px' }, 'Erro ao carregar.')));
    }
  }

  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';
  if (filtroInicial) setFiltro(filtroInicial);
  container.append(kpisEl, tabFiltros, tabelaWrap);
  carregar();
}
