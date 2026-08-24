import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import * as auth from '../core/auth.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${tipo === 'erro' ? 'var(--lx-erro,#dc2626)' : 'var(--lx-navy,#042C53)'};color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:4000;box-shadow:0 10px 30px -8px rgba(0,0,0,.4)` }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}

function copiar(txt) {
  try { navigator.clipboard.writeText(txt); toast('Copiado!'); }
  catch { toast('Não foi possível copiar', 'erro'); }
}

const ICONE_COPIAR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const ROTULO_OP = { calcular: 'Calcular serviços', gravar: 'Gravar serviços', cancelar: 'Cancelar serviços', status: 'Status serviços' };

// Campo com valor monospace + botão copiar (usado nos tokens).
function campoToken(rotulo, valor) {
  return el('div', { style: 'border:1px solid var(--lx-linha);border-radius:10px;padding:11px 13px;background:var(--lx-superficie-2,rgba(0,0,0,.02))' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px' },
      el('div', { style: 'font-weight:700;font-size:12.5px;color:var(--lx-tinta)' }, rotulo),
      el('button', { class: 'lx-btn lx-btn-fantasma', style: 'padding:3px 7px;line-height:1', title: 'Copiar', html: ICONE_COPIAR, onClick: () => copiar(valor) })),
    el('div', { style: 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--lx-tinta-2);margin-top:4px;word-break:break-all' }, valor));
}

// Modal genérico (overlay + card).
function abrirModal(titulo, ...conteudo) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,20,40,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:1000;overflow:auto' });
  const fechar = () => { try { document.body.removeChild(overlay); } catch {} };
  const card = el('div', { class: 'lx-card', style: 'max-width:640px;width:100%;padding:20px 22px' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px' },
      el('h3', { style: 'margin:0;font-size:16px' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:16px;padding:2px 10px', onClick: fechar }, '×')),
    ...conteudo);
  overlay.append(card); document.body.append(overlay);
  return { overlay, fechar, card };
}

// Mostra os tokens gerados (uma única vez) no estilo do painel de integração.
function mostrarTokens({ nome, cod_cliente, tokens }) {
  const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });
  Object.keys(tokens).forEach((op) => grid.append(campoToken(ROTULO_OP[op] || op, tokens[op])));
  grid.append(campoToken('Código do cliente', cod_cliente));

  abrirModal('Tokens de autenticação' + (nome ? ' — ' + nome : ''),
    el('div', { style: 'background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.3);border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--lx-erro,#dc2626);font-weight:600;margin-bottom:14px' },
      'Copie e guarde agora. Por segurança, o segredo não é exibido de novo — se perder, gere novos tokens.'),
    grid);
}

// ── Modal de criar / editar chave ────────────────────────────────────────────
async function modalNovaChave(lojas, aoSalvar) {
  const inpNome = el('input', { class: 'lx-input', placeholder: 'Ex.: ERP do cliente X' });
  const selLoja = el('select', { class: 'lx-input' }, el('option', { value: '' }, '— Sem loja (usa preço da central) —'));
  (lojas || []).forEach((l) => selLoja.append(el('option', { value: l.id }, l.nome_fantasia || l.nome || l.id)));
  const inpUrl = el('input', { class: 'lx-input', placeholder: 'https://sistema-do-cliente.com/webhook (opcional)' });

  const { fechar } = abrirModal('Nova integração',
    el('div', { class: 'lx-field' }, el('label', {}, 'Nome da integração'), inpNome),
    el('div', { class: 'lx-field', style: 'margin-top:10px' }, el('label', {}, 'Loja vinculada'), selLoja),
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin:-4px 0 10px' }, 'Toda corrida criada por esta chave nasce nesta loja e usa o motor de preço configurado para ela.'),
    el('div', { class: 'lx-field' }, el('label', {}, 'URL de notificação (webhook)'), inpUrl),
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin:-4px 0 14px' }, 'Para onde enviamos o status da corrida (recebeu, coletou, finalizou, cancelou) com as coordenadas do motoboy. Deixe em branco se não usar.'),
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' },
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: fechar }, 'Cancelar'),
      el('button', { class: 'lx-btn lx-btn-primario', onClick: async () => {
        if (!inpNome.value.trim()) { toast('Informe um nome', 'erro'); return; }
        try {
          const r = await post('/integracoes/chaves', {
            nome: inpNome.value.trim(), loja_id: selLoja.value || null, url_notificacao: inpUrl.value.trim() || null,
          });
          fechar();
          mostrarTokens({ nome: inpNome.value.trim(), cod_cliente: r.cod_cliente, tokens: r.tokens });
          aoSalvar && aoSalvar();
        } catch (e) { toast('Erro: ' + (e.message || 'falha ao criar'), 'erro'); }
      } }, 'Criar e gerar tokens')));
}

