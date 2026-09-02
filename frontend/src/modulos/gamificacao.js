import { casca } from '../core/layout.js';
import { el, icones } from '../core/ui.js';
import { get, put } from '../core/api.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;max-width:380px;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
const ic = (k, cor) => el('span', { class: 'lx-ic', style: `display:inline-flex;color:${cor || 'var(--lx-tinta-2)'}`, html: icones[k] || '' });

const ABAS = [
  { id: 'metricas', rotulo: 'Métricas e pontos' },
  { id: 'niveis',   rotulo: 'Níveis' },
  { id: 'campanhas', rotulo: 'Campanhas', breve: true },
  { id: 'premios',   rotulo: 'Prêmios', breve: true },
  { id: 'config',    rotulo: 'Config', breve: true },
];

export async function montar(container) {
  let cfg = { metricas: {}, niveis: [] };
  try { cfg = await get('/score/config'); } catch (e) { toast(e.message || 'Erro ao carregar', 'erro'); }

  let aba = 'metricas';
  const painel = el('div', {});

  const nav = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:18px;flex-wrap:wrap' });
  function renderNav() {
    nav.innerHTML = '';
    ABAS.forEach((a) => {
      const on = a.id === aba;
      nav.append(el('button', {
        style: `background:none;border:none;padding:11px 15px;font-size:13px;font-weight:700;cursor:pointer;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px;display:flex;align-items:center;gap:7px`,
        onClick: () => { aba = a.id; render(); },
      }, a.rotulo, a.breve ? el('span', { style: 'font-size:9.5px;font-weight:800;background:#eef2f7;color:var(--lx-tinta-3);border-radius:99px;padding:2px 6px' }, 'em breve') : ''));
    });
  }

  // ── Aba: Métricas e pontos ──
  function abaMetricas() {
    const wrap = el('div', {});
    wrap.append(el('div', { style: 'display:flex;gap:9px;align-items:flex-start;background:var(--lx-info-bg);border:1px solid #cfe3fb;border-radius:11px;padding:11px 13px;font-size:12px;color:#1f4b78;margin-bottom:16px' },
      ic('sc_info', 'var(--lx-azul-primario)'),
      el('div', { html: 'Valores <b>padrão desta empresa</b>. As campanhas (em breve) poderão herdar ou sobrescrever. Métricas marcadas com <b>⚡ em vigor</b> já entram no cálculo atual; as demais entram com o motor de campanhas.' })));

    const linhas = {};
    function grupo(titulo, iconeKey, cor, chaves) {
      const box = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:12px;overflow:hidden;margin-bottom:16px' });
      box.append(el('div', { style: `display:flex;align-items:center;gap:7px;padding:10px 14px;background:var(--lx-superficie-2);font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:${cor}` }, ic(iconeKey, cor), titulo));
      chaves.forEach((k, i) => {
        const met = cfg.metricas[k] || {};
        const inp = el('input', { class: 'lx-input', value: (met.pontos != null ? met.pontos : ''), style: 'width:88px;text-align:center;font-weight:800' });
        const sw = el('input', { type: 'checkbox', ...(met.ativo !== false ? { checked: true } : {}) });
        linhas[k] = { inp, sw };
        box.append(el('div', { style: `display:grid;grid-template-columns:28px 1fr 96px 60px;align-items:center;gap:12px;padding:11px 14px;${i < chaves.length - 1 ? 'border-bottom:1px solid var(--lx-linha)' : ''}` },
          ic(met.icone || 'sc_check', 'var(--lx-tinta-2)'),
          el('div', {}, el('div', { style: 'font-size:13px;font-weight:700' },
            met.rotulo || k,
            met.emVigor ? el('span', { style: 'font-size:9.5px;font-weight:800;color:var(--lx-ok);background:var(--lx-ok-bg);border-radius:6px;padding:2px 6px;margin-left:8px' }, '⚡ em vigor') : '')),
          inp,
          el('div', { style: 'display:flex;justify-content:flex-end' }, sw)));
      });
      return box;
    }

    const ganha = Object.keys(cfg.metricas).filter((k) => (cfg.metricas[k].grupo || 'ganha') === 'ganha');
    const perde = Object.keys(cfg.metricas).filter((k) => cfg.metricas[k].grupo === 'perde');
    wrap.append(grupo('Ganha pontos', 'sc_up', 'var(--lx-ok)', ganha));
    wrap.append(grupo('Perde pontos', 'sc_down', 'var(--lx-erro)', perde));

    wrap.append(el('div', { style: 'display:flex;gap:8px;align-items:flex-start;background:var(--lx-atencao-bg);border:1px solid #f0dca6;border-radius:9px;padding:9px 12px;font-size:11px;color:#8a5a00;margin-bottom:16px' },
      ic('sc_shield', 'var(--lx-atencao)'),
      el('div', {}, 'Guardrail fixo: nunca pontuar por velocidade — só pontualidade dentro do SLA. Protege o entregador na rua.')));

    const btn = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const metricas = { ...cfg.metricas };
      for (const [k, { inp, sw }] of Object.entries(linhas)) {
        metricas[k] = { ...metricas[k], pontos: parseInt(inp.value, 10) || 0, ativo: sw.checked };
      }
      try { btn.disabled = true; await put('/score/config', { metricas, niveis: cfg.niveis }); cfg.metricas = metricas; toast('Métricas salvas'); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); } finally { btn.disabled = false; }
    } }, 'Salvar métricas e pontos');
    wrap.append(btn);
    return wrap;
  }

  // ── Aba: Níveis ──
  function abaNiveis() {
    const wrap = el('div', {});
    wrap.append(el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0 0 14px' }, 'Defina os níveis e a pontuação mínima de cada um. O entregador sobe conforme acumula pontos (janela de 30 dias).'));
    const lista = el('div', {});
    let niveis = (cfg.niveis || []).map((n) => ({ ...n }));

    function renderNiveis() {
      lista.innerHTML = '';
      niveis.forEach((n, idx) => {
        const inNome = el('input', { class: 'lx-input', value: n.nome || '', style: 'flex:1' });
        const inMin = el('input', { class: 'lx-input', value: (n.min != null ? n.min : 0), style: 'width:120px;text-align:center' });
        inNome.addEventListener('input', () => n.nome = inNome.value);
        inMin.addEventListener('input', () => n.min = parseInt(inMin.value, 10) || 0);
        const rem = el('button', { class: 'lx-btn lx-btn-secundario', style: 'color:var(--lx-erro);padding:8px 12px', onClick: () => { niveis.splice(idx, 1); renderNiveis(); } }, '×');
        lista.append(el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:10px' },
          ic('sc_medal', 'var(--lx-azul-primario)'),
          inNome, el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-3)' }, 'a partir de'), inMin, el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-3)' }, 'pts'), rem));
      });
    }
    renderNiveis();

    const add = el('button', { class: 'lx-btn lx-btn-secundario', style: 'margin-bottom:16px', onClick: () => { niveis.push({ nome: 'Novo nível', min: 0 }); renderNiveis(); } }, '+ Adicionar nível');
    const salvar = el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
      const limpos = niveis.filter((n) => (n.nome || '').trim()).sort((a, b) => (a.min || 0) - (b.min || 0));
      try { salvar.disabled = true; await put('/score/config', { metricas: cfg.metricas, niveis: limpos }); cfg.niveis = limpos; toast('Níveis salvos'); }
      catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); } finally { salvar.disabled = false; }
    } }, 'Salvar níveis');
    wrap.append(lista, add, el('div', {}, salvar));
    return wrap;
  }

  function abaBreve(nome) {
    return el('div', { style: 'text-align:center;padding:48px 20px;color:var(--lx-tinta-3)' },
      el('div', { style: 'display:inline-flex;color:var(--lx-tinta-3);margin-bottom:10px', html: icones.gamificacao }),
      el('div', { style: 'font-size:15px;font-weight:700;color:var(--lx-tinta-2)' }, nome + ' — em breve'),
      el('p', { style: 'font-size:12.5px;max-width:420px;margin:8px auto 0;line-height:1.5' }, 'Chega na próxima fase (campanhas com alvo por região/cliente/motoboy, prêmios em R$ no financeiro e ranking/ligas).'));
  }

  function render() {
    renderNav();
    painel.innerHTML = '';
    if (aba === 'metricas') painel.append(abaMetricas());
    else if (aba === 'niveis') painel.append(abaNiveis());
    else if (aba === 'campanhas') painel.append(abaBreve('Campanhas'));
    else if (aba === 'premios') painel.append(abaBreve('Prêmios'));
    else painel.append(abaBreve('Config'));
  }
  render();

  const conteudo = el('div', { class: 'lx-card', style: 'padding:22px;max-width:820px' }, nav, painel);
  container.append(casca('Gamificação', conteudo, 'Score, níveis, pontos e prêmios — configuração desta operação.'));
}
