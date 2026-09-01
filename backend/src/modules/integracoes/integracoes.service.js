const crypto = require('crypto');
const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const M = require('./integracoes.mapeador');

// Operações que a API pública expõe hoje (o painel mostra os tokens de cada uma).
const OPS = ['gravar', 'status', 'cancelar', 'calcular'];

// ── Helpers de credencial ────────────────────────────────────────────────────
function hexAleatorio(bytes = 16) { return crypto.randomBytes(bytes).toString('hex'); }
function sha256(txt) { return crypto.createHash('sha256').update(String(txt)).digest('hex'); }
function comparaSegura(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Do token recebido (<base>-<op>) separa o segredo-base e o sufixo de operação.
function separarToken(token) {
  const t = M.s(token);
  const m = t.match(/^(.*)-([a-z]+)$/i);
  if (m && OPS.includes(m[2].toLowerCase())) return { base: m[1], op: m[2].toLowerCase() };
  return { base: t, op: null };
}

// ── Gestão de chaves (painel) ────────────────────────────────────────────────
async function listarChaves(empresaId) {
  const { rows } = await query(
    `SELECT c.id, c.nome, c.loja_id, l.nome_fantasia AS loja_nome, c.cod_cliente,
            c.token_prefixo, c.ativa, c.ops_permitidas, c.url_notificacao,
            c.criado_em, c.ultimo_uso_em, c.revogada_em
       FROM integracoes_chaves c
       LEFT JOIN lojas l ON l.id = c.loja_id
      WHERE c.empresa_id = $1
      ORDER BY c.criado_em DESC`,
    [empresaId]
  );
  return rows;
}

// Cria a chave e DEVOLVE o segredo-base UMA ÚNICA VEZ (para montar os tokens no
// painel: <base>-gravar, <base>-status, ...). Depois só fica o hash no banco.
async function criarChave({ empresaId, dados = {}, usuarioId }) {
  const nome = M.s(dados.nome);
  if (!nome) throw AppError.validacao('Informe um nome para a integração');
  const lojaId = dados.loja_id || null;
  if (!lojaId) throw AppError.validacao('Selecione a loja desta integração (o código do cliente pertence à loja)');
  const base = hexAleatorio(16);          // ex.: a6620113fac165e634a298599512ab5e
  const codCliente = hexAleatorio(16);    // ex.: f2201f5191c4e92cc5af043eebfd0946
  const notifSegredo = hexAleatorio(24);
  const ops = Array.isArray(dados.ops_permitidas) && dados.ops_permitidas.length
    ? dados.ops_permitidas.filter((o) => OPS.includes(o))
    : OPS.slice();

  const { rows } = await query(
    `INSERT INTO integracoes_chaves
       (empresa_id, loja_id, nome, cod_cliente, token_hash, token_prefixo,
        ops_permitidas, url_notificacao, notif_segredo, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, cod_cliente`,
    [empresaId, lojaId, nome, codCliente, sha256(base), base.slice(0, 8),
     ops, M.s(dados.url_notificacao) || null, notifSegredo, usuarioId || null]
  );

  // tokens por operação, no formato do contrato externo
  const tokens = {};
  for (const op of ops) tokens[op] = `${base}-${op}`;
  return {
    id: rows[0].id,
    cod_cliente: rows[0].cod_cliente,
    segredo_base: base,       // mostrar uma vez
    tokens,                   // { gravar: 'base-gravar', ... }
    notif_segredo: notifSegredo,
  };
}

async function atualizarChave({ empresaId, id, dados = {} }) {
  const campos = [], vals = [];
  if (dados.nome !== undefined) { vals.push(M.s(dados.nome)); campos.push(`nome = $${vals.length}`); }
  if (dados.loja_id !== undefined) { vals.push(dados.loja_id || null); campos.push(`loja_id = $${vals.length}`); }
  if (dados.url_notificacao !== undefined) { vals.push(M.s(dados.url_notificacao) || null); campos.push(`url_notificacao = $${vals.length}`); }
  if (Array.isArray(dados.ops_permitidas)) {
    vals.push(dados.ops_permitidas.filter((o) => OPS.includes(o)));
    campos.push(`ops_permitidas = $${vals.length}`);
  }
  if (!campos.length) return { ok: true };
  campos.push('atualizado_em = now()');
  vals.push(id); vals.push(empresaId);
  const { rows } = await query(
    `UPDATE integracoes_chaves SET ${campos.join(', ')}
      WHERE id = $${vals.length - 1} AND empresa_id = $${vals.length} RETURNING id`,
    vals
  );
  if (!rows[0]) throw AppError.naoEncontrado('Chave não encontrada');
  return { ok: true };
}

async function alternarAtiva({ empresaId, id, ativa }) {
  const { rows } = await query(
    `UPDATE integracoes_chaves
        SET ativa = $3, revogada_em = CASE WHEN $3 = FALSE THEN now() ELSE NULL END, atualizado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING id, ativa`,
    [id, empresaId, ativa !== false]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Chave não encontrada');
  return rows[0];
}

async function revogarChave({ empresaId, id }) {
  const { rows } = await query(
    `DELETE FROM integracoes_chaves WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresaId]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Chave não encontrada');
  return { ok: true };
}

// Gera um novo segredo-base (invalida os tokens antigos). Devolve os novos.
async function regenerarToken({ empresaId, id }) {
  const base = hexAleatorio(16);
  const { rows } = await query(
    `UPDATE integracoes_chaves
        SET token_hash = $3, token_prefixo = $4, atualizado_em = now()
      WHERE id = $1 AND empresa_id = $2 RETURNING cod_cliente, ops_permitidas`,
    [id, empresaId, sha256(base), base.slice(0, 8)]
  );
  if (!rows[0]) throw AppError.naoEncontrado('Chave não encontrada');
  const tokens = {};
  for (const op of rows[0].ops_permitidas) tokens[op] = `${base}-${op}`;
  return { cod_cliente: rows[0].cod_cliente, segredo_base: base, tokens };
}

// ── Autenticação da API pública ──────────────────────────────────────────────
// Valida cod_cliente + token para uma operação. Devolve o escopo resolvido.
async function resolverCredencial({ codCliente, token, operacao }) {
  const cod = M.s(codCliente);
  if (!cod) throw AppError.naoAutorizado('Código do cliente não informado');
  const { rows } = await query(
    `SELECT id, empresa_id, loja_id, token_hash, ativa, ops_permitidas, url_notificacao
       FROM integracoes_chaves WHERE cod_cliente = $1`,
    [cod]
  );
  const c = rows[0];
  if (!c) throw AppError.naoAutorizado('Código do cliente não confere');
  if (!c.ativa) throw AppError.naoAutorizado('Integração deste cliente foi desativada pelo admin do sistema');

  const { base, op } = separarToken(token);
  if (!base) throw AppError.naoAutorizado('Token não informado');
  if (op && op !== operacao) throw AppError.naoAutorizado('Token não corresponde a esta operação');
  if (!comparaSegura(sha256(base), c.token_hash)) throw AppError.naoAutorizado('Token inválido');
  if (!c.ops_permitidas.includes(operacao)) throw AppError.proibido('Operação não permitida para esta chave');

  // marca uso (fire-and-forget)
  query(`UPDATE integracoes_chaves SET ultimo_uso_em = now() WHERE id = $1`, [c.id]).catch(() => {});
  return { chaveId: c.id, empresaId: c.empresa_id, lojaId: c.loja_id };
}

async function logarRequisicao(d) {
  try {
    await query(
      `INSERT INTO integracoes_requisicoes
         (empresa_id, chave_id, operacao, os, entrega_id, referencia_externa, status_http, erro, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [d.empresaId || null, d.chaveId || null, d.operacao, d.os || null, d.entregaId || null,
       d.referenciaExterna || null, d.statusHttp || null, d.erro || null, d.ip || null]
    );
  } catch (e) { /* log não bloqueia */ }
}

// Base pública de rastreio RESOLVIDA POR TENANT (nunca global). Cada corrida gera
// o link no domínio do próprio cliente, replicável para todos sem exceção:
//   1) domínio próprio (empresa_branding.dominio) -> https://dominio-do-cliente
//   2) subdomínio (empresa_branding.subdominio)    -> https://slug.<DOMINIO_BASE>
//   3) sem nada configurado -> vazio (melhor vazio do que apontar errado)
async function baseRastreioDaEmpresa(empresaId) {
  if (!empresaId) return '';
  try {
    const { rows } = await query(
      `SELECT dominio, subdominio FROM empresa_branding WHERE empresa_id = $1`, [empresaId]);
    const b = rows[0];
    if (b && b.dominio) return 'https://' + M.s(b.dominio).replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (b && b.subdominio) return `https://${M.s(b.subdominio)}.${process.env.DOMINIO_BASE || 'logix.com.br'}`;
  } catch (e) { /* segue sem URL */ }
  return ''; // sem domínio configurado no tenant: link vazio (nada de env global)
}

function montarUrlRastreio(base, token) {
  const b = M.s(base).replace(/\/$/, '');
  if (!b || !token) return '';
  return `${b}/rastreio.html?t=${token}`;
}

// ── Centros de custo da loja ─────────────────────────────────────────────────
// Resolve o centro informado (por código OU nome) para o id, escopado à loja.
// Retorna null quando nada foi informado; lança erro se o valor não bater.
async function resolverCentroCusto(lojaId, valor) {
  const v = M.s(valor);
  if (!v || !lojaId) return null;
  const { rows } = await query(
    `SELECT id FROM cliente_centros_custo
      WHERE loja_id = $1 AND ativo IS NOT FALSE AND (codigo ILIKE $2 OR nome ILIKE $2)
      ORDER BY (codigo ILIKE $2) DESC LIMIT 1`,
    [lojaId, v]
  );
  if (!rows[0]) throw AppError.validacao('Centro de custo não encontrado para esta loja.');
  return rows[0].id;
}

// Lista os centros de custo ativos disponíveis para a loja da credencial.
async function listarCentros({ credencial }) {
  if (!credencial.lojaId) return { Sucesso: [] };
  const { rows } = await query(
    `SELECT codigo, nome FROM cliente_centros_custo
      WHERE loja_id = $1 AND ativo IS NOT FALSE ORDER BY nome`,
    [credencial.lojaId]
  );
  return { Sucesso: rows.map((r) => ({ codigo: r.codigo || '', nome: r.nome })) };
}

// ── Categorias (modalidades da loja) ─────────────────────────────────────────
// Resolve a categoria informada (nome) para a modalidade da loja (id usado na
// entrega). Retorna null quando nada foi informado; lança erro se não bater.
async function resolverModalidade(lojaId, valor) {
  const v = M.s(valor);
  if (!v || !lojaId) return null;
  const { rows } = await query(
    `SELECT cm.id
       FROM cliente_modalidades cm
       JOIN frete_categorias c ON c.id = cm.categoria_id
      WHERE cm.loja_id = $1 AND cm.ativo IS NOT FALSE AND c.nome ILIKE $2
      ORDER BY c.nome LIMIT 1`,
    [lojaId, v]
  );
  if (!rows[0]) throw AppError.validacao('Categoria não encontrada para esta loja.');
  return rows[0].id;
}

// Lista as categorias disponíveis para a loja da credencial.
async function listarCategorias({ credencial }) {
  if (!credencial.lojaId) return { Sucesso: [] };
  const { rows } = await query(
    `SELECT c.nome
       FROM cliente_modalidades cm
       JOIN frete_categorias c ON c.id = cm.categoria_id
      WHERE cm.loja_id = $1 AND cm.ativo IS NOT FALSE ORDER BY c.nome`,
    [credencial.lojaId]
  );
  return { Sucesso: rows.map((r) => ({ nome: r.nome })) };
}

// Lista os profissionais vinculados à loja (código numérico + nome).
async function listarProfissionais({ credencial }) {
  if (!credencial.lojaId) return { Sucesso: [] };
  const { rows } = await query(
    `SELECT DISTINCT m.codigo, m.nome_completo AS nome
       FROM cliente_motoboys cm
       JOIN motoboys m ON m.id = cm.motoboy_id
      WHERE cm.loja_id = $1 AND m.status = 'ativo'
      ORDER BY m.codigo`,
    [credencial.lojaId]
  );
  return { Sucesso: rows.map((r) => ({ codigoProf: r.codigo, nome: r.nome })) };
}

// ── GRAVAR SERVIÇO (criar corrida) ───────────────────────────────────────────
async function gravarServico({ credencial, body, ip }) {
  const pontos = Array.isArray(body.pontos) ? body.pontos : [];
  if (pontos.length < 2) throw AppError.validacao('Favor, informar 2 ou mais pontos!');
  if (pontos.length > 80) throw AppError.validacao('Limite de endereços excedido. Favor informar um número igual ou menor que 80 pontos.');

  // ordenar: "false"/"N" mantém a ordem original; caso contrário otimiza (padrão Logix).
  const ordenarOff = ['false', 'n', 'nao', 'não', '0'].includes(M.s(body.ordenar).toLowerCase());
  const ordenarOn = M.ehSim(body.ordenar) || (!ordenarOff && M.s(body.ordenar) === '');
  if (M.ehSim(body.ordenar) && pontos.length > 20) {
    throw AppError.validacao('Limite de endereços excedido para ordenação, favor informar um número igual ou menor que 20 pontos.');
  }

  const referenciaExterna = M.s(body.numeroPedido) || null;

  // Idempotência: mesmo numeroPedido + mesma chave já gravado -> devolve o existente.
  if (referenciaExterna) {
    const { rows: ja } = await query(
      `SELECT entrega_id FROM integracoes_requisicoes
        WHERE chave_id = $1 AND operacao = 'gravar' AND referencia_externa = $2 AND entrega_id IS NOT NULL
        ORDER BY criado_em DESC LIMIT 1`,
      [credencial.chaveId, referenciaExterna]
    );
    if (ja[0]) {
      const resp = await montarRespostaGravar(ja[0].entrega_id);
      if (resp) return resp;
    }
  }

  const coleta = M.pontoParaLogix(pontos[0]);
  if (!coleta.endereco && !(coleta.lat && coleta.lng)) throw AppError.validacao('Endereço do ponto 1 obrigatório!');
  const destinos = pontos.slice(1).map((p, i) => {
    const d = M.pontoParaLogix(p);
    if (!d.endereco && !(d.lat && d.lng)) throw AppError.validacao(`Endereço do ponto ${i + 2} obrigatório!`);
    return d;
  });

  const rastreioToken = hexAleatorio(12);
  const centroCustoId = await resolverCentroCusto(credencial.lojaId, body.centroCusto || body.centro_custo);
  const modalidadeId = await resolverModalidade(credencial.lojaId, body.categoria);

  // Direcionamento a um profissional específico (codigoProf): respeita a permissão
  // da loja (pode_escolher_profissional) e o vínculo do motoboy com a loja. A
  // atribuição em si (mais abaixo) ainda valida exclusividade, limite e online.
  const codigoProf = M.s(body.codigoProf || body.codigoProfissional);
  let motoboyAlvo = null, avisoProf = null;
  if (codigoProf) {
    const clienteHub = require('../clientehub/clientehub.service');
    const podeEscolher = credencial.lojaId ? await clienteHub.lojaPode(credencial.lojaId, 'pode_escolher_profissional') : true;
    if (!podeEscolher) {
      avisoProf = { profissionalNaoAlocado: true, codigoProfInformado: codigoProf,
        mensagem: 'Esta loja não tem permissão para escolher o profissional. A corrida foi criada sem profissional definido.' };
    } else {
      const { rows: mb } = await query(
        `SELECT m.id FROM motoboys m
          WHERE m.empresa_id = $1 AND m.codigo = $2
            AND EXISTS (SELECT 1 FROM cliente_motoboys cmx WHERE cmx.loja_id = $3 AND cmx.motoboy_id = m.id)
          LIMIT 1`,
        [credencial.empresaId, Number(codigoProf) || -1, credencial.lojaId]
      );
      if (!mb[0]) {
        avisoProf = { profissionalNaoAlocado: true, codigoProfInformado: codigoProf,
          mensagem: 'Profissional não encontrado ou não vinculado a esta loja. A corrida foi criada sem profissional definido.' };
      } else {
        motoboyAlvo = mb[0].id;
      }
    }
  }

  const entregasService = require('../entregas/entregas.service');
  const entrega = await entregasService.criarEntrega({
    empresaId: credencial.empresaId,
    lojaId: credencial.lojaId,
    criadoPor: null,
    coleta, destinos,
    distribuicao: 'automatica',
    centroCustoId,
    modalidadeId,
    // Se vamos direcionar a um motoboy específico, não dispara oferta automática
    // antes; tentamos a atribuição direta logo abaixo.
    naoDispararAutomatico: M.ehSim(body.semProfissional) || !!motoboyAlvo,
    naoOtimizar: !ordenarOn,
    referenciaExterna,
    origem: 'integracao',
    integracaoChaveId: credencial.chaveId,
    rastreioToken,
    ip,
  });

  // Atribuição direta ao profissional escolhido (valida exclusividade, limite de
  // corridas e disponibilidade). Se não der, a corrida fica criada sem profissional
  // e o motivo volta na resposta (não bloqueia o lançamento).
  if (motoboyAlvo) {
    const filasService = require('../filas/filas.service');
    try {
      await filasService.atribuir({ empresaId: credencial.empresaId, entregaId: entrega.id, motoboyId: motoboyAlvo, usuarioId: null, ip });
    } catch (e) {
      avisoProf = { profissionalNaoAlocado: true, codigoProfInformado: codigoProf,
        mensagem: (e.message || 'Não foi possível alocar o profissional') + ' A corrida foi criada sem profissional definido.' };
      // Fallback: se não pediu semProfissional, oferta automaticamente para não ficar parada.
      if (!M.ehSim(body.semProfissional)) {
        try { await filasService.dispararOferta({ empresaId: credencial.empresaId, entregaId: entrega.id, usuarioId: null, ip, automatico: true }); } catch (e2) {}
      }
    }
  }

  const resp = await montarRespostaGravar(entrega.id);
  if (resp && avisoProf) Object.assign(resp.detalhes, avisoProf);
  return resp;
}

async function montarRespostaGravar(entregaId) {
  const { rows } = await query(
    `SELECT empresa_id, protocolo, distancia_km, tempo_estimado_min, valor_cliente_cent, rastreio_token
       FROM entregas WHERE id = $1`, [entregaId]);
  const e = rows[0];
  if (!e) return null;
  const base = await baseRastreioDaEmpresa(e.empresa_id);
  return {
    Sucesso: e.protocolo,
    detalhes: {
      distancia: e.distancia_km != null ? Number(e.distancia_km) : 0,
      duracao: M.formatarDuracao(e.tempo_estimado_min),
      valor: M.centavosParaValor(e.valor_cliente_cent),
      obs: '',
      urlRastreamento: montarUrlRastreio(base, e.rastreio_token),
    },
    _entregaId: entregaId,
  };
}

// ── STATUS SERVIÇO ───────────────────────────────────────────────────────────
async function statusServico({ credencial, body }) {
  const escopo = 'e.empresa_id = $1 AND ($2::uuid IS NULL OR e.loja_id = $2)';
  const baseParams = [credencial.empresaId, credencial.lojaId];

  const servicoUnico = M.s(body.servico);
  const servicos = Array.isArray(body.servicos) ? body.servicos.map((x) => M.s(x)).filter(Boolean) : [];
  const numeroNota = M.s(body.numeroNota);

  if (servicoUnico) {
    const ent = await buscarEntregaPorOS(servicoUnico, escopo, baseParams);
    if (!ent) throw AppError.naoEncontrado('Serviço não encontrado.');
    return { Sucesso: await montarStatusEntrega(ent) };
  }

  // lista por servicos[] ou por numeroNota (limite 50)
  let where = escopo, params = baseParams.slice();
  if (servicos.length) {
    params.push(servicos);
    where += ` AND (e.protocolo = ANY($${params.length}) OR replace(e.protocolo,'LX-','') = ANY($${params.length}))`;
  } else if (numeroNota) {
    params.push(numeroNota);
    where += ` AND (e.referencia_externa = $${params.length}
                    OR EXISTS (SELECT 1 FROM entregas_pontos ep WHERE ep.entrega_id = e.id AND ep.numero_nf = $${params.length}))`;
  } else {
    throw AppError.validacao('Código do serviço não informado.');
  }
  const { rows } = await query(
    `SELECT e.id FROM entregas e WHERE ${where} ORDER BY e.criado_em DESC LIMIT 50`, params);
  const out = {};
  for (const r of rows) {
    const ent = await carregarEntrega(r.id);
    if (ent) out[ent.protocolo] = await montarStatusEntrega(ent);
  }
  if (!Object.keys(out).length) throw AppError.naoEncontrado('Serviço não encontrado.');
  return { Sucesso: out };
}

async function buscarEntregaPorOS(os, escopo, baseParams) {
  const params = baseParams.slice();
  params.push(os);
  const { rows } = await query(
    `SELECT e.id FROM entregas e
      WHERE ${escopo} AND (e.protocolo = $${params.length} OR replace(e.protocolo,'LX-','') = $${params.length})
      LIMIT 1`, params);
  if (!rows[0]) return null;
  return carregarEntrega(rows[0].id);
}

async function carregarEntrega(id) {
  const { rows } = await query(
    `SELECT e.*, m.nome_completo AS motoboy_nome, m.telefone_principal AS motoboy_telefone
       FROM entregas e LEFT JOIN motoboys m ON m.id = e.motoboy_id WHERE e.id = $1`, [id]);
  if (!rows[0]) return null;
  const { rows: pontos } = await query(
    `SELECT * FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`, [id]);
  return { ...rows[0], pontos };
}

async function montarStatusEntrega(ent) {
  const pontos = (ent.pontos || []).map((p) => ({
    ponto: String(p.ordem),
    IDponto: String(p.id),
    obs: p.observacoes || '',
    numeroNota: p.numero_nf || '',
    statusPonto: {
      chegada: p.chegou_em ? fmtData(p.chegou_em) : '',
      saida: p.finalizado_em ? fmtData(p.finalizado_em) : (p.entregue_em ? fmtData(p.entregue_em) : ''),
      ocorrencia: p.status === 'entregue' ? 'Sucesso' : (p.status === 'insucesso' ? 'Erro' : ''),
      motivo: p.ocorrencia_nome || '',
      protocoloAssinatura: [],
      assinatura: [],
      protocolo: [],
      linkRastreamento: '',
    },
    coordernadasPonto: { la: p.lat != null ? String(p.lat) : '', lo: p.lng != null ? String(p.lng) : '' },
    codigo: '', codigoCompleto: '', descricao: '', codigoFinalizarEnd: '',
  }));

  const base = ent.rastreio_token ? await baseRastreioDaEmpresa(ent.empresa_id) : '';
  return {
    status: M.statusParaSigla(ent.status, ent.motoboy_id),
    urlRastreamento: montarUrlRastreio(base, ent.rastreio_token),
    pontos,
    dadosProfissional: ent.motoboy_id
      ? { nome: ent.motoboy_nome || '', cpf: '', placa: '' }
      : { nome: '', cpf: '', placa: '' },
    valorServico: ent.valor_cliente_cent != null ? Number((ent.valor_cliente_cent / 100).toFixed(2)) : 0,
    valorProfissional: ent.valor_motoboy_cent != null ? Number((ent.valor_motoboy_cent / 100).toFixed(2)) : 0,
  };
}

// ── CANCELAR SERVIÇO ─────────────────────────────────────────────────────────
async function cancelarServico({ credencial, body, ip }) {
  const os = M.s(body.OS) || M.s(body.os);
  if (!os) throw AppError.validacao('Código do serviço não informado.');
  const { rows } = await query(
    `SELECT id, status, motoboy_id FROM entregas
      WHERE empresa_id = $1 AND ($2::uuid IS NULL OR loja_id = $2)
        AND (protocolo = $3 OR replace(protocolo,'LX-','') = $3) LIMIT 1`,
    [credencial.empresaId, credencial.lojaId, os]
  );
  const e = rows[0];
  if (!e) throw AppError.naoEncontrado('Serviço não encontrado.');
  if (e.status === 'cancelada') return { Sucesso: 'Cancelado' };  // idempotente
  if (e.status === 'entregue') return { Erro: 'Alocado' };        // já finalizada

  // Mesma regra do painel do cliente: se a corrida JÁ está associada (tem motoboy
  // ou saiu da fila), o cancelamento depende da permissão configurada para a loja
  // (pode_cancelar_associada). Corrida ainda na fila pode ser cancelada livremente.
  const associada = !!e.motoboy_id || e.status !== 'aguardando_atribuicao';
  if (associada && credencial.lojaId) {
    const clienteHub = require('../clientehub/clientehub.service');
    const permitido = await clienteHub.lojaPode(credencial.lojaId, 'pode_cancelar_associada');
    if (!permitido) return { Erro: 'Alocado' }; // cliente não pode cancelar corrida já associada
  }

  const entregasService = require('../entregas/entregas.service');
  await entregasService.cancelarEntrega({
    empresaId: credencial.empresaId, id: e.id,
    motivo: M.s(body.descricaoMotivo) || 'Cancelado via integração',
    usuarioId: null, ip,
  });
  return { Sucesso: 'Cancelado', _entregaId: e.id };
}

// ── CALCULAR SERVIÇO (prévia de preço) ───────────────────────────────────────
async function calcularServico({ credencial, body }) {
  const pontos = Array.isArray(body.pontos) ? body.pontos : [];
  if (pontos.length < 2) throw AppError.validacao('Favor, informar 2 ou mais pontos!');
  const coleta = M.pontoParaLogix(pontos[0]);
  const destinos = pontos.slice(1).map(M.pontoParaLogix);

  const { geocodificar, otimizarRota } = require('../../integracoes/openrouteservice');
  async function comCoord(p) {
    if (p.lat && p.lng) return p;
    try { return { ...p, ...(await geocodificar(p.endereco)) }; } catch { return p; }
  }
  const cGeo = await comCoord(coleta);
  const dGeo = [];
  for (const d of destinos) dGeo.push(await comCoord(d));

  let distanciaKm = null, duracaoMin = null;
  try {
    const r = await otimizarRota({ coleta: cGeo, pontos: dGeo });
    distanciaKm = r.distanciaKm; duracaoMin = r.duracaoMin;
  } catch { /* segue sem otimização */ }

  const configService = require('../config/config.service');
  const preco = await configService.precificar({
    empresaId: credencial.empresaId, lojaId: credencial.lojaId, km: distanciaKm,
  });
  return {
    Sucesso: {
      distancia: distanciaKm != null ? Number(distanciaKm) : 0,
      duracao: M.formatarDuracao(duracaoMin),
      valor: M.centavosParaValor(preco.valor_cliente_cent),
    },
  };
}

// ── RASTREIO PÚBLICO (página do cliente) ─────────────────────────────────────
// Só dados não sensíveis. O token é o segredo (não expõe telefone/CPF).
async function rastreioPublico(token) {
  const tk = M.s(token);
  if (!tk) throw AppError.validacao('Token de rastreio ausente');
  const { rows } = await query(
    `SELECT e.id, e.protocolo, e.status, e.criado_em, e.concluida_em, e.iniciada_em, e.chegada_coleta_em,
            e.coleta_nome, e.coleta_endereco, e.coleta_lat, e.coleta_lng,
            e.distancia_km, e.tempo_estimado_min, e.motoboy_id,
            m.nome_completo AS motoboy_nome, m.foto_url AS motoboy_foto, m.telefone_principal AS motoboy_telefone,
            l.nome_fantasia AS loja_nome,
            b.nome_exibicao, b.logo_url, b.cor_primaria
       FROM entregas e
       LEFT JOIN motoboys m ON m.id = e.motoboy_id
       LEFT JOIN lojas l ON l.id = e.loja_id
       LEFT JOIN empresa_branding b ON b.empresa_id = e.empresa_id
      WHERE e.rastreio_token = $1 LIMIT 1`,
    [tk]
  );
  const e = rows[0];
  if (!e) throw AppError.naoEncontrado('Rastreio não encontrado');

  const { rows: pontos } = await query(
    `SELECT ordem, nome_fantasia, endereco, lat, lng, status, eh_retorno, chegou_em, finalizado_em, entregue_em
       FROM entregas_pontos WHERE entrega_id = $1 ORDER BY ordem`, [e.id]);

  let posicao = null;
  if (e.motoboy_id && ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status)) {
    const { rows: pos } = await query(
      `SELECT lat, lng, capturado_em FROM rastreamento
        WHERE motoboy_id = $1 ORDER BY capturado_em DESC LIMIT 1`, [e.motoboy_id]);
    if (pos[0]) posicao = { lat: Number(pos[0].lat), lng: Number(pos[0].lng), em: pos[0].capturado_em };
  }

  const { rows: tj } = await query(`SELECT lat, lng FROM rastreamento WHERE entrega_id = $1 ORDER BY capturado_em ASC`, [e.id]);
  const trajeto = tj.map(function (p) { return { lat: Number(p.lat), lng: Number(p.lng) }; });
  let fotoUrl = e.motoboy_foto || null;
  if (e.motoboy_id) {
    try {
      const storage = require('../../shared/storage');
      const { rows: doc } = await query(`SELECT storage_key FROM motoboy_documentos WHERE tipo='selfie' AND motoboy_id=$1 LIMIT 1`, [e.motoboy_id]);
      if (doc[0] && doc[0].storage_key) fotoUrl = await storage.urlDe(doc[0].storage_key).catch(function () { return null; });
    } catch (e2) {}
  }

  return {
    protocolo: e.protocolo,
    status: e.status,
    status_sigla: M.statusParaSigla(e.status, e.motoboy_id),
    criado_em: e.criado_em,
    chegada_coleta_em: e.chegada_coleta_em,
    iniciada_em: e.iniciada_em,
    concluida_em: e.concluida_em,
    distancia_km: e.distancia_km != null ? Number(e.distancia_km) : null,
    loja: e.loja_nome || null,
    marca: { nome: e.nome_exibicao || null, logo: e.logo_url || null, cor: e.cor_primaria || null },
    motoboy: e.motoboy_id ? { nome: e.motoboy_nome || null, foto: fotoUrl, telefone: e.motoboy_telefone || null } : null,
    coleta: { nome: e.coleta_nome, endereco: e.coleta_endereco, lat: e.coleta_lat, lng: e.coleta_lng },
    posicao_atual: posicao,
    pontos: pontos.map((p) => ({
      ordem: p.ordem, nome: p.nome_fantasia, endereco: p.endereco,
      lat: p.lat, lng: p.lng, status: p.status, eh_retorno: p.eh_retorno,
      chegou_em: p.chegou_em, finalizado_em: p.finalizado_em || p.entregue_em,
    })),
    trajeto: trajeto,
    google_key: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
  };
}

// data -> "YYYY-MM-DD HH:MM:SS" no fuso da Bahia (servidor roda em UTC).
function fmtData(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    const s = dt.toLocaleString('sv-SE', { timeZone: 'America/Bahia' }); // "2024-07-31 14:23:37"
    return s;
  } catch { return ''; }
}

module.exports = {
  OPS,
  listarChaves, criarChave, atualizarChave, alternarAtiva, revogarChave, regenerarToken,
  resolverCredencial, logarRequisicao,
  gravarServico, statusServico, cancelarServico, calcularServico,
  listarCentros, listarCategorias, listarProfissionais, rastreioPublico,
  baseRastreioDaEmpresa, montarUrlRastreio,
};