// ── Card de uma chave ────────────────────────────────────────────────────────
function cardChave(c, lojas, recarregar) {
  const badge = el('span', {
    style: `font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;${c.ativa ? 'background:rgba(31,157,107,.14);color:var(--lx-ok,#1f9d6b)' : 'background:rgba(220,38,38,.12);color:var(--lx-erro,#dc2626)'}`,
  }, c.ativa ? 'Ativa' : 'Inativa');

  const linhaCod = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:8px' },
    el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2);min-width:118px' }, 'Código do cliente'),
    el('code', { style: 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--lx-tinta)' }, c.cod_cliente),
    el('button', { class: 'lx-btn lx-btn-fantasma', style: 'padding:2px 6px', html: ICONE_COPIAR, onClick: () => copiar(c.cod_cliente) }));

  const linhaToken = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:4px' },
    el('span', { style: 'font-size:11.5px;color:var(--lx-tinta-2);min-width:118px' }, 'Segredo (prefixo)'),
    el('code', { style: 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:var(--lx-tinta-2)' }, c.token_prefixo + '••••••••••••••••••••••••'));

  // Webhook editável inline
  const inpUrl = el('input', { class: 'lx-input', style: 'font-size:12.5px', value: c.url_notificacao || '', placeholder: 'URL de notificação (opcional)' });
  const btnSalvarUrl = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px', onClick: async () => {
    try { await put('/integracoes/chaves/' + c.id, { url_notificacao: inpUrl.value.trim() || null }); toast('Webhook salvo'); }
    catch (e) { toast('Erro: ' + e.message, 'erro'); }
  } }, 'Salvar');

  const acoes = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px' },
    el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px', onClick: () => alternar() }, c.ativa ? 'Desativar' : 'Ativar'),
    el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px', onClick: () => regenerar() }, 'Gerar novos tokens'),
    el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px', onClick: () => verRequisicoes() }, 'Requisições'),
    el('button', { class: 'lx-btn lx-btn-perigo', style: 'font-size:12.5px', onClick: () => excluir() }, 'Excluir'));

  async function alternar() {
    try { await patch('/integracoes/chaves/' + c.id + '/ativa', { ativa: !c.ativa }); recarregar(); }
    catch (e) { toast('Erro: ' + e.message, 'erro'); }
  }
  async function regenerar() {
    if (!confirm('Gerar novos tokens invalida os atuais. O sistema do cliente precisará dos novos. Continuar?')) return;
    try { const r = await post('/integracoes/chaves/' + c.id + '/regenerar'); mostrarTokens({ nome: c.nome, cod_cliente: r.cod_cliente, tokens: r.tokens }); }
    catch (e) { toast('Erro: ' + e.message, 'erro'); }
  }
  async function excluir() {
    if (!confirm('Excluir a integração "' + c.nome + '"? O sistema do cliente perderá o acesso imediatamente.')) return;
    try { await del('/integracoes/chaves/' + c.id); toast('Integração removida'); recarregar(); }
    catch (e) { toast('Erro: ' + e.message, 'erro'); }
  }
  async function verRequisicoes() {
    let dados = [];
    try { dados = await get('/integracoes/chaves/' + c.id + '/requisicoes'); }
    catch (e) { toast('Erro: ' + e.message, 'erro'); return; }
    const linhas = dados.length ? dados.map((r) => el('tr', {},
      el('td', {}, new Date(r.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })),
      el('td', {}, r.operacao),
      el('td', {}, r.os || r.referencia_externa || '—'),
      el('td', { style: r.status_http >= 400 ? 'color:var(--lx-erro,#dc2626)' : '' }, r.status_http || '—'),
      el('td', { style: 'color:var(--lx-tinta-2)' }, r.erro || ''),
    )) : [el('tr', {}, el('td', { colspan: '5', style: 'text-align:center;color:var(--lx-tinta-2);padding:16px' }, 'Nenhuma requisição ainda.'))];
    abrirModal('Requisições — ' + c.nome,
      el('div', { style: 'max-height:60vh;overflow:auto' },
        el('table', { class: 'lx-table', style: 'width:100%;font-size:12px' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Quando'), el('th', {}, 'Operação'), el('th', {}, 'OS/Ref'), el('th', {}, 'HTTP'), el('th', {}, 'Erro'))),
          el('tbody', {}, ...linhas))));
  }

  return el('div', { class: 'lx-card', style: 'padding:16px 18px;margin-bottom:12px' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' },
      el('div', {}, el('div', { style: 'font-weight:700;font-size:14.5px;color:var(--lx-tinta)' }, c.nome),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, c.loja_nome ? 'Loja: ' + c.loja_nome : 'Sem loja vinculada')),
      badge),
    linhaCod, linhaToken,
    el('div', { style: 'display:flex;gap:8px;align-items:end;margin-top:10px' },
      el('div', { class: 'lx-field', style: 'flex:1;margin:0' }, el('label', { style: 'font-size:11px' }, 'Webhook de notificação'), inpUrl), btnSalvarUrl),
    acoes);
}

