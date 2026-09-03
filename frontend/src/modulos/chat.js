import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post } from '../core/api.js';
import * as auth from '../core/auth.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
const hora = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
function lerArquivo(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
// Renderiza texto com links clicáveis.
function comLinks(txt) {
  const frag = el('span', {});
  String(txt || '').split(/(\s+)/).forEach(p => {
    if (/^https?:\/\//i.test(p)) frag.append(el('a', { href: p, target: '_blank', style: 'color:var(--lx-azul-primario);text-decoration:underline' }, p));
    else frag.append(document.createTextNode(p));
  });
  return frag;
}

export async function montar(container) {
  const ehLoja = (auth.usuarioAtual() || {}).perfil === 'loja';
  const titulo = ehLoja ? 'Mensagens' : 'Suporte';
  const podeResponder = auth.pode('chat.responder') || ehLoja;

  const meuId = (auth.usuarioAtual() || {}).id;
  let conversas = [], conversaSel = null, timerThread = null, timerInbox = null;

  const inbox = el('div', { style: 'width:250px;border-right:1px solid var(--lx-linha);overflow:auto;flex:none' });
  const thread = el('div', { style: 'flex:1;display:flex;flex-direction:column;min-width:0' });
  const wrap = el('div', { class: 'lx-card', style: 'padding:0;overflow:hidden;height:calc(100vh - 190px);display:flex' }, inbox, thread);

  const proto = (p) => el('span', { style: 'font-weight:800;color:var(--lx-azul-profundo,#042C53);background:#eaf1f9;border:1px solid #d4e2f2;border-radius:7px;padding:1px 7px;font-size:11.5px' }, '#' + (p || '—'));
  function seloEstado(c) {
    if (c.status === 'encerrada') return el('span', { style: 'font-size:9px;font-weight:800;border-radius:99px;padding:3px 8px;background:#eef2f7;color:var(--lx-tinta-3)' }, 'Encerrada');
    if (!c.atendente_id) return el('span', { style: 'font-size:9px;font-weight:800;border-radius:99px;padding:3px 8px;background:var(--lx-atencao-bg);color:#8a5a00' }, 'Aguardando');
    const meu = String(c.atendente_id) === String(meuId);
    return el('span', { style: `font-size:9px;font-weight:800;border-radius:99px;padding:3px 8px;background:${meu ? 'var(--lx-ok-bg)' : '#e4eef9'};color:${meu ? '#0f6e56' : 'var(--lx-azul-primario)'}` }, meu ? 'Você' : (c.atendente_nome || 'Em atendimento'));
  }

  function renderInbox() {
    inbox.innerHTML = '';
    if (!conversas.length) { inbox.append(el('div', { style: 'padding:24px;text-align:center;color:var(--lx-tinta-3);font-size:12.5px' }, 'Nenhuma conversa ainda.')); return; }
    conversas.forEach(c => {
      const on = conversaSel && conversaSel.id === c.id;
      const nome = ehLoja ? 'Corrida' : ((c.motoboy_codigo != null ? '#' + c.motoboy_codigo + ' ' : '') + (c.motoboy_nome || 'Entregador'));
      inbox.append(el('div', {
        style: `padding:11px 13px;border-bottom:1px solid var(--lx-linha);cursor:pointer;${on ? 'background:#eaf3fc' : ''}`,
        onClick: () => abrir(c),
      },
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px' },
          proto(c.protocolo), seloEstado(c)),
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:6px' },
          el('span', { style: 'font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, nome),
          c.nao_lidas ? el('span', { style: 'background:var(--lx-erro);color:#fff;font-size:9px;font-weight:800;border-radius:99px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 4px' }, String(c.nao_lidas)) : el('span', {})),
        el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.ultima_previa || 'sem mensagens')));
    });
  }

  async function recarregarInbox() {
    try {
      conversas = (await get('/chat/conversas')).conversas || [];
      const sig = conversas.map(c => c.id + ':' + c.nao_lidas + ':' + (c.ultima_previa || '') + ':' + (c.ultima_msg_em || '') + ':' + (c.status || '') + ':' + (c.atendente_id || '')).join('|');
      if (sig === recarregarInbox._sig) return; // nada mudou → não redesenha (evita piscar)
      recarregarInbox._sig = sig;
      renderInbox();
    } catch (e) { /* mantém */ }
  }

  const msgsDiv = el('div', { style: 'flex:1;overflow:auto;padding:14px;background:#e9eff6;display:flex;flex-direction:column;gap:8px' });
  const threadHd = el('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--lx-linha);font-size:13px;font-weight:800' }, 'Selecione uma conversa');
  const inpMsg = el('input', { class: 'lx-input', placeholder: 'Escreva uma mensagem…', style: 'flex:1;border-radius:99px' });
  const inpFoto = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const btnFoto = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:8px 12px', title: 'Enviar foto', onClick: () => inpFoto.click() }, '📎');
  const btnEnviar = el('button', { class: 'lx-btn lx-btn-primario', style: 'border-radius:99px;padding:9px 16px' }, 'Enviar');
  const composer = el('div', { style: 'display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--lx-linha)' }, btnFoto, inpMsg, btnEnviar, inpFoto);
  thread.append(threadHd, msgsDiv, composer);
  if (!podeResponder) composer.style.display = 'none';

  function bolha(m) {
    if (m.tipo === 'sistema') return el('div', { style: 'align-self:center;background:#dfe7f1;color:var(--lx-tinta-2);font-size:10.5px;font-weight:700;padding:4px 12px;border-radius:99px;margin:2px 0' }, m.texto || '');
    const meu = ehLoja ? m.autor_tipo === 'loja' : m.autor_tipo === 'central';
    const b = el('div', { style: `max-width:78%;padding:8px 11px;border-radius:14px;font-size:12.5px;line-height:1.4;box-shadow:0 1px 1px rgba(0,0,0,.05);align-self:${meu ? 'flex-end' : 'flex-start'};background:${meu ? '#d7ebff' : '#fff'};border-bottom-${meu ? 'right' : 'left'}-radius:5px` });
    if (m.tipo === 'foto' && m.midia_url) b.append(el('img', { src: m.midia_url, style: 'width:170px;max-width:100%;border-radius:9px;display:block;cursor:pointer', onClick: () => window.open(m.midia_url, '_blank') }));
    else if (m.tipo === 'local' && m.lat != null) b.append(el('a', { href: `https://maps.google.com/?q=${m.lat},${m.lng}`, target: '_blank', style: 'color:var(--lx-azul-primario);font-weight:700;text-decoration:none' }, '📍 Ver localização no mapa'));
    else b.append(comLinks(m.texto));
    b.append(el('div', { style: 'font-size:9.5px;color:var(--lx-tinta-3);margin-top:3px;text-align:right' }, hora(m.criado_em)));
    return b;
  }

  // Barra de estado do atendimento (aguardando / outro atendente). data-atendbar.
  function montarRodape(conv) {
    thread.querySelector('[data-encbar]')?.remove();
    thread.querySelector('[data-atendbar]')?.remove();
    const encerrada = conv.status === 'encerrada';
    if (encerrada) {
      composer.style.display = 'none';
      thread.append(el('div', { 'data-encbar': '1', style: 'padding:9px;text-align:center;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);background:#eef2f7;border-top:1px solid var(--lx-linha)' }, 'Conversa encerrada (corrida finalizada)'));
      return;
    }
    const souDono = conv.atendente_id && String(conv.atendente_id) === String(meuId);
    if (souDono && podeResponder) { composer.style.display = 'flex'; return; }
    // Não sou o dono → esconde composer e mostra barra com ação.
    composer.style.display = 'none';
    if (!podeResponder) return;
    const semDono = !conv.atendente_id;
    const bar = el('div', { 'data-atendbar': '1', style: `display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid var(--lx-linha);background:${semDono ? 'var(--lx-atencao-bg)' : '#eef4fb'}` },
      el('span', { style: `font-size:12px;font-weight:700;color:${semDono ? '#7a5300' : 'var(--lx-tinta-2)'}` }, semDono ? 'Aguardando atendimento — assuma para responder.' : ('Em atendimento por ' + (conv.atendente_nome || 'outro atendente'))),
      el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:12.5px;padding:8px 14px', onClick: () => assumir() }, semDono ? 'Assumir' : 'Puxar atendimento'));
    thread.append(bar);
  }

  async function assumir() {
    if (!conversaSel) return;
    try { await post('/chat/conversas/' + conversaSel.id + '/assumir', {}); carregarMensagens._sig = null; await carregarMensagens(); recarregarInbox(); }
    catch (e) { toast(e.message || 'Erro ao assumir', 'erro'); }
  }

  async function carregarMensagens() {
    if (!conversaSel) return;
    try {
      const r = await get('/chat/conversas/' + conversaSel.id + '/mensagens');
      const lista = r.mensagens || [];
      const conv = r.conversa || {};
      // Cabeçalho: protocolo em destaque + selo de estado.
      threadHd.innerHTML = '';
      const nome = ehLoja ? '' : ((conversaSel.motoboy_codigo != null ? '#' + conversaSel.motoboy_codigo + ' ' : '') + (conversaSel.motoboy_nome || 'Entregador') + ' · ');
      threadHd.append(el('span', {}, nome), proto(conv.protocolo), el('span', { style: 'margin-left:8px' }, seloEstado({ status: conv.status, atendente_id: conv.atendente_id, atendente_nome: conv.atendente_nome })));
      montarRodape(conv);
      const sig = lista.length + ':' + (lista.length ? lista[lista.length - 1].id : '') + ':' + (conv.status || '') + ':' + (conv.atendente_id || '');
      if (sig === carregarMensagens._sig) return; // sem mudança → não remonta (evita piscar)
      carregarMensagens._sig = sig;
      msgsDiv.innerHTML = '';
      lista.forEach(m => msgsDiv.append(bolha(m)));
      msgsDiv.scrollTop = msgsDiv.scrollHeight;
    } catch (e) { /* mantém */ }
  }

  function abrir(c) {
    conversaSel = c;
    threadHd.textContent = 'Carregando…';
    c.nao_lidas = 0; renderInbox();
    carregarMensagens._sig = null;
    carregarMensagens();
    clearInterval(timerThread); timerThread = setInterval(carregarMensagens, 3500);
  }

  async function enviar(payload) {
    if (!conversaSel) return;
    try { await post('/chat/conversas/' + conversaSel.id + '/mensagens', payload); inpMsg.value = ''; await carregarMensagens(); recarregarInbox(); }
    catch (e) { toast(e.message || 'Erro ao enviar', 'erro'); }
  }
  btnEnviar.onclick = () => { const t = inpMsg.value.trim(); if (t) enviar({ tipo: 'texto', texto: t }); };
  inpMsg.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnEnviar.click(); });
  inpFoto.addEventListener('change', async () => { const f = inpFoto.files[0]; if (!f) return; if (f.size > 8 * 1024 * 1024) { toast('Foto muito grande (máx 8MB)', 'erro'); return; } try { const dataUri = await lerArquivo(f); await enviar({ tipo: 'foto', arquivo: dataUri }); } catch { toast('Erro ao ler foto', 'erro'); } inpFoto.value = ''; });

  await recarregarInbox();
  timerInbox = setInterval(recarregarInbox, 8000);
  // Limpa timers ao sair da tela (o router troca o conteúdo do container).
  const obs = new MutationObserver(() => { if (!document.body.contains(wrap)) { clearInterval(timerThread); clearInterval(timerInbox); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });

  container.append(casca(titulo, wrap, ehLoja ? 'Converse com o entregador das suas corridas.' : 'Conversas dos entregadores com o suporte.'));
}
