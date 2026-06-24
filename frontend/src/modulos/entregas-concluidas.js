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

// Detecta o tipo real de base64 pelo cabeçalho e monta data URI correto
function normalizarFotoUrl(raw) {
  if (!raw) return '';
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
  // Detectar tipo pelo início do base64
  if (raw.startsWith('/9j/'))   return 'data:image/jpeg;base64,' + raw;
  if (raw.startsWith('iVBOR')) return 'data:image/png;base64,'  + raw;
  if (raw.startsWith('UklG'))   return 'data:image/webp;base64,' + raw;
  // Fallback: tenta JPEG
  return 'data:image/jpeg;base64,' + raw;
}

// ── Modal lightbox ────────────────────────────────────────────────────────────
function abrirFotos(fotos, idx) {
  let atual = idx;
  const img = el('img', { style: 'max-height:80vh;max-width:90vw;object-fit:contain;border-radius:10px;display:block' });
  const contador = el('div', { style: 'color:rgba(255,255,255,.7);font-size:13px;text-align:center;margin-top:8px' });
  function atualizar() {
    const f = fotos[atual];
    const raw = typeof f === 'string' ? f : (f?.url || f?.link || '');
    img.src = normalizarFotoUrl(raw);
    img.onerror = () => { img.alt = 'Foto indisponível'; };
    contador.textContent = `${atual + 1} / ${fotos.length}`;
  }
  const nav = (delta) => el('button', {
    style: `position:absolute;${delta<0?'left':'right'}:16px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;width:44px;height:44px;border-radius:50%;cursor:pointer;display:grid;place-items:center`,
    onClick: () => { if (delta < 0 ? atual > 0 : atual < fotos.length - 1) { atual += delta; atualizar(); } }
  }, el('span', { html: delta < 0
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' }));
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:3000;display:flex;align-items:center;justify-content:center;flex-direction:column' },
    el('button', { style: 'position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;cursor:pointer',
      onClick: () => ov.remove() },
      el('span', { html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' })),
    nav(-1), img, contador, nav(1));
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.append(ov);
  atualizar();
}

// ── Linha expandida ───────────────────────────────────────────────────────────
async function linhaDetalhe(e, protocolo) {
  const wrap = el('div', { style: 'padding:16px 20px;background:var(--lx-superficie-2,#F5F7FA);border-top:0.5px solid var(--lx-linha,#E2EAF0)' });
  wrap.append(el('div', { style: 'color:var(--lx-tinta-2);font-size:12px' }, 'Carregando…'));

  try {
    const d = await get('/entregas/' + e.id + '/detalhe');

    // ── Header motoboy ────────────────────────────────────────────────────────
    const header = el('div', { style: 'display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--lx-superficie,#fff);border-radius:10px;border:0.5px solid var(--lx-linha);margin-bottom:12px' });

    if (d.motoboy_foto) {
      header.append(el('img', { src: normalizarFotoUrl(d.motoboy_foto),
        style: 'width:48px;height:48px;border-radius:50%;object-fit:cover;flex:none;border:2px solid var(--lx-linha)' }));
    } else {
      header.append(el('div', { style: 'width:48px;height:48px;border-radius:50%;background:var(--lx-info-bg,#EAF3FF);display:grid;place-items:center;flex:none',
        html: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#185FA5" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h1l3 5M5.5 14H11l4-8h2"/><path d="M9 14l2-8"/></svg>' }));
    }

    const pills = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:5px' });
    if (d.motoboy_telefone) pills.append(
      el('span', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' },
        el('span', { html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.24h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' }),
        document.createTextNode(d.motoboy_telefone)));
    if (d.distancia_km && parseFloat(d.distancia_km) > 0) pills.append(
      el('span', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' },
        el('span', { html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
        document.createTextNode(parseFloat(d.distancia_km).toFixed(1) + ' km')));
    if (d.tempo_total_min) pills.append(
      el('span', { style: 'display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lx-tinta-2)' },
        el('span', { html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
        document.createTextNode(d.tempo_total_min + ' min')));

    const datas = el('div', { style: 'display:flex;gap:14px;margin-top:4px;flex-wrap:wrap' });
    if (d.criado_em)     datas.append(el('span', { style: 'font-size:11px;color:var(--lx-tinta-3,#8AA2BE)' }, 'Criada: '     + fmtData(d.criado_em)));
    if (d.concluida_em)  datas.append(el('span', { style: 'font-size:11px;color:var(--lx-ok,#1D9E75)' },    'Concluída: '  + fmtData(d.concluida_em)));
    if (d.cancelada_em)  datas.append(el('span', { style: 'font-size:11px;color:var(--lx-erro,#D93025)' },  'Cancelada: '  + fmtData(d.cancelada_em)));

    header.append(el('div', { style: 'flex:1;min-width:0' },
      el('b', { style: 'font-size:13px;color:var(--lx-tinta);display:block' }, d.motoboy_nome || 'Sem motoboy'),
      pills, datas));

    // Botão imprimir protocolo
    const BASE = window.LOGIX_API || '/api/v1';
    const btnImprimir = el('a', {
      href: `${BASE}/entregas/${e.id}/protocolo`,
      target: '_blank',
      style: 'display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;background:var(--lx-azul-profundo,#042C53);color:#fff;font-size:12px;font-weight:600;text-decoration:none;flex:none;white-space:nowrap',
    },
      el('span', { html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' }),
      'Imprimir protocolo');
    header.append(btnImprimir);

    if (d.motivo_cancelamento) {
      header.append(el('div', { style: 'padding:6px 12px;background:var(--lx-erro-bg);color:var(--lx-erro);border-radius:7px;font-size:12px;font-weight:600' },
        d.motivo_cancelamento));
    }

    // ── Pontos ────────────────────────────────────────────────────────────────
    // FIX 1: coleta sintética usando coleta_endereco (endereço) e coleta_nome (apelido, opcional)
    const pontoColeta = {
      _coleta: true,
      _apelido: d.coleta_nome || null,       // apelido do endereço salvo (ex: "Loja Principal")
      endereco: d.coleta_endereco || '—',    // endereço completo real
      status: null,                          // FIX 2: sem badge na coleta
      chegou_em: d.iniciada_em || null,
      entregue_em: d.iniciada_em || null,
      fotos: [],
    };
    const todosPontos = [pontoColeta, ...(d.pontos || [])];

    const pontosWrap = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });

    todosPontos.forEach((p, i) => {
      const isColeta = !!p._coleta;
      const corBorda = isColeta ? '#042C53' : '#185FA5';
      const bgPonto  = isColeta ? '#EFF6FF' : 'var(--lx-superficie,#fff)';
      const labelNum = isColeta ? 'C' : String(i);
      const labelTxt = isColeta ? 'Coleta' : 'Entrega ' + i;

      // FIX 2: normalize fotos — filtra vazios e normaliza URL
      const fotos = (() => {
        try {
          const arr = Array.isArray(p.fotos) ? p.fotos : (p.fotos ? JSON.parse(p.fotos) : []);
          return arr.filter(f => {
            const raw = typeof f === 'string' ? f : (f?.url || '');
            return raw && raw.length > 4;
          });
        } catch { return []; }
      })();

      const ponto = el('div', { style: `border:1.5px solid ${corBorda};border-radius:10px;overflow:hidden;background:${bgPonto}` });

      // Header do ponto
      const ph = el('div', { style: 'display:flex;align-items:flex-start;gap:10px;padding:10px 14px' });
      ph.append(
        el('div', { style: `width:28px;height:28px;border-radius:50%;background:${corBorda};color:#fff;display:grid;place-items:center;font-weight:800;font-size:11px;flex:none;margin-top:1px` }, labelNum),
        el('div', { style: 'flex:1;min-width:0' },
          el('b', { style: `font-size:11px;font-weight:700;color:${corBorda};text-transform:uppercase;letter-spacing:.06em` }, labelTxt),
          // FIX 1: mostrar apelido (se houver) + endereço
          p._apelido
            ? el('div', {}, 
                el('div', { style: 'font-size:12.5px;color:var(--lx-tinta);margin-top:1px;font-weight:600' }, p._apelido),
                el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, p.endereco))
            : el('div', { style: 'font-size:12.5px;color:var(--lx-tinta);margin-top:1px' }, p.endereco || '—')));

      // FIX 2: badge só para destinos, não para coleta
      if (!isColeta && p.status) {
        const cores = {
          entregue: ['#E1F5EE','#1D9E75'],
          pendente:  ['#F5F7FA','#6B7A8F'],
          falha:     ['#FAECEA','#D93025'],
        };
        const [bg, fg] = cores[p.status] || cores.pendente;
        ph.append(el('span', { style: `margin-left:auto;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600;background:${bg};color:${fg};flex:none` }, p.status));
      }
      ponto.append(ph);

      // Body (extras + fotos + horários)
      const extras = [
        p.nome_fantasia,
        p.numero_nf   ? 'NF ' + p.numero_nf : null,
        p.complemento,
        p.observacoes,
        p.telefone,
      ].filter(Boolean);

      // FIX 3: mostrar chegou_em e entregue_em / finalizado_em
      const horarios = [
        p.chegou_em                              ? ['Chegou',    fmtHora(p.chegou_em),                           '#185FA5']           : null,
        (p.entregue_em || p.finalizado_em)       ? ['Entregue',  fmtHora(p.entregue_em || p.finalizado_em),       '#1D9E75']           : null,
      ].filter(Boolean);

      const temBody = extras.length || fotos.length || horarios.length || p.recebedor;
      if (temBody) {
        const body = el('div', { style: 'padding:8px 14px 12px;border-top:0.5px solid rgba(0,0,0,.07);display:flex;flex-direction:column;gap:7px' });

        if (extras.length) {
          const row = el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
          extras.forEach(txt => row.append(el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, txt)));
          body.append(row);
        }
        if (p.recebedor) {
          body.append(el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--lx-tinta-2)' },
            el('span', { html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' }),
            document.createTextNode('Recebedor: ' + p.recebedor)));
        }

        // Fotos — FIX 4 aplicado no normalizarFotoUrl com detecção de tipo
        if (fotos.length) {
          const fotoLabel = el('div', { style: 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--lx-tinta-3,#8AA2BE);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px' },
            el('span', { html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' }),
            'Fotos de protocolo (' + fotos.length + ')');
          const grid = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
          fotos.forEach((foto, fi) => {
            const raw = typeof foto === 'string' ? foto : (foto?.url || foto?.link || '');
            const url = normalizarFotoUrl(raw);
            const thumb = el('div', {
              style: 'width:64px;height:64px;border-radius:8px;overflow:hidden;cursor:pointer;border:0.5px solid var(--lx-linha,#E2EAF0);background:#F0F4F8;display:grid;place-items:center',
              onClick: () => abrirFotos(fotos, fi)
            });
            const imgEl = el('img', { style: 'width:100%;height:100%;object-fit:cover;display:block' });
            imgEl.src = url;
            imgEl.onerror = () => {
              imgEl.remove();
              thumb.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8AA2BE" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
            };
            thumb.append(imgEl);
            grid.append(thumb);
          });
          body.append(fotoLabel, grid);
        }

        // FIX 3: horários com chegou + entregue
        if (horarios.length) {
          const hr = el('div', { style: 'display:flex;gap:16px;padding-top:7px;border-top:0.5px solid rgba(0,0,0,.07)' });
          horarios.forEach(([label, hora, cor]) => {
            hr.append(el('div', { style: `display:flex;align-items:center;gap:4px;font-size:11px;color:${cor};font-weight:600` },
              el('span', { html: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }),
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

// ── Tela principal ────────────────────────────────────────────────────────────
export async function montarConcluidas(container, filtroInicial) {
  let _lista = [];
  let _filtro = filtroInicial || 'todas';
  let _expandida = null;
  let _detalheEl = null;

  const kpiEntregues  = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');
  const kpiCanceladas = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');
  const kpiKm         = el('div', { style: 'font-size:28px;font-weight:800;color:#fff;line-height:1' }, '—');

  const kpisEl = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px 20px;background:var(--lx-superficie);border-bottom:0.5px solid var(--lx-linha)' },
    el('div', { style: 'background:linear-gradient(135deg,#0F6E56,#1D9E75);border-radius:12px;padding:16px' },
      kpiEntregues, el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Entregues')),
    el('div', { style: 'background:linear-gradient(135deg,#A32D2D,#E24B4A);border-radius:12px;padding:16px' },
      kpiCanceladas, el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Canceladas')),
    el('div', { style: 'background:linear-gradient(135deg,#042C53,#185FA5);border-radius:12px;padding:16px' },
      kpiKm, el('div', { style: 'font-size:11px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Km total')));

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
    el('span', { html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' }), 'Atualizar');
  tabFiltros.append(btnAtualizar);

  const tbody = el('tbody');
  const tabelaWrap = el('div', { style: 'overflow-y:auto;flex:1' },
    el('table', { style: 'width:100%;border-collapse:collapse;font-size:12.5px' },
      el('thead', { style: 'position:sticky;top:0;background:var(--lx-superficie-2,#F5F7FA);z-index:1' },
        el('tr', {},
          el('th', { style: 'width:36px;padding:9px 8px' }),
          el('th', { style: 'width:40px;padding:9px 8px' }),
          ...['Protocolo','NF','Status','Data','Motoboy','Pontos','Km'].map((h,i) =>
            el('th', { style: `text-align:${i===5?'center':'left'};padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--lx-tinta-2)` }, h)))),
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
      tr.addEventListener('mouseenter', () => tr.style.background = 'var(--lx-superficie-2,#F5F7FA)');
      tr.addEventListener('mouseleave', () => { if (_expandida !== e.id) tr.style.background = ''; });

      const btnExp = el('div', { style: 'width:26px;height:26px;border-radius:7px;background:var(--lx-superficie-2,#F5F7FA);border:0.5px solid var(--lx-linha);display:grid;place-items:center;cursor:pointer;color:var(--lx-tinta-2)' });
      btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

      const foto = e.motoboy_foto
        ? el('img', { src: normalizarFotoUrl(e.motoboy_foto), style: 'width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid var(--lx-linha);display:block;margin:0 auto' })
        : el('div', { style: 'width:32px;height:32px;border-radius:50%;background:#EAF3FF;display:grid;place-items:center;margin:0 auto',
            html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#185FA5" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h1l3 5M5.5 14H11l4-8h2"/><path d="M9 14l2-8"/></svg>' });

      // FIX 5: km — mostra '—' mas nunca NaN
      const kmStr = e.distancia_km && !isNaN(parseFloat(e.distancia_km)) && parseFloat(e.distancia_km) > 0
        ? parseFloat(e.distancia_km).toFixed(1) + ' km' : '—';

      tr.append(
        el('td', { style: 'padding:10px 8px;text-align:center' }, btnExp),
        el('td', { style: 'padding:10px 8px;text-align:center' }, foto),
        el('td', { style: 'padding:10px 12px;font-weight:700;color:var(--lx-tinta)' }, e.protocolo || '—'),
        el('td', { style: 'padding:10px 12px' },
          e.primeira_nf
            ? el('span', { style: 'font-size:11.5px;color:var(--lx-ok,#1D9E75);font-weight:600' }, e.primeira_nf)
            : el('span', { style: 'color:var(--lx-tinta-3,#8AA2BE)' }, '—')),
        el('td', { style: 'padding:10px 12px' }, statusBadge(e.status)),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta-2)' }, fmtData(e.criado_em)),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta)' }, e.motoboy_nome || el('span', { style: 'color:var(--lx-tinta-3)' }, '—')),
        el('td', { style: 'padding:10px 12px;text-align:center;color:var(--lx-tinta-2)' }, String(e.total_pontos || '—')),
        el('td', { style: 'padding:10px 12px;color:var(--lx-tinta-2)' }, kmStr));

      const trDetalhe = el('tr', { style: 'display:none' });
      const tdDetalhe = el('td', { colSpan: 9 });
      trDetalhe.append(tdDetalhe);

      tr.addEventListener('click', async () => {
        if (_expandida === e.id) {
          _expandida = null; _detalheEl = null;
          trDetalhe.style.display = 'none'; tr.style.background = '';
          btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          btnExp.style.background = 'var(--lx-superficie-2)'; btnExp.style.color = 'var(--lx-tinta-2)';
        } else {
          if (_detalheEl) _detalheEl.style.display = 'none';
          _expandida = e.id; tr.style.background = 'var(--lx-info-bg,#EAF3FF)';
          btnExp.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
          btnExp.style.background = 'var(--lx-azul-primario,#185FA5)'; btnExp.style.color = '#fff';
          trDetalhe.style.display = ''; _detalheEl = trDetalhe;
          if (!tdDetalhe._carregado) {
            tdDetalhe._carregado = true;
            const det = await linhaDetalhe(e);
            tdDetalhe.innerHTML = ''; tdDetalhe.append(det);
          }
        }
      });
      tbody.append(tr, trDetalhe);
    });
  }

  async function carregar() {
    tbody.innerHTML = '';
    tbody.append(el('tr', {}, el('td', { colSpan: 9, style: 'padding:32px;text-align:center;color:var(--lx-tinta-2)' }, 'Carregando…')));
    try {
      _lista = await get('/entregas/concluidas');
      const entregues = _lista.filter(e => e.status === 'entregue');
      const canceladas = _lista.filter(e => e.status === 'cancelada');
      const km = entregues.reduce((s, e) => s + (parseFloat(e.distancia_km) || 0), 0);
      kpiEntregues.textContent  = entregues.length;
      kpiCanceladas.textContent = canceladas.length;
      kpiKm.textContent = km > 0 ? km.toFixed(1) + ' km' : '—';
      renderTabela();
    } catch {
      tbody.innerHTML = '';
      tbody.append(el('tr', {}, el('td', { colSpan: 9, style: 'padding:24px;color:var(--lx-erro)' }, 'Erro ao carregar.')));
    }
  }

  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';
  if (filtroInicial) setFiltro(filtroInicial);
  container.append(kpisEl, tabFiltros, tabelaWrap);
  carregar();
}