// ── Bloco de documentação (endpoint + exemplo) ───────────────────────────────
function blocoDocs() {
  const baseUrl = location.origin + '/api/v1/integracao';
  const exemplo =
`POST ${baseUrl}/gravar
Content-Type: application/json

{
  "token": "<segredo>-gravar",
  "codCliente": "<codigo do cliente>",
  "numeroPedido": "1234",
  "pontos": [
    { "rua": "Coleta", "cidade": "Salvador", "uf": "BA", "la": "-12.97", "lo": "-38.50" },
    { "rua": "Entrega", "cidade": "Salvador", "uf": "BA", "la": "-12.99", "lo": "-38.45",
      "procurarPor": "Cliente", "telefone": "71 90000-0000", "numeroNota": "998" }
  ]
}`;
  return el('details', { class: 'lx-card', style: 'padding:14px 18px;margin-bottom:16px' },
    el('summary', { style: 'cursor:pointer;font-weight:700;font-size:13.5px;color:var(--lx-tinta)' }, 'Como o cliente integra (endpoints e exemplo)'),
    el('div', { style: 'margin-top:12px;font-size:12.5px;color:var(--lx-tinta-2);line-height:1.6' },
      el('div', {}, 'Envie um JSON via POST. Autenticação por ', el('b', {}, 'codCliente'), ' + ', el('b', {}, 'token'), ' no corpo. Endpoints:'),
      el('ul', { style: 'margin:8px 0 0;padding-left:18px' },
        el('li', {}, el('code', {}, baseUrl + '/gravar'), ' — cria a corrida (mín. 2 pontos: o 1º é a coleta)'),
        el('li', {}, el('code', {}, baseUrl + '/status'), ' — consulta o status'),
        el('li', {}, el('code', {}, baseUrl + '/cancelar'), ' — cancela pela OS'),
        el('li', {}, el('code', {}, baseUrl + '/calcular'), ' — prévia de distância/valor'))),
    el('pre', { style: 'margin-top:12px;background:var(--lx-navy,#042C53);color:#dbeafe;padding:12px 14px;border-radius:10px;font-size:11.5px;overflow:auto;line-height:1.5' }, exemplo));
}

// ── Montagem ─────────────────────────────────────────────────────────────────
export async function montar(container) {
  const pode = (p) => (auth.pode ? auth.pode(p) : true);
  const podeGerenciar = pode('integracoes.gerenciar');

  const lista = el('div', {});
  let lojas = [];

  async function recarregar() {
    lista.innerHTML = '';
    let chaves = [];
    try { chaves = await get('/integracoes/chaves'); }
    catch (e) { lista.append(el('div', { style: 'color:var(--lx-erro,#dc2626);padding:14px' }, 'Erro ao carregar: ' + e.message)); return; }
    if (!chaves.length) {
      lista.append(el('div', { class: 'lx-card', style: 'padding:28px;text-align:center;color:var(--lx-tinta-2)' },
        el('div', { style: 'font-weight:700;color:var(--lx-tinta);margin-bottom:4px' }, 'Nenhuma integração ainda'),
        'Crie uma chave para o sistema do cliente enviar corridas para a plataforma.'));
      return;
    }
    chaves.forEach((c) => lista.append(cardChave(c, lojas, recarregar)));
  }

  try { lojas = await get('/lojas'); } catch { lojas = []; }

  const topo = el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:14px' });
  if (podeGerenciar) {
    topo.append(el('button', { class: 'lx-btn lx-btn-primario', onClick: () => modalNovaChave(lojas, recarregar) }, '+ Nova integração'));
  }

  const conteudo = el('div', {}, topo, blocoDocs(), lista);
  container.append(casca('Integrações (API)', conteudo,
    'Chaves de API para o sistema do cliente criar e acompanhar corridas na plataforma.'));
  await recarregar();
}
