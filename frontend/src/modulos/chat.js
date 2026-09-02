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

  let conversas = [], conversaSel = null, timerThread = null, timerInbox = null;

  const inbox = el('div', { style: 'width:230px;border-right:1px solid var(--lx-linha);overflow:auto;flex:none' });
  const thread = el('div', { style: 'flex:1;display:flex;flex-direction:column;min-width:0' });
  const wrap = el('div', { class: 'lx-card', style: 'padding:0;overflow:hidden;height:calc(100vh - 190px);display:flex' }, inbox, thread);

  function renderInbox() {
    inbox.innerHTML = '';
    if (!conversas.length) { inbox.append(el('div', { style: 'padding:24px;text-align:center;color:var(--lx-tinta-3);font-size:12.5px' }, 'Nenhuma conversa ainda.')); return; }
    conversas.forEach(c => {
      const on = conversaSel && conversaSel.id === c.id;
      const nome = ehLoja ? ('Corrida ' + (c.protocolo || '')) : ((c.motoboy_codigo != null ? '#' + c.motoboy_codigo + ' ' : '') + (c.motoboy_nome || 'Entregador'));
      inbox.append(el('div', {
        style: `padding:11px 13px;border-bottom:1px solid var(--lx-linha);cursor:pointer;${on ? 'background:#eaf3fc' : ''}`,
        onClick: () => abrir(c),
      },
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px' },
          el('span', { style: 'font-size:12.5px;font-weight:800' }, nome),
          c.nao_lidas ? el('span', { style: 'background:var(--lx-erro);color:#fff;font-size:9px;font-weight:800;border-radius:99px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 4px' }, String(c.nao_lidas)) : el('span', {})),
        el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
          (ehLoja ? '' : 'Corrida ' + (c.protocolo || '') + ' · ') + (c.ultima_previa || 'sem mensagens'))));
    });
  }

  async function recarregarInbox() {
    try { conversas = (await get('/chat/conversas')).conversas || []; renderInbox(); } catch (e) { /* mantém */ }
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

  async function carregarMensagens() {
    if (!conversaSel) return;
    try {
      const r = await get('/chat/conversas/' + conversaSel.id + '/mensagens');
      msgsDiv.innerHTML = '';
      (r.mensagens || []).forEach(m => msgsDiv.append(bolha(m)));
      msgsDiv.scrollTop = msgsDiv.scrollHeight;
      // Conversa encerrada: trava o composer.
      const encerrada = r.conversa && r.conversa.status === 'encerrada';
      composer.style.display = (!podeResponder || encerrada) ? 'none' : 'flex';
      if (encerrada && !msgsDiv.querySelector('[data-enc]')) {
        thread.querySelector('[data-encbar]')?.remove();
        const bar = el('div', { 'data-encbar': '1', style: 'padding:9px;text-align:center;font-size:11.5px;font-weight:700;color:var(--lx-tinta-2);background:#eef2f7;border-top:1px solid var(--lx-linha)' }, 'Conversa encerrada (corrida finalizada)');
        thread.append(bar);
      } else { thread.querySelector('[data-encbar]')?.remove(); }
    } catch (e) { /* mantém */ }
  }

  function abrir(c) {
    conversaSel = c;
    const nome = ehLoja ? ('Corrida ' + (c.protocolo || '')) : ((c.motoboy_codigo != null ? '#' + c.motoboy_codigo + ' ' : '') + (c.motoboy_nome || 'Entregador'));
    threadHd.textContent = nome + ' · Corrida ' + (c.protocolo || '');
    c.nao_lidas = 0; renderInbox();
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
