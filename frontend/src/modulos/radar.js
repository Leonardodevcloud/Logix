import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, put } from '../core/api.js';
import * as auth from '../core/auth.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-navy,#042C53)'};color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:4000;box-shadow:0 10px 30px -8px rgba(0,0,0,.4)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

export async function montar(container) {
  const ehLoja = ((auth.acessoAtual && auth.acessoAtual()) || {}).perfil === 'loja';
  let _aba = 'alertas';
  const nav = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:18px' });
  const painel = el('div', {});

  const ABAS = ehLoja
    ? [{ id: 'alertas', rotulo: 'Alertas' }]
    : [{ id: 'alertas', rotulo: 'Alertas' }, { id: 'config', rotulo: 'Configuração' }];
  function renderNav() {
    nav.style.display = ehLoja ? 'none' : 'flex'; // uma aba só? não mostra a barra
    nav.innerHTML = '';
    ABAS.forEach(a => {
      const on = a.id === _aba;
      nav.append(el('button', {
        style: `background:none;border:none;padding:12px 16px;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _aba = a.id; renderNav(); render(); },
      }, a.rotulo));
    });
  }
  function render() {
    painel.innerHTML = '';
    painel.append(_aba === 'alertas' ? abaAlertas(ehLoja) : abaConfig());
  }
  renderNav(); render();
  const sub = ehLoja
    ? 'Entregas suas que estão paradas ou sem sinal, em rota.'
    : 'Motoboys parados ou sem sinal — só em corridas em rota (já coletadas).';
  container.append(casca('Radar operacional', el('div', {}, nav, painel), sub));
}

// ── Aba: Alertas ──────────────────────────────────────────────────
function abaAlertas(ehLoja) {
  const wrap = el('div', {});
  const aviso = el('div', {});
  const resumo = el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px' });
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  wrap.append(aviso, resumo, lista);
  let timer = null;

  function kpi(cor, n, rot) {
    return el('div', { style: 'background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:12px 16px;display:flex;align-items:center;gap:11px;min-width:140px' },
      el('span', { style: `width:10px;height:10px;border-radius:50%;background:${cor}` }),
      el('div', {}, el('div', { style: 'font-size:22px;font-weight:800;line-height:1' }, String(n)), el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);font-weight:600' }, rot)));
  }

  function cardAlerta(a) {
    const critico = a.severidade === 'critico';
    const semSinal = a.tipo === 'sem_sinal';
    const cor = semSinal ? 'var(--lx-azul-primario)' : (critico ? 'var(--lx-erro)' : '#b45309');
    const badge = el('span', { style: `font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;color:${cor};background:${semSinal ? '#eaf3ff' : (critico ? 'var(--lx-erro-bg)' : '#fff7e6')}` }, semSinal ? 'Sem sinal' : (critico ? 'Crítico' : 'Atenção'));
    const iniciais = (a.motoboy_nome || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
    const tel = soDigitos(a.telefone_principal);

    const btn = (txt, extra, onClick) => el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;padding:6px 11px' + (extra || ''), onClick }, txt);
    const acoes = ehLoja ? el('div', { style: 'margin-left:auto' }) : el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-left:auto' },
      tel ? btn('Ligar', '', () => { location.href = 'tel:' + tel; }) : el('span', {}),
      tel ? btn('Mensagem', '', () => { window.open(`https://wa.me/55${tel}?text=` + encodeURIComponent(`Olá ${a.motoboy_nome || ''}, tudo certo com a entrega ${a.protocolo}? Notamos que você está parado há ${a.minutos} min.`), '_blank'); }) : el('span', {}),
      btn('Ver no mapa', '', () => { window.open('/#/mapa?foco=' + a.motoboy_id, '_blank'); }),
      btn('Dispensar', ';color:var(--lx-tinta-3)', () => dispensar(a)));

    return el('div', { style: `background:var(--lx-superficie);border:1px solid var(--lx-linha);border-left:4px solid ${cor};border-radius:var(--lx-raio);padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap` },
      el('div', { style: 'width:40px;height:40px;border-radius:50%;background:#dcebfb;display:grid;place-items:center;font-weight:800;color:var(--lx-azul-primario);flex:none' }, iniciais),
      el('div', { style: 'min-width:150px' },
        el('div', { style: 'font-weight:700;font-size:14px' }, a.motoboy_nome || '—'),
        el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);font-weight:600' }, '#' + String(a.motoboy_codigo || 0).padStart(3, '0'))),
      el('div', { style: 'min-width:160px' },
        el('div', { style: `font-weight:800;font-size:15px;color:${cor}` }, (semSinal ? 'Sem sinal há ' : 'Parado há ') + a.minutos + ' min'),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, semSinal ? 'App fechado ou GPS off?' : 'Corrida em rota')),
      badge,
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);min-width:120px' }, el('b', { style: 'color:var(--lx-tinta)' }, a.protocolo)),
      acoes);
  }

  async function dispensar(a) {
    try { await post(`/radar/alertas/${a.id}/dispensar`, { minutos: 30 }); toast('Alerta dispensado por 30 min'); carregar(); }
    catch (e) { toast(e.message || 'Erro', 'erro'); }
  }

  async function carregar() {
    if (!document.body.contains(wrap)) { if (timer) clearInterval(timer); return; }
    try {
      if (!ehLoja) {
        const cfg = await get('/radar/config');
        if (!cfg.configurado || !cfg.ativo) {
          aviso.innerHTML = '';
          aviso.append(el('div', { style: 'background:#fff7e6;border:1px solid #ffe4b0;border-radius:var(--lx-raio);padding:16px 18px;margin-bottom:16px;font-size:13.5px;color:#8a5a12' },
            el('b', {}, 'Radar desligado. '), 'Defina os limites na aba ', el('b', {}, 'Configuração'), ' para ativar o monitoramento.'));
          resumo.innerHTML = ''; lista.innerHTML = '';
          return;
        }
      }
      aviso.innerHTML = '';
      const r = await get('/radar/alertas');
      const al = r.alertas || [];
      const critParado = al.filter(a => a.tipo === 'parado' && a.severidade === 'critico').length;
      const atenParado = al.filter(a => a.tipo === 'parado' && a.severidade === 'atencao').length;
      const semSinal = al.filter(a => a.tipo === 'sem_sinal').length;
      resumo.innerHTML = '';
      resumo.append(kpi('var(--lx-erro)', critParado, 'Parados (crítico)'), kpi('#b45309', atenParado, 'Parados (atenção)'), kpi('var(--lx-azul-primario)', semSinal, 'Sem sinal'));
      lista.innerHTML = '';
      if (!al.length) lista.append(el('div', { style: 'padding:30px;text-align:center;color:var(--lx-tinta-3);font-size:13px;border:1px dashed var(--lx-linha);border-radius:var(--lx-raio)' }, 'Nenhum alerta agora — tudo em movimento. ✓'));
      else al.forEach(a => lista.append(cardAlerta(a)));
    } catch (e) {
      lista.innerHTML = ''; lista.append(el('div', { style: 'padding:16px;color:var(--lx-erro);font-size:13px' }, e.message || 'Erro ao carregar'));
    }
  }

  carregar();
  timer = setInterval(carregar, 20000); // atualiza a cada 20s
  return wrap;
}

// ── Aba: Configuração ─────────────────────────────────────────────
function abaConfig() {
  const wrap = el('div', { style: 'max-width:640px' });

  const num = (val) => el('input', { class: 'lx-input', type: 'number', min: '1', value: val == null ? '' : String(val), style: 'width:90px;text-align:center' });
  const fAtencao = num(null), fCritico = num(null), fRaio = num(null), fSemSinal = num(null);
  let ativo = false, push = false;

  const swAtivo = el('div', {});
  const swPush = el('div', {});
  function pintaSw(sw, on) {
    sw.style.cssText = `width:46px;height:26px;border-radius:99px;position:relative;flex:none;cursor:pointer;transition:background .15s;background:${on ? 'var(--lx-ok)' : '#c9d6e5'}`;
    sw.innerHTML = `<span style="position:absolute;top:3px;${on ? 'right:3px' : 'left:3px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:all .15s"></span>`;
  }
  swAtivo.onclick = () => { ativo = !ativo; pintaSw(swAtivo, ativo); };
  swPush.onclick = () => { push = !push; pintaSw(swPush, push); };

  function linha(titulo, desc, campo, sufixo) {
    return el('div', { style: 'display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--lx-linha)' },
      el('div', { style: 'flex:1' },
        el('div', { style: 'font-weight:700;font-size:13.5px' }, titulo),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, desc)),
      campo,
      sufixo ? el('span', { style: 'font-size:12px;color:var(--lx-tinta-2);width:26px' }, sufixo) : el('span', { style: 'width:26px' }));
  }

  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:18px', onClick: salvar }, 'Salvar');
  const status = el('span', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-left:12px' });

  const corpo = el('div', { style: 'background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:6px 20px' },
    linha('Radar ligado', 'Só monitora quando ligado E com todos os limites preenchidos.', swAtivo),
    linha('Parado — atenção (amarelo)', 'Sem se mover por este tempo, em rota, vira alerta de atenção.', fAtencao, 'min'),
    linha('Parado — crítico (vermelho)', 'A partir daqui, alerta crítico e destaque no mapa.', fCritico, 'min'),
    linha('Raio de "parado"', 'Deslocamento abaixo disso conta como parado (evita falso alerta por GPS tremendo).', fRaio, 'm'),
    linha('Sem sinal', 'Sem mandar posição por este tempo, com corrida ativa, = alerta "sem sinal".', fSemSinal, 'min'),
    linha('Avisar a central por push', 'Além do painel, notifica os admins quando for crítico.', swPush));

  wrap.append(corpo, el('div', { style: 'display:flex;align-items:center;margin-top:4px' }, btnSalvar, status));

  async function carregar() {
    try {
      const c = await get('/radar/config');
      ativo = !!c.ativo; push = !!c.push_central;
      fAtencao.value = c.parado_atencao_min == null ? '' : c.parado_atencao_min;
      fCritico.value = c.parado_critico_min == null ? '' : c.parado_critico_min;
      fRaio.value = c.raio_parado_m == null ? '' : c.raio_parado_m;
      fSemSinal.value = c.sem_sinal_min == null ? '' : c.sem_sinal_min;
      pintaSw(swAtivo, ativo); pintaSw(swPush, push);
      status.textContent = c.configurado ? '' : 'Ainda não configurado — o radar está desligado.';
    } catch (e) { status.textContent = e.message || 'Erro'; }
  }
  async function salvar() {
    try {
      btnSalvar.disabled = true;
      const c = await put('/radar/config', {
        ativo, push_central: push,
        parado_atencao_min: fAtencao.value, parado_critico_min: fCritico.value,
        raio_parado_m: fRaio.value, sem_sinal_min: fSemSinal.value,
      });
      status.textContent = c.ativo ? 'Salvo — radar ativo.' : 'Salvo — radar desligado.';
      toast('Configuração salva');
    } catch (e) { toast(e.message || 'Erro', 'erro'); status.textContent = e.message || ''; }
    finally { btnSalvar.disabled = false; }
  }
  pintaSw(swAtivo, false); pintaSw(swPush, false);
  carregar();
  return wrap;
}
