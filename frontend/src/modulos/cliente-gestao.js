import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import { EditorSla } from './sla-editor.js';
import { EditorValores } from './valores-editor.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:3000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo === 'erro' ? 'var(--lx-erro-bg)' : 'var(--lx-ok-bg)'};color:${tipo === 'erro' ? 'var(--lx-erro)' : 'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}
function confirmar(titulo, texto, onSim, rotuloSim = 'Confirmar', perigo = false) {
  const btn = el('button', { class: 'lx-btn lx-btn-primario', style: perigo ? 'background:var(--lx-erro)' : '' }, rotuloSim);
  const ov = miniModal(titulo, el('p', { style: 'font-size:14px' }, texto), [
    el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
  ]);
  btn.onclick = async () => { btn.disabled = true; try { await onSim(); ov.remove(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
}
function miniModal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:2500' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:26px;width:480px;max-width:94vw;max-height:88vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:18px' },
      el('h3', { style: 'font-size:17px;font-weight:800;margin:0' }, titulo),
      el('button', { style: 'background:none;border:none;font-size:22px;cursor:pointer;color:var(--lx-tinta-3)', onClick: () => overlay.remove() }, '×')),
    corpo,
    acoes ? el('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:22px' }, ...acoes) : el('span', {}));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}
function inp(ph, val = '', tipo = 'text') { return el('input', { class: 'lx-input', type: tipo, placeholder: ph, value: val }); }
function campo(rotulo, elemento) { return el('div', { class: 'lx-field' }, el('label', {}, rotulo), elemento); }

