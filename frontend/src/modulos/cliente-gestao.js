import { el } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';

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
  wrap.append(secHead('Regras de acionamento', 'Parâmetros que controlam como as corridas deste cliente são oferecidas aos motoboys.'));
  const form = el('div', { style: 'display:flex;flex-direction:column;gap:18px;max-width:420px' });
  wrap.append(form);

  const inpMax = el('input', { class: 'lx-input', type: 'number', min: '1', step: '1' });
  const inpRaio = el('input', { class: 'lx-input', type: 'number', min: '0.5', step: '0.5' });
  const btn = el('button', { class: 'lx-btn lx-btn-primario', style: 'align-self:flex-start' }, 'Salvar regras');

  form.append(
    el('div', { class: 'lx-field' }, el('label', {}, 'Máximo de corridas simultâneas por motoboy'), inpMax,
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px' }, 'Quantas corridas um motoboy pode ter/aceitar ao mesmo tempo.')),
    el('div', { class: 'lx-field' }, el('label', {}, 'Raio de aparição (km)'), inpRaio,
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:4px' }, 'Distância máxima em que a corrida aparece para um motoboy.')),
    btn);

  async function carregar() {
    try { const r = await get(`/clientes/${loja.id}/regras`); inpMax.value = r.max_corridas_motoboy ?? 3; inpRaio.value = r.raio_km ?? 5; }
    catch (e) { toast(e.message || 'Erro', 'erro'); }
  }
  btn.onclick = async () => {
    try { btn.disabled = true; await put(`/clientes/${loja.id}/regras`, { maxCorridas: Number(inpMax.value), raioKm: Number(inpRaio.value) }); toast('Regras salvas'); }
    catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btn.disabled = false; }
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
