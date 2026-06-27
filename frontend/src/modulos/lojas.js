import { casca } from '../core/layout.js';
import { el, icones, secHeader, estadoVazio, campo } from '../core/ui.js';
import { get, post, put, patch, del } from '../core/api.js';
import * as auth from '../core/auth.js';
import { abrirGestaoCliente } from './cliente-gestao.js';

function toast(msg, tipo) {
  const t = el('div', { style: `position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;background:${tipo==='erro'?'var(--lx-erro-bg)':'var(--lx-ok-bg)'};color:${tipo==='erro'?'var(--lx-erro)':'var(--lx-ok)'};box-shadow:var(--lx-sombra-lg)` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function modal(titulo, corpo, acoes) {
  const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.45);display:flex;align-items:center;justify-content:center;z-index:1000' });
  const box = el('div', { style: 'background:var(--lx-superficie);border-radius:var(--lx-raio-lg);padding:28px;width:520px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(4,44,83,.4)' },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px' },
      el('b', { style: 'font-size:16px;font-weight:800;color:var(--lx-tinta)' }, titulo),
      el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px', onClick: () => overlay.remove() }, '✕')),
    corpo,
    el('div', { style: 'display:flex;gap:10px;margin-top:20px;justify-content:flex-end' }, ...acoes));
  overlay.append(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
}

function input(ph, val = '', tipo = 'text') {
  return el('input', { class: 'lx-input', type: tipo, placeholder: ph, value: val || '' });
}

export async function montar(container) {
  // Só a central (super_admin / central_admin) gerencia lojas.
  const a = auth.acessoAtual();
  const ehCentral = a.perfil === 'super_admin' || a.perfil === 'central_admin';
  if (!ehCentral) {
    container.append(casca('Lojas', estadoVazio('clientes', 'Acesso restrito', 'Apenas a administração da central gerencia lojas.')));
    return;
  }

  let _lojas = [];
  const tabBody = el('div', { style: 'padding:6px 8px' });
  const resumo = el('span', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-left:auto' }, '');

  function linhaLoja(l) {
    // Toggle de status — desativar invalida os usuários do cliente.
    const tgl = el('label', { style: 'display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none' });
    const chk = el('input', { type: 'checkbox', style: 'width:34px;height:18px;cursor:pointer;accent-color:var(--lx-ok)' });
    chk.checked = !!l.ativo;
    chk.onchange = async () => {
      const novo = chk.checked;
      try {
        await patch(`/clientes/${l.id}/status`, { ativo: novo });
        l.ativo = novo;
        txtStatus.textContent = novo ? 'Ativa' : 'Inativa';
        txtStatus.style.color = novo ? 'var(--lx-ok)' : 'var(--lx-erro)';
        toast(novo ? 'Cliente ativado' : 'Cliente desativado — usuários invalidados');
      } catch (e) { toast(e.message || 'Erro', 'erro'); chk.checked = !novo; }
    };
    const txtStatus = el('span', { style: `font-size:12px;font-weight:700;color:${l.ativo ? 'var(--lx-ok)' : 'var(--lx-erro)'}` }, l.ativo ? 'Ativa' : 'Inativa');
    tgl.append(chk, txtStatus);

    return el('div', { class: 'lx-row', style: 'display:grid;grid-template-columns:1fr 110px 100px 96px 280px;gap:12px;align-items:center;padding:12px;border-bottom:1px solid var(--lx-linha)' },
      el('div', {},
        el('div', { style: 'font-weight:700;color:var(--lx-tinta)' }, l.nome_fantasia),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, l.cidade ? `${l.cidade}${l.estado ? '/' + l.estado : ''}` : (l.razao_social || '—'))),
      el('div', { style: 'font-size:13px;color:var(--lx-tinta-2)' }, `${l.total_entregas ?? 0} entregas`),
      el('div', { style: 'font-size:13px;color:var(--lx-tinta-2)' }, `${l.total_enderecos ?? 0} endereços`),
      tgl,
      el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px;font-size:12px', onClick: () => abrirEnderecos(l) }, 'Endereços'),
        el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:6px 10px;font-size:12px', onClick: () => abrirForm(l) }, 'Editar'),
        el('button', { class: 'lx-btn lx-btn-primario', style: 'padding:6px 12px;font-size:12px', onClick: () => abrirGestao(l) }, 'Gerir cliente')));
  }

  function render() {
    tabBody.innerHTML = '';
    resumo.textContent = `${_lojas.length} loja(s)`;
    if (!_lojas.length) {
      tabBody.append(estadoVazio('clientes', 'Nenhuma loja ainda', 'Cadastre a primeira loja-cliente da sua central.'));
      return;
    }
    tabBody.append(
      el('div', { style: 'display:grid;grid-template-columns:1fr 110px 100px 96px 280px;gap:12px;padding:10px 12px;font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;border-bottom:2px solid var(--lx-linha)' },
        el('div', {}, 'Loja'), el('div', {}, 'Entregas'), el('div', {}, 'Endereços'), el('div', {}, 'Status'), el('div', {})),
      ..._lojas.map(linhaLoja));
  }

  async function carregar() {
    try { _lojas = await get('/lojas'); render(); }
    catch (e) { toast(e.message || 'Erro ao carregar lojas', 'erro'); }
  }

  // Painel de gestão do cliente (centro de custo, usuários, modalidades, regras, motos).
  function abrirGestao(loja) {
    abrirGestaoCliente(loja, () => carregar());
  }

  // ── Formulário criar/editar loja ────────────────────────────────
  function abrirForm(loja) {
    const ed = !!loja;
    const fNome = input('Nome fantasia *', loja?.nome_fantasia);
    const fRazao = input('Razão social', loja?.razao_social);
    const fCnpj = input('CNPJ', loja?.cnpj);
    // Endereço
    const fCep = input('CEP', loja?.cep);
    const fLogradouro = input('Logradouro', loja?.logradouro);
    const fNumero = input('Número', loja?.numero);
    const fComplemento = input('Complemento', loja?.complemento);
    const fBairro = input('Bairro', loja?.bairro);
    const fCidade = input('Cidade', loja?.cidade);
    const fEstado = input('UF', loja?.estado);
    // Acesso
    const fResp = input('Responsável', loja?.responsavel);
    const fEmail = input('E-mail de acesso', loja?.email, 'email');
    const fTel = input('Telefone', loja?.telefone);
    const fSenha = input('Senha de acesso' + (ed ? ' (deixe em branco p/ manter)' : ' *'), '', 'password');

    // Busca de CEP: ao completar 8 dígitos, preenche o endereço automaticamente.
    const cepMsg = el('span', { style: 'font-size:11px;color:var(--lx-tinta-3);margin-left:8px' });
    let _ultimoCep = '';
    async function buscarCep() {
      const cep = (fCep.value || '').replace(/\D/g, '');
      if (cep.length !== 8 || cep === _ultimoCep) return;
      _ultimoCep = cep;
      cepMsg.textContent = 'Buscando…'; cepMsg.style.color = 'var(--lx-tinta-3)';
      try {
        const r = await get('/entregas/cep/' + cep);
        if (r.logradouro && !fLogradouro.value) fLogradouro.value = r.logradouro;
        if (r.bairro && !fBairro.value) fBairro.value = r.bairro;
        if (r.cidade) fCidade.value = r.cidade;
        if (r.uf) fEstado.value = r.uf;
        cepMsg.textContent = '✓ endereço preenchido'; cepMsg.style.color = 'var(--lx-ok)';
        if (fNumero) setTimeout(() => fNumero.focus(), 60);
      } catch {
        cepMsg.textContent = 'CEP não encontrado'; cepMsg.style.color = 'var(--lx-erro)';
      }
    }
    fCep.addEventListener('blur', buscarCep);
    fCep.addEventListener('input', () => { if ((fCep.value || '').replace(/\D/g, '').length === 8) buscarCep(); });

    const labelCep = el('label', {}, 'CEP', cepMsg);

    const corpo = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      campo('Nome fantasia', fNome),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, campo('Razão social', fRazao), campo('CNPJ', fCnpj)),
      // Endereço
      el('div', { style: 'border-top:1px solid var(--lx-linha);padding-top:12px;margin-top:2px' },
        el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:10px' }, 'Endereço'),
        el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
          el('div', { style: 'display:grid;grid-template-columns:1fr 2fr;gap:10px' },
            el('div', { class: 'lx-field' }, labelCep, fCep),
            campo('Logradouro', fLogradouro)),
          el('div', { style: 'display:grid;grid-template-columns:1fr 2fr;gap:10px' }, campo('Número', fNumero), campo('Complemento', fComplemento)),
          el('div', { style: 'display:grid;grid-template-columns:2fr 2fr 1fr;gap:10px' }, campo('Bairro', fBairro), campo('Cidade', fCidade), campo('UF', fEstado)))),
      // Acesso
      el('div', { style: 'border-top:1px solid var(--lx-linha);padding-top:12px;margin-top:2px' },
        el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;margin-bottom:10px' }, 'Acesso'),
        el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
          campo('Responsável', fResp),
          el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, campo('E-mail de acesso', fEmail), campo('Telefone', fTel)),
          campo('Senha de acesso', fSenha),
          el('p', { style: 'font-size:12px;color:var(--lx-tinta-2);margin:0' }, 'E-mail + senha criam o login da loja (a loja vê só as próprias entregas).'))));

    const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario' }, ed ? 'Salvar' : 'Criar loja');
    const ov = modal(ed ? 'Editar loja' : 'Nova loja', corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Cancelar'),
      btnSalvar,
    ]);

    btnSalvar.onclick = async () => {
      const dados = {
        nome_fantasia: fNome.value.trim(), razao_social: fRazao.value.trim() || null,
        cnpj: fCnpj.value.trim() || null,
        cep: fCep.value.trim() || null, logradouro: fLogradouro.value.trim() || null,
        numero: fNumero.value.trim() || null, complemento: fComplemento.value.trim() || null,
        bairro: fBairro.value.trim() || null, cidade: fCidade.value.trim() || null,
        estado: fEstado.value.trim().toUpperCase() || null, responsavel: fResp.value.trim() || null,
        email: fEmail.value.trim() || null, telefone: fTel.value.trim() || null,
      };
      if (fSenha.value) dados.senha = fSenha.value;
      if (!dados.nome_fantasia) return toast('Nome fantasia é obrigatório', 'erro');
      try {
        btnSalvar.disabled = true;
        if (ed) await put('/lojas/' + loja.id, dados);
        else await post('/lojas', dados);
        ov.remove(); toast(ed ? 'Loja atualizada' : 'Loja criada'); carregar();
      } catch (e) { toast(e.message || 'Erro ao salvar', 'erro'); btnSalvar.disabled = false; }
    };
  }

  // ── Endereços de coleta da loja ─────────────────────────────────
  async function abrirEnderecos(loja) {
    const lista = el('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px' }, 'Carregando…');

    async function recarregar() {
      try {
        const ends = await get('/lojas/' + loja.id + '/enderecos');
        lista.innerHTML = '';
        if (!ends.length) { lista.append(el('p', { style: 'color:var(--lx-tinta-2);font-size:13px' }, 'Nenhum endereço cadastrado.')); return; }
        ends.forEach(e => {
          lista.append(el('div', { style: 'display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--lx-linha);border-radius:10px' },
            el('div', { style: 'flex:1' },
              el('div', { style: 'font-weight:700;font-size:13px' }, e.apelido, e.is_coleta_padrao ? el('span', { class: 'lx-badge', style: 'margin-left:8px;background:var(--lx-ok-bg);color:var(--lx-ok)' }, 'padrão') : ''),
              el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, e.endereco_completo)),
            el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 9px;font-size:12px', onClick: async () => {
              if (!confirm('Remover este endereço?')) return;
              try { await del(`/lojas/${loja.id}/enderecos/${e.id}`); toast('Endereço removido'); recarregar(); }
              catch (err) { toast(err.message || 'Erro', 'erro'); }
            } }, '🗑')));
        });
      } catch (e) { lista.innerHTML = ''; lista.append(el('p', { style: 'color:var(--lx-erro)' }, 'Erro ao carregar.')); }
    }

    const fApelido = input('Apelido (ex: Matriz)');
    const fEnd = input('Endereço completo');
    const fPadrao = el('input', { type: 'checkbox' });
    const novoBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--lx-linha);padding-top:14px' },
      el('b', { style: 'font-size:13px' }, 'Adicionar endereço'),
      fApelido, fEnd,
      el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--lx-tinta-2)' }, fPadrao, 'Coleta padrão'));
    const btnAdd = el('button', { class: 'lx-btn lx-btn-primario', style: 'align-self:flex-start' }, 'Adicionar');
    novoBox.append(btnAdd);

    btnAdd.onclick = async () => {
      if (!fApelido.value.trim() || !fEnd.value.trim()) return toast('Apelido e endereço são obrigatórios', 'erro');
      try {
        btnAdd.disabled = true;
        await post(`/lojas/${loja.id}/enderecos`, { apelido: fApelido.value.trim(), endereco_completo: fEnd.value.trim(), is_coleta_padrao: fPadrao.checked });
        fApelido.value = ''; fEnd.value = ''; fPadrao.checked = false;
        toast('Endereço adicionado'); recarregar(); carregar();
      } catch (e) { toast(e.message || 'Erro', 'erro'); } finally { btnAdd.disabled = false; }
    };

    const corpo = el('div', {}, lista, novoBox);
    const ov = modal(`Endereços — ${loja.nome_fantasia}`, corpo, [
      el('button', { class: 'lx-btn lx-btn-secundario', onClick: () => ov.remove() }, 'Fechar'),
    ]);
    recarregar();
  }

  const btnNova = el('button', { class: 'lx-btn lx-btn-primario', onClick: () => abrirForm(null) }, '+ Nova loja');
  const conteudo = el('div', {},
    el('div', { class: 'lx-card' },
      el('div', { style: 'display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--lx-linha)' }, btnNova, resumo),
      tabBody));

  container.append(casca('Lojas (Clientes)', conteudo, 'Empresas-cliente da sua central — cada uma com login, endereços de coleta e entregas próprias.'));
  carregar();
}