// Painel grande de gestão do cliente. `loja` = registro da loja. `aoFechar` recarrega a lista.
export function abrirGestaoCliente(loja, aoFechar) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.5);display:flex;align-items:center;justify-content:center;z-index:1500' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);width:880px;max-width:96vw;height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px -20px rgba(4,44,83,.45)' });

  const head = el('div', { style: 'padding:20px 26px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between' },
    el('div', {},
      el('h2', { style: 'font-size:19px;font-weight:800;margin:0' }, loja.nome_fantasia),
      el('div', { style: 'font-size:13px;color:var(--lx-tinta-2);margin-top:2px' }, 'Gestão do cliente')),
    el('button', { style: 'background:none;border:none;font-size:24px;cursor:pointer;color:var(--lx-tinta-3)', onClick: fechar }, '×'));

  const ABAS = [
    { id: 'centros', rotulo: 'Centros de custo' },
    { id: 'usuarios', rotulo: 'Usuários' },
    { id: 'modalidades', rotulo: 'Modalidades de frete' },
    { id: 'regras', rotulo: 'Regras de acionamento' },
    { id: 'motos', rotulo: 'Atribuição de motos' },
    { id: 'sla', rotulo: 'SLA' },
    { id: 'valores', rotulo: 'Valores' },
  ];
  let _aba = 'centros';
  const nav = el('div', { style: 'display:flex;gap:2px;padding:0 26px;border-bottom:1px solid var(--lx-linha);overflow-x:auto' });
  const corpo = el('div', { style: 'flex:1;overflow:auto;padding:24px 26px' });

  function renderNav() {
    nav.innerHTML = '';
    ABAS.forEach(a => {
      const on = a.id === _aba;
      nav.append(el('button', {
        style: `background:none;border:none;padding:12px 14px;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _aba = a.id; renderNav(); renderCorpo(); },
      }, a.rotulo));
    });
  }
  function renderCorpo() {
    corpo.innerHTML = '';
    if (_aba === 'centros') corpo.append(abaCentros(loja));
    else if (_aba === 'usuarios') corpo.append(abaUsuarios(loja));
    else if (_aba === 'modalidades') corpo.append(abaModalidades(loja));
    else if (_aba === 'regras') corpo.append(abaRegras(loja));
    else if (_aba === 'motos') corpo.append(abaMotos(loja));
    else if (_aba === 'sla') corpo.append(abaSlaCliente(loja));
    else if (_aba === 'valores') corpo.append(abaValoresCliente(loja));
  }
  function fechar() { overlay.remove(); if (aoFechar) aoFechar(); }

  box.append(head, nav, corpo);
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
  document.body.append(overlay);
  renderNav();
  renderCorpo();
}

// Cabeçalho de seção com botão de ação à direita.
function secHead(titulo, sub, btn) {
  return el('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap' },
    el('div', {}, el('h3', { style: 'font-size:15px;font-weight:800;margin:0 0 2px' }, titulo),
      sub ? el('p', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin:0' }, sub) : el('span', {})),
    btn || el('span', {}));
}
function vazio(txt) { return el('div', { style: 'text-align:center;padding:40px 20px;color:var(--lx-tinta-3);font-size:13px' }, txt); }

// ── Aba 1: Centros de custo ───────────────────────────────────────
function abaCentros(loja) {
  const wrap = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const btnNovo = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => formCentro() }, '+ Novo centro de custo');
  wrap.append(secHead('Centros de custo', 'Organize a operação do cliente por centro de custo e crie usuários para cada um.', btnNovo), lista);

  async function carregar() {
    lista.innerHTML = '<div style="color:var(--lx-tinta-3);font-size:13px;padding:16px">Carregando…</div>';
    try { const cs = await get(`/clientes/${loja.id}/centros`); render(cs); }
    catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro')); }
  }
  function render(cs) {
    lista.innerHTML = '';
    if (!cs.length) { lista.append(vazio('Nenhum centro de custo ainda.')); return; }
    cs.forEach(c => lista.append(
      el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px' },
        el('div', {},
          el('div', { style: 'font-weight:700;font-size:14px' }, c.nome, c.codigo ? el('span', { style: 'font-size:12px;color:var(--lx-tinta-3);font-weight:600;margin-left:8px' }, c.codigo) : ''),
          el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, `${c.total_usuarios} usuário(s)`)),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:12px', onClick: () => formUsuarioCentro(c) }, '+ Usuário'),
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:12px', onClick: () => formCentro(c) }, 'Editar'),
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px;color:var(--lx-erro)', onClick: () => confirmar('Excluir centro', `Excluir o centro “${c.nome}”?`, async () => { await del(`/clientes/${loja.id}/centros/${c.id}`); toast('Excluído'); carregar(); }, 'Excluir', true) }, 'Excluir')))));
  }
  function formCentro(c) {
    const nome = inp('Ex: Matriz, Filial Centro…', c?.nome || '');
    const codigo = inp('Código (opcional)', c?.codigo || '');
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, c ? 'Salvar' : 'Criar');
    const ov = miniModal(c ? 'Editar centro de custo' : 'Novo centro de custo', el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, campo('Nome', nome), campo('Código', codigo)), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => {
      if (!nome.value.trim()) { toast('Informe o nome', 'erro'); return; }
      try { btn.disabled = true;
        if (c) await put(`/clientes/${loja.id}/centros/${c.id}`, { nome: nome.value.trim(), codigo: codigo.value.trim() || null });
        else await post(`/clientes/${loja.id}/centros`, { nome: nome.value.trim(), codigo: codigo.value.trim() || null });
        ov.remove(); toast('Salvo'); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  function formUsuarioCentro(c) {
    const nome = inp('Nome completo'); const email = inp('E-mail', '', 'email');
    const tel = inp('Telefone (opcional)'); const senha = inp('Senha', '', 'password');
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Criar usuário');
    const ov = miniModal(`Novo usuário — ${c.nome}`, el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, campo('Nome', nome), campo('E-mail', email), campo('Telefone', tel), campo('Senha', senha)), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => {
      if (!nome.value.trim() || !email.value.trim() || !senha.value) { toast('Preencha nome, e-mail e senha', 'erro'); return; }
      try { btn.disabled = true; await post(`/clientes/${loja.id}/centros/${c.id}/usuarios`, { nome: nome.value.trim(), email: email.value.trim(), telefone: tel.value.trim() || null, senha: senha.value }); ov.remove(); toast('Usuário criado'); carregar(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  carregar();
  return wrap;
}

// ── Aba 2: Usuários avulsos ───────────────────────────────────────
function abaUsuarios(loja) {
  const wrap = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const btnNovo = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => formUsuario() }, '+ Novo usuário');
  wrap.append(secHead('Usuários do cliente', 'Crie, edite e remova usuários de acesso deste cliente.', btnNovo), lista);

  async function carregar() {
    lista.innerHTML = '<div style="color:var(--lx-tinta-3);font-size:13px;padding:16px">Carregando…</div>';
    try { const us = await get(`/clientes/${loja.id}/usuarios`); render(us); }
    catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro')); }
  }
  function render(us) {
    lista.innerHTML = '';
    if (!us.length) { lista.append(vazio('Nenhum usuário ainda.')); return; }
    us.forEach(u => {
      const tgl = el('input', { type: 'checkbox', style: 'width:30px;height:17px;cursor:pointer;accent-color:var(--lx-ok)' });
      tgl.checked = !!u.ativo;
      tgl.onchange = async () => { try { await put(`/clientes/${loja.id}/usuarios/${u.id}`, { ativo: tgl.checked }); toast(tgl.checked ? 'Ativado' : 'Desativado'); } catch (e) { toast(e.message || 'Erro', 'erro'); tgl.checked = !tgl.checked; } };
      lista.append(el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px' },
        el('div', { style: 'min-width:0' },
          el('div', { style: 'font-weight:700;font-size:14px' }, u.nome),
          el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, u.email || '—')),
        el('div', { style: 'display:flex;align-items:center;gap:10px' },
          tgl,
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:12px', onClick: () => formUsuario(u) }, 'Editar'),
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px;color:var(--lx-erro)', onClick: () => confirmar('Excluir usuário', `Excluir “${u.nome}”?`, async () => { await del(`/clientes/${loja.id}/usuarios/${u.id}`); toast('Excluído'); carregar(); }, 'Excluir', true) }, 'Excluir'))));
    });
  }
  function formUsuario(u) {
    const ed = !!u;
    const nome = inp('Nome completo', u?.nome || '');
    const email = inp('E-mail', u?.email || '', 'email'); if (ed) email.disabled = true;
    const tel = inp('Telefone', u?.telefone || '');
    const senha = inp('Senha', '', 'password');
    const campos = [campo('Nome', nome), campo('E-mail', email), campo('Telefone', tel)];
    if (!ed) campos.push(campo('Senha', senha));
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, ed ? 'Salvar' : 'Criar usuário');
    const ov = miniModal(ed ? 'Editar usuário' : 'Novo usuário', el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, ...campos), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => {
      if (!nome.value.trim()) { toast('Informe o nome', 'erro'); return; }
      try { btn.disabled = true;
        if (ed) await put(`/clientes/${loja.id}/usuarios/${u.id}`, { nome: nome.value.trim(), telefone: tel.value.trim() || null });
        else {
          if (!email.value.trim() || !senha.value) { toast('Preencha e-mail e senha', 'erro'); btn.disabled = false; return; }
          await post(`/clientes/${loja.id}/usuarios`, { nome: nome.value.trim(), email: email.value.trim(), telefone: tel.value.trim() || null, senha: senha.value });
        }
        ov.remove(); toast('Salvo'); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  carregar();
  return wrap;
}

// ── Aba 3: Modalidades de frete ───────────────────────────────────
function abaModalidades(loja) {
  const wrap = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const btnAdd = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => formAdd() }, '+ Adicionar modalidade');
  wrap.append(secHead('Modalidades de frete do cliente', 'Defina quais categorias o cliente pode solicitar. “Só exclusivos” faz a corrida ir apenas para motoboys atribuídos ao cliente.', btnAdd), lista);

  async function carregar() {
    lista.innerHTML = '<div style="color:var(--lx-tinta-3);font-size:13px;padding:16px">Carregando…</div>';
    try { const ms = await get(`/clientes/${loja.id}/modalidades`); render(ms); }
    catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro')); }
  }
  function render(ms) {
    lista.innerHTML = '';
    if (!ms.length) { lista.append(vazio('Nenhuma modalidade vinculada. Adicione uma para o cliente poder solicitar.')); return; }
    ms.forEach(m => {
      const tglEx = el('input', { type: 'checkbox', style: 'width:15px;height:15px;cursor:pointer;accent-color:var(--lx-azul-primario)' });
      tglEx.checked = !!m.so_exclusivos;
      tglEx.onchange = async () => { try { await put(`/clientes/${loja.id}/modalidades/${m.id}`, { soExclusivos: tglEx.checked }); toast('Atualizado'); } catch (e) { toast(e.message || 'Erro', 'erro'); tglEx.checked = !tglEx.checked; } };
      lista.append(el('div', { style: `border:1px solid var(--lx-linha);border-left:4px solid ${m.cor};border-radius:var(--lx-raio);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px` },
        el('div', { style: 'display:flex;align-items:center;gap:9px' },
          el('span', { style: `width:12px;height:12px;border-radius:4px;background:${m.cor}` }),
          el('span', { style: 'font-weight:700;font-size:14px' }, m.nome)),
        el('div', { style: 'display:flex;align-items:center;gap:14px' },
          el('label', { style: 'display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--lx-tinta-2);cursor:pointer' }, tglEx, 'Só motoboys exclusivos'),
          el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px;color:var(--lx-erro)', onClick: () => confirmar('Remover modalidade', `Remover “${m.nome}” deste cliente?`, async () => { await del(`/clientes/${loja.id}/modalidades/${m.id}`); toast('Removida'); carregar(); }, 'Remover', true) }, 'Remover'))));
    });
  }
  async function formAdd() {
    let disp = [];
    try { disp = await get(`/clientes/${loja.id}/modalidades/disponiveis`); } catch { toast('Erro ao carregar categorias', 'erro'); return; }
    const naoVinc = disp.filter(d => !d.vinculada);
    if (!naoVinc.length) { toast('Todas as categorias já estão vinculadas (ou nenhuma foi criada em Configurações)', 'erro'); return; }
    const sel = el('select', { class: 'lx-input' }, ...naoVinc.map(d => el('option', { value: d.id }, d.nome)));
    const exc = el('input', { type: 'checkbox', style: 'width:15px;height:15px;accent-color:var(--lx-azul-primario)' });
    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Adicionar');
    const ov = miniModal('Adicionar modalidade', el('div', { style: 'display:flex;flex-direction:column;gap:14px' },
      campo('Categoria', sel),
      el('label', { style: 'display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer' }, exc, 'Só motoboys exclusivos do cliente')), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => { try { btn.disabled = true; await post(`/clientes/${loja.id}/modalidades`, { categoriaId: sel.value, soExclusivos: exc.checked }); ov.remove(); toast('Modalidade adicionada'); carregar(); } catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; } };
  }
  carregar();
  return wrap;
}

// ── Aba 4: Regras de acionamento ──────────────────────────────────
function abaRegras(loja) {
  const wrap = el('div', {});
  wrap.append(secHead('Regras de acionamento', 'Parâmetros e permissões que controlam como as corridas deste cliente são oferecidas e geridas.'));
  const form = el('div', { style: 'display:flex;flex-direction:column;gap:22px;max-width:560px' });
  wrap.append(form);

  const inpMax = el('input', { class: 'lx-input', type: 'number', min: '1', step: '1' });
  const inpRaio = el('input', { class: 'lx-input', type: 'number', min: '0.5', step: '0.5' });

  // Bloco de números
  const blocoNum = el('div', { style: 'display:flex;flex-direction:column;gap:18px' },
    el('div', { class: 'lx-field' }, el('label', {}, 'Máximo de corridas simultâneas por motoboy'), inpMax,
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px' }, 'Quantas corridas um motoboy pode ter/aceitar ao mesmo tempo.')),
    el('div', { class: 'lx-field' }, el('label', {}, 'Raio de aparição (km)'), inpRaio,
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px' }, 'Distância máxima em que a corrida aparece para um motoboy.')));

  // Toggles de permissão (cada um é um switch sim/não).
  const toggles = {};
  function linhaToggle(chave, titulo, descricao) {
    const sw = el('input', { type: 'checkbox', style: 'width:38px;height:20px;cursor:pointer;accent-color:var(--lx-ok);flex-shrink:0' });
    toggles[chave] = sw;
    return el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio)' },
      el('div', { style: 'min-width:0' },
        el('div', { style: 'font-size:13.5px;font-weight:700' }, titulo),
        descricao ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, descricao) : el('span', {})),
      sw);
  }

  const blocoPerm = el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px' }, 'Permissões do cliente'),
    linhaToggle('pode_cancelar_associada', 'Loja pode cancelar corrida já associada', 'Permite à loja cancelar uma corrida que já foi atribuída a um motoboy.'),
    linhaToggle('pode_alterar_profissional', 'Cliente pode alterar o profissional do serviço', 'Permite trocar o motoboy de uma corrida.'),
    linhaToggle('pode_editar_servico', 'Cliente pode editar o serviço', 'Permite editar endereços e dados da corrida.'),
    linhaToggle('pode_escolher_profissional', 'Cliente pode escolher o profissional', 'Se desligado, o sistema envia para o mais próximo ou o primeiro da fila.'),
    linhaToggle('somente_online', 'Enviar somente para profissionais online', 'A corrida só é oferecida a motoboys que estiverem online.'));

  const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'align-self:flex-start' }, 'Salvar regras');

  // Geofence de marcação: raio livre (on/off) + raio em metros.
  const inpMarcRaio = el('input', { class: 'lx-input', type: 'number', min: '50', step: '50', placeholder: '300' });
  // Modalidades às quais o geofence se aplica (vazio = todas).
  const boxMods = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
  const campoMods = el('div', { class: 'lx-field' },
    el('label', {}, 'Aplicar somente nas modalidades'),
    boxMods,
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px' }, 'Marque as modalidades em que o raio vale. Nenhuma marcada = vale para todas.'));
  function syncMarc() {
    const livre = !!toggles.marcacao_raio_livre?.checked;
    inpMarcRaio.disabled = livre; inpMarcRaio.style.opacity = livre ? '0.5' : '1';
    campoMods.style.opacity = livre ? '0.5' : '1';
    campoMods.style.pointerEvents = livre ? 'none' : 'auto';
  }
  const blocoMarcacao = el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px' }, 'Marcação de pontos (geofence)'),
    linhaToggle('marcacao_raio_livre', 'Raio livre na marcação', 'Se ligado, o motoboy marca a entrega de qualquer lugar. Se desligado, ele só marca dentro do raio abaixo — ou solicita liberação à central.'),
    el('div', { class: 'lx-field' }, el('label', {}, 'Raio de marcação (metros)'), inpMarcRaio,
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px' }, 'Distância máxima até o ponto para o motoboy conseguir marcar. Vale apenas quando o raio livre está desligado.')),
    campoMods);
  toggles.marcacao_raio_livre.addEventListener('change', syncMarc);

  // Renderiza os checkboxes de modalidades; marca os ids ativos.
  const _modsSel = new Set();
  function renderMods(modalidades, idsAtivos) {
    _modsSel.clear(); (idsAtivos || []).forEach(id => _modsSel.add(id));
    boxMods.innerHTML = '';
    if (!modalidades || !modalidades.length) {
      boxMods.append(el('div', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, 'Esta loja não tem modalidades cadastradas.'));
      return;
    }
    modalidades.forEach(m => {
      const cb = el('input', { type: 'checkbox', style: 'width:18px;height:18px;cursor:pointer;accent-color:var(--lx-azul-primario)' });
      cb.checked = _modsSel.has(m.id);
      cb.onchange = () => { if (cb.checked) _modsSel.add(m.id); else _modsSel.delete(m.id); };
      boxMods.append(el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer' },
        cb, el('span', { style: `display:inline-block;width:9px;height:9px;border-radius:50%;background:${m.cor || 'var(--lx-azul-primario)'}` }), el('span', {}, m.nome)));
    });
  }

  form.append(blocoNum, blocoPerm, blocoMarcacao, btn);

  async function carregar() {
    try {
      const r = await get(`/clientes/${loja.id}/regras`);
      inpMax.value = r.max_corridas_motoboy ?? 3;
      inpRaio.value = r.raio_km ?? 5;
      toggles.pode_cancelar_associada.checked = r.pode_cancelar_associada !== false;
      toggles.pode_alterar_profissional.checked = r.pode_alterar_profissional !== false;
      toggles.pode_editar_servico.checked = r.pode_editar_servico !== false;
      toggles.pode_escolher_profissional.checked = r.pode_escolher_profissional !== false;
      toggles.somente_online.checked = r.somente_online !== false;
      toggles.marcacao_raio_livre.checked = r.marcacao_raio_livre !== false;
      inpMarcRaio.value = Math.round((r.marcacao_raio_km ?? 0.3) * 1000);
      // Modalidades da loja + marca as que o geofence usa.
      try {
        const mods = await get(`/clientes/${loja.id}/modalidades`);
        renderMods(mods || [], r.marcacao_modalidade_ids || []);
      } catch { renderMods([], []); }
      syncMarc();
    } catch (e) { toast(e.message || 'Erro', 'erro'); }
  }
  btn.onclick = async () => {
    try {
      btn.disabled = true;
      await put(`/clientes/${loja.id}/regras`, {
        maxCorridas: Number(inpMax.value), raioKm: Number(inpRaio.value),
        pode_cancelar_associada: toggles.pode_cancelar_associada.checked,
        pode_alterar_profissional: toggles.pode_alterar_profissional.checked,
        pode_editar_servico: toggles.pode_editar_servico.checked,
        pode_escolher_profissional: toggles.pode_escolher_profissional.checked,
        somente_online: toggles.somente_online.checked,
        marcacao_raio_livre: toggles.marcacao_raio_livre.checked,
        marcacao_raio_km: Math.max(0.05, (Number(inpMarcRaio.value) || 300) / 1000),
        marcacao_modalidade_ids: [..._modsSel],
      });
      toast('Regras salvas');
    } catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btn.disabled = false; }
  };
  carregar();
  return wrap;
}

// ── Aba 5: Atribuição de motos ────────────────────────────────────
function abaMotos(loja) {
  const wrap = el('div', {});
  const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const btnAtr = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: () => formAtribuir() }, '+ Atribuir motoboy');
  wrap.append(secHead('Atribuição de motos', 'Motoboys exclusivos deste cliente. Escolha a modalidade — eles receberão as corridas dessa modalidade quando estiverem no raio configurado.', btnAtr), lista);

  async function carregar() {
    lista.innerHTML = '<div style="color:var(--lx-tinta-3);font-size:13px;padding:16px">Carregando…</div>';
    try { const ms = await get(`/clientes/${loja.id}/motoboys`); render(ms); }
    catch (e) { lista.innerHTML = ''; lista.append(vazio(e.message || 'Erro')); }
  }
  function render(ms) {
    lista.innerHTML = '';
    if (!ms.length) { lista.append(vazio('Nenhum motoboy atribuído a este cliente.')); return; }
    ms.forEach(m => lista.append(
      el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px' },
        el('div', { style: 'display:flex;align-items:center;gap:10px' },
          el('span', { style: 'font-weight:800;color:var(--lx-azul-primario);font-size:13px' }, '#' + String(m.codigo || 0).padStart(3, '0')),
          el('div', {},
            el('div', { style: 'font-weight:700;font-size:14px' }, m.nome_completo, ' ', m.online ? el('span', { style: 'font-size:11px' }, '🟢') : el('span', { style: 'font-size:11px' }, '⚪')),
            el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' },
              m.modalidade_nome
                ? el('span', { style: `display:inline-flex;align-items:center;gap:5px` }, el('span', { style: `width:9px;height:9px;border-radius:3px;background:${m.modalidade_cor || '#999'}` }), m.modalidade_nome)
                : el('span', {}, 'Todas as modalidades')))),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:12px;color:var(--lx-erro)', onClick: () => confirmar('Remover atribuição', `Remover ${m.nome_completo} deste cliente?`, async () => { await del(`/clientes/${loja.id}/motoboys/${m.id}`); toast('Removido'); carregar(); }, 'Remover', true) }, 'Remover'))));
  }
  async function formAtribuir() {
    let motoboys = [], modalidades = [];
    try { [motoboys, modalidades] = await Promise.all([get(`/clientes/${loja.id}/motoboys/disponiveis`), get(`/clientes/${loja.id}/modalidades`)]); }
    catch { toast('Erro ao carregar dados', 'erro'); return; }
    if (!motoboys.length) { toast('Nenhum motoboy ativo na empresa', 'erro'); return; }

    const buscaMb = el('input', { class: 'lx-input', placeholder: 'Buscar por nº ou nome…' });
    const selMb = el('div', { style: 'max-height:160px;overflow:auto;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:6px;margin-top:6px' });
    let mbEscolhido = null;
    function renderMb() {
      const f = buscaMb.value.toLowerCase().replace('#', '').trim();
      selMb.innerHTML = '';
      const vis = motoboys.filter(m => { const cod = String(m.codigo || '').padStart(3, '0'); return !f || cod.includes(f) || (m.nome_completo || '').toLowerCase().includes(f); });
      vis.slice(0, 30).forEach(m => {
        const row = el('div', { style: `display:flex;align-items:center;gap:8px;padding:7px 9px;cursor:pointer;border-radius:6px;font-size:13px;${mbEscolhido?.id === m.id ? 'background:var(--lx-info-bg)' : ''}`, onClick: () => { mbEscolhido = m; renderMb(); } },
          el('span', { style: 'font-weight:800;color:var(--lx-azul-primario);font-size:12px' }, '#' + String(m.codigo || 0).padStart(3, '0')),
          el('span', {}, m.nome_completo));
        selMb.append(row);
      });
      if (!vis.length) selMb.append(el('div', { style: 'font-size:12px;color:var(--lx-tinta-3);padding:8px' }, 'Nenhum motoboy'));
    }
    buscaMb.addEventListener('input', renderMb); renderMb();

    const selMod = el('select', { class: 'lx-input' }, el('option', { value: '' }, 'Todas as modalidades'), ...modalidades.map(m => el('option', { value: m.id }, m.nome)));

    const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Atribuir');
    const ov = miniModal('Atribuir motoboy ao cliente', el('div', { style: 'display:flex;flex-direction:column;gap:14px' },
      campo('Motoboy', el('div', {}, buscaMb, selMb)),
      campo('Modalidade', selMod)), [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'), btn,
    ]);
    btn.onclick = async () => {
      if (!mbEscolhido) { toast('Escolha um motoboy', 'erro'); return; }
      try { btn.disabled = true; await post(`/clientes/${loja.id}/motoboys`, { motoboyId: mbEscolhido.id, modalidadeId: selMod.value || null }); ov.remove(); toast('Motoboy atribuído'); carregar(); }
      catch (e) { toast(e.message || 'Erro', 'erro'); btn.disabled = false; }
    };
  }
  carregar();
  return wrap;
}

// ── Aba: SLA do cliente (sobrescreve o global) ────────────────────
function abaSlaCliente(loja) {
  const wrap = el('div', {});
  wrap.append(secHead('SLA do cliente', 'Por padrão, este cliente usa o SLA global. Ative um SLA próprio para definir prazos exclusivos — ele sobrescreve o global apenas para este cliente.'));

  // Toggle: usar SLA próprio?
  const sw = el('input', { type: 'checkbox', style: 'width:38px;height:20px;cursor:pointer;accent-color:var(--lx-ok);flex:none' });
  const lblToggle = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);margin-bottom:18px' },
    el('div', {},
      el('div', { style: 'font-size:13.5px;font-weight:700' }, 'SLA próprio deste cliente'),
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, 'Quando desligado, vale o SLA global.')),
    sw);

  const editor = EditorSla();
  const editorWrap = el('div', { style: 'display:none' }, editor);
  const aviso = el('div', { style: 'display:none;font-size:12.5px;color:var(--lx-tinta-2);padding:10px 14px;background:var(--lx-info-bg);border-radius:8px;margin-bottom:16px' });

  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:20px;display:none', onClick: salvar }, 'Salvar SLA do cliente');
  const btnRemover = el('button', { class: 'lx-btn lx-btn-secundario', style: 'margin-top:20px;margin-left:10px;display:none;color:var(--lx-erro)', onClick: remover }, 'Remover SLA próprio');

  wrap.append(lblToggle, aviso, editorWrap, el('div', { style: 'display:flex' }, btnSalvar, btnRemover));

  let _temPropria = false;

  sw.onchange = () => {
    const on = sw.checked;
    editorWrap.style.display = on ? 'block' : 'none';
    btnSalvar.style.display = on ? 'inline-flex' : 'none';
    btnRemover.style.display = (on && _temPropria) ? 'inline-flex' : 'none';
    aviso.style.display = on ? 'none' : 'block';
    if (!on) aviso.textContent = 'Este cliente está usando o SLA global. Ative acima para definir um SLA próprio.';
  };

  async function carregar() {
    try {
      const r = await get(`/config/sla/cliente/${loja.id}`);
      _temPropria = !!r.tem_propria;
      sw.checked = _temPropria;
      // preenche o editor com a config própria (se houver) ou com a global como ponto de partida
      editor.preencher(_temPropria ? r : (r.global || r));
      sw.onchange();
    } catch (e) { toast(e.message || 'Erro ao carregar SLA', 'erro'); }
  }
  async function salvar() {
    const v = editor.obterValor();
    if (!v.faixas.length) { toast('Adicione ao menos uma faixa', 'erro'); return; }
    try { btnSalvar.disabled = true; await put(`/config/sla/cliente/${loja.id}`, v); _temPropria = true; btnRemover.style.display = 'inline-flex'; toast('SLA do cliente salvo'); }
    catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btnSalvar.disabled = false; }
  }
  function remover() {
    confirmar('Remover SLA próprio', 'O cliente voltará a usar o SLA global. Continuar?', async () => {
      await del(`/config/sla/cliente/${loja.id}`);
      _temPropria = false; sw.checked = false; sw.onchange();
      toast('SLA próprio removido — usando o global');
    }, 'Remover', true);
  }
  carregar();
  return wrap;
}

// ── Aba: Tabela de Valores do cliente (sobrescreve a global) ──────
function abaValoresCliente(loja) {
  const wrap = el('div', {});
  wrap.append(secHead('Valores do cliente', 'Por padrão, este cliente usa a tabela de valores global. Ative uma tabela própria para preços exclusivos, ou desligue a cobrança para não cobrar do cliente nem pagar ao motoboy.'));

  // Toggle 1: usar tabela própria?
  const swPropria = el('input', { type: 'checkbox', style: 'width:38px;height:20px;cursor:pointer;accent-color:var(--lx-ok);flex:none' });
  const lblPropria = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);margin-bottom:12px' },
    el('div', {},
      el('div', { style: 'font-size:13.5px;font-weight:700' }, 'Tabela de valores própria'),
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, 'Quando desligado, vale a tabela global.')),
    swPropria);

  // Toggle 2: cobrança/pagamento ativos?
  const swCobranca = el('input', { type: 'checkbox', style: 'width:38px;height:20px;cursor:pointer;accent-color:var(--lx-ok);flex:none' });
  const lblCobranca = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid var(--lx-linha);border-radius:var(--lx-raio);margin-bottom:18px' },
    el('div', {},
      el('div', { style: 'font-size:13.5px;font-weight:700' }, 'Cobrança e pagamento ativos'),
      el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, 'Se desligado, as corridas deste cliente saem com valor zero — sem cobrar do cliente nem pagar ao motoboy.')),
    swCobranca);

  const editor = EditorValores();
  const editorWrap = el('div', { style: 'display:none' }, editor);
  const aviso = el('div', { style: 'display:none;font-size:12.5px;color:var(--lx-tinta-2);padding:10px 14px;background:var(--lx-info-bg);border-radius:8px;margin-bottom:16px' });

  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', style: 'margin-top:20px;display:none', onClick: salvar }, 'Salvar valores do cliente');
  const btnRemover = el('button', { class: 'lx-btn lx-btn-secundario', style: 'margin-top:20px;margin-left:10px;display:none;color:var(--lx-erro)', onClick: remover }, 'Remover tabela própria');

  wrap.append(lblPropria, lblCobranca, aviso, editorWrap, el('div', { style: 'display:flex' }, btnSalvar, btnRemover));

  let _temPropria = false;

  function aplicarEstado() {
    const propria = swPropria.checked;
    const cobra = swCobranca.checked;
    // Editor só faz sentido com tabela própria E cobrança ativa.
    editorWrap.style.display = (propria && cobra) ? 'block' : 'none';
    editor.setHabilitado(cobra);
    // Salvar aparece se há QUALQUER desvio do padrão (tabela própria OU cobrança
    // desligada). Antes só aparecia com tabela própria, então desligar a cobrança
    // sem tabela própria não tinha como ser salvo.
    btnSalvar.style.display = (propria || !cobra) ? 'inline-flex' : 'none';
    btnRemover.style.display = (propria && _temPropria) ? 'inline-flex' : 'none';
    if (!propria) {
      aviso.style.display = 'block';
      aviso.textContent = 'Este cliente está usando a tabela de valores global. Ative acima para definir preços próprios.';
    } else if (!cobra) {
      aviso.style.display = 'block';
      aviso.textContent = 'Cobrança desligada: as corridas deste cliente sairão com valor zero (sem cobrança nem pagamento).';
    } else {
      aviso.style.display = 'none';
    }
  }
  swPropria.onchange = aplicarEstado;
  swCobranca.onchange = aplicarEstado;

  async function carregar() {
    try {
      const r = await get(`/config/valores/cliente/${loja.id}`);
      _temPropria = !!r.tem_propria;
      // "Tabela própria" só liga visualmente se houver faixas próprias E cobrança
      // ativa. Quando a cobrança está desligada, o registro do cliente existe só
      // para guardar esse desligamento — não é uma tabela própria de fato.
      const temFaixasProprias = _temPropria && r.cobranca_ativa !== false && Array.isArray(r.faixas) && r.faixas.length > 0;
      swPropria.checked = temFaixasProprias;
      swCobranca.checked = r.cobranca_ativa !== false;
      editor.preencher(temFaixasProprias ? r.faixas : (r.global ? r.global.faixas : r.faixas));
      aplicarEstado();
    } catch (e) { toast(e.message || 'Erro ao carregar valores', 'erro'); }
  }
  async function salvar() {
    const propria = swPropria.checked;
    const cobra = swCobranca.checked;
    // Sem tabela própria, não enviamos faixas (vazio) — só o estado de cobrança.
    const faixas = propria ? editor.obterValor() : [];
    if (propria && cobra && !faixas.length) { toast('Adicione ao menos uma faixa ou desligue a cobrança', 'erro'); return; }
    try {
      btnSalvar.disabled = true;
      await put(`/config/valores/cliente/${loja.id}`, { faixas, cobranca_ativa: cobra });
      _temPropria = true; btnRemover.style.display = (propria) ? 'inline-flex' : 'none';
      toast(cobra ? 'Valores do cliente salvos' : 'Cobrança desligada para este cliente');
    } catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btnSalvar.disabled = false; }
  }
  function remover() {
    confirmar('Remover tabela própria', 'O cliente voltará a usar a tabela de valores global. Continuar?', async () => {
      await del(`/config/valores/cliente/${loja.id}`);
      _temPropria = false; swPropria.checked = false; swCobranca.checked = true; aplicarEstado();
      toast('Tabela própria removida — usando a global');
    }, 'Remover', true);
  }
  carregar();
  return wrap;
}
