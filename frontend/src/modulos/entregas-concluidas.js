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

// FIX 2: normaliza URL de foto — aceita base64 puro, data URI ou URL http
function normalizarFotoUrl(raw) {
  if (!raw) return '';
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
  // base64 puro salvo pelo app — adiciona prefixo JPEG (funciona para PNG também na maioria dos casos)
  return 'data:image/jpeg;base64,' + raw;
}

// ── Modal lightbox de fotos ───────────────────────────────────────────────────
function abrirFotos(fotos, idx) {
  let atual = idx;
  const img = el('img', { style: 'max-height:80vh;max-width:90vw;object-fit:contain;border-radius:10px;display:block' });
  const contador = el('div', { style: 'color:rgba(255,255,255,.7);font-size:13px;text-align:center;margin-top:8px' });
  function atualizar() {
    const f = fotos[atual];
    const raw = typeof f === 'string' ? f : (f?.url || f?.link || '');
    img.src = normalizarFotoUrl(raw);
    contador.textContent = `${atual + 1} / ${fotos.length}`;
  }
  const btnPrev = el('button', { style: 'position:absolute;left:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center',
    onClick: () => { if (atual > 0) { atual--; atualizar(); } }},
    el('span', { html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' }));
  const btnNext = el('button', { style: 'position:absolute;right:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center',
    onClick: () => { if (atual < fotos.length - 1) { atual++; atualizar(); } }},
    el('span', { html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' }));
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:3000;display:flex;align-items:center;justify-content:center;flex-direction:column' },
    el('button', { style: 'position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:28px;cursor:pointer',
      onClick: () => ov.remove() },
      el('span', { html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' })),
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

    // FIX 1: Injetar ponto de COLETA como primeiro item (vem dos campos coleta_* da entrega)
    // O backend retorna apenas destinos em d.pontos — a coleta não é um ponto registrado
    const pontoColeta = {
      _coleta: true,
      endereco: d.coleta_endereco || '—',
      lat: d.coleta_lat,
      lng: d.coleta_lng,
      status: 'entregue',
      // Horários da coleta: chegou_em e finalizado_em ficam nos pontos reais,
      // mas a entrega tem iniciada_em que indica quando o motoboy saiu para coletar
      chegou_em: d.iniciada_em || null,
      entregue_em: d.iniciada_em || null,
      fotos: [],
    };
    const todosPontos = [pontoColeta, ...(d.pontos || [])];

    // Header: motoboy + km + tempo
    const header = el('div', { style: 'display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--lx-superficie);border-radius:var(--lx-raio-sm);border:0.5px solid var(--lx-linha);margin-bottom:12px' });
    if (d.motoboy_foto) {
      header.append(el('img', { style: 'width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;border:2px solid var(--lx-linha)', src: normalizarFotoUrl(d.motoboy_foto) }));
    } else {
      header.append(el('div', { style: 'width:52px;height:52px;border-radius:50%;background:var(--lx-info-bg);display:grid;place-items:center;flex:none',
        html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h1l3 5M5.5 14H11l4-8h2"/><path d="M9 14l2-8"/></svg>' }));
    }

    // Info do motoboy com telefone, km e pontos em linha
    const infoItems = el('div', { style: 'display:flex;gap:16px;margin-top:5px;flex-wrap:wrap;align-items:center' });

    if (d.motoboy_telefone) {
      infoItems.append(el('span', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' },
        el('span', { html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' }),
        document.createTextNode(d.motoboy_telefone)));
    }
    if (d.distancia_km && parseFloat(d.distancia_km) > 0) {
      infoItems.append(el('span', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' },
        el('span', { html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
        document.createTextNode(parseFloat(d.distancia_km).toFixed(1) + ' km')));
    }
    if (d.tempo_total_min) {
      infoItems.append(el('span', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' },
        el('span', { html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
        document.createTextNode(d.tempo_total_min + ' min')));
    }

    // Datas: criada e concluída
    const datasItems = el('div', { style: 'display:flex;gap:16px;margin-top:4px;flex-wrap:wrap' });
    if (d.criado_em) {
      datasItems.append(el('span', { style: 'font-size:11px;color:var(--lx-tinta-3)' },
        'Criada: ' + fmtData(d.criado_em)));
    }
    if (d.concluida_em) {
      datasItems.append(el('span', { style: 'font-size:11px;color:var(--lx-ok)' },
        'Concluída: ' + fmtData(d.concluida_em)));
    }
    if (d.cancelada_em) {
      datasItems.append(el('span', { style: 'font-size:11px;color:var(--lx-erro)' },
        'Cancelada: ' + fmtData(d.cancelada_em)));
    }

    header.append(el('div', { style: 'flex:1;min-width:0' },
      el('b', { style: 'font-size:13.5px;color:var(--lx-tinta);display:block' }, d.motoboy_nome || 'Sem motoboy'),
      infoItems,
      datasItems));

    if (d.motivo_cancelamento) {
      header.append(el('div', { style: 'margin-left:auto;padding:6px 12px;background:var(--lx-erro-bg);color:var(--lx-erro);border-radius:7px;font-size:12px;font-weight:600;max-width:200px' },
        d.motivo_cancelamento));
    }

    // Pontos (coleta + destinos)
    const pontosWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });

    todosPontos.forEach((p, i) => {
      const isColeta = !!p._coleta;
      const corBorda  = isColeta ? '#042C53' : 'var(--lx-azul-primario, #185FA5)';
      const bgPonto   = isColeta ? '#EFF6FF' : 'var(--lx-superficie)';
      const labelNum  = isColeta ? 'C' : String(i);
      const labelTxt  = isColeta ? 'Coleta' : 'Entrega ' + i;

      // FIX 2: normalizar URLs das fotos
      const fotos = (() => {
        try {
          const arr = Array.isArray(p.fotos) ? p.fotos : (p.fotos ? JSON.parse(p.fotos) : []);
          return arr.filter(f => {
            const raw = typeof f === 'string' ? f : (f?.url || '');
            return raw && raw.length > 0;
          });
        } catch { return []; }
      })();

      const ponto = el('div', { style: `border:1.5px solid ${corBorda};border-radius:var(--lx-raio-sm, 10px);overflow:hidden;background:${bgPonto}` });

      // Header do ponto
      const ph = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:10px 14px' });
      ph.append(
        el('div', { style: `width:28px;height:28px;border-radius:50%;background:${corBorda};color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none` }, labelNum),
        el('div', { style: 'flex:1;min-width:0' },
          el('b', { style: `font-size:11px;font-weight:700;color:${corBorda};text-transform:uppercase;letter-spacing:.06em` }, labelTxt),
          el('div', { style: 'font-size:12.5px;color:var(--lx-tinta);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, p.endereco || '—')));

      // Badge de status do ponto
      const statusPonto = p.status || 'pendente';
      const statusCores = {
        entregue: ['var(--lx-ok-bg, #E1F5EE)', 'var(--lx-ok, #1D9E75)'],
        pendente:  ['var(--lx-superficie-2, #F5F7FA)', 'var(--lx-tinta-2, #6B7A8F)'],
        falha:     ['var(--lx-erro-bg, #FAECEA)', 'var(--lx-erro, #D93025)'],
      };
      const [bg, fg] = statusCores[statusPonto] || statusCores.pendente;
      ph.append(el('span', { style: `margin-left:auto;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600;background:${bg};color:${fg};flex:none` }, statusPonto));
      ponto.append(ph);

      // Body do ponto
      const extras = [
        p.nome_fantasia ? p.nome_fantasia      : null,
        p.numero_nf    ? 'NF ' + p.numero_nf  : null,
        p.complemento  ? p.complemento         : null,
        p.observacoes  ? p.observacoes         : null,
        p.telefone     ? p.telefone            : null,
      ].filter(Boolean);

      // Horários do ponto: chegou_em + entregue_em / finalizado_em
      const horarios = [
        p.chegou_em     ? ['Chegou',     fmtHora(p.chegou_em),     '#185FA5'] : null,
        (p.entregue_em || p.finalizado_em)
          ? ['Entregue', fmtHora(p.entregue_em || p.finalizado_em), 'var(--lx-ok, #1D9E75)'] : null,
      ].filter(Boolean);

      const temBody = extras.length || fotos.length || horarios.length || p.recebedor;
      if (temBody) {
        const body = el('div', { style: 'padding:8px 14px 12px;border-top:0.5px solid var(--lx-linha);display:flex;flex-direction:column;gap:6px' });

        // Extras (nome fantasia, NF, etc.)
        if (extras.length) {
          const row = el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
          extras.forEach(txt => {
            row.append(el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, txt));
          });
          body.append(row);
        }

        // Recebedor
        if (p.recebedor) {
          body.append(el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--lx-tinta-2)' },
            el('span', { html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' }),
            document.createTextNode('Recebedor: ' + p.recebedor)));
        }

        // Fotos de protocolo — FIX 2 aplicado aqui
        if (fotos.length) {
          const fotoSection = el('div', {});
          fotoSection.append(
            el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--lx-tinta-3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em' },
              el('span', { html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' }),
              'Fotos de protocolo'));
          const grid = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
          fotos.forEach((foto, fi) => {
            const raw = typeof foto === 'string' ? foto : (foto?.url || foto?.link || '');
            const url = normalizarFotoUrl(raw);
            const thumb = el('div', { style: 'width:64px;height:64px;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid var(--lx-linha);position:relative;background:var(--lx-superficie-2)',
              onClick: () => abrirFotos(fotos, fi) });
            const imgEl = el('img', { style: 'width:100%;height:100%;object-fit:cover' });
            imgEl.src = url;
            // Fallback: se a imagem não carregar mostrar ícone
            imgEl.onerror = () => { imgEl.remove(); thumb.style.display='grid'; thumb.style.placeItems='center'; thumb.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8AA2BE" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'; };
            thumb.append(imgEl);
            grid.append(thumb);
          });
          fotoSection.append(grid);
          body.append(fotoSection);
        }

        // Horários (chegou / entregue)
        if (horarios.length) {
          const hr = el('div', { style: 'display:flex;gap:14px;padding-top:6px;border-top:0.5px solid var(--lx-linha)' });
          horarios.forEach(([label, hora, cor]) => {
            hr.append(el('div', { style: `display:flex;align-items:center;gap:4px;font-size:11px;color:${cor}` },
              el('span', { html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
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
    console.error('[concluidas] erro detalhe:', err);
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
  const kpiEntregues  = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');
  const kpiCanceladas = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');
  const kpiKm         = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');

  const kpisEl = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px 20px;background:var(--lx-superficie);border-bottom:0.5px solid var(--lx-linha)' },
    el('div', { style: 'background:linear-gradient(135deg,#0F6E56,#1D9E75);border-radius:12px;padding:16px' },
      kpiEntregues,
      el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Entregues')),
    el('div', { style: 'background:linear-gradient(135deg,#A32D2D,#E24B4A);border-radius:12px;padding:16px' },
      kpiCanceladas,
      el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Canceladas')),
    el('div', { style: 'background:linear-gradient(135deg,#042C53,#185FA5);border-radius:12px;padding:16px' },
      kpiKm,
      el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Km total')));

  // Filtros
  const tabFiltros = el('div', { style: 'display:flex;gap:6px;padding:12px 20px;background:var(--lx-superficie);border-bottom:0.5px solid var(--lx-linha);align-items:center' });
  const tabEls = {};
  [['todas','Todas'],['entregue','Entregues'],['cancelada','Canceladas']].forEach(([id,label]) => {
    const t = el('button', {
      style: `padding:5px 14px;border-radius:999px;font-size:12.5px;font-weight:600;border:0.5px solid var(--lx-linha);cursor:pointer;background:${id===_filtro?'var(--lx-azul-primario)':'none'};color:${id===_filtro?'#fff':'var(--lx-tinta-2)'}`,
      onClick: () => setFiltro(id)
    }, label);
    tabEls[id] = t;
    tabFiltros.append(t);
  });
  const btnAtualizar = el('button', { style: 'margin-left:auto;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:0.5px solid var(--lx-linha);background:none;cursor:pointer;font-size:12px;color:var(--lx-tinta-2)', onClick: () => carregar() },
    el('span', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' }),
    'Atualizar');
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
      (_filtro === 'entregue'  && e.status === 'entregue') ||
      (_filtro === 'cancelada' && e.status === 'cancelada'));

    if (!lista.length) {
      tbody.append(el('tr', {}, el('td', { colSpan: 9, style: 'padding:40px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nenhuma entrega nesta categoria.')));
      return;
    }

    lista.forEach(e => {
      const tr = el('tr', { style: 'border-bottom:0.5px solid var(--lx-linha);cursor:pointer' });
      tr.addEventListener('mouseenter', () => tr.style.background = 'var(--lx-superficie-2)');
      tr.addEventListener('mouseleave', () => { if (_expandida !== e.id) tr.style.background = ''; });

      const btnExp = el('div', { style: 'width:26px;height:26px;border-radius:7px;background:var(--lx-superficie-2);border:0.5px solid var(--lx-linha);display:grid;place-items:center;cursor:pointer;color:var(--lx-tinta-2);transition:all .15s' });
      btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

      const foto = e.motoboy_foto
        ? el('img', { src: normalizarFotoUrl(e.motoboy_foto), style: 'width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid var(--lx-linha);display:block;margin:0 auto' })
        : el('div', { style: 'width:32px;height:32px;border-radius:50%;background:var(--lx-info-bg);display:grid;place-items:center;margin:0 auto',
            html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h1l3 5M5.5 14H11l4-8h2"/><path d="M9 14l2-8"/></svg>' });

      tr.append(
        el('td', { style: 'padding:10px 8px;text-align:center' }, btnExp),
        el('td', { style: 'padding:10px 8px;text-align:center' }, foto),
        el('td', { style: 'padding:10px 12px;font-weight:700;color:var(--lx-tinta)' }, e.protocolo || '—'),
        el('td', { style: 'padding:10px 12px' },
          e.primeira_nf
            ? el('span', { style: 'font-size:11.5px;color:var(--lx-ok);font-weight:600' }, e.primeira_nf)
            : el('span', { style: 'color:var(--lx-tinta-3)' }, '—')),
        el('td', { style: 'padding:10px 12px' }, statusBadge(e.status)),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta-2)' }, fmtData(e.criado_em)),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta)' }, e.motoboy_nome || el('span', { style: 'color:var(--lx-tinta-3)' }, '—')),
        el('td', { style: 'padding:10px 12px;text-align:center;color:var(--lx-tinta-2)' }, e.total_pontos || '—'),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta-2)' },
          e.distancia_km && parseFloat(e.distancia_km) > 0
            ? parseFloat(e.distancia_km).toFixed(1) + ' km' : '—'));

      const trDetalhe = el('tr', { style: 'display:none' });
      const tdDetalhe = el('td', { colSpan: 9 });
      trDetalhe.append(tdDetalhe);

      tr.addEventListener('click', async () => {
        if (_expandida === e.id) {
          _expandida = null; _detalheEl = null;
          trDetalhe.style.display = 'none';
          tr.style.background = '';
          btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          btnExp.style.background = 'var(--lx-superficie-2)';
          btnExp.style.color = 'var(--lx-tinta-2)';
        } else {
          if (_detalheEl) _detalheEl.style.display = 'none';
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
    tbody.append(el('tr', {}, el('td', { colSpan: 9, style: 'padding:32px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…')));
    try {
      _lista = await get('/entregas/concluidas');
      const entregues = _lista.filter(e => e.status === 'entregue');
      const canceladas = _lista.filter(e => e.status === 'cancelada');
      const km = entregues.reduce((s, e) => s + (parseFloat(e.distancia_km) || 0), 0);
      kpiEntregues.textContent  = entregues.length;
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
